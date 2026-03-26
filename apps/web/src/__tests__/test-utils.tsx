/**
 * Shared test utilities — mock providers, render helpers, and sample data.
 * NOTE: vi.mock calls must be in the test files themselves (hoisted to top level).
 */
import React from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { AuthContext } from '../App'
import type { ViewType } from '../App'

// ── AuthContext wrapper ─────────────────────────────────────────────

interface AuthOverrides {
  userId?: string
  groups?: string[]
  persona?: 'osint-analyst' | 'red-team-analyst' | 'leadership'
  isAdmin?: boolean
  isDarkMode?: boolean
  navigate?: (v: ViewType) => void
}

export function renderWithAuth(ui: React.ReactElement, overrides: AuthOverrides = {}) {
  const value = {
    userId: overrides.userId ?? 'test-user',
    groups: overrides.groups ?? ['osint-analyst'],
    persona: overrides.persona ?? 'osint-analyst' as const,
    isAdmin: overrides.isAdmin ?? false,
    isDarkMode: overrides.isDarkMode ?? true,
    navigate: overrides.navigate ?? vi.fn(),
  }
  return render(
    <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>
  )
}

// ── API mock object ─────────────────────────────────────────────────

export const mockApi = {
  getDashboard: vi.fn(),
  listUploads: vi.fn(),
  listTargets: vi.fn(),
  listTickets: vi.fn(),
  listTools: vi.fn(),
  createTicket: vi.fn(),
  updateTicket: vi.fn(),
  createTarget: vi.fn(),
  updateTarget: vi.fn(),
  manageTools: vi.fn(),
  updateContext: vi.fn(),
  sendChatMessage: vi.fn(),
  listChatSessions: vi.fn(),
  getChatSession: vi.fn(),
  getPresignedUploadUrl: vi.fn(),
  uploadFileToS3: vi.fn(),
  getConfig: vi.fn(),
  triggerIngestion: vi.fn(),
  recordToolAction: vi.fn(),
  invokeLambda: vi.fn(),
  getLambdaClient: vi.fn(),
  getDdbClient: vi.fn(),
  listDocuments: vi.fn(),
  queueForRedteam: vi.fn(),
}

// ── Sample data ─────────────────────────────────────────────────────

export const sampleTargets = [
  { targetId: 'tgt-1', name: 'MongoDB Instance', status: 'enriched', priorityScore: 85, category: 'application', vulnerabilities: ['CVE-2024-001'], createdAt: 1710000000, assigneeId: 'analyst-1' },
  { targetId: 'tgt-2', name: 'VPN Gateway', status: 'active', priorityScore: 72, category: 'network', vulnerabilities: [], createdAt: 1710100000 },
  { targetId: 'tgt-3', name: 'K8s API Server', status: 'queued', priorityScore: 90, category: 'infrastructure', vulnerabilities: ['CVE-2024-002', 'CVE-2024-003'], createdAt: 1710200000 },
]

export const sampleTickets = [
  { ticketId: 'TKT-001', title: 'Exposed MongoDB', ticketType: 'osint-investigation', status: 'new', severity: 'critical', assigneeId: 'analyst-1', createdAt: 1710000000, updatedAt: 1710000000 },
  { ticketId: 'TKT-002', title: 'VPN RCE', ticketType: 'osint-investigation', status: 'investigating', severity: 'high', assigneeId: 'analyst-2', createdAt: 1710100000, updatedAt: 1710200000 },
  { ticketId: 'TKT-003', title: 'ProxyLogon Exploit', ticketType: 'red-team-operation', status: 'active', severity: 'critical', assigneeId: 'analyst-1', createdAt: 1710200000, updatedAt: 1710300000, targetId: 'tgt-1' },
]

export const sampleTools = [
  { toolId: 'tool-1', name: 'Nmap', description: 'Network scanner', category: 'reconnaissance', framework: 'nmap', status: 'active', targetTypes: ['network', 'infrastructure'], protocols: ['tcp', 'udp'], riskProfile: { serviceDisruption: 'low', systemDamage: 'none', detectionLikelihood: 'medium', requiresAuth: false, reversible: true, noisy: true }, successProfile: { estimatedSuccessRate: 95, avgExecutionTime: '30s', requiredAccess: 'network', outputType: 'data' }, createdAt: 1710000000 },
  { toolId: 'tool-2', name: 'Metasploit', description: 'Exploit framework', category: 'exploitation', framework: 'metasploit', status: 'active', targetTypes: ['web', 'network', 'application'], protocols: ['tcp', 'http'], riskProfile: { serviceDisruption: 'high', systemDamage: 'medium', detectionLikelihood: 'high', requiresAuth: false, reversible: false, noisy: true }, successProfile: { estimatedSuccessRate: 65, avgExecutionTime: '5m', requiredAccess: 'network', outputType: 'shell' }, createdAt: 1710100000 },
]

export const sampleUploads = [
  { uploadId: 'up-1', analystId: 'analyst-1', sourceType: 'shodan', fileName: 'scan.json', ingestionStatus: 'completed', documentCount: 15, createdAt: 1710000000 },
  { uploadId: 'up-2', analystId: 'analyst-2', sourceType: 'nmap', fileName: 'network.xml', ingestionStatus: 'processing', documentCount: 0, createdAt: 1710100000 },
]

export const sampleDashboard = {
  uploads: { total: 5, byStatus: { completed: 3, processing: 2 } },
  tickets: { total: 8, byStatus: { new: 2, investigating: 3, active: 2, completed: 1 }, bySeverity: { critical: 3, high: 2, medium: 2, low: 1 }, byType: { 'osint-investigation': 5, 'red-team-operation': 3 } },
  targets: { total: 5, byStatus: { queued: 1, enriched: 2, active: 2 } },
  recentTickets: sampleTickets,
}
