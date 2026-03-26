import { useState, useRef, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Textarea from '@cloudscape-design/components/textarea'
import Spinner from '@cloudscape-design/components/spinner'
import Icon from '@cloudscape-design/components/icon'
import ContentLayout from '@cloudscape-design/components/content-layout'
import { useAuth } from '@/App'
import type { ChatMessage } from '@/types'

const MOCK_RESPONSES: Record<string, string> = {
  'What are the highest priority targets?': `Here are the current highest priority targets for Meridian Defense:

1. **Exchange Server (ProxyLogon)** - Priority: 95/100
   - CVE-2021-26855 + CVE-2021-27065 on mail.meridian-defense.com
   - Status: Approved, assigned to analyst-1

2. **Kubernetes API (Exposed)** - Priority: 93/100
   - Anonymous auth enabled on k8s.meridian-defense.com:6443
   - Status: Queued, unassigned

3. **VPN Gateway (Fortinet)** - Priority: 91/100
   - CVE-2024-21762 pre-auth RCE on vpn.meridian-defense.com
   - Status: Approved, assigned to analyst-1

4. **Jenkins CI (Exposed CLI)** - Priority: 88/100
   - CVE-2024-23897 on ci.meridian-defense.com:8080
   - Status: In Progress, assigned to analyst-2

All targets aligned with leadership goal of perimeter hardening.`,

  'Show tool usage history': `**Tool Usage Summary (Last 7 Days)**

| Tool | Actions | Targets Hit | Success Rate |
|------|---------|------------|--------------|
| Nmap | 12 | 6 | 100% |
| Metasploit | 5 | 3 | 60% |
| Jenkins CLI | 3 | 1 | 33% |
| redis-cli | 2 | 1 | 100% |
| Custom Script | 4 | 2 | 75% |

**Total**: 26 tool actions across 8 unique targets.
Most active analyst: analyst-2 (11 actions).`,

  'What does leadership want us to focus on?': `**Current Leadership Priorities (Q1 2026)**

1. **Perimeter Hardening** (Weight: 40%)
   - Focus on internet-facing services: VPN, mail, CI/CD
   - KPI: Reduce critical external vulns by 50%

2. **Database Security** (Weight: 30%)
   - Audit all database instances for auth gaps
   - KPI: Zero unauthenticated database endpoints

3. **Lateral Movement Prevention** (Weight: 20%)
   - Test internal segmentation between subnets
   - KPI: Document all cross-subnet access paths

4. **Credential Hygiene** (Weight: 10%)
   - Test for default and weak credentials
   - KPI: 100% of services require strong auth

This aligns with the current target queue — Exchange, Fortinet VPN, and Jenkins are top priority.`,
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const { isDarkMode } = useAuth()

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
      <div
        style={{
          maxWidth: '85%',
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: isUser ? '#0972d3' : isDarkMode ? '#1e2228' : '#f2f3f3',
          color: isUser ? '#ffffff' : isDarkMode ? '#e8eaed' : '#000716',
          whiteSpace: 'pre-wrap',
        }}
      >
        {isUser ? (
          <SpaceBetween direction="horizontal" size="xs">
            <Box variant="p">{message.content}</Box>
            <Icon name="user-profile" />
          </SpaceBetween>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Icon name="contact" />
              <Box variant="small" fontWeight="bold" color="text-body-secondary">Red Team Assistant</Box>
            </div>
            <Box variant="p">{message.content}</Box>
          </>
        )}
      </div>
    </div>
  )
}

function LoadingBubble() {
  const { isDarkMode } = useAuth()
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
      <div style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: isDarkMode ? '#1e2228' : '#f2f3f3' }}>
        <SpaceBetween direction="horizontal" size="xs">
          <Icon name="contact" />
          <Spinner size="normal" />
          <Box variant="small" color="text-body-secondary">Thinking...</Box>
        </SpaceBetween>
      </div>
    </div>
  )
}

function WelcomeMessage({ onSuggestionClick }: { onSuggestionClick: (q: string) => void }) {
  const suggestions = [
    'What are the highest priority targets?',
    'Show tool usage history',
    'What does leadership want us to focus on?',
  ]

  return (
    <Box textAlign="center" padding={{ vertical: 'xl' }}>
      <SpaceBetween size="m">
        <Box variant="h2">Red Team Assistant</Box>
        <Box variant="p" color="text-body-secondary">
          Ask questions about targets, operations, tool history, and leadership priorities.
        </Box>
        <SpaceBetween size="xs">
          <Box variant="small" fontWeight="bold">Try:</Box>
          {suggestions.map(q => (
            <Box key={q} variant="small" color="text-body-secondary">
              <Button variant="inline-link" onClick={() => onSuggestionClick(q)}>
                &quot;{q}&quot;
              </Button>
            </Box>
          ))}
        </SpaceBetween>
      </SpaceBetween>
    </Box>
  )
}

export default function RedTeamChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { isDarkMode } = useAuth()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = {
      sessionId: 'mock-session',
      messageId: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Math.floor(Date.now() / 1000),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    setTimeout(() => {
      const response = MOCK_RESPONSES[text] ??
        `I found information related to your query about "${text}". Based on the current target queue, there are 10 targets tracked across 5 categories. The highest priority items are the Exchange Server (ProxyLogon) at 95/100 and the Kubernetes API at 93/100. Would you like me to drill into a specific target or operation?`

      const assistantMsg: ChatMessage = {
        sessionId: 'mock-session',
        messageId: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        createdAt: Math.floor(Date.now() / 1000),
      }
      setMessages(prev => [...prev, assistantMsg])
      setIsLoading(false)
    }, 1200)
  }

  const handleKeyDown = (e: CustomEvent) => {
    const detail = (e as unknown as { detail: { key: string; shiftKey: boolean } }).detail
    if (detail?.key === 'Enter' && !detail?.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <ContentLayout header={<Header variant="h1">Red Team Chat</Header>}>
      <Container
        header={
          <Header variant="h2" description="AI-powered red team operations assistant">
            <SpaceBetween direction="horizontal" size="xs">
              <Icon name="gen-ai" />
              <span>Chat</span>
            </SpaceBetween>
          </Header>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 280px)' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', minHeight: 0 }}>
            {messages.length === 0 && <WelcomeMessage onSuggestionClick={sendMessage} />}
            {messages.map(message => (
              <ChatBubble key={message.messageId} message={message} />
            ))}
            {isLoading && <LoadingBubble />}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ borderTop: `1px solid ${isDarkMode ? '#414d5c' : '#e9ebed'}`, paddingTop: '16px' }}>
            <SpaceBetween size="s">
              <Textarea
                value={input}
                onChange={({ detail }) => setInput(detail.value)}
                onKeyDown={handleKeyDown as unknown as (e: CustomEvent) => void}
                placeholder="Ask about targets, operations, or leadership priorities..."
                rows={3}
                disabled={isLoading}
                ariaLabel="Chat message input"
              />
              <Box float="right">
                <Button
                  variant="primary"
                  onClick={() => sendMessage(input)}
                  disabled={isLoading || !input.trim()}
                  loading={isLoading}
                  iconName="send"
                  iconAlign="right"
                >
                  Send
                </Button>
              </Box>
            </SpaceBetween>
          </div>
        </div>
      </Container>
    </ContentLayout>
  )
}
