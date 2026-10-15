import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Paper, Title, Text, Button, PasswordInput, TextInput, Modal, Group, Avatar, Stack, Box, Anchor, useMantineColorScheme, ScrollArea } from '@mantine/core';
import { IconUser, IconLock, IconShieldCheck } from '@tabler/icons-react';
import { renderStatusAlert } from './alertUtils';
import { apiFetch } from './api';

// The Paper below fills exactly one AppShell "page" of vertical space:
// AppShell has padding="md" (16px) on all sides, so 32px covers the
// top+bottom padding it adds around this component. Matches the same
// pattern used in UploadStatement.jsx, so both pages fill the viewport
// identically instead of one being taller than the other.
const PAGE_HEIGHT = 'calc(100vh - 32px)';

export default function Settings() {
  const [userEmail, setUserEmail] = useState('');

  const [username, setUsername] = useState('');
  const [savedUsername, setSavedUsername] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email);
        // Previously never read here, so the field always started blank
        // even for a user who'd already set a username -- "Change
        // Username" and "Create Username" looked identical on load.
        const existingUsername = user.user_metadata?.username || '';
        setUsername(existingUsername);
        setSavedUsername(existingUsername);
      }
    };
    fetchUser();
  }, []);

  const handleForgotPassword = async () => {
    setError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setMessage("A password reset link has been sent to your email.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStartEditingUsername = () => {
    setError(null);
    setMessage(null);
    setIsEditingUsername(true);
  };

  const handleCancelUsernameEdit = () => {
    setUsername(savedUsername); // discard the draft, revert to last saved value
    setIsEditingUsername(false);
  };

  const handleSaveUsername = async () => {
    setSavingUsername(true);
    setError(null);
    setMessage(null);
    try {
      // This is the actual fix: the previous version only updated local
      // state here and never called Supabase, so a "saved" username was
      // never really saved -- it just looked saved until the next reload.
      const { error } = await supabase.auth.updateUser({ data: { username } });
      if (error) throw error;
      setSavedUsername(username);
      setIsEditingUsername(false);
      setMessage('Username updated successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingUsername(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setSavingPassword(true); setError(null); setMessage(null);

    if (newPassword.length < 6) {
      setError('Your new password must be at least 6 characters long.');
      setSavingPassword(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      setSavingPassword(false);
      return;
    }

    try {
      // Supabase's updateUser() doesn't check the current password on its
      // own -- given any active session, it will happily set a new one.
      // Collecting "Old Password" without actually checking it (the
      // previous version's behavior) is misleading: it implies a security
      // check that never happens. Re-authenticating with it first is what
      // makes that field do something real.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPassword,
      });
      if (reauthError) throw new Error('Your old password is incorrect.');

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setMessage("Password updated successfully.");
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsChangingPassword(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleCancelPasswordEdit = () => {
    setIsChangingPassword(false);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await apiFetch('/api/delete-account', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete account.');

      await supabase.auth.signOut();
      window.location.reload();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  };

  const usernameButtonLabel = isEditingUsername
    ? 'Save Username'
    : savedUsername
      ? 'Change Username'
      : 'Create Username';

  const initials = (savedUsername || userEmail || '?').trim().charAt(0).toUpperCase();

  return (
    <Paper withBorder p="xl" radius="md" h={PAGE_HEIGHT} display="flex" style={{ flexDirection: 'column', overflow: 'hidden' }}>
      <div>
        <Title order={3} mb="xs" c="var(--mantine-color-text)">Account Settings</Title>
        <Text c="var(--mantine-color-dimmed)" size="sm" mb="xl">Manage your security preferences and account details.</Text>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
        <ScrollArea flex={1} style={{ minHeight: 0 }} type="auto">
          <Box maw={500} w="100%" pb="xl">
            <Stack gap={30}>

              <Group wrap="nowrap" gap="md">
                <Avatar color="greninja" radius="xl" size={48} style={{ fontWeight: 600, fontSize: 20 }}>
                  {initials}
                </Avatar>
                <div>
                  {savedUsername ? (
                    <>
                      <Text fw={600} size="lg" c="var(--mantine-color-text)">@{savedUsername}</Text>
                      <Text size="sm" c="var(--mantine-color-dimmed)">{userEmail}</Text>
                    </>
                  ) : (
                    <Text fw={600} size="lg" c="var(--mantine-color-text)">{userEmail || 'Loading...'}</Text>
                  )}
                </div>
              </Group>

              {renderStatusAlert('success', message)}
              {renderStatusAlert('error', error)}

              <Group align="flex-end" gap="sm" wrap="nowrap">
                <TextInput
                  label={<Text c="var(--mantine-color-text)" size="sm" fw={600} mb={4}>Username (Optional)</Text>}
                  placeholder="Enter a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!isEditingUsername}
                  leftSection={<IconUser size={16} color="var(--mantine-color-dimmed)" />}
                  size="sm"
                  variant="filled"
                  flex={1}
                />
                {isEditingUsername ? (
                  <Group gap="xs" wrap="nowrap">
                    <Button variant="filled" color="greninja" size="sm" onClick={handleSaveUsername} loading={savingUsername}>
                      Save
                    </Button>
                    <Button variant="subtle" color="gray" size="sm" onClick={handleCancelUsernameEdit} disabled={savingUsername}>
                      Cancel
                    </Button>
                  </Group>
                ) : (
                  <Button variant="light" color="greninja" size="sm" onClick={handleStartEditingUsername}>
                    {usernameButtonLabel}
                  </Button>
                )}
              </Group>

              <div>
                {!isChangingPassword ? (
                  <Group align="center" justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                      <IconLock size={16} color="var(--mantine-color-dimmed)" />
                      <div>
                        <Text size="sm" fw={600} c="var(--mantine-color-text)">Password</Text>
                        {/* A plain masked label instead of a disabled
                            PasswordInput faking a value -- it isn't a real
                            input, so it shouldn't look like one. */}
                        <Text size="sm" c="var(--mantine-color-dimmed)" style={{ letterSpacing: 2 }}>••••••••</Text>
                      </div>
                    </Group>
                    <Button variant="light" color="greninja" size="sm" onClick={() => { setIsChangingPassword(true); setMessage(null); setError(null); }}>
                      Change Password
                    </Button>
                  </Group>
                ) : (
                  <form onSubmit={handleUpdatePassword}>
                    <Stack gap="sm">
                      <div>
                        <PasswordInput
                          label={<Text c="var(--mantine-color-text)" size="sm" fw={600} mb={4}>Old Password</Text>}
                          value={oldPassword}
                          onChange={(e) => setOldPassword(e.target.value)}
                          leftSection={<IconLock size={16} color="var(--mantine-color-dimmed)" />}
                          size="sm"
                          variant="filled"
                          withAsterisk={false}
                          required
                        />
                        <Anchor size="sm" c="greninja.6" mt={4} component="button" type="button" onClick={handleForgotPassword}>
                          Forgot password?
                        </Anchor>
                      </div>

                      <PasswordInput
                        label={<Text c="var(--mantine-color-text)" size="sm" fw={600} mb={4}>New Password</Text>}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        leftSection={<IconLock size={16} color="var(--mantine-color-dimmed)" />}
                        size="sm"
                        variant="filled"
                        withAsterisk={false}
                        required
                      />

                      <PasswordInput
                        label={<Text c="var(--mantine-color-text)" size="sm" fw={600} mb={4}>Confirm New Password</Text>}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        leftSection={<IconLock size={16} color="var(--mantine-color-dimmed)" />}
                        size="sm"
                        variant="filled"
                        withAsterisk={false}
                        required
                      />

                      <Group gap="sm" mt="xs">
                        <Button type="submit" loading={savingPassword} color="greninja" size="sm">
                          Save Password
                        </Button>
                        <Button variant="subtle" color="gray" size="sm" onClick={handleCancelPasswordEdit} disabled={savingPassword}>
                          Cancel
                        </Button>
                      </Group>
                    </Stack>
                  </form>
                )}
              </div>

              <Box p="md" bg={isDark ? 'rgba(250, 82, 82, 0.08)' : '#fff5f5'} style={{ borderRadius: '8px', border: '1px solid var(--mantine-color-red-2)' }}>
                <Text size="sm" c={isDark ? 'red.3' : 'red.8'} mb="md" lh={1.5}>
                  Permanently delete your account and all transaction history. This action cannot be undone.
                </Text>
                <Button color="red" size="sm" onClick={() => { setDeleteModalOpened(true); setDeleteError(null); }}>
                  Delete Account
                </Button>
              </Box>

              <Group gap="xs" align="flex-start" wrap="nowrap">
                <IconShieldCheck size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
                <Text size="sm" c="var(--mantine-color-dimmed)" lh={1.6}>
                  Uploaded statements are processed in memory and never saved. AI features send your transaction details to Groq’s API to generate answers and monthly summaries. Your bank login credentials are never requested or stored.
                </Text>
              </Group>

            </Stack>
          </Box>
        </ScrollArea>
      </div>

      <Modal opened={deleteModalOpened} onClose={() => !deleting && setDeleteModalOpened(false)} title={<Text fw={600} c="var(--mantine-color-text)">Delete Account</Text>} centered closeOnClickOutside={!deleting} withCloseButton={!deleting}>
        <Text size="sm" mb="md" c="var(--mantine-color-text)">
          Are you sure you want to delete your account? This will permanently erase your transaction history and profile. This action cannot be undone.
        </Text>

        {renderStatusAlert('error', deleteError)}

        <Group justify="flex-end">
          <Button variant="default" onClick={() => setDeleteModalOpened(false)} disabled={deleting}>Cancel</Button>
          <Button color="red" onClick={handleDeleteAccount} loading={deleting}>Yes, Delete Account</Button>
        </Group>
      </Modal>
    </Paper>
  );
}