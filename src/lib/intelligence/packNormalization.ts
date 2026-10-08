export type PackSpec = {
  unitsPerPack: number;
  weightKgPerUnit: number;
  netWeightKg: number;
  normalizedLabel: string;
};

export function normalizePack(unitsPerPack: number, weightKgPerUnit: number): PackSpec {
  if (!Number.isFinite(unitsPerPack) || unitsPerPack <= 0) throw new Error('PACK_UNITS_REQUIRED');
  if (!Number.isFinite(weightKgPerUnit) || weightKgPerUnit <= 0) throw new Error('PACK_WEIGHT_REQUIRED');
  const netWeightKg = unitsPerPack * weightKgPerUnit;
  return { unitsPerPack, weightKgPerUnit, netWeightKg, normalizedLabel: `${unitsPerPack}x${weightKgPerUnit}KG` };
}

export function convertQuantityToKg(quantity: number, pack: PackSpec): number {
  if (!Number.isFinite(quantity)) throw new Error('QUANTITY_REQUIRED');
  return quantity * pack.netWeightKg;
}

export function convertKgToQuantity(kg: number, pack: PackSpec): number {
  if (!Number.isFinite(kg) || kg < 0) throw new Error('KG_QUANTITY_REQUIRED');
  return kg / pack.netWeightKg;
}
