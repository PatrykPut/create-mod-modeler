import { expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const IRON_CHAIN = fileURLToPath(
  new URL('./fixtures/iron-chain.json', import.meta.url),
)

/** cobblestone → gravel → iron nuggets → 2 iron ingots/min, with a slow belt */
export async function openIronChain(page: Page) {
  await page.goto('./')
  await page.getByText('File', { exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import JSON…' }).click()
  await (await chooser).setFiles(IRON_CHAIN)
  await expect(page.getByLabel('Plan name')).toHaveValue('Iron chain')
}
