/** Shared TypeScript types for Recon AI. */

export type Persona = 'osint-analyst' | 'red-team-analyst' | 'leadership'
export type TicketStatus = 'new' | 'triaging' | 'investigating' | 'active' | 'completed' | 'closed'
export type TicketType = 'osint-investigation' | 'red-team-operation' | 'escalation'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type TargetStatus = 'queued' | 'approved' | 'in-progress' | 'completed' | 'deferred'

export interface Ticket {
  ticketId: string
  ticketType: TicketType
  title: string
  description: string
  status: TicketStatus
  severity: Severity
  assigneeId: string
  targetId?: string
  createdAt: number
  updatedAt: number
}

export interface TicketNote {
  ticketId: string
  noteId: string
  authorId: string
  content: string
  noteType: string
  createdAt: number
}

export interface Target {
  targetId: string
  name: string
  description: string
  status: TargetStatus
  priorityScore: number
  category: string
  vulnerabilities: string[]
  assigneeId?: string
  createdAt: number
}

export interface Upload {
  uploadId: string
  analystId: string
  sourceType: string
  fileName: string
  ingestionStatus: string
  documentCount?: number
  createdAt: number
}

export interface ChatMessage {
  sessionId: string
  messageId: string
  role: 'user' | 'assistant'
  content: string
  outputData?: unknown[]
  createdAt: number
}

export interface ChatSession {
  userId: string
  sessionId: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface LeadershipContext {
  contextId: string
  goals: Array<{ id: string; title: string; description: string; weight: number }>
  kpis: Array<{ id: string; title: string; description: string; weight: number }>
  priorityWeights: { alignment: number; impact: number; effort: number; urgency: number }
  planningWindow: string
}

export interface OutputData {
  type: 'chart' | 'table' | 'diagram' | 'metric'
  chartType?: 'bar' | 'line' | 'pie' | 'area'
  title?: string
  data?: Record<string, unknown>[]
  xKey?: string
  yKeys?: string[]
  colors?: string[]
  columns?: TableColumn[]
  mermaidCode?: string
  value?: number | string
  label?: string
}

export interface TableColumn {
  id: string
  header: string
  sortingField?: string
}

export interface Tool {
  toolId: string
  name: string
  description: string
  category: string
  framework: string
  status: string
  targetTypes: string[]
  protocols: string[]
  riskProfile: {
    serviceDisruption: string
    systemDamage: string
    detectionLikelihood: string
    requiresAuth: boolean
    reversible: boolean
    noisy: boolean
  }
  successProfile: {
    estimatedSuccessRate: number
    avgExecutionTime: string
    requiredAccess: string
    outputType: string
  }
  createdAt: number
}
