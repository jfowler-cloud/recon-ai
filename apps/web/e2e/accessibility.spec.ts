import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { setUser, mockAuth } from './helpers'

test.describe('Accessibility', () => {
  test('OSINT analyst view has no critical accessibility violations', async ({ page }) => {
    await setUser(page, { groups: ['osint-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.waitForTimeout(1000)

    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast', 'button-name', 'list']) // Cloudscape internal
      .analyze()

    const critical = results.violations.filter(v => v.impact === 'critical')
    expect(critical).toHaveLength(0)
  })

  test('leadership view has no critical accessibility violations', async ({ page }) => {
    await setUser(page, { groups: ['leadership'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.waitForTimeout(1000)

    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast', 'button-name', 'list'])
      .analyze()

    const critical = results.violations.filter(v => v.impact === 'critical')
    expect(critical).toHaveLength(0)
  })

  test('red team view has no critical accessibility violations', async ({ page }) => {
    await setUser(page, { groups: ['red-team-analyst'] })
    await mockAuth(page)
    await page.goto('/e2e.html')
    await page.waitForTimeout(1000)

    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast', 'button-name', 'list'])
      .analyze()

    const critical = results.violations.filter(v => v.impact === 'critical')
    expect(critical).toHaveLength(0)
  })
})
