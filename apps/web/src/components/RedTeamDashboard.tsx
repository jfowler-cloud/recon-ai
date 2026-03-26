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
import Alert from '@cloudscape-design/components/alert'
import Spinner from '@cloudscape-design/components/spinner'
import { getDashboard, listTargets } from '@/utils/api'
import type { Target } from '@/types'

const MOCK_TARGETS: Target[] = [
  { targetId: 't-001', name: 'Exchange Server (ProxyLogon)', description: 'CVE-2021-26855 on mail.meridian-defense.com', status: 'approved', priorityScore: 95, category: 'Web Server', vulnerabilities: ['CVE-2021-26855', 'CVE-2021-27065'], assigneeId: 'analyst-1', createdAt: Date.now() - 86400000 },
  { targetId: 't-002', name: 'Jenkins CI (Exposed CLI)', description: 'Unauthenticated Jenkins CLI on ci.meridian-defense.com:8080', status: 'in-progress', priorityScore: 88, category: 'CI/CD', vulnerabilities: ['CVE-2024-23897', 'CVE-2019-1003000'], assigneeId: 'analyst-2', createdAt: Date.now() - 172800000 },
  { targetId: 't-003', name: 'Redis Instance (No Auth)', description: 'Exposed Redis 6.2 on 10.0.5.40:6379 with no password', status: 'queued', priorityScore: 82, category: 'Database', vulnerabilities: ['CWE-306', 'CVE-2022-24735'], createdAt: Date.now() - 259200000 },
  { targetId: 't-004', name: 'VPN Gateway (Fortinet)', description: 'FortiOS SSL VPN pre-auth RCE on vpn.meridian-defense.com', status: 'approved', priorityScore: 91, category: 'Network', vulnerabilities: ['CVE-2024-21762', 'CVE-2023-27997'], assigneeId: 'analyst-1', createdAt: Date.now() - 345600000 },
  { targetId: 't-005', name: 'PostgreSQL (Weak Creds)', description: 'PostgreSQL 14 on db-prod.meridian-defense.com with default creds', status: 'queued', priorityScore: 76, category: 'Database', vulnerabilities: ['CWE-521', 'CWE-798'], createdAt: Date.now() - 432000000 },
]

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

function statusBadge(status: string) {
  const colorMap: Record<string, 'blue' | 'green' | 'red' | 'grey'> = {
    queued: 'grey',
    approved: 'blue',
    'in-progress': 'red',
    completed: 'green',
    deferred: 'grey',
  }
  return <Badge color={colorMap[status] ?? 'grey'}>{status}</Badge>
}

export default function RedTeamDashboard() {
  const [targets, setTargets] = useState<Target[]>([])
  const [activeOps, setActiveOps] = useState(0)
  const [toolActionsToday, setToolActionsToday] = useState(0)
  const [loading, setLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      try {
        const [dashResult, targetsResult] = await Promise.allSettled([
          getDashboard('red-team-analyst'),
          listTargets(),
        ])

        if (cancelled) return

        let usedMock = false

        if (targetsResult.status === 'fulfilled' && targetsResult.value.length > 0) {
          setTargets(targetsResult.value)
        } else {
          if (targetsResult.status === 'rejected') usedMock = true
          setTargets(MOCK_TARGETS)
        }

        if (dashResult.status === 'fulfilled' && dashResult.value) {
          const d = dashResult.value
          setActiveOps((d.activeOperations as number) ?? 3)
          setToolActionsToday((d.toolActionsToday as number) ?? 17)
        } else {
          usedMock = true
          setActiveOps(3)
          setToolActionsToday(17)
        }

        setUsingMock(usedMock)
      } catch {
        if (!cancelled) {
          setTargets(MOCK_TARGETS)
          setActiveOps(3)
          setToolActionsToday(17)
          setUsingMock(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [])

  const topTargets = [...targets].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5)
  const avgScore = targets.length > 0 ? Math.round(targets.reduce((s, t) => s + t.priorityScore, 0) / targets.length) : 0

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading dashboard...</Box>
      </Box>
    )
  }

  return (
    <ContentLayout header={<Header variant="h1">Red Team Dashboard</Header>}>
      <SpaceBetween size="l">
        {usingMock && (
          <Alert type="info" dismissible>
            Using demo data — backend not yet connected
          </Alert>
        )}

        <ColumnLayout columns={4}>
          <MetricCard title="Priority Targets" value={targets.length} description="Total queued and approved" />
          <MetricCard title="Active Operations" value={activeOps} description="Currently running" />
          <MetricCard title="Tool Actions Today" value={toolActionsToday} description="Nmap, Metasploit, etc." />
          <MetricCard title="Avg Priority Score" value={avgScore} description="Across all targets" />
        </ColumnLayout>

        <Container header={<Header variant="h2">Top Priority Targets</Header>}>
          <Table
            items={topTargets}
            columnDefinitions={[
              { id: 'rank', header: '#', cell: (item: Target) => topTargets.indexOf(item) + 1, width: 50 },
              { id: 'name', header: 'Name', cell: item => item.name, width: 280 },
              {
                id: 'status', header: 'Status', cell: item => statusBadge(item.status), width: 120,
              },
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
                    {item.vulnerabilities.slice(0, 2).map((v: string) => <Badge key={v} color="red">{v}</Badge>)}
                    {item.vulnerabilities.length > 2 && <Badge color="grey">+{item.vulnerabilities.length - 2}</Badge>}
                  </SpaceBetween>
                ),
              },
            ]}
            variant="embedded"
            empty={<Box textAlign="center">No targets found</Box>}
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  )
}
