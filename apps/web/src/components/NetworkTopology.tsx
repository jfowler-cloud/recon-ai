import { useState, useEffect, useCallback, useMemo } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Panel, useNodesState, useEdgesState, type Node, type Edge, MarkerType } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Badge from '@cloudscape-design/components/badge'
import SpaceBetween from '@cloudscape-design/components/space-between'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import Modal from '@cloudscape-design/components/modal'
import { listTargets, listUploads, createTicket } from '@/utils/api'
import { useAuth } from '@/App'
import type { Target, Upload } from '@/types'

// ── Status colors ────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: '#8c8c8c',
  enriched: '#0972d3',
  active: '#f89256',
  in_progress: '#e8001c',
  'in-progress': '#e8001c',
  completed: '#29a368',
  approved: '#0972d3',
  deferred: '#8c8c8c',
}

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#8c8c8c'
}

const nodeStyle = (status: string, isDark: boolean) => ({
  background: isDark ? '#1e2228' : '#ffffff',
  border: `2px solid ${statusColor(status)}`,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  color: isDark ? '#e8eaed' : '#000716',
  width: 220,
})

const sourceNodeStyle = (isDark: boolean) => ({
  background: isDark ? '#2a2f36' : '#f2f3f3',
  border: '2px solid #a78bfa',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  color: isDark ? '#e8eaed' : '#000716',
  width: 160,
})

// ── Main component ───────────────────────────────────────────────────

export default function NetworkTopology() {
  const { isDarkMode, userId } = useAuth()
  const [targets, setTargets] = useState<Target[]>([])
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [createOpVisible, setCreateOpVisible] = useState(false)
  const [createOpTarget, setCreateOpTarget] = useState<Target | null>(null)
  const [creating, setCreating] = useState(false)

  // Fetch data
  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const [targetsResult, uploadsResult] = await Promise.allSettled([
          listTargets(),
          listUploads(),
        ])
        if (cancelled) return
        if (targetsResult.status === 'fulfilled') setTargets(targetsResult.value)
        if (uploadsResult.status === 'fulfilled') setUploads(uploadsResult.value)
      } catch {
        // leave empty
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [])

  // Build nodes and edges when data changes
  useEffect(() => {
    if (loading) return

    const newNodes: Node[] = []
    const newEdges: Edge[] = []

    // Source type nodes (left side)
    const sourceTypes = [...new Set(uploads.map(u => u.sourceType))]
    const sourceSpacing = Math.max(80, 500 / Math.max(sourceTypes.length, 1))
    sourceTypes.forEach((st, i) => {
      newNodes.push({
        id: `source-${st}`,
        position: { x: 50, y: 50 + i * sourceSpacing },
        data: { label: st.charAt(0).toUpperCase() + st.slice(1) },
        style: sourceNodeStyle(isDarkMode),
        draggable: true,
      })
    })

    // Target nodes (right side, sorted by priority)
    const sorted = [...targets].sort((a, b) => b.priorityScore - a.priorityScore)
    const targetSpacing = Math.max(80, 600 / Math.max(sorted.length, 1))
    sorted.forEach((t, i) => {
      const col = Math.floor(i / 8)
      const row = i % 8
      newNodes.push({
        id: `target-${t.targetId}`,
        position: { x: 400 + col * 280, y: 30 + row * targetSpacing },
        data: {
          label: (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.name || 'Enriching...'}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  background: statusColor(t.status),
                  color: '#fff',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontSize: 10,
                }}>{t.priorityScore}</span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>{t.category}</span>
              </div>
            </div>
          ),
        },
        style: nodeStyle(t.status, isDarkMode),
        draggable: true,
      })

      // Create edges from source types to targets
      sourceTypes.forEach(st => {
        const categoryLower = (t.category || '').toLowerCase()
        const stLower = st.toLowerCase()
        // Loose match: if source type appears in category or vice versa, or both contain common keywords
        if (categoryLower.includes(stLower) || stLower.includes(categoryLower) ||
            categoryLower === 'other' || stLower === 'other') {
          const isActive = t.status === 'approved' || t.status === 'in-progress'
          newEdges.push({
            id: `edge-${st}-${t.targetId}`,
            source: `source-${st}`,
            target: `target-${t.targetId}`,
            animated: isActive,
            style: {
              stroke: isActive ? '#f89256' : '#414d5c',
              strokeDasharray: isActive ? '5 5' : undefined,
            },
            markerEnd: { type: MarkerType.ArrowClosed, color: isActive ? '#f89256' : '#414d5c' },
          })
        }
      })
    })

    setNodes(newNodes)
    setEdges(newEdges)
  }, [targets, uploads, loading, isDarkMode, setNodes, setEdges])

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.id.startsWith('target-')) {
      const targetId = node.id.replace('target-', '')
      const target = targets.find(t => t.targetId === targetId)
      if (target) {
        setSelectedTarget(target)
        setDetailVisible(true)
      }
    }
  }, [targets])

  const handleCreateOperation = useCallback((target: Target) => {
    setCreateOpTarget(target)
    setCreateOpVisible(true)
  }, [])

  const submitCreateOperation = useCallback(async () => {
    if (!createOpTarget) return
    setCreating(true)
    try {
      await createTicket({
        ticketType: 'red-team-operation',
        title: `Operation: ${createOpTarget.name}`,
        description: `Red team operation targeting ${createOpTarget.name} (${createOpTarget.category})`,
        severity: createOpTarget.priorityScore >= 80 ? 'critical' : createOpTarget.priorityScore >= 60 ? 'high' : 'medium',
        status: 'new',
        assigneeId: userId,
        targetId: createOpTarget.targetId,
      })
      setCreateOpVisible(false)
      setCreateOpTarget(null)
    } catch {
      // silently fail
    } finally {
      setCreating(false)
    }
  }, [createOpTarget, userId])

  const legendItems = useMemo(() => [
    { label: 'Queued', color: STATUS_COLORS.queued },
    { label: 'Enriched', color: STATUS_COLORS.enriched },
    { label: 'Active', color: STATUS_COLORS.active },
    { label: 'In Progress', color: STATUS_COLORS.in_progress },
    { label: 'Completed', color: STATUS_COLORS.completed },
    { label: 'Source', color: '#a78bfa' },
  ], [])

  if (loading) {
    return (
      <ContentLayout header={<Header variant="h1">Network Topology</Header>}>
        <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
          <Spinner size="large" />
          <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading topology...</Box>
        </Box>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout header={<Header variant="h1">Network Topology</Header>}>
      <Container>
        <div style={{ height: 'calc(100vh - 200px)', width: '100%' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            style={{ background: isDarkMode ? '#0f1b2a' : '#fafafa' }}
          >
            <Background color={isDarkMode ? '#2d3139' : '#d1d5db'} gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                if (node.id.startsWith('source-')) return '#a78bfa'
                const targetId = node.id.replace('target-', '')
                const t = targets.find(t => t.targetId === targetId)
                return t ? statusColor(t.status) : '#8c8c8c'
              }}
              style={{ background: isDarkMode ? '#1a2332' : '#f2f3f3' }}
            />
            <Panel position="top-left">
              <div style={{
                background: isDarkMode ? '#1a2332' : '#ffffff',
                border: `1px solid ${isDarkMode ? '#414d5c' : '#d1d5db'}`,
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Legend</div>
                {legendItems.map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </Container>

      {/* Target detail modal */}
      <Modal
        visible={detailVisible}
        onDismiss={() => setDetailVisible(false)}
        header={selectedTarget?.name || 'Target Details'}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDetailVisible(false)}>Close</Button>
              {selectedTarget && (
                <Button variant="primary" onClick={() => {
                  setDetailVisible(false)
                  handleCreateOperation(selectedTarget)
                }}>
                  Create Operation
                </Button>
              )}
            </SpaceBetween>
          </Box>
        }
      >
        {selectedTarget && (
          <SpaceBetween size="m">
            <div>
              <Box variant="small" color="text-body-secondary">Target ID</Box>
              <Box variant="p">{selectedTarget.targetId}</Box>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <Box variant="small" color="text-body-secondary">Status</Box>
                <Badge color={selectedTarget.status === 'completed' ? 'green' : selectedTarget.status === 'approved' ? 'blue' : 'grey'}>
                  {selectedTarget.status}
                </Badge>
              </div>
              <div>
                <Box variant="small" color="text-body-secondary">Priority Score</Box>
                <Box variant="p" fontWeight="bold">{selectedTarget.priorityScore}/100</Box>
              </div>
              <div>
                <Box variant="small" color="text-body-secondary">Category</Box>
                <Box variant="p">{selectedTarget.category || '--'}</Box>
              </div>
            </div>
            {selectedTarget.description && (
              <div>
                <Box variant="small" color="text-body-secondary">Description</Box>
                <Box variant="p">{selectedTarget.description}</Box>
              </div>
            )}
            {selectedTarget.vulnerabilities && selectedTarget.vulnerabilities.length > 0 && (
              <div>
                <Box variant="small" color="text-body-secondary">Vulnerabilities</Box>
                <SpaceBetween size="xxs" direction="horizontal">
                  {selectedTarget.vulnerabilities.map((v: string) => <Badge key={v} color="red">{v}</Badge>)}
                </SpaceBetween>
              </div>
            )}
          </SpaceBetween>
        )}
      </Modal>

      {/* Create operation modal */}
      <Modal
        visible={createOpVisible}
        onDismiss={() => setCreateOpVisible(false)}
        header="Create Red Team Operation"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setCreateOpVisible(false)}>Cancel</Button>
              <Button variant="primary" loading={creating} onClick={submitCreateOperation}>
                Create Operation
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {createOpTarget && (
          <SpaceBetween size="m">
            <Box variant="p">
              Create a new red team operation ticket linked to target <strong>{createOpTarget.name}</strong>?
            </Box>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <Box variant="small" color="text-body-secondary">Target</Box>
                <Box variant="p">{createOpTarget.name}</Box>
              </div>
              <div>
                <Box variant="small" color="text-body-secondary">Category</Box>
                <Box variant="p">{createOpTarget.category}</Box>
              </div>
              <div>
                <Box variant="small" color="text-body-secondary">Priority</Box>
                <Box variant="p">{createOpTarget.priorityScore}/100</Box>
              </div>
            </div>
          </SpaceBetween>
        )}
      </Modal>
    </ContentLayout>
  )
}
