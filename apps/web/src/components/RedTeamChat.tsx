import { useState, useRef, useEffect } from 'react'
import Markdown from 'react-markdown'
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
import { sendChatMessage } from '@/utils/api'
import type { ChatMessage } from '@/types'

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
            <div className="chat-markdown"><Markdown>{message.content}</Markdown></div>
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
  const [sessionId, setSessionId] = useState<string | undefined>()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { userId, isDarkMode } = useAuth()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = {
      sessionId: sessionId ?? '',
      messageId: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Math.floor(Date.now() / 1000),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    let response: string
    try {
      const result = await sendChatMessage(userId, 'redteam', text, sessionId)
      setSessionId(result.sessionId)
      response = result.content
    } catch (err) {
      response = `Error: ${err instanceof Error ? err.message : 'Failed to reach the AI agent. Please try again.'}`
    }

    const assistantMsg: ChatMessage = {
      sessionId: sessionId ?? '',
      messageId: `assistant-${Date.now()}`,
      role: 'assistant',
      content: response,
      createdAt: Math.floor(Date.now() / 1000),
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
