import { useState, useRef, useEffect, useCallback } from 'react'
import Markdown from 'react-markdown'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Textarea from '@cloudscape-design/components/textarea'
import Button from '@cloudscape-design/components/button'
import Box from '@cloudscape-design/components/box'
import Spinner from '@cloudscape-design/components/spinner'
import { sendChatMessage } from '@/utils/api'
import { useAuth } from '@/App'

// ── Types ────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ── Suggested questions ──────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  'What are the most critical vulnerabilities?',
  'Show exposed database ports',
  'Summarize the threat landscape',
]

// ── Main component ───────────────────────────────────────────────────

export default function OsintChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const { userId } = useAuth()

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = (text ?? input).trim()
    if (!messageText || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: messageText }])
    setLoading(true)

    let response: string
    try {
      const result = await sendChatMessage(userId, 'osint', messageText, sessionId)
      setSessionId(result.sessionId)
      response = result.content
    } catch (err) {
      response = `Error: ${err instanceof Error ? err.message : 'Failed to reach the AI agent. Please try again.'}`
    }

    setMessages(prev => [...prev, { role: 'assistant', content: response }])
    setLoading(false)
  }, [input, loading, userId, sessionId])

  const handleKeyDown = useCallback((e: CustomEvent<{ key: string; shiftKey: boolean }>) => {
    if (e.detail.key === 'Enter' && !e.detail.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [sendMessage])

  return (
    <Container
      header={
        <Header variant="h2" description="Ask questions about ingested OSINT data, vulnerabilities, and threat landscape">
          OSINT Chat
        </Header>
      }
    >
      <SpaceBetween size="m">
        {/* Chat message area */}
        <div style={{
          minHeight: 400,
          maxHeight: 520,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '8px 0',
        }}>
          {/* Welcome message */}
          {messages.length === 0 && (
            <SpaceBetween size="m">
              <Box color="text-body-secondary" variant="p">
                Welcome to the OSINT analyst chat. I can help you analyze ingested data, identify vulnerabilities,
                and generate threat summaries. Try one of the suggested questions below or ask your own.
              </Box>
              <SpaceBetween size="xs" direction="horizontal">
                {SUGGESTED_QUESTIONS.map(q => (
                  <Button
                    key={q}
                    variant="normal"
                    onClick={() => sendMessage(q)}
                  >
                    {q}
                  </Button>
                ))}
              </SpaceBetween>
            </SpaceBetween>
          )}

          {/* Messages */}
          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: 12,
                background: m.role === 'user'
                  ? 'var(--color-background-button-primary-default, #0972d3)'
                  : 'var(--color-background-container-content, #1a2332)',
                color: m.role === 'user' ? '#fff' : 'inherit',
                fontSize: 14,
                lineHeight: 1.6,
              }}>
                {m.role === 'user' ? m.content : <div className="chat-markdown"><Markdown>{m.content}</Markdown></div>}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: 'var(--color-background-container-content, #1a2332)',
              }}>
                <Spinner size="normal" /> <Box variant="small" display="inline" color="text-body-secondary">Analyzing data...</Box>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <Textarea
          value={input}
          onChange={({ detail }) => setInput(detail.value)}
          onKeyDown={handleKeyDown as never}
          placeholder="Ask about vulnerabilities, exposed services, threat landscape... (Enter to send, Shift+Enter for newline)"
          rows={3}
          disabled={loading}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="primary"
            onClick={() => sendMessage()}
            loading={loading}
            disabled={!input.trim()}
          >
            Send
          </Button>
          {messages.length > 0 && (
            <Button
              variant="normal"
              onClick={() => { setMessages([]); setInput(''); setSessionId(undefined) }}
              disabled={loading}
            >
              Clear Chat
            </Button>
          )}
        </div>
      </SpaceBetween>
    </Container>
  )
}
