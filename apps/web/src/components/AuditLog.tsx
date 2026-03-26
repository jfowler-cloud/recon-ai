/**
 * Audit Log — admin-only view showing recent changes across tickets, targets, and tools.
 * Fetches recent items from DynamoDB and displays a unified timeline.
 */
import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Box from '@cloudscape-design/components/box'
import Badge from '@cloudscape-design/components/badge'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import TextFilter from '@cloudscape-design/components/text-filter'
import Select from '@cloudscape-design/components/select'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import { listTickets, listTargets, listTools } from '@/utils/api'
import { useAuth } from '@/App'
import type { Ticket, Target, Tool } from '@/types'

interface AuditEntry {
  id: string
  timestamp: number
  action: string
  entity: 'ticket' | 'target' | 'tool'
  entityId: string
  entityName: string
  detail: string
  user?: string
  severity?: string
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  return d.toLocaleString()
}

function relativeTime(ts: number): string {
  const now = Date.now()
  const d = ts < 1e12 ? ts * 1000 : ts
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function entityBadge(entity: string) {
  const colors: Record<string, 'blue' | 'red' | 'green' | 'grey'> = {
    ticket: 'blue', target: 'red', tool: 'green',
  }
  return <Badge color={colors[entity] ?? 'grey'}>{entity}</Badge>
}

export default function AuditLog() {
  useAuth() // access check
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [entityFilter, setEntityFilter] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchAll() {
      try {
        const [tickets, targets, tools] = await Promise.allSettled([
          listTickets(),
          listTargets(),
          listTools(),
        ])

        if (cancelled) return
        const auditEntries: AuditEntry[] = []

        // Tickets
        if (tickets.status === 'fulfilled') {
          tickets.value.forEach((t: Ticket) => {
            auditEntries.push({
              id: `ticket-created-${t.ticketId}`,
              timestamp: t.createdAt,
              action: 'Created',
              entity: 'ticket',
              entityId: t.ticketId,
              entityName: t.title,
              detail: `${t.ticketType} | ${t.severity} severity`,
              user: t.assigneeId,
              severity: t.severity,
            })
            if (t.updatedAt && t.updatedAt !== t.createdAt) {
              auditEntries.push({
                id: `ticket-updated-${t.ticketId}`,
                timestamp: t.updatedAt,
                action: `Status: ${t.status}`,
                entity: 'ticket',
                entityId: t.ticketId,
                entityName: t.title,
                detail: `Moved to ${t.status}`,
                user: t.assigneeId,
              })
            }
          })
        }

        // Targets
        if (targets.status === 'fulfilled') {
          targets.value.forEach((t: Target) => {
            auditEntries.push({
              id: `target-${t.targetId}`,
              timestamp: t.createdAt,
              action: t.status === 'queued' ? 'Submitted' : `Status: ${t.status}`,
              entity: 'target',
              entityId: t.targetId,
              entityName: t.name || 'Enriching...',
              detail: `${t.category} | Priority: ${t.priorityScore}/100`,
              user: t.assigneeId,
            })
          })
        }

        // Tools
        if (tools.status === 'fulfilled') {
          tools.value.forEach((t: Tool) => {
            auditEntries.push({
              id: `tool-${t.toolId}`,
              timestamp: t.createdAt,
              action: 'Registered',
              entity: 'tool',
              entityId: t.toolId,
              entityName: t.name,
              detail: `${t.category} | ${t.framework} | ${t.successProfile?.estimatedSuccessRate ?? 0}% success`,
            })
          })
        }

        // Sort by timestamp descending
        auditEntries.sort((a, b) => b.timestamp - a.timestamp)
        setEntries(auditEntries)
      } catch {
        // leave empty
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [])

  const filtered = entries.filter(e => {
    if (entityFilter && e.entity !== entityFilter) return false
    if (filterText) {
      const lower = filterText.toLowerCase()
      return e.entityName.toLowerCase().includes(lower)
        || e.action.toLowerCase().includes(lower)
        || e.detail.toLowerCase().includes(lower)
        || e.entityId.toLowerCase().includes(lower)
    }
    return true
  })

  if (loading) {
    return (
      <ContentLayout header={<Header variant="h1">Audit Log</Header>}>
        <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
          <Spinner size="large" />
          <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading audit log...</Box>
        </Box>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout header={<Header variant="h1" counter={`(${filtered.length} events)`}>Audit Log</Header>}>
      <SpaceBetween size="l">
        <ColumnLayout columns={2}>
          <TextFilter
            filteringText={filterText}
            onChange={({ detail }) => setFilterText(detail.filteringText)}
            filteringPlaceholder="Search by name, action, or ID..."
          />
          <Select
            selectedOption={entityFilter ? { value: entityFilter, label: entityFilter } : null}
            options={[
              { value: 'ticket', label: 'Tickets' },
              { value: 'target', label: 'Targets' },
              { value: 'tool', label: 'Tools' },
            ]}
            placeholder="All entities"
            onChange={({ detail }) => setEntityFilter(detail.selectedOption.value ?? null)}
          />
        </ColumnLayout>

        <Container header={<Header variant="h2">Recent Activity</Header>}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">&#128203;</div>
              <div className="empty-state-title">No audit entries</div>
              <div className="empty-state-description">Activity will appear here as tickets, targets, and tools are created or modified.</div>
            </div>
          ) : (
            <SpaceBetween size="xxs">
              {filtered.map(entry => (
                <div key={entry.id} className="audit-entry">
                  <div className="audit-timestamp">
                    <div>{relativeTime(entry.timestamp)}</div>
                    <div style={{ fontSize: 11, opacity: 0.5 }}>{formatTime(entry.timestamp)}</div>
                  </div>
                  <div style={{ minWidth: 70 }}>{entityBadge(entry.entity)}</div>
                  <div className="audit-action">
                    <Badge color={
                      entry.action === 'Created' ? 'blue' :
                      entry.action === 'Registered' ? 'green' :
                      entry.action === 'Submitted' ? 'grey' : 'grey'
                    }>{entry.action}</Badge>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.entityName}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{entry.detail}</div>
                  </div>
                  {entry.user && (
                    <div style={{ fontSize: 12, opacity: 0.6, flexShrink: 0 }}>{entry.user}</div>
                  )}
                </div>
              ))}
            </SpaceBetween>
          )}
        </Container>
      </SpaceBetween>
    </ContentLayout>
  )
}
