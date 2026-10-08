export function resolveReportEvidenceStatus(
  rendered: Record<string, unknown>,
  canonicalCommitVerified: boolean,
): string {
  const renderedStatus =
    rendered.evidenceStatus == null ? null : String(rendered.evidenceStatus);
  const evidenceSnapshotId =
    typeof rendered.evidenceSnapshotId === 'string'
      ? rendered.evidenceSnapshotId.trim()
      : '';

  if (renderedStatus === 'VERIFIED') {
    if (canonicalCommitVerified && evidenceSnapshotId) return 'VERIFIED';
    return canonicalCommitVerified ? 'AWAITING_EVIDENCE_SNAPSHOT' : 'PENDING_EVIDENCE';
  }

  return renderedStatus ?? (canonicalCommitVerified ? 'AWAITING_EVIDENCE_SNAPSHOT' : 'PENDING_EVIDENCE');
}
