import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import Box from '@cloudscape-design/components/box'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Badge from '@cloudscape-design/components/badge'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useAuth } from '@/App'
import { getDashboard } from '@/utils/api'

interface ActivityItem {
  id: string
  domain: 'osint' | 'red-team'
  text: string
  timestamp: number
}

const DEFAULT_METRICS = {
  osintInvestigations: 0,
  osintDescription: '',
  redTeamOperations: 0,
  rtDescription: '',
  criticalFindings: 0,
  criticalDescription: '',
  teamUtilization: '0%',
  teamDescription: '',
}

const PIE_COLORS = ['#e8001c', '#0972d3', '#f89256', '#29a368', '#8c8c8c']
const TYPE_COLORS = ['#e8001c', '#0972d3', '#f89256']

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

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function LeadershipDashboard() {
  const { isDarkMode, navigate } = useAuth()
  const [metrics, setMetrics] = useState(DEFAULT_METRICS)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [statusDistribution, setStatusDistribution] = useState<{ name: string; value: number }[]>([])
  const [typeData, setTypeData] = useState<{ type: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const dashboard = await getDashboard('leadership')
        if (cancelled) return

        if (dashboard) {
          const d = dashboard
          const uploads = d.uploads as Record<string, unknown> | undefined
          const tickets = d.tickets as Record<string, unknown> | undefined
          const byStatus = tickets?.byStatus as Record<string, number> | undefined
          const bySeverity = tickets?.bySeverity as Record<string, number> | undefined
          const targets = d.targets as Record<string, unknown> | undefined

          // Count non-closed tickets as active investigations/operations
          const totalTickets = (tickets?.total as number) ?? 0
          const closedTickets = byStatus?.closed ?? 0
          const activeTickets = totalTickets - closedTickets

          setMetrics({
            osintInvestigations: (uploads?.total as number) ?? 0,
            osintDescription: `${activeTickets} active tickets`,
            redTeamOperations: (targets?.total as number) ?? 0,
            rtDescription: `${byStatus?.active ?? 0} active`,
            criticalFindings: bySeverity?.critical ?? 0,
            criticalDescription: 'Across both domains',
            teamUtilization: `${totalTickets}`,
            teamDescription: 'Total tickets',
          })

          // Build activity from recentTickets
          const recentTickets = d.recentTickets as Array<Record<string, unknown>> | undefined
          if (Array.isArray(recentTickets)) {
            setActivity(recentTickets.map((t, i) => ({
              id: (t.ticketId as string) ?? `a-${i}`,
              domain: ((t.ticketType as string) ?? '').includes('red-team') ? 'red-team' as const : 'osint' as const,
              text: `${t.ticketId}: ${t.title}`,
              timestamp: (t.updatedAt as number) ?? (t.createdAt as number) ?? Date.now(),
            })))
          }

          // Build tickets by type chart data
          const byType = tickets?.byType as Record<string, number> | undefined
          if (byType) {
            setTypeData(
              Object.entries(byType).map(([type, count]) => ({
                type: type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                count,
              }))
            )
          }

          // Build status distribution from byStatus
          if (byStatus) {
            setStatusDistribution(
              Object.entries(byStatus).map(([name, value]) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                value,
              }))
            )
          }
        }
      } catch {
        // Leave defaults on error
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading dashboard...</Box>
      </Box>
    )
  }

  return (
    <ContentLayout header={<Header variant="h1">Leadership Dashboard</Header>}>
      <SpaceBetween size="l">
        <ColumnLayout columns={4}>
          <MetricCard title="OSINT Investigations" value={metrics.osintInvestigations} description={metrics.osintDescription} onClick={() => navigate('osint-investigations')} linkText="View investigations" />
          <MetricCard title="Red Team Operations" value={metrics.redTeamOperations} description={metrics.rtDescription} onClick={() => navigate('redteam-operations')} linkText="View operations" />
          <MetricCard title="Critical Findings" value={metrics.criticalFindings} description={metrics.criticalDescription} onClick={() => navigate('osint-investigations')} linkText="View findings" />
          <MetricCard title="Team Utilization" value={metrics.teamUtilization} description={metrics.teamDescription} onClick={() => navigate('leadership-targets')} linkText="View targets" />
        </ColumnLayout>

        <ColumnLayout columns={2}>
          <Container header={<Header variant="h2">Recent Activity</Header>}>
            <SpaceBetween size="xs">
              {activity.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${isDarkMode ? '#2d3139' : '#e9ebed'}` }}>
                  <Badge color={item.domain === 'osint' ? 'blue' : 'red'}>{item.domain === 'osint' ? 'OSINT' : 'RT'}</Badge>
                  <div style={{ flex: 1 }}>
                    <Box variant="small">{item.text}</Box>
                    <Box variant="small" color="text-body-secondary">{formatRelativeTime(item.timestamp)}</Box>
                  </div>
                </div>
              ))}
            </SpaceBetween>
          </Container>

          <Container header={<Header variant="h2">Operations Status</Header>}>
            <ResponsiveContainer width="100%" height={300}>
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
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Container>
        </ColumnLayout>

        <Container header={<Header variant="h2">Tickets by Type</Header>}>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={typeData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border-divider-default, #414d5c)"
                />
                <XAxis
                  dataKey="type"
                  tick={{ fill: 'var(--color-text-body-secondary, #b4b8bf)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--color-border-divider-default, #414d5c)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-body-secondary, #b4b8bf)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--color-border-divider-default, #414d5c)' }}
                />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {typeData.map((_entry, index) => (
                    <Cell key={index} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  )
}
