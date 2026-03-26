import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sns from 'aws-cdk-lib/aws-sns'
import { Template, Match } from 'aws-cdk-lib/assertions'
import { WorkflowStack } from '../lib/workflow-stack'
import { AuthStack } from '../lib/auth-stack'
import { DatabaseStack } from '../lib/database-stack'

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

  const auth = new AuthStack(app, 'TestAuth', { env })

  const db = new DatabaseStack(app, 'TestDb', { env, alarmTopic: auth.alarmTopic })

  const fns = new FunctionsStack(app, 'TestFns', {
    env,
    deploymentTier: 'testing',
    chatModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    enrichmentModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    prioritizationModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    alarmTopic: auth.alarmTopic,
    dataSourcesTable: db.dataSourcesTable,
    uploadsTable: db.uploadsTable,
    documentsTable: db.documentsTable,
    ticketsTable: db.ticketsTable,
    ticketNotesTable: db.ticketNotesTable,
    targetsTable: db.targetsTable,
    leadershipContextTable: db.leadershipContextTable,
    toolActionsTable: db.toolActionsTable,
    chatSessionsTable: db.chatSessionsTable,
    chatMessagesTable: db.chatMessagesTable,
    configTable: db.configTable,
    scoringHistoryTable: db.scoringHistoryTable,
    toolsTable: db.toolsTable,
    uploadsBucket: db.uploadsBucket,
    vectorsBucket: db.vectorsBucket,
  })

  const stack = new WorkflowStack(app, 'TestWorkflowStack', { env, auth, db, fns })
  return Template.fromStack(stack)
}

describe('WorkflowStack', () => {
  let template: Template

  beforeAll(() => {
    template = buildTemplate()
  })

  it('creates 3 Step Functions state machines', () => {
    const machines = template.findResources('AWS::StepFunctions::StateMachine')
    expect(Object.keys(machines).length).toBe(3)
  })

  it('creates RA-IngestionWorkflow state machine', () => {
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineName: 'RA-IngestionWorkflow',
    })
  })

  it('creates RA-EnrichmentWorkflow state machine', () => {
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineName: 'RA-EnrichmentWorkflow',
    })
  })

  it('creates RA-PrioritizationWorkflow state machine', () => {
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineName: 'RA-PrioritizationWorkflow',
    })
  })

  it('all state machines have tracing enabled', () => {
    const machines = template.findResources('AWS::StepFunctions::StateMachine')
    for (const [, resource] of Object.entries(machines)) {
      expect((resource as any).Properties.TracingConfiguration).toEqual({ Enabled: true })
    }
  })

  it('creates log groups for all 3 workflows', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/states/RA-IngestionWorkflow',
    })
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/states/RA-EnrichmentWorkflow',
    })
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/states/RA-PrioritizationWorkflow',
    })
  })

  it('creates an EventBridge rule for S3 upload triggers', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'RA-UploadIngestionTrigger',
      EventPattern: Match.objectLike({
        source: ['aws.s3'],
        'detail-type': ['Object Created'],
      }),
    })
  })

  it('creates failure alarms for all 3 workflows', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'RA-IngestionWorkflow-ExecutionFailed',
    })
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'RA-EnrichmentWorkflow-ExecutionFailed',
    })
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'RA-PrioritizationWorkflow-ExecutionFailed',
    })
  })

  it('creates 5 IAM roles for Cognito identity pool', () => {
    // OsintAnalystRole, RedTeamAnalystRole, LeadershipRole, AdminRole, DefaultAuthRole
    const roles = template.findResources('AWS::IAM::Role', {
      Properties: {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: { Federated: 'cognito-identity.amazonaws.com' },
            }),
          ]),
        }),
      },
    })
    expect(Object.keys(roles).length).toBe(5)
  })

  it('creates a workflow DLQ (SQS queue)', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'RA-WorkflowFailures',
      MessageRetentionPeriod: 1209600,
    })
  })

  it('role mapping has rules for admin group', () => {
    template.hasResourceProperties('AWS::Cognito::IdentityPoolRoleAttachment', {
      RoleMappings: Match.objectLike({
        cognitoProvider: Match.objectLike({
          RulesConfiguration: {
            Rules: Match.arrayWith([
              Match.objectLike({ Claim: 'cognito:groups', Value: 'admin' }),
            ]),
          },
        }),
      }),
    })
  })

  it('creates an identity pool role attachment with rules mapping', () => {
    template.hasResourceProperties('AWS::Cognito::IdentityPoolRoleAttachment', {
      RoleMappings: Match.objectLike({
        cognitoProvider: Match.objectLike({
          Type: 'Rules',
          AmbiguousRoleResolution: 'AuthenticatedRole',
        }),
      }),
    })
  })

  it('role mapping has rules for all 4 groups', () => {
    const resources = template.findResources('AWS::Cognito::IdentityPoolRoleAttachment')
    const attachment = Object.values(resources)[0] as Record<string, unknown>
    const props = attachment.Properties as Record<string, unknown>
    const mappings = props.RoleMappings as Record<string, unknown>
    const provider = mappings.cognitoProvider as Record<string, unknown>
    const config = provider.RulesConfiguration as Record<string, unknown>
    const rules = config.Rules as Array<Record<string, unknown>>
    const groupValues = rules.map(r => r.Value)
    expect(groupValues).toContain('admin')
    expect(groupValues).toContain('osint-analyst')
    expect(groupValues).toContain('red-team-analyst')
    expect(groupValues).toContain('leadership')
    expect(rules).toHaveLength(4)
  })

  it('outputs workflow ARNs for all 3 workflows', () => {
    const outputs = template.findOutputs('*')
    const keys = Object.keys(outputs)
    expect(keys.some(k => k.startsWith('IngestionWorkflowArn'))).toBe(true)
    expect(keys.some(k => k.startsWith('EnrichmentWorkflowArn'))).toBe(true)
    expect(keys.some(k => k.startsWith('PrioritizationWorkflowArn'))).toBe(true)
  })
})
