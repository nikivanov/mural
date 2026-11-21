// Mirrors Movement::setTopDistance() in src/movement.cpp — the fractions come from the backend state.
export const DEFAULT_SAFE_X_FRACTION = 0.2
export const DEFAULT_SAFE_Y_FRACTION = 0.25

export interface WallLayout {
  /** Distance between the two hanging pins [mm] */
  dPins: number
  /** Side margin: pin line straight down to drawing edge [mm] */
  marginX: number
  /** Top margin: pin line to drawing top [mm] */
  marginTop: number
  /** Drawing width [mm] */
  width: number
}

export function computeWallLayout(
  dPins: number,
  xFraction: number = DEFAULT_SAFE_X_FRACTION,
  yFraction: number = DEFAULT_SAFE_Y_FRACTION,
): WallLayout {
  const marginX = dPins * xFraction
  const marginTop = dPins * yFraction
  return { dPins, marginX, marginTop, width: dPins - 2 * marginX }
}
