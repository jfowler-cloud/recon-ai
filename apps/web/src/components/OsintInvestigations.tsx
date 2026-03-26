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
import Spinner from '@cloudscape-design/components/spinner'
import Modal from '@cloudscape-design/components/modal'
import FormField from '@cloudscape-design/components/form-field'
import Input from '@cloudscape-design/components/input'
import Textarea from '@cloudscape-design/components/textarea'
import Select from '@cloudscape-design/components/select'
import Alert from '@cloudscape-design/components/alert'
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTickets, createTicket } from '@/utils/api'
import { useAuth } from '@/App'
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

function ticketToInvestigation(ticket: Ticket): Investigation {
  return {
    id: ticket.ticketId,
    title: ticket.title,
    status: ticket.status,
    severity: ticket.severity,
    assignee: ticket.assigneeId,
    created: new Date(Number(ticket.createdAt) * 1000).toISOString().slice(0, 10),
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

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export default function OsintInvestigations() {
  const { userId } = useAuth()
  const [selectedItems, setSelectedItems] = useState<Investigation[]>([])
  const [investigations, setInvestigations] = useState<Investigation[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newInv, setNewInv] = useState({ title: '', description: '', severity: 'high' })

  useEffect(() => {
    let cancelled = false
    async function fetchInvestigations() {
      try {
        const tickets = await listTickets('type', 'osint-investigation')
        console.log('[OsintInvestigations] listTickets result:', tickets)
        if (!cancelled) {
          setInvestigations(tickets.map(ticketToInvestigation))
        }
      } catch (err) {
        console.error('[OsintInvestigations] listTickets error:', err)
        if (!cancelled) {
          setInvestigations([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchInvestigations()
    return () => { cancelled = true }
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createTicket({
        title: newInv.title,
        description: newInv.description,
        severity: newInv.severity as Severity,
        ticketType: 'osint-investigation',
        assigneeId: userId,
      })
      setInvestigations(prev => [ticketToInvestigation(created), ...prev])
      setNewInv({ title: '', description: '', severity: 'high' })
      setShowCreateModal(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create investigation')
    } finally {
      setCreating(false)
    }
  }

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
      <Container
        header={
          <Header
            variant="h2"
            counter={`(${investigations.length})`}
            actions={
              <Button variant="primary" iconName="add-plus" onClick={() => setShowCreateModal(true)}>
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

      <Modal
        visible={showCreateModal}
        onDismiss={() => setShowCreateModal(false)}
        header="Create Investigation"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={!newInv.title.trim()} loading={creating}>Create</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {createError && <Alert type="error" dismissible onDismiss={() => setCreateError(null)}>{createError}</Alert>}
          <FormField label="Title">
            <Input value={newInv.title} onChange={({ detail }) => setNewInv(p => ({ ...p, title: detail.value }))} placeholder="e.g. Exposed MongoDB on Meridian DMZ" />
          </FormField>
          <FormField label="Description">
            <Textarea value={newInv.description} onChange={({ detail }) => setNewInv(p => ({ ...p, description: detail.value }))} placeholder="Describe the finding and initial observations" rows={3} />
          </FormField>
          <FormField label="Severity">
            <Select
              selectedOption={SEVERITY_OPTIONS.find(o => o.value === newInv.severity) ?? null}
              options={SEVERITY_OPTIONS}
              onChange={({ detail }) => setNewInv(p => ({ ...p, severity: detail.selectedOption.value ?? 'high' }))}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  )
}
