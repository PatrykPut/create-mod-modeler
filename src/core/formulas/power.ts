// Sources: AllBlocks.java (CStress.setCapacity), content/kinetics/waterwheel/WaterWheelBlockEntity,
// content/contraptions/bearing/WindmillBearingBlockEntity (getGeneratedSpeed),
// content/kinetics/steamEngine/PoweredShaftBlockEntity, content/fluids/tank/BoilerData.

/** SU of one windmill: 512 SU/RPM at one RPM per 8 sail blocks, 1–16 RPM. */
export function windmillStress(sails: number) {
  const rpm = Math.min(16, Math.max(1, Math.floor(sails / 8)))
  return 512 * rpm
}

/** A steam engine at full efficiency: 1024 SU/RPM at 16 RPM. */
export const STEAM_ENGINE_STRESS = 1024 * 16
/** BoilerData: boiler level (heat, water and size) is capped at 18. */
export const MAX_BOILER_LEVEL = 18
// the user's rule: one water pump keeps a boiler up to level 12 supplied
const ONE_PUMP_MAX_LEVEL = 12

export interface BoilerSetup {
  boilers: number
  /** Required level of each boiler: one level per engine at full efficiency. */
  level: number
  pumpsPerBoiler: number
}

/** Boilers needed to run `engines` steam engines at full efficiency. */
export function boilerFor(engines: number): BoilerSetup {
  if (engines <= 0) return { boilers: 0, level: 0, pumpsPerBoiler: 0 }
  const boilers = Math.ceil(engines / MAX_BOILER_LEVEL)
  const level = Math.ceil(engines / boilers)
  return { boilers, level, pumpsPerBoiler: level > ONE_PUMP_MAX_LEVEL ? 2 : 1 }
}
