/**
 * FunctionsStack — Lambda functions, layers, IAM grants, alarms.
 *
 * Phase 1–4 functions: upload_data, parse_upload, get_config, update_config,
 * seed_data, trigger_ingestion, create_ticket, update_ticket, list_tickets,
 * get_dashboard, queue_for_redteam, create_target, update_context,
 * record_tool_action, chat_handler, get_session, list_sessions.
 * Agents: enrichment, prioritization, osint_chat, redteam_chat, leadership_chat.
 */
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { PythonLayerVersion } from '@aws-cdk/aws-lambda-python-alpha';
import { Construct } from 'constructs';
import * as path from 'path';

interface FunctionsStackProps extends cdk.StackProps {
  deploymentTier: string;
  chatModelId: string;
  enrichmentModelId: string;
  prioritizationModelId: string;
  alarmTopic: sns.Topic;
  dataSourcesTable: dynamodb.Table;
  uploadsTable: dynamodb.Table;
  documentsTable: dynamodb.Table;
  ticketsTable: dynamodb.Table;
  ticketNotesTable: dynamodb.Table;
  targetsTable: dynamodb.Table;
  leadershipContextTable: dynamodb.Table;
  toolActionsTable: dynamodb.Table;
  toolsTable: dynamodb.Table;
  chatSessionsTable: dynamodb.Table;
  chatMessagesTable: dynamodb.Table;
  configTable: dynamodb.Table;
  scoringHistoryTable: dynamodb.Table;
  uploadsBucket: s3.Bucket;
  vectorsBucket: s3.Bucket;
}

export class FunctionsStack extends cdk.Stack {
  readonly uploadDataFn: lambda.Function;
  readonly parseUploadFn: lambda.Function;
  readonly getConfigFn: lambda.Function;
  readonly updateConfigFn: lambda.Function;
  readonly seedDataFn: lambda.Function;
  readonly triggerIngestionFn: lambda.Function;
  readonly createTicketFn: lambda.Function;
  readonly updateTicketFn: lambda.Function;
  readonly listTicketsFn: lambda.Function;
  readonly getDashboardFn: lambda.Function;
  readonly queueForRedteamFn: lambda.Function;
  readonly createTargetFn: lambda.Function;
  readonly updateContextFn: lambda.Function;
  readonly recordToolActionFn: lambda.Function;
  readonly manageToolsFn: lambda.Function;
  readonly updateTargetFn: lambda.Function;
  readonly enrichmentAgentFn: lambda.Function;
  readonly prioritizationAgentFn: lambda.Function;
  readonly chatHandlerFn: lambda.Function;
  readonly getSessionFn: lambda.Function;
  readonly listSessionsFn: lambda.Function;
  readonly osintChatAgentFn: lambda.Function;
  readonly redteamChatAgentFn: lambda.Function;
  readonly leadershipChatAgentFn: lambda.Function;

  constructor(scope: Construct, id: string, props: FunctionsStackProps) {
    super(scope, id, props);

    const {
      deploymentTier, chatModelId, enrichmentModelId, prioritizationModelId,
      alarmTopic,
      dataSourcesTable, uploadsTable, documentsTable,
      ticketsTable, ticketNotesTable, targetsTable,
      leadershipContextTable, toolActionsTable, toolsTable,
      chatSessionsTable, chatMessagesTable,
      configTable, scoringHistoryTable,
      uploadsBucket, vectorsBucket,
    } = props;

    const sharedLayer = new PythonLayerVersion(this, 'SharedLayer', {
      entry: path.join(__dirname, '..', 'layers', 'shared'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'Recon AI shared utilities',
    });

    const agentsLayer = new PythonLayerVersion(this, 'AgentsLayer', {
      entry: path.join(__dirname, '..', 'layers', 'agents'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'Recon AI strands-agents + embeddings',
    });

    const bedrockPolicy = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-*`,
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-*`,
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/us.anthropic.claude-*`,
        'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-*',
        'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-*',
      ],
    });

    const comprehendPolicy = new iam.PolicyStatement({
      actions: ['comprehend:DetectEntities', 'comprehend:DetectSentiment', 'comprehend:DetectKeyPhrases'],
      resources: ['*'],
    });

    const textractPolicy = new iam.PolicyStatement({
      actions: [
        'textract:DetectDocumentText',
        'textract:AnalyzeDocument',
        'textract:StartDocumentTextDetection',
        'textract:GetDocumentTextDetection',
      ],
      resources: ['*'],
    });

    const commonEnv: Record<string, string> = {
      DEPLOYMENT_TIER: deploymentTier,
      BEDROCK_MODEL_ID: chatModelId,
      EMBEDDING_MODEL_ID: 'amazon.titan-embed-text-v2:0',
      DATA_SOURCES_TABLE: dataSourcesTable.tableName,
      UPLOADS_TABLE: uploadsTable.tableName,
      DOCUMENTS_TABLE: documentsTable.tableName,
      TICKETS_TABLE: ticketsTable.tableName,
      TICKET_NOTES_TABLE: ticketNotesTable.tableName,
      TARGETS_TABLE: targetsTable.tableName,
      LEADERSHIP_CONTEXT_TABLE: leadershipContextTable.tableName,
      TOOL_ACTIONS_TABLE: toolActionsTable.tableName,
      TOOLS_TABLE: toolsTable.tableName,
      CHAT_SESSIONS_TABLE: chatSessionsTable.tableName,
      CHAT_MESSAGES_TABLE: chatMessagesTable.tableName,
      CONFIG_TABLE: configTable.tableName,
      SCORING_HISTORY_TABLE: scoringHistoryTable.tableName,
      UPLOADS_BUCKET: uploadsBucket.bucketName,
      VECTORS_BUCKET: vectorsBucket.bucketName,
      TTL_DOCUMENTS_DAYS: '365',
      TTL_SESSIONS_DAYS: '90',
      COMPREHEND_ENRICHMENT: 'true',
    };

    const makeFn = (
      name: string,
      layers: lambda.ILayerVersion[],
      timeout = cdk.Duration.minutes(5),
      memorySize = 512,
    ): lambda.Function => {
      return new lambda.Function(this, `${name}Fn`, {
        functionName: `ra-${name}`,
        runtime: lambda.Runtime.PYTHON_3_13,
        architecture: lambda.Architecture.ARM_64,
        handler: 'handler.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'functions', name)),
        timeout,
        memorySize,
        environment: commonEnv,
        tracing: lambda.Tracing.ACTIVE,
        layers,
      });
    };

    // Bundle from agents/ root so shared/ module is available alongside each agent dir
    const agentsRoot = path.join(__dirname, '..', '..', 'agents');

    const makeAgentFn = (
      name: string,
      agentDir: string,
      timeout = cdk.Duration.minutes(5),
      memorySize = 1024,
      extraEnv: Record<string, string> = {},
    ): lambda.Function => {
      return new lambda.Function(this, `${name}Fn`, {
        functionName: `ra-${agentDir}`,
        runtime: lambda.Runtime.PYTHON_3_13,
        architecture: lambda.Architecture.ARM_64,
        handler: `${agentDir}/handler.handler`,
        code: lambda.Code.fromAsset(agentsRoot, {
          exclude: ['tests', '__pycache__', '.venv', '*.pyc', 'pyproject.toml', 'uv.lock'],
        }),
        timeout,
        memorySize,
        environment: { ...commonEnv, ...extraEnv },
        tracing: lambda.Tracing.ACTIVE,
        layers: [sharedLayer, agentsLayer],
      });
    };

    const allLayers = [sharedLayer, agentsLayer];

    // Phase 1
    this.uploadDataFn = makeFn('upload_data', [sharedLayer], cdk.Duration.seconds(30), 256);
    uploadsTable.grantReadWriteData(this.uploadDataFn);
    uploadsBucket.grantPut(this.uploadDataFn);

    this.parseUploadFn = makeFn('parse_upload', allLayers, cdk.Duration.minutes(10), 1024);
    this.parseUploadFn.addToRolePolicy(bedrockPolicy);
    this.parseUploadFn.addToRolePolicy(comprehendPolicy);
    this.parseUploadFn.addToRolePolicy(textractPolicy);
    uploadsTable.grantReadWriteData(this.parseUploadFn);
    documentsTable.grantReadWriteData(this.parseUploadFn);
    configTable.grantReadWriteData(this.parseUploadFn);
    dataSourcesTable.grantReadData(this.parseUploadFn);
    uploadsBucket.grantRead(this.parseUploadFn);
    vectorsBucket.grantReadWrite(this.parseUploadFn);

    this.getConfigFn = makeFn('get_config', [sharedLayer], cdk.Duration.seconds(30), 256);
    configTable.grantReadData(this.getConfigFn);
    dataSourcesTable.grantReadData(this.getConfigFn);

    this.updateConfigFn = makeFn('update_config', [sharedLayer], cdk.Duration.seconds(30), 256);
    configTable.grantReadWriteData(this.updateConfigFn);

    this.seedDataFn = makeFn('seed_data', [sharedLayer], cdk.Duration.minutes(2), 256);
    dataSourcesTable.grantReadWriteData(this.seedDataFn);
    configTable.grantReadWriteData(this.seedDataFn);

    this.triggerIngestionFn = makeFn('trigger_ingestion', [sharedLayer], cdk.Duration.seconds(30), 256);
    dataSourcesTable.grantReadData(this.triggerIngestionFn);
    const ingestionWorkflowArn = `arn:aws:states:${this.region}:${this.account}:stateMachine:RA-IngestionWorkflow`;
    this.triggerIngestionFn.addEnvironment('INGESTION_WORKFLOW_ARN', ingestionWorkflowArn);
    this.triggerIngestionFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['states:StartExecution'],
      resources: [ingestionWorkflowArn],
    }));

    // Phase 2
    this.createTicketFn = makeFn('create_ticket', [sharedLayer], cdk.Duration.seconds(30), 256);
    ticketsTable.grantReadWriteData(this.createTicketFn);
    ticketNotesTable.grantReadWriteData(this.createTicketFn);

    this.updateTicketFn = makeFn('update_ticket', [sharedLayer], cdk.Duration.seconds(30), 256);
    ticketsTable.grantReadWriteData(this.updateTicketFn);
    ticketNotesTable.grantReadWriteData(this.updateTicketFn);

    this.listTicketsFn = makeFn('list_tickets', [sharedLayer], cdk.Duration.seconds(30), 256);
    ticketsTable.grantReadData(this.listTicketsFn);

    this.getDashboardFn = makeFn('get_dashboard', [sharedLayer], cdk.Duration.seconds(30), 512);
    uploadsTable.grantReadData(this.getDashboardFn);
    ticketsTable.grantReadData(this.getDashboardFn);
    targetsTable.grantReadData(this.getDashboardFn);

    this.queueForRedteamFn = makeFn('queue_for_redteam', [sharedLayer], cdk.Duration.seconds(30), 256);
    targetsTable.grantReadWriteData(this.queueForRedteamFn);

    // Phase 3
    this.createTargetFn = makeFn('create_target', [sharedLayer], cdk.Duration.seconds(30), 256);
    targetsTable.grantReadWriteData(this.createTargetFn);
    const enrichmentWorkflowArn = `arn:aws:states:${this.region}:${this.account}:stateMachine:RA-EnrichmentWorkflow`;
    this.createTargetFn.addEnvironment('ENRICHMENT_WORKFLOW_ARN', enrichmentWorkflowArn);
    this.createTargetFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['states:StartExecution'],
      resources: [enrichmentWorkflowArn],
    }));

    this.updateContextFn = makeFn('update_context', [sharedLayer], cdk.Duration.seconds(30), 256);
    leadershipContextTable.grantReadWriteData(this.updateContextFn);
    const prioritizationWorkflowArn = `arn:aws:states:${this.region}:${this.account}:stateMachine:RA-PrioritizationWorkflow`;
    this.updateContextFn.addEnvironment('PRIORITIZATION_WORKFLOW_ARN', prioritizationWorkflowArn);
    this.updateContextFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['states:StartExecution'],
      resources: [prioritizationWorkflowArn],
    }));

    this.recordToolActionFn = makeFn('record_tool_action', [sharedLayer], cdk.Duration.seconds(30), 256);
    toolActionsTable.grantReadWriteData(this.recordToolActionFn);

    this.manageToolsFn = makeFn('manage_tools', allLayers, cdk.Duration.seconds(60), 512);
    this.manageToolsFn.addToRolePolicy(bedrockPolicy);
    toolsTable.grantReadWriteData(this.manageToolsFn);
    vectorsBucket.grantReadWrite(this.manageToolsFn);

    this.updateTargetFn = makeFn('update_target', [sharedLayer], cdk.Duration.seconds(30), 256);
    targetsTable.grantReadWriteData(this.updateTargetFn);

    this.enrichmentAgentFn = makeAgentFn('EnrichmentAgent', 'target_enrichment', cdk.Duration.seconds(120), 512, { ENRICHMENT_MODEL_ID: enrichmentModelId });
    this.enrichmentAgentFn.addToRolePolicy(bedrockPolicy);
    targetsTable.grantReadWriteData(this.enrichmentAgentFn);
    leadershipContextTable.grantReadData(this.enrichmentAgentFn);

    this.prioritizationAgentFn = makeAgentFn('PrioritizationAgent', 'prioritization', cdk.Duration.minutes(5), 512, { PRIORITIZATION_MODEL_ID: prioritizationModelId });
    this.prioritizationAgentFn.addToRolePolicy(bedrockPolicy);
    targetsTable.grantReadWriteData(this.prioritizationAgentFn);
    leadershipContextTable.grantReadData(this.prioritizationAgentFn);
    scoringHistoryTable.grantReadWriteData(this.prioritizationAgentFn);
    toolsTable.grantReadData(this.prioritizationAgentFn);

    // Phase 4: Chat agents
    this.osintChatAgentFn = makeAgentFn('OsintChatAgent', 'osint_chat_agent');
    this.osintChatAgentFn.addToRolePolicy(bedrockPolicy);
    documentsTable.grantReadData(this.osintChatAgentFn);
    ticketsTable.grantReadData(this.osintChatAgentFn);
    vectorsBucket.grantRead(this.osintChatAgentFn);

    this.redteamChatAgentFn = makeAgentFn('RedteamChatAgent', 'redteam_chat_agent');
    this.redteamChatAgentFn.addToRolePolicy(bedrockPolicy);
    documentsTable.grantReadData(this.redteamChatAgentFn);
    targetsTable.grantReadData(this.redteamChatAgentFn);
    toolActionsTable.grantReadData(this.redteamChatAgentFn);
    toolsTable.grantReadData(this.redteamChatAgentFn);
    leadershipContextTable.grantReadData(this.redteamChatAgentFn);
    vectorsBucket.grantRead(this.redteamChatAgentFn);

    this.leadershipChatAgentFn = makeAgentFn('LeadershipChatAgent', 'leadership_chat_agent');
    this.leadershipChatAgentFn.addToRolePolicy(bedrockPolicy);
    documentsTable.grantReadData(this.leadershipChatAgentFn);
    ticketsTable.grantReadData(this.leadershipChatAgentFn);
    targetsTable.grantReadData(this.leadershipChatAgentFn);
    toolActionsTable.grantReadData(this.leadershipChatAgentFn);
    vectorsBucket.grantRead(this.leadershipChatAgentFn);

    // Phase 4: Session management
    this.chatHandlerFn = makeFn('chat_handler', [sharedLayer], cdk.Duration.minutes(5), 512);
    chatSessionsTable.grantReadWriteData(this.chatHandlerFn);
    chatMessagesTable.grantReadWriteData(this.chatHandlerFn);
    this.chatHandlerFn.addEnvironment('OSINT_AGENT_FN_NAME', this.osintChatAgentFn.functionName);
    this.chatHandlerFn.addEnvironment('REDTEAM_AGENT_FN_NAME', this.redteamChatAgentFn.functionName);
    this.chatHandlerFn.addEnvironment('LEADERSHIP_AGENT_FN_NAME', this.leadershipChatAgentFn.functionName);
    this.osintChatAgentFn.grantInvoke(this.chatHandlerFn);
    this.redteamChatAgentFn.grantInvoke(this.chatHandlerFn);
    this.leadershipChatAgentFn.grantInvoke(this.chatHandlerFn);

    this.getSessionFn = makeFn('get_session', [sharedLayer], cdk.Duration.seconds(30), 256);
    chatSessionsTable.grantReadData(this.getSessionFn);
    chatMessagesTable.grantReadData(this.getSessionFn);

    this.listSessionsFn = makeFn('list_sessions', [sharedLayer], cdk.Duration.seconds(30), 256);
    chatSessionsTable.grantReadData(this.listSessionsFn);

    // CDK Custom Resource: Seed Data
    new cdk.CustomResource(this, 'SeedDataResource', {
      serviceToken: this.seedDataFn.functionArn,
      properties: { Version: '1' },
    });

    // CloudWatch Alarms
    const allFns: lambda.Function[] = [
      this.uploadDataFn, this.parseUploadFn,
      this.getConfigFn, this.updateConfigFn,
      this.seedDataFn, this.triggerIngestionFn,
      this.createTicketFn, this.updateTicketFn,
      this.listTicketsFn, this.getDashboardFn,
      this.queueForRedteamFn,
      this.createTargetFn, this.updateTargetFn, this.updateContextFn,
      this.recordToolActionFn, this.manageToolsFn,
      this.enrichmentAgentFn, this.prioritizationAgentFn,
      this.osintChatAgentFn, this.redteamChatAgentFn,
      this.leadershipChatAgentFn,
      this.chatHandlerFn, this.getSessionFn, this.listSessionsFn,
    ];

    for (const fn of allFns) {
      fn.metricErrors({ period: cdk.Duration.minutes(5) })
        .createAlarm(this, `${fn.node.id}ErrorAlarm`, {
          alarmName: `RA-${fn.node.id}-Errors`,
          threshold: 1, evaluationPeriods: 1,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        })
        .addAlarmAction(new cwActions.SnsAction(alarmTopic));

      fn.metricDuration({ statistic: 'p99', period: cdk.Duration.minutes(5) })
        .createAlarm(this, `${fn.node.id}DurationAlarm`, {
          alarmName: `RA-${fn.node.id}-P99Duration`,
          threshold: fn.timeout!.toMilliseconds() * 0.8,
          evaluationPeriods: 3,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        })
        .addAlarmAction(new cwActions.SnsAction(alarmTopic));
    }

    // Outputs
    new cdk.CfnOutput(this, 'UploadDataFnName', { value: this.uploadDataFn.functionName });
    new cdk.CfnOutput(this, 'ParseUploadFnName', { value: this.parseUploadFn.functionName });
    new cdk.CfnOutput(this, 'TriggerIngestionFnName', { value: this.triggerIngestionFn.functionName });
    new cdk.CfnOutput(this, 'GetConfigFnName', { value: this.getConfigFn.functionName });
    new cdk.CfnOutput(this, 'UpdateConfigFnName', { value: this.updateConfigFn.functionName });
    new cdk.CfnOutput(this, 'CreateTicketFnName', { value: this.createTicketFn.functionName });
    new cdk.CfnOutput(this, 'UpdateTicketFnName', { value: this.updateTicketFn.functionName });
    new cdk.CfnOutput(this, 'ListTicketsFnName', { value: this.listTicketsFn.functionName });
    new cdk.CfnOutput(this, 'GetDashboardFnName', { value: this.getDashboardFn.functionName });
    new cdk.CfnOutput(this, 'QueueForRedteamFnName', { value: this.queueForRedteamFn.functionName });
    new cdk.CfnOutput(this, 'CreateTargetFnName', { value: this.createTargetFn.functionName });
    new cdk.CfnOutput(this, 'UpdateContextFnName', { value: this.updateContextFn.functionName });
    new cdk.CfnOutput(this, 'RecordToolActionFnName', { value: this.recordToolActionFn.functionName });
    new cdk.CfnOutput(this, 'ManageToolsFnName', { value: this.manageToolsFn.functionName });
    new cdk.CfnOutput(this, 'UpdateTargetFnName', { value: this.updateTargetFn.functionName });
    new cdk.CfnOutput(this, 'EnrichmentAgentFnName', { value: this.enrichmentAgentFn.functionName });
    new cdk.CfnOutput(this, 'PrioritizationAgentFnName', { value: this.prioritizationAgentFn.functionName });
    new cdk.CfnOutput(this, 'OsintChatAgentFnName', { value: this.osintChatAgentFn.functionName });
    new cdk.CfnOutput(this, 'RedteamChatAgentFnName', { value: this.redteamChatAgentFn.functionName });
    new cdk.CfnOutput(this, 'LeadershipChatAgentFnName', { value: this.leadershipChatAgentFn.functionName });
    new cdk.CfnOutput(this, 'ChatHandlerFnName', { value: this.chatHandlerFn.functionName });
    new cdk.CfnOutput(this, 'GetSessionFnName', { value: this.getSessionFn.functionName });
    new cdk.CfnOutput(this, 'ListSessionsFnName', { value: this.listSessionsFn.functionName });
  }
}
