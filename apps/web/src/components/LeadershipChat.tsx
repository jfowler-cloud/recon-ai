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
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useAuth } from '@/App'
import type { ChatMessage } from '@/types'

interface MockResponse {
  content: string
  chart?: {
    type: 'pie' | 'bar'
    data: Array<Record<string, unknown>>
    title: string
  }
}

const PIE_COLORS = ['#e8001c', '#0972d3', '#f89256', '#29a368', '#8c8c8c']

const MOCK_RESPONSES: Record<string, MockResponse> = {
  "What's our overall security posture?": {
    content: `**Security Posture Summary -- Q1 2026**

- **Critical Findings**: 7 (3 OSINT, 4 Red Team)
- **High Findings**: 12 (8 OSINT, 4 Red Team)
- **Active Operations**: 5 red team ops, 8 OSINT investigations
- **Remediation Rate**: 42% of critical findings addressed in <48h

**Key Concerns:**
1. Exchange Server ProxyLogon chain remains exploitable
2. 3 databases with no authentication found on internal network
3. Fortinet VPN pre-auth RCE confirmed but not yet patched

**Positive Trends:**
- DNS zone transfer vulnerability closed this week
- Jenkins CI partially hardened (CLI disabled, web UI still exposed)
- Team utilization at 78% -- healthy capacity`,
    chart: {
      type: 'pie',
      title: 'Operations Status Distribution',
      data: [
        { name: 'Active', value: 3 },
        { name: 'Investigating', value: 4 },
        { name: 'Triaging', value: 2 },
        { name: 'Completed', value: 5 },
        { name: 'Closed', value: 2 },
      ],
    },
  },
  'Show analyst workload': {
    content: `**Analyst Workload Distribution**

| Analyst | OSINT Tasks | RT Operations | Total | Status |
|---------|------------|---------------|-------|--------|
| analyst-1 | 3 | 2 | 5 | Active |
| analyst-2 | 2 | 2 | 4 | Active |
| analyst-3 | 1 | 1 | 2 | Active |
| analyst-4 | 0 | 0 | 0 | Available |

**Observations:**
- analyst-1 is handling both high-priority RT ops (Exchange, Fortinet) -- consider load balancing
- analyst-4 is available and should be assigned to the queued Kubernetes API target
- Average workload: 2.75 tickets per analyst`,
    chart: {
      type: 'bar',
      title: 'Tasks per Analyst',
      data: [
        { analyst: 'analyst-1', OSINT: 3, RedTeam: 2 },
        { analyst: 'analyst-2', OSINT: 2, RedTeam: 2 },
        { analyst: 'analyst-3', OSINT: 1, RedTeam: 1 },
        { analyst: 'analyst-4', OSINT: 0, RedTeam: 0 },
      ],
    },
  },
  'Generate a report on critical findings': {
    content: `**Critical Findings Report -- Generated 2026-03-25**

**OSINT-Sourced Critical Findings (3):**
1. **CVE-2021-26855 (ProxyLogon)** -- mail.meridian-defense.com
   - Discovered via Shodan scan on 2026-03-18
   - Confirmed exploitable, RCE achieved in red team op RT-001

2. **CVE-2024-21762 (FortiOS)** -- vpn.meridian-defense.com
   - Discovered via Nmap service scan on 2026-03-20
   - Pre-auth RCE, exploitation in progress (RT-004)

3. **Exposed Kubernetes API** -- k8s.meridian-defense.com:6443
   - Anonymous auth enabled, full cluster access
   - Queued for red team engagement

**Red Team-Sourced Critical Findings (4):**
4. **Redis No Auth** -- 10.0.5.40:6379 (confirmed via RT-005)
5. **Jenkins CLI RCE** -- ci.meridian-defense.com (CVE-2024-23897)
6. **PostgreSQL Default Creds** -- db-prod.meridian-defense.com
7. **MongoDB No Auth** -- 10.0.5.55:27017

**Recommendation:** Prioritize patching Exchange and FortiOS -- both are internet-facing with active exploits.`,
    chart: {
      type: 'bar',
      title: 'Vulnerability Trend (Last 4 Weeks)',
      data: [
        { week: 'Week 1', Critical: 3, High: 5, Medium: 8 },
        { week: 'Week 2', Critical: 5, High: 7, Medium: 10 },
        { week: 'Week 3', Critical: 6, High: 9, Medium: 12 },
        { week: 'Week 4', Critical: 7, High: 12, Medium: 11 },
      ],
    },
  },
}

function ChatBubble({ message, chart }: { message: ChatMessage; chart?: MockResponse['chart'] }) {
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
              <Box variant="small" fontWeight="bold" color="text-body-secondary">Leadership Assistant</Box>
            </div>
            <Box variant="p">{message.content}</Box>
            {chart && (
              <div style={{ marginTop: '16px', backgroundColor: isDarkMode ? '#0f1419' : '#ffffff', borderRadius: '8px', padding: '12px' }}>
                <Box variant="small" fontWeight="bold" padding={{ bottom: 'xs' }}>{chart.title}</Box>
                <ResponsiveContainer width="100%" height={250}>
                  {chart.type === 'pie' ? (
                    <PieChart>
                      <Pie data={chart.data} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label>
                        {chart.data.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  ) : (
                    <BarChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey={Object.keys(chart.data[0])[0]} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {Object.keys(chart.data[0]).slice(1).map((key, i) => (
                        <Bar key={key} dataKey={key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
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
    "What's our overall security posture?",
    'Show analyst workload',
    'Generate a report on critical findings',
  ]

  return (
    <Box textAlign="center" padding={{ vertical: 'xl' }}>
      <SpaceBetween size="m">
        <Box variant="h2">Leadership Assistant</Box>
        <Box variant="p" color="text-body-secondary">
          Ask questions across OSINT findings, red team operations, analyst workload, and organizational goals. Responses include auto-generated visualizations.
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

interface StoredMessage extends ChatMessage {
  chart?: MockResponse['chart']
}

export default function LeadershipChat() {
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { isDarkMode } = useAuth()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: StoredMessage = {
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
      const mockResponse = MOCK_RESPONSES[text]
      const content = mockResponse?.content ??
        `Based on current data across both OSINT and red team domains, I can provide insights on "${text}". We currently have 12 OSINT investigations and 5 red team operations in progress, with 7 critical findings requiring immediate attention. Would you like me to break this down by domain, severity, or timeline?`

      const assistantMsg: StoredMessage = {
        sessionId: 'mock-session',
        messageId: `assistant-${Date.now()}`,
        role: 'assistant',
        content,
        createdAt: Math.floor(Date.now() / 1000),
        chart: mockResponse?.chart,
      }
      setMessages(prev => [...prev, assistantMsg])
      setIsLoading(false)
    }, 1500)
  }

  const handleKeyDown = (e: CustomEvent) => {
    const detail = (e as unknown as { detail: { key: string; shiftKey: boolean } }).detail
    if (detail?.key === 'Enter' && !detail?.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <ContentLayout header={<Header variant="h1">Leadership Chat</Header>}>
      <Container
        header={
          <Header variant="h2" description="Cross-domain AI assistant with auto-visualization">
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
              <ChatBubble key={message.messageId} message={message} chart={message.chart} />
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
                placeholder="Ask about security posture, analyst workload, findings, or generate reports..."
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
