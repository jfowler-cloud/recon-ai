import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import ChatPanel from './ChatPanel'

export default function OsintChat() {
  return (
    <ContentLayout header={<Header variant="h1">OSINT Chat</Header>}>
      <ChatPanel
        persona="osint"
        title="OSINT Chat"
        assistantName="OSINT Assistant"
        description="Ask questions about ingested OSINT data, vulnerabilities, and threat landscape"
        placeholder="Ask about vulnerabilities, exposed services, threat landscape... (Enter to send, Shift+Enter for newline)"
        suggestions={[
          'What are the most critical vulnerabilities?',
          'Show exposed database ports',
          'Summarize the threat landscape',
        ]}
      />
    </ContentLayout>
  )
}
