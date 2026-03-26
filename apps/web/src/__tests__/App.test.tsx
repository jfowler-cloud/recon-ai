import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

// Mock all page components to simple divs for App-level testing
vi.mock('../components/OsintDashboard', () => ({ default: () => <div data-testid="osint-dashboard">OSINT Dashboard</div> }))
vi.mock('../components/DataUpload', () => ({ default: () => <div data-testid="data-upload">Data Upload</div> }))
vi.mock('../components/OsintInvestigations', () => ({ default: () => <div data-testid="osint-investigations">Investigations</div> }))
vi.mock('../components/OsintChat', () => ({ default: () => <div data-testid="osint-chat">OSINT Chat</div> }))
vi.mock('../components/RedTeamDashboard', () => ({ default: () => <div data-testid="redteam-dashboard">RT Dashboard</div> }))
vi.mock('../components/TargetQueue', () => ({ default: () => <div data-testid="target-queue">Target Queue</div> }))
vi.mock('../components/RedTeamOperations', () => ({ default: () => <div data-testid="redteam-operations">Operations</div> }))
vi.mock('../components/RedTeamChat', () => ({ default: () => <div data-testid="redteam-chat">RT Chat</div> }))
vi.mock('../components/LeadershipDashboard', () => ({ default: () => <div data-testid="leadership-dashboard">Leadership Dashboard</div> }))
vi.mock('../components/GoalManagement', () => ({ default: () => <div data-testid="goal-management">Goals</div> }))
vi.mock('../components/LeadershipChat', () => ({ default: () => <div data-testid="leadership-chat">Leadership Chat</div> }))

// Mock Cloudscape components
vi.mock('@cloudscape-design/components/app-layout', () => ({
  default: ({ content, navigation }: Record<string, unknown>) => (
    <div data-testid="app-layout">
      <div data-testid="navigation">{navigation as React.ReactNode}</div>
      <div data-testid="content">{content as React.ReactNode}</div>
    </div>
  ),
}))

vi.mock('@cloudscape-design/components/top-navigation', () => ({
  default: ({ identity, utilities }: Record<string, unknown>) => (
    <div data-testid="top-nav">
      <span>{(identity as Record<string, string>)?.title}</span>
      {(utilities as Array<Record<string, unknown>>)?.map((u, i) => (
        <button key={i} onClick={u.onClick as () => void}>{u.text as string}</button>
      ))}
    </div>
  ),
}))

vi.mock('@cloudscape-design/components/side-navigation', () => ({
  default: ({ items, header }: Record<string, unknown>) => (
    <div data-testid="side-nav">
      <span>{(header as Record<string, string>)?.text}</span>
      <span data-testid="nav-sections">{(items as unknown[])?.length} sections</span>
    </div>
  ),
}))

vi.mock('@cloudscape-design/components/content-layout', () => ({
  default: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
}))
vi.mock('@cloudscape-design/components/header', () => ({
  default: ({ children }: Record<string, unknown>) => <h1>{children as React.ReactNode}</h1>,
}))
vi.mock('@cloudscape-design/components/container', () => ({
  default: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
}))
vi.mock('@cloudscape-design/components/space-between', () => ({
  default: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
}))
vi.mock('@cloudscape-design/components/box', () => ({
  default: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
}))

describe('App', () => {
  it('renders the app layout', () => {
    render(<App />)
    expect(screen.getByTestId('app-layout')).toBeInTheDocument()
  })

  it('renders the top navigation with Recon AI title', () => {
    render(<App />)
    expect(screen.getByTestId('top-nav')).toBeInTheDocument()
    expect(screen.getAllByText('Recon AI').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the side navigation', () => {
    render(<App />)
    expect(screen.getByTestId('side-nav')).toBeInTheDocument()
  })

  it('shows default OSINT Dashboard view', () => {
    render(<App />)
    expect(screen.getByTestId('osint-dashboard')).toBeInTheDocument()
  })

  it('renders dark/light mode toggle', () => {
    render(<App />)
    const toggleBtn = screen.getByText(/Light|Dark/)
    expect(toggleBtn).toBeInTheDocument()
  })

  it('renders user account menu', () => {
    render(<App />)
    expect(screen.getByText('test@test.com')).toBeInTheDocument()
  })
})
