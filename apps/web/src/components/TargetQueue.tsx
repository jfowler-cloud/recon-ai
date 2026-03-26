import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Table from '@cloudscape-design/components/table'
import Badge from '@cloudscape-design/components/badge'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import SpaceBetween from '@cloudscape-design/components/space-between'
import TextFilter from '@cloudscape-design/components/text-filter'
import ProgressBar from '@cloudscape-design/components/progress-bar'
import Modal from '@cloudscape-design/components/modal'
import FormField from '@cloudscape-design/components/form-field'
import Input from '@cloudscape-design/components/input'
import Textarea from '@cloudscape-design/components/textarea'
import Select from '@cloudscape-design/components/select'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import SplitPanel from '@cloudscape-design/components/split-panel'
import AppLayout from '@cloudscape-design/components/app-layout'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import Alert from '@cloudscape-design/components/alert'
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTargets, createTarget, updateTarget } from '@/utils/api'
import { useAuth } from '@/App'
import type { Target } from '@/types'

const CATEGORY_OPTIONS = [
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'application', label: 'Application' },
  { value: 'network', label: 'Network' },
  { value: 'personnel', label: 'Personnel' },
  { value: 'other', label: 'Other' },
]

const STATUS_OPTIONS = [
  { value: 'queued', label: 'Queued' },
  { value: 'enriched', label: 'Enriched' },
  { value: 'active', label: 'Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

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

function TargetDetail({ target, onStatusChange, onAssign }: {
  target: Target
  onStatusChange: (status: string) => void
  onAssign: (assignee: string) => void
}) {
  const [assignInput, setAssignInput] = useState(target.assigneeId ?? '')
  const raw = target as unknown as Record<string, unknown>

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

      {!!raw.plainTextGoal && (
        <div>
          <Box variant="small" color="text-body-secondary">ORIGINAL GOAL</Box>
          <Box variant="p">{String(raw.plainTextGoal)}</Box>
        </div>
      )}

      {!!raw.goalAlignment && (
        <div>
          <Box variant="small" color="text-body-secondary">GOAL ALIGNMENT</Box>
          <Box variant="p">
            {Array.isArray(raw.goalAlignment) ? (raw.goalAlignment as string[]).join(', ') : String(raw.goalAlignment)}
          </Box>
        </div>
      )}

      {!!raw.alignmentTags && Array.isArray(raw.alignmentTags) && (raw.alignmentTags as string[]).length > 0 && (
        <div>
          <Box variant="small" color="text-body-secondary">ALIGNMENT TAGS</Box>
          <SpaceBetween size="xxs" direction="horizontal">
            {(raw.alignmentTags as string[]).map((tag: string) => (
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
          <Box variant="p">{String(raw.severityScore ?? '—')}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Effort Score</Box>
          <Box variant="p">{String(raw.effortScore ?? raw.effort ?? '—')}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Created</Box>
          <Box variant="p">{formatDate(target.createdAt)}</Box>
        </div>
      </ColumnLayout>

      {/* Actions */}
      <Container header={<Header variant="h3">Actions</Header>}>
        <SpaceBetween size="m">
          <FormField label="Change Status">
            <SpaceBetween size="xs" direction="horizontal">
              <Select
                selectedOption={STATUS_OPTIONS.find(o => o.value === target.status) ?? null}
                options={STATUS_OPTIONS}
                onChange={({ detail }) => onStatusChange(detail.selectedOption.value ?? '')}
              />
            </SpaceBetween>
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

export default function TargetQueue() {
  const { userId } = useAuth()
  const [targets, setTargets] = useState<Target[]>([])
  const [selectedItems, setSelectedItems] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newTarget, setNewTarget] = useState({ name: '', description: '', category: '' })
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitPosition, setSplitPosition] = useState<'side' | 'bottom'>('side')
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchTargets() {
      try {
        const result = await listTargets()
        if (!cancelled) setTargets(result)
      } catch {
        if (!cancelled) setTargets([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchTargets()
    return () => { cancelled = true }
  }, [])

  const { items, collectionProps, filterProps } = useCollection(targets, {
    filtering: { empty: <Box textAlign="center">No targets found</Box> },
    sorting: { defaultState: { sortingColumn: { sortingField: 'priorityScore' }, isDescending: true } },
  })

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createTarget(newTarget.description || newTarget.name, newTarget.category || 'other', userId)
      setTargets(prev => [...prev, created])
      setNewTarget({ name: '', description: '', category: '' })
      setShowCreateModal(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create target')
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (targetId: string, newStatus: string) => {
    setActionAlert(null)
    try {
      const updated = await updateTarget(targetId, { status: newStatus })
      setTargets(prev => prev.map(t => t.targetId === targetId ? { ...t, ...updated } : t))
      setSelectedItems(prev => prev.map(t => t.targetId === targetId ? { ...t, ...updated } : t))
      setActionAlert({ type: 'success', message: `Status changed to ${newStatus}` })
    } catch (err) {
      setActionAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update status' })
    }
  }

  const handleAssign = async (targetId: string, assignee: string) => {
    setActionAlert(null)
    try {
      const updated = await updateTarget(targetId, { assignee })
      setTargets(prev => prev.map(t => t.targetId === targetId ? { ...t, ...updated, assigneeId: assignee } : t))
      setSelectedItems(prev => prev.map(t => t.targetId === targetId ? { ...t, ...updated, assigneeId: assignee } : t))
      setActionAlert({ type: 'success', message: `Assigned to ${assignee}` })
    } catch (err) {
      setActionAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to assign' })
    }
  }

  const handleDelete = async () => {
    const target = selectedItems[0]
    if (!target) return
    setActionAlert(null)
    try {
      await updateTarget(target.targetId, { status: 'cancelled' })
      setTargets(prev => prev.filter(t => t.targetId !== target.targetId))
      setSelectedItems([])
      setSplitOpen(false)
      setActionAlert({ type: 'success', message: `Target cancelled: ${target.name || target.targetId}` })
    } catch (err) {
      setActionAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to cancel target' })
    }
  }

  const selectedTarget = selectedItems[0] ?? null

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading targets...</Box>
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
            counter={`(${targets.length})`}
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                {selectedTarget && <Button onClick={handleDelete}>Cancel Target</Button>}
                <Button variant="primary" onClick={() => setShowCreateModal(true)}>Create Target</Button>
              </SpaceBetween>
            }
          >
            Targets
          </Header>
        }
      >
        <SpaceBetween size="m">
          <TextFilter {...filterProps} filteringPlaceholder="Filter targets" />
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
              { id: 'name', header: 'Name', sortingField: 'name', cell: item => item.name || 'Enriching...', width: 260 },
              { id: 'status', header: 'Status', sortingField: 'status', cell: item => statusBadge(item.status), width: 120 },
              {
                id: 'priority', header: 'Priority Score', sortingField: 'priorityScore',
                cell: item => <ProgressBar value={item.priorityScore} additionalInfo={`${item.priorityScore}/100`} />,
                width: 180,
              },
              { id: 'category', header: 'Category', sortingField: 'category', cell: item => item.category, width: 120 },
              {
                id: 'vulns', header: 'Vulnerabilities',
                cell: item => (
                  <SpaceBetween size="xxs" direction="horizontal">
                    {(item.vulnerabilities ?? []).slice(0, 2).map(v => <Badge key={v} color="red">{v}</Badge>)}
                    {(item.vulnerabilities ?? []).length > 2 && <Badge color="grey">+{item.vulnerabilities.length - 2}</Badge>}
                  </SpaceBetween>
                ),
                width: 240,
              },
              { id: 'assignee', header: 'Assignee', cell: item => item.assigneeId ?? <Box color="text-body-secondary">Unassigned</Box>, width: 120 },
              { id: 'created', header: 'Created', cell: item => formatDate(item.createdAt), width: 100 },
            ]}
            variant="embedded"
            empty={<Box textAlign="center">No targets found</Box>}
          />
        </SpaceBetween>
      </Container>

      <Modal
        visible={showCreateModal}
        onDismiss={() => setShowCreateModal(false)}
        header="Create Target"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={!newTarget.name && !newTarget.description} loading={creating}>Create</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {createError && <Alert type="error" dismissible onDismiss={() => setCreateError(null)}>{createError}</Alert>}
          <FormField label="Goal" description="Describe the target objective in plain English — the AI agent will enrich it">
            <Textarea value={newTarget.description} onChange={({ detail }) => setNewTarget(p => ({ ...p, description: detail.value }))} placeholder="e.g. Exploit the exposed MongoDB instance on port 27017 to extract employee PII" rows={3} />
          </FormField>
          <FormField label="Category">
            <Select
              selectedOption={newTarget.category ? { value: newTarget.category, label: newTarget.category } : null}
              options={CATEGORY_OPTIONS}
              onChange={({ detail }) => setNewTarget(p => ({ ...p, category: detail.selectedOption.value ?? '' }))}
              placeholder="Select category"
            />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  )

  return (
    <ContentLayout header={<Header variant="h1">Target Queue</Header>}>
      <AppLayout
        content={mainContent}
        splitPanel={
          selectedTarget ? (
            <SplitPanel header={selectedTarget.name || 'Target Details'} closeBehavior="hide">
              <TargetDetail
                target={selectedTarget}
                onStatusChange={(status) => handleStatusChange(selectedTarget.targetId, status)}
                onAssign={(assignee) => handleAssign(selectedTarget.targetId, assignee)}
              />
            </SplitPanel>
          ) : undefined
        }
        splitPanelOpen={splitOpen}
        onSplitPanelToggle={({ detail }) => setSplitOpen(detail.open)}
        splitPanelPreferences={{ position: splitPosition }}
        onSplitPanelPreferencesChange={({ detail }) => setSplitPosition(detail.position)}
        ariaLabels={{} as Record<string, string>}
        navigationHide
        toolsHide
        headerSelector="#top-nav"
        disableContentPaddings
      />
    </ContentLayout>
  )
}
