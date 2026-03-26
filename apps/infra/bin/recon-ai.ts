#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { AuthStack } from '../lib/auth-stack';
import { DatabaseStack } from '../lib/database-stack';
import { FunctionsStack } from '../lib/functions-stack';
import { WorkflowStack } from '../lib/workflow-stack';

const app = new cdk.App();

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'config.json'), 'utf-8')
);
const tier = (app.node.tryGetContext('deploymentTier') || config.deploymentTier) as string;
const models = config.models[tier] || config.models['testing'];

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || config.awsRegion,
};

const tags = {
  Project: 'ReconAI',
  Environment: app.node.tryGetContext('environment') || 'dev',
  ManagedBy: 'CDK',
  CostCenter: 'portfolio',
};

// Stack 1: Auth — Cognito, SNS alarms, budget
const auth = new AuthStack(app, 'RA-Auth', {
  env, tags,
  description: 'Recon AI — Cognito User Pool + Identity Pool + groups',
});

// Stack 2: Database — DynamoDB tables, S3 buckets, CloudFront
const db = new DatabaseStack(app, 'RA-Database', {
  env, tags,
  alarmTopic: auth.alarmTopic,
  description: 'Recon AI — 13 DynamoDB tables, S3 buckets, CloudFront',
});
db.addDependency(auth);

// Stack 3: Functions — Lambda layers, functions, IAM, alarms
const fns = new FunctionsStack(app, 'RA-Functions', {
  env, tags,
  deploymentTier: tier,
  chatModelId: models.chatAgent,
  enrichmentModelId: models.enrichmentAgent,
  prioritizationModelId: models.prioritizationAgent,
  alarmTopic: auth.alarmTopic,
  dataSourcesTable: db.dataSourcesTable,
  uploadsTable: db.uploadsTable,
  documentsTable: db.documentsTable,
  ticketsTable: db.ticketsTable,
  ticketNotesTable: db.ticketNotesTable,
  targetsTable: db.targetsTable,
  leadershipContextTable: db.leadershipContextTable,
  toolActionsTable: db.toolActionsTable,
  toolsTable: db.toolsTable,
  chatSessionsTable: db.chatSessionsTable,
  chatMessagesTable: db.chatMessagesTable,
  configTable: db.configTable,
  scoringHistoryTable: db.scoringHistoryTable,
  uploadsBucket: db.uploadsBucket,
  vectorsBucket: db.vectorsBucket,
  description: 'Recon AI — Lambda functions, layers, IAM',
});
fns.addDependency(db);

// Stack 4: Workflow — Step Functions, EventBridge, Cognito roles
const workflow = new WorkflowStack(app, 'RA-Workflow', {
  env, tags,
  auth, db, fns,
  description: 'Recon AI — Step Functions, EventBridge, Cognito roles',
});
workflow.addDependency(fns);

app.synth();
