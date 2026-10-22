import { createContext, useContext } from 'react'
import type { PlanAnalysis } from '../core/derive'

export const AnalysisContext = createContext<PlanAnalysis | null>(null)

export function useAnalysis(): PlanAnalysis {
  const analysis = useContext(AnalysisContext)
  if (!analysis) throw new Error('AnalysisContext missing')
  return analysis
}
