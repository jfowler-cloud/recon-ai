import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, Handle, Position,
  type Node, type Edge, type NodeProps, MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Badge from '@cloudscape-design/components/badge'
import SpaceBetween from '@cloudscape-design/components/space-between'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import Modal from '@cloudscape-design/components/modal'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import ProgressBar from '@cloudscape-design/components/progress-bar'
import FormField from '@cloudscape-design/components/form-field'
import Input from '@cloudscape-design/components/input'
import Select from '@cloudscape-design/components/select'
import Textarea from '@cloudscape-design/components/textarea'
import { listTargets, listUploads, listTickets, listTools, createTicket, updateTarget } from '@/utils/api'
import { useAuth } from '@/App'
import type { Target, Upload, Ticket, Tool } from '@/types'

// ── Colors & constants ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: '#8c8c8c', enriched: '#0972d3', active: '#f89256',
  in_progress: '#e8001c', 'in-progress': '#e8001c', completed: '#29a368',
  approved: '#0972d3', deferred: '#8c8c8c', cancelled: '#5f6b7a',
  new: '#a78bfa', triaging: '#0972d3', investigating: '#f89256', closed: '#5f6b7a',
}

const NODE_TYPE_COLORS = {
  source: '#a78bfa',
  target: '#0972d3',
  tool: '#29a368',
  operation: '#f89256',
}

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#8c8c8c'
}

// ── Dagre auto-layout ───────────────────────────────────────────────

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR',
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 200, edgesep: 30 })

  nodes.forEach((node) => {
    const w = node.type === 'sourceNode' ? 160 : node.type === 'toolNode' ? 180 : node.type === 'operationNode' ? 200 : 240
    const h = node.type === 'sourceNode' ? 60 : node.type === 'toolNode' ? 80 : node.type === 'operationNode' ? 70 : 100
    g.setNode(node.id, { width: w, height: h })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id)
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// ── Custom Node Components ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SourceNode({ data }: NodeProps & { data: any }) {
  const isDark = data.isDark
  return (
    <div style={{
      background: isDark ? '#2a2f36' : '#f2f3f3',
      border: `2px solid ${NODE_TYPE_COLORS.source}`,
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      color: isDark ? '#e8eaed' : '#000716',
      minWidth: 140,
      textAlign: 'center',
    }}>
      <Handle type="source" position={Position.Right} style={{ background: NODE_TYPE_COLORS.source }} />
      <div style={{ fontSize: 9, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 1, marginBottom: 4 }}>Source</div>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{data.label}</div>
      {data.count != null && (
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{data.count} uploads</div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TargetNode({ data }: NodeProps & { data: any }) {
  const isDark = data.isDark
  const status = data.status
  const score = data.score
  return (
    <div
      style={{
        background: isDark ? '#1e2228' : '#ffffff',
        border: `2px solid ${statusColor(status)}`,
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 12,
        color: isDark ? '#e8eaed' : '#000716',
        minWidth: 200,
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: statusColor(status) }} />
      <Handle type="source" position={Position.Right} style={{ background: statusColor(status) }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 1 }}>Target</span>
        <span style={{
          background: statusColor(status), color: '#fff', borderRadius: 4,
          padding: '1px 6px', fontSize: 9, fontWeight: 600,
        }}>{status}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{data.label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          width: 60, height: 4, borderRadius: 2,
          background: isDark ? '#414d5c' : '#d1d5db',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${score}%`, height: '100%', borderRadius: 2,
            background: score >= 80 ? '#e8001c' : score >= 50 ? '#f89256' : '#0972d3',
          }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 600 }}>{score}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{data.category}</span>
      </div>
      {data.vulnCount != null && data.vulnCount > 0 && (
        <div style={{ fontSize: 10, color: '#e8001c', marginTop: 3 }}>
          {data.vulnCount} vuln{data.vulnCount > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ToolNode({ data }: NodeProps & { data: any }) {
  const isDark = data.isDark
  return (
    <div style={{
      background: isDark ? '#1a2e1a' : '#f0fdf4',
      border: `2px solid ${NODE_TYPE_COLORS.tool}`,
      borderRadius: 10,
      padding: '8px 12px',
      fontSize: 12,
      color: isDark ? '#e8eaed' : '#000716',
      minWidth: 160,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: NODE_TYPE_COLORS.tool }} />
      <div style={{ fontSize: 9, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 1, marginBottom: 3 }}>Tool</div>
      <div style={{ fontWeight: 700, fontSize: 12 }}>{data.label}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
        <span style={{
          background: NODE_TYPE_COLORS.tool, color: '#fff', borderRadius: 4,
          padding: '1px 5px', fontSize: 9,
        }}>{data.category}</span>
        {data.risk && (
          <span style={{
            background: data.risk === 'high' ? '#e8001c' : data.risk === 'medium' ? '#f89256' : '#8c8c8c',
            color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 9,
          }}>risk: {data.risk}</span>
        )}
      </div>
      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{data.successRate}% success</div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OperationNode({ data }: NodeProps & { data: any }) {
  const isDark = data.isDark
  const status = data.status
  return (
    <div style={{
      background: isDark ? '#2a1f1a' : '#fff7ed',
      border: `2px solid ${NODE_TYPE_COLORS.operation}`,
      borderRadius: 10,
      padding: '8px 12px',
      fontSize: 12,
      color: isDark ? '#e8eaed' : '#000716',
      minWidth: 180,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: NODE_TYPE_COLORS.operation }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 1 }}>Operation</span>
        <span style={{
          background: statusColor(status), color: '#fff', borderRadius: 4,
          padding: '1px 5px', fontSize: 9,
        }}>{status}</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 11, lineHeight: 1.3 }}>{data.label}</div>
      {data.severity && (
        <span style={{
          background: data.severity === 'critical' ? '#e8001c' : data.severity === 'high' ? '#f89256' : '#0972d3',
          color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 9, marginTop: 3, display: 'inline-block',
        }}>{data.severity}</span>
      )}
    </div>
  )
}

const nodeTypes = {
  sourceNode: SourceNode,
  targetNode: TargetNode,
  toolNode: ToolNode,
  operationNode: OperationNode,
}

// ── Description parser ──────────────────────────────────────────────

function FormattedDescription({ text }: { text: string }) {
  // Parse AI-generated descriptions into structured sections
  // Patterns: "Attack surface includes: (1)...(2)...", "Potential impact:", "Recommended approach:"
  const sections: { heading: string; content: string; items?: string[] }[] = []

  // Split on known section markers
  const sectionPatterns = [
    { pattern: /^(.*?)(?=\.\s*Attack surface)/s, heading: 'Objective' },
    { pattern: /Attack surface includes?:?\s*(.*?)(?=\.\s*Potential impact|$)/si, heading: 'Attack Surface' },
    { pattern: /Potential impact:?\s*(.*?)(?=\.\s*Recommended approach|$)/si, heading: 'Potential Impact' },
    { pattern: /Recommended approach:?\s*(.*?)$/si, heading: 'Recommended Approach' },
  ]

  let matched = false
  for (const { pattern, heading } of sectionPatterns) {
    const match = text.match(pattern)
    if (match && match[1]?.trim()) {
      matched = true
      const content = match[1].trim().replace(/\.$/, '')
      // Extract numbered items like (1)...(2)...
      const numberedItems = content.match(/\(\d+\)\s*[^(]+/g)
      if (numberedItems && numberedItems.length > 1) {
        sections.push({
          heading,
          content: '',
          items: numberedItems.map(item => item.replace(/^\(\d+\)\s*/, '').trim().replace(/,\s*$/, '').replace(/\.$/, '')),
        })
      } else {
        // Split on commas for lists that use "verb X, verb Y, verb Z" pattern
        const commaItems = content.split(/,\s*(?=and\s|[a-z]+\s)/)
        if (heading === 'Recommended Approach' && commaItems.length > 2) {
          sections.push({
            heading,
            content: '',
            items: commaItems.map(item => item.replace(/^and\s+/, '').trim().replace(/\.$/, '')),
          })
        } else {
          sections.push({ heading, content })
        }
      }
    }
  }

  // Fallback: if no patterns matched, just show as paragraphs split by sentence
  if (!matched || sections.length === 0) {
    const sentences = text.split(/\.\s+/).filter(Boolean)
    return (
      <div style={{ lineHeight: 1.6, fontSize: 13 }}>
        {sentences.map((s, i) => (
          <p key={i} style={{ margin: '0 0 6px 0' }}>{s.replace(/\.$/, '')}.</p>
        ))}
      </div>
    )
  }

  return (
    <div style={{ lineHeight: 1.6, fontSize: 13 }}>
      {sections.map((section, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7, marginBottom: 4 }}>
            {section.heading}
          </div>
          {section.content && <div>{section.content}</div>}
          {section.items && (
            <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
              {section.items.map((item, j) => (
                <li key={j} style={{ marginBottom: 2 }}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Context Menu ────────────────────────────────────────────────────

interface ContextMenuState {
  x: number
  y: number
  target: Target | null
}

// ── Main Component ──────────────────────────────────────────────────

export default function NetworkTopology() {
  return (
    <ReactFlowProvider>
      <NetworkTopologyInner />
    </ReactFlowProvider>
  )
}

function NetworkTopologyInner() {
  const { isDarkMode, userId } = useAuth()
  const [targets, setTargets] = useState<Target[]>([])
  const [uploads, setUploads] = useState<Upload[]>([])
  const [operations, setOperations] = useState<Ticket[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [direction, setDirection] = useState<'LR' | 'TB'>('LR')

  // Detail modal
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const flowRef = useRef<HTMLDivElement>(null)

  // Create operation modal
  const [createOpVisible, setCreateOpVisible] = useState(false)
  const [createOpTarget, setCreateOpTarget] = useState<Target | null>(null)
  const [opTitle, setOpTitle] = useState('')
  const [opDesc, setOpDesc] = useState('')
  const [opSeverity, setOpSeverity] = useState('high')
  const [creating, setCreating] = useState(false)

  // Status change modal
  const [statusModalVisible, setStatusModalVisible] = useState(false)
  const [statusTarget, setStatusTarget] = useState<Target | null>(null)
  const [newStatus, setNewStatus] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Fetch all data
  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const [t, u, ops, tl] = await Promise.allSettled([
          listTargets(),
          listUploads(),
          listTickets('type', 'red-team-operation'),
          listTools(),
        ])
        if (cancelled) return
        if (t.status === 'fulfilled') setTargets(t.value)
        if (u.status === 'fulfilled') setUploads(u.value)
        if (ops.status === 'fulfilled') setOperations(ops.value)
        if (tl.status === 'fulfilled') setTools(tl.value)
      } catch {
        // leave empty
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [])

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Context menu handler for target nodes
  const handleTargetContextMenu = useCallback((e: React.MouseEvent, target: Target) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, target })
  }, [])

  // Build graph
  useEffect(() => {
    if (loading) return

    const rawNodes: Node[] = []
    const rawEdges: Edge[] = []

    // ── Source type nodes ──
    const sourceCounts = new Map<string, number>()
    uploads.forEach(u => sourceCounts.set(u.sourceType, (sourceCounts.get(u.sourceType) ?? 0) + 1))
    const sourceTypes = [...sourceCounts.keys()]

    sourceTypes.forEach(st => {
      rawNodes.push({
        id: `source-${st}`,
        type: 'sourceNode',
        position: { x: 0, y: 0 },
        data: {
          label: st.charAt(0).toUpperCase() + st.slice(1),
          count: sourceCounts.get(st),
          isDark: isDarkMode,
        },
      })
    })

    // ── Target nodes ──
    const sorted = [...targets].sort((a, b) => b.priorityScore - a.priorityScore)
    sorted.forEach(t => {
      rawNodes.push({
        id: `target-${t.targetId}`,
        type: 'targetNode',
        position: { x: 0, y: 0 },
        data: {
          label: t.name || 'Enriching...',
          status: t.status,
          score: t.priorityScore,
          category: t.category,
          vulnCount: t.vulnerabilities?.length ?? 0,
          isDark: isDarkMode,
        },
      })
    })

    // ── Tool nodes ──
    tools.forEach(tool => {
      const maxRisk = [tool.riskProfile?.serviceDisruption, tool.riskProfile?.systemDamage, tool.riskProfile?.detectionLikelihood]
        .reduce((max, v) => {
          const order = ['none', 'low', 'medium', 'high']
          return order.indexOf(v ?? '') > order.indexOf(max) ? (v ?? 'low') : max
        }, 'low')

      rawNodes.push({
        id: `tool-${tool.toolId}`,
        type: 'toolNode',
        position: { x: 0, y: 0 },
        data: {
          label: tool.name,
          category: tool.category,
          risk: maxRisk,
          successRate: tool.successProfile?.estimatedSuccessRate ?? 0,
          isDark: isDarkMode,
        },
      })
    })

    // ── Operation nodes ──
    operations.forEach(op => {
      rawNodes.push({
        id: `op-${op.ticketId}`,
        type: 'operationNode',
        position: { x: 0, y: 0 },
        data: {
          label: op.title,
          status: op.status,
          severity: op.severity,
          isDark: isDarkMode,
        },
      })
    })

    // ── Edges: Source → Target (data lineage) ──
    sorted.forEach(t => {
      const catLower = (t.category || '').toLowerCase()
      sourceTypes.forEach(st => {
        const stLower = st.toLowerCase()
        // Match by category overlap or catch-all
        const match = catLower.includes(stLower) || stLower.includes(catLower)
          || catLower === 'other' || stLower === 'other'
          || (catLower === 'network' && stLower === 'nmap')
          || (catLower === 'application' && (stLower === 'shodan' || stLower === 'nmap'))
          || (catLower === 'infrastructure' && (stLower === 'nmap' || stLower === 'shodan'))

        if (match) {
          const isActive = ['active', 'in_progress', 'in-progress', 'approved'].includes(t.status)
          rawEdges.push({
            id: `e-src-${st}-${t.targetId}`,
            source: `source-${st}`,
            target: `target-${t.targetId}`,
            animated: isActive,
            label: 'feeds',
            labelStyle: { fontSize: 9, fill: isDarkMode ? '#8c8c8c' : '#687078' },
            labelBgStyle: { fill: isDarkMode ? '#0f1b2a' : '#fafafa', fillOpacity: 0.8 },
            style: { stroke: isActive ? '#a78bfa' : '#414d5c', strokeWidth: isActive ? 2 : 1 },
            markerEnd: { type: MarkerType.ArrowClosed, color: isActive ? '#a78bfa' : '#414d5c', width: 15, height: 15 },
          })
        }
      })
    })

    // ── Edges: Target → Tool (capability mapping) ──
    sorted.forEach(t => {
      const catLower = (t.category || '').toLowerCase()
      tools.forEach(tool => {
        const toolTargets = (tool.targetTypes ?? []).map(tt => tt.toLowerCase())
        const match = toolTargets.includes(catLower)
          || toolTargets.includes('web') && catLower === 'application'
          || toolTargets.includes('database') && catLower === 'application'
          || toolTargets.includes('network') && catLower === 'infrastructure'

        if (match) {
          rawEdges.push({
            id: `e-tgt-tool-${t.targetId}-${tool.toolId}`,
            source: `target-${t.targetId}`,
            target: `tool-${tool.toolId}`,
            label: 'scans',
            labelStyle: { fontSize: 9, fill: isDarkMode ? '#8c8c8c' : '#687078' },
            labelBgStyle: { fill: isDarkMode ? '#0f1b2a' : '#fafafa', fillOpacity: 0.8 },
            style: { stroke: '#29a368', strokeWidth: 1, strokeDasharray: '4 3' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#29a368', width: 12, height: 12 },
          })
        }
      })
    })

    // ── Edges: Target → Operation (linked ops) ──
    operations.forEach(op => {
      if (op.targetId) {
        const isActive = ['active', 'investigating', 'in_progress'].includes(op.status)
        rawEdges.push({
          id: `e-tgt-op-${op.targetId}-${op.ticketId}`,
          source: `target-${op.targetId}`,
          target: `op-${op.ticketId}`,
          animated: isActive,
          label: 'exploits',
          labelStyle: { fontSize: 9, fill: isDarkMode ? '#8c8c8c' : '#687078' },
          labelBgStyle: { fill: isDarkMode ? '#0f1b2a' : '#fafafa', fillOpacity: 0.8 },
          style: { stroke: isActive ? '#f89256' : '#5f6b7a', strokeWidth: isActive ? 2 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: isActive ? '#f89256' : '#5f6b7a', width: 15, height: 15 },
        })
      }
    })

    // Also link unlinked operations to matching targets by title heuristic
    operations.forEach(op => {
      if (!op.targetId) {
        const matchTarget = sorted.find(t =>
          t.name && op.title && op.title.toLowerCase().includes(t.name.toLowerCase().split(' ')[0])
        )
        if (matchTarget) {
          rawEdges.push({
            id: `e-tgt-op-heuristic-${matchTarget.targetId}-${op.ticketId}`,
            source: `target-${matchTarget.targetId}`,
            target: `op-${op.ticketId}`,
            label: 'related',
            labelStyle: { fontSize: 9, fill: isDarkMode ? '#8c8c8c' : '#687078' },
            labelBgStyle: { fill: isDarkMode ? '#0f1b2a' : '#fafafa', fillOpacity: 0.8 },
            style: { stroke: '#5f6b7a', strokeWidth: 1, strokeDasharray: '6 4' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#5f6b7a', width: 12, height: 12 },
          })
        }
      }
    })

    // Apply dagre layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges, direction)
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [targets, uploads, operations, tools, loading, isDarkMode, direction, setNodes, setEdges])

  // Node click handler
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

  // Context menu actions
  const openCreateOp = useCallback((target: Target) => {
    setCreateOpTarget(target)
    setOpTitle(`Operation: ${target.name}`)
    setOpDesc(`Red team operation targeting ${target.name} (${target.category})`)
    setOpSeverity(target.priorityScore >= 80 ? 'critical' : target.priorityScore >= 60 ? 'high' : 'medium')
    setCreateOpVisible(true)
    setContextMenu(null)
  }, [])

  const openStatusChange = useCallback((target: Target) => {
    setStatusTarget(target)
    setNewStatus(target.status)
    setStatusModalVisible(true)
    setContextMenu(null)
  }, [])

  const submitCreateOperation = useCallback(async () => {
    if (!createOpTarget) return
    setCreating(true)
    try {
      const newOp = await createTicket({
        ticketType: 'red-team-operation',
        title: opTitle,
        description: opDesc,
        severity: opSeverity as 'critical' | 'high' | 'medium' | 'low',
        status: 'new',
        assigneeId: userId,
        targetId: createOpTarget.targetId,
      })
      setOperations(prev => [...prev, newOp])
      setCreateOpVisible(false)
      setCreateOpTarget(null)
    } catch {
      // silent
    } finally {
      setCreating(false)
    }
  }, [createOpTarget, opTitle, opDesc, opSeverity, userId])

  const submitStatusChange = useCallback(async () => {
    if (!statusTarget || !newStatus) return
    setUpdatingStatus(true)
    try {
      const updated = await updateTarget(statusTarget.targetId, { status: newStatus })
      setTargets(prev => prev.map(t => t.targetId === statusTarget.targetId ? { ...t, ...updated } : t))
      setStatusModalVisible(false)
    } catch {
      // silent
    } finally {
      setUpdatingStatus(false)
    }
  }, [statusTarget, newStatus])

  // Re-layout when direction changes
  const toggleDirection = useCallback(() => {
    setDirection(prev => prev === 'LR' ? 'TB' : 'LR')
  }, [])

  // Legend data
  const legendItems = useMemo(() => [
    { label: 'Source', color: NODE_TYPE_COLORS.source, shape: 'circle' },
    { label: 'Target', color: NODE_TYPE_COLORS.target, shape: 'circle' },
    { label: 'Tool', color: NODE_TYPE_COLORS.tool, shape: 'circle' },
    { label: 'Operation', color: NODE_TYPE_COLORS.operation, shape: 'circle' },
    { label: '---', color: 'transparent', shape: 'none' },
    { label: 'Queued', color: STATUS_COLORS.queued, shape: 'square' },
    { label: 'Enriched', color: STATUS_COLORS.enriched, shape: 'square' },
    { label: 'Active', color: STATUS_COLORS.active, shape: 'square' },
    { label: 'In Progress', color: STATUS_COLORS.in_progress, shape: 'square' },
    { label: 'Completed', color: STATUS_COLORS.completed, shape: 'square' },
  ], [])

  // Stats
  const stats = useMemo(() => ({
    sources: new Set(uploads.map(u => u.sourceType)).size,
    targets: targets.length,
    tools: tools.length,
    operations: operations.length,
    activeOps: operations.filter(o => ['active', 'investigating', 'in_progress'].includes(o.status)).length,
    criticalTargets: targets.filter(t => t.priorityScore >= 80).length,
  }), [uploads, targets, tools, operations])

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
    <ContentLayout header={
      <Header variant="h1" counter={`(${targets.length} targets, ${tools.length} tools, ${operations.length} ops)`}>
        Network Topology
      </Header>
    }>
      <Container>
        <div ref={flowRef} style={{ height: 'calc(100vh - 200px)', width: '100%', position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeContextMenu={(event, node) => {
              if (node.id.startsWith('target-')) {
                const targetId = node.id.replace('target-', '')
                const target = targets.find(t => t.targetId === targetId)
                if (target) handleTargetContextMenu(event, target)
              }
            }}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            style={{ background: isDarkMode ? '#0f1b2a' : '#fafafa' }}
            minZoom={0.1}
            maxZoom={2}
          >
            <Background color={isDarkMode ? '#2d3139' : '#d1d5db'} gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'sourceNode') return NODE_TYPE_COLORS.source
                if (node.type === 'toolNode') return NODE_TYPE_COLORS.tool
                if (node.type === 'operationNode') return NODE_TYPE_COLORS.operation
                const targetId = node.id.replace('target-', '')
                const t = targets.find(t => t.targetId === targetId)
                return t ? statusColor(t.status) : '#8c8c8c'
              }}
              style={{ background: isDarkMode ? '#1a2332' : '#f2f3f3' }}
            />

            {/* Legend panel */}
            <Panel position="top-left">
              <div style={{
                background: isDarkMode ? '#1a2332' : '#ffffff',
                border: `1px solid ${isDarkMode ? '#414d5c' : '#d1d5db'}`,
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 11,
                maxWidth: 160,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12 }}>Legend</div>
                {legendItems.map((item, i) => {
                  if (item.label === '---') return <hr key={i} style={{ border: 'none', borderTop: `1px solid ${isDarkMode ? '#414d5c' : '#d1d5db'}`, margin: '6px 0' }} />
                  return (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <div style={{
                        width: 10, height: 10,
                        borderRadius: item.shape === 'circle' ? '50%' : 2,
                        background: item.color,
                      }} />
                      <span>{item.label}</span>
                    </div>
                  )
                })}
                <hr style={{ border: 'none', borderTop: `1px solid ${isDarkMode ? '#414d5c' : '#d1d5db'}`, margin: '6px 0' }} />
                <div style={{ fontSize: 10, opacity: 0.7, lineHeight: 1.4 }}>
                  <div>feeds = data lineage</div>
                  <div>scans = tool capability</div>
                  <div>exploits = active op</div>
                  <div>Animated = active</div>
                </div>
              </div>
            </Panel>

            {/* Stats + controls panel */}
            <Panel position="top-right">
              <div style={{
                background: isDarkMode ? '#1a2332' : '#ffffff',
                border: `1px solid ${isDarkMode ? '#414d5c' : '#d1d5db'}`,
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 11,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12 }}>Overview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
                  <span>{stats.sources} sources</span>
                  <span>{stats.targets} targets</span>
                  <span>{stats.tools} tools</span>
                  <span>{stats.operations} ops</span>
                  <span style={{ color: '#e8001c' }}>{stats.criticalTargets} critical</span>
                  <span style={{ color: '#f89256' }}>{stats.activeOps} active</span>
                </div>
                <Button variant="link" onClick={toggleDirection}>
                  Layout: {direction === 'LR' ? 'Left → Right' : 'Top → Bottom'}
                </Button>
              </div>
            </Panel>
          </ReactFlow>

          {/* Context menu */}
          {contextMenu && contextMenu.target && (
            <div
              style={{
                position: 'fixed',
                top: contextMenu.y,
                left: contextMenu.x,
                background: isDarkMode ? '#1e2228' : '#ffffff',
                border: `1px solid ${isDarkMode ? '#414d5c' : '#d1d5db'}`,
                borderRadius: 8,
                padding: 4,
                zIndex: 9999,
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                minWidth: 180,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ padding: '6px 10px', fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${isDarkMode ? '#414d5c' : '#d1d5db'}`, marginBottom: 2 }}>
                {contextMenu.target.name || 'Target'}
              </div>
              {[
                { label: 'View Details', icon: '🔍', action: () => { setSelectedTarget(contextMenu.target); setDetailVisible(true); setContextMenu(null) } },
                { label: 'Create Operation', icon: '⚡', action: () => openCreateOp(contextMenu.target!) },
                { label: 'Change Status', icon: '📋', action: () => openStatusChange(contextMenu.target!) },
              ].map(item => (
                <div
                  key={item.label}
                  onClick={item.action}
                  style={{
                    padding: '6px 10px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    fontSize: 12,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = isDarkMode ? '#2a2f36' : '#f2f3f3')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>

      {/* ── Target detail modal ── */}
      <Modal
        visible={detailVisible}
        onDismiss={() => setDetailVisible(false)}
        header={selectedTarget?.name || 'Target Details'}
        size="large"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDetailVisible(false)}>Close</Button>
              {selectedTarget && (
                <Button variant="primary" onClick={() => { setDetailVisible(false); openCreateOp(selectedTarget) }}>
                  Create Operation
                </Button>
              )}
            </SpaceBetween>
          </Box>
        }
      >
        {selectedTarget && (
          <SpaceBetween size="m">
            <ColumnLayout columns={4}>
              <div>
                <Box variant="small" color="text-body-secondary">Target ID</Box>
                <Box variant="p" fontSize="body-s">{selectedTarget.targetId}</Box>
              </div>
              <div>
                <Box variant="small" color="text-body-secondary">Status</Box>
                <Badge color={selectedTarget.status === 'completed' ? 'green' : ['active', 'enriched', 'approved'].includes(selectedTarget.status) ? 'blue' : 'grey'}>
                  {selectedTarget.status}
                </Badge>
              </div>
              <div>
                <Box variant="small" color="text-body-secondary">Priority Score</Box>
                <ProgressBar value={selectedTarget.priorityScore} additionalInfo={`${selectedTarget.priorityScore}/100`} />
              </div>
              <div>
                <Box variant="small" color="text-body-secondary">Category</Box>
                <Box variant="p">{selectedTarget.category || '--'}</Box>
              </div>
            </ColumnLayout>
            {selectedTarget.description && (
              <div>
                <Box variant="small" color="text-body-secondary">Description</Box>
                <FormattedDescription text={selectedTarget.description} />
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
            {/* Related operations */}
            {operations.filter(op => op.targetId === selectedTarget.targetId).length > 0 && (
              <div>
                <Box variant="small" color="text-body-secondary">Linked Operations</Box>
                <SpaceBetween size="xs">
                  {operations.filter(op => op.targetId === selectedTarget.targetId).map(op => (
                    <div key={op.ticketId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Badge color={op.severity === 'critical' ? 'red' : op.severity === 'high' ? 'red' : 'blue'}>{op.severity}</Badge>
                      <span>{op.title}</span>
                      <Badge color={op.status === 'completed' ? 'green' : 'grey'}>{op.status}</Badge>
                    </div>
                  ))}
                </SpaceBetween>
              </div>
            )}
            {/* Matching tools */}
            {tools.filter(tool => {
              const catLower = (selectedTarget.category || '').toLowerCase()
              return (tool.targetTypes ?? []).some(tt => tt.toLowerCase() === catLower || (tt === 'web' && catLower === 'application'))
            }).length > 0 && (
              <div>
                <Box variant="small" color="text-body-secondary">Available Tools</Box>
                <SpaceBetween size="xxs" direction="horizontal">
                  {tools.filter(tool => {
                    const catLower = (selectedTarget.category || '').toLowerCase()
                    return (tool.targetTypes ?? []).some(tt => tt.toLowerCase() === catLower || (tt === 'web' && catLower === 'application'))
                  }).map(tool => (
                    <Badge key={tool.toolId} color="green">{tool.name} ({tool.successProfile?.estimatedSuccessRate}%)</Badge>
                  ))}
                </SpaceBetween>
              </div>
            )}
          </SpaceBetween>
        )}
      </Modal>

      {/* ── Create operation modal ── */}
      <Modal
        visible={createOpVisible}
        onDismiss={() => setCreateOpVisible(false)}
        header="Create Red Team Operation"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setCreateOpVisible(false)}>Cancel</Button>
              <Button variant="primary" loading={creating} onClick={submitCreateOperation} disabled={!opTitle.trim()}>
                Create Operation
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {createOpTarget && (
          <SpaceBetween size="m">
            <ColumnLayout columns={3}>
              <div>
                <Box variant="small" color="text-body-secondary">Target</Box>
                <Box variant="p" fontWeight="bold">{createOpTarget.name}</Box>
              </div>
              <div>
                <Box variant="small" color="text-body-secondary">Category</Box>
                <Box variant="p">{createOpTarget.category}</Box>
              </div>
              <div>
                <Box variant="small" color="text-body-secondary">Priority</Box>
                <Box variant="p">{createOpTarget.priorityScore}/100</Box>
              </div>
            </ColumnLayout>
            <FormField label="Operation Title">
              <Input value={opTitle} onChange={({ detail }) => setOpTitle(detail.value)} />
            </FormField>
            <FormField label="Description">
              <Textarea value={opDesc} onChange={({ detail }) => setOpDesc(detail.value)} rows={3} />
            </FormField>
            <FormField label="Severity">
              <Select
                selectedOption={{ value: opSeverity, label: opSeverity }}
                options={[
                  { value: 'critical', label: 'Critical' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ]}
                onChange={({ detail }) => setOpSeverity(detail.selectedOption.value ?? 'high')}
              />
            </FormField>
          </SpaceBetween>
        )}
      </Modal>

      {/* ── Status change modal ── */}
      <Modal
        visible={statusModalVisible}
        onDismiss={() => setStatusModalVisible(false)}
        header="Change Target Status"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setStatusModalVisible(false)}>Cancel</Button>
              <Button variant="primary" loading={updatingStatus} onClick={submitStatusChange}>
                Update Status
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {statusTarget && (
          <SpaceBetween size="m">
            <div>
              <Box variant="small" color="text-body-secondary">Target</Box>
              <Box variant="p" fontWeight="bold">{statusTarget.name}</Box>
            </div>
            <FormField label="New Status">
              <Select
                selectedOption={{ value: newStatus, label: newStatus }}
                options={[
                  { value: 'queued', label: 'Queued' },
                  { value: 'enriched', label: 'Enriched' },
                  { value: 'active', label: 'Active' },
                  { value: 'in_progress', label: 'In Progress' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
                onChange={({ detail }) => setNewStatus(detail.selectedOption.value ?? '')}
              />
            </FormField>
          </SpaceBetween>
        )}
      </Modal>
    </ContentLayout>
  )
}
