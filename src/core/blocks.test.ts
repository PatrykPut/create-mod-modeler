import { describe, expect, it } from 'vitest'
import data from '../data/create-6.0.10.json'
import type { GameData } from '../data/types'
import { MACHINE_BLOCKS } from './blocks'

describe('machine blocks', () => {
  it('all have a rendered icon in the game data', () => {
    const { items } = data as GameData
    expect(MACHINE_BLOCKS.filter((block) => !items[block]?.rendered)).toEqual(
      [],
    )
  })
})
