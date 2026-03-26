import { test, expect } from '@playwright/test'
import { setUser, mockAuth } from './helpers'

test.describe('Performance', () => {
  test('initial page load completes within 3 seconds', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')

    const domContentLoaded = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      return nav.domContentLoadedEventEnd
    })
    expect(domContentLoaded).toBeLessThan(3000)
  })

  test('navigation between views is fast (< 500ms)', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')

    const start = Date.now()
    await page.getByText('Upload Data').click()
    await expect(page.getByRole('heading', { name: 'Upload Data' })).toBeVisible()
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(500)
  })
})
