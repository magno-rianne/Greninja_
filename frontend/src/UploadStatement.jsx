import { useState } from 'react';
import { PasswordInput, Button, Text, Paper, FileInput, Stack, Title, Box, ScrollArea } from '@mantine/core';
import { IconCloudUpload, IconLock } from '@tabler/icons-react';
import { renderStatusAlert } from './alertUtils';
import { apiFetch } from './api';

// Same fixed page height as Settings.jsx -- see the comment there for why
// this exact calc() value matches AppShell's padding="md".
const PAGE_HEIGHT = 'calc(100vh - 32px)';

export default function UploadStatement() {
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setMessage({ text: 'Please select a PDF statement to upload.', type: 'error' });
      return;
    }
    setLoading(true); setMessage({ text: '', type: '' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);

    try {
      const response = await apiFetch('/api/upload', { method: 'POST', body: formData });
      const result = await response.json();
      if (response.ok) {
        setMessage({ text: result.message, type: 'success' });
        setFile(null); setPassword('');
      } else {
        // formatMessage() is applied inside renderStatusAlert() itself now,
        // so the raw backend error string doesn't need cleaning up twice.
        setMessage({ text: `Upload failed: ${result.error}`, type: 'error' });
      }
    } catch {
      setMessage({ text: 'Could not connect to backend server.', type: 'error' });
    }
    setLoading(false);
  };

  return (
    <Paper withBorder p="xl" radius="md" h={PAGE_HEIGHT} display="flex" style={{ flexDirection: 'column', overflow: 'hidden' }}>
      <div>
        <Title order={3} mb="xs" c="var(--mantine-color-text)">Upload Statement</Title>
        <Text c="var(--mantine-color-dimmed)" size="sm" mb="xl">Import your e-Statement to update your dashboard metrics.</Text>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
        <ScrollArea flex={1} style={{ minHeight: 0 }} type="auto">
          <Box maw={500} w="100%" pb="xl">
            <form onSubmit={handleUpload}>
              <Stack gap="xl">
                <FileInput
                  label={<Text c="var(--mantine-color-text)" size="sm" fw={600} mb={4}>Select PDF Statement</Text>}
                  placeholder="Click to browse file"
                  accept="application/pdf"
                  value={file}
                  onChange={setFile}
                  required
                  withAsterisk={false}
                  size="sm"
                  variant="filled"
                  leftSection={<IconCloudUpload size={16} color="var(--mantine-color-dimmed)" />}
                />

                <PasswordInput
                  label={<Text c="var(--mantine-color-text)" size="sm" fw={600} mb={4}>PDF Password (Optional)</Text>}
                  description="Enter the password if your statement is encrypted."
                  placeholder="Leave blank if none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  size="sm"
                  variant="filled"
                  withAsterisk={false}
                  leftSection={<IconLock size={16} color="var(--mantine-color-dimmed)" />}
                />

                <Button type="submit" loading={loading} color="greninja" size="sm" mt="xs">
                  Upload & Sync
                </Button>

                {/* Right below the button instead of after the description
                    paragraphs -- the previous placement meant a result
                    could sit below the fold on smaller screens, requiring
                    a scroll to even see whether the upload worked. */}
                {renderStatusAlert(message.type, message.text)}
              </Stack>
            </form>

            <Stack gap="sm" mt={30}>
              <Text size="sm" c="var(--mantine-color-dimmed)" lh={1.6}>
                Our system will automatically parse the document, categorize your merchants, and refresh your dashboard with the latest cash flow data.
              </Text>
              <Text size="sm" c="var(--mantine-color-dimmed)" lh={1.6}>
                As of now, it only processes MariBank e-Statements. Other banks' statements are currently in the process of being supported soon.
              </Text>
              <Text size="sm" c="var(--mantine-color-text)" fw={500} lh={1.6} mt={4}>
                You will get an email at the start of each month with your summary and a reminder to upload your next statement.
              </Text>
            </Stack>
          </Box>
        </ScrollArea>
      </div>
    </Paper>
  );
}