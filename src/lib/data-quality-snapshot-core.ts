export interface QualityIssue {
  entity: string;
  field: string;
  issue: string;
  count: number;
  severity: 'critical' | 'warning' | 'info';
}

export interface EntityQuality {
  name: string;
  total: number;
  issues: number;
  score: number;
  icon: 'users' | 'package' | 'warehouse' | 'receipt';
}

export interface DataQualitySnapshot {
  status: 'OK' | 'EMPTY';
  tenant_id: string;
  entities: EntityQuality[];
  issues: QualityIssue[];
}

export function validateDataQualitySnapshot(data: unknown): DataQualitySnapshot {
  if (!data || typeof data !== 'object') throw new Error('DATA_QUALITY_SNAPSHOT_INVALID');
  const snapshot = data as Record<string, unknown>;
  if (
    (snapshot.status !== 'OK' && snapshot.status !== 'EMPTY') ||
    typeof snapshot.tenant_id !== 'string' ||
    snapshot.tenant_id.length === 0 ||
    !Array.isArray(snapshot.entities) ||
    !Array.isArray(snapshot.issues)
  ) {
    throw new Error('DATA_QUALITY_SNAPSHOT_INVALID');
  }

  for (const entity of snapshot.entities as EntityQuality[]) {
    if (
      !entity ||
      typeof entity.name !== 'string' ||
      !Number.isFinite(entity.total) ||
      !Number.isFinite(entity.issues) ||
      !Number.isFinite(entity.score) ||
      entity.total < 0 ||
      entity.issues < 0 ||
      entity.score < 0 ||
      entity.score > 100
    ) {
      throw new Error('DATA_QUALITY_ENTITY_INVALID');
    }
  }

  for (const issue of snapshot.issues as QualityIssue[]) {
    if (
      !issue ||
      typeof issue.entity !== 'string' ||
      typeof issue.field !== 'string' ||
      typeof issue.issue !== 'string' ||
      !Number.isFinite(issue.count) ||
      issue.count < 0 ||
      !['critical', 'warning', 'info'].includes(issue.severity)
    ) {
      throw new Error('DATA_QUALITY_ISSUE_INVALID');
    }
  }

  if (snapshot.status === 'EMPTY' && (snapshot.entities.length !== 0 || snapshot.issues.length !== 0)) {
    throw new Error('DATA_QUALITY_EMPTY_SNAPSHOT_INCONSISTENT');
  }

  return snapshot as unknown as DataQualitySnapshot;
}
