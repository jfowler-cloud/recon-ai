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

      {(target as Record<string, unknown>).plainTextGoal && (
        <div>
          <Box variant="small" color="text-body-secondary">ORIGINAL GOAL</Box>
          <Box variant="p">{String((target as Record<string, unknown>).plainTextGoal)}</Box>
        </div>
      )}

      {(target as Record<string, unknown>).goalAlignment && (
        <div>
          <Box variant="small" color="text-body-secondary">GOAL ALIGNMENT</Box>
          <Box variant="p">
            {Array.isArray((target as Record<string, unknown>).goalAlignment)
              ? ((target as Record<string, unknown>).goalAlignment as string[]).join(', ')
              : String((target as Record<string, unknown>).goalAlignment)}
          </Box>
        </div>
      )}

      {(target as Record<string, unknown>).alignmentTags && (
        <div>
          <Box variant="small" color="text-body-secondary">ALIGNMENT TAGS</Box>
          <SpaceBetween size="xxs" direction="horizontal">
            {(Array.isArray((target as Record<string, unknown>).alignmentTags)
              ? (target as Record<string, unknown>).alignmentTags as string[]
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
          <Box variant="p">{String((target as Record<string, unknown>).severityScore ?? '—')}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Effort Score</Box>
          <Box variant="p">{String((target as Record<string, unknown>).effortScore ?? (target as Record<string, unknown>).effort ?? '—')}</Box>
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
  const [targets, setTargets] = useState<Target[]>([])
  const [selectedItems, setSelectedItems] = useState<Target[]>([])
  const [activeOps, setActiveOps] = useState(0)
  const [toolActionsToday, setToolActionsToday] = useState(0)
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
        <MetricCard title="Priority Targets" value={targets.length} description="Total queued and active" />
        <MetricCard title="Active Operations" value={activeOps} description="Currently running" />
        <MetricCard title="Total Tickets" value={toolActionsToday} description="Investigations + operations" />
        <MetricCard title="Avg Priority Score" value={avgScore} description="Across all targets" />
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
        ariaLabels={{ splitPanelPreferencesConfirm: 'Confirm', splitPanelPreferencesCancel: 'Cancel' }}
        navigationHide
        toolsHide
        headerSelector="#top-nav"
        disableContentPaddings
      />
    </ContentLayout>
  )
}
