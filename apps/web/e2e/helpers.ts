import { Page } from '@playwright/test'

/** Inject a mock user before the app boots. */
export async function setUser(
  page: Page,
  opts: { userId?: string; email?: string; groups?: string[] } = {},
) {
  await page.addInitScript((user) => {
    ;(window as any).__E2E_USER__ = user
  }, {
    userId: opts.userId ?? 'e2e-user-1',
    email: opts.email ?? 'e2e@test.com',
    groups: opts.groups ?? ['leadership'],
  })
}

/** Stub all AWS Lambda invocations. */
export async function mockLambda(page: Page, responseBody: object) {
  await page.route('**/lambda.*.amazonaws.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        StatusCode: 200,
        Payload: new TextEncoder().encode(JSON.stringify({
          statusCode: 200,
          body: JSON.stringify(responseBody),
        })),
      }),
    })
  })
}

/** Stub all DynamoDB calls. */
export async function mockDynamoDB(page: Page, responseBody: object) {
  await page.route('**/dynamodb.*.amazonaws.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/x-amz-json-1.0',
      body: JSON.stringify(responseBody),
    })
  })
}

/** Stub Cognito / auth calls. */
export async function mockAuth(page: Page) {
  await page.route('**/cognito-idp.*.amazonaws.com/**', async route => {
    await route.fulfill({ status: 200, body: '{}' })
  })
  await page.route('**/cognito-identity.*.amazonaws.com/**', async route => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        IdentityId: 'us-east-1:mock-identity',
        Credentials: {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          SessionToken: 'mock-session-token',
          Expiration: new Date(Date.now() + 3600000).toISOString(),
        },
      }),
    })
  })
}
