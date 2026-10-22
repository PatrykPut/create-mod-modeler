import { createCatalog } from '../core/catalog'
import data from '../data/create-6.0.10.json'
import type { GameData } from '../data/types'

export const catalog = createCatalog(data as GameData)
