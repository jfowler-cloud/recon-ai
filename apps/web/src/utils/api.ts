/** AWS SDK calls via Cognito identity pool credentials. */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { fetchAuthSession } from 'aws-amplify/auth'
import { awsConfig, appConfig } from '@/config/amplify'
import type { Ticket, Target, Upload, Tool } from '@/types'

let _lambdaClient: LambdaClient | null = null
let _ddbClient: DynamoDBDocumentClient | null = null
let _clientExpiry = 0

/** Get or reuse a LambdaClient. Credentials refresh every 50 minutes. */
export async function getLambdaClient(): Promise<LambdaClient> {
  const now = Date.now()
  if (_lambdaClient && now < _clientExpiry) return _lambdaClient

  if (_lambdaClient) _lambdaClient.destroy()

  const session = await fetchAuthSession()
  _lambdaClient = new LambdaClient({
    region: awsConfig.region,
    credentials: session.credentials,
  })
  _clientExpiry = now + 50 * 60 * 1000
  return _lambdaClient
}

/** Get or reuse a DynamoDB DocumentClient. Shares credential cache with Lambda client. */
export async function getDdbClient(): Promise<DynamoDBDocumentClient> {
  const now = Date.now()
  if (_ddbClient && now < _clientExpiry) return _ddbClient

  const session = await fetchAuthSession()
  const raw = new DynamoDBClient({
    region: awsConfig.region,
    credentials: session.credentials,
  })
  _ddbClient = DynamoDBDocumentClient.from(raw)
  _clientExpiry = now + 50 * 60 * 1000
  return _ddbClient
}

/** Generic Lambda invocation with typed return. */
export async function invokeLambda<T>(functionName: string, payload: Record<string, unknown>): Promise<T> {
  const client = await getLambdaClient()
  const response = await client.send(new InvokeCommand({
    FunctionName: functionName,
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  }))

  if (response.FunctionError) {
    const errorBody = response.Payload ? JSON.parse(new TextDecoder().decode(response.Payload)) : {}
    throw new Error(errorBody.errorMessage || `Lambda error in ${functionName}: ${response.FunctionError}`)
  }

  if (!response.Payload) {
    throw new Error(`Empty response from ${functionName}`)
  }

  const raw = JSON.parse(new TextDecoder().decode(response.Payload))

  const body = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw
  return body as T
}

/** Get a presigned S3 upload URL for a file. */
export async function getPresignedUploadUrl(
  fileName: string,
  sourceType: string,
  analystId: string,
): Promise<{ uploadUrl: string; uploadId: string }> {
  return invokeLambda(appConfig.uploadDataFn, { fileName, sourceType, analystId })
}

/** Upload a file to S3 using a presigned URL. */
export async function uploadFileToS3(presignedUrl: string, file: File): Promise<void> {
  const response = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.status} ${response.statusText}`)
  }
}

/** Get runtime config and data sources. */
export async function getConfig(): Promise<{ config: unknown[]; sources: unknown[] }> {
  return invokeLambda(appConfig.getConfigFn, {})
}

/** Trigger manual ingestion. */
export async function triggerIngestion(): Promise<{ message: string }> {
  return invokeLambda(appConfig.triggerIngestionFn, { manual: true })
}

// ── Phase 2 API functions ─────────────────────────────────────────────

/** Fetch aggregated dashboard data for a persona. */
export async function getDashboard(persona: string): Promise<Record<string, unknown>> {
  return invokeLambda(appConfig.getDashboardFn, { persona })
}

/** List tickets, optionally filtered by a GSI query. */
export async function listTickets(
  queryBy?: string,
  queryValue?: string,
): Promise<Ticket[]> {
  const payload: Record<string, unknown> = {}
  if (queryBy) payload.queryBy = queryBy
  if (queryValue) payload.queryValue = queryValue
  const result = await invokeLambda<{ tickets: Ticket[] } | Ticket[]>(appConfig.listTicketsFn, payload)
  return Array.isArray(result) ? result : result.tickets ?? []
}

/** Create a new ticket (investigation or operation). */
export async function createTicket(ticket: Partial<Ticket>): Promise<Ticket> {
  return invokeLambda(appConfig.createTicketFn, { ...ticket })
}

/** Update an existing ticket. */
export async function updateTicket(
  ticketId: string,
  updates: Record<string, unknown>,
): Promise<Ticket> {
  return invokeLambda(appConfig.updateTicketFn, { ticketId, ...updates })
}

/** Queue an OSINT finding for red team engagement. */
export async function queueForRedteam(target: Partial<Target>): Promise<Target> {
  return invokeLambda(appConfig.queueForRedteamFn, { ...target })
}

/** List uploads from RA-Uploads table (DynamoDB scan). */
export async function listUploads(): Promise<Upload[]> {
  const client = await getDdbClient()
  const result = await client.send(new ScanCommand({
    TableName: appConfig.uploadsTable,
    Limit: 50,
  }))
  return (result.Items ?? []) as Upload[]
}

/** List documents for a specific upload from RA-Documents table. */
export async function listDocuments(uploadId: string): Promise<Record<string, unknown>[]> {
  const client = await getDdbClient()
  const result = await client.send(new QueryCommand({
    TableName: appConfig.documentsTable,
    KeyConditionExpression: 'uploadId = :uid',
    ExpressionAttributeValues: { ':uid': uploadId },
  }))
  return (result.Items ?? []) as Record<string, unknown>[]
}

/** Scan targets from RA-Targets table. */
export async function listTargets(): Promise<Target[]> {
  const client = await getDdbClient()
  const result = await client.send(new ScanCommand({
    TableName: appConfig.targetsTable,
    Limit: 100,
  }))
  return (result.Items ?? []) as Target[]
}

// ── Phase 3 API functions ─────────────────────────────────────────────

/** Create a new red team target from a plain-text goal. */
export async function createTarget(
  plainTextGoal: string,
  category: string = 'other',
  createdBy: string = 'unknown',
): Promise<Target> {
  return invokeLambda(appConfig.createTargetFn, { plainTextGoal, category, createdBy })
}

/** Update a target's status or fields. */
export async function updateTarget(
  targetId: string,
  updates: Record<string, unknown>,
): Promise<Target> {
  return invokeLambda(appConfig.updateTargetFn, { targetId, ...updates })
}

/** Manage tools: list, get, create, update. */
export async function manageTools(
  action: 'list' | 'get' | 'create' | 'update',
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return invokeLambda(appConfig.manageToolsFn, { action, ...payload })
}

/** List all tools from RA-Tools table. */
export async function listTools(): Promise<Tool[]> {
  const result = await manageTools('list')
  return (result.tools ?? []) as Tool[]
}

/** Record a tool action against a target/ticket. */
export async function recordToolAction(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return invokeLambda(appConfig.recordToolActionFn, payload)
}

/** Update leadership context (goals, KPIs, weights). */
export async function updateContext(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return invokeLambda(appConfig.updateContextFn, payload)
}

// ── Phase 4 API functions ─────────────────────────────────────────────

/** Send a chat message to a persona-specific agent. */
export async function sendChatMessage(
  userId: string,
  persona: 'osint' | 'redteam' | 'leadership',
  message: string,
  sessionId?: string,
): Promise<{ sessionId: string; messageId: string; content: string; outputData?: unknown }> {
  const payload: Record<string, unknown> = { userId, persona, message }
  if (sessionId) payload.sessionId = sessionId
  return invokeLambda(appConfig.chatHandlerFn, payload)
}

/** Get a chat session with all messages. */
export async function getChatSession(
  userId: string,
  sessionId: string,
): Promise<Record<string, unknown>> {
  return invokeLambda(appConfig.getSessionFn, { userId, sessionId })
}

/** Delete a chat session and its messages. */
export async function deleteChatSession(
  userId: string,
  sessionId: string,
): Promise<Record<string, unknown>> {
  return invokeLambda(appConfig.getSessionFn, { userId, sessionId, action: 'delete' })
}

/** List chat sessions for a user. */
export async function listChatSessions(
  userId: string,
): Promise<Record<string, unknown>> {
  return invokeLambda(appConfig.listSessionsFn, { userId })
}
