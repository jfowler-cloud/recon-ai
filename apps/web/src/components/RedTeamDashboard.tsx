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
import { getDashboard, listTargets } from '@/utils/api'
import type { Target } from '@/types'

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
