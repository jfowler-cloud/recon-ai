import { test } from '@playwright/test'
import { setUser, mockAuth } from './helpers'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DOCS_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'images')

test.describe('Screenshots', () => {
  test.beforeAll(() => {
    fs.mkdirSync(DOCS_DIR, { recursive: true })
  })

  // ── OSINT Analyst views (5 pages) ──────────────────────────────────────

  test('capture OSINT Dashboard', async ({ page }) => {
    await setUser(page, { groups: ['osint-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(DOCS_DIR, '01_osint_dashboard.png'), fullPage: true })
  })

  test('capture OSINT Upload Data', async ({ page }) => {
    await setUser(page, { groups: ['osint-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Upload Data' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '02_osint_upload.png'), fullPage: true })
  })

  test('capture OSINT Investigations', async ({ page }) => {
    await setUser(page, { groups: ['osint-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Investigations' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '03_osint_investigations.png'), fullPage: true })
  })

  test('capture OSINT Chat', async ({ page }) => {
    await setUser(page, { groups: ['osint-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'OSINT Chat' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '04_osint_chat.png'), fullPage: true })
  })

  test('capture OSINT Network Topology', async ({ page }) => {
    await setUser(page, { groups: ['osint-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Network Topology' }).first().click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(DOCS_DIR, '05_osint_topology.png'), fullPage: true })
  })

  // ── Red Team Analyst views (6 pages) ───────────────────────────────────

  test('capture Red Team Dashboard', async ({ page }) => {
    await setUser(page, { groups: ['red-team-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(DOCS_DIR, '06_redteam_dashboard.png'), fullPage: true })
  })

  test('capture Red Team Target Queue', async ({ page }) => {
    await setUser(page, { groups: ['red-team-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Target Queue' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '07_redteam_targets.png'), fullPage: true })
  })

  test('capture Red Team Operations', async ({ page }) => {
    await setUser(page, { groups: ['red-team-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Operations' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '08_redteam_operations.png'), fullPage: true })
  })

  test('capture Red Team Tool Registry', async ({ page }) => {
    await setUser(page, { groups: ['red-team-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Tool Registry' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '09_redteam_tools.png'), fullPage: true })
  })

  test('capture Red Team Chat', async ({ page }) => {
    await setUser(page, { groups: ['red-team-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Red Team Chat' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '10_redteam_chat.png'), fullPage: true })
  })

  test('capture Red Team Network Topology', async ({ page }) => {
    await setUser(page, { groups: ['red-team-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Network Topology' }).click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(DOCS_DIR, '11_redteam_topology.png'), fullPage: true })
  })

  // ── Leadership views (6 pages) ─────────────────────────────────────────

  test('capture Leadership Dashboard', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(DOCS_DIR, '12_leadership_dashboard.png'), fullPage: true })
  })

  test('capture Leadership Goals & KPIs', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Goals & KPIs' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '13_leadership_goals.png'), fullPage: true })
  })

  test('capture Leadership Target Overview', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Target Overview' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '14_leadership_targets.png'), fullPage: true })
  })

  test('capture Leadership Tool Registry', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByLabel('Leadership').getByRole('link', { name: 'Tool Registry' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '15_leadership_tools.png'), fullPage: true })
  })

  test('capture Leadership Chat', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByRole('link', { name: 'Leadership Chat' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(DOCS_DIR, '16_leadership_chat.png'), fullPage: true })
  })

  test('capture Leadership Network Topology', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.getByLabel('Leadership').getByRole('link', { name: 'Network Topology' }).click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(DOCS_DIR, '17_leadership_topology.png'), fullPage: true })
  })
})
