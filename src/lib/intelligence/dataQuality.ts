export type DataQualityStatus = 'ready' | 'limited' | 'insufficient';

export interface DataQualityGate {
  status: DataQualityStatus;
  score: number;
  reasons: string[];
  sampleDays: number;
  observations: number;
}

export function assessDemandData(input: {
  observationDays: number;
  demandUnits: number;
  observations: number;
  minimumDays?: number;
  minimumObservations?: number;
}): DataQualityGate {
  const minimumDays = input.minimumDays ?? 30;
  const minimumObservations = input.minimumObservations ?? 3;
  const reasons: string[] = [];
  if (input.observationDays < minimumDays) reasons.push(`فترة الطلب المتاحة ${input.observationDays} يومًا فقط؛ الحد الموصى به ${minimumDays} يومًا.`);
  if (input.observations < minimumObservations) reasons.push(`عدد الملاحظات ${input.observations} فقط؛ يلزم ${minimumObservations} ملاحظات على الأقل.`);
  if (input.demandUnits <= 0) reasons.push('لا توجد حركة طلب موثوقة خلال الفترة المتاحة.');
  const dayScore = Math.min(1, input.observationDays / minimumDays);
  const observationScore = Math.min(1, input.observations / minimumObservations);
  const demandScore = input.demandUnits > 0 ? 1 : 0;
  const score = Math.round((dayScore * 0.4 + observationScore * 0.3 + demandScore * 0.3) * 100);
  const status: DataQualityStatus = score >= 85 ? 'ready' : score >= 50 ? 'limited' : 'insufficient';
  return { status, score, reasons, sampleDays: input.observationDays, observations: input.observations };
}

export function safeRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}
