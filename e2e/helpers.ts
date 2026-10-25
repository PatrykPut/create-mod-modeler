import { expect, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { readFileSync } from 'node:fs'
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

/** A tiny addon jar: one pressing recipe with its own item and texture, one recipe of an unknown machine. */
export function testAddonJar() {
  const json = (value: unknown) => strToU8(JSON.stringify(value))
  const texture = readFileSync(
    fileURLToPath(
      new URL('../public/textures/minecraft/iron_ingot.png', import.meta.url),
    ),
  )
  return {
    name: 'testaddon-1.0.jar',
    mimeType: 'application/java-archive',
    buffer: Buffer.from(
      zipSync({
        'META-INF/neoforge.mods.toml': strToU8(
          '[[mods]]\nmodId="testaddon"\nversion="1.0"\ndisplayName="Test Addon"\n',
        ),
        'data/testaddon/recipe/pressing/test_plate.json': json({
          type: 'create:pressing',
          ingredients: [{ tag: 'c:ingots/iron' }],
          results: [{ id: 'testaddon:test_plate' }],
        }),
        'data/testaddon/recipe/rolling/test_rod.json': json({
          type: 'testaddon:rolling',
          input: { item: 'minecraft:iron_ingot' },
          result: { id: 'testaddon:test_rod' },
        }),
        'assets/testaddon/lang/en_us.json': json({
          'item.testaddon.test_plate': 'Test Plate',
        }),
        'assets/testaddon/textures/item/test_plate.png': texture,
      }),
    ),
  }
}
