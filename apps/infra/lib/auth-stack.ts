/**
 * AuthStack — Cognito User Pool + Identity Pool + groups, SNS alarm topic, budget.
 *
 * Deployed first. All downstream stacks reference resources exported here.
 */
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { Construct } from 'constructs';

export class AuthStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly identityPool: cognito.CfnIdentityPool;
  readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Cognito ───────────────────────────────────────────────────────────────

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'ReconAIUsers',
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      selfSignUpEnabled: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cognito.CfnUserPoolGroup(this, 'OsintAnalystGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'osint-analyst',
    });
    new cognito.CfnUserPoolGroup(this, 'RedTeamAnalystGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'red-team-analyst',
    });
    new cognito.CfnUserPoolGroup(this, 'LeadershipGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'leadership',
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'ReconAIWebClient',
      authFlows: { userPassword: true, userSrp: true },
      preventUserExistenceErrors: true,
    });

    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: 'ReconAIIdentityPool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName,
      }],
    });

    // ── Monitoring ────────────────────────────────────────────────────────────

    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'RA-Alarms',
      displayName: 'Recon AI Alarms',
    });

    // ── Budget Alarm ($25/mo, alert at 80%) ──────────────────────────────────

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'recon-ai-monthly',
        budgetLimit: { amount: 25, unit: 'USD' },
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        costFilters: { TagKeyValue: ['user:Project$ReconAI'] },
      },
      notificationsWithSubscribers: [{
        notification: {
          comparisonOperator: 'GREATER_THAN',
          notificationType: 'ACTUAL',
          threshold: 80,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{
          address: this.alarmTopic.topicArn,
          subscriptionType: 'SNS',
        }],
      }],
    });

    // ── Outputs ──────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId, exportName: 'RA-UserPoolId' });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId, exportName: 'RA-UserPoolClientId' });
    new cdk.CfnOutput(this, 'IdentityPoolId', { value: this.identityPool.ref, exportName: 'RA-IdentityPoolId' });
  }
}
