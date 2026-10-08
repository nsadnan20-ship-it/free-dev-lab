import { supabase } from './supabase';

export interface ReceivablesReportRow {
  id: string;
  company_id: string;
  customer_id: string | null;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  total: number | null;
  paid_amount: number | null;
  outstanding: number | null;
  bucket: '0-30' | '31-60' | '61-90' | '90+' | 'UNDATED';
}

export interface ReceivablesReportSnapshot {
  rows: ReceivablesReportRow[];
  totalRows: number;
  totalOutstanding: number | null;
  undatedRows: number;
  buckets: Record<'0-30' | '31-60' | '61-90' | '90+', number>;
  status: 'CALCULATED' | 'INSUFFICIENT_DATA';
}

export async function fetchReceivablesReportSnapshot(page = 0, pageSize = 25, asOfDate?: string): Promise<ReceivablesReportSnapshot> {
  if (!Number.isInteger(page) || page < 0) throw new Error('REPORT_QUERY_INVALID_PAGE');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('REPORT_QUERY_INVALID_PAGE_SIZE');

  const { data, error } = await supabase.rpc('report_receivables_snapshot', {
    p_page: page,
    p_page_size: pageSize,
    ...(asOfDate ? { p_as_of_date: asOfDate } : {}),
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<ReceivablesReportRow & {
    total_rows: number;
    total_outstanding: number | null;
    undated_rows: number;
    bucket_0_30: number;
    bucket_31_60: number;
    bucket_61_90: number;
    bucket_90_plus: number;
    status: ReceivablesReportSnapshot['status'];
  }>;
  const first = rows[0];
  const totalRows = Number(first?.total_rows ?? 0);
  const totalOutstanding = first?.total_outstanding == null ? null : Number(first.total_outstanding);

  return {
    rows: rows.map(({ total_rows: _a, total_outstanding: _b, undated_rows: _c, bucket_0_30: _d, bucket_31_60: _e, bucket_61_90: _f, bucket_90_plus: _g, status: _h, ...row }) => row),
    totalRows,
    totalOutstanding,
    undatedRows: Number(first?.undated_rows ?? 0),
    buckets: {
      '0-30': Number(first?.bucket_0_30 ?? 0),
      '31-60': Number(first?.bucket_31_60 ?? 0),
      '61-90': Number(first?.bucket_61_90 ?? 0),
      '90+': Number(first?.bucket_90_plus ?? 0),
    },
    status: first?.status ?? 'INSUFFICIENT_DATA',
  };
}
