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
import { sendChatMessage } from '@/utils/api'
import type { ChatMessage } from '@/types'

interface ChartConfig {
  type: 'pie' | 'bar'
  data: Array<Record<string, unknown>>
  title: string
}

const PIE_COLORS = ['#e8001c', '#0972d3', '#f89256', '#29a368', '#8c8c8c']

function ChatBubble({ message, chart }: { message: ChatMessage; chart?: ChartConfig }) {
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
  chart?: ChartConfig
}

export default function LeadershipChat() {
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { userId, isDarkMode } = useAuth()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: StoredMessage = {
      sessionId: sessionId ?? '',
      messageId: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Math.floor(Date.now() / 1000),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    let content: string
    let chart: ChartConfig | undefined
    try {
      const result = await sendChatMessage(userId, 'leadership', text, sessionId)
      setSessionId(result.sessionId)
      content = result.content
      // If the agent returned outputData with chart configs, use them
      if (Array.isArray(result.outputData) && result.outputData.length > 0) {
        const chartData = result.outputData[0] as ChartConfig
        if (chartData?.type && chartData?.data) {
          chart = chartData
        }
      } else if (result.outputData && typeof result.outputData === 'object' && !Array.isArray(result.outputData)) {
        const chartData = result.outputData as ChartConfig
        if (chartData?.type && chartData?.data) {
          chart = chartData
        }
      }
    } catch (err) {
      content = `Error: ${err instanceof Error ? err.message : 'Failed to reach the AI agent. Please try again.'}`
    }

    const assistantMsg: StoredMessage = {
      sessionId: sessionId ?? '',
      messageId: `assistant-${Date.now()}`,
      role: 'assistant',
      content,
      createdAt: Math.floor(Date.now() / 1000),
      chart,
    }
    setMessages(prev => [...prev, assistantMsg])
    setIsLoading(false)
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
