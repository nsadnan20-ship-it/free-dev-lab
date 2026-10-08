import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Database,
  GitBranch,
  ShieldCheck,
  Search,
  X,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/States';
import {
  listSemanticMetricContracts,
  semanticMetricIsFresh,
  type SemanticMetricContract,
} from '@/lib/semantic-metric-service';
import {
  captureKpiEvidenceSnapshot,
  resolveKpiEvidenceKey,
  type KpiEvidenceSnapshot,
} from '@/lib/kpi-evidence';

type CertificationStatus = 'DRAFT' | 'REVIEWED' | 'CERTIFIED' | 'DEPRECATED';

type FreshnessState = 'FRESH' | 'STALE' | 'UNKNOWN';

function freshnessDetail(freshness: Record<string, unknown>): string {
  const maxAge = Number(freshness.maxAgeMinutes);
  return Number.isFinite(maxAge) && maxAge >= 0
    ? `الحد الأقصى للحداثة: ${maxAge.toLocaleString()} دقيقة`
    : 'سياسة الحداثة غير مكتملة';
}

const statusClass = (status: CertificationStatus) => {
  if (status === 'CERTIFIED') return 'bg-success-50 text-success-700';
  if (status === 'REVIEWED') return 'bg-primary-50 text-primary-700';
  if (status === 'DEPRECATED') return 'bg-ink-100 text-ink-600';
  return 'bg-warning-50 text-warning-700';
};

const freshnessClass = (state: FreshnessState) => {
  if (state === 'FRESH') return 'text-success-600';
  if (state === 'STALE') return 'text-warning-600';
  return 'text-ink-400';
};

export function MetricInspectorPage() {
  const [items, setItems] = useState<SemanticMetricContract[]>([]);
  const [selected, setSelected] = useState<SemanticMetricContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<KpiEvidenceSnapshot | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CertificationStatus | 'ALL'>('ALL');
  const [freshnessFilter, setFreshnessFilter] = useState<FreshnessState | 'ALL'>('ALL');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listSemanticMetricContracts();
      setItems(result);
      setSelected((current) => {
        if (!current) return result[0] ?? null;
        return result.find((item) => item.definition.metricId === current.definition.metricId) ?? result[0] ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل حوكمة المؤشرات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ar-YE');
    return items.filter((item) => {
      const governanceStatus = (item.governance?.certificationStatus ?? 'DRAFT') as CertificationStatus;
      const metricFreshness = semanticMetricIsFresh(item.governance ?? null, null);
      const matchesQuery = !normalizedQuery || [
        item.definition.metricId,
        item.definition.label,
        item.definition.description,
      ].some((value) => value.toLocaleLowerCase('ar-YE').includes(normalizedQuery));
      return matchesQuery
        && (statusFilter === 'ALL' || governanceStatus === statusFilter)
        && (freshnessFilter === 'ALL' || metricFreshness === freshnessFilter);
    });
  }, [items, query, statusFilter, freshnessFilter]);

  useEffect(() => {
    if (selected && filteredItems.some((item) => item.definition.metricId === selected.definition.metricId)) return;
    setSelected(filteredItems[0] ?? null);
    setCapture(null);
    setCaptureError(null);
  }, [filteredItems, selected]);


  const captureSelected = useCallback(async () => {
    const metricId = selected?.definition.metricId;
    if (!metricId || !resolveKpiEvidenceKey(metricId)) return;

    try {
      setCapturing(true);
      setCaptureError(null);
      setCapture(null);
      const snapshot = await captureKpiEvidenceSnapshot(metricId);
      setCapture(snapshot);
    } catch (cause) {
      setCaptureError(cause instanceof Error ? cause.message : 'تعذر التقاط دليل المؤشر');
    } finally {
      setCapturing(false);
    }
  }, [selected]);

  if (loading) return <LoadingState message="جارٍ تحميل حوكمة المؤشرات..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items.length) {
    return (
      <EmptyState
        title="لا توجد مؤشرات محفوظة"
        message="لم يتم العثور على نسخ حوكمة محفوظة للمؤشرات."
      />
    );
  }

  const governance = selected?.governance;
  const freshness = semanticMetricIsFresh(governance ?? null, null);
  const selectedCanCapture = Boolean(
    selected?.definition.metricId && resolveKpiEvidenceKey(selected.definition.metricId),
  );

  return (
    <div dir="rtl" className="ag-governance-page ag-metric-governance-surface space-y-6 animate-fade-in">
      <PageHeader
        title="حوكمة المؤشرات"
        subtitle="تعريف المؤشر، نسخته، مصدره، الأدلة، والجهات المستهلكة من عقد موحد"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="ag-governance-list">
          <CardHeader title="المؤشرات" subtitle={`${filteredItems.length} من ${items.length} مؤشرًا`} />
          <CardBody className="p-3">
            <div className="space-y-3">
              <div className="relative">
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث بالاسم أو المعرّف أو الوصف"
                  aria-label="البحث في المؤشرات"
                  className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pr-9 pl-9 text-xs text-ink-900 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    aria-label="مسح بحث المؤشرات"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as CertificationStatus | 'ALL')}
                  aria-label="تصفية حالة الحوكمة"
                  className="rounded-xl border border-ink-200 bg-white px-2.5 py-2 text-[11px] font-bold text-ink-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="ALL">كل الحالات</option>
                  <option value="CERTIFIED">مؤكد</option>
                  <option value="REVIEWED">مراجع</option>
                  <option value="DRAFT">مسودة</option>
                  <option value="DEPRECATED">متقاعد</option>
                </select>
                <select
                  value={freshnessFilter}
                  onChange={(event) => setFreshnessFilter(event.target.value as FreshnessState | 'ALL')}
                  aria-label="تصفية حداثة المؤشرات"
                  className="rounded-xl border border-ink-200 bg-white px-2.5 py-2 text-[11px] font-bold text-ink-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="ALL">كل الحداثة</option>
                  <option value="FRESH">حديث</option>
                  <option value="STALE">قديم</option>
                  <option value="UNKNOWN">غير مثبت</option>
                </select>
              </div>
              {(query || statusFilter !== 'ALL' || freshnessFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setStatusFilter('ALL'); setFreshnessFilter('ALL'); }}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-[10px] font-bold text-ink-600 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  إعادة ضبط التصفية
                </button>
              )}
              <div className="space-y-1">
              {filteredItems.map((item) => (
                <button
                  key={item.definition.metricId}
                  type="button"
                  aria-pressed={selected?.definition.metricId === item.definition.metricId}
                  onClick={() => {
                    setSelected(item);
                    setCapture(null);
                    setCaptureError(null);
                  }}
                  className={`ag-governance-item w-full rounded-xl px-3 py-3 text-right transition ${
                    selected?.definition.metricId === item.definition.metricId
                      ? 'ag-governance-item-active bg-primary-50'
                      : 'hover:bg-ink-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-ink-800">{item.definition.label}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-ink-400">
                    <span>{item.definition.metricId}</span>
                    <span>v{item.governance?.version ?? item.definition.version}</span>
                  </div>
                </button>
              ))}
              {!filteredItems.length && (
                <div className="rounded-xl border border-warning-200 bg-warning-50/60 p-4 text-center" role="status" aria-live="polite">
                  <div className="text-xs font-black text-warning-900">لا توجد مؤشرات مطابقة</div>
                  <p className="mt-1 text-[10px] leading-5 text-warning-800">وسّع البحث أو أعد ضبط المرشحات لعرض بقية المؤشرات.</p>
                </div>
              )}
              </div>
            </div>
          </CardBody>
        </Card>

        {selected && (
          <div className="space-y-6">
            <Card className="ag-governance-hero">
              <CardBody>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-xs text-ink-400">{selected.definition.metricId}</div>
                    <h2 className="mt-1 text-2xl font-bold text-ink-900">{selected.definition.label}</h2>
                    <p className="mt-2 text-sm leading-6 text-ink-500">{selected.definition.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(
                        (governance?.certificationStatus ?? 'DRAFT') as CertificationStatus,
                      )}`}
                    >
                      <ShieldCheck size={14} />
                      {governance?.certificationStatus === 'CERTIFIED' ? 'مؤكد' : governance?.certificationStatus === 'REVIEWED' ? 'مراجع' : governance?.certificationStatus === 'DEPRECATED' ? 'متقاعد' : 'مسودة'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${freshnessClass(
                        freshness,
                      )}`}
                    >
                      <Clock3 size={14} />
                      {freshness === 'FRESH' ? 'حديث' : freshness === 'STALE' ? 'قديم' : 'غير مثبت'}
                    </span>
                    {selectedCanCapture && (
                      <button
                        type="button"
                        onClick={() => void captureSelected()}
                        disabled={capturing}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        <Camera size={14} />
                        {capturing ? 'جارٍ التقاط الدليل...' : 'التقاط دليل فعلي'}
                      </button>
                    )}
                  </div>
                </div>

                {capture && (
                  <div className="mt-4 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-800">
                    <div className="font-semibold">تم حفظ دليل المؤشر فعليًا</div>
                    <div className="mt-1 text-xs">
                      {capture.kpi_key} · {capture.value} · {capture.quality} · {capture.observed_at}
                    </div>
                    <div className="mt-1 text-xs">لقطة الدليل: {capture.id}</div>
                  </div>
                )}

                {captureError && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700"
                  >
                    {captureError}
                  </div>
                )}
              </CardBody>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <CardHeader title="التعريف والحساب" />
                <CardBody className="space-y-3">
                  <div>
                    <div className="text-xs text-ink-400">الصيغة</div>
                    <code className="mt-1 block break-words rounded-lg bg-ink-50 p-3 text-xs text-ink-700">
                      {selected.definition.formula}
                    </code>
                  </div>
                  <div>
                    <div className="text-xs text-ink-400">دلالة الزمن</div>
                    <div className="mt-1 font-medium text-ink-800">{selected.definition.timeSemantic}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-400">المسؤول</div>
                    <div className="mt-1 font-medium text-ink-800">
                      {governance?.owner ?? selected.definition.owner}
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="المصدر والأدلة" />
                <CardBody className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Database size={16} className="mt-0.5 text-primary-600" />
                    <div>
                      <div className="text-xs text-ink-400">المصادر</div>
                      <div className="text-sm text-ink-800">{selected.definition.source.join('، ')}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <GitBranch size={16} className="mt-0.5 text-primary-600" />
                    <div>
                      <div className="text-xs text-ink-400">مراجع الدليل</div>
                      <div className="text-sm text-ink-800">
                        {governance?.evidence.join('، ') || selected.definition.evidence.join('، ')}
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader title="المستهلكون والاعتماديات" />
              <CardBody>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs text-ink-400">المستهلكون</div>
                    <div className="flex flex-wrap gap-2">
                      {(governance?.consumers ?? selected.definition.consumers).map((item) => (
                        <span key={item} className="rounded-full bg-ink-50 px-2.5 py-1 text-xs text-ink-600">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs text-ink-400">الاعتماديات</div>
                    <div className="flex flex-wrap gap-2">
                      {(governance?.dependencies ?? selected.definition.dependencies ?? []).map((item) => (
                        <span key={item} className="rounded-full bg-ink-50 px-2.5 py-1 text-xs text-ink-600">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="حالة الاختبارات والحوكمة" />
              <CardBody>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-xl bg-ink-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink-700">
                      <CheckCircle2 size={16} className="text-success-600" />
                      الاختبارات
                    </div>
                    <div className="mt-2 text-xs text-ink-500">
                      {(governance?.tests ?? selected.definition.tests).join('، ')}
                    </div>
                  </div>
                  <div className="rounded-xl bg-ink-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink-700">
                      <AlertTriangle size={16} className="text-warning-600" />
                      سياسة الحداثة
                    </div>
                    <div className="mt-2 text-xs text-ink-500">
                      {governance ? freshnessDetail(governance.freshness) : 'غير محفوظة'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-ink-50 p-4">
                    <div className="text-sm font-medium text-ink-700">الإصدار</div>
                    <div className="mt-2 text-lg font-bold text-ink-900">
                      v{governance?.version ?? selected.definition.version}
                    </div>
                    <div className="text-xs text-ink-400">
                      آخر تحديث: {governance?.updatedAt ?? 'غير محفوظ'}
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
