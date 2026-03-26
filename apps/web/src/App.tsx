import { useState, useEffect, createContext, useContext } from 'react'
import { Authenticator, useTheme, View, Text, Heading } from '@aws-amplify/ui-react'
import { fetchAuthSession } from 'aws-amplify/auth'
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
import RunDemo from './components/RunDemo'
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
  isAdmin: boolean
  isDarkMode: boolean
}
export const AuthContext = createContext<AuthContextType>({
  userId: '', groups: [], persona: 'osint-analyst', isAdmin: false, isDarkMode: true,
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

interface AuthenticatedAppProps {
  signOut?: () => void
  user?: { signInDetails?: { loginId?: string }; username?: string }
  darkMode: boolean
  toggleTheme: () => void
  currentView: ViewType
  setCurrentView: (v: ViewType) => void
  navigationOpen: boolean
  setNavigationOpen: (v: boolean) => void
}

function AuthenticatedApp({ signOut, user, darkMode, toggleTheme, currentView, setCurrentView, navigationOpen, setNavigationOpen }: AuthenticatedAppProps) {
  const userId = user?.signInDetails?.loginId ?? user?.username ?? ''
  const [groups, setGroups] = useState<string[]>([])
  const [demoVisible, setDemoVisible] = useState(false)

  useEffect(() => {
    fetchAuthSession().then(session => {
      const g = (session.tokens?.idToken?.payload?.['cognito:groups'] as string[]) ?? []
      setGroups(g)
    }).catch(() => setGroups([]))
  }, [])

  const persona = getPersona(groups)
  const isAdmin = groups.includes('admin')
  const navItems = buildNavItems(isAdmin ? 'leadership' : persona) // admin sees all nav sections

  useEffect(() => {
    if (groups.length > 0) setCurrentView(getDefaultView(isAdmin ? 'leadership' : persona))
  }, [persona, isAdmin, groups, setCurrentView])

  const utilities: Parameters<typeof TopNavigation>[0]['utilities'] = [
    ...(isAdmin ? [{ type: 'button' as const, text: 'Seed Demo', onClick: () => setDemoVisible(true) }] : []),
    { type: 'button' as const, text: darkMode ? 'Light' : 'Dark', onClick: toggleTheme },
    {
      type: 'menu-dropdown' as const,
      text: userId || 'Account',
      iconName: 'user-profile' as const,
      items: [{ id: 'signout', text: 'Sign out' }],
      onItemClick: ({ detail }: { detail: { id: string } }) => { if (detail.id === 'signout') signOut?.() },
    },
  ]

  return (
    <AuthContext.Provider value={{ userId, groups, persona: isAdmin ? 'leadership' : persona, isAdmin, isDarkMode: darkMode }}>
      <RunDemo visible={demoVisible} onDismiss={() => setDemoVisible(false)} userId={userId} />
      {isAdmin && (
        <div style={{
          background: 'linear-gradient(90deg, #e8001c, #d91515)',
          color: '#fff',
          textAlign: 'center',
          padding: '4px 0',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.5px',
        }}>
          ADMIN MODE — Full access to all personas and features
        </div>
      )}
      <div id="top-nav" style={{ position: 'sticky', top: isAdmin ? 0 : 0, zIndex: 1002 }}>
        <TopNavigation
          identity={{ href: '#', title: 'Recon AI' }}
          utilities={utilities}
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
      {({ signOut, user }) => (
        <AuthenticatedApp signOut={signOut} user={user} darkMode={darkMode} toggleTheme={toggleTheme}
          currentView={currentView} setCurrentView={setCurrentView}
          navigationOpen={navigationOpen} setNavigationOpen={setNavigationOpen} />
      )}
    </Authenticator>
  )
}
