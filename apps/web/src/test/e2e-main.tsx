/**
 * E2E test entry point — bypasses Cognito auth.
 * Renders the app directly with a mock user context.
 */
import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import '@aws-amplify/ui-react/styles.css'
import '@cloudscape-design/global-styles/index.css'
import { amplifyConfig } from '../config/amplify'
import { applyMode, Mode } from '@cloudscape-design/global-styles'
import AppLayout from '@cloudscape-design/components/app-layout'
import TopNavigation from '@cloudscape-design/components/top-navigation'
import SideNavigation, { SideNavigationProps } from '@cloudscape-design/components/side-navigation'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import Container from '@cloudscape-design/components/container'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Box from '@cloudscape-design/components/box'
import { AuthContext } from '../App'
import OsintDashboard from '../components/OsintDashboard'
import DataUpload from '../components/DataUpload'
import OsintInvestigations from '../components/OsintInvestigations'
import OsintChat from '../components/OsintChat'
import RedTeamDashboard from '../components/RedTeamDashboard'
import TargetQueue from '../components/TargetQueue'
import RedTeamOperations from '../components/RedTeamOperations'
import RedTeamChat from '../components/RedTeamChat'
import LeadershipDashboard from '../components/LeadershipDashboard'
import GoalManagement from '../components/GoalManagement'
import LeadershipChat from '../components/LeadershipChat'
import NetworkTopology from '../components/NetworkTopology'
import ToolRegistry from '../components/ToolRegistry'
import TargetOverview from '../components/TargetOverview'
import '../index.css'

Amplify.configure(amplifyConfig)
applyMode(Mode.Dark)

declare global {
  interface Window {
    __E2E_USER__?: { userId: string; email: string; groups: string[] }
  }
}

type Persona = 'osint-analyst' | 'red-team-analyst' | 'leadership'
type ViewType = 'osint-dashboard' | 'osint-upload' | 'osint-investigations' | 'osint-chat' | 'osint-topology'
  | 'redteam-dashboard' | 'redteam-targets' | 'redteam-operations' | 'redteam-chat' | 'redteam-topology' | 'redteam-tools'
  | 'leadership-dashboard' | 'leadership-goals' | 'leadership-chat' | 'leadership-targets' | 'leadership-tools' | 'leadership-topology'

function getPersona(groups: string[]): Persona {
  if (groups.includes('leadership')) return 'leadership'
  if (groups.includes('red-team-analyst')) return 'red-team-analyst'
  return 'osint-analyst'
}

function getDefaultView(persona: Persona): ViewType {
  switch (persona) {
    case 'leadership': return 'leadership-dashboard'
    case 'red-team-analyst': return 'redteam-dashboard'
    default: return 'osint-dashboard'
  }
}

function buildNavItems(persona: Persona): SideNavigationProps.Item[] {
  const items: SideNavigationProps.Item[] = []
  if (persona === 'osint-analyst' || persona === 'leadership') {
    items.push({
      type: 'section', text: 'OSINT',
      items: [
        { type: 'link', text: 'Dashboard', href: '#osint-dashboard' },
        { type: 'link', text: 'Upload Data', href: '#osint-upload' },
        { type: 'link', text: 'Investigations', href: '#osint-investigations' },
        { type: 'link', text: 'OSINT Chat', href: '#osint-chat' },
        { type: 'link', text: 'Network Topology', href: '#osint-topology' },
      ],
    })
  }
  if (persona === 'red-team-analyst' || persona === 'leadership') {
    items.push({
      type: 'section', text: 'Red Team',
      items: [
        { type: 'link', text: 'Dashboard', href: '#redteam-dashboard' },
        { type: 'link', text: 'Target Queue', href: '#redteam-targets' },
        { type: 'link', text: 'Operations', href: '#redteam-operations' },
        { type: 'link', text: 'Tool Registry', href: '#redteam-tools' },
        { type: 'link', text: 'Red Team Chat', href: '#redteam-chat' },
        { type: 'link', text: 'Network Topology', href: '#redteam-topology' },
      ],
    })
  }
  if (persona === 'leadership') {
    items.push({
      type: 'section', text: 'Leadership',
      items: [
        { type: 'link', text: 'Overview', href: '#leadership-dashboard' },
        { type: 'link', text: 'Goals & KPIs', href: '#leadership-goals' },
        { type: 'link', text: 'Target Overview', href: '#leadership-targets' },
        { type: 'link', text: 'Tool Registry', href: '#leadership-tools' },
        { type: 'link', text: 'Leadership Chat', href: '#leadership-chat' },
        { type: 'link', text: 'Network Topology', href: '#leadership-topology' },
      ],
    })
  }
  return items
}

function PlaceholderView({ title, description }: { title: string; description: string }) {
  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <SpaceBetween size="m">
          <Box variant="p">{description}</Box>
          <Box variant="small" color="text-body-secondary">This view will be implemented in a future phase.</Box>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  )
}

function renderView(view: ViewType) {
  switch (view) {
    case 'osint-dashboard': return <OsintDashboard />
    case 'osint-upload': return <DataUpload />
    case 'osint-investigations': return <OsintInvestigations />
    case 'osint-chat': return <OsintChat />
    case 'osint-topology': return <NetworkTopology />
    case 'redteam-dashboard': return <RedTeamDashboard />
    case 'redteam-targets': return <TargetQueue />
    case 'redteam-operations': return <RedTeamOperations />
    case 'redteam-tools': return <ToolRegistry />
    case 'redteam-chat': return <RedTeamChat />
    case 'redteam-topology': return <NetworkTopology />
    case 'leadership-dashboard': return <LeadershipDashboard />
    case 'leadership-goals': return <GoalManagement />
    case 'leadership-targets': return <TargetOverview />
    case 'leadership-tools': return <ToolRegistry />
    case 'leadership-chat': return <LeadershipChat />
    case 'leadership-topology': return <NetworkTopology />
    default: return <PlaceholderView title="Recon AI" description="Select a section from the navigation." />
  }
}

function E2EApp() {
  const e2eUser = window.__E2E_USER__ ?? { userId: 'e2e-user-1', email: 'e2e@test.com', groups: ['leadership'] }
  const persona = getPersona(e2eUser.groups)
  const navItems = buildNavItems(persona)

  const [currentView, setCurrentView] = useState<ViewType>(getDefaultView(persona))
  const [navigationOpen, setNavigationOpen] = useState(true)

  return (
    <AuthContext.Provider value={{ userId: e2eUser.userId, groups: e2eUser.groups, persona, isAdmin: false, isDarkMode: true, navigate: () => {} }}>
      <div id="top-nav" style={{ position: 'sticky', top: 0, zIndex: 1002 }}>
        <TopNavigation
          identity={{ href: '#', title: 'Recon AI' }}
          utilities={[
            { type: 'button', text: 'Dark' },
            {
              type: 'menu-dropdown',
              text: e2eUser.email,
              iconName: 'user-profile',
              items: [{ id: 'signout', text: 'Sign out' }],
              onItemClick: () => {},
            },
          ]}
        />
      </div>

      <AppLayout
        headerSelector="#top-nav"
        navigation={
          <SideNavigation
            header={{ text: 'Recon AI', href: '#' }}
            activeHref={`#${currentView}`}
            onFollow={({ detail }) => {
              const href = detail.href?.replace('#', '') as ViewType
              if (href) setCurrentView(href)
            }}
            items={navItems}
          />
        }
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        navigationWidth={260}
        toolsHide
        content={renderView(currentView)}
      />
    </AuthContext.Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <E2EApp />
  </React.StrictMode>
)
