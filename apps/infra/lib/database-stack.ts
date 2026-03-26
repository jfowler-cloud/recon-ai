/**
 * DatabaseStack — 13 DynamoDB tables, S3 buckets (uploads, vectors, hosting),
 * CloudFront distribution, throttle + error alarms.
 *
 * Depends on AuthStack for alarmTopic.
 */
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

interface DatabaseStackProps extends cdk.StackProps {
  alarmTopic: sns.Topic;
  tablePrefix?: string;
}

export class DatabaseStack extends cdk.Stack {
  // Tables
  readonly dataSourcesTable: dynamodb.Table;
  readonly uploadsTable: dynamodb.Table;
  readonly documentsTable: dynamodb.Table;
  readonly ticketsTable: dynamodb.Table;
  readonly ticketNotesTable: dynamodb.Table;
  readonly targetsTable: dynamodb.Table;
  readonly leadershipContextTable: dynamodb.Table;
  readonly toolActionsTable: dynamodb.Table;
  readonly toolsTable: dynamodb.Table;
  readonly chatSessionsTable: dynamodb.Table;
  readonly chatMessagesTable: dynamodb.Table;
  readonly configTable: dynamodb.Table;
  readonly scoringHistoryTable: dynamodb.Table;

  // S3
  readonly uploadsBucket: s3.Bucket;
  readonly vectorsBucket: s3.Bucket;
  readonly hostingBucket: s3.Bucket;

  // CloudFront
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { alarmTopic, tablePrefix = 'RA' } = props;

    const tableDefaults = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    };

    // ── DynamoDB Tables ───────────────────────────────────────────────────────

    this.dataSourcesTable = new dynamodb.Table(this, 'DataSourcesTable', {
      tableName: `${tablePrefix}-DataSources`,
      partitionKey: { name: 'sourceId', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });

    this.uploadsTable = new dynamodb.Table(this, 'UploadsTable', {
      tableName: `${tablePrefix}-Uploads`,
      partitionKey: { name: 'uploadId', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });
    this.uploadsTable.addGlobalSecondaryIndex({
      indexName: 'AnalystIndex',
      partitionKey: { name: 'analystId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
    });
    this.uploadsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'ingestionStatus', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
    });

    this.documentsTable = new dynamodb.Table(this, 'DocumentsTable', {
      tableName: `${tablePrefix}-Documents`,
      partitionKey: { name: 'uploadId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'documentId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
      ...tableDefaults,
    });

    this.ticketsTable = new dynamodb.Table(this, 'TicketsTable', {
      tableName: `${tablePrefix}-Tickets`,
      partitionKey: { name: 'ticketId', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });
    this.ticketsTable.addGlobalSecondaryIndex({
      indexName: 'OwnerIndex',
      partitionKey: { name: 'assigneeId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: dynamodb.AttributeType.NUMBER },
    });
    this.ticketsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: dynamodb.AttributeType.NUMBER },
    });
    this.ticketsTable.addGlobalSecondaryIndex({
      indexName: 'TypeIndex',
      partitionKey: { name: 'ticketType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
    });
    this.ticketsTable.addGlobalSecondaryIndex({
      indexName: 'TargetIndex',
      partitionKey: { name: 'targetId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
    });

    this.ticketNotesTable = new dynamodb.Table(this, 'TicketNotesTable', {
      tableName: `${tablePrefix}-TicketNotes`,
      partitionKey: { name: 'ticketId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'noteId', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });

    this.targetsTable = new dynamodb.Table(this, 'TargetsTable', {
      tableName: `${tablePrefix}-Targets`,
      partitionKey: { name: 'targetId', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });
    this.targetsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'priorityScore', type: dynamodb.AttributeType.NUMBER },
    });

    this.leadershipContextTable = new dynamodb.Table(this, 'LeadershipContextTable', {
      tableName: `${tablePrefix}-LeadershipContext`,
      partitionKey: { name: 'contextId', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });

    this.toolActionsTable = new dynamodb.Table(this, 'ToolActionsTable', {
      tableName: `${tablePrefix}-ToolActions`,
      partitionKey: { name: 'ticketId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'actionId', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });

    this.toolsTable = new dynamodb.Table(this, 'ToolsTable', {
      tableName: `${tablePrefix}-Tools`,
      partitionKey: { name: 'toolId', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });
    this.toolsTable.addGlobalSecondaryIndex({
      indexName: 'CategoryIndex',
      partitionKey: { name: 'category', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
    });
    this.toolsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'name', type: dynamodb.AttributeType.STRING },
    });

    this.chatSessionsTable = new dynamodb.Table(this, 'ChatSessionsTable', {
      tableName: `${tablePrefix}-ChatSessions`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
      ...tableDefaults,
    });

    this.chatMessagesTable = new dynamodb.Table(this, 'ChatMessagesTable', {
      tableName: `${tablePrefix}-ChatMessages`,
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'messageId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
      ...tableDefaults,
    });

    this.configTable = new dynamodb.Table(this, 'ConfigTable', {
      tableName: `${tablePrefix}-Config`,
      partitionKey: { name: 'configKey', type: dynamodb.AttributeType.STRING },
      ...tableDefaults,
    });

    this.scoringHistoryTable = new dynamodb.Table(this, 'ScoringHistoryTable', {
      tableName: `${tablePrefix}-ScoringHistory`,
      partitionKey: { name: 'runId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
      ...tableDefaults,
    });

    // ── S3 Buckets ────────────────────────────────────────────────────────────

    this.uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      bucketName: `recon-ai-uploads-${cdk.Aws.ACCOUNT_ID}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
      eventBridgeEnabled: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3600,
      }],
      lifecycleRules: [{
        noncurrentVersionExpiration: cdk.Duration.days(30),
      }],
    });

    this.vectorsBucket = new s3.Bucket(this, 'VectorsBucket', {
      bucketName: `recon-ai-vectors-${cdk.Aws.ACCOUNT_ID}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [{
        expiration: cdk.Duration.days(365),
        noncurrentVersionExpiration: cdk.Duration.days(7),
        prefix: 'embeddings/',
      }],
    });

    this.hostingBucket = new s3.Bucket(this, 'HostingBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── CloudFront ────────────────────────────────────────────────────────────

    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'OAC for Recon AI frontend',
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: 'RA-SecurityHeaders',
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.hostingBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(5) },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(5) },
      ],
    });

    // ── DynamoDB Throttle Alarms ──────────────────────────────────────────────

    const tables: Record<string, dynamodb.Table> = {
      DataSources: this.dataSourcesTable,
      Uploads: this.uploadsTable,
      Documents: this.documentsTable,
      Tickets: this.ticketsTable,
      TicketNotes: this.ticketNotesTable,
      Targets: this.targetsTable,
      LeadershipContext: this.leadershipContextTable,
      ToolActions: this.toolActionsTable,
      Tools: this.toolsTable,
      ChatSessions: this.chatSessionsTable,
      ChatMessages: this.chatMessagesTable,
      Config: this.configTable,
      ScoringHistory: this.scoringHistoryTable,
    };
    for (const [name, table] of Object.entries(tables)) {
      const alarm = new cloudwatch.Alarm(this, `${name}ThrottleAlarm`, {
        alarmName: `${tablePrefix}-${name}-DynamoThrottle`,
        metric: table.metricThrottledRequests({ period: cdk.Duration.minutes(1) }),
        threshold: 0,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `DynamoDB throttled requests on ${tablePrefix}-${name}`,
      });
      alarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));
    }

    // ── CloudFront Error Alarms ───────────────────────────────────────────────

    const cf5xxAlarm = new cloudwatch.Alarm(this, 'CloudFront5xxAlarm', {
      alarmName: 'RA-CloudFront-5xxErrorRate',
      metric: this.distribution.metricTotalErrorRate({ period: cdk.Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'CloudFront 5xx error rate > 5%',
    });
    cf5xxAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    const cf4xxAlarm = new cloudwatch.Alarm(this, 'CloudFront4xxAlarm', {
      alarmName: 'RA-CloudFront-4xxErrorRate',
      metric: this.distribution.metric4xxErrorRate({ period: cdk.Duration.minutes(5) }),
      threshold: 15,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'CloudFront 4xx error rate > 15%',
    });
    cf4xxAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // ── Outputs ──────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'UploadsTableName', { value: this.uploadsTable.tableName });
    new cdk.CfnOutput(this, 'DocumentsTableName', { value: this.documentsTable.tableName });
    new cdk.CfnOutput(this, 'TargetsTableName', { value: this.targetsTable.tableName });
    new cdk.CfnOutput(this, 'HostingBucketName', { value: this.hostingBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionDomain', { value: this.distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'UploadsBucketName', { value: this.uploadsBucket.bucketName });
    new cdk.CfnOutput(this, 'VectorsBucketName', { value: this.vectorsBucket.bucketName });
  }
}
