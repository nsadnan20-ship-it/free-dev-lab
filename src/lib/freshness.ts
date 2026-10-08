export type FreshnessStatus = 'FRESH' | 'WARNING' | 'STALE' | 'CRITICAL' | 'UNKNOWN';

export interface FreshnessAssessment {
  status: FreshnessStatus;
  ageMinutes: number | null;
  asOf: string | null;
  thresholdMinutes: { warning: number; stale: number; critical: number } | null;
  canDriveAlerts: boolean;
  canDriveForecast: boolean;
  canDriveExecutiveDecisions: boolean;
  reason: string;
}

export interface FreshnessPolicy {
  warningMinutes: number;
  staleMinutes: number;
  criticalMinutes: number;
}

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  warningMinutes: 60,
  staleMinutes: 24 * 60,
  criticalMinutes: 7 * 24 * 60,
};

const finitePositive = (value: number) => Number.isFinite(value) && value >= 0;

export function assessFreshness(asOf: string | Date | null | undefined, now: Date = new Date(), policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY): FreshnessAssessment {
  const thresholds = {
    warning: Math.max(1, policy.warningMinutes),
    stale: Math.max(Math.max(1, policy.warningMinutes), policy.staleMinutes),
    critical: Math.max(Math.max(1, policy.staleMinutes), policy.criticalMinutes),
  };
  if (!asOf) return { status: 'UNKNOWN', ageMinutes: null, asOf: null, thresholdMinutes: thresholds, canDriveAlerts: false, canDriveForecast: false, canDriveExecutiveDecisions: false, reason: 'لا يوجد وقت مرجعي موثوق للبيانات.' };
  const date = asOf instanceof Date ? asOf : new Date(asOf);
  if (Number.isNaN(date.getTime())) return { status: 'UNKNOWN', ageMinutes: null, asOf: null, thresholdMinutes: thresholds, canDriveAlerts: false, canDriveForecast: false, canDriveExecutiveDecisions: false, reason: 'وقت البيانات غير صالح.' };
  const ageMinutes = (now.getTime() - date.getTime()) / 60000;
  if (!finitePositive(ageMinutes)) return { status: 'UNKNOWN', ageMinutes: null, asOf: date.toISOString(), thresholdMinutes: thresholds, canDriveAlerts: false, canDriveForecast: false, canDriveExecutiveDecisions: false, reason: 'البيانات مستقبلية أو غير قابلة للتقييم.' };
  if (ageMinutes <= thresholds.warning) return { status: 'FRESH', ageMinutes, asOf: date.toISOString(), thresholdMinutes: thresholds, canDriveAlerts: true, canDriveForecast: true, canDriveExecutiveDecisions: true, reason: 'البيانات ضمن نافذة الحداثة.' };
  if (ageMinutes <= thresholds.stale) return { status: 'WARNING', ageMinutes, asOf: date.toISOString(), thresholdMinutes: thresholds, canDriveAlerts: true, canDriveForecast: false, canDriveExecutiveDecisions: false, reason: 'البيانات قديمة نسبيًا؛ التنبؤ والقرارات التنفيذية تحتاج تأكيدًا أحدث.' };
  if (ageMinutes <= thresholds.critical) return { status: 'STALE', ageMinutes, asOf: date.toISOString(), thresholdMinutes: thresholds, canDriveAlerts: false, canDriveForecast: false, canDriveExecutiveDecisions: false, reason: 'البيانات متقادمة ولا يجوز استخدامها بصمت في التنبيهات أو التنبؤ أو القرارات.' };
  return { status: 'CRITICAL', ageMinutes, asOf: date.toISOString(), thresholdMinutes: thresholds, canDriveAlerts: false, canDriveForecast: false, canDriveExecutiveDecisions: false, reason: 'البيانات حرجة القدم وتحتاج تحديثًا قبل أي استخدام تنفيذي.' };
}

export function freshnessLabel(status: FreshnessStatus): string {
  return ({ FRESH: 'حديث', WARNING: 'تحذير', STALE: 'قديم', CRITICAL: 'حرج', UNKNOWN: 'غير معروف' })[status];
}
