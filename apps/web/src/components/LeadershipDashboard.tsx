import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import Box from '@cloudscape-design/components/box'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Badge from '@cloudscape-design/components/badge'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Alert from '@cloudscape-design/components/alert'
import Spinner from '@cloudscape-design/components/spinner'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAuth } from '@/App'
import { getDashboard } from '@/utils/api'

interface ActivityItem {
  id: string
  domain: 'osint' | 'red-team'
  text: string
  timestamp: number
}

const MOCK_ACTIVITY: ActivityItem[] = [
  { id: 'a-01', domain: 'red-team', text: 'RT-001: ProxyLogon exploitation completed successfully', timestamp: Date.now() - 1800000 },
  { id: 'a-02', domain: 'osint', text: 'New Shodan scan uploaded: meridian-defense.com (47 hosts)', timestamp: Date.now() - 3600000 },
  { id: 'a-03', domain: 'red-team', text: 'Target t-008 (Kubernetes API) moved to approved', timestamp: Date.now() - 7200000 },
  { id: 'a-04', domain: 'osint', text: 'Investigation INV-012: SQL injection on portal confirmed', timestamp: Date.now() - 10800000 },
  { id: 'a-05', domain: 'red-team', text: 'Nmap deep scan of database subnet completed (6 open ports)', timestamp: Date.now() - 14400000 },
  { id: 'a-06', domain: 'osint', text: 'CVE-2024-21762 matched to vpn.meridian-defense.com', timestamp: Date.now() - 18000000 },
  { id: 'a-07', domain: 'red-team', text: 'Redis no-auth access confirmed, data exfil test passed', timestamp: Date.now() - 21600000 },
  { id: 'a-08', domain: 'osint', text: 'New Nmap XML uploaded: internal-subnet-scan.xml (128 hosts)', timestamp: Date.now() - 25200000 },
  { id: 'a-09', domain: 'red-team', text: 'Jenkins CLI exploit attempt failed - patched version detected', timestamp: Date.now() - 28800000 },
  { id: 'a-10', domain: 'osint', text: 'Investigation INV-008 closed: DNS zone transfer mitigated', timestamp: Date.now() - 32400000 },
]

const MOCK_STATUS_DISTRIBUTION = [
  { name: 'Active', value: 3 },
  { name: 'Investigating', value: 4 },
  { name: 'Triaging', value: 2 },
  { name: 'Completed', value: 5 },
  { name: 'Closed', value: 2 },
]

const MOCK_METRICS = {
  osintInvestigations: 12,
  osintDescription: '8 active, 4 closed',
  redTeamOperations: 5,
  rtDescription: '3 active, 2 completed',
  criticalFindings: 7,
  criticalDescription: 'Across both domains',
  teamUtilization: '78%',
  teamDescription: '3 of 4 analysts active',
}

const PIE_COLORS = ['#e8001c', '#0972d3', '#f89256', '#29a368', '#8c8c8c']

function MetricCard({ title, value, description }: { title: string; value: string | number; description?: string }) {
  return (
    <Container>
      <SpaceBetween size="xxs">
        <Box variant="small" color="text-body-secondary">{title}</Box>
        <Box variant="h1" tagOverride="div">{value}</Box>
        {description && <Box variant="small" color="text-body-secondary">{description}</Box>}
      </SpaceBetween>
    </Container>
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
  const { isDarkMode } = useAuth()
  const [metrics, setMetrics] = useState(MOCK_METRICS)
  const [activity, setActivity] = useState<ActivityItem[]>(MOCK_ACTIVITY)
  const [statusDistribution, setStatusDistribution] = useState(MOCK_STATUS_DISTRIBUTION)
  const [loading, setLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const dashboard = await getDashboard('leadership')
        if (cancelled) return

        if (dashboard) {
          const d = dashboard
          setMetrics({
            osintInvestigations: (d.osintInvestigations as number) ?? MOCK_METRICS.osintInvestigations,
            osintDescription: (d.osintDescription as string) ?? MOCK_METRICS.osintDescription,
            redTeamOperations: (d.redTeamOperations as number) ?? MOCK_METRICS.redTeamOperations,
            rtDescription: (d.rtDescription as string) ?? MOCK_METRICS.rtDescription,
            criticalFindings: (d.criticalFindings as number) ?? MOCK_METRICS.criticalFindings,
            criticalDescription: (d.criticalDescription as string) ?? MOCK_METRICS.criticalDescription,
            teamUtilization: (d.teamUtilization as string) ?? MOCK_METRICS.teamUtilization,
            teamDescription: (d.teamDescription as string) ?? MOCK_METRICS.teamDescription,
          })
          if (Array.isArray(d.recentActivity)) {
            setActivity(d.recentActivity as ActivityItem[])
          }
          if (Array.isArray(d.statusDistribution)) {
            setStatusDistribution(d.statusDistribution as typeof MOCK_STATUS_DISTRIBUTION)
          }
        } else {
          setUsingMock(true)
        }
      } catch {
        if (!cancelled) setUsingMock(true)
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
        {usingMock && (
          <Alert type="info" dismissible>
            Using demo data — backend not yet connected
          </Alert>
        )}

        <ColumnLayout columns={4}>
          <MetricCard title="OSINT Investigations" value={metrics.osintInvestigations} description={metrics.osintDescription} />
          <MetricCard title="Red Team Operations" value={metrics.redTeamOperations} description={metrics.rtDescription} />
          <MetricCard title="Critical Findings" value={metrics.criticalFindings} description={metrics.criticalDescription} />
          <MetricCard title="Team Utilization" value={metrics.teamUtilization} description={metrics.teamDescription} />
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
      </SpaceBetween>
    </ContentLayout>
  )
}
