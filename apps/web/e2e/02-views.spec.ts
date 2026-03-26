import { test, expect } from '@playwright/test'
import { setUser, mockAuth } from './helpers'

test.describe('OSINT Views render real components', () => {
  test.beforeEach(async ({ page }) => {
    await setUser(page, { groups: ['osint-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
  })

  test('OSINT Dashboard shows metric cards', async ({ page }) => {
    await expect(page.getByText('Uploads Today')).toBeVisible()
    await expect(page.getByText('Active Investigations')).toBeVisible()
  })

  test('Upload Data shows file upload form', async ({ page }) => {
    await page.getByRole('link', { name: 'Upload Data' }).click()
    await expect(page.getByRole('heading', { name: /upload/i }).first()).toBeVisible()
  })

  test('Investigations shows ticket table', async ({ page }) => {
    await page.getByRole('link', { name: 'Investigations' }).click()
    await expect(page.getByText(/investigation|ticket/i).first()).toBeVisible()
  })

  test('OSINT Chat shows input area', async ({ page }) => {
    await page.getByRole('link', { name: 'OSINT Chat' }).click()
    await expect(page.locator('textarea').first()).toBeVisible()
  })
})

test.describe('Red Team Views render real components', () => {
  test.beforeEach(async ({ page }) => {
    await setUser(page, { groups: ['red-team-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
  })

  test('Red Team Dashboard shows metric cards', async ({ page }) => {
    await expect(page.getByText(/priority target|active operation/i).first()).toBeVisible()
  })

  test('Target Queue shows target table', async ({ page }) => {
    await page.getByRole('link', { name: 'Target Queue' }).click()
    await expect(page.getByText(/target|priority/i).first()).toBeVisible()
  })

  test('Operations shows operations table', async ({ page }) => {
    await page.getByRole('link', { name: 'Operations' }).click()
    await expect(page.getByText(/operation/i).first()).toBeVisible()
  })

  test('Red Team Chat shows input area', async ({ page }) => {
    await page.getByRole('link', { name: 'Red Team Chat' }).click()
    await expect(page.locator('textarea').first()).toBeVisible()
  })
})

test.describe('Leadership Views render real components', () => {
  test.beforeEach(async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
  })

  test('Leadership Dashboard shows cross-domain metrics', async ({ page }) => {
    await expect(page.getByText(/investigation|operation|finding/i).first()).toBeVisible()
  })

  test('Goals & KPIs shows goal management form', async ({ page }) => {
    await page.getByRole('link', { name: 'Goals & KPIs' }).click()
    await expect(page.getByText(/goal|kpi|priority/i).first()).toBeVisible()
  })

  test('Leadership Chat shows input area', async ({ page }) => {
    await page.getByRole('link', { name: 'Leadership Chat' }).click()
    await expect(page.locator('textarea').first()).toBeVisible()
  })
})

test.describe('Top Navigation', () => {
  test('shows user email in account dropdown', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await expect(page.getByRole('button', { name: 'e2e@test.com' })).toBeVisible()
  })
})
