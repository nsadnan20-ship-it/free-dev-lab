import { ArrowDown, FileCheck2, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { CanonicalImportPage } from '@/views/CanonicalImportPage';

export function ImportPage() {
  return (
    <div dir="rtl" className="ag-import-shell ag-import-value-surface space-y-5 animate-fade-in">
      <header className="ag-import-value-header flex flex-col gap-3 rounded-[18px] border border-ink-200 bg-white/80 p-4 shadow-card lg:flex-row lg:items-end lg:justify-between lg:p-5">
        <div className="min-w-0">
          <div className="section-kicker">البيانات والتشغيل / الاستيراد</div>
          <h1 className="mt-1 text-[22px] font-black tracking-tight text-ink-950">حوّل أي مصدر إلى دليل قابل للمراجعة</h1>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-ink-500">ارفع أي مصدر من المدخل الموحد، ثم راقب الفهم والتطبيع والتحقق قبل أن تصبح البيانات جزءًا من الحقيقة الكانونية.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-ink-500">
          <span className="inline-flex items-center gap-1.5 rounded-[9px] border border-primary-100 bg-primary-50/70 px-2.5 py-1.5"><ShieldCheck size={14} className="text-primary-700" /> فحص قبل الاعتماد</span>
          <span className="inline-flex items-center gap-1.5 rounded-[9px] border border-ink-200 bg-white px-2.5 py-1.5"><LockKeyhole size={14} className="text-primary-700" /> نطاق الشركة محمي</span>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
        <main className="min-w-0">
          <CanonicalImportPage />
        </main>
        <aside className="hidden xl:block">
          <div className="ag-import-value-rail sticky top-[76px] overflow-hidden rounded-[16px] border border-ink-200 bg-white shadow-card">
            <div className="border-b border-ink-100 bg-gradient-to-br from-primary-50/70 via-white to-[#fff9ec] p-4">
              <div className="flex items-center gap-2 text-sm font-black text-ink-950"><Sparkles size={17} className="text-primary-700" /> ماذا سيحدث؟</div>
              <p className="mt-1 text-[10px] leading-5 text-ink-500">المسار يوضح الحالة بدل إخفائها.</p>
            </div>
            <div className="space-y-3 p-4">
              {[
                ['01', 'نفهم المصدر', 'الصيغة والأعمدة والكيانات.'],
                ['02', 'نفحص ونطابق', 'الجودة والتكرار والمشكلات.'],
                ['03', 'نراجع قبل الاعتماد', 'ما هو متأكد وما يحتاج مراجعة.'],
                ['04', 'نلتزم بالمسار الكانوني', 'لا تُعرض حالة committed قبل نجاح الكتابة الفعلية.'],
              ].map(([n, title, text]) => (
                <div key={n} className="flex gap-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-ink-50 text-[9px] font-black text-ink-600">{n}</div>
                  <div className="min-w-0"><div className="text-xs font-bold text-ink-900">{title}</div><div className="mt-1 text-[10px] leading-5 text-ink-400">{text}</div></div>
                </div>
              ))}
            </div>
            <div className="border-t border-ink-100 p-4">
              <div className="flex items-center gap-2 text-xs font-black text-ink-800"><FileCheck2 size={14} className="text-primary-700" /> قاعدة الأمان</div>
              <div className="mt-1 text-[10px] leading-5 text-ink-400">الرفض والمراجعة ونقص البيانات تبقى حالات صريحة، ولا تتحول إلى أرقام مضللة.</div>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold text-ink-400"><ArrowDown size={13} /> ابدأ من مساحة الملف بالأسفل</div>
            </div>
          </div>
        </aside>
      </div>

    </div>
  );
}
