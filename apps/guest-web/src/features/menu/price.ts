export function calculateUnitPrice(basePrice: number, modifierDeltas: number[]) {
  return basePrice + modifierDeltas.reduce((total, delta) => total + delta, 0)
}
