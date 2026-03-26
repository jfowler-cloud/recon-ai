import { describe, it, expect } from 'vitest'
import { awsConfig, appConfig, amplifyConfig } from '../config/amplify'

describe('amplify config', () => {
  it('has default region', () => {
    expect(awsConfig.region).toBe('us-east-1')
  })

  it('has app config with function names', () => {
    expect(appConfig.uploadDataFn).toContain('ra-')
    expect(appConfig.getConfigFn).toContain('ra-')
    expect(appConfig.updateConfigFn).toContain('ra-')
    expect(appConfig.triggerIngestionFn).toContain('ra-')
  })

  it('has Cognito auth config structure', () => {
    expect(amplifyConfig.Auth.Cognito).toBeDefined()
    expect(amplifyConfig.Auth.Cognito.loginWith).toEqual({ email: true })
    expect(amplifyConfig.Auth.Cognito.allowGuestAccess).toBe(false)
  })

  it('has password policy', () => {
    const policy = amplifyConfig.Auth.Cognito.passwordFormat
    expect(policy?.minLength).toBe(8)
    expect(policy?.requireLowercase).toBe(true)
    expect(policy?.requireUppercase).toBe(true)
    expect(policy?.requireNumbers).toBe(true)
    expect(policy?.requireSpecialCharacters).toBe(false)
  })
})
