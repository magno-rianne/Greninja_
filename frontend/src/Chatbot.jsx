import { useState, useRef, useEffect } from 'react';
import { Paper, Title, Text, Stack, TextInput, ActionIcon, ScrollArea, Group, UnstyledButton, Loader, useMantineColorScheme } from '@mantine/core';
import { IconSend, IconUser, IconBulb } from '@tabler/icons-react';
import { apiFetch } from './api';

const GreninjaLogo = ({ size = 24 }) => (
  <img src="/favicon.svg" alt="" width={size} height={size} style={{ flexShrink: 0 }} />
);

export default function Chatbot() {
  const [messages, setMessages] = useState([{ role: 'ai', content: 'Hello! I am Greninja, your financial AI. How can I help you today?' }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const viewport = useRef(null);

  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const suggestionsPanelBg = isDark ? 'rgba(132, 166, 215, 0.06)' : '#f4f7fb';
  const aiMessageBg = isDark ? 'rgba(132, 166, 215, 0.10)' : '#eaf2fb';
  const suggestionCardBg = isDark ? 'var(--mantine-color-dark-7)' : '#ffffff';

  useEffect(() => {
    if (viewport.current) viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const suggestedQuestions = [
    "What was my biggest expense last month?", "What are my top 3 spending categories?",
    "How much did I spend on QR transfers?", "Did I have any unusual transactions recently?",
    "How much did I save this month?", "Can you give me a spending summary?"
  ];

  const handleSend = async (text) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput(''); setIsLoading(true);

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch response');
      setMessages((prev) => [...prev, { role: 'ai', content: data.response }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', content: "Sorry, I'm having trouble connecting to the server. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to turn **bold text** into actual <b> HTML tags
  const formatMessageContent = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <b key={index}>{part.slice(2, -2)}</b>;
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <Paper withBorder p="xl" radius="md" h="calc(100vh - 32px)" display="flex" style={{ flexDirection: 'column', overflow: 'hidden' }}>
      <div>
        <Title order={3} mb="xs" c="var(--mantine-color-text)">AI Financial Assistant</Title>
        <Text c="var(--mantine-color-dimmed)" size="sm" mb="xl">Ask questions about your income, spending, and transaction history.</Text>
      </div>

      <div className="greninja-chat-row" style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, gap: 'var(--mantine-spacing-lg)' }}>
        <div className="greninja-chat-sidebar" style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          <Paper
            radius="md"
            p="md"
            style={{ display: 'flex', flexDirection: 'column', width: '100%', maxHeight: '100%', backgroundColor: suggestionsPanelBg, border: 'none', alignSelf: 'flex-start' }}
          >
            <Group gap="xs" mb="md" align="center">
              <div style={{ backgroundColor: '#194c81', borderRadius: '50%', padding: '4px', display: 'flex' }}>
                 <IconBulb size={14} stroke={2.5} color="white" />
              </div>
              <Text size="sm" fw={700} tt="uppercase" c="#194c81" style={{ letterSpacing: '0.5px' }}>
                Try asking
              </Text>
            </Group>
            
            <ScrollArea style={{ flexShrink: 1, minHeight: 0 }} type="auto" scrollbarSize={4}>
              <Stack gap="sm" pb="xs">
                {suggestedQuestions.map((q, idx) => (
                  <UnstyledButton
                    key={idx}
                    onClick={() => handleSend(q)}
                    disabled={isLoading}
                    p="md"
                    className="greninja-suggestion-item"
                    style={{
                      borderRadius: '12px',
                      backgroundColor: suggestionCardBg,
                      border: isDark ? '1px solid #373A40' : '1px solid #e5e7eb',
                      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
                      opacity: isLoading ? 0.5 : 1,
                      transition: 'all 150ms ease',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    <Text size="sm" c="var(--mantine-color-text)" style={{ lineHeight: 1.4, textAlign: 'center', fontWeight: 500 }}>
                      "{q}"
                    </Text>
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea>
          </Paper>
        </div>

        <div className="greninja-chat-main" style={{ flex: '1 1 0', display: 'flex', minHeight: 0, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0, minWidth: 0 }}>
            <ScrollArea flex={1} viewportRef={viewport} p="sm" type="auto" style={{ minHeight: 0, minWidth: 0 }}>
              <Stack gap="lg">
                {messages.map((msg, idx) => (
                  <Group key={idx} justify={msg.role === 'user' ? 'flex-end' : 'flex-start'} align="flex-end" wrap="nowrap" gap="xs" style={{ minWidth: 0 }}>
                    {msg.role === 'ai' && (
                      <Paper 
                        radius="xl" 
                        p={6} 
                        bg="white" 
                        style={{ border: '1px solid var(--mantine-color-default-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <GreninjaLogo size={24} />
                      </Paper>
                    )}

                    <Paper
                      p="sm"
                      px="md"
                      radius="lg"
                      bg={msg.role === 'user' ? 'greninja.9' : aiMessageBg}
                      c={msg.role === 'user' ? 'white' : 'var(--mantine-color-text)'}
                      maw="75%"
                      style={{
                        borderBottomRightRadius: msg.role === 'user' ? 4 : undefined,
                        borderBottomLeftRadius: msg.role === 'ai' ? 4 : undefined,
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                        {formatMessageContent(msg.content)}
                      </Text>
                    </Paper>

                    {msg.role === 'user' && (
                      <Paper 
                        radius="xl" 
                        p={6} 
                        bg="#194c81" 
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <IconUser size={24} stroke={1.75} color="white" />
                      </Paper>
                    )}
                  </Group>
                ))}
                {isLoading && (
                  <Group justify="flex-start" align="flex-end" wrap="nowrap" gap="xs">
                    <Paper 
                      radius="xl" 
                      p={6} 
                      bg="white" 
                      style={{ border: '1px solid var(--mantine-color-default-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <GreninjaLogo size={24} />
                    </Paper>
                    <Paper p="sm" px="md" radius="lg" bg={aiMessageBg} style={{ borderBottomLeftRadius: 4 }}>
                      <Loader size="sm" color="greninja" type="dots" />
                    </Paper>
                  </Group>
                )}
              </Stack>
            </ScrollArea>
          </div>
        </div>
      </div>

      <Group align="center" wrap="nowrap" gap="sm" mt="md">
        <TextInput
          flex={1}
          placeholder="Ask about your finances..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          disabled={isLoading}
          radius="xl"
          size="md"
          styles={{
            input: {
              backgroundColor: suggestionsPanelBg,
              border: 'none',
            },
          }}
        />
        <ActionIcon size={42} radius="xl" color="greninja" variant="filled" onClick={() => handleSend(input)} disabled={isLoading || !input.trim()}>
          <IconSend size={20} />
        </ActionIcon>
      </Group>

      <style>{`
        .greninja-suggestion-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(25, 76, 129, 0.08) !important;
        }
        .mantine-color-scheme-dark .greninja-suggestion-item:hover {
          background-color: rgba(132, 166, 215, 0.15) !important;
          border-color: var(--mantine-color-greninja-7) !important;
        }
        @media (max-width: 768px) {
          .greninja-chat-row {
            flex-direction: column;
          }
          .greninja-chat-main {
            flex: 1 1 0 !important;
          }
        }
      `}</style>
    </Paper>
  );
}