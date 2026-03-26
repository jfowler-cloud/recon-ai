import '@testing-library/jest-dom'

// Mock Amplify
vi.mock('aws-amplify', () => ({
  Amplify: { configure: vi.fn() },
}))

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
      sessionToken: 'test',
    },
  }),
}))

vi.mock('@aws-amplify/ui-react', () => ({
  Authenticator: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) =>
    children({
      signOut: vi.fn(),
      user: {
        signInDetails: { loginId: 'test@test.com' },
        username: 'test-user',
      },
    }),
  useTheme: () => ({ tokens: { space: { large: '16px', small: '8px' }, colors: { font: { secondary: '#999' } } } }),
  View: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>,
  Text: ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children as React.ReactNode}</span>,
  Heading: ({ children, ...props }: Record<string, unknown>) => <h3 {...props}>{children as React.ReactNode}</h3>,
}))

// Mock Cloudscape global styles
vi.mock('@cloudscape-design/global-styles', () => ({
  applyMode: vi.fn(),
  Mode: { Dark: 'dark', Light: 'light' },
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })
