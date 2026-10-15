import { Alert } from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';

const STATUS_ALERT_CONFIG = {
  error: { icon: IconAlertCircle, color: 'red' },
  success: { icon: IconCheck, color: 'teal' },
};

// Map known Supabase/PostgREST messages before applying generic cleanup.
const KNOWN_MESSAGES = [
  [/already registered/i, 'This email is already registered. Please sign in instead.'],
  [/invalid login credentials/i, 'Incorrect email or password. Please try again.'],
  [/password should be at least/i, 'Your password must be at least 6 characters long.'],
  [/unable to validate email address|invalid email/i, 'Please enter a valid email address.'],
  [/email rate limit exceeded/i, 'Too many requests sent to this email address. Please wait a few minutes and try again.'],
  [/for security purposes.*after/i, 'For security reasons, please wait a moment before trying again.'],
];

/**
 * Turns raw backend/Supabase messages into readable sentences, rewriting
 * known developer-facing errors and cleaning up any other message.
 */
export function formatMessage(message) {
  if (!message) return message;
  const raw = String(message).trim();
  if (!raw) return raw;

  for (const [pattern, replacement] of KNOWN_MESSAGES) {
    if (pattern.test(raw)) return replacement;
  }

  let text = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}

/**
 * Renders a consistently styled status alert.
 */
export function renderStatusAlert(type, message, opts = {}) {
  if (!message) return null;
  const { icon: Icon, color } = STATUS_ALERT_CONFIG[type];
  return (
    <Alert
      icon={<Icon size={18} stroke={1.75} />}
      color={color}
      variant="light"
      radius="md"
      mb={opts.mb || 'md'}
      styles={{
        root: { borderWidth: 1, borderStyle: 'solid' },
        message: { fontSize: 'var(--mantine-font-size-sm)', lineHeight: 1.5 },
      }}
    >
      {formatMessage(message)}
    </Alert>
  );
}
