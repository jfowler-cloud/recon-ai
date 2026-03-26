import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Table from '@cloudscape-design/components/table'
import Badge from '@cloudscape-design/components/badge'
import StatusIndicator from '@cloudscape-design/components/status-indicator'
import TextFilter from '@cloudscape-design/components/text-filter'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Pagination from '@cloudscape-design/components/pagination'
import Alert from '@cloudscape-design/components/alert'
import Spinner from '@cloudscape-design/components/spinner'
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTickets } from '@/utils/api'
import type { Ticket, TicketStatus, Severity } from '@/types'

// ── Status / Severity rendering ──────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, { color: Parameters<typeof Badge>[0]['color']; label: string }> = {
  new: { color: 'blue', label: 'New' },
  triaging: { color: 'severity-medium', label: 'Triaging' },
  investigating: { color: 'severity-high', label: 'Investigating' },
  active: { color: 'red', label: 'Active' },
  completed: { color: 'green', label: 'Completed' },
  closed: { color: 'grey', label: 'Closed' },
}

const SEVERITY_CONFIG: Record<Severity, { type: Parameters<typeof StatusIndicator>[0]['type']; label: string }> = {
  critical: { type: 'error', label: 'Critical' },
  high: { type: 'warning', label: 'High' },
  medium: { type: 'info', label: 'Medium' },
  low: { type: 'success', label: 'Low' },
}

// ── Mock data (fallback) ────────────────────────────────────────────

interface Investigation {
  id: string
  title: string
  status: TicketStatus
  severity: Severity
  assignee: string
  created: string
  description: string
  findings: string[]
}

const MOCK_INVESTIGATIONS: Investigation[] = [
  {
    id: 'INV-001', title: 'Exposed MongoDB on Meridian DMZ',
    status: 'active', severity: 'critical', assignee: 'A. Chen', created: '2026-03-24',
    description: 'Shodan scan revealed an unauthenticated MongoDB instance on port 27017 in the Meridian Defense DMZ segment.',
    findings: ['Open port 27017', 'No authentication required', 'Employee PII detected', '~45K records exposed'],
  },
  {
    id: 'INV-002', title: 'Meridian VPN Gateway — CVE-2026-1234',
    status: 'investigating', severity: 'critical', assignee: 'R. Patel', created: '2026-03-23',
    description: 'Critical RCE vulnerability detected in Meridian Defense external VPN gateway.',
    findings: ['Firmware v3.2.1 confirmed', 'Public exploit available', 'Gateway serves 200+ users'],
  },
  {
    id: 'INV-003', title: 'Social media leak — internal org chart',
    status: 'triaging', severity: 'high', assignee: 'M. Torres', created: '2026-03-23',
    description: 'Meridian Defense org chart with reporting lines and role titles found posted on a public forum.',
    findings: ['Full org chart with names', 'Role titles include clearance levels', 'Forum post dated March 20'],
  },
  {
    id: 'INV-004', title: 'DNS zone transfer enabled — meridian-defense.com',
    status: 'new', severity: 'high', assignee: 'Unassigned', created: '2026-03-25',
    description: 'AXFR zone transfer is enabled on the primary DNS server for meridian-defense.com.',
    findings: ['42 internal hostnames leaked', 'Includes staging and dev servers', 'Two internal mail servers exposed'],
  },
  {
    id: 'INV-005', title: 'Cleartext FTP server with contract docs',
    status: 'investigating', severity: 'critical', assignee: 'A. Chen', created: '2026-03-22',
    description: 'Nmap scan identified an FTP server running on port 21 with anonymous login enabled.',
    findings: ['Anonymous FTP enabled', '17 contract PDFs accessible', 'Government SOW documents present', 'Server on production subnet'],
  },
  {
    id: 'INV-006', title: 'Exposed Elasticsearch cluster',
    status: 'active', severity: 'high', assignee: 'R. Patel', created: '2026-03-21',
    description: 'Unauthenticated Elasticsearch cluster found containing application logs with authentication tokens.',
    findings: ['No authentication', 'Contains JWT tokens', '3 months of application logs', 'Internal IPs in logs'],
  },
  {
    id: 'INV-007', title: 'Outdated Apache Struts on web portal',
    status: 'completed', severity: 'medium', assignee: 'M. Torres', created: '2026-03-18',
    description: 'Meridian customer portal running Apache Struts 2.3.x. Remediation ticket submitted.',
    findings: ['Struts 2.3.32 detected', 'CVE-2017-5638 applicable', 'Customer-facing portal'],
  },
  {
    id: 'INV-008', title: 'GitHub repo with hardcoded API keys',
    status: 'triaging', severity: 'high', assignee: 'A. Chen', created: '2026-03-24',
    description: 'Public GitHub repository contains hardcoded AWS API keys and database connection strings.',
    findings: ['AWS access key in .env', 'Database URI with credentials', 'Repo has 3 forks', 'Keys still active'],
  },
  {
    id: 'INV-009', title: 'SSL/TLS misconfig on mail server',
    status: 'closed', severity: 'low', assignee: 'R. Patel', created: '2026-03-15',
    description: 'Mail server supports TLS 1.0 and weak cipher suites.',
    findings: ['TLS 1.0 enabled', 'RC4 cipher supported', 'Certificate expires in 15 days'],
  },
  {
    id: 'INV-010', title: 'Phishing domain registered — merid1an-defense.com',
    status: 'new', severity: 'medium', assignee: 'Unassigned', created: '2026-03-25',
    description: 'Lookalike domain registered on March 23 via a privacy-protected registrar.',
    findings: ['Domain registered March 23', 'Privacy-protected WHOIS', 'MX records configured', 'No web content yet'],
  },
]

function ticketToInvestigation(ticket: Ticket): Investigation {
  return {
    id: ticket.ticketId,
    title: ticket.title,
    status: ticket.status,
    severity: ticket.severity,
    assignee: ticket.assigneeId,
    created: new Date(ticket.createdAt).toISOString().slice(0, 10),
    description: ticket.description,
    findings: [],
  }
}

// ── Detail panel component ───────────────────────────────────────────

function InvestigationDetail({ item }: { item: Investigation }) {
  const statusCfg = STATUS_CONFIG[item.status]
  const severityCfg = SEVERITY_CONFIG[item.severity]

  return (
    <SpaceBetween size="m">
      <div>
        <Box variant="h2">{item.title}</Box>
        <Box variant="small" color="text-body-secondary">{item.id} | Created {item.created}</Box>
      </div>

      <SpaceBetween size="xs" direction="horizontal">
        <Badge color={statusCfg.color}>{statusCfg.label}</Badge>
        <StatusIndicator type={severityCfg.type}>{severityCfg.label}</StatusIndicator>
        <Box variant="small" color="text-body-secondary">Assigned to: {item.assignee}</Box>
      </SpaceBetween>

      <div>
        <Box variant="small" color="text-body-secondary">DESCRIPTION</Box>
        <Box variant="p">{item.description}</Box>
      </div>

      {item.findings.length > 0 && (
        <div>
          <Box variant="small" color="text-body-secondary">KEY FINDINGS</Box>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {item.findings.map((f, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <Box variant="small">{f}</Box>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SpaceBetween>
  )
}

// ── Main component ───────────────────────────────────────────────────

export default function OsintInvestigations() {
  const [selectedItems, setSelectedItems] = useState<Investigation[]>([])
  const [investigations, setInvestigations] = useState<Investigation[]>([])
  const [loading, setLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchInvestigations() {
      try {
        const tickets = await listTickets('ticketType', 'osint-investigation')
        if (!cancelled) {
          if (tickets.length > 0) {
            setInvestigations(tickets.map(ticketToInvestigation))
          } else {
            setInvestigations(MOCK_INVESTIGATIONS)
            setUsingMock(true)
          }
        }
      } catch {
        if (!cancelled) {
          setInvestigations(MOCK_INVESTIGATIONS)
          setUsingMock(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchInvestigations()
    return () => { cancelled = true }
  }, [])

  const { items, collectionProps, filterProps, paginationProps } = useCollection(investigations, {
    filtering: {
      empty: <Box textAlign="center" color="text-body-secondary">No investigations found</Box>,
      noMatch: <Box textAlign="center" color="text-body-secondary">No matching investigations</Box>,
    },
    sorting: {
      defaultState: { sortingColumn: { sortingField: 'created' }, isDescending: true },
    },
    pagination: { pageSize: 10 },
  })

  const selectedItem = selectedItems[0] ?? null

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading investigations...</Box>
      </Box>
    )
  }

  return (
    <SpaceBetween size="l">
      {usingMock && (
        <Alert type="info" dismissible>
          Using demo data — backend not yet connected
        </Alert>
      )}

      <Container
        header={
          <Header
            variant="h2"
            counter={`(${investigations.length})`}
            actions={
              <Button variant="primary" iconName="add-plus">
                Create Investigation
              </Button>
            }
          >
            OSINT Investigations
          </Header>
        }
      >
        <SpaceBetween size="m">
          <TextFilter {...filterProps} filteringPlaceholder="Search investigations..." />
          <Table
            {...collectionProps}
            items={items}
            selectionType="single"
            selectedItems={selectedItems}
            onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
            columnDefinitions={[
              { id: 'id', header: 'ID', cell: item => item.id, width: 100, sortingField: 'id' },
              { id: 'title', header: 'Title', cell: item => item.title, width: 320, sortingField: 'title' },
              {
                id: 'status', header: 'Status', sortingField: 'status', width: 140,
                cell: item => {
                  const cfg = STATUS_CONFIG[item.status]
                  return <Badge color={cfg.color}>{cfg.label}</Badge>
                },
              },
              {
                id: 'severity', header: 'Severity', sortingField: 'severity', width: 120,
                cell: item => {
                  const cfg = SEVERITY_CONFIG[item.severity]
                  return <StatusIndicator type={cfg.type}>{cfg.label}</StatusIndicator>
                },
              },
              { id: 'assignee', header: 'Assignee', cell: item => item.assignee, sortingField: 'assignee' },
              { id: 'created', header: 'Created', cell: item => item.created, sortingField: 'created' },
            ]}
            pagination={<Pagination {...paginationProps} />}
            empty={<Box textAlign="center" color="text-body-secondary">No investigations</Box>}
          />
        </SpaceBetween>
      </Container>

      {/* Detail panel — shows when a row is selected */}
      {selectedItem && (
        <Container
          header={
            <Header
              variant="h2"
              actions={
                <Button variant="normal" onClick={() => setSelectedItems([])}>
                  Close
                </Button>
              }
            >
              Investigation Details
            </Header>
          }
        >
          <InvestigationDetail item={selectedItem} />
        </Container>
      )}
    </SpaceBetween>
  )
}
