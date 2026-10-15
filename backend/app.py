import os
import io
import re
import hashlib
import hmac
import threading
import httpx
import pandas as pd
import pdfplumber
from collections import defaultdict
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv

import groq
from groq import Groq

# Load environment variables
load_dotenv()

app = Flask(__name__)
# Only allow your own frontend(s). Set ALLOWED_ORIGINS on Render, e.g.
# ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:5173
allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
CORS(app, origins=allowed_origins)

# Initialize Supabase client
# CRITICAL: SUPABASE_KEY must be the 'service_role' secret to read user emails via Admin API
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

# AI provider: Groq. Set these in Render's Environment tab:
#   GROQ_API_KEY         your key from console.groq.com
#   GROQ_MODEL           a current model ID from Groq's models page
#   GROQ_FALLBACK_MODEL  (optional) a second model to try if the first is busy or retired
groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"), timeout=20.0, max_retries=1)
GROQ_MODEL = os.environ.get("GROQ_MODEL")
GROQ_FALLBACK_MODEL = os.environ.get("GROQ_FALLBACK_MODEL")

# Errors that mean "this model is busy, rate-limited, or gone" -- worth trying the next model.
GROQ_RETRYABLE_ERRORS = (
    groq.RateLimitError,
    groq.InternalServerError,
    groq.APIConnectionError,  # also covers timeouts
    groq.NotFoundError,
)


def generate_text(prompt):
    """Ask Groq, falling back to a second model if the first is busy,
    rate-limited, or retired. Other errors (bad key, bad request) raise at once."""
    models = [m for m in (GROQ_MODEL, GROQ_FALLBACK_MODEL) if m]
    if not models:
        raise RuntimeError("GROQ_MODEL is not set. Add it in Render's Environment tab.")
    last_error = None
    for model in models:
        try:
            response = groq_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content
        except GROQ_RETRYABLE_ERRORS as e:
            last_error = e
    raise last_error


# --- n8n INTEGRATION ---
# Render environment variables:
#   N8N_SECRET              shared secret; n8n sends/expects it in the X-Internal-Secret header
#   N8N_UPLOAD_WEBHOOK_URL  the production webhook URL of the n8n "Upload Alert" workflow (optional)
N8N_SECRET = os.environ.get("N8N_SECRET")
N8N_UPLOAD_WEBHOOK_URL = os.environ.get("N8N_UPLOAD_WEBHOOK_URL")


def notify_n8n_upload(email, records):
    """Tell n8n a statement was just processed. Sends TOTALS ONLY -- never merchant
    names or descriptions. Runs in the background, and any failure is swallowed so
    an n8n outage can never break an upload."""
    if not N8N_UPLOAD_WEBHOOK_URL or not email or not records:
        return
    spending = [r for r in records if r["category"] not in NON_SPENDING_CATEGORIES]
    income = sum(r["amount"] for r in spending if r["amount"] > 0)
    expenses = sum(-r["amount"] for r in spending if r["amount"] < 0)
    by_category = defaultdict(float)
    for r in spending:
        if r["amount"] < 0:
            by_category[r["category"]] += -r["amount"]
    top_category, top_total = max(by_category.items(), key=lambda kv: kv[1], default=(None, 0.0))
    dates = sorted(r["date"] for r in records)
    payload = {
        "email": email,
        "rows": len(records),
        "period_start": dates[0],
        "period_end": dates[-1],
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "net": round(income - expenses, 2),
        "top_category": top_category,
        "top_category_total": round(top_total, 2),
    }

    def _send():
        try:
            httpx.post(N8N_UPLOAD_WEBHOOK_URL, json=payload,
                       headers={"X-Internal-Secret": N8N_SECRET or ""}, timeout=5)
        except Exception as e:
            print(f"n8n notification failed (upload was not affected): {e}")

    threading.Thread(target=_send, daemon=True).start()


# --- AUTH ---
def require_auth(f):
    """Verifies the Supabase access token sent by the frontend and exposes the
    verified user's id as g.user_id. Never trust a user_id sent in the request."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required"}), 401
        token = auth_header.split(" ", 1)[1].strip()
        try:
            user = supabase.auth.get_user(token).user
            if user is None:
                raise ValueError("No user for token")
        except Exception:
            return jsonify({"error": "Invalid or expired session"}), 401
        g.user_id = user.id
        g.user_email = user.email
        return f(*args, **kwargs)
    return wrapper

# --- HELPER FUNCTIONS ---

# Single source of truth for these two category names. categorize_transaction()
# below is what actually produces them -- everywhere else that needs to check
# "is this a self-transfer / load-up transaction" should reference these
# constants instead of retyping the literal string, since a typo'd literal
# (e.g. "Mobile Load/Data" instead of "Load/Data") silently fails to match
# anything and the exclusion just never fires.
CATEGORY_SELF_TRANSFER = "Self Transfer"
CATEGORY_LOAD_DATA = "Load/Data"
NON_SPENDING_CATEGORIES = {CATEGORY_SELF_TRANSFER, CATEGORY_LOAD_DATA}

MONTH_MAP = {"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
             "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12}
DATE_TOKEN_RE = re.compile(r"^\d{1,2}$|^[A-Z]{3}$")
PERIOD_RE = re.compile(
    r"(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s+to\s+(\d{1,2})\s+([A-Z]{3})\s+(\d{4})",
    re.IGNORECASE,
)

def detect_month_year_map(pdf):
    for page in pdf.pages[:1]: 
        text = page.extract_text() or ""
        match = PERIOD_RE.search(text)
        if match:
            _, start_mon, start_year, _, end_mon, end_year = match.groups()
            start_year, end_year = int(start_year), int(end_year)
            start_m, end_m = MONTH_MAP[start_mon.upper()], MONTH_MAP[end_mon.upper()]

            if start_year == end_year:
                return {m: start_year for m in range(1, 13)}

            month_year_map = {m: start_year for m in range(start_m, 13)}
            month_year_map.update({m: end_year for m in range(1, end_m + 1)})
            return month_year_map

    from datetime import date
    return {m: date.today().year for m in range(1, 13)}

def extract_account_holder_name(pdf):
    words = pdf.pages[0].extract_words()
    left_words = [w for w in words if w["x0"] < 300]
    if not left_words:
        return None

    lines = _group_into_lines(left_words)
    for i, (_, line_words) in enumerate(lines):
        line_text = " ".join(w["text"] for w in line_words)
        if line_text.upper().startswith("MARIBANK ACCOUNT:") and i > 0:
            return " ".join(w["text"] for w in lines[i - 1][1])
    return None

def build_self_name_tokens(account_holder_name):
    if not account_holder_name:
        return set()
    tokens = re.findall(r"[A-Za-z]+", account_holder_name.lower())
    if not tokens:
        return set()
    if len(tokens) == 1:
        return {tokens[0]}
    return {tokens[0], tokens[-1]}

def categorize_transaction(description: str, self_name_tokens=None) -> str:
    desc_l = str(description).lower()
    self_name_tokens = self_name_tokens or set()

    if "interest" in desc_l:
        return "Interest"
    if "cashback" in desc_l or "campaign reward" in desc_l or "reward" in desc_l:
        return "Reward"
    if "card fee" in desc_l:
        return "Fees"
    if "load" in desc_l or "top up" in desc_l:
        return CATEGORY_LOAD_DATA
    if "card payment" in desc_l:
        return "Card Payment"
    if "payment" in desc_l:
        return "QR/InstaPay"

    if "transfer" in desc_l:
        desc_tokens = set(re.findall(r"[a-z]+", desc_l))
        if self_name_tokens and self_name_tokens.issubset(desc_tokens):
            return CATEGORY_SELF_TRANSFER
        return "Transfer (Other Party)"

    return "Uncategorized"

def generate_hash(user_id, date, amount, description, occurrence):
    raw_string = f"{user_id}{date}{amount}{description}{occurrence}"
    return hashlib.sha256(raw_string.encode()).hexdigest()

def parse_to_sql_date(raw_date, month_year_map):
    raw_date = str(raw_date).strip().upper()
    if not raw_date:
        return None
    if len(raw_date) == 3 and raw_date in MONTH_MAP:
        month = MONTH_MAP[raw_date]
        return f"{month_year_map[month]}-{month:02d}-01"
    try:
        day, month_str = raw_date.split()
        month = MONTH_MAP[month_str]
        return f"{month_year_map[month]}-{month:02d}-{int(day):02d}"
    except (ValueError, KeyError):
        return None

def to_float(raw_value):
    cleaned = str(raw_value or "").replace(",", "").replace("₱", "").strip()
    if not cleaned:
        return 0.0
    try:
        return float(cleaned)
    except ValueError:
        return 0.0

def _group_into_lines(words, y_tol=2):
    buckets = defaultdict(list)
    for w in words:
        buckets[round(w["top"] / y_tol) * y_tol] = buckets.get(round(w["top"] / y_tol) * y_tol, [])
        buckets[round(w["top"] / y_tol) * y_tol].append(w)
    return [(top, sorted(ws, key=lambda w: w["x0"])) for top, ws in sorted(buckets.items())]

def _extract_page_transactions(page):
    words = page.extract_words()
    if not words:
        return []

    lines = _group_into_lines(words)
    header_top = None
    date_x = desc_x = out_x = in_x = None
    for top, line_words in lines:
        texts = {w["text"].upper() for w in line_words}
        if "DATE" in texts and "TRANSACTION" in texts and ("OUTGOING" in texts or "INCOMING" in texts):
            header_top = top
            for w in line_words:
                label = w["text"].upper()
                if label == "DATE":
                    date_x = w["x0"]
                elif label == "TRANSACTION":
                    desc_x = w["x0"]
                elif label == "OUTGOING":
                    out_x = w["x0"]
                elif label == "INCOMING":
                    in_x = w["x0"]
            break

    if header_top is None or None in (date_x, desc_x, out_x, in_x):
        return [] 

    date_desc_boundary = (date_x + desc_x) / 2
    desc_out_boundary = (desc_x + out_x) / 2
    out_in_boundary = (out_x + in_x) / 2

    records = []
    pending_name_lines = []
    subtext_lines = []
    current = None
    expect_subtext_next = False

    for top, line_words in lines:
        if top <= header_top:
            continue

        joined_upper = " ".join(w["text"] for w in line_words).upper()
        if "TAX DETAILS" in joined_upper or ("PREVIOUS" in joined_upper and "BALANCE" in joined_upper):
            break 

        date_words, desc_words, out_words, in_words = [], [], [], []
        for w in line_words:
            x0 = w["x0"]
            if x0 < date_desc_boundary:
                date_words.append(w["text"])
            elif x0 < desc_out_boundary:
                desc_words.append(w["text"])
            elif x0 < out_in_boundary:
                out_words.append(w["text"])
            else:
                in_words.append(w["text"])

        date_text = " ".join(date_words).strip()
        desc_text = " ".join(desc_words).strip()
        out_text = " ".join(out_words).strip()
        in_text = " ".join(in_words).strip()

        is_anchor = bool(date_text) and all(DATE_TOKEN_RE.match(tok) for tok in date_text.split())

        if is_anchor:
            if current is not None:
                current["description"] = f"{current['name']} {' '.join(subtext_lines)}".strip()
                records.append(current)
            current = {
                "date": date_text,
                "name": " ".join(pending_name_lines).strip(),
                "outgoing": to_float(out_text),
                "incoming": to_float(in_text),
            }
            pending_name_lines = []
            subtext_lines = []
            expect_subtext_next = True
        elif desc_text:
            if expect_subtext_next:
                subtext_lines.append(desc_text)
                expect_subtext_next = False
            else:
                pending_name_lines.append(desc_text)

    if current is not None:
        current["description"] = f"{current['name']} {' '.join(subtext_lines)}".strip()
        records.append(current)

    return records

def extract_transactions_from_pdf(pdf_buffer, password=""):
    extracted_data = []
    with pdfplumber.open(pdf_buffer, password=password) as pdf:
        month_year_map = detect_month_year_map(pdf)
        account_holder_name = extract_account_holder_name(pdf)
        for page in pdf.pages:
            extracted_data.extend(_extract_page_transactions(page))
    return extracted_data, month_year_map, account_holder_name


# --- API ROUTES ---
def process_statement(user_id, user_email, file_bytes, password=""):
    """Parse a MariBank e-statement PDF and save its transactions for one user.
    Shared by the in-app upload and the automatic (n8n) upload.
    Returns (response_dict, http_status)."""
    pdf_buffer = io.BytesIO(file_bytes)

    try:
        extracted_data, month_year_map, account_holder_name = extract_transactions_from_pdf(pdf_buffer, password=password)

        if not extracted_data:
            return {"error": "Could not extract transaction data."}, 400

        self_name_tokens = build_self_name_tokens(account_holder_name)

        df = pd.DataFrame(extracted_data)
        df['category'] = df['description'].apply(lambda d: categorize_transaction(d, self_name_tokens))
        df['amount'] = (df['incoming'] - df['outgoing']).round(2)
        df['date'] = df['date'].apply(lambda d: parse_to_sql_date(d, month_year_map))
        df = df.dropna(subset=['date'])

        df['occurrence'] = df.groupby(['date', 'description', 'amount']).cumcount()

        records_to_insert = []
        for _, row in df.iterrows():
            txn_hash = generate_hash(user_id, row['date'], row['amount'], row['description'], row['occurrence'])

            records_to_insert.append({
                "user_id": user_id,
                "date": row['date'],
                "description": str(row['description']),
                "category": str(row['category']),
                "amount": float(row['amount']),
                "outgoing": float(row['outgoing']),
                "incoming": float(row['incoming']),
                "transaction_hash": txn_hash
            })

        if records_to_insert:
            (
                supabase.table("transactions")
                .upsert(records_to_insert, on_conflict="transaction_hash")
                .execute()
            )
            notify_n8n_upload(user_email, records_to_insert)
            return {"message": f"Successfully processed and categorized {len(records_to_insert)} rows!"}, 200
        else:
            return {"error": "No valid transaction rows found to insert."}, 400

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@app.route('/api/upload', methods=['POST'])
@require_auth
def upload_statement():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    password = request.form.get('password', '')
    # user comes from the verified access token, never from the form
    body, status = process_statement(g.user_id, g.user_email, file.read(), password)
    return jsonify(body), status


@app.route('/api/delete-account', methods=['POST'])
@require_auth
def delete_account():
    """
    Permanently deletes a user's transaction history and their Supabase
    auth account. This requires the service_role key (already configured
    on `supabase` per the comment at the top of this file) -- the anon/
    public key the frontend uses cannot delete other users' data or call
    the Admin API, which is exactly why this has to happen server-side
    rather than directly from Settings.jsx.
    """
    user_id = g.user_id  # a user can only delete their own account

    try:
        # 1. Delete their transaction rows first. If step 2 (deleting the
        #    auth user) fails partway, we'd rather have orphaned "no user"
        #    data disappear than leave transaction rows behind under a
        #    user_id that no longer exists anywhere.
        supabase.table("transactions").delete().eq("user_id", user_id).execute()

        # 2. Delete the actual auth account.
        supabase.auth.admin.delete_user(user_id)

        return jsonify({"message": "Account and all associated data deleted successfully."}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/chat', methods=['POST'])
@require_auth
def chat_with_assistant():
    """Handles chatbot messages with user's financial context"""
    data = request.json or {}
    user_id = g.user_id  # verified from the access token
    user_message = data.get('message')

    if not user_message:
        return jsonify({"error": "Missing message"}), 400

    try:
        # 1. Fetch the user's recent transactions (e.g., last 30 days) to give the AI context
        today = datetime.today()
        thirty_days_ago = today - timedelta(days=30)
        start_str = thirty_days_ago.strftime("%Y-%m-%d")

        response = supabase.table("transactions").select("*").eq("user_id", user_id).gte("date", start_str).order("date").execute()
        transactions = response.data

        # 2. Summarize the data so the AI knows what is going on
        context_str = "No recent transactions."
        if transactions:
            # Same exclusion as the monthly email: self-transfers and
            # load-ups aren't real income or real spending, just money
            # moving between the user's own wallets.
            income = sum(t['amount'] for t in transactions if t['amount'] > 0 and t['category'] not in NON_SPENDING_CATEGORIES)
            expenses = sum(abs(t['amount']) for t in transactions if t['amount'] < 0 and t['category'] not in NON_SPENDING_CATEGORIES)
            context_str = f"Over the last 30 days, the user had ₱{income:,.2f} in income and ₱{expenses:,.2f} in expenses."
            
            # Add top recent transactions to context
            context_str += "\nRecent transactions:\n"
            for t in transactions[-10:]:  # Just give the 10 most recent to keep it fast
                context_str += f"- {t['date']}: {t['description']} (₱{t['amount']}) [{t['category']}]\n"

        # 3. Build the prompt
        prompt = f"""
        You are Greninja, a helpful, friendly, and expert personal finance AI assistant. 
        You are talking directly to the user. Use the following financial context to answer their question. 
        Be concise, conversational, and do not use markdown headers.
        
        USER'S FINANCIAL CONTEXT:
        {context_str}

        USER'S QUESTION:
        {user_message}
        """

        # 4. Ask the AI
        reply = generate_text(prompt)

        return jsonify({"response": reply}), 200

    except GROQ_RETRYABLE_ERRORS:
        import traceback
        traceback.print_exc()
        return jsonify({"error": "The AI assistant is busy right now. Please try again in a minute."}), 503

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# --- ENDPOINT FOR n8n AUTOMATION ---
@app.route('/api/internal/monthly-summaries', methods=['GET'])
def monthly_summaries_for_automation():
    """Called by the n8n monthly-digest workflow (not by the React app).
    Returns each user's email and monthly TOTALS only -- no merchant names or
    transaction descriptions leave the backend. Protected by a shared secret."""
    provided = request.headers.get("X-Internal-Secret", "")
    if not N8N_SECRET or not hmac.compare_digest(provided, N8N_SECRET):
        return jsonify({"error": "Unauthorized"}), 401

    # ?month=2026-09 is optional; default is the previous calendar month.
    month_param = request.args.get("month")
    try:
        if month_param:
            month_start = datetime.strptime(month_param + "-01", "%Y-%m-%d")
        else:
            month_start = (datetime.today().replace(day=1) - timedelta(days=1)).replace(day=1)
    except ValueError:
        return jsonify({"error": "month must look like 2026-09"}), 400

    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    start_str = month_start.strftime("%Y-%m-%d")
    end_str = (next_month - timedelta(days=1)).strftime("%Y-%m-%d")
    month_name = month_start.strftime("%B %Y")

    try:
        # Supabase returns at most 1000 rows per request, so read in pages.
        rows, offset = [], 0
        while True:
            page = (
                supabase.table("transactions")
                .select("user_id,amount,category,date")
                .gte("date", start_str).lte("date", end_str)
                .range(offset, offset + 999)
                .execute()
            ).data
            rows.extend(page)
            if len(page) < 1000:
                break
            offset += 1000

        by_user = defaultdict(list)
        for t in rows:
            by_user[t["user_id"]].append(t)

        summaries = []
        users_with_data = set()
        for user_id, txns in by_user.items():
            try:
                auth_user = supabase.auth.admin.get_user_by_id(user_id).user
                email = auth_user.email
                name = (auth_user.user_metadata or {}).get("username") or None
            except Exception as e:
                print(f"Could not retrieve email for user {user_id}. Skipping. Error: {e}")
                continue

            income = sum(t["amount"] for t in txns if t["amount"] > 0 and t["category"] not in NON_SPENDING_CATEGORIES)
            expenses = sum(abs(t["amount"]) for t in txns if t["amount"] < 0 and t["category"] not in NON_SPENDING_CATEGORIES)

            category_totals = defaultdict(float)
            for t in txns:
                if t["amount"] < 0 and t["category"] not in NON_SPENDING_CATEGORIES:
                    category_totals[t["category"]] += abs(t["amount"])
            top_categories = sorted(category_totals.items(), key=lambda kv: kv[1], reverse=True)[:10]

            users_with_data.add(user_id)
            summaries.append({
                "email": email,
                "name": name,
                "month": month_name,
                "has_data": True,
                "latest_date": max(t["date"] for t in txns),
                "income": round(income, 2),
                "expenses": round(expenses, 2),
                "net": round(income - expenses, 2),
                "top_categories": [{"category": c, "total": round(v, 2)} for c, v in top_categories],
            })

        # ?include_inactive=true adds everyone with NO transactions this month (used for the
        # upload reminder). Each gets has_data=false and the date their latest data ends (if any).
        if request.args.get("include_inactive", "").lower() == "true":
            last_data_date, offset = {}, 0
            while True:
                page = (
                    supabase.table("transactions").select("user_id,date")
                    .range(offset, offset + 999).execute()
                ).data
                for t in page:
                    if t["date"] > last_data_date.get(t["user_id"], ""):
                        last_data_date[t["user_id"]] = t["date"]
                if len(page) < 1000:
                    break
                offset += 1000

            page_no = 1
            while True:
                batch = supabase.auth.admin.list_users(page=page_no, per_page=200)
                for u in batch:
                    if u.id in users_with_data or not u.email:
                        continue
                    summaries.append({
                        "email": u.email,
                        "name": (u.user_metadata or {}).get("username") or None,
                        "month": month_name,
                        "has_data": False,
                        "last_data_date": last_data_date.get(u.id),
                        "income": 0, "expenses": 0, "net": 0, "top_categories": [],
                    })
                if len(batch) < 200:
                    break
                page_no += 1

        # ?email=someone@example.com limits the result to one person (used by the demo workflow)
        email_filter = (request.args.get("email") or "").strip().lower()
        if email_filter:
            summaries = [x for x in summaries if x["email"].lower() == email_filter]

        return jsonify({"month": month_name, "count": len(summaries), "summaries": summaries}), 200

    except Exception:
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Could not build summaries"}), 500


# --- AUTOMATIC STATEMENT UPLOAD (called by the n8n "watch a folder" workflow) ---
# Render environment variable:
#   AUTO_UPLOAD_EMAILS   comma-separated emails allowed to receive automatic uploads,
#                        e.g. you@gmail.com   (leave unset to keep this feature OFF)
AUTO_UPLOAD_EMAILS = {e.strip().lower() for e in os.environ.get("AUTO_UPLOAD_EMAILS", "").split(",") if e.strip()}
MAX_AUTO_UPLOAD_BYTES = 15 * 1024 * 1024


def find_user_by_email(email):
    page_no = 1
    while True:
        batch = supabase.auth.admin.list_users(page=page_no, per_page=200)
        for u in batch:
            if (u.email or "").lower() == email:
                return u
        if len(batch) < 200:
            return None
        page_no += 1


@app.route('/api/internal/upload', methods=['POST'])
def automated_upload():
    """Upload a statement on behalf of an allow-listed user. Protected by the shared
    secret AND an email allow-list, so the secret alone can't write to anyone's account."""
    provided = request.headers.get("X-Internal-Secret", "")
    if not N8N_SECRET or not hmac.compare_digest(provided, N8N_SECRET):
        return jsonify({"error": "Unauthorized"}), 401

    email = (request.form.get("email") or "").strip().lower()
    if not email or email not in AUTO_UPLOAD_EMAILS:
        return jsonify({"error": "This email is not enabled for automatic uploads"}), 403

    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file_bytes = request.files['file'].read()
    if len(file_bytes) > MAX_AUTO_UPLOAD_BYTES:
        return jsonify({"error": "File is too large"}), 413
    if b"%PDF" not in file_bytes[:1024]:
        return jsonify({"error": "File is not a PDF"}), 400

    try:
        user = find_user_by_email(email)
    except Exception:
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Could not look up the user"}), 500
    if user is None:
        return jsonify({"error": "No Greninja account found for that email"}), 404

    body, status = process_statement(user.id, user.email, file_bytes, request.form.get('password', ''))
    return jsonify(body), status


if __name__ == '__main__':
    app.run(port=5000, debug=True, use_reloader=False)