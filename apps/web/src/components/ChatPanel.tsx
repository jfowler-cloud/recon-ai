/**
 * Shared chat panel with session history sidebar, message rendering,
 * and input handling. Used by OSINT, Red Team, and Leadership chat views.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Textarea from '@cloudscape-design/components/textarea'
import Spinner from '@cloudscape-design/components/spinner'
import Icon from '@cloudscape-design/components/icon'
import { sendChatMessage, listChatSessions, getChatSession } from '@/utils/api'
import { useAuth } from '@/App'

// ── Types ────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  outputData?: unknown
}

interface SessionInfo {
  sessionId: string
  title: string
  updatedAt: number
}

interface ChatPanelProps {
  persona: 'osint' | 'redteam' | 'leadership'
  title: string
  assistantName: string
  description: string
  placeholder: string
  suggestions: string[]
  renderOutputData?: (data: unknown) => React.ReactNode
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatSessionTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString()
}

// ── Component ────────────────────────────────────────────────────────

export default function ChatPanel({ persona, title, assistantName, description, placeholder, suggestions, renderOutputData }: ChatPanelProps) {
  const { userId, isDarkMode } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Load session history on mount
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function fetchSessions() {
      try {
        const result = await listChatSessions(userId)
        if (cancelled) return
        const items = (result as { sessions?: SessionInfo[] }).sessions ?? []
        setSessions(items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)))
      } catch {
        // silent
      } finally {
        if (!cancelled) setSessionsLoading(false)
      }
    }
    fetchSessions()
    return () => { cancelled = true }
  }, [userId])

  // Resume a past session
  const resumeSession = useCallback(async (sid: string) => {
    setLoading(true)
    try {
      const result = await getChatSession(userId, sid)
      const msgs = (result as { messages?: Array<{ messageId: string; role: string; content: string; outputData?: unknown }> }).messages ?? []
      setSessionId(sid)
      setMessages(msgs.map(m => ({
        id: m.messageId,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        outputData: m.outputData,
      })))
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [userId])

  const sendMsg = useCallback(async (text?: string) => {
    const messageText = (text ?? input).trim()
    if (!messageText || loading) return

    setInput('')
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', content: messageText }])
    setLoading(true)

    let response: string
    let outputData: unknown = null
    try {
      const result = await sendChatMessage(userId, persona, messageText, sessionId)
      setSessionId(result.sessionId)
      response = result.content
      outputData = result.outputData

      // Update session list with new/updated session
      setSessions(prev => {
        const existing = prev.find(s => s.sessionId === result.sessionId)
        if (existing) {
          return prev.map(s => s.sessionId === result.sessionId
            ? { ...s, title: s.title || messageText.slice(0, 50), updatedAt: Date.now() / 1000 }
            : s
          ).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        }
        return [{ sessionId: result.sessionId, title: messageText.slice(0, 50), updatedAt: Date.now() / 1000 }, ...prev]
      })
    } catch (err) {
      response = `Error: ${err instanceof Error ? err.message : 'Failed to reach the AI agent. Please try again.'}`
    }

    setMessages(prev => [...prev, { id: `asst-${Date.now()}`, role: 'assistant', content: response, outputData }])
    setLoading(false)
  }, [input, loading, userId, persona, sessionId])

  const handleKeyDown = useCallback((e: CustomEvent<{ key: string; shiftKey: boolean }>) => {
    if (e.detail.key === 'Enter' && !e.detail.shiftKey) {
      e.preventDefault()
      sendMsg()
    }
  }, [sendMsg])

  const startNewChat = useCallback(() => {
    setMessages([])
    setSessionId(undefined)
    setInput('')
  }, [])

  // Session rename/delete
  const [editingSession, setEditingSession] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const renameSession = useCallback((sid: string, newTitle: string) => {
    setSessions(prev => prev.map(s => s.sessionId === sid ? { ...s, title: newTitle } : s))
    setEditingSession(null)
  }, [])

  const deleteSession = useCallback((sid: string) => {
    setSessions(prev => prev.filter(s => s.sessionId !== sid))
    if (sessionId === sid) startNewChat()
  }, [sessionId, startNewChat])

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 160px)', gap: 0 }}>
      {/* Session sidebar */}
      {sidebarOpen && (
        <div style={{
          width: 260,
          flexShrink: 0,
          borderRight: `1px solid ${isDarkMode ? '#414d5c' : '#e9ebed'}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${isDarkMode ? '#414d5c' : '#e9ebed'}` }}>
            <SpaceBetween size="xs">
              <Button variant="primary" onClick={startNewChat} fullWidth>New Chat</Button>
            </SpaceBetween>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sessionsLoading ? (
              <Box textAlign="center" padding="l"><Spinner /></Box>
            ) : sessions.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 16px' }}>
                <div className="empty-state-icon" style={{ width: 48, height: 48, fontSize: 20 }}>&#128172;</div>
                <div className="empty-state-description">No past sessions</div>
              </div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {sessions.map(s => (
                  <div
                    key={s.sessionId}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: 6,
                      margin: '2px 8px',
                      background: sessionId === s.sessionId ? (isDarkMode ? 'rgba(9,114,211,0.15)' : 'rgba(9,114,211,0.08)') : 'transparent',
                    }}
                    onClick={() => { if (editingSession !== s.sessionId) resumeSession(s.sessionId) }}
                  >
                    {editingSession === s.sessionId ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') renameSession(s.sessionId, editTitle); if (e.key === 'Escape') setEditingSession(null) }}
                          autoFocus
                          style={{ flex: 1, fontSize: 12, padding: '2px 4px', background: isDarkMode ? '#1e2228' : '#fff', color: 'inherit', border: `1px solid ${isDarkMode ? '#414d5c' : '#d1d5db'}`, borderRadius: 4 }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: sessionId === s.sessionId ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 10, opacity: 0.5 }}>{formatSessionTime(s.updatedAt)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0, opacity: 0.5 }}
                          onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setEditingSession(s.sessionId); setEditTitle(s.title || '') }}
                            title="Rename"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'inherit', padding: '2px 4px' }}
                          >&#9998;</button>
                          <button
                            onClick={() => deleteSession(s.sessionId)}
                            title="Delete"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#e8001c', padding: '2px 4px' }}
                          >&#10005;</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Container
          header={
            <Header
              variant="h2"
              description={description}
              actions={
                <Button
                  variant="icon"
                  iconName={sidebarOpen ? 'angle-left' : 'angle-right'}
                  onClick={() => setSidebarOpen(prev => !prev)}
                  ariaLabel="Toggle session sidebar"
                />
              }
            >
              <SpaceBetween direction="horizontal" size="xs">
                <Icon name="gen-ai" />
                <span>{title}</span>
              </SpaceBetween>
            </Header>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 320px)' }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', minHeight: 0 }}>
              {messages.length === 0 && (
                <Box textAlign="center" padding={{ vertical: 'xl' }}>
                  <SpaceBetween size="m">
                    <Box variant="h2">{assistantName}</Box>
                    <Box variant="p" color="text-body-secondary">{description}</Box>
                    <SpaceBetween size="xs">
                      <Box variant="small" fontWeight="bold">Try:</Box>
                      {suggestions.map(q => (
                        <Box key={q} variant="small" color="text-body-secondary">
                          <Button variant="inline-link" onClick={() => sendMsg(q)}>&quot;{q}&quot;</Button>
                        </Box>
                      ))}
                    </SpaceBetween>
                  </SpaceBetween>
                </Box>
              )}

              {messages.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  <div style={{
                    maxWidth: '85%',
                    padding: '12px 16px',
                    borderRadius: 12,
                    backgroundColor: m.role === 'user' ? '#0972d3' : isDarkMode ? '#1e2228' : '#f2f3f3',
                    color: m.role === 'user' ? '#ffffff' : isDarkMode ? '#e8eaed' : '#000716',
                  }}>
                    {m.role === 'user' ? (
                      <SpaceBetween direction="horizontal" size="xs">
                        <Box variant="p">{m.content}</Box>
                        <Icon name="user-profile" />
                      </SpaceBetween>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <Icon name="contact" />
                          <Box variant="small" fontWeight="bold" color="text-body-secondary">{assistantName}</Box>
                        </div>
                        <div className="chat-markdown"><Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown></div>
                        {m.outputData && renderOutputData && renderOutputData(m.outputData)}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                  <div style={{ padding: '12px 16px', borderRadius: 12, backgroundColor: isDarkMode ? '#1e2228' : '#f2f3f3' }}>
                    <SpaceBetween direction="horizontal" size="xs">
                      <Icon name="contact" />
                      <Spinner size="normal" />
                      <Box variant="small" color="text-body-secondary">Thinking...</Box>
                    </SpaceBetween>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ borderTop: `1px solid ${isDarkMode ? '#414d5c' : '#e9ebed'}`, paddingTop: 16 }}>
              <SpaceBetween size="s">
                <Textarea
                  value={input}
                  onChange={({ detail }) => setInput(detail.value)}
                  onKeyDown={handleKeyDown as never}
                  placeholder={placeholder}
                  rows={3}
                  disabled={loading}
                  ariaLabel="Chat message input"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    {messages.length > 0 && (
                      <Button variant="normal" onClick={startNewChat} disabled={loading}>New Chat</Button>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => sendMsg()}
                    disabled={loading || !input.trim()}
                    loading={loading}
                    iconName="send"
                    iconAlign="right"
                  >
                    Send
                  </Button>
                </div>
              </SpaceBetween>
            </div>
          </div>
        </Container>
      </div>
    </div>
  )
}
