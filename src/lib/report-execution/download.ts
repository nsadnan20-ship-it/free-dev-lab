import { renderArtifact, type ReportRow } from './renderers';
import type { ReportOutputFormat } from './report-execution-contract';

function base64ToBytes(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function reportExportErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason ?? '');
  if (message.includes('FINANCIAL_CURRENCY_MISMATCH')) {
    return 'تعذر تصدير التقرير: توجد فواتير بعملات مالية مختلفة. وحماية البيانات تمنع تصدير أرقام مالية مختلطة دون توحيد العملة.';
  }
  if (message.includes('TENANT_REQUIRED')) {
    return 'تعذر تصدير التقرير: تعذر تحديد الشركة الحالية. أعد فتح الجلسة ثم حاول مرة أخرى.';
  }
  if (message.includes('REPORT_DATA_UNAVAILABLE')) {
    return 'تعذر تصدير التقرير: بيانات التصدير غير متاحة حاليًا.';
  }
  return 'تعذر تصدير التقرير. راجع رسالة الخطأ ثم حاول مرة أخرى.';
}

function showReportExportError(reason: unknown): void {
  const message = reportExportErrorMessage(reason);
  const existing = document.getElementById('report-export-error');
  if (existing) existing.remove();
  const alert = document.createElement('div');
  alert.id = 'report-export-error';
  alert.setAttribute('role', 'alert');
  alert.dir = 'rtl';
  alert.textContent = message;
  alert.style.position = 'fixed';
  alert.style.top = '1rem';
  alert.style.left = '1rem';
  alert.style.right = '1rem';
  alert.style.zIndex = '9999';
  alert.style.padding = '0.75rem 1rem';
  alert.style.border = '1px solid rgb(253 186 116)';
  alert.style.borderRadius = '0.75rem';
  alert.style.background = 'rgb(255 247 237)';
  alert.style.color = 'rgb(124 45 18)';
  alert.style.fontSize = '0.875rem';
  alert.style.boxShadow = '0 10px 25px rgba(0,0,0,.08)';
  document.body.appendChild(alert);
  window.setTimeout(() => alert.remove(), 8000);
}

if (typeof window !== 'undefined') {
  const marker = '__reportAdvisorExportErrorHandlerInstalled';
  const target = window as Window & { [marker]?: boolean };
  if (!target[marker]) {
    target[marker] = true;
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? '');
      if (message.includes('FINANCIAL_CURRENCY_MISMATCH') || message.includes('TENANT_REQUIRED') || message.includes('REPORT_DATA_UNAVAILABLE')) {
        event.preventDefault();
        showReportExportError(reason);
      }
    });
  }
}

export function downloadReportArtifact(
  reportId: string,
  title: string,
  columns: string[],
  rows: ReportRow[],
  format: ReportOutputFormat = 'xlsx',
): void {
  const artifact = renderArtifact(format, {
    reportId,
    title,
    columns,
    rows,
    generatedAt: new Date().toISOString(),
  });
  const blob = new Blob([base64ToBytes(artifact.contentBase64)], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Keep the object URL alive through the browser's download dispatch.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
