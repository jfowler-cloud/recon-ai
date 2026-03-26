import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sns from 'aws-cdk-lib/aws-sns'
import { Template, Match } from 'aws-cdk-lib/assertions'

// Mock PythonLayerVersion to avoid Docker bundling during tests
jest.mock('@aws-cdk/aws-lambda-python-alpha', () => {
  const lambda = require('aws-cdk-lib/aws-lambda')
  const path = require('path')
  return {
    PythonLayerVersion: class extends lambda.LayerVersion {
      constructor(scope: any, id: string, props: any) {
        super(scope, id, {
          code: lambda.Code.fromAsset(path.join(__dirname, '..')),
          compatibleRuntimes: props.compatibleRuntimes ?? [lambda.Runtime.PYTHON_3_13],
        })
      }
    },
  }
})

import { FunctionsStack } from '../lib/functions-stack'

function buildTemplate() {
  const app = new cdk.App()
  const env = { account: '123456789012', region: 'us-east-1' }

  const depStack = new cdk.Stack(app, 'DepStack', { env })
  const alarmTopic = new sns.Topic(depStack, 'AlarmTopic')

  const tableDefaults = {
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  }

  const makeTable = (id: string, pk: string, sk?: string) =>
    new dynamodb.Table(depStack, id, {
      partitionKey: { name: pk, type: dynamodb.AttributeType.STRING },
      ...(sk ? { sortKey: { name: sk, type: dynamodb.AttributeType.STRING } } : {}),
      ...tableDefaults,
    })

  const dataSourcesTable = makeTable('DataSources', 'sourceId')
  const uploadsTable = makeTable('Uploads', 'uploadId')
  const documentsTable = makeTable('Documents', 'uploadId', 'documentId')
  const ticketsTable = makeTable('Tickets', 'ticketId')
  const ticketNotesTable = makeTable('TicketNotes', 'ticketId', 'noteId')
  const targetsTable = makeTable('Targets', 'targetId')
  const leadershipContextTable = makeTable('LeadershipContext', 'contextId')
  const toolActionsTable = makeTable('ToolActions', 'ticketId', 'actionId')
  const chatSessionsTable = makeTable('ChatSessions', 'userId', 'sessionId')
  const chatMessagesTable = makeTable('ChatMessages', 'sessionId', 'messageId')
  const configTable = makeTable('Config', 'configKey')
  const scoringHistoryTable = makeTable('ScoringHistory', 'runId')
  const toolsTable = makeTable('Tools', 'toolId')

  const uploadsBucket = new s3.Bucket(depStack, 'UploadsBucket')
  const vectorsBucket = new s3.Bucket(depStack, 'VectorsBucket')

  const stack = new FunctionsStack(app, 'TestFunctionsStack', {
    env,
    deploymentTier: 'testing',
    chatModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    enrichmentModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    prioritizationModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    alarmTopic,
    dataSourcesTable, uploadsTable, documentsTable,
    ticketsTable, ticketNotesTable, targetsTable,
    leadershipContextTable, toolActionsTable, toolsTable,
    chatSessionsTable, chatMessagesTable,
    configTable, scoringHistoryTable,
    uploadsBucket, vectorsBucket,
  })

  return Template.fromStack(stack)
}

describe('FunctionsStack', () => {
  let template: Template

  beforeAll(() => {
    template = buildTemplate()
  })

  it('creates all Lambda functions', () => {
    const fns = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'python3.13' },
    })
    // Phase 1: 6, Phase 2: 5, Phase 3: 5 (create_target, update_context, record_tool_action, manage_tools, update_target)
    // Phase 3 agents: 2 (enrichment, prioritization)
    // Phase 4: 6 (chat_handler, get_session, list_sessions, 3 chat agents)
    expect(Object.keys(fns).length).toBe(24)
  })

  it('all handler functions use Python 3.13', () => {
    const fns = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'python3.13' },
    })
    for (const [, resource] of Object.entries(fns)) {
      expect((resource as any).Properties.Runtime).toBe('python3.13')
    }
  })

  it('all handler functions use ARM_64 architecture', () => {
    const fns = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'python3.13' },
    })
    for (const [, resource] of Object.entries(fns)) {
      expect((resource as any).Properties.Architectures).toEqual(['arm64'])
    }
  })

  it('all handler functions use handler.handler pattern', () => {
    const fns = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'python3.13' },
    })
    for (const [, resource] of Object.entries(fns)) {
      // Regular functions: handler.handler; Agents: {agentDir}/handler.handler
      expect((resource as any).Properties.Handler).toMatch(/^(\w+\/)?handler\.handler$/)
    }
  })

  it('all handler functions have X-Ray tracing active', () => {
    const fns = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'python3.13' },
    })
    for (const [, resource] of Object.entries(fns)) {
      expect((resource as any).Properties.TracingConfig).toEqual({ Mode: 'Active' })
    }
  })

  it('creates upload_data function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-upload_data',
    })
  })

  it('creates parse_upload function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-parse_upload',
    })
  })

  it('creates get_config function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-get_config',
    })
  })

  it('creates update_config function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-update_config',
    })
  })

  it('creates seed_data function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-seed_data',
    })
  })

  it('creates trigger_ingestion function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-trigger_ingestion',
    })
  })

  // Phase 3 functions
  it('creates create_target function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-create_target',
    })
  })

  it('creates update_context function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-update_context',
    })
  })

  it('creates record_tool_action function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-record_tool_action',
    })
  })

  it('creates enrichment agent function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-target_enrichment',
      Timeout: 120,
      MemorySize: 512,
    })
  })

  it('creates prioritization agent function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-prioritization',
      Timeout: 300,
      MemorySize: 512,
    })
  })

  it('enrichment agent has ENRICHMENT_MODEL_ID env var', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-target_enrichment',
      Environment: {
        Variables: Match.objectLike({
          ENRICHMENT_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        }),
      },
    })
  })

  it('prioritization agent has PRIORITIZATION_MODEL_ID env var', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-prioritization',
      Environment: {
        Variables: Match.objectLike({
          PRIORITIZATION_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        }),
      },
    })
  })

  it('parse_upload has 10 minute timeout and 1024 MB memory', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-parse_upload',
      Timeout: 600,
      MemorySize: 1024,
    })
  })

  it('upload_data has 30 second timeout and 256 MB memory', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-upload_data',
      Timeout: 30,
      MemorySize: 256,
    })
  })

  it('functions have DEPLOYMENT_TIER env var', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-upload_data',
      Environment: {
        Variables: Match.objectLike({
          DEPLOYMENT_TIER: 'testing',
        }),
      },
    })
  })

  it('functions have BEDROCK_MODEL_ID env var', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'ra-parse_upload',
      Environment: {
        Variables: Match.objectLike({
          BEDROCK_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        }),
      },
    })
  })

  it('creates 2 Lambda layer versions', () => {
    template.resourceCountIs('AWS::Lambda::LayerVersion', 2)
  })

  it('creates a CDK custom resource for seeding data', () => {
    template.resourceCountIs('AWS::CloudFormation::CustomResource', 1)
  })

  it('creates error and duration alarms for each function (48 total)', () => {
    const alarms = template.findResources('AWS::CloudWatch::Alarm', {
      Properties: {
        AlarmName: Match.stringLikeRegexp('^RA-'),
      },
    })
    // 24 functions x 2 alarms each = 48
    expect(Object.keys(alarms).length).toBe(48)
  })

  it('creates a Lambda DLQ (SQS queue)', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'RA-LambdaFailures',
      MessageRetentionPeriod: 1209600, // 14 days
    })
  })

  it('Lambda functions have onFailure destination configured', () => {
    const eventConfigs = template.findResources('AWS::Lambda::EventInvokeConfig')
    expect(Object.keys(eventConfigs).length).toBeGreaterThan(0)
    // At least one event invoke config should have OnFailure destination
    const hasOnFailure = Object.values(eventConfigs).some(
      (r: Record<string, unknown>) => {
        const props = r.Properties as Record<string, unknown> | undefined
        const dest = props?.DestinationConfig as Record<string, unknown> | undefined
        return !!dest?.OnFailure
      }
    )
    expect(hasOnFailure).toBe(true)
  })

  it('outputs function names including Phase 3 and 4', () => {
    const outputs = template.findOutputs('*')
    const outputKeys = Object.keys(outputs)
    expect(outputKeys.some(k => k.startsWith('UploadDataFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('ParseUploadFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('TriggerIngestionFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('GetConfigFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('UpdateConfigFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('CreateTargetFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('UpdateContextFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('RecordToolActionFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('EnrichmentAgentFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('PrioritizationAgentFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('ChatHandlerFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('GetSessionFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('ListSessionsFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('OsintChatAgentFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('RedteamChatAgentFnName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('LeadershipChatAgentFnName'))).toBe(true)
  })
})
