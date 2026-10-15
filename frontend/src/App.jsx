import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import ResetPassword from './ResetPassword';
import UploadStatement from './UploadStatement';
import TransactionTable from './TransactionTable';
import Settings from './Settings';
import Chatbot from './Chatbot';
import { AppShell, Burger, Group, NavLink, Button, Title, ActionIcon, useMantineColorScheme, Stack, Tooltip, Switch, Text, Modal, Center, Loader } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { renderStatusAlert } from './alertUtils';
import { 
  IconLogout, 
  IconLayoutDashboard, 
  IconListDetails, 
  IconFileUpload, 
  IconRobot, 
  IconSettings,
  IconSun,
  IconMoon
} from '@tabler/icons-react';

const Dashboard = lazy(() => import('./Dashboard.jsx'));

const GreninjaLogo = ({ size = 40, onClick }) => (
  <img
    src="/favicon.svg"
    alt=""
    width={size}
    height={size}
    style={{ flexShrink: 0, cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.2s' }}
    onClick={onClick}
  />
);

function SidebarLink({ label, icon, tabName, activeTab, isDark, desktopCollapsed, onTabChange }) {
  const isActive = activeTab === tabName;
  const inactiveColor = isDark ? 'gray.4' : 'dark.8';
  const contentColor = isActive ? 'white' : inactiveColor;

  if (desktopCollapsed) {
    return (
      <Tooltip label={label} position="right" transitionProps={{ duration: 200 }}>
        <ActionIcon
          variant={isActive ? 'filled' : 'subtle'}
          color={isActive ? '#194c81' : 'gray'}
          c={contentColor}
          onClick={() => onTabChange(tabName)}
          size={44}
          radius="md"
          mx="auto"
          className="greninja-hover-target"
        >
          {icon}
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <NavLink
      label={label}
      leftSection={icon}
      active={isActive}
      onClick={() => onTabChange(tabName)}
      variant="filled"
      color="#194c81"
      c={contentColor}
      className="greninja-hover-target"
      styles={{ root: { borderRadius: '8px' } }}
    />
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isOAuthCallback, setIsOAuthCallback] = useState(() => window.location.pathname === '/auth/callback');
  const [callbackError, setCallbackError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  
  const [logoutModalOpened, setLogoutModalOpened] = useState(false);
  const authEventReceived = useRef(false);
  
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    let mounted = true;
    const handleOAuthCallback = (session) => {
      if (window.location.pathname !== '/auth/callback') return;

      window.history.replaceState(null, '', '/');
      if (session) {
        setCallbackError(null);
        setIsOAuthCallback(false);
      } else {
        setCallbackError('Google sign-in could not be completed. Please try again.');
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      authEventReceived.current = true;
      setSession(session);
      setIsAuthReady(true);
      handleOAuthCallback(session);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted || authEventReceived.current) return;
      setSession(session);
      if (error) handleOAuthCallback(null);
      else handleOAuthCallback(session);
      setIsAuthReady(true);
    }).catch(() => {
      if (!mounted) return;
      handleOAuthCallback(null);
      setIsAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isOAuthCallback || isAuthReady || session) return undefined;

    const timeoutId = window.setTimeout(() => {
      window.history.replaceState(null, '', '/');
      setCallbackError('Google sign-in is taking too long. Please return to sign in and try again.');
      setIsAuthReady(true);
    }, 15000);

    return () => window.clearTimeout(timeoutId);
  }, [isOAuthCallback, isAuthReady, session]);

  if (isPasswordRecovery) {
    return <ResetPassword onComplete={() => setIsPasswordRecovery(false)} />;
  }

  if (isOAuthCallback) {
    return (
      <Center mih="100vh" px="md">
        <Stack align="center" maw={420}>
          {callbackError ? (
            <>
              {renderStatusAlert('error', callbackError)}
              <Button color="greninja" onClick={() => {
                setCallbackError(null);
                setIsOAuthCallback(false);
              }}>
                Return to sign in
              </Button>
            </>
          ) : (
            <>
              <Loader color="greninja" size="lg" type="bars" />
              <Text c="var(--mantine-color-dimmed)">Completing Google sign-in...</Text>
            </>
          )}
        </Stack>
      </Center>
    );
  }

  if (!isAuthReady) {
    return <Center mih="100vh"><Loader color="greninja" size="lg" type="bars" /></Center>;
  }

  if (!session) {
    return <Auth />;
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (mobileOpened) toggleMobile();
  };

  const handleLogoutConfirm = async () => {
    await supabase.auth.signOut();
    setLogoutModalOpened(false);
  };

  return (
    <AppShell
      navbar={{
        width: desktopCollapsed ? 80 : 250,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
      transitionDuration={300}
      transitionTimingFunction="ease"
      bg={isDark ? 'dark.8' : 'gray.0'}
    >
      <style>{`
        .greninja-hover-target:hover {
          background-color: #ede8b1 !important;
          color: #194c81 !important;
        }
        .greninja-hover-target:hover * {
          color: #194c81 !important;
        }
      `}</style>

      <AppShell.Navbar 
        p="md" 
        display="flex" 
        bg={isDark ? 'dark.9' : 'white'} 
        style={{ 
          flexDirection: 'column',
          borderRight: '1px solid var(--mantine-color-default-border)'
        }}
      >
        <Group mb="xl" justify={desktopCollapsed ? "center" : "space-between"} align="center" wrap="nowrap">
          <Group gap="sm" align="center" wrap="nowrap" mx={desktopCollapsed ? "auto" : 0}>
            <Tooltip label={desktopCollapsed ? "Expand Sidebar" : "Collapse Sidebar"} position="right" openDelay={500}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <GreninjaLogo size={40} onClick={() => setDesktopCollapsed(!desktopCollapsed)} />
              </div>
            </Tooltip>
            {!desktopCollapsed && (
              <Title order={3} c={isDark ? '#ede8b1' : '#194c81'} style={{ cursor: 'pointer', margin: 0 }} onClick={() => setDesktopCollapsed(!desktopCollapsed)}>
                Greninja
              </Title>
            )}
          </Group>
          <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
        </Group>

        <Stack style={{ flex: 1 }} gap="sm">
          <SidebarLink label="Dashboard" icon={<IconLayoutDashboard size={20} />} tabName="dashboard" activeTab={activeTab} isDark={isDark} desktopCollapsed={desktopCollapsed} onTabChange={handleTabChange} />
          <SidebarLink label="Transactions" icon={<IconListDetails size={20} />} tabName="transactions" activeTab={activeTab} isDark={isDark} desktopCollapsed={desktopCollapsed} onTabChange={handleTabChange} />
          <SidebarLink label="Upload Statement" icon={<IconFileUpload size={20} />} tabName="upload" activeTab={activeTab} isDark={isDark} desktopCollapsed={desktopCollapsed} onTabChange={handleTabChange} />
          <SidebarLink label="AI Assistant" icon={<IconRobot size={20} />} tabName="chat" activeTab={activeTab} isDark={isDark} desktopCollapsed={desktopCollapsed} onTabChange={handleTabChange} />
          <SidebarLink label="Account Settings" icon={<IconSettings size={20} />} tabName="settings" activeTab={activeTab} isDark={isDark} desktopCollapsed={desktopCollapsed} onTabChange={handleTabChange} />
          
          <Group justify="center" align="center" wrap="nowrap" px={desktopCollapsed ? 0 : "sm"} py="xs" mt="xs" style={{ width: '100%' }}>
            {!desktopCollapsed && <Text size="sm" fw={500} style={{ flex: 1 }} c={isDark ? 'gray.4' : 'dark.8'}>Dark Mode</Text>}
            <Tooltip label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"} disabled={!desktopCollapsed} position="right">
              <Switch
                checked={isDark}
                onChange={() => toggleColorScheme()}
                size="md"
                color="#194c81"
                onLabel={<IconMoon size={14} stroke={2.5} color="#ede8b1" />}
                offLabel={<IconSun size={14} stroke={2.5} color="#194c81" />}
                style={{ margin: desktopCollapsed ? '0 auto' : undefined }}
                styles={{
                  track: {
                    backgroundColor: isDark ? undefined : '#dbe5f2',
                    borderColor: isDark ? undefined : '#b1c6e5',
                  },
                  thumb: {
                    backgroundColor: isDark ? undefined : '#ffffff',
                    borderColor: isDark ? undefined : '#b1c6e5',
                  },
                }}
              />
            </Tooltip>
          </Group>
        </Stack>

        <Group justify={desktopCollapsed ? "center" : "flex-start"} mt="md" pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          {desktopCollapsed ? (
             <Tooltip label="Log Out" position="right">
               <ActionIcon variant="subtle" color="red" size={44} radius="md" onClick={() => setLogoutModalOpened(true)}>
                  <IconLogout size={20} />
               </ActionIcon>
             </Tooltip>
          ) : (
            <Button variant="subtle" color="red" fullWidth onClick={() => setLogoutModalOpened(true)} leftSection={<IconLogout size={16} />} justify="flex-start">
              Log Out
            </Button>
          )}
        </Group>
      </AppShell.Navbar>

      <AppShell.Main bg={isDark ? 'dark.8' : 'gray.0'}>
        <Group hiddenFrom="sm" mb="md" align="center">
          <Burger opened={mobileOpened} onClick={toggleMobile} size="sm" />
          <div style={{ display: 'flex', alignItems: 'center' }}><GreninjaLogo size={36} /></div>
          <Title order={4} c={isDark ? '#ede8b1' : '#194c81'} style={{ margin: 0 }}>Greninja</Title>
        </Group>

        {activeTab === 'dashboard' && (
          <Suspense fallback={<Center h={300}><Loader color="greninja" size="lg" type="bars" /></Center>}>
            <Dashboard userId={session.user.id} />
          </Suspense>
        )}
        {activeTab === 'transactions' && <TransactionTable userId={session.user.id} />}
        {activeTab === 'upload' && <UploadStatement userId={session.user.id} />}
        {activeTab === 'chat' && <Chatbot userId={session.user.id} />}
        {activeTab === 'settings' && <Settings />}
      </AppShell.Main>

      <Modal opened={logoutModalOpened} onClose={() => setLogoutModalOpened(false)} title={<Text fw={600} c="var(--mantine-color-text)">Sign Out Confirmation</Text>} centered>
        <Text size="sm" mb="lg" c="var(--mantine-color-text)">
          Are you sure you want to log out of your account?
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setLogoutModalOpened(false)}>Cancel</Button>
          <Button color="red" onClick={handleLogoutConfirm}>Yes, Log Out</Button>
        </Group>
      </Modal>
    </AppShell>
  );
}

export default App;