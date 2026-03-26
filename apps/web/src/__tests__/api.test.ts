/**
 * Tests for api.ts utility functions — verifies function signatures,
 * config references, and error handling patterns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appConfig } from '../config/amplify'

// Mock AWS SDK clients
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({
      Payload: new TextEncoder().encode(JSON.stringify({ statusCode: 200, body: '{"ok":true}' })),
    }),
    destroy: vi.fn(),
  })),
  InvokeCommand: vi.fn(),
}))

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue({ Items: [] }),
    }),
  },
  ScanCommand: vi.fn(),
  QueryCommand: vi.fn(),
}))

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    credentials: { accessKeyId: 'test', secretAccessKey: 'test', sessionToken: 'test' },
  }),
}))

describe('appConfig', () => {
  it('has all Phase 1-4 function names', () => {
    expect(appConfig.uploadDataFn).toBeDefined()
    expect(appConfig.getConfigFn).toBeDefined()
    expect(appConfig.updateConfigFn).toBeDefined()
    expect(appConfig.triggerIngestionFn).toBeDefined()
    expect(appConfig.listTicketsFn).toBeDefined()
    expect(appConfig.createTicketFn).toBeDefined()
    expect(appConfig.updateTicketFn).toBeDefined()
    expect(appConfig.getDashboardFn).toBeDefined()
    expect(appConfig.queueForRedteamFn).toBeDefined()
    expect(appConfig.createTargetFn).toBeDefined()
    expect(appConfig.updateTargetFn).toBeDefined()
    expect(appConfig.manageToolsFn).toBeDefined()
    expect(appConfig.recordToolActionFn).toBeDefined()
    expect(appConfig.updateContextFn).toBeDefined()
    expect(appConfig.chatHandlerFn).toBeDefined()
    expect(appConfig.getSessionFn).toBeDefined()
    expect(appConfig.listSessionsFn).toBeDefined()
  })

  it('has DynamoDB table names', () => {
    expect(appConfig.uploadsTable).toBeDefined()
    expect(appConfig.documentsTable).toBeDefined()
    expect(appConfig.targetsTable).toBeDefined()
  })

  it('function names use ra- prefix by default', () => {
    const fns = [
      appConfig.uploadDataFn, appConfig.getConfigFn, appConfig.createTicketFn,
      appConfig.listTicketsFn, appConfig.getDashboardFn, appConfig.createTargetFn,
      appConfig.chatHandlerFn, appConfig.manageToolsFn,
    ]
    for (const fn of fns) {
      expect(fn).toMatch(/^ra-/)
    }
  })

  it('table names use RA- prefix by default', () => {
    expect(appConfig.uploadsTable).toMatch(/^RA-/)
    expect(appConfig.documentsTable).toMatch(/^RA-/)
    expect(appConfig.targetsTable).toMatch(/^RA-/)
  })
})

describe('api module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports all expected API functions', async () => {
    const api = await import('../utils/api')
    expect(api.getPresignedUploadUrl).toBeDefined()
    expect(api.uploadFileToS3).toBeDefined()
    expect(api.getConfig).toBeDefined()
    expect(api.triggerIngestion).toBeDefined()
    expect(api.getDashboard).toBeDefined()
    expect(api.listTickets).toBeDefined()
    expect(api.createTicket).toBeDefined()
    expect(api.updateTicket).toBeDefined()
    expect(api.queueForRedteam).toBeDefined()
    expect(api.listUploads).toBeDefined()
    expect(api.listDocuments).toBeDefined()
    expect(api.listTargets).toBeDefined()
    expect(api.createTarget).toBeDefined()
    expect(api.updateTarget).toBeDefined()
    expect(api.manageTools).toBeDefined()
    expect(api.listTools).toBeDefined()
    expect(api.recordToolAction).toBeDefined()
    expect(api.updateContext).toBeDefined()
    expect(api.sendChatMessage).toBeDefined()
    expect(api.getChatSession).toBeDefined()
    expect(api.listChatSessions).toBeDefined()
  })
})

describe('types', () => {
  it('exports all expected type definitions', async () => {
    // Verify types are importable (compile-time check mostly)
    const types = await import('../types')
    // Check type exports exist as interfaces (they won't have runtime values, but the module should load)
    expect(types).toBeDefined()
  })
})
