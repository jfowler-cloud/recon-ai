import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Box from '@cloudscape-design/components/box'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import StatusIndicator from '@cloudscape-design/components/status-indicator'
import Table from '@cloudscape-design/components/table'
import Icon from '@cloudscape-design/components/icon'
import Spinner from '@cloudscape-design/components/spinner'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import { useAuth } from '@/App'
import { getDashboard, listUploads } from '@/utils/api'
import type { Upload } from '@/types'

// ── Severity colors ──────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#d91515',
  high: '#f89256',
  medium: '#0972d3',
  low: '#2ea597',
  info: '#879596',
}

const DEFAULT_METRICS = {
  uploadsToday: 0,
  activeInvestigations: 0,
  criticalFindings: 0,
  pendingIngestion: 0,
}

const DEFAULT_SEVERITY_DATA: { severity: string; count: number; color: string }[] = []

const SOURCE_TYPE_COLORS = ['#e8001c', '#0972d3', '#f89256', '#29a368', '#8c8c8c', '#a78bfa']

// ── Metric card component ────────────────────────────────────────────

function MetricCard({ label, value, icon, statusType, onClick, linkText }: {
  label: string
  value: number | string
  icon: string
  statusType: 'error' | 'warning' | 'info' | 'success'
  onClick?: () => void
  linkText?: string
}) {
  return (
    <div onClick={onClick} className={onClick ? 'metric-card-link' : undefined}>
      <Container>
        <SpaceBetween size="xs">
          <Box variant="awsui-key-label">
            <SpaceBetween direction="horizontal" size="xs">
              <Icon name={icon as Parameters<typeof Icon>[0]['name']} />
              <span>{label}</span>
            </SpaceBetween>
          </Box>
          <Box variant="awsui-value-large">{value}</Box>
          <SpaceBetween direction="horizontal" size="xs">
            <StatusIndicator type={statusType}>
              {statusType === 'error' ? 'Requires attention' :
               statusType === 'warning' ? 'In progress' :
               statusType === 'info' ? 'Monitoring' : 'On track'}
            </StatusIndicator>
            {linkText && <span className="metric-link-hint" style={{ color: '#0972d3' }}>{linkText} →</span>}
          </SpaceBetween>
        </SpaceBetween>
      </Container>
    </div>
  )
}

// ── Status indicator for upload status ───────────────────────────────

function UploadStatusCell({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <StatusIndicator type="success">Completed</StatusIndicator>
    case 'processing': return <StatusIndicator type="in-progress">Processing</StatusIndicator>
    case 'failed': return <StatusIndicator type="error">Failed</StatusIndicator>
    default: return <StatusIndicator type="info">{status}</StatusIndicator>
  }
}

// ── Custom tooltip for the bar chart ─────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--color-background-container-content, #1a2332)',
      border: '1px solid var(--color-border-divider-default, #414d5c)',
      borderRadius: 8,
      padding: '8px 12px',
    }}>
      <Box variant="small" fontWeight="bold">{label}</Box>
      <Box variant="small" color="text-body-secondary">{payload[0].value} findings</Box>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────

export default function OsintDashboard() {
  const { navigate } = useAuth()
  const [metrics, setMetrics] = useState(DEFAULT_METRICS)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [severityData, setSeverityData] = useState(DEFAULT_SEVERITY_DATA)
  const [sourceTypeData, setSourceTypeData] = useState<{ name: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      try {
        const [dashboardResult, uploadsResult] = await Promise.allSettled([
          getDashboard('osint-analyst'),
          listUploads(),
        ])

        if (cancelled) return

        if (dashboardResult.status === 'fulfilled' && dashboardResult.value) {
          const d = dashboardResult.value
          // Count active investigations: all ticket statuses except 'closed'
          const byStatus = (d.tickets as Record<string, unknown>)?.byStatus as Record<string, number> | undefined
          const activeInvestigations = byStatus
            ? Object.entries(byStatus).reduce((sum, [status, count]) => status !== 'closed' ? sum + count : sum, 0)
            : 0

          const bySeverity = (d.tickets as Record<string, unknown>)?.bySeverity as Record<string, number> | undefined

          setMetrics({
            uploadsToday: ((d.uploads as Record<string, unknown>)?.total as number) ?? 0,
            activeInvestigations,
            criticalFindings: bySeverity?.critical ?? 0,
            pendingIngestion: ((d.uploads as Record<string, unknown>)?.byStatus as Record<string, number> | undefined)?.pending ?? 0,
          })

          // Build severity chart data from bySeverity
          if (bySeverity) {
            setSeverityData(
              Object.entries(bySeverity).map(([severity, count]) => ({
                severity: severity.charAt(0).toUpperCase() + severity.slice(1),
                count,
                color: SEVERITY_COLORS[severity] ?? '#879596',
              }))
            )
          }

          // Build source type pie chart data
          const bySourceType = (d.uploads as Record<string, unknown>)?.bySourceType as Record<string, number> | undefined
          if (bySourceType) {
            setSourceTypeData(
              Object.entries(bySourceType).map(([name, value]) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                value,
              }))
            )
          }
        }

        if (uploadsResult.status === 'fulfilled') {
          setUploads(uploadsResult.value.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10))
        } else {
          setUploads([])
        }
      } catch {
        if (!cancelled) {
          setMetrics(DEFAULT_METRICS)
          setUploads([])
        }
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
    <SpaceBetween size="l">
      {/* Metric cards */}
      <ColumnLayout columns={4} variant="text-grid">
        <MetricCard
          icon="upload"
          label="Uploads Today"
          value={metrics.uploadsToday}
          statusType="info"
          onClick={() => navigate('osint-upload')}
          linkText="View pending"
        />
        <MetricCard
          icon="search"
          label="Active Investigations"
          value={metrics.activeInvestigations}
          statusType="warning"
          onClick={() => navigate('osint-investigations')}
          linkText="View investigations"
        />
        <MetricCard
          icon="status-negative"
          label="Critical Findings"
          value={metrics.criticalFindings}
          statusType="error"
          onClick={() => navigate('osint-investigations')}
          linkText="View findings"
        />
        <MetricCard
          icon="status-pending"
          label="Pending Ingestion"
          value={metrics.pendingIngestion}
          statusType="success"
          onClick={() => navigate('osint-upload')}
          linkText="View uploads"
        />
      </ColumnLayout>

      {/* Recent uploads mini-table */}
      <Container header={<Header variant="h2" counter={`(${uploads.length})`}>Recent Uploads</Header>}>
        <Table
          items={uploads}
          columnDefinitions={[
            { id: 'filename', header: 'Filename', cell: item => item.fileName, width: 320 },
            { id: 'sourceType', header: 'Source Type', cell: item => item.sourceType },
            { id: 'status', header: 'Status', cell: item => <UploadStatusCell status={item.ingestionStatus} /> },
            { id: 'uploadedAt', header: 'Uploaded', cell: item => new Date(Number(item.createdAt) * 1000).toLocaleString() },
          ]}
          variant="embedded"
          empty={<Box textAlign="center" color="text-body-secondary">No recent uploads</Box>}
        />
      </Container>

      {/* Charts: Severity + Source Type side by side */}
      <ColumnLayout columns={2}>
        <Container header={<Header variant="h2">Threat Severity Distribution</Header>}>
          {severityData.every(d => d.count === 0) ? (
            <div className="chart-empty">No severity data available yet</div>
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
                <Tooltip content={<ChartTooltip />} />
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

        <Container header={<Header variant="h2">Uploads by Source Type</Header>}>
          {sourceTypeData.length === 0 ? (
            <div className="chart-empty">No upload data available yet</div>
          ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={sourceTypeData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {sourceTypeData.map((_entry, index) => (
                    <Cell key={`src-${index}`} fill={SOURCE_TYPE_COLORS[index % SOURCE_TYPE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          )}
        </Container>
      </ColumnLayout>
    </SpaceBetween>
  )
}
