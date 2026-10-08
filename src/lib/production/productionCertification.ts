export type CertificationEvidenceKey = 'tenant' | 'backup' | 'rollback' | 'artifact' | 'security';

export const PRODUCTION_CERTIFICATION_EVIDENCE_KEYS: readonly CertificationEvidenceKey[] = [
  'tenant',
  'backup',
  'rollback',
  'artifact',
  'security',
];

export type CertificationCheck = { key: string; passed: boolean; severity: 'BLOCKER' | 'WARNING' | 'INFO'; evidence?: string };
export type CertificationResult = { certified: boolean; score: number; blockers: string[]; warnings: string[]; evidence: CertificationCheck[] };

const REQUIRED_EVIDENCE_KEYS = new Set<string>(PRODUCTION_CERTIFICATION_EVIDENCE_KEYS);
const VALID_SEVERITIES = new Set<CertificationCheck['severity']>(['BLOCKER', 'WARNING', 'INFO']);

export function certifyProduction(checks: CertificationCheck[]): CertificationResult {
  const safeChecks = Array.isArray(checks) ? checks : [];
  const malformedChecks = safeChecks.filter((check) => (
    check === null
    || typeof check !== 'object'
    || typeof check.key !== 'string'
    || check.key.trim().length === 0
    || typeof check.passed !== 'boolean'
    || !VALID_SEVERITIES.has(check.severity)
  ));
  const blockers = safeChecks.filter(c => !c?.passed && c?.severity === 'BLOCKER').map(c => c.key);
  const warnings = safeChecks.filter(c => !c?.passed && c?.severity === 'WARNING').map(c => c.key);

  const seen = new Set<string>();
  const checksByKey = new Map<string, CertificationCheck>();
  const duplicateEvidence = new Set<string>();
  for (const check of safeChecks) {
    if (check === null || typeof check !== 'object' || typeof check.key !== 'string') continue;
    if (seen.has(check.key)) duplicateEvidence.add(check.key);
    else checksByKey.set(check.key, check);
    seen.add(check.key);
  }

  const missingEvidence = PRODUCTION_CERTIFICATION_EVIDENCE_KEYS.filter(key => !checksByKey.has(key));
  const failedEvidence = PRODUCTION_CERTIFICATION_EVIDENCE_KEYS.filter(key => {
    const check = checksByKey.get(key);
    return check !== undefined && check.passed !== true;
  });
  const duplicateMandatoryEvidence = PRODUCTION_CERTIFICATION_EVIDENCE_KEYS.filter(key => duplicateEvidence.has(key));
  const evidenceComplete = malformedChecks.length === 0
    && missingEvidence.length === 0
    && failedEvidence.length === 0
    && duplicateMandatoryEvidence.length === 0;

  const mandatoryChecks = PRODUCTION_CERTIFICATION_EVIDENCE_KEYS
    .map(key => checksByKey.get(key))
    .filter((check): check is CertificationCheck => check !== undefined);
  const score = PRODUCTION_CERTIFICATION_EVIDENCE_KEYS.length
    ? mandatoryChecks.filter(c => c.passed === true).length / PRODUCTION_CERTIFICATION_EVIDENCE_KEYS.length
    : 0;

  const certificationBlockers = [
    ...blockers,
    ...(malformedChecks.length ? ['MALFORMED_CERTIFICATION_CHECK'] : []),
    ...missingEvidence.map(key => `MISSING_EVIDENCE:${key}`),
    ...failedEvidence.map(key => `FAILED_EVIDENCE:${key}`),
    ...duplicateMandatoryEvidence.map(key => `DUPLICATE_EVIDENCE:${key}`),
  ];

  return {
    certified: certificationBlockers.length === 0 && score >= 0.95 && evidenceComplete,
    score,
    blockers: [...new Set(certificationBlockers)],
    warnings,
    evidence: safeChecks,
  };
}

export function isMandatoryCertificationEvidenceKey(key: string): key is CertificationEvidenceKey {
  return REQUIRED_EVIDENCE_KEYS.has(key);
}
