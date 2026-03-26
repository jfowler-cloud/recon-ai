import { test, expect } from '@playwright/test'
import { setUser, mockAuth } from './helpers'

test.describe('Navigation — OSINT Analyst', () => {
  test.beforeEach(async ({ page }) => {
    await setUser(page, { groups: ['osint-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
  })

  test('shows OSINT section in side navigation', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'OSINT' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Upload Data' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Investigations' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'OSINT Chat' })).toBeVisible()
  })

  test('does NOT show Red Team or Leadership sections', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Red Team' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Leadership' })).not.toBeVisible()
  })

  test('defaults to OSINT Dashboard view', async ({ page }) => {
    await expect(page.getByText('Uploads Today')).toBeVisible()
  })

  test('navigates to Upload Data view', async ({ page }) => {
    await page.getByRole('link', { name: 'Upload Data' }).click()
    await expect(page.getByRole('heading', { name: 'Upload Data' })).toBeVisible()
  })

  test('navigates to Investigations view', async ({ page }) => {
    await page.getByRole('link', { name: 'Investigations' }).click()
    await expect(page.getByRole('heading', { name: 'OSINT Investigations' })).toBeVisible()
  })

  test('navigates to OSINT Chat view', async ({ page }) => {
    await page.getByRole('link', { name: 'OSINT Chat' }).click()
    await expect(page.getByRole('heading', { name: 'OSINT Chat' })).toBeVisible()
  })
})

test.describe('Navigation — Red Team Analyst', () => {
  test.beforeEach(async ({ page }) => {
    await setUser(page, { groups: ['red-team-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
  })

  test('shows Red Team section in side navigation', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Red Team' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Target Queue' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Operations' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Red Team Chat' })).toBeVisible()
  })

  test('does NOT show OSINT or Leadership sections', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'OSINT' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Leadership' })).not.toBeVisible()
  })

  test('defaults to Red Team Dashboard view', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Red Team Dashboard' })).toBeVisible()
  })

  test('navigates to Target Queue', async ({ page }) => {
    await page.getByRole('link', { name: 'Target Queue' }).click()
    await expect(page.getByRole('heading', { name: 'Target Queue' })).toBeVisible()
  })

  test('navigates to Operations', async ({ page }) => {
    await page.getByRole('link', { name: 'Operations' }).click()
    await expect(page.getByText(/operation/i).first()).toBeVisible()
  })
})

test.describe('Navigation — Leadership', () => {
  test.beforeEach(async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
  })

  test('shows all three sections (OSINT, Red Team, Leadership)', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'OSINT' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Red Team' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Leadership' })).toBeVisible()
  })

  test('defaults to Leadership Dashboard view', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Leadership Dashboard' })).toBeVisible()
  })

  test('navigates to Goals & KPIs', async ({ page }) => {
    await page.getByRole('link', { name: 'Goals & KPIs' }).click()
    await expect(page.getByRole('heading', { name: 'Goals & KPIs' })).toBeVisible()
  })

  test('navigates to Leadership Chat', async ({ page }) => {
    await page.getByRole('link', { name: 'Leadership Chat' }).click()
    await expect(page.getByRole('heading', { name: 'Leadership Chat' })).toBeVisible()
  })

  test('can navigate cross-domain to OSINT Upload', async ({ page }) => {
    await page.getByRole('link', { name: 'Upload Data' }).click()
    await expect(page.getByRole('heading', { name: 'Upload Data' })).toBeVisible()
  })

  test('can navigate cross-domain to Red Team Target Queue', async ({ page }) => {
    await page.getByRole('link', { name: 'Target Queue' }).click()
    await expect(page.getByRole('heading', { name: 'Target Queue' })).toBeVisible()
  })
})
