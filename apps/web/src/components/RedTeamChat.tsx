import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import ChatPanel from './ChatPanel'

export default function RedTeamChat() {
  return (
    <ContentLayout header={<Header variant="h1">Red Team Chat</Header>}>
      <ChatPanel
        persona="redteam"
        title="Red Team Chat"
        assistantName="Red Team Assistant"
        description="AI-powered red team operations assistant with tool recommendations and risk analysis"
        placeholder="Ask about targets, operations, or leadership priorities..."
        suggestions={[
          'What are the highest priority targets?',
          'Show tool usage history',
          'What does leadership want us to focus on?',
        ]}
      />
    </ContentLayout>
  )
}
