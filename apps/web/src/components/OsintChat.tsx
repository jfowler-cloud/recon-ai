import { useState, useRef, useEffect, useCallback } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Textarea from '@cloudscape-design/components/textarea'
import Button from '@cloudscape-design/components/button'
import Box from '@cloudscape-design/components/box'
import Spinner from '@cloudscape-design/components/spinner'

// ── Types ────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ── Canned responses (chat_handler Lambda is Phase 4 — keep mock) ───

const CANNED_RESPONSES: Record<string, string> = {
  'vulnerabilities': `Based on the latest scan data, here are the most critical vulnerabilities detected:

1. **Unauthenticated MongoDB** (INV-001) — Port 27017 open on DMZ segment, exposing ~45K employee records. No authentication required. Severity: Critical.

2. **VPN Gateway RCE** (INV-002) — CVE-2026-1234 affects the primary VPN gateway running firmware v3.2.1. A public exploit is available and the gateway serves 200+ users. Severity: Critical.

3. **Cleartext FTP with Contract Docs** (INV-005) — Anonymous FTP on port 21 hosting 17 contract PDFs including government SOW documents. Severity: Critical.

**Recommended priority:** Address the VPN gateway first (broadest blast radius), then the MongoDB instance (PII exposure), then FTP (document classification review needed).`,

  'database': `I found **2 exposed database services** in the current scan data:

- **MongoDB** on port 27017 (10.x.x.x) — No authentication, 45K records with employee PII
- **Elasticsearch** on port 9200 (10.x.x.x) — No authentication, contains JWT tokens and 3 months of application logs

Both are on the Meridian Defense production subnet. The MongoDB instance is the higher priority due to PII regulations (potential GDPR/compliance exposure).`,

  'threat': `**Threat Landscape Summary — Meridian Defense Systems**

**External Attack Surface:**
- 3 critical vulnerabilities across internet-facing services
- DNS zone transfer leaking 42 internal hostnames
- Phishing domain (merid1an-defense.com) registered March 23

**Data Exposure:**
- Employee PII via unauthenticated MongoDB (~45K records)
- Contract documents via anonymous FTP (17 PDFs, including government SOWs)
- Hardcoded AWS keys and database credentials in a public GitHub repo

**Social Engineering Risk:**
- Internal org chart with clearance levels leaked on public forum
- Phishing infrastructure being prepared (MX records configured on lookalike domain)

**Overall Risk Rating: HIGH** — Multiple critical findings with active exploitation potential. Immediate remediation recommended for VPN gateway and MongoDB exposure.`,

  'default': `I analyzed the available OSINT data for Meridian Defense Systems. Here is what I found:

- **14 data uploads** processed today across Shodan, Nmap, social media, and log sources
- **7 active investigations** with 3 rated critical severity
- **10 total investigation tickets** spanning network exposure, data leaks, and social engineering vectors

Key areas of concern include exposed database services, a critical VPN vulnerability, and evidence of phishing infrastructure targeting Meridian. Would you like me to drill into any specific area?`,
}

function getCannedResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('vulnerabil') || lower.includes('critical')) return CANNED_RESPONSES['vulnerabilities']
  if (lower.includes('database') || lower.includes('port') || lower.includes('exposed')) return CANNED_RESPONSES['database']
  if (lower.includes('threat') || lower.includes('landscape') || lower.includes('summary') || lower.includes('overview')) return CANNED_RESPONSES['threat']
  return CANNED_RESPONSES['default']
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
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = (text ?? input).trim()
    if (!messageText || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: messageText }])
    setLoading(true)

    // Chat handler Lambda is Phase 4 — use canned responses for now
    await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800))

    const response = getCannedResponse(messageText)
    setMessages(prev => [...prev, { role: 'assistant', content: response }])
    setLoading(false)
  }, [input, loading])

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
                whiteSpace: 'pre-wrap',
                fontSize: 14,
                lineHeight: 1.6,
              }}>
                {m.content}
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
              onClick={() => { setMessages([]); setInput('') }}
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
