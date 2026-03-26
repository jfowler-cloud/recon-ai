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
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTickets } from '@/utils/api'
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

export default function RedTeamOperations() {
  const [operations, setOperations] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

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
