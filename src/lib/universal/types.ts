export type Cell = string | number | null;

export interface RawTable {
  sheet: string | null;
  headers: string[];
  rows: Cell[][];
  /** 1-based row number in the source file for each data row (row provenance). */
  sourceRows: number[];
  headerRow: number;
}

export type ColumnKind = "numeric" | "date" | "categorical" | "identifier" | "text" | "empty";

export interface ColumnProfile {
  name: string;
  index: number;
  kind: ColumnKind;
  field: string | null;
  mappingMethod: "exact" | "alias" | "fuzzy" | "learned" | "unmapped";
  mappingConfidence: number;
  mappingNeedsReview: boolean;
  nonNull: number;
  missing: number;
  distinct: number;
  sample: string[];
  invalid: number;
  min?: number;
  max?: number;
  mean?: number;
  sum?: number;
  negatives?: number;
  isMonetary?: boolean;
}

export type CapStatus = "AVAILABLE" | "NOT_AVAILABLE" | "INSUFFICIENT_SAMPLE" | "REVIEW_REQUIRED" | "BLOCKED";

export interface Provenance {
  columns: string[];
  rowRefs: number[];
  method: string;
}

export interface Evidence {
  label: string;
  value: string | number;
}

export interface CapabilityResult {
  id: string;
  title: string;
  group: "describe" | "diagnose" | "predict" | "prescribe" | "govern";
  status: CapStatus;
  why: string;
  requiredInputs: string[];
  availableInputs: string[];
  missingInputs: string[];
  evidence: Evidence[];
  assumptions: string[];
  limitations: string[];
  provenance: Provenance;
  output?: unknown;
}

export type Role = "sales" | "purchasing" | "inventory" | "finance" | "data" | "management" | "operations";
export type Severity = "critical" | "warning" | "info" | "opportunity";
export type InsightKind = "advisory" | "guidance" | "warning" | "opportunity";

export interface Insight {
  id: string;
  capability: string;
  severity: Severity;
  kind: InsightKind;
  what: string;
  why: string;
  soWhat: string;
  impact: string | null;
  whatNext: string;
  whatIf: string | null;
  proof: { columns: string[]; rowRefs: number[]; metrics: Evidence[] };
  owner: Role;
  expectedOutcome: string | null;
  confidence: number | null;
}

export interface WorkTaskDraft {
  id: string;
  findingId: string;
  role: Role;
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  dueInDays: number;
}

export interface PipelineStage {
  id: string;
  label: string;
  status: "done" | "skipped" | "review";
  note: string;
}

export interface ArchetypeAcceleration {
  state: string;
  reason: string;
  id: string | null;
  title: string | null;
  decisionQuestions: string[];
  recommendationFocus: string[];
}

export interface AnalysisResult {
  engineVersion: string;
  fileName: string;
  sheet: string | null;
  analyzedAt: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  roles: {
    measure: string | null;
    measures: string[];
    date: string | null;
    dimensions: string[];
    entity: string | null;
    monetary: boolean;
  };
  domains: string[];
  qualityScore: number;
  archetype: ArchetypeAcceleration;
  capabilities: CapabilityResult[];
  insights: Insight[];
  tasks: WorkTaskDraft[];
  stages: PipelineStage[];
  preview: { headers: string[]; rows: Cell[][]; sourceRows: number[] };
  series: { period: string; value: number }[];
  segments: { name: string; value: number; count: number }[];
}
