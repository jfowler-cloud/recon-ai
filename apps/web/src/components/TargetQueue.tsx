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
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTargets, createTarget } from '@/utils/api'
import type { Target } from '@/types'

const CATEGORY_OPTIONS = [
  { value: 'Web Server', label: 'Web Server' },
  { value: 'CI/CD', label: 'CI/CD' },
  { value: 'Database', label: 'Database' },
  { value: 'Network', label: 'Network' },
  { value: 'Container', label: 'Container' },
]

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

export default function TargetQueue() {
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTarget, setNewTarget] = useState({ name: '', description: '', category: '', vulnerabilities: '' })

  useEffect(() => {
    let cancelled = false
    async function fetchTargets() {
      try {
        const result = await listTargets()
        if (!cancelled) {
          setTargets(result)
        }
      } catch {
        if (!cancelled) {
          setTargets([])
        }
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
    try {
      const created = await createTarget(newTarget.description || newTarget.name, newTarget.category || 'other')
      setTargets(prev => [...prev, created])
      setNewTarget({ name: '', description: '', category: '', vulnerabilities: '' })
      setShowCreateModal(false)
    } catch {
      // Fallback: create locally
      const target: Target = {
        targetId: `t-${String(targets.length + 1).padStart(3, '0')}`,
        name: newTarget.name,
        description: newTarget.description,
        status: 'queued',
        priorityScore: Math.floor(Math.random() * 30) + 60,
        category: newTarget.category,
        vulnerabilities: newTarget.vulnerabilities.split(',').map(v => v.trim()).filter(Boolean),
        createdAt: Date.now(),
      }
      setTargets(prev => [...prev, target])
      setNewTarget({ name: '', description: '', category: '', vulnerabilities: '' })
      setShowCreateModal(false)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading targets...</Box>
      </Box>
    )
  }

  return (
    <ContentLayout header={<Header variant="h1">Target Queue</Header>}>
      <SpaceBetween size="l">
        <Container
          header={
            <Header
              variant="h2"
              counter={`(${targets.length})`}
              actions={<Button variant="primary" onClick={() => setShowCreateModal(true)}>Create Target</Button>}
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
              columnDefinitions={[
                { id: 'name', header: 'Name', sortingField: 'name', cell: item => item.name, width: 260 },
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
                      {item.vulnerabilities.slice(0, 2).map(v => <Badge key={v} color="red">{v}</Badge>)}
                      {item.vulnerabilities.length > 2 && <Badge color="grey">+{item.vulnerabilities.length - 2}</Badge>}
                    </SpaceBetween>
                  ),
                  width: 240,
                },
                { id: 'assignee', header: 'Assignee', cell: item => item.assigneeId ?? <Box color="text-body-secondary">Unassigned</Box>, width: 120 },
              ]}
              variant="embedded"
              empty={<Box textAlign="center">No targets found</Box>}
            />
          </SpaceBetween>
        </Container>
      </SpaceBetween>

      <Modal
        visible={showCreateModal}
        onDismiss={() => setShowCreateModal(false)}
        header="Create Target"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={!newTarget.name} loading={creating}>Create</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Name">
            <Input value={newTarget.name} onChange={({ detail }) => setNewTarget(p => ({ ...p, name: detail.value }))} placeholder="e.g. Exchange Server (ProxyLogon)" />
          </FormField>
          <FormField label="Description">
            <Textarea value={newTarget.description} onChange={({ detail }) => setNewTarget(p => ({ ...p, description: detail.value }))} placeholder="Describe the target and known vulnerabilities" rows={3} />
          </FormField>
          <FormField label="Category">
            <Select
              selectedOption={newTarget.category ? { value: newTarget.category, label: newTarget.category } : null}
              options={CATEGORY_OPTIONS}
              onChange={({ detail }) => setNewTarget(p => ({ ...p, category: detail.selectedOption.value ?? '' }))}
              placeholder="Select category"
            />
          </FormField>
          <FormField label="Vulnerabilities" description="Comma-separated CVE/CWE IDs">
            <Input value={newTarget.vulnerabilities} onChange={({ detail }) => setNewTarget(p => ({ ...p, vulnerabilities: detail.value }))} placeholder="CVE-2021-26855, CVE-2021-27065" />
          </FormField>
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  )
}
