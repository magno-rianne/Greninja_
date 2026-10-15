import { useState } from 'react';
import { supabase } from './supabaseClient'; 
import { TextInput, PasswordInput, Paper, Title, Text, Button, Anchor, Stack, Box, Center, Divider, useMantineColorScheme } from '@mantine/core';
import { renderStatusAlert } from './alertUtils';

const GreninjaLogo = ({ size = 130 }) => (
  <img src="/favicon.svg" alt="" width={size} height={size} style={{ flexShrink: 0 }} />
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.14v3.15C3.19 21.32 7.27 24 12 24z"/>
    <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.6H1.14C.41 8.08 0 9.75 0 12s.41 3.92 1.14 5.4l4.13-3.16z"/>
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.27 0 3.19 2.68 1.14 6.6l4.13 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
  </svg>
);

export default function Auth({ onLoginSuccess }) {
  const [authMode, setAuthMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const paperBg = isDark ? 'dark.8' : 'white';

  // Label/input colors now reference the same palette as the sidebar
  // (dark.8 / gray.4 for text, the brand blue/cream pair for accents)
  // instead of a generic slate grey that didn't tie back to the rest of
  // the app's theme.
  const inputStyles = { 
    label: { fontWeight: 600, color: isDark ? 'var(--mantine-color-gray-4)' : 'var(--mantine-color-dark-8)', marginBottom: '4px' },
    input: { color: 'var(--mantine-color-text)' }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true); 
    setError(null); 
    setSuccessMsg(null);

    // Strict email format validation (ensures text before @, text between @ and ., and domain extension)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      setLoading(false);
      return;
    }

    try {
      if (authMode === 'register') {
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        
        setSuccessMsg("Registration successful! You can now sign in.");
        setAuthMode('login'); 
        setPassword('');
        setConfirmPassword('');
        
      } else if (authMode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin, 
        });
        if (error) throw error;
        
        setSuccessMsg("If an account exists, a password reset link has been sent to your email.");
        setAuthMode('login');
        setPassword('');
        
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (onLoginSuccess) onLoginSuccess(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const configuredSiteUrl = import.meta.env.PROD ? import.meta.env.VITE_PUBLIC_SITE_URL : null;
      const redirectOrigin = configuredSiteUrl || window.location.origin;
      const siteUrl = new URL(redirectOrigin);
      if (import.meta.env.PROD) {
        const hostname = siteUrl.hostname.replace(/^\[|\]$/g, '');
        const isLoopback = hostname === 'localhost'
          || hostname.endsWith('.localhost')
          || hostname === '::1'
          || /^127(?:\.\d{1,3}){3}$/.test(hostname);
        if (siteUrl.protocol !== 'https:' || isLoopback) {
          throw new Error('The production site URL must be a public HTTPS URL, not localhost.');
        }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL('/auth/callback', siteUrl.origin).toString() }
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message || 'Unable to start Google sign-in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box mih="100vh" bg="greninja.9" display="flex" style={{ alignItems: 'center', justifyContent: 'center' }} px="md" py="xl">
      <Paper withBorder={false} shadow="xl" p={{ base: 30, sm: 55 }} radius="lg" w={{ base: '100%', sm: 540 }} bg={paperBg}>
        <Center mb={0} style={{ position: 'relative', zIndex: 2 }}>
          <GreninjaLogo />
        </Center>
        
        {/* Matches the sidebar's exact brand-title colors (App.jsx) so the
            "Greninja" wordmark reads identically whether you're looking at
            the login screen or the app shell. */}
        <Title order={1} ta="center" mt={-15} fw={900} c={isDark ? '#ede8b1' : '#194c81'} style={{ letterSpacing: '-1.5px', position: 'relative', zIndex: 1 }}>
          Greninja
        </Title>
        
        <Text c="var(--mantine-color-dimmed)" size="sm" ta="center" mt="md" mb={30} lh={1.6}>
          {authMode === 'forgot' 
            ? "Enter your email address and we'll send you a secure link to reset your password."
            : "Track your finances easily with a simple e-statement upload. Your statement is processed in memory and never saved."
          }
        </Text>

        {renderStatusAlert('error', error)}
        {renderStatusAlert('success', successMsg)}

        <form onSubmit={handleEmailAuth}>
          <Stack size="md">
            <TextInput 
              label="Email Address" 
              placeholder="hello@example.com" 
              required 
              withAsterisk={false}
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              size="md"
              styles={inputStyles}
            />
            
            {authMode !== 'forgot' && (
              <PasswordInput 
                label="Password" 
                placeholder="Your password" 
                required 
                withAsterisk={false}
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                size="md"
                styles={inputStyles}
              />
            )}

            {authMode === 'register' && (
              <PasswordInput 
                label="Confirm Password" 
                placeholder="Type your password again" 
                required 
                withAsterisk={false}
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                size="md"
                styles={inputStyles}
              />
            )}
          </Stack>

          {authMode === 'login' && (
            <Box style={{ display: 'flex', justifyContent: 'flex-end' }} mt="xs">
              <Anchor size="xs" c="var(--mantine-color-dimmed)" onClick={() => { setAuthMode('forgot'); setError(null); setSuccessMsg(null); }}>
                Forgot your password?
              </Anchor>
            </Box>
          )}

          <Button fullWidth mt={authMode === 'login' ? 'md' : 'xl'} size="md" type="submit" loading={loading} color="greninja" radius="md">
            {authMode === 'register' ? 'Create Account' : authMode === 'forgot' ? 'Send Reset Link' : 'Sign In'}
          </Button>
        </form>

        {authMode !== 'forgot' && (
          <>
            <Divider label="or" labelPosition="center" my="lg" />
            <Button fullWidth variant="default" size="md" radius="md" leftSection={<GoogleIcon />} onClick={handleGoogleLogin} loading={loading}>
              Continue with Google
            </Button>
          </>
        )}

        <Text c="var(--mantine-color-dimmed)" size="sm" ta="center" mt="xl">
          {authMode === 'register' ? 'Already have an account? ' : authMode === 'login' ? 'Don’t have an account yet? ' : 'Remember your password? '}
          <Anchor size="sm" component="button" fw={600} c="greninja.6" onClick={() => { 
            setAuthMode(authMode === 'register' || authMode === 'forgot' ? 'login' : 'register'); 
            setError(null); 
            setSuccessMsg(null); 
            setPassword(''); 
            setConfirmPassword(''); 
          }}>
            {authMode === 'register' || authMode === 'forgot' ? 'Log in' : 'Create account'}
          </Anchor>
        </Text>
      </Paper>
    </Box>
  );
}