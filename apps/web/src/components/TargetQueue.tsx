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
import Alert from '@cloudscape-design/components/alert'
import Spinner from '@cloudscape-design/components/spinner'
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTargets, queueForRedteam } from '@/utils/api'
import type { Target } from '@/types'

const MOCK_TARGETS: Target[] = [
  { targetId: 't-001', name: 'Exchange Server (ProxyLogon)', description: 'CVE-2021-26855 on mail.meridian-defense.com', status: 'approved', priorityScore: 95, category: 'Web Server', vulnerabilities: ['CVE-2021-26855', 'CVE-2021-27065'], assigneeId: 'analyst-1', createdAt: Date.now() - 86400000 },
  { targetId: 't-002', name: 'Jenkins CI (Exposed CLI)', description: 'Unauthenticated Jenkins CLI on ci.meridian-defense.com:8080', status: 'in-progress', priorityScore: 88, category: 'CI/CD', vulnerabilities: ['CVE-2024-23897', 'CVE-2019-1003000'], assigneeId: 'analyst-2', createdAt: Date.now() - 172800000 },
  { targetId: 't-003', name: 'Redis Instance (No Auth)', description: 'Exposed Redis 6.2 on 10.0.5.40:6379 with no password', status: 'queued', priorityScore: 82, category: 'Database', vulnerabilities: ['CWE-306', 'CVE-2022-24735'], createdAt: Date.now() - 259200000 },
  { targetId: 't-004', name: 'VPN Gateway (Fortinet)', description: 'FortiOS SSL VPN pre-auth RCE on vpn.meridian-defense.com', status: 'approved', priorityScore: 91, category: 'Network', vulnerabilities: ['CVE-2024-21762', 'CVE-2023-27997'], assigneeId: 'analyst-1', createdAt: Date.now() - 345600000 },
  { targetId: 't-005', name: 'PostgreSQL (Weak Creds)', description: 'PostgreSQL 14 on db-prod.meridian-defense.com with default creds', status: 'queued', priorityScore: 76, category: 'Database', vulnerabilities: ['CWE-521', 'CWE-798'], createdAt: Date.now() - 432000000 },
  { targetId: 't-006', name: 'Apache Struts (RCE)', description: 'Apache Struts 2.5.30 on app.meridian-defense.com with OGNL injection', status: 'queued', priorityScore: 87, category: 'Web Server', vulnerabilities: ['CVE-2023-50164'], createdAt: Date.now() - 518400000 },
  { targetId: 't-007', name: 'MongoDB (No Auth)', description: 'MongoDB 5.0 exposed on 10.0.5.55:27017 without authentication', status: 'approved', priorityScore: 79, category: 'Database', vulnerabilities: ['CWE-306'], assigneeId: 'analyst-3', createdAt: Date.now() - 604800000 },
  { targetId: 't-008', name: 'Kubernetes API (Exposed)', description: 'K8s API server at k8s.meridian-defense.com:6443 with anonymous auth', status: 'queued', priorityScore: 93, category: 'Container', vulnerabilities: ['CVE-2024-21626', 'CWE-306'], createdAt: Date.now() - 691200000 },
  { targetId: 't-009', name: 'GitLab CE (CVE-2023-7028)', description: 'Password reset vulnerability on gitlab.meridian-defense.com', status: 'in-progress', priorityScore: 85, category: 'CI/CD', vulnerabilities: ['CVE-2023-7028'], assigneeId: 'analyst-2', createdAt: Date.now() - 777600000 },
  { targetId: 't-010', name: 'MSSQL Server (sa default)', description: 'MSSQL 2019 on 10.0.5.70:1433 with default sa password', status: 'deferred', priorityScore: 71, category: 'Database', vulnerabilities: ['CWE-798', 'CWE-521'], createdAt: Date.now() - 864000000 },
]

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
  const [usingMock, setUsingMock] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTarget, setNewTarget] = useState({ name: '', description: '', category: '', vulnerabilities: '' })

  useEffect(() => {
    let cancelled = false
    async function fetchTargets() {
      try {
        const result = await listTargets()
        if (!cancelled) {
          if (result.length > 0) {
            setTargets(result)
          } else {
            setTargets(MOCK_TARGETS)
            setUsingMock(true)
          }
        }
      } catch {
        if (!cancelled) {
          setTargets(MOCK_TARGETS)
          setUsingMock(true)
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
    const targetData: Partial<Target> = {
      name: newTarget.name,
      description: newTarget.description,
      status: 'queued',
      category: newTarget.category,
      vulnerabilities: newTarget.vulnerabilities.split(',').map(v => v.trim()).filter(Boolean),
    }

    setCreating(true)
    try {
      const created = await queueForRedteam(targetData)
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
        {usingMock && (
          <Alert type="info" dismissible>
            Using demo data — backend not yet connected
          </Alert>
        )}

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
