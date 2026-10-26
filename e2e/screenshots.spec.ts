import { test } from '@playwright/test'
import { openIronChain } from './helpers.ts'

// Run with `npm run screenshots`; the images go into the README.
const OUT = 'docs/screenshots'

test('README screenshots', async ({ page }) => {
  await openIronChain(page)
  await page.getByRole('status').waitFor({ state: 'hidden' })
  await page.screenshot({ path: `${OUT}/overview.png` })
  // link preview image (og:image in index.html)
  await page.screenshot({ path: 'public/og-image.png' })

  await page.getByRole('button', { name: /needs 2 belts/ }).click()
  // away from the label, so its tooltip does not cover the popover
  await page.mouse.move(700, 800)
  await page.screenshot({ path: `${OUT}/transport.png` })
})
