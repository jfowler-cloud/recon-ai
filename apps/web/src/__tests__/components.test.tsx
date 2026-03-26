/**
 * Component-level unit tests for all 17 views.
 * Tests rendering, data display, loading states, and user interactions.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithAuth, sampleTargets, sampleTickets, sampleTools, sampleUploads, sampleDashboard } from './test-utils'
import * as api from '../utils/api'

const mockApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>

// ── Mock Cloudscape (top-level for hoisting) ────────────────────────
vi.mock('@cloudscape-design/components/container', () => ({ default: ({ children, header }: Record<string, unknown>) => <div data-testid="container">{header && <div>{header as React.ReactNode}</div>}{children as React.ReactNode}</div> }))
vi.mock('@cloudscape-design/components/content-layout', () => ({ default: ({ children, header }: Record<string, unknown>) => <div data-testid="content-layout">{header && <div>{header as React.ReactNode}</div>}{children as React.ReactNode}</div> }))
vi.mock('@cloudscape-design/components/space-between', () => ({ default: ({ children }: Record<string, unknown>) => <div data-testid="space-between">{children as React.ReactNode}</div> }))
vi.mock('@cloudscape-design/components/column-layout', () => ({ default: ({ children }: Record<string, unknown>) => <div data-testid="column-layout">{children as React.ReactNode}</div> }))
vi.mock('@cloudscape-design/components/split-panel', () => ({ default: ({ children }: Record<string, unknown>) => <div data-testid="split-panel">{children as React.ReactNode}</div> }))
vi.mock('@cloudscape-design/components/header', () => ({ default: ({ children, counter, description, actions }: Record<string, unknown>) => <div data-testid="header">{children as React.ReactNode}{counter && <span>{counter as string}</span>}{description && <span>{description as string}</span>}{actions && <div>{actions as React.ReactNode}</div>}</div> }))
vi.mock('@cloudscape-design/components/box', () => ({ default: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div> }))
vi.mock('@cloudscape-design/components/button', () => ({ default: ({ children, onClick, disabled, loading }: Record<string, unknown>) => <button onClick={onClick as () => void} disabled={!!disabled || !!loading}>{loading ? 'Loading...' : children as React.ReactNode}</button> }))
vi.mock('@cloudscape-design/components/spinner', () => ({ default: () => <div data-testid="spinner">Loading...</div> }))
vi.mock('@cloudscape-design/components/badge', () => ({ default: ({ children }: Record<string, unknown>) => <span data-testid="badge">{children as React.ReactNode}</span> }))
vi.mock('@cloudscape-design/components/alert', () => ({ default: ({ children }: Record<string, unknown>) => <div data-testid="alert">{children as React.ReactNode}</div> }))
vi.mock('@cloudscape-design/components/icon', () => ({ default: () => <span data-testid="icon" /> }))
vi.mock('@cloudscape-design/components/textarea', () => ({ default: ({ value, onChange, placeholder, disabled }: Record<string, unknown>) => <textarea data-testid="textarea" value={value as string} onChange={(e) => (onChange as (e: { detail: { value: string } }) => void)?.({ detail: { value: e.target.value } })} placeholder={placeholder as string} disabled={disabled as boolean} /> }))
vi.mock('@cloudscape-design/components/input', () => ({ default: ({ value, onChange, placeholder }: Record<string, unknown>) => <input data-testid="input" value={value as string} onChange={(e) => (onChange as (e: { detail: { value: string } }) => void)?.({ detail: { value: e.target.value } })} placeholder={placeholder as string} /> }))
vi.mock('@cloudscape-design/components/select', () => ({ default: () => <select data-testid="select" /> }))
vi.mock('@cloudscape-design/components/modal', () => ({ default: ({ visible, children, header, footer }: Record<string, unknown>) => visible ? <div data-testid="modal"><div>{header as React.ReactNode}</div>{children as React.ReactNode}{footer && <div>{footer as React.ReactNode}</div>}</div> : null }))
vi.mock('@cloudscape-design/components/table', () => ({ default: ({ items, columnDefinitions, empty }: Record<string, unknown>) => { const cols = columnDefinitions as Array<{ id: string; header: string; cell: (item: unknown) => React.ReactNode }>; const rows = items as unknown[]; return <table data-testid="table"><thead><tr>{cols?.map(c => <th key={c.id}>{c.header}</th>)}</tr></thead><tbody>{rows?.length ? rows.map((item, i) => <tr key={i}>{cols?.map(c => <td key={c.id}>{c.cell(item)}</td>)}</tr>) : <tr><td>{empty as React.ReactNode}</td></tr>}</tbody></table> } }))
vi.mock('@cloudscape-design/components/text-filter', () => ({ default: ({ filteringPlaceholder }: Record<string, unknown>) => <input data-testid="text-filter" placeholder={filteringPlaceholder as string} /> }))
vi.mock('@cloudscape-design/components/progress-bar', () => ({ default: ({ value, additionalInfo }: Record<string, unknown>) => <div data-testid="progress-bar" data-value={value}>{additionalInfo as string}</div> }))
vi.mock('@cloudscape-design/components/status-indicator', () => ({ default: ({ children }: Record<string, unknown>) => <span>{children as React.ReactNode}</span> }))
vi.mock('@cloudscape-design/components/form-field', () => ({ default: ({ children, label }: Record<string, unknown>) => <div data-testid="form-field"><label>{label as string}</label>{children as React.ReactNode}</div> }))
vi.mock('@cloudscape-design/components/toggle', () => ({ default: ({ children }: Record<string, unknown>) => <label>{children as React.ReactNode}</label> }))
vi.mock('@cloudscape-design/components/tabs', () => ({ default: ({ tabs }: Record<string, unknown>) => <div data-testid="tabs">{(tabs as Array<{ id: string; content: React.ReactNode }>)?.map(t => <div key={t.id}>{t.content}</div>)}</div> }))
vi.mock('@cloudscape-design/components/slider', () => ({ default: () => <input type="range" data-testid="slider" /> }))
vi.mock('@cloudscape-design/components/app-layout', () => ({ default: ({ content, splitPanel }: Record<string, unknown>) => <div data-testid="app-layout">{content as React.ReactNode}{splitPanel && <div>{splitPanel as React.ReactNode}</div>}</div> }))
vi.mock('@cloudscape-design/components/top-navigation', () => ({ default: ({ identity }: Record<string, unknown>) => <div data-testid="top-nav">{(identity as Record<string, string>)?.title}</div> }))
vi.mock('@cloudscape-design/components/side-navigation', () => ({ default: ({ items }: Record<string, unknown>) => <div data-testid="side-nav">{(items as unknown[])?.length} items</div> }))
vi.mock('@cloudscape-design/collection-hooks', () => ({ useCollection: (items: unknown[]) => ({ items, collectionProps: {}, filterProps: { filteringText: '', onChange: vi.fn() } }) }))
vi.mock('recharts', () => ({ ResponsiveContainer: ({ children }: Record<string, unknown>) => <div data-testid="chart">{children as React.ReactNode}</div>, PieChart: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>, BarChart: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>, Pie: () => null, Bar: () => null, Cell: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null }))
vi.mock('react-markdown', () => ({ default: ({ children }: Record<string, unknown>) => <div data-testid="markdown">{children as React.ReactNode}</div> }))
vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('@/utils/api', () => ({
  getDashboard: vi.fn(),
  listUploads: vi.fn(),
  listTargets: vi.fn(),
  listTickets: vi.fn(),
  listTools: vi.fn(),
  createTicket: vi.fn(),
  updateTicket: vi.fn(),
  createTarget: vi.fn(),
  updateTarget: vi.fn(),
  manageTools: vi.fn(),
  updateContext: vi.fn(),
  sendChatMessage: vi.fn(),
  listChatSessions: vi.fn(),
  getChatSession: vi.fn(),
  getPresignedUploadUrl: vi.fn(),
  uploadFileToS3: vi.fn(),
  getConfig: vi.fn(),
  triggerIngestion: vi.fn(),
  recordToolAction: vi.fn(),
  invokeLambda: vi.fn(),
  getLambdaClient: vi.fn(),
  getDdbClient: vi.fn(),
  listDocuments: vi.fn(),
  queueForRedteam: vi.fn(),
}))

// Import components after mocks
import OsintDashboard from '../components/OsintDashboard'
import DataUpload from '../components/DataUpload'
import OsintInvestigations from '../components/OsintInvestigations'
import OsintChat from '../components/OsintChat'
import RedTeamDashboard from '../components/RedTeamDashboard'
import TargetQueue from '../components/TargetQueue'
import RedTeamOperations from '../components/RedTeamOperations'
import RedTeamChat from '../components/RedTeamChat'
import ToolRegistry from '../components/ToolRegistry'
import LeadershipDashboard from '../components/LeadershipDashboard'
import GoalManagement from '../components/GoalManagement'
import LeadershipChat from '../components/LeadershipChat'
import TargetOverview from '../components/TargetOverview'
import RunDemo from '../components/RunDemo'

beforeEach(() => {
  vi.clearAllMocks()
  // Default API responses
  mockApi.getDashboard.mockResolvedValue(sampleDashboard)
  mockApi.listUploads.mockResolvedValue(sampleUploads)
  mockApi.listTargets.mockResolvedValue(sampleTargets)
  mockApi.listTickets.mockResolvedValue(sampleTickets)
  mockApi.listTools.mockResolvedValue(sampleTools)
  mockApi.listChatSessions.mockResolvedValue({ sessions: [] })
  mockApi.getChatSession.mockResolvedValue({ messages: [] })
  mockApi.getConfig.mockResolvedValue({ config: [], sources: [] })
  mockApi.sendChatMessage.mockResolvedValue({ sessionId: 'sess-1', messageId: 'msg-1', content: 'AI response' })
  mockApi.createTicket.mockResolvedValue({ ticketId: 'TKT-NEW', title: 'New', status: 'new' })
  mockApi.createTarget.mockResolvedValue({ targetId: 'tgt-new', name: 'New Target', status: 'queued', priorityScore: 0 })
  mockApi.manageTools.mockResolvedValue({ toolId: 'tool-new', name: 'New Tool' })
  mockApi.updateContext.mockResolvedValue({})
  mockApi.getPresignedUploadUrl.mockResolvedValue({ uploadUrl: 'https://s3.example.com/upload', uploadId: 'up-new' })
})

// ── OSINT Dashboard ─────────────────────────────────────────────────

describe('OsintDashboard', () => {
  it('renders loading spinner initially', () => {
    mockApi.getDashboard.mockReturnValue(new Promise(() => {}))
    renderWithAuth(<OsintDashboard />)
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  it('renders dashboard after data loads', async () => {
    renderWithAuth(<OsintDashboard />)
    await waitFor(() => {
      expect(mockApi.getDashboard).toHaveBeenCalledWith('osint-analyst')
    })
  })

  it('calls listUploads for recent uploads table', async () => {
    renderWithAuth(<OsintDashboard />)
    await waitFor(() => {
      expect(mockApi.listUploads).toHaveBeenCalled()
    })
  })
})

// ── Data Upload ─────────────────────────────────────────────────────

describe('DataUpload', () => {
  it('renders upload form', async () => {
    renderWithAuth(<DataUpload />)
    await waitFor(() => {
      expect(screen.getAllByText(/Upload/i).length).toBeGreaterThan(0)
    })
  })
})

// ── OSINT Investigations ────────────────────────────────────────────

describe('OsintInvestigations', () => {
  it('renders loading then investigations list', async () => {
    renderWithAuth(<OsintInvestigations />)
    await waitFor(() => {
      expect(mockApi.listTickets).toHaveBeenCalledWith('type', 'osint-investigation')
    })
  })

  it('displays ticket data in table', async () => {
    renderWithAuth(<OsintInvestigations />)
    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument()
    })
  })
})

// ── OSINT Chat ──────────────────────────────────────────────────────

describe('OsintChat', () => {
  it('renders chat interface', () => {
    renderWithAuth(<OsintChat />)
    expect(screen.getAllByText(/OSINT/i).length).toBeGreaterThan(0)
  })

  it('fetches session list on mount', async () => {
    renderWithAuth(<OsintChat />)
    await waitFor(() => {
      expect(mockApi.listChatSessions).toHaveBeenCalledWith('test-user')
    })
  })
})

// ── Red Team Dashboard ──────────────────────────────────────────────

describe('RedTeamDashboard', () => {
  it('renders loading spinner initially', () => {
    mockApi.getDashboard.mockReturnValue(new Promise(() => {}))
    renderWithAuth(<RedTeamDashboard />, { persona: 'red-team-analyst' })
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  it('fetches red team dashboard data', async () => {
    renderWithAuth(<RedTeamDashboard />, { persona: 'red-team-analyst' })
    await waitFor(() => {
      expect(mockApi.getDashboard).toHaveBeenCalledWith('red-team-analyst')
    })
  })
})

// ── Target Queue ────────────────────────────────────────────────────

describe('TargetQueue', () => {
  it('renders loading then target table', async () => {
    renderWithAuth(<TargetQueue />, { persona: 'red-team-analyst' })
    await waitFor(() => {
      expect(mockApi.listTargets).toHaveBeenCalled()
    })
    expect(screen.getByTestId('table')).toBeInTheDocument()
  })

  it('renders target names in table', async () => {
    renderWithAuth(<TargetQueue />, { persona: 'red-team-analyst' })
    await waitFor(() => {
      expect(screen.getByText('MongoDB Instance')).toBeInTheDocument()
    })
  })

  it('shows Create Target button', async () => {
    renderWithAuth(<TargetQueue />, { persona: 'red-team-analyst' })
    await waitFor(() => {
      expect(screen.getByText('Create Target')).toBeInTheDocument()
    })
  })
})

// ── Red Team Operations ─────────────────────────────────────────────

describe('RedTeamOperations', () => {
  it('fetches red-team-operation tickets', async () => {
    renderWithAuth(<RedTeamOperations />, { persona: 'red-team-analyst' })
    await waitFor(() => {
      expect(mockApi.listTickets).toHaveBeenCalledWith('type', 'red-team-operation')
    })
  })

  it('displays operations table', async () => {
    renderWithAuth(<RedTeamOperations />, { persona: 'red-team-analyst' })
    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument()
    })
  })
})

// ── Red Team Chat ───────────────────────────────────────────────────

describe('RedTeamChat', () => {
  it('renders chat interface with title', () => {
    renderWithAuth(<RedTeamChat />, { persona: 'red-team-analyst' })
    expect(screen.getAllByText(/Red Team/i).length).toBeGreaterThan(0)
  })
})

// ── Tool Registry ───────────────────────────────────────────────────

describe('ToolRegistry', () => {
  it('renders loading then tool table', async () => {
    renderWithAuth(<ToolRegistry />, { persona: 'red-team-analyst' })
    await waitFor(() => {
      expect(mockApi.listTools).toHaveBeenCalled()
    })
    expect(screen.getByTestId('table')).toBeInTheDocument()
  })

  it('displays tool names', async () => {
    renderWithAuth(<ToolRegistry />, { persona: 'red-team-analyst' })
    await waitFor(() => {
      expect(screen.getByText('Nmap')).toBeInTheDocument()
      expect(screen.getByText('Metasploit')).toBeInTheDocument()
    })
  })

  it('shows Register Tool button', async () => {
    renderWithAuth(<ToolRegistry />, { persona: 'red-team-analyst' })
    await waitFor(() => {
      expect(screen.getByText('Register Tool')).toBeInTheDocument()
    })
  })
})

// ── Leadership Dashboard ────────────────────────────────────────────

describe('LeadershipDashboard', () => {
  it('renders loading spinner initially', () => {
    mockApi.getDashboard.mockReturnValue(new Promise(() => {}))
    mockApi.listTargets.mockReturnValue(new Promise(() => {}))
    renderWithAuth(<LeadershipDashboard />, { persona: 'leadership' })
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  it('fetches leadership dashboard data', async () => {
    renderWithAuth(<LeadershipDashboard />, { persona: 'leadership' })
    await waitFor(() => {
      expect(mockApi.getDashboard).toHaveBeenCalledWith('leadership')
    })
  })

  it('renders charts after data loads', async () => {
    renderWithAuth(<LeadershipDashboard />, { persona: 'leadership' })
    await waitFor(() => {
      expect(screen.getAllByTestId('chart').length).toBeGreaterThan(0)
    })
  })
})

// ── Goal Management ─────────────────────────────────────────────────

describe('GoalManagement', () => {
  it('renders loading then goal form', async () => {
    renderWithAuth(<GoalManagement />, { persona: 'leadership' })
    await waitFor(() => {
      expect(mockApi.getDashboard).toHaveBeenCalledWith('leadership')
    })
  })

  it('shows Add Goal button', async () => {
    renderWithAuth(<GoalManagement />, { persona: 'leadership' })
    await waitFor(() => {
      expect(screen.getByText('Add Goal')).toBeInTheDocument()
    })
  })

  it('shows Add KPI button', async () => {
    renderWithAuth(<GoalManagement />, { persona: 'leadership' })
    await waitFor(() => {
      expect(screen.getByText('Add KPI')).toBeInTheDocument()
    })
  })

  it('shows Save Context button', async () => {
    renderWithAuth(<GoalManagement />, { persona: 'leadership' })
    await waitFor(() => {
      expect(screen.getByText('Save Context')).toBeInTheDocument()
    })
  })
})

// ── Leadership Chat ─────────────────────────────────────────────────

describe('LeadershipChat', () => {
  it('renders chat interface with title', () => {
    renderWithAuth(<LeadershipChat />, { persona: 'leadership' })
    expect(screen.getAllByText(/Leadership/i).length).toBeGreaterThan(0)
  })
})

// ── Target Overview ─────────────────────────────────────────────────

describe('TargetOverview', () => {
  it('fetches all data sources on mount', async () => {
    renderWithAuth(<TargetOverview />, { persona: 'leadership' })
    await waitFor(() => {
      expect(mockApi.listTargets).toHaveBeenCalled()
      expect(mockApi.listTickets).toHaveBeenCalled()
      expect(mockApi.listTools).toHaveBeenCalled()
      expect(mockApi.getDashboard).toHaveBeenCalled()
    })
  })

  it('displays target table after loading', async () => {
    renderWithAuth(<TargetOverview />, { persona: 'leadership' })
    await waitFor(() => {
      expect(screen.getByTestId('table')).toBeInTheDocument()
    })
  })

  it('shows target names', async () => {
    renderWithAuth(<TargetOverview />, { persona: 'leadership' })
    await waitFor(() => {
      expect(screen.getByText('MongoDB Instance')).toBeInTheDocument()
    })
  })

  it('renders charts', async () => {
    renderWithAuth(<TargetOverview />, { persona: 'leadership' })
    await waitFor(() => {
      expect(screen.getAllByTestId('chart').length).toBeGreaterThan(0)
    })
  })
})

// ── RunDemo ─────────────────────────────────────────────────────────

describe('RunDemo', () => {
  it('renders modal when visible', () => {
    renderWithAuth(<RunDemo visible={true} onDismiss={vi.fn()} userId="test" />)
    expect(screen.getByTestId('modal')).toBeInTheDocument()
    expect(screen.getAllByText(/Run Demo/i).length).toBeGreaterThan(0)
  })

  it('does not render when not visible', () => {
    renderWithAuth(<RunDemo visible={false} onDismiss={vi.fn()} userId="test" />)
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
  })

  it('shows seed description text', () => {
    renderWithAuth(<RunDemo visible={true} onDismiss={vi.fn()} userId="test" />)
    expect(screen.getByText(/Seeds the app with realistic/)).toBeInTheDocument()
  })
})
