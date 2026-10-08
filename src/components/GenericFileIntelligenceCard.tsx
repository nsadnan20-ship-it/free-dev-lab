import { AlertTriangle, CheckCircle2, FileSearch, ListChecks, Sigma } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ReportIntelligence } from '@/lib/report-intelligence/report-smart-insights';

function healthLabel(value: ReportIntelligence['advisorBrief']['health']): string {
  if (value === 'REVIEW_REQUIRED') return 'مراجعة مطلوبة';
  if (value === 'ATTENTION') return 'انتباه';
  return 'مستقر';
}

export function GenericFileIntelligenceCard({ intelligence, format }: { intelligence: ReportIntelligence; format: string }) {
  const brief = intelligence.advisorBrief;
  const signal = intelligence.signals[0] ?? null;
  const finding = intelligence.findings[0] ?? null;
  const evidence = signal?.evidence?.length ? signal.evidence : finding?.evidence ?? [];
  return (
    <Card className="border-ink-200 bg-white" data-testid="generic-file-intelligence">
      <CardHeader
        title="محلل الملف العام"
        subtitle="يفحص المحتوى نفسه قبل افتراض التخصص: إشارات، أرقام، تواريخ، كلمات بارزة، وحدود الإثبات."
        action={<Badge variant={brief.health === 'REVIEW_REQUIRED' ? 'danger' : brief.health === 'ATTENTION' ? 'warning' : 'success'}>{healthLabel(brief.health)}</Badge>}
      />
      <CardBody>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[.08em] text-primary-700"><FileSearch size={14}/> قراءة محايدة للمصدر</div>
            <h3 className="mt-2 text-base font-black text-ink-950">{brief.headline}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-600">{intelligence.summary}</p>
            {evidence.length ? (
              <div className="mt-4 space-y-2">
                {evidence.slice(0, 5).map((item) => (
                  <div key={item} className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-xs leading-5 text-ink-700">↳ {item}</div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-ink-200 bg-white p-3 text-xs text-ink-500">لم تظهر إشارة محتوى قوية؛ لا يتم اختراع استثناء.</div>
            )}
          </section>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-ink-200 bg-white p-3"><div className="text-[10px] text-ink-500">الإشارات</div><div className="mt-1 text-lg font-black text-ink-950">{intelligence.signals.length}</div></div>
              <div className="rounded-xl border border-ink-200 bg-white p-3"><div className="text-[10px] text-ink-500">التوصيات</div><div className="mt-1 text-lg font-black text-ink-950">{intelligence.recommendations.length}</div></div>
            </div>
            <div className="rounded-xl border border-primary-100 bg-primary-50 p-4">
              <div className="flex items-center gap-2 text-xs font-black text-primary-900"><ListChecks size={15}/> ماذا أفعل الآن؟</div>
              <p className="mt-2 text-sm leading-6 text-primary-900">{brief.recommendedAction ?? 'لا توجد توصية كافية من المحتوى الحالي.'}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              <div className="flex items-center gap-2 font-black"><AlertTriangle size={14}/> حد الدليل</div>
              <div className="mt-1">{brief.proofRequirement}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-ink-200 bg-white p-3"><div className="text-ink-500">النوع</div><div className="mt-1 font-black text-ink-900">{format}</div></div>
              <div className="rounded-xl border border-ink-200 bg-white p-3"><div className="text-ink-500">الحالة</div><div className="mt-1 font-black text-ink-900">{healthLabel(brief.health)}</div></div>
            </div>
          </div>
        </div>

        {intelligence.guidance.inspect.length ? (
          <div className="mt-4 rounded-xl border border-ink-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-black text-ink-800"><Sigma size={15}/> ماذا فحص النظام؟</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {intelligence.guidance.inspect.slice(0, 8).map((item) => <span key={item} className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[10px] text-ink-600">{item}</span>)}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <CheckCircle2 size={14}/>
          كل الأدلة المعروضة هنا مأخوذة من محتوى الملف نفسه؛ النتائج المستقبلية والآثار غير المثبتة تبقى غير معتمدة.
        </div>
      </CardBody>
    </Card>
  );
}
