export type ToolCapability = 'bi' | 'analytics' | 'etl' | 'pdf' | 'ocr' | 'ml' | 'ai' | 'observability' | 'local';
export type IntegrationMode = 'native' | 'adapter' | 'reference' | 'external-service';

export interface ToolOption { name: string; capabilities: ToolCapability[]; license: string; mode: IntegrationMode; priority: 'P0' | 'P1' | 'P2'; reason: string; }

export const OPEN_SOURCE_TOOLBOX: ToolOption[] = [
  { name: 'DuckDB', capabilities: ['analytics', 'local'], license: 'MIT', mode: 'adapter', priority: 'P0', reason: 'Fast local analytical queries over files without a separate database.' },
  { name: 'Apache Arrow / Parquet', capabilities: ['analytics', 'etl', 'local'], license: 'Apache-2.0', mode: 'native', priority: 'P0', reason: 'Efficient columnar interchange and analytical cache format.' },
  { name: 'Tesseract OCR', capabilities: ['ocr', 'local'], license: 'Apache-2.0', mode: 'adapter', priority: 'P0', reason: 'Offline OCR fallback with Arabic/English support.' },
  { name: 'EasyOCR', capabilities: ['ocr', 'local'], license: 'Apache-2.0', mode: 'adapter', priority: 'P0', reason: 'Multilingual neural OCR alternative.' },
  { name: 'OpenCV', capabilities: ['ocr', 'etl'], license: 'Apache-2.0', mode: 'adapter', priority: 'P0', reason: 'Image preprocessing before OCR.' },
  { name: 'Apache Tika', capabilities: ['pdf', 'etl'], license: 'Apache-2.0', mode: 'adapter', priority: 'P0', reason: 'Document type, metadata and text extraction.' },
  { name: 'Camelot', capabilities: ['pdf', 'etl'], license: 'MIT', mode: 'adapter', priority: 'P0', reason: 'Structured PDF table extraction.' },
  { name: 'PyMuPDF', capabilities: ['pdf'], license: 'AGPL/commercial', mode: 'adapter', priority: 'P0', reason: 'High-performance PDF text/page/image extraction with licensing isolation.' },
  { name: 'docTR', capabilities: ['ocr', 'pdf'], license: 'Apache-2.0', mode: 'adapter', priority: 'P1', reason: 'Neural document detection and recognition.' },
  { name: 'Polars', capabilities: ['analytics', 'etl'], license: 'MIT', mode: 'adapter', priority: 'P1', reason: 'Fast lazy/streaming dataframe processing.' },
  { name: 'MLflow', capabilities: ['ml', 'ai', 'observability'], license: 'Apache-2.0', mode: 'adapter', priority: 'P1', reason: 'Forecast/model/LLM evaluation and lifecycle tracking.' },
  { name: 'Grafana', capabilities: ['observability'], license: 'AGPL-3.0', mode: 'reference', priority: 'P1', reason: 'Time-series monitoring, annotations and alert UX.' },
  { name: 'Metabase', capabilities: ['bi'], license: 'AGPL-3.0', mode: 'reference', priority: 'P1', reason: 'Self-service BI and drill-through UX patterns.' },
  { name: 'Apache Superset', capabilities: ['bi'], license: 'Apache-2.0', mode: 'reference', priority: 'P1', reason: 'Advanced dashboard, SQL and visualization patterns.' },
  { name: 'Redash', capabilities: ['bi'], license: 'BSD-2-Clause', mode: 'reference', priority: 'P1', reason: 'SQL-first analyst workbench patterns.' },
  { name: 'PostHog', capabilities: ['analytics'], license: 'MIT core / separate EE', mode: 'external-service', priority: 'P1', reason: 'Funnels, retention, feature flags and product analytics.' },
  { name: 'Trino', capabilities: ['analytics', 'etl'], license: 'Apache-2.0', mode: 'external-service', priority: 'P2', reason: 'Federated SQL when multiple data systems justify it.' },
  { name: 'Apache Spark', capabilities: ['analytics', 'etl', 'ml'], license: 'Apache-2.0', mode: 'external-service', priority: 'P2', reason: 'Distributed batch/stream processing at very large scale.' },
];

export function toolsFor(capability: ToolCapability) { return OPEN_SOURCE_TOOLBOX.filter(tool => tool.capabilities.includes(capability)); }
