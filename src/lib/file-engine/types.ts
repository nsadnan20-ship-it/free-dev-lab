export type FileFormat =
  | 'xlsx' | 'xls' | 'xlsm' | 'csv' | 'tsv' | 'ods'
  | 'json' | 'jsonl' | 'xml' | 'yaml' | 'txt' | 'markdown'
  | 'pdf' | 'docx' | 'doc' | 'rtf'
  | 'jpg' | 'jpeg' | 'png' | 'webp' | 'tiff' | 'bmp'
  | 'zip' | 'tar' | 'gzip'
  | 'unknown';

export type FileCategory = 'spreadsheet' | 'text' | 'document' | 'image' | 'archive' | 'unknown';
export interface FileDetectionResult { format: FileFormat; category: FileCategory; extension: string; mime: string; magicBytes: string; isMatch: boolean; mismatch: boolean; warnings: string[]; }
export interface SecurityScanResult { passed: boolean; issues: string[]; maxFileSize: number; actualSize: number; isArchiveBomb: boolean; isZipTraversal: boolean; }
export interface MappingEvidence { sourceHeader: string; normalizedHeader: string; matchedBy: 'exact' | 'partial' | 'unmapped'; canonicalField: string | null; confidence: number; requiresReview: boolean; }

export interface ColumnProfile {
  name: string;
  mappedField: string | null;
  mappingConfidence: number;
  requiresReview?: boolean;
  mappingEvidence?: MappingEvidence;
  dataType: DataType;
  nullCount: number;
  uniqueCount: number;
  uniqueRatio: number;
  sampleValues: unknown[];
  statistics: ColumnStatistics;
  qualityIssues: string[];
}

export interface ColumnStatistics { min?: number; max?: number; mean?: number; median?: number; sum?: number; stdDev?: number; count: number; distribution?: Record<string, number>; }
export type DataType = 'integer' | 'decimal' | 'currency' | 'percentage' | 'date' | 'datetime' | 'boolean' | 'sku' | 'phone' | 'email' | 'text' | 'category' | 'unit' | 'unknown';
export interface Dataset { id: string; name: string; source: string; sheet?: string; rowCount: number; columnCount: number; columns: ColumnProfile[]; rows: Record<string, unknown>[]; preview: Record<string, unknown>[]; qualityScore: number; }
export interface DataQualityReport { totalRows: number; totalColumns: number; completenessScore: number; validityScore: number; uniquenessScore: number; consistencyScore: number; overallScore: number; missingValues: Record<string, number>; duplicates: { count: number; examples: unknown[] }; anomalies: Anomaly[]; statistics: Record<string, ColumnStatistics>; columnProfiles: ColumnProfile[]; }
export interface Anomaly { type: 'outlier' | 'duplicate' | 'impossible_value' | 'suspicious_value' | 'missing_critical'; column: string; row: number; value: unknown; description: string; severity: 'high' | 'medium' | 'low'; }
export interface PipelineStage { id: string; label: string; status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'; progress?: number; result?: unknown; error?: string; duration?: number; }
export interface ProcessingMode { id: 'analyze' | 'preview' | 'validate' | 'import' | 'sync'; label: string; description: string; writesToDB: boolean; }
export interface ImportProfile { id: string; name: string; entity_type: string; target_table: string; required_fields: string[]; optional_fields: string[]; matching_keys: string[]; conflict_resolution: 'skip' | 'update' | 'overwrite'; null_policy: 'reject' | 'allow' | 'default'; is_system: boolean; is_active: boolean; }
export interface FileRecord { id: string; file_name: string; file_extension: string; file_mime: string; file_size: number; file_hash: string; detected_format: string; detected_encoding: string; security_status: string; is_duplicate: boolean; duplicate_of: string | null; status: string; created_at: string; }
export interface ImportJob { id: string; file_record_id: string | null; profile_id: string | null; status: string; processing_mode: string; total_rows: number; processed_rows: number; valid_rows: number; invalid_rows: number; quarantined_rows: number; duplicate_rows: number; progress: number; speed_rows_per_sec: number; eta_seconds: number; started_at: string | null; completed_at: string | null; duration_ms: number; error_message: string | null; created_at: string; }
export interface SynonymEntry { id: string; canonical_field: string; synonym: string; language: string; confidence: number; is_active: boolean; }
export interface FileCardData { file: File; detection: FileDetectionResult | null; security: SecurityScanResult | null; hash: string | null; isDuplicate: boolean; duplicateInfo: FileRecord | null; datasets: Dataset[]; activeDataset: Dataset | null; qualityReport: DataQualityReport | null; stages: PipelineStage[]; error: string | null; }

export const PROCESSING_MODES: ProcessingMode[] = [
  { id: 'analyze', label: 'تحليل فقط', description: 'تحليل الملف بدون تعديل قاعدة البيانات', writesToDB: false },
  { id: 'preview', label: 'معاينة', description: 'معاينة البيانات بدون استيراد', writesToDB: false },
  { id: 'validate', label: 'تحقق', description: 'التحقق من جودة وصحة البيانات', writesToDB: false },
  { id: 'import', label: 'استيراد', description: 'استيراد البيانات إلى قاعدة البيانات', writesToDB: true },
  { id: 'sync', label: 'مزامنة', description: 'مزامنة البيانات مع التحديث', writesToDB: true },
];

export const FORMAT_LABELS: Record<FileFormat, string> = {
  xlsx: 'Excel (XLSX)', xls: 'Excel (XLS)', xlsm: 'Excel (XLSM)', csv: 'CSV', tsv: 'TSV', ods: 'ODS',
  json: 'JSON', jsonl: 'JSONL/NDJSON', xml: 'XML', yaml: 'YAML', txt: 'Text', markdown: 'Markdown',
  pdf: 'PDF', docx: 'Word (DOCX)', doc: 'Word (DOC)', rtf: 'RTF',
  jpg: 'JPG', jpeg: 'JPEG', png: 'PNG', webp: 'WEBP', tiff: 'TIFF', bmp: 'BMP',
  zip: 'ZIP', tar: 'TAR', gzip: 'GZIP', unknown: 'غير معروف',
};

export const SUPPORTED_FORMATS: FileFormat[] = ['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'ods', 'json', 'jsonl', 'xml', 'txt', 'markdown', 'pdf', 'docx', 'rtf', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'bmp', 'zip'];
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const MAX_ROWS = 500000;
export const MAX_COLUMNS = 200;
