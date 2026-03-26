import * as cdk from 'aws-cdk-lib'
import { Template, Match } from 'aws-cdk-lib/assertions'
import { AuthStack } from '../lib/auth-stack'

describe('AuthStack', () => {
  let template: Template

  beforeAll(() => {
    const app = new cdk.App()
    const stack = new AuthStack(app, 'TestAuthStack')
    template = Template.fromStack(stack)
  })

  it('creates a Cognito UserPool', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1)
  })

  it('UserPool has correct name and disables self-signup', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'ReconAIUsers',
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    })
  })

  it('UserPool uses email sign-in', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
    })
  })

  it('UserPool has correct password policy', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireLowercase: true,
          RequireUppercase: true,
          RequireNumbers: true,
          RequireSymbols: false,
        },
      },
    })
  })

  it('UserPool has email-only account recovery', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
      },
    })
  })

  it('UserPool has DeletionPolicy Retain', () => {
    const userPools = template.findResources('AWS::Cognito::UserPool')
    for (const [, resource] of Object.entries(userPools)) {
      expect(resource.DeletionPolicy).toBe('Retain')
    }
  })

  it('creates a UserPool client named ReconAIWebClient', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'ReconAIWebClient',
    })
  })

  it('creates an Identity Pool that disallows unauthenticated access', () => {
    template.hasResourceProperties('AWS::Cognito::IdentityPool', {
      IdentityPoolName: 'ReconAIIdentityPool',
      AllowUnauthenticatedIdentities: false,
    })
  })

  it('creates four user pool groups', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolGroup', 4)
  })

  it('creates osint-analyst group', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
      GroupName: 'osint-analyst',
    })
  })

  it('creates red-team-analyst group', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
      GroupName: 'red-team-analyst',
    })
  })

  it('creates leadership group', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
      GroupName: 'leadership',
    })
  })

  it('creates admin group', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
      GroupName: 'admin',
    })
  })

  it('creates an SNS alarm topic named RA-Alarms', () => {
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'RA-Alarms',
      DisplayName: 'Recon AI Alarms',
    })
  })

  it('creates a monthly budget alarm', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetName: 'recon-ai-monthly',
        BudgetLimit: { Amount: 25, Unit: 'USD' },
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
      },
    })
  })

  it('outputs UserPoolId, UserPoolClientId, and IdentityPoolId', () => {
    const outputs = template.findOutputs('*')
    const outputKeys = Object.keys(outputs)
    expect(outputKeys.some(k => k.startsWith('UserPoolId'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('UserPoolClientId'))).toBe(true)
    expect(outputKeys.some(k => k.startsWith('IdentityPoolId'))).toBe(true)
  })
})
