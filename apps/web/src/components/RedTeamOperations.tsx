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
import Alert from '@cloudscape-design/components/alert'
import Spinner from '@cloudscape-design/components/spinner'
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTickets } from '@/utils/api'
import type { Ticket } from '@/types'

const MOCK_OPERATIONS: Ticket[] = [
  {
    ticketId: 'RT-001', ticketType: 'red-team-operation', title: 'ProxyLogon Exploitation on Exchange',
    description: 'Exploit CVE-2021-26855 chain on mail.meridian-defense.com', status: 'active', severity: 'critical',
    assigneeId: 'analyst-1', targetId: 't-001', createdAt: Date.now() - 86400000, updatedAt: Date.now() - 3600000,
  },
  {
    ticketId: 'RT-002', ticketType: 'red-team-operation', title: 'Deep Nmap Scan of Database Subnet',
    description: 'Full port scan and service enumeration of 10.0.5.0/24', status: 'investigating', severity: 'high',
    assigneeId: 'analyst-2', targetId: 't-003', createdAt: Date.now() - 172800000, updatedAt: Date.now() - 7200000,
  },
  {
    ticketId: 'RT-003', ticketType: 'red-team-operation', title: 'Jenkins CLI RCE Attempt',
    description: 'Exploit CVE-2024-23897 arbitrary file read via Jenkins CLI', status: 'active', severity: 'critical',
    assigneeId: 'analyst-2', targetId: 't-002', createdAt: Date.now() - 259200000, updatedAt: Date.now() - 14400000,
  },
  {
    ticketId: 'RT-004', ticketType: 'red-team-operation', title: 'Fortinet VPN Pre-Auth RCE',
    description: 'Attempt CVE-2024-21762 out-of-bounds write on vpn.meridian-defense.com', status: 'triaging', severity: 'critical',
    assigneeId: 'analyst-1', targetId: 't-004', createdAt: Date.now() - 345600000, updatedAt: Date.now() - 28800000,
  },
  {
    ticketId: 'RT-005', ticketType: 'red-team-operation', title: 'Redis Unauthorized Access',
    description: 'Connect to Redis 6.2 on 10.0.5.40:6379, attempt data exfil and config write', status: 'completed', severity: 'medium',
    assigneeId: 'analyst-3', targetId: 't-003', createdAt: Date.now() - 432000000, updatedAt: Date.now() - 43200000,
  },
]

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

export default function RedTeamOperations() {
  const [operations, setOperations] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchOperations() {
      try {
        const tickets = await listTickets('ticketType', 'red-team-operation')
        if (!cancelled) {
          if (tickets.length > 0) {
            setOperations(tickets)
          } else {
            setOperations(MOCK_OPERATIONS)
            setUsingMock(true)
          }
        }
      } catch {
        if (!cancelled) {
          setOperations(MOCK_OPERATIONS)
          setUsingMock(true)
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
        {usingMock && (
          <Alert type="info" dismissible>
            Using demo data — backend not yet connected
          </Alert>
        )}

        <Container
          header={
            <Header
              variant="h2"
              counter={`(${operations.length})`}
              actions={<Button variant="primary">Create Operation</Button>}
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
    </ContentLayout>
  )
}
