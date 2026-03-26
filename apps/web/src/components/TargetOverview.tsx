/**
 * Leadership read-only view of all targets with goal alignment,
 * priority scores, and cross-domain visibility.
 */
import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Table from '@cloudscape-design/components/table'
import Badge from '@cloudscape-design/components/badge'
import Box from '@cloudscape-design/components/box'
import SpaceBetween from '@cloudscape-design/components/space-between'
import TextFilter from '@cloudscape-design/components/text-filter'
import ProgressBar from '@cloudscape-design/components/progress-bar'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import SplitPanel from '@cloudscape-design/components/split-panel'
import AppLayout from '@cloudscape-design/components/app-layout'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTargets, listTickets, listTools, getDashboard } from '@/utils/api'
import { useAuth } from '@/App'
import type { Target, Ticket, Tool } from '@/types'

// ── Helpers ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: '#8c8c8c', enriched: '#0972d3', active: '#f89256',
  in_progress: '#e8001c', 'in-progress': '#e8001c', completed: '#29a368',
  approved: '#0972d3', deferred: '#5f6b7a', cancelled: '#5f6b7a',
}

function statusBadge(status: string) {
  const colorMap: Record<string, 'blue' | 'green' | 'red' | 'grey'> = {
    queued: 'grey', enriched: 'blue', active: 'blue',
    in_progress: 'red', 'in-progress': 'red', completed: 'green',
    approved: 'blue', deferred: 'grey', cancelled: 'grey',
  }
  return <Badge color={colorMap[status] ?? 'grey'}>{status}</Badge>
}

function formatDate(ts: number | string): string {
  const n = typeof ts === 'string' ? Number(ts) : ts
  if (!n || isNaN(n)) return '—'
  return new Date(n * 1000).toLocaleDateString()
}

const PIE_COLORS = ['#8c8c8c', '#0972d3', '#f89256', '#e8001c', '#29a368', '#5f6b7a']
const CAT_COLORS = ['#e8001c', '#0972d3', '#f89256', '#29a368', '#a78bfa']

// ── Detail panel ────────────────────────────────────────────────────

function TargetDetailPanel({ target, operations, tools, goals }: {
  target: Target
  operations: Ticket[]
  tools: Tool[]
  goals: { id: string; title: string; weight: number }[]
}) {
  const raw = target as unknown as Record<string, unknown>
  const linkedOps = operations.filter(op => op.targetId === target.targetId)
  const catLower = (target.category || '').toLowerCase()
  const matchingTools = tools.filter(tool =>
    (tool.targetTypes ?? []).some(tt => {
      const ttl = tt.toLowerCase()
      return ttl === catLower || (ttl === 'web' && catLower === 'application')
        || (ttl === 'database' && catLower === 'application')
        || (ttl === 'network' && catLower === 'infrastructure')
    })
  )

  // Parse goal alignment from enrichment
  const alignmentTags = Array.isArray(raw.alignmentTags) ? raw.alignmentTags as string[] : []
  const goalAlignment = Array.isArray(raw.goalAlignment) ? raw.goalAlignment as string[] : []

  return (
    <SpaceBetween size="m">
      <div>
        <Box variant="h3">{target.name || 'Unnamed Target'}</Box>
        <Box variant="small" color="text-body-secondary">{target.targetId}</Box>
      </div>

      <ColumnLayout columns={4}>
        <div>
          <Box variant="small" color="text-body-secondary">Status</Box>
          <div style={{ marginTop: 4 }}>{statusBadge(target.status)}</div>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Priority Score</Box>
          <ProgressBar value={target.priorityScore} additionalInfo={`${target.priorityScore}/100`} />
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Category</Box>
          <Box variant="p">{target.category || '—'}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Created</Box>
          <Box variant="p">{formatDate(target.createdAt)}</Box>
        </div>
      </ColumnLayout>

      {target.description && (
        <div>
          <Box variant="small" color="text-body-secondary">Description</Box>
          <Box variant="p">{target.description}</Box>
        </div>
      )}

      {/* Goal Alignment */}
      {(goalAlignment.length > 0 || alignmentTags.length > 0) && (
        <Container header={<Header variant="h3">Goal Alignment</Header>}>
          <SpaceBetween size="s">
            {goalAlignment.length > 0 && (
              <div>
                <Box variant="small" color="text-body-secondary">Aligned Goals</Box>
                <SpaceBetween size="xxs">
                  {goalAlignment.map((ga, i) => {
                    const matchedGoal = goals.find(g => ga.toLowerCase().includes(g.title.toLowerCase()))
                    return (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Badge color="blue">{matchedGoal ? `Weight: ${matchedGoal.weight}` : 'Aligned'}</Badge>
                        <span>{ga}</span>
                      </div>
                    )
                  })}
                </SpaceBetween>
              </div>
            )}
            {alignmentTags.length > 0 && (
              <div>
                <Box variant="small" color="text-body-secondary">Tags</Box>
                <SpaceBetween size="xxs" direction="horizontal">
                  {alignmentTags.map(tag => (
                    <Badge key={tag} color={tag.includes('high-collateral') || tag.includes('no-tooling') ? 'red' : 'blue'}>{tag}</Badge>
                  ))}
                </SpaceBetween>
              </div>
            )}
          </SpaceBetween>
        </Container>
      )}

      {/* Vulnerabilities */}
      {target.vulnerabilities && target.vulnerabilities.length > 0 && (
        <div>
          <Box variant="small" color="text-body-secondary">Vulnerabilities</Box>
          <SpaceBetween size="xxs" direction="horizontal">
            {target.vulnerabilities.map(v => <Badge key={v} color="red">{v}</Badge>)}
          </SpaceBetween>
        </div>
      )}

      {/* Scoring breakdown */}
      <ColumnLayout columns={3}>
        <div>
          <Box variant="small" color="text-body-secondary">Severity Score</Box>
          <Box variant="p">{String(raw.severityScore ?? '—')}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Effort Score</Box>
          <Box variant="p">{String(raw.effortScore ?? raw.effort ?? '—')}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Assignee</Box>
          <Box variant="p">{target.assigneeId || 'Unassigned'}</Box>
        </div>
      </ColumnLayout>

      {/* Linked operations */}
      {linkedOps.length > 0 && (
        <Container header={<Header variant="h3">Linked Operations ({linkedOps.length})</Header>}>
          <SpaceBetween size="xs">
            {linkedOps.map(op => (
              <div key={op.ticketId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge color={op.severity === 'critical' ? 'red' : op.severity === 'high' ? 'red' : 'blue'}>{op.severity}</Badge>
                <span style={{ flex: 1 }}>{op.title}</span>
                <Badge color={op.status === 'completed' || op.status === 'closed' ? 'green' : 'grey'}>{op.status}</Badge>
              </div>
            ))}
          </SpaceBetween>
        </Container>
      )}

      {/* Available tools */}
      {matchingTools.length > 0 && (
        <Container header={<Header variant="h3">Available Tools ({matchingTools.length})</Header>}>
          <SpaceBetween size="xs">
            {matchingTools.map(tool => (
              <div key={tool.toolId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge color="green">{tool.category}</Badge>
                <span style={{ flex: 1, fontWeight: 600 }}>{tool.name}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{tool.successProfile?.estimatedSuccessRate ?? 0}% success</span>
              </div>
            ))}
          </SpaceBetween>
        </Container>
      )}
    </SpaceBetween>
  )
}

// ── Main Component ──────────────────────────────────────────────────

export default function TargetOverview() {
  const { isDarkMode } = useAuth()
  const [targets, setTargets] = useState<Target[]>([])
  const [operations, setOperations] = useState<Ticket[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [goals, setGoals] = useState<{ id: string; title: string; weight: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItems, setSelectedItems] = useState<Target[]>([])
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitPosition, setSplitPosition] = useState<'side' | 'bottom'>('side')

  useEffect(() => {
    let cancelled = false
    async function fetchAll() {
      try {
        const [t, ops, tl, ctx] = await Promise.allSettled([
          listTargets(),
          listTickets('type', 'red-team-operation'),
          listTools(),
          getDashboard('leadership'),
        ])
        if (cancelled) return
        if (t.status === 'fulfilled') setTargets(t.value)
        if (ops.status === 'fulfilled') setOperations(ops.value)
        if (tl.status === 'fulfilled') setTools(tl.value)
        if (ctx.status === 'fulfilled') {
          const d = ctx.value as Record<string, unknown>
          if (Array.isArray(d.goals)) {
            setGoals((d.goals as { id: string; title: string; weight: number }[]))
          }
        }
      } catch {
        // leave defaults
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [])

  const { items, collectionProps, filterProps } = useCollection(targets, {
    filtering: { empty: <Box textAlign="center">No targets found</Box> },
    sorting: { defaultState: { sortingColumn: { sortingField: 'priorityScore' }, isDescending: true } },
  })

  // Chart data
  const statusData = (() => {
    const counts: Record<string, number> = {}
    targets.forEach(t => { counts[t.status] = (counts[t.status] ?? 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  })()

  const categoryData = (() => {
    const counts: Record<string, number> = {}
    targets.forEach(t => { counts[t.category || 'other'] = (counts[t.category || 'other'] ?? 0) + 1 })
    return Object.entries(counts).map(([category, count]) => ({ category, count }))
  })()

  const criticalCount = targets.filter(t => t.priorityScore >= 80).length
  const highCount = targets.filter(t => t.priorityScore >= 50 && t.priorityScore < 80).length
  const activeOps = operations.filter(o => !['completed', 'closed', 'cancelled'].includes(o.status)).length
  const avgScore = targets.length > 0 ? Math.round(targets.reduce((sum, t) => sum + t.priorityScore, 0) / targets.length) : 0

  const selectedTarget = selectedItems[0] ?? null

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading target overview...</Box>
      </Box>
    )
  }

  const mainContent = (
    <SpaceBetween size="l">
      {/* Summary cards */}
      <ColumnLayout columns={4}>
        <Container>
          <SpaceBetween size="xxs">
            <Box variant="small" color="text-body-secondary">Total Targets</Box>
            <Box variant="h1" tagOverride="div">{targets.length}</Box>
            <Box variant="small" color="text-body-secondary">{tools.length} tools available</Box>
          </SpaceBetween>
        </Container>
        <Container>
          <SpaceBetween size="xxs">
            <Box variant="small" color="text-body-secondary">Critical Priority</Box>
            <Box variant="h1" tagOverride="div" color="text-status-error">{criticalCount}</Box>
            <Box variant="small" color="text-body-secondary">Score 80+</Box>
          </SpaceBetween>
        </Container>
        <Container>
          <SpaceBetween size="xxs">
            <Box variant="small" color="text-body-secondary">Active Operations</Box>
            <Box variant="h1" tagOverride="div">{activeOps}</Box>
            <Box variant="small" color="text-body-secondary">{operations.length} total</Box>
          </SpaceBetween>
        </Container>
        <Container>
          <SpaceBetween size="xxs">
            <Box variant="small" color="text-body-secondary">Avg Priority Score</Box>
            <Box variant="h1" tagOverride="div">{avgScore}</Box>
            <Box variant="small" color="text-body-secondary">{highCount} high priority (50-79)</Box>
          </SpaceBetween>
        </Container>
      </ColumnLayout>

      {/* Charts */}
      <ColumnLayout columns={2}>
        <Container header={<Header variant="h2">Targets by Status</Header>}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                {statusData.map((entry, i) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Container>
        <Container header={<Header variant="h2">Targets by Category</Header>}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categoryData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#414d5c' : '#d1d5db'} />
              <XAxis dataKey="category" tick={{ fill: isDarkMode ? '#b4b8bf' : '#687078', fontSize: 12 }} />
              <YAxis tick={{ fill: isDarkMode ? '#b4b8bf' : '#687078', fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {categoryData.map((_entry, i) => (
                  <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Container>
      </ColumnLayout>

      {/* Target table */}
      <Container
        header={
          <Header variant="h2" counter={`(${targets.length})`} description="All targets across OSINT and Red Team domains, sorted by priority score">
            All Targets
          </Header>
        }
      >
        <SpaceBetween size="m">
          <TextFilter {...filterProps} filteringPlaceholder="Filter targets" />
          <Table
            {...collectionProps}
            items={items}
            selectionType="single"
            selectedItems={selectedItems}
            onSelectionChange={({ detail }) => {
              setSelectedItems(detail.selectedItems)
              setSplitOpen(detail.selectedItems.length > 0)
            }}
            columnDefinitions={[
              { id: 'name', header: 'Name', sortingField: 'name', cell: item => <Box fontWeight="bold">{item.name || 'Enriching...'}</Box>, width: 260 },
              { id: 'status', header: 'Status', sortingField: 'status', cell: item => statusBadge(item.status), width: 110 },
              {
                id: 'priority', header: 'Priority', sortingField: 'priorityScore',
                cell: item => <ProgressBar value={item.priorityScore} additionalInfo={`${item.priorityScore}/100`} />,
                width: 180,
              },
              { id: 'category', header: 'Category', sortingField: 'category', cell: item => item.category || '—', width: 120 },
              {
                id: 'vulns', header: 'Vulnerabilities',
                cell: item => (
                  <SpaceBetween size="xxs" direction="horizontal">
                    {(item.vulnerabilities ?? []).slice(0, 2).map(v => <Badge key={v} color="red">{v}</Badge>)}
                    {(item.vulnerabilities ?? []).length > 2 && <Badge color="grey">+{item.vulnerabilities.length - 2}</Badge>}
                  </SpaceBetween>
                ),
                width: 220,
              },
              {
                id: 'ops', header: 'Ops',
                cell: item => {
                  const count = operations.filter(op => op.targetId === item.targetId).length
                  return count > 0 ? <Badge color="blue">{count}</Badge> : <Box color="text-body-secondary">—</Box>
                },
                width: 70,
              },
              {
                id: 'tools', header: 'Tools',
                cell: item => {
                  const catLower = (item.category || '').toLowerCase()
                  const count = tools.filter(tool =>
                    (tool.targetTypes ?? []).some(tt => tt.toLowerCase() === catLower || (tt === 'web' && catLower === 'application'))
                  ).length
                  return count > 0 ? <Badge color="green">{count}</Badge> : <Box color="text-body-secondary">—</Box>
                },
                width: 70,
              },
              { id: 'assignee', header: 'Assignee', cell: item => item.assigneeId ?? <Box color="text-body-secondary">Unassigned</Box>, width: 120 },
              { id: 'created', header: 'Created', cell: item => formatDate(item.createdAt), width: 100 },
            ]}
            variant="embedded"
            empty={<Box textAlign="center">No targets found</Box>}
          />
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  )

  return (
    <ContentLayout header={<Header variant="h1">Target Overview</Header>}>
      <AppLayout
        content={mainContent}
        splitPanel={
          selectedTarget ? (
            <SplitPanel header={selectedTarget.name || 'Target Details'} closeBehavior="hide">
              <TargetDetailPanel target={selectedTarget} operations={operations} tools={tools} goals={goals} />
            </SplitPanel>
          ) : undefined
        }
        splitPanelOpen={splitOpen}
        onSplitPanelToggle={({ detail }) => setSplitOpen(detail.open)}
        splitPanelPreferences={{ position: splitPosition }}
        onSplitPanelPreferencesChange={({ detail }) => setSplitPosition(detail.position)}
        ariaLabels={{} as Record<string, string>}
        navigationHide
        toolsHide
        headerSelector="#top-nav"
        disableContentPaddings
      />
    </ContentLayout>
  )
}
