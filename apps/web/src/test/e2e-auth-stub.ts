/**
 * E2E stub for aws-amplify/auth — returns fake credentials so the AWS SDK
 * can construct signed requests without a real Cognito session.
 * Aliased in vite.config.ts when mode === 'e2e'.
 */
export async function fetchAuthSession() {
  return {
    credentials: {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'mock-session-token',
      expiration: new Date(Date.now() + 3600_000),
    },
    tokens: undefined,
    identityId: 'us-east-1:mock-identity',
  }
}

export function getCurrentUser() {
  return Promise.resolve({ userId: 'e2e-user-1', username: 'e2e@test.com' })
}

export const signOut = () => Promise.resolve()
export const signIn = () => Promise.resolve({ isSignedIn: true, nextStep: { signInStep: 'DONE' } })
export const signUp = () => Promise.resolve({ isSignUpComplete: true, nextStep: { signUpStep: 'DONE' }, userId: 'e2e' })
export const confirmSignUp = () => Promise.resolve({ isSignUpComplete: true, nextStep: { signUpStep: 'DONE' } })
export const confirmSignIn = () => Promise.resolve({ isSignedIn: true, nextStep: { signInStep: 'DONE' } })
export const resetPassword = () => Promise.resolve({ nextStep: { resetPasswordStep: 'DONE' } })
export const confirmResetPassword = () => Promise.resolve()
export const updatePassword = () => Promise.resolve()
export const deleteUser = () => Promise.resolve()
export const resendSignUpCode = () => Promise.resolve({ destination: 'e2e@test.com' })
export const signInWithRedirect = () => Promise.resolve()
export const autoSignIn = () => Promise.resolve({ isSignedIn: true, nextStep: { signInStep: 'DONE' } })
export const fetchUserAttributes = () => Promise.resolve({})
export const sendUserAttributeVerificationCode = () => Promise.resolve({ destination: 'e2e@test.com' })
export const confirmUserAttribute = () => Promise.resolve()
export const listWebAuthnCredentials = () => Promise.resolve({ credentials: [] })
export const associateWebAuthnCredential = () => Promise.resolve()

export type AuthUser = { userId: string; username: string }
export type SignUpInput = Record<string, unknown>
export type UserAttributeKey = string
