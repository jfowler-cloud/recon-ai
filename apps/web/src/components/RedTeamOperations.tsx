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
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTickets, createTicket } from '@/utils/api'
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

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export default function RedTeamOperations() {
  const { userId } = useAuth()
  const [operations, setOperations] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newOp, setNewOp] = useState({ title: '', description: '', severity: 'high', targetId: '' })

  useEffect(() => {
    let cancelled = false
    async function fetchOperations() {
      try {
        const tickets = await listTickets('type', 'red-team-operation')
        if (!cancelled) {
          setOperations(tickets)
        }
      } catch {
        if (!cancelled) {
          setOperations([])
        }
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

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading operations...</Box>
      </Box>
    )
  }

  return (
    <ContentLayout header={<Header variant="h1">Red Team Operations</Header>}>
      <SpaceBetween size="l">
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
              columnDefinitions={[
                { id: 'id', header: 'ID', sortingField: 'ticketId', cell: item => <Box fontWeight="bold">{item.ticketId}</Box>, width: 100 },
                { id: 'title', header: 'Title', sortingField: 'title', cell: item => item.title, width: 280 },
                { id: 'status', header: 'Status', sortingField: 'status', cell: item => statusBadge(item.status), width: 120 },
                { id: 'severity', header: 'Severity', cell: item => severityBadge(item.severity), width: 100 },
                { id: 'target', header: 'Target', cell: item => item.targetId ?? '\u2014', width: 100 },
                { id: 'assignee', header: 'Assignee', cell: item => item.assigneeId, width: 120 },
                {
                  id: 'created', header: 'Created', sortingField: 'createdAt',
                  cell: item => new Date(item.createdAt).toLocaleDateString(),
                  width: 120,
                },
              ]}
              variant="embedded"
              empty={<Box textAlign="center">No operations found</Box>}
            />
          </SpaceBetween>
        </Container>
      </SpaceBetween>
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
            <Input value={newOp.targetId} onChange={({ detail }) => setNewOp(p => ({ ...p, targetId: detail.value }))} placeholder="e.g. t-001" />
          </FormField>
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  )
}
