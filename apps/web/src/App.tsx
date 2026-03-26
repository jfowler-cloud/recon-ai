import { useState, useEffect, createContext, useContext } from 'react'
import { Authenticator, useTheme, View, Text, Heading } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import '@cloudscape-design/global-styles/index.css'
import { applyMode, Mode } from '@cloudscape-design/global-styles'
import AppLayout from '@cloudscape-design/components/app-layout'
import TopNavigation from '@cloudscape-design/components/top-navigation'
import SideNavigation, { SideNavigationProps } from '@cloudscape-design/components/side-navigation'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import Container from '@cloudscape-design/components/container'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Box from '@cloudscape-design/components/box'
import OsintDashboard from './components/OsintDashboard'
import DataUpload from './components/DataUpload'
import OsintInvestigations from './components/OsintInvestigations'
import OsintChat from './components/OsintChat'
import RedTeamDashboard from './components/RedTeamDashboard'
import TargetQueue from './components/TargetQueue'
import RedTeamOperations from './components/RedTeamOperations'
import RedTeamChat from './components/RedTeamChat'
import LeadershipDashboard from './components/LeadershipDashboard'
import GoalManagement from './components/GoalManagement'
import LeadershipChat from './components/LeadershipChat'
import './index.css'

type Persona = 'osint-analyst' | 'red-team-analyst' | 'leadership'
type ViewType = 'osint-dashboard' | 'osint-upload' | 'osint-investigations' | 'osint-chat'
  | 'redteam-dashboard' | 'redteam-targets' | 'redteam-operations' | 'redteam-chat'
  | 'leadership-dashboard' | 'leadership-goals' | 'leadership-chat'

interface AuthContextType {
  userId: string
  groups: string[]
  persona: Persona
  isDarkMode: boolean
}
export const AuthContext = createContext<AuthContextType>({
  userId: '', groups: [], persona: 'osint-analyst', isDarkMode: true,
})
export function useAuth() { return useContext(AuthContext) }

function AuthHeader() {
  const { tokens } = useTheme()
  return (
    <View textAlign="center" padding={tokens.space.large}>
      <Heading level={3} marginTop={tokens.space.small}>Recon AI</Heading>
      <Text fontSize="small" color={tokens.colors.font.secondary}>
        OSINT Intelligence Portal
      </Text>
    </View>
  )
}

function AuthFooter() {
  const { tokens } = useTheme()
  return (
    <View textAlign="center" padding={tokens.space.large}>
      <Text fontSize="small" color={tokens.colors.font.secondary}>
        Secure authentication powered by AWS Cognito
      </Text>
    </View>
  )
}

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

  // OSINT section (visible to osint-analyst and leadership)
  if (persona === 'osint-analyst' || persona === 'leadership') {
    items.push({
      type: 'section', text: 'OSINT',
      items: [
        { type: 'link', text: 'Dashboard', href: '#osint-dashboard' },
        { type: 'link', text: 'Upload Data', href: '#osint-upload' },
        { type: 'link', text: 'Investigations', href: '#osint-investigations' },
        { type: 'link', text: 'OSINT Chat', href: '#osint-chat' },
      ],
    })
  }

  // Red Team section (visible to red-team-analyst and leadership)
  if (persona === 'red-team-analyst' || persona === 'leadership') {
    items.push({
      type: 'section', text: 'Red Team',
      items: [
        { type: 'link', text: 'Dashboard', href: '#redteam-dashboard' },
        { type: 'link', text: 'Target Queue', href: '#redteam-targets' },
        { type: 'link', text: 'Operations', href: '#redteam-operations' },
        { type: 'link', text: 'Red Team Chat', href: '#redteam-chat' },
      ],
    })
  }

  // Leadership section
  if (persona === 'leadership') {
    items.push({
      type: 'section', text: 'Leadership',
      items: [
        { type: 'link', text: 'Overview', href: '#leadership-dashboard' },
        { type: 'link', text: 'Goals & KPIs', href: '#leadership-goals' },
        { type: 'link', text: 'Leadership Chat', href: '#leadership-chat' },
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
          <Box variant="small" color="text-body-secondary">
            This view will be implemented in a future phase.
          </Box>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  )
}

function renderView(view: ViewType) {
  switch (view) {
    case 'osint-dashboard':
      return <OsintDashboard />
    case 'osint-upload':
      return <DataUpload />
    case 'osint-investigations':
      return <OsintInvestigations />
    case 'osint-chat':
      return <OsintChat />
    case 'redteam-dashboard':
      return <RedTeamDashboard />
    case 'redteam-targets':
      return <TargetQueue />
    case 'redteam-operations':
      return <RedTeamOperations />
    case 'redteam-chat':
      return <RedTeamChat />
    case 'leadership-dashboard':
      return <LeadershipDashboard />
    case 'leadership-goals':
      return <GoalManagement />
    case 'leadership-chat':
      return <LeadershipChat />
    default:
      return <PlaceholderView title="Recon AI" description="Select a section from the navigation." />
  }
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('osint-dashboard')
  const [navigationOpen, setNavigationOpen] = useState(true)
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('ra-darkMode') !== 'false'
  })

  useEffect(() => {
    applyMode(darkMode ? Mode.Dark : Mode.Light)
    localStorage.setItem('ra-darkMode', String(darkMode))
    document.body.classList.toggle('ra-dark', darkMode)
    document.body.classList.toggle('ra-light', !darkMode)
  }, [darkMode])

  const toggleTheme = () => {
    document.body.classList.add('theme-transitioning')
    setTimeout(() => document.body.classList.remove('theme-transitioning'), 300)
    setDarkMode(d => !d)
  }

  return (
    <Authenticator
      hideSignUp
      components={{ Header: AuthHeader, Footer: AuthFooter }}
      formFields={{
        signIn: {
          username: { placeholder: 'Enter your email', label: 'Email' },
          password: { placeholder: 'Enter your password', label: 'Password' },
        },
      }}
    >
      {({ signOut, user }) => {
        const userId = user?.signInDetails?.loginId ?? user?.username ?? ''
        // Extract Cognito groups from the ID token payload
        const userAny = user as unknown as Record<string, unknown> | undefined
        const session = userAny?.['signInUserSession'] as Record<string, unknown> | undefined
        const idToken = session?.['idToken'] as Record<string, unknown> | undefined
        const payload = idToken?.['payload'] as Record<string, unknown> | undefined
        const groups: string[] = (payload?.['cognito:groups'] as string[]) ?? []
        const persona = getPersona(groups)
        const navItems = buildNavItems(persona)

        // Set default view based on persona on first render
        useEffect(() => {
          setCurrentView(getDefaultView(persona))
        }, [persona])

        return (
          <AuthContext.Provider value={{ userId, groups, persona, isDarkMode: darkMode }}>
            <div id="top-nav" style={{ position: 'sticky', top: 0, zIndex: 1002 }}>
              <TopNavigation
                identity={{ href: '#', title: 'Recon AI' }}
                utilities={[
                  { type: 'button', text: darkMode ? 'Light' : 'Dark', onClick: toggleTheme },
                  {
                    type: 'menu-dropdown',
                    text: userId || 'Account',
                    iconName: 'user-profile',
                    items: [{ id: 'signout', text: 'Sign out' }],
                    onItemClick: ({ detail }) => { if (detail.id === 'signout') signOut?.() },
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
              ariaLabels={{
                navigation: 'Main navigation',
                navigationClose: 'Close navigation',
                navigationToggle: 'Open navigation',
              }}
            />
          </AuthContext.Provider>
        )
      }}
    </Authenticator>
  )
}
