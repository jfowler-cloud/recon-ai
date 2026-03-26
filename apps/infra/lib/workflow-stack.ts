/**
 * WorkflowStack — Step Functions ingestion workflow, enrichment workflow,
 * prioritization workflow, S3 EventBridge trigger, Phase 4 chat role bindings.
 * Cognito identity pool role bindings for 3 groups.
 *
 * Depends on AuthStack, DatabaseStack, FunctionsStack.
 */
import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as evtTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { AuthStack } from './auth-stack';
import { DatabaseStack } from './database-stack';
import { FunctionsStack } from './functions-stack';

interface WorkflowStackProps extends cdk.StackProps {
  auth: AuthStack;
  db: DatabaseStack;
  fns: FunctionsStack;
}

export class WorkflowStack extends cdk.Stack {
  readonly ingestionWorkflow: sfn.StateMachine;
  readonly enrichmentWorkflow: sfn.StateMachine;
  readonly prioritizationWorkflow: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: WorkflowStackProps) {
    super(scope, id, props);

    const { auth, db, fns } = props;

    // Bedrock model ARNs for Cognito role grants
    const bedrockModelArns = [
      `arn:aws:bedrock:*::foundation-model/anthropic.claude-*-4-*`,
      `arn:aws:bedrock:*:${this.account}:inference-profile/us.anthropic.claude-*-4-*`,
    ];

    // ── Ingestion Workflow ────────────────────────────────────────────────────
    // DetectDataType → parse/extract/embed → UpdateStatus
    // Single parse_upload Lambda handles all modes via event input.

    const detectType = new tasks.LambdaInvoke(this, 'DetectDataType', {
      lambdaFunction: fns.parseUploadFn,
      payload: sfn.TaskInput.fromObject({
        mode: 'detect',
        'uploadId.$': '$.uploadId',
        's3Key.$': '$.s3Key',
        'sourceType.$': '$.sourceType',
      }),
      outputPath: '$.Payload',
    });

    const parseData = new tasks.LambdaInvoke(this, 'ParseData', {
      lambdaFunction: fns.parseUploadFn,
      payload: sfn.TaskInput.fromObject({
        mode: 'parse',
        'uploadId.$': '$.uploadId',
        's3Key.$': '$.s3Key',
        'sourceType.$': '$.sourceType',
        'detectedType.$': '$.detectedType',
      }),
      outputPath: '$.Payload',
    });

    const embedDocuments = new tasks.LambdaInvoke(this, 'EmbedDocuments', {
      lambdaFunction: fns.parseUploadFn,
      payload: sfn.TaskInput.fromObject({
        mode: 'embed',
        'uploadId.$': '$.uploadId',
        'documents.$': '$.documents',
      }),
      outputPath: '$.Payload',
    });

    const updateStatus = new tasks.LambdaInvoke(this, 'UpdateStatus', {
      lambdaFunction: fns.parseUploadFn,
      payload: sfn.TaskInput.fromObject({
        mode: 'finalize',
        'uploadId.$': '$.uploadId',
        'documentCount.$': '$.documentCount',
      }),
      outputPath: '$.Payload',
    });

    const ingestionDef = detectType
      .next(parseData)
      .next(embedDocuments)
      .next(updateStatus);

    const ingestionLogGroup = new logs.LogGroup(this, 'IngestionWorkflowLogs', {
      logGroupName: '/aws/states/RA-IngestionWorkflow',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.ingestionWorkflow = new sfn.StateMachine(this, 'IngestionWorkflow', {
      stateMachineName: 'RA-IngestionWorkflow',
      definitionBody: sfn.DefinitionBody.fromChainable(ingestionDef),
      timeout: cdk.Duration.minutes(15),
      logs: { destination: ingestionLogGroup, level: sfn.LogLevel.ERROR },
      tracingEnabled: true,
    });

    fns.parseUploadFn.grantInvoke(this.ingestionWorkflow);

    // ── Enrichment Workflow ───────────────────────────────────────────────────
    // EnrichTarget(agent) — single step, the agent does all the work

    const enrichTarget = new tasks.LambdaInvoke(this, 'EnrichTarget', {
      lambdaFunction: fns.enrichmentAgentFn,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const enrichmentLogGroup = new logs.LogGroup(this, 'EnrichmentWorkflowLogs', {
      logGroupName: '/aws/states/RA-EnrichmentWorkflow',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.enrichmentWorkflow = new sfn.StateMachine(this, 'EnrichmentWorkflow', {
      stateMachineName: 'RA-EnrichmentWorkflow',
      definitionBody: sfn.DefinitionBody.fromChainable(enrichTarget),
      timeout: cdk.Duration.minutes(5),
      logs: { destination: enrichmentLogGroup, level: sfn.LogLevel.ERROR },
      tracingEnabled: true,
    });

    fns.enrichmentAgentFn.grantInvoke(this.enrichmentWorkflow);

    // ── Prioritization Workflow ───────────────────────────────────────────────
    // ScoreAllTargets(agent) — single step, the agent does all the work

    const scoreAllTargets = new tasks.LambdaInvoke(this, 'ScoreAllTargets', {
      lambdaFunction: fns.prioritizationAgentFn,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const prioritizationLogGroup = new logs.LogGroup(this, 'PrioritizationWorkflowLogs', {
      logGroupName: '/aws/states/RA-PrioritizationWorkflow',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.prioritizationWorkflow = new sfn.StateMachine(this, 'PrioritizationWorkflow', {
      stateMachineName: 'RA-PrioritizationWorkflow',
      definitionBody: sfn.DefinitionBody.fromChainable(scoreAllTargets),
      timeout: cdk.Duration.minutes(10),
      logs: { destination: prioritizationLogGroup, level: sfn.LogLevel.ERROR },
      tracingEnabled: true,
    });

    fns.prioritizationAgentFn.grantInvoke(this.prioritizationWorkflow);

    // ── S3 EventBridge Trigger ────────────────────────────────────────────────
    // Trigger ingestion when a new object is uploaded to the uploads bucket.

    new events.Rule(this, 'UploadTriggerRule', {
      ruleName: 'RA-UploadIngestionTrigger',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [db.uploadsBucket.bucketName] },
          object: { key: [{ prefix: 'uploads/' }] },
        },
      },
      targets: [new evtTargets.SfnStateMachine(this.ingestionWorkflow, {
        input: events.RuleTargetInput.fromObject({
          uploadId: events.EventField.fromPath('$.detail.object.key'),
          s3Key: events.EventField.fromPath('$.detail.object.key'),
          sourceType: 'auto',
        }),
      })],
    });

    // ── SFN Failure Alarms ────────────────────────────────────────────────────

    // Ingestion alarm — keep original construct ID to match existing CloudFormation resource
    this.ingestionWorkflow.metricFailed({ period: cdk.Duration.minutes(5) })
      .createAlarm(this, 'IngestionFailedAlarm', {
        alarmName: 'RA-IngestionWorkflow-ExecutionFailed',
        threshold: 0,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      })
      .addAlarmAction(new cwActions.SnsAction(auth.alarmTopic));

    // Enrichment and prioritization alarms — new
    const newWorkflows = [
      { machine: this.enrichmentWorkflow, name: 'EnrichmentWorkflow' },
      { machine: this.prioritizationWorkflow, name: 'PrioritizationWorkflow' },
    ];

    for (const { machine, name } of newWorkflows) {
      machine.metricFailed({ period: cdk.Duration.minutes(5) })
        .createAlarm(this, `${name}FailedAlarm`, {
          alarmName: `RA-${name}-ExecutionFailed`,
          threshold: 0,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          evaluationPeriods: 1,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        })
        .addAlarmAction(new cwActions.SnsAction(auth.alarmTopic));
    }

    // ── Cognito Identity Pool Role Bindings ──────────────────────────────────

    const federatedPrincipal = new iam.FederatedPrincipal(
      'cognito-identity.amazonaws.com',
      {
        StringEquals: { 'cognito-identity.amazonaws.com:aud': auth.identityPool.ref },
        'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
      },
      'sts:AssumeRoleWithWebIdentity',
    );

    // OSINT Analyst role
    const osintRole = new iam.Role(this, 'OsintAnalystRole', {
      assumedBy: federatedPrincipal,
    });
    fns.uploadDataFn.grantInvoke(osintRole);
    fns.getConfigFn.grantInvoke(osintRole);
    fns.createTicketFn.grantInvoke(osintRole);
    fns.updateTicketFn.grantInvoke(osintRole);
    fns.listTicketsFn.grantInvoke(osintRole);
    fns.queueForRedteamFn.grantInvoke(osintRole);
    fns.getDashboardFn.grantInvoke(osintRole);
    fns.chatHandlerFn.grantInvoke(osintRole);
    fns.getSessionFn.grantInvoke(osintRole);
    fns.listSessionsFn.grantInvoke(osintRole);
    db.uploadsTable.grantReadData(osintRole);
    db.ticketsTable.grantReadData(osintRole);
    osintRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModelWithResponseStream', 'bedrock:InvokeModel'],
      resources: bedrockModelArns,
    }));

    // Red Team Analyst role
    const redteamRole = new iam.Role(this, 'RedTeamAnalystRole', {
      assumedBy: federatedPrincipal,
    });
    fns.getConfigFn.grantInvoke(redteamRole);
    fns.createTargetFn.grantInvoke(redteamRole);
    fns.updateTargetFn.grantInvoke(redteamRole);
    fns.manageToolsFn.grantInvoke(redteamRole);
    fns.recordToolActionFn.grantInvoke(redteamRole);
    fns.createTicketFn.grantInvoke(redteamRole);
    fns.updateTicketFn.grantInvoke(redteamRole);
    fns.listTicketsFn.grantInvoke(redteamRole);
    fns.getDashboardFn.grantInvoke(redteamRole);
    fns.chatHandlerFn.grantInvoke(redteamRole);
    fns.getSessionFn.grantInvoke(redteamRole);
    fns.listSessionsFn.grantInvoke(redteamRole);
    db.targetsTable.grantReadData(redteamRole);
    db.ticketsTable.grantReadData(redteamRole);
    db.toolActionsTable.grantReadData(redteamRole);
    db.toolsTable.grantReadData(redteamRole);
    redteamRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModelWithResponseStream', 'bedrock:InvokeModel'],
      resources: bedrockModelArns,
    }));

    // Leadership role
    const leadershipRole = new iam.Role(this, 'LeadershipRole', {
      assumedBy: federatedPrincipal,
    });
    fns.getConfigFn.grantInvoke(leadershipRole);
    fns.updateConfigFn.grantInvoke(leadershipRole);
    fns.updateContextFn.grantInvoke(leadershipRole);
    fns.getDashboardFn.grantInvoke(leadershipRole);
    fns.chatHandlerFn.grantInvoke(leadershipRole);
    fns.getSessionFn.grantInvoke(leadershipRole);
    fns.listSessionsFn.grantInvoke(leadershipRole);
    db.leadershipContextTable.grantReadWriteData(leadershipRole);
    db.ticketsTable.grantReadData(leadershipRole);
    db.targetsTable.grantReadData(leadershipRole);
    db.scoringHistoryTable.grantReadData(leadershipRole);
    leadershipRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModelWithResponseStream', 'bedrock:InvokeModel'],
      resources: bedrockModelArns,
    }));

    // Default authenticated role (falls back to osint-analyst permissions)
    const defaultRole = new iam.Role(this, 'DefaultAuthRole', {
      assumedBy: federatedPrincipal,
    });
    fns.getConfigFn.grantInvoke(defaultRole);

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoles', {
      identityPoolId: auth.identityPool.ref,
      roles: { authenticated: defaultRole.roleArn },
      roleMappings: {
        cognitoProvider: {
          identityProvider: `cognito-idp.${this.region}.amazonaws.com/${auth.userPool.userPoolId}:${auth.userPoolClient.userPoolClientId}`,
          type: 'Rules',
          ambiguousRoleResolution: 'AuthenticatedRole',
          rulesConfiguration: {
            rules: [
              {
                claim: 'cognito:groups',
                matchType: 'Contains',
                value: 'osint-analyst',
                roleArn: osintRole.roleArn,
              },
              {
                claim: 'cognito:groups',
                matchType: 'Contains',
                value: 'red-team-analyst',
                roleArn: redteamRole.roleArn,
              },
              {
                claim: 'cognito:groups',
                matchType: 'Contains',
                value: 'leadership',
                roleArn: leadershipRole.roleArn,
              },
            ],
          },
        },
      },
    });

    // ── Outputs ──────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'IngestionWorkflowArn', { value: this.ingestionWorkflow.stateMachineArn });
    new cdk.CfnOutput(this, 'EnrichmentWorkflowArn', { value: this.enrichmentWorkflow.stateMachineArn });
    new cdk.CfnOutput(this, 'PrioritizationWorkflowArn', { value: this.prioritizationWorkflow.stateMachineArn });
  }
}
