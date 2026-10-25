import { expect, test } from '@playwright/test'
import { openIronChain, testAddonJar } from './helpers.ts'

let errors: string[]

test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
})

test.afterEach(() => expect(errors).toEqual([]))

test('starts with an empty plan', async ({ page }) => {
  await page.goto('./')
  await expect(
    page.getByRole('heading', { name: 'Create Mod Modeler' }),
  ).toBeVisible()
  await expect(page.locator('.summary')).toContainText('0 SU')
})

test('adds a recipe through the search', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '+ Recipe' }).click()
  await page.getByPlaceholder('Search recipes by item…').fill('Andesite Alloy')
  await page.locator('.dialog-results button').first().click()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await expect(page.locator('.react-flow__node')).toContainText(
    'Andesite Alloy',
  )
})

test('offers only farms, generators and pumps as sources', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '+ Source' }).click()
  const search = page.getByPlaceholder('Search sources…')
  await search.fill('boat')
  await expect(page.locator('.dialog-results')).toContainText('Nothing found.')
  await search.fill('oak log')
  await expect(page.locator('.dialog-results button').first()).toContainText(
    'Source of Oak Log · Tree farm',
  )
})

test('imports a plan and solves it', async ({ page }) => {
  await openIronChain(page)
  const summary = page.locator('.summary')
  await expect(summary).toContainText('Iron Ingot')
  await expect(summary).toContainText('2/min')
  await expect(summary).toContainText('needs 2 lanes')
  await expect(page.locator('.react-flow__node')).toHaveCount(5)
})

test('changes the belt speed on an edge', async ({ page }) => {
  await openIronChain(page)
  await page.getByRole('button', { name: /needs 2 belts/ }).click()
  await page.getByLabel('Belt RPM').fill('64')
  // 64 RPM carries 160 items/min, enough for 144 cobblestone
  await expect(
    page.getByRole('button', { name: '144/min · belt' }),
  ).toHaveCount(2)
  await expect(page.locator('.summary')).not.toContainText('Bottlenecks')
})

test('opens a share link as a new plan', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openIronChain(page)
  await page.getByText('File', { exact: true }).click()
  await page.getByRole('button', { name: 'Copy share link' }).click()
  await expect(page.getByRole('status')).toContainText('copied')
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toContain('#plan=')

  await page.goto(link)
  await expect(page.getByLabel('Plan name')).toHaveValue('Iron chain (2)')
  await expect(page.locator('.react-flow__node')).toHaveCount(5)
  expect(new URL(page.url()).hash).toBe('')
})

test('explains assumptions in tooltips', async ({ page }) => {
  await openIronChain(page)
  await page.locator('.react-flow__node .info').first().hover()
  await expect(page.getByRole('tooltip')).toContainText('optimised generator')
})

test('loads addon recipes from a mod jar', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Addons' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Drop mod \.jar/ }).click()
  await (await chooser).setFiles(testAddonJar())
  const dialog = page.getByRole('dialog', { name: 'Addon recipes' })
  await expect(dialog).toContainText('Loaded Test Addon.')
  await expect(dialog.locator('.pack-row')).toContainText(
    'Test Addon 1.01 recipe · 1 skipped',
  )
  await dialog.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: '+ Recipe' }).click()
  await page.getByPlaceholder('Search recipes by item…').fill('Test Plate')
  await page.locator('.dialog-results button').first().click()
  const node = page.locator('.react-flow__node')
  await expect(node).toContainText('Test Plate')
  await expect(node.locator('img[src^="blob:"]')).toHaveCount(1)

  // packs and the plan survive a reload
  await page.reload()
  await expect(page.getByRole('button', { name: 'Addons (1)' })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toContainText('Test Plate')
})
