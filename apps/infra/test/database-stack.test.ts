import * as cdk from 'aws-cdk-lib'
import * as sns from 'aws-cdk-lib/aws-sns'
import { Template, Match } from 'aws-cdk-lib/assertions'
import { DatabaseStack } from '../lib/database-stack'

function buildTemplate() {
  const app = new cdk.App()
  const env = { account: '123456789012', region: 'us-east-1' }

  const depStack = new cdk.Stack(app, 'DepStack', { env })
  const alarmTopic = new sns.Topic(depStack, 'AlarmTopic')

  const stack = new DatabaseStack(app, 'TestDatabaseStack', { env, alarmTopic })
  return Template.fromStack(stack)
}

describe('DatabaseStack', () => {
  let template: Template

  beforeAll(() => {
    template = buildTemplate()
  })

  it('creates exactly 13 DynamoDB tables', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 13)
  })

  it('all tables use PAY_PER_REQUEST billing', () => {
    template.allResourcesProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    })
  })

  it('all tables have PITR enabled', () => {
    template.allResourcesProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    })
  })

  it('all tables have DeletionPolicy Retain', () => {
    const tables = template.findResources('AWS::DynamoDB::Table')
    for (const [, resource] of Object.entries(tables)) {
      expect(resource.DeletionPolicy).toBe('Retain')
    }
  })

  it('DataSources table has correct key', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-DataSources',
      KeySchema: [{ AttributeName: 'sourceId', KeyType: 'HASH' }],
    })
  })

  it('Uploads table has AnalystIndex and StatusIndex GSIs', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-Uploads',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'AnalystIndex' }),
        Match.objectLike({ IndexName: 'StatusIndex' }),
      ]),
    })
  })

  it('Documents table has composite key and TTL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-Documents',
      KeySchema: Match.arrayWith([
        { AttributeName: 'uploadId', KeyType: 'HASH' },
        { AttributeName: 'documentId', KeyType: 'RANGE' },
      ]),
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    })
  })

  it('Tickets table has 4 GSIs', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-Tickets',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'OwnerIndex' }),
        Match.objectLike({ IndexName: 'StatusIndex' }),
        Match.objectLike({ IndexName: 'TypeIndex' }),
        Match.objectLike({ IndexName: 'TargetIndex' }),
      ]),
    })
  })

  it('TicketNotes table has composite key', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-TicketNotes',
      KeySchema: Match.arrayWith([
        { AttributeName: 'ticketId', KeyType: 'HASH' },
        { AttributeName: 'noteId', KeyType: 'RANGE' },
      ]),
    })
  })

  it('Targets table has StatusIndex GSI', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-Targets',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'StatusIndex' }),
      ]),
    })
  })

  it('ChatSessions table has TTL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-ChatSessions',
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    })
  })

  it('ChatMessages table has TTL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-ChatMessages',
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    })
  })

  it('Tools table has CategoryIndex and StatusIndex GSIs', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-Tools',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'CategoryIndex' }),
        Match.objectLike({ IndexName: 'StatusIndex' }),
      ]),
    })
  })

  it('Config table has correct partition key', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-Config',
      KeySchema: [{ AttributeName: 'configKey', KeyType: 'HASH' }],
    })
  })

  it('ScoringHistory table has TTL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'RA-ScoringHistory',
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    })
  })

  // S3 Buckets
  it('creates 3 S3 buckets', () => {
    template.resourceCountIs('AWS::S3::Bucket', 3)
  })

  it('all buckets block public access', () => {
    template.allResourcesProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    })
  })

  it('uploads and vectors buckets have versioning enabled', () => {
    const buckets = template.findResources('AWS::S3::Bucket', {
      Properties: {
        VersioningConfiguration: { Status: 'Enabled' },
      },
    })
    expect(Object.keys(buckets).length).toBeGreaterThanOrEqual(2)
  })

  it('uploads bucket has CORS configuration for PUT', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedMethods: ['PUT'],
            AllowedOrigins: ['*'],
          }),
        ]),
      },
    })
  })

  // CloudFront
  it('creates a CloudFront distribution', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1)
  })

  it('creates a CloudFront response headers policy with security headers', () => {
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: Match.objectLike({
          StrictTransportSecurity: Match.objectLike({ Override: true }),
          ContentTypeOptions: { Override: true },
          FrameOptions: Match.objectLike({ FrameOption: 'DENY' }),
          XSSProtection: Match.objectLike({ Protection: true, ModeBlock: true }),
        }),
      },
    })
  })

  it('distribution defaults to index.html', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
      },
    })
  })

  // Alarms
  it('creates 13 DynamoDB throttle alarms', () => {
    const alarms = template.findResources('AWS::CloudWatch::Alarm', {
      Properties: {
        AlarmName: Match.stringLikeRegexp('^RA-.*-DynamoThrottle$'),
      },
    })
    expect(Object.keys(alarms).length).toBe(13)
  })

  it('creates CloudFront error alarms', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'RA-CloudFront-5xxErrorRate',
    })
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'RA-CloudFront-4xxErrorRate',
    })
  })

  it('outputs hosting bucket name and distribution domain', () => {
    const outputs = template.findOutputs('*')
    const outputKeys = Object.keys(outputs)
    expect(outputKeys.some(k => k.startsWith('HostingBucketName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('DistributionDomain'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('UploadsBucketName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('VectorsBucketName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('UploadsTableName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('DocumentsTableName'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('TargetsTableName'))).toBe(true)
  })
})
