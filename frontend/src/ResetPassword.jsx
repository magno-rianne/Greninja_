import { useState } from 'react';
import { supabase } from './supabaseClient';
import { PasswordInput, Paper, Title, Text, Button, Stack, Box, Center, useMantineColorScheme } from '@mantine/core';
import { renderStatusAlert } from './alertUtils';

const GreninjaLogo = ({ size = 130 }) => (
  <img src="/favicon.svg" alt="" width={size} height={size} style={{ flexShrink: 0 }} />
);

/**
 * Shown instead of the main app whenever App.jsx detects a
 * PASSWORD_RECOVERY auth event (i.e. the user arrived via the "reset
 * password" link in their email). Supabase treats that link as a real,
 * valid session -- so without this screen, the user would land directly
 * in the dashboard instead of being asked to actually set a new password.
 *
 * `onComplete` is called after a successful password update, telling
 * App.jsx to drop out of "recovery mode" and treat the session as a
 * normal logged-in session from here on (no separate re-login required).
 */
export default function ResetPassword({ onComplete }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const paperBg = isDark ? 'dark.8' : 'white';

  // Same sidebar-matched palette as Auth.jsx, instead of a generic slate
  // grey unrelated to the rest of the app's theme.
  const inputStyles = {
    label: { fontWeight: 600, color: isDark ? 'var(--mantine-color-gray-4)' : 'var(--mantine-color-dark-8)', marginBottom: '4px' },
    input: { color: 'var(--mantine-color-text)' },
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (password.length < 6) {
      setError('Your new password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccessMsg('Password updated! Taking you to your dashboard...');
    // Brief pause so the person actually sees the confirmation before the
    // screen changes out from under them.
    setTimeout(() => onComplete(), 1200);
  };

  return (
    <Box mih="100vh" bg="greninja.9" display="flex" style={{ alignItems: 'center', justifyContent: 'center' }} px="md" py="xl">
      <Paper withBorder={false} shadow="xl" p={{ base: 30, sm: 55 }} radius="lg" w={{ base: '100%', sm: 540 }} bg={paperBg}>
        <Center mb={0} style={{ position: 'relative', zIndex: 2 }}>
          <GreninjaLogo />
        </Center>

        <Title order={1} ta="center" mt={-15} fw={900} c={isDark ? '#ede8b1' : '#194c81'} style={{ letterSpacing: '-1.5px', position: 'relative', zIndex: 1 }}>
          Greninja
        </Title>

        <Text c="var(--mantine-color-dimmed)" size="sm" ta="center" mt="md" mb={30} lh={1.6}>
          Enter a new password below to finish resetting your account.
        </Text>

        {renderStatusAlert('error', error)}
        {renderStatusAlert('success', successMsg)}

        <form onSubmit={handleSubmit}>
          <Stack size="md">
            <PasswordInput
              label="New Password"
              placeholder="Enter a new password"
              required
              withAsterisk={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              size="md"
              styles={inputStyles}
            />
            <PasswordInput
              label="Confirm New Password"
              placeholder="Type it again"
              required
              withAsterisk={false}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              size="md"
              styles={inputStyles}
            />
          </Stack>

          <Button fullWidth mt="xl" size="md" type="submit" loading={loading} color="greninja" radius="md">
            Save New Password
          </Button>
        </form>
      </Paper>
    </Box>
  );
}