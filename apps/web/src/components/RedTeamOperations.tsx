import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Table from '@cloudscape-design/components/table'
import Badge from '@cloudscape-design/components/badge'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import SpaceBetween from '@cloudscape-design/components/space-between'
import TextFilter from '@cloudscape-design/components/text-filter'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import Modal from '@cloudscape-design/components/modal'
import FormField from '@cloudscape-design/components/form-field'
import Input from '@cloudscape-design/components/input'
import Textarea from '@cloudscape-design/components/textarea'
import Select from '@cloudscape-design/components/select'
import Alert from '@cloudscape-design/components/alert'
import SplitPanel from '@cloudscape-design/components/split-panel'
import AppLayout from '@cloudscape-design/components/app-layout'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTickets, createTicket, updateTicket } from '@/utils/api'
import { useAuth } from '@/App'
import type { Ticket } from '@/types'

function statusBadge(status: string) {
  const colorMap: Record<string, 'blue' | 'green' | 'red' | 'grey'> = {
    new: 'grey',
    triaging: 'blue',
    investigating: 'blue',
    active: 'red',
    completed: 'green',
    closed: 'grey',
  }
  return <Badge color={colorMap[status] ?? 'grey'}>{status}</Badge>
}

function severityBadge(severity: string) {
  const colorMap: Record<string, 'red' | 'blue' | 'grey' | 'green'> = {
    critical: 'red',
    high: 'red',
    medium: 'blue',
    low: 'grey',
  }
  return <Badge color={colorMap[severity] ?? 'grey'}>{severity}</Badge>
}

function formatDate(ts: number | string): string {
  const n = typeof ts === 'string' ? Number(ts) : ts
  if (!n || isNaN(n)) return '—'
  return new Date(n * 1000).toLocaleDateString()
}

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'triaging', label: 'Triaging' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
]

function OperationDetail({ ticket, onStatusChange, onAssign }: {
  ticket: Ticket
  onStatusChange: (status: string) => void
  onAssign: (assignee: string) => void
}) {
  const [assignInput, setAssignInput] = useState(ticket.assigneeId ?? '')

  return (
    <SpaceBetween size="m">
      <div>
        <Box variant="h3">{ticket.title}</Box>
        <Box variant="small" color="text-body-secondary">{ticket.ticketId}</Box>
      </div>

      <ColumnLayout columns={3}>
        <div>
          <Box variant="small" color="text-body-secondary">Status</Box>
          <div style={{ marginTop: 4 }}>{statusBadge(ticket.status)}</div>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Severity</Box>
          <div style={{ marginTop: 4 }}>{severityBadge(ticket.severity)}</div>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Created</Box>
          <Box variant="p">{formatDate(ticket.createdAt)}</Box>
        </div>
      </ColumnLayout>

      {ticket.description && (
        <div>
          <Box variant="small" color="text-body-secondary">DESCRIPTION</Box>
          <Box variant="p">{ticket.description}</Box>
        </div>
      )}

      <ColumnLayout columns={2}>
        <div>
          <Box variant="small" color="text-body-secondary">Target</Box>
          <Box variant="p">{ticket.targetId || '—'}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Assignee</Box>
          <Box variant="p">{ticket.assigneeId || 'Unassigned'}</Box>
        </div>
      </ColumnLayout>

      {ticket.updatedAt && (
        <div>
          <Box variant="small" color="text-body-secondary">Last Updated</Box>
          <Box variant="p">{formatDate(ticket.updatedAt)}</Box>
        </div>
      )}

      <Container header={<Header variant="h3">Actions</Header>}>
        <SpaceBetween size="m">
          <FormField label="Change Status">
            <Select
              selectedOption={STATUS_OPTIONS.find(o => o.value === ticket.status) ?? null}
              options={STATUS_OPTIONS}
              onChange={({ detail }) => onStatusChange(detail.selectedOption.value ?? '')}
            />
          </FormField>

          <FormField label="Assign To">
            <SpaceBetween size="xs" direction="horizontal">
              <Input
                value={assignInput}
                onChange={({ detail }) => setAssignInput(detail.value)}
                placeholder="analyst email or ID"
              />
              <Button onClick={() => onAssign(assignInput)} disabled={!assignInput.trim()}>Assign</Button>
            </SpaceBetween>
          </FormField>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  )
}

export default function RedTeamOperations() {
  const { userId } = useAuth()
  const [operations, setOperations] = useState<Ticket[]>([])
  const [selectedItems, setSelectedItems] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newOp, setNewOp] = useState({ title: '', description: '', severity: 'high', targetId: '' })
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitPosition, setSplitPosition] = useState<'side' | 'bottom'>('side')
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchOperations() {
      try {
        const tickets = await listTickets('type', 'red-team-operation')
        if (!cancelled) setOperations(tickets)
      } catch {
        if (!cancelled) setOperations([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchOperations()
    return () => { cancelled = true }
  }, [])

  const { items, collectionProps, filterProps } = useCollection(operations, {
    filtering: { empty: <Box textAlign="center">No operations found</Box> },
    sorting: { defaultState: { sortingColumn: { sortingField: 'createdAt' }, isDescending: true } },
  })

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createTicket({
        title: newOp.title,
        description: newOp.description,
        severity: newOp.severity as Ticket['severity'],
        ticketType: 'red-team-operation',
        assigneeId: userId,
        targetId: newOp.targetId || undefined,
      })
      setOperations(prev => [created, ...prev])
      setNewOp({ title: '', description: '', severity: 'high', targetId: '' })
      setShowCreateModal(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create operation')
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    setActionAlert(null)
    try {
      const updated = await updateTicket(ticketId, { status: newStatus })
      setOperations(prev => prev.map(t => t.ticketId === ticketId ? { ...t, ...updated } : t))
      setSelectedItems(prev => prev.map(t => t.ticketId === ticketId ? { ...t, ...updated } : t))
      setActionAlert({ type: 'success', message: `Status changed to ${newStatus}` })
    } catch (err) {
      setActionAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update status' })
    }
  }

  const handleAssign = async (ticketId: string, assignee: string) => {
    setActionAlert(null)
    try {
      const updated = await updateTicket(ticketId, { assigneeId: assignee })
      setOperations(prev => prev.map(t => t.ticketId === ticketId ? { ...t, ...updated, assigneeId: assignee } : t))
      setSelectedItems(prev => prev.map(t => t.ticketId === ticketId ? { ...t, ...updated, assigneeId: assignee } : t))
      setActionAlert({ type: 'success', message: `Assigned to ${assignee}` })
    } catch (err) {
      setActionAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to assign' })
    }
  }

  const selectedOp = selectedItems[0] ?? null

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading operations...</Box>
      </Box>
    )
  }

  const mainContent = (
    <SpaceBetween size="l">
      {actionAlert && (
        <Alert type={actionAlert.type} dismissible onDismiss={() => setActionAlert(null)}>{actionAlert.message}</Alert>
      )}

      <Container
        header={
          <Header
            variant="h2"
            counter={`(${operations.length})`}
            actions={<Button variant="primary" onClick={() => setShowCreateModal(true)}>Create Operation</Button>}
          >
            Operations
          </Header>
        }
      >
        <SpaceBetween size="m">
          <TextFilter {...filterProps} filteringPlaceholder="Filter operations" />
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
              { id: 'id', header: 'ID', sortingField: 'ticketId', cell: item => <Box fontWeight="bold">{item.ticketId.slice(-8)}</Box>, width: 100 },
              { id: 'title', header: 'Title', sortingField: 'title', cell: item => item.title, width: 280 },
              { id: 'status', header: 'Status', sortingField: 'status', cell: item => statusBadge(item.status), width: 120 },
              { id: 'severity', header: 'Severity', cell: item => severityBadge(item.severity), width: 100 },
              { id: 'target', header: 'Target', cell: item => item.targetId ? item.targetId.slice(-8) : '—', width: 100 },
              { id: 'assignee', header: 'Assignee', cell: item => item.assigneeId || <Box color="text-body-secondary">Unassigned</Box>, width: 140 },
              {
                id: 'created', header: 'Created', sortingField: 'createdAt',
                cell: item => formatDate(item.createdAt),
                width: 110,
              },
            ]}
            variant="embedded"
            empty={<Box textAlign="center">No operations found</Box>}
          />
        </SpaceBetween>
      </Container>

      <Modal
        visible={showCreateModal}
        onDismiss={() => setShowCreateModal(false)}
        header="Create Operation"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={!newOp.title.trim()} loading={creating}>Create</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {createError && <Alert type="error" dismissible onDismiss={() => setCreateError(null)}>{createError}</Alert>}
          <FormField label="Title">
            <Input value={newOp.title} onChange={({ detail }) => setNewOp(p => ({ ...p, title: detail.value }))} placeholder="e.g. ProxyLogon Exploitation on Exchange" />
          </FormField>
          <FormField label="Description">
            <Textarea value={newOp.description} onChange={({ detail }) => setNewOp(p => ({ ...p, description: detail.value }))} placeholder="Describe the operation objective and approach" rows={3} />
          </FormField>
          <FormField label="Severity">
            <Select
              selectedOption={SEVERITY_OPTIONS.find(o => o.value === newOp.severity) ?? null}
              options={SEVERITY_OPTIONS}
              onChange={({ detail }) => setNewOp(p => ({ ...p, severity: detail.selectedOption.value ?? 'high' }))}
            />
          </FormField>
          <FormField label="Target ID (optional)">
            <Input value={newOp.targetId} onChange={({ detail }) => setNewOp(p => ({ ...p, targetId: detail.value }))} placeholder="e.g. target ULID" />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  )

  return (
    <ContentLayout header={<Header variant="h1">Red Team Operations</Header>}>
      <AppLayout
        content={mainContent}
        splitPanel={
          selectedOp ? (
            <SplitPanel header={selectedOp.title} closeBehavior="hide">
              <OperationDetail
                ticket={selectedOp}
                onStatusChange={(status) => handleStatusChange(selectedOp.ticketId, status)}
                onAssign={(assignee) => handleAssign(selectedOp.ticketId, assignee)}
              />
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
