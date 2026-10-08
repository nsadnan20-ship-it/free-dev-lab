export interface ReadinessInput { availableDomains: string[]; dataQuality: number; recordCount: number; hasEvidence: boolean; criticalAlerts: number; }
export interface ReadinessResult { ready: boolean; score: number; status: 'ready' | 'review' | 'blocked'; reasons: string[]; }

export const REPORT_QUALITY_THRESHOLD = 70;
export const REPORT_READY_THRESHOLD = 80;

export function evaluateReportReadiness(x: ReadinessInput): ReadinessResult {
  const reasons: string[] = [];
  let score = 0;
  score += Math.min(25, x.availableDomains.length * 4);
  score += Math.min(30, Math.max(0, x.dataQuality) * 0.3);
  score += x.recordCount > 0 ? 20 : 0;
  score += x.hasEvidence ? 15 : 0;
  score += x.criticalAlerts === 0 ? 10 : 0;

  if (!x.recordCount) reasons.push('لا توجد سجلات قابلة للتحليل');
  if (x.dataQuality < REPORT_QUALITY_THRESHOLD) reasons.push(`جودة البيانات أقل من الحد الأدنى ${REPORT_QUALITY_THRESHOLD}/100`);
  if (!x.hasEvidence) reasons.push('لا توجد أدلة مصدرية كافية');
  if (x.criticalAlerts > 0) reasons.push(`يوجد ${x.criticalAlerts} تنبيه حرج يحتاج مراجعة`);

  score = Math.round(Math.min(100, score));
  const blocked = !x.recordCount || x.dataQuality < REPORT_QUALITY_THRESHOLD || !x.hasEvidence;
  const ready = !blocked && score >= REPORT_READY_THRESHOLD && x.criticalAlerts === 0;
  const status = ready ? 'ready' : blocked || score < 60 ? 'blocked' : 'review';

  return { ready, score, status, reasons };
}
