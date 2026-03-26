import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import Box from '@cloudscape-design/components/box'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Table from '@cloudscape-design/components/table'
import Badge from '@cloudscape-design/components/badge'
import ProgressBar from '@cloudscape-design/components/progress-bar'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import SplitPanel from '@cloudscape-design/components/split-panel'
import AppLayout from '@cloudscape-design/components/app-layout'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import { useAuth } from '@/App'
import { getDashboard, listTargets } from '@/utils/api'
import type { Target } from '@/types'

const PIE_COLORS = ['#e8001c', '#0972d3', '#f89256', '#29a368', '#8c8c8c', '#a78bfa']

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#d91515',
  high: '#f89256',
  medium: '#0972d3',
  low: '#2ea597',
}

function MetricCard({ title, value, description, onClick, linkText }: { title: string; value: string | number; description?: string; onClick?: () => void; linkText?: string }) {
  return (
    <div onClick={onClick} className={onClick ? 'metric-card-link' : undefined}>
      <Container>
        <SpaceBetween size="xxs">
          <Box variant="small" color="text-body-secondary">{title}</Box>
          <Box variant="h1" tagOverride="div">{value}</Box>
          {description && <Box variant="small" color="text-body-secondary">{description}</Box>}
          {linkText && <span className="metric-link-hint" style={{ color: '#0972d3', fontSize: 12 }}>{linkText} →</span>}
        </SpaceBetween>
      </Container>
    </div>
  )
}

function statusBadge(status: string) {
  const colorMap: Record<string, 'blue' | 'green' | 'red' | 'grey'> = {
    queued: 'grey',
    enriched: 'blue',
    active: 'blue',
    in_progress: 'red',
    completed: 'green',
    cancelled: 'grey',
  }
  return <Badge color={colorMap[status] ?? 'grey'}>{status}</Badge>
}

function formatDate(ts: number | string): string {
  const n = typeof ts === 'string' ? Number(ts) : ts
  if (!n || isNaN(n)) return '—'
  return new Date(n * 1000).toLocaleDateString()
}

function TargetDetail({ target }: { target: Target }) {
  return (
    <SpaceBetween size="m">
      <div>
        <Box variant="h3">{target.name || 'Unnamed Target'}</Box>
        <Box variant="small" color="text-body-secondary">{target.targetId}</Box>
      </div>

      <ColumnLayout columns={3}>
        <div>
          <Box variant="small" color="text-body-secondary">Status</Box>
          <div style={{ marginTop: 4 }}>{statusBadge(target.status)}</div>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Priority Score</Box>
          <Box variant="p" fontWeight="bold">{target.priorityScore}/100</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Category</Box>
          <Box variant="p">{target.category || '—'}</Box>
        </div>
      </ColumnLayout>

      {target.description && (
        <div>
          <Box variant="small" color="text-body-secondary">DESCRIPTION</Box>
          <Box variant="p">{target.description}</Box>
        </div>
      )}

      {!!(target as unknown as Record<string, unknown>).plainTextGoal && (
        <div>
          <Box variant="small" color="text-body-secondary">ORIGINAL GOAL</Box>
          <Box variant="p">{String((target as unknown as Record<string, unknown>).plainTextGoal)}</Box>
        </div>
      )}

      {!!(target as unknown as Record<string, unknown>).goalAlignment && (
        <div>
          <Box variant="small" color="text-body-secondary">GOAL ALIGNMENT</Box>
          <Box variant="p">
            {Array.isArray((target as unknown as Record<string, unknown>).goalAlignment)
              ? ((target as unknown as Record<string, unknown>).goalAlignment as string[]).join(', ')
              : String((target as unknown as Record<string, unknown>).goalAlignment)}
          </Box>
        </div>
      )}

      {!!(target as unknown as Record<string, unknown>).alignmentTags && (
        <div>
          <Box variant="small" color="text-body-secondary">ALIGNMENT TAGS</Box>
          <SpaceBetween size="xxs" direction="horizontal">
            {(Array.isArray((target as unknown as Record<string, unknown>).alignmentTags)
              ? (target as unknown as Record<string, unknown>).alignmentTags as string[]
              : []
            ).map((tag: string) => (
              <Badge key={tag} color={tag.includes('high-collateral') || tag.includes('no-tooling') ? 'red' : 'blue'}>{tag}</Badge>
            ))}
          </SpaceBetween>
        </div>
      )}

      {target.vulnerabilities && target.vulnerabilities.length > 0 && (
        <div>
          <Box variant="small" color="text-body-secondary">VULNERABILITIES</Box>
          <SpaceBetween size="xxs" direction="horizontal">
            {target.vulnerabilities.map((v: string) => <Badge key={v} color="red">{v}</Badge>)}
          </SpaceBetween>
        </div>
      )}

      <ColumnLayout columns={3}>
        <div>
          <Box variant="small" color="text-body-secondary">Severity Score</Box>
          <Box variant="p">{String((target as unknown as Record<string, unknown>).severityScore ?? '—')}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Effort Score</Box>
          <Box variant="p">{String((target as unknown as Record<string, unknown>).effortScore ?? (target as unknown as Record<string, unknown>).effort ?? '—')}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Created</Box>
          <Box variant="p">{formatDate(target.createdAt)}</Box>
        </div>
      </ColumnLayout>

      {target.assigneeId && (
        <div>
          <Box variant="small" color="text-body-secondary">ASSIGNED TO</Box>
          <Box variant="p">{target.assigneeId}</Box>
        </div>
      )}
    </SpaceBetween>
  )
}

export default function RedTeamDashboard() {
  const { navigate } = useAuth()
  const [targets, setTargets] = useState<Target[]>([])
  const [selectedItems, setSelectedItems] = useState<Target[]>([])
  const [activeOps, setActiveOps] = useState(0)
  const [toolActionsToday, setToolActionsToday] = useState(0)
  const [severityData, setSeverityData] = useState<{ severity: string; count: number; color: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitPosition, setSplitPosition] = useState<'side' | 'bottom'>('side')

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      try {
        const [dashResult, targetsResult] = await Promise.allSettled([
          getDashboard('red-team-analyst'),
          listTargets(),
        ])

        if (cancelled) return

        if (targetsResult.status === 'fulfilled') {
          setTargets(targetsResult.value)
        } else {
          setTargets([])
        }

        if (dashResult.status === 'fulfilled' && dashResult.value) {
          const d = dashResult.value
          const byStatus = (d.tickets as Record<string, unknown>)?.byStatus as Record<string, number> | undefined
          const active = (byStatus?.active ?? 0) + (byStatus?.in_progress ?? 0)
          setActiveOps(active)
          setToolActionsToday(((d.tickets as Record<string, unknown>)?.total as number) ?? 0)

          const bySeverity = (d.tickets as Record<string, unknown>)?.bySeverity as Record<string, number> | undefined
          if (bySeverity) {
            setSeverityData(
              Object.entries(bySeverity).map(([severity, count]) => ({
                severity: severity.charAt(0).toUpperCase() + severity.slice(1),
                count,
                color: SEVERITY_COLORS[severity] ?? '#879596',
              }))
            )
          }
        }
      } catch {
        if (!cancelled) {
          setTargets([])
          setActiveOps(0)
          setToolActionsToday(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [])

  const topTargets = [...targets].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 10)
  const avgScore = targets.length > 0 ? Math.round(targets.reduce((s, t) => s + t.priorityScore, 0) / targets.length) : 0

  // Compute target status distribution for pie chart
  const statusDistribution = (() => {
    const counts: Record<string, number> = {}
    targets.forEach(t => { counts[t.status] = (counts[t.status] ?? 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
      value,
    }))
  })()
  const selectedTarget = selectedItems[0] ?? null

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading dashboard...</Box>
      </Box>
    )
  }

  const mainContent = (
    <SpaceBetween size="l">
      <ColumnLayout columns={4}>
        <MetricCard title="Priority Targets" value={targets.length} description="Total queued and active" onClick={() => navigate('redteam-targets')} linkText="View targets" />
        <MetricCard title="Active Operations" value={activeOps} description="Currently running" onClick={() => navigate('redteam-operations')} linkText="View operations" />
        <MetricCard title="Total Tickets" value={toolActionsToday} description="Investigations + operations" onClick={() => navigate('redteam-operations')} linkText="View tickets" />
        <MetricCard title="Avg Priority Score" value={avgScore} description="Across all targets" onClick={() => navigate('redteam-targets')} linkText="View targets" />
      </ColumnLayout>

      <ColumnLayout columns={2}>
        <Container header={<Header variant="h2">Target Status Distribution</Header>}>
          {statusDistribution.length === 0 ? (
            <div className="chart-empty">No target data available yet</div>
          ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {statusDistribution.map((_entry, index) => (
                    <Cell key={`status-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          )}
        </Container>

        <Container header={<Header variant="h2">Tickets by Severity</Header>}>
          {severityData.length === 0 ? (
            <div className="chart-empty">No ticket data available yet</div>
          ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={severityData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border-divider-default, #414d5c)"
                />
                <XAxis
                  dataKey="severity"
                  tick={{ fill: 'var(--color-text-body-secondary, #b4b8bf)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--color-border-divider-default, #414d5c)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-body-secondary, #b4b8bf)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--color-border-divider-default, #414d5c)' }}
                />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </Container>
      </ColumnLayout>

      <Container header={<Header variant="h2">Top Priority Targets</Header>}>
        <Table
          items={topTargets}
          selectionType="single"
          selectedItems={selectedItems}
          onSelectionChange={({ detail }) => {
            setSelectedItems(detail.selectedItems)
            setSplitOpen(detail.selectedItems.length > 0)
          }}
          columnDefinitions={[
            { id: 'rank', header: '#', cell: (item: Target) => topTargets.indexOf(item) + 1, width: 50 },
            { id: 'name', header: 'Name', cell: item => item.name || 'Enriching...', width: 280 },
            { id: 'status', header: 'Status', cell: item => statusBadge(item.status), width: 120 },
            {
              id: 'priority', header: 'Priority Score',
              cell: item => <ProgressBar value={item.priorityScore} additionalInfo={`${item.priorityScore}/100`} />,
              width: 180,
            },
            { id: 'category', header: 'Category', cell: item => item.category },
            {
              id: 'vulns', header: 'Vulnerabilities',
              cell: item => (
                <SpaceBetween size="xxs" direction="horizontal">
                  {(item.vulnerabilities ?? []).slice(0, 2).map((v: string) => <Badge key={v} color="red">{v}</Badge>)}
                  {(item.vulnerabilities ?? []).length > 2 && <Badge color="grey">+{item.vulnerabilities.length - 2}</Badge>}
                </SpaceBetween>
              ),
            },
          ]}
          variant="embedded"
          empty={<Box textAlign="center">No targets found</Box>}
        />
      </Container>
    </SpaceBetween>
  )

  return (
    <ContentLayout header={<Header variant="h1">Red Team Dashboard</Header>}>
      <AppLayout
        content={mainContent}
        splitPanel={
          selectedTarget ? (
            <SplitPanel
              header={selectedTarget.name || 'Target Details'}
              closeBehavior="hide"
            >
              <TargetDetail target={selectedTarget} />
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
