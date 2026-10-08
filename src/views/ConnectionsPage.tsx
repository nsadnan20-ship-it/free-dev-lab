import { ArrowLeft, ArrowRight, CheckCircle2, Database, FileSpreadsheet, FolderSync, Globe2, KeyRound, Link2, LockKeyhole, PlugZap, ReceiptText, RefreshCw, ShieldCheck, Store, Workflow } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { useLanguage } from '@/lib/language';

type ConnectorState = 'available' | 'bounded' | 'adapter';

const connectors = [
  { id: 'files', title: { ar: 'Excel / CSV', en: 'Excel / CSV' }, description: { ar: 'رفع مضبوط، بصمة، تطبيع، تحقق، ثم إدخال كانوني.', en: 'Governed upload, fingerprinting, normalization, validation, then canonical ingestion.' }, icon: FileSpreadsheet, state: 'available' as ConnectorState, tag: { ar: 'متاح الآن', en: 'Available now' } },
  { id: 'folder', title: { ar: 'مجلد حي', en: 'Watched folder' }, description: { ar: 'مسار مستهدف لالتقاط الملفات الجديدة عبر سلسلة الاستيراد الحالية؛ تشغيله الآلي الكامل ما زال يحتاج إثبات Runtime.', en: 'A target path for routing new files through the existing import chain; full automated runtime proof is still open.' }, icon: FolderSync, state: 'bounded' as ConnectorState, tag: { ar: 'قيد إثبات التشغيل', en: 'Runtime proof pending' } },
  { id: 'documents', title: { ar: 'PDF ومستندات عربية', en: 'PDF & Arabic documents' }, description: { ar: 'استخراج ثم ثقة ثم مراجعة قبل أن تصبح البيانات KPI؛ PDF الممسوح ضوئيًا يبقى محجوبًا عند غياب OCR خادمي موثوق.', en: 'Extract, score trust, and review before data can become a KPI; scanned PDFs remain blocked without authoritative server OCR.' }, icon: ReceiptText, state: 'bounded' as ConnectorState, tag: { ar: 'متاح مع حدود', en: 'Available with limits' } },
  { id: 'store-api', title: { ar: 'المتجر / API', en: 'Store / API' }, description: { ar: 'موصل مباشر للمنصة يرسل الحركة إلى نفس سلسلة الحقيقة بدل شاشة جديدة منفصلة.', en: 'A direct platform adapter feeding the same truth chain instead of a separate analytics stack.' }, icon: Store, state: 'adapter' as ConnectorState, tag: { ar: 'موصل قيد التنفيذ', en: 'Adapter layer' } },
  { id: 'erp-api', title: { ar: 'ERP / قاعدة بيانات', en: 'ERP / Database' }, description: { ar: 'مسار تكامل مؤسسي للحركات والجداول مع حوكمة tenant وبيانات المصدر.', en: 'Enterprise integration for movements and tables with tenant and source governance.' }, icon: Database, state: 'adapter' as ConnectorState, tag: { ar: 'موصل حسب المنصة', en: 'Platform-specific adapter' } },
];

const steps = [
  { icon: Link2, ar: 'اربط المصدر', en: 'Connect source' },
  { icon: Workflow, ar: 'طبّق الحوكمة', en: 'Govern' },
  { icon: RefreshCw, ar: 'طبّع وراجع', en: 'Normalize & validate' },
  { icon: ShieldCheck, ar: 'اثبت الحقيقة', en: 'Prove truth' },
  { icon: PlugZap, ar: 'حوّلها إلى قرار', en: 'Turn into action' },
];

export function ConnectionsPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const availableCount = connectors.filter(connector => connector.state === 'available').length;
  const boundedCount = connectors.filter(connector => connector.state === 'bounded').length;
  const adapterCount = connectors.filter(connector => connector.state === 'adapter').length;
  const nextAvailableSource = connectors.find(connector => connector.state === 'available');
  const nextLabel = nextAvailableSource
    ? (ar ? `ابدأ من ${nextAvailableSource.title.ar}` : `Start with ${nextAvailableSource.title.en}`)
    : (ar ? 'راجع حدود الموصلات' : 'Review connector limits');
  const title = ar ? 'مركز المصادر والموصلات' : 'Sources & Connections';
  const subtitle = ar
    ? 'اربط المتجر أو الملف أو النظام، ثم دع السلسلة نفسها تحوّل المصدر إلى حقيقة قابلة للإثبات وقرار قابل للتنفيذ.'
    : 'Connect a store, file, or system, then let one governed chain turn source data into provable truth and executable decisions.';

  return (
    <div dir={ar ? 'rtl' : 'ltr'} className="ag-connections-surface space-y-6 animate-fade-in">
      <section className="ag-connection-hero overflow-hidden rounded-[2rem] bg-ink-950 p-6 text-white shadow-elevated lg:p-8">
        <div className="grid gap-7 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-300/20 bg-primary-500/10 px-3 py-1.5 text-xs font-black text-primary-100"><Globe2 size={14}/>{ar ? 'من المصدر إلى القرار' : 'Source → Decision'}</div>
            <h1 className="mt-4 text-3xl font-black tracking-tight lg:text-4xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-8 text-slate-300 lg:text-base">{subtitle}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/import" className="btn-primary inline-flex items-center gap-2">{ar ? 'ابدأ ببياناتك الآن' : 'Start with your data'} {ar ? <ArrowLeft size={16}/> : <ArrowRight size={16}/>}</Link>
              <Link to="/trust" className="btn-secondary border-white/10 bg-white/5 text-white hover:bg-white/10">{ar ? 'راجع حدود الثقة والدليل' : 'Review trust boundaries'}</Link>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-xs font-black text-primary-200">{ar ? 'سلسلة التشغيل الواحدة' : 'One operating chain'}</div>
            <div className="mt-4 grid gap-2">{steps.map(({ icon: Icon, ar: a, en: e }, index) => <div key={a} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-200"><Icon size={16}/></span><span className="flex-1 text-sm font-bold">{ar ? a : e}</span><span className="text-[10px] font-black text-slate-500">0{index + 1}</span></div>)}</div>
          </div>
        </div>
      </section>

      <section className="ag-decision-strip" aria-label="ملخص المصادر">
        <div className="ag-decision-cell"><span className="ag-decision-label">{ar ? "المسارات المثبتة" : "Proven paths"}</span><span className="ag-decision-value">{availableCount}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">{ar ? "بحدود تشغيل" : "Bounded paths"}</span><span className="ag-decision-value">{boundedCount}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">{ar ? "موصلات حسب المنصة" : "Adapter paths"}</span><span className="ag-decision-value">{adapterCount}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">Trust</span><span className="ag-decision-value">{ar ? "إثبات قبل الادعاء" : "Proof before claim"}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">{ar ? "الخطوة التالية" : "Next"}</span><span className="ag-decision-value">{nextLabel}</span></div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connectors.map(({ id, title: labels, description, icon: Icon, state, tag }) => {
          const isAvailable = state === 'available';
          const isBounded = state === 'bounded';
          return (
            <article key={id} className="ag-connection-card group rounded-3xl border border-ink-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated">
              <div className="flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"><Icon size={20}/></span><span className={'rounded-full px-2.5 py-1 text-[10px] font-black ' + (isAvailable ? 'bg-success-50 text-success-700' : isBounded ? 'bg-warning-50 text-warning-700' : 'bg-ink-100 text-ink-700')}>{ar ? tag.ar : tag.en}</span></div>
              <h2 className="mt-4 text-lg font-black text-ink-900">{ar ? labels.ar : labels.en}</h2>
              <p className="mt-2 min-h-16 text-sm leading-7 text-ink-500">{ar ? description.ar : description.en}</p>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-ink-400">{isAvailable ? <CheckCircle2 size={14} className="text-success-600"/> : isBounded ? <ShieldCheck size={14} className="text-warning-600"/> : <KeyRound size={14} className="text-ink-500"/>}{isAvailable ? (ar ? 'المسار مثبت داخل المنتج' : 'Path is proven in product') : isBounded ? (ar ? 'المسار موجود لكن حدوده التشغيلية معلنة' : 'Path exists with explicit runtime limits') : (ar ? 'لا نعد بالاتصال قبل إثباته' : 'No connection claim before runtime proof')}</div>
                {isAvailable && <Link to="/import" className="text-xs font-black text-primary-700">{ar ? 'فتح المسار' : 'Open path'}</Link>}
                {isBounded && <Link to={id === 'documents' ? '/import' : '/trust'} className="text-xs font-black text-warning-700">{id === 'documents' ? (ar ? 'ابدأ الاستيراد الموحد' : 'Start unified import') : (ar ? 'راجع الحدود' : 'Review limits')}</Link>}
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-3xl border border-primary-200 bg-primary-50/60 p-5">
          <div className="flex items-center gap-2 text-sm font-black text-primary-900"><LockKeyhole size={17}/>{ar ? 'ميزة تنافسية مقصودة' : 'Deliberate competitive advantage'}</div>
          <p className="mt-3 text-sm leading-7 text-primary-900/80">{ar ? 'المنافس لا يربح بمجرد كلمة “تكامل”. نحن نربط المصدر بسلسلة تحقق واحدة: من أين جاء الرقم، كيف طُبّع، هل تم اعتماده، وما القرار الذي نتج عنه.' : '“Integrations” alone are not the moat. The moat is one governed chain: where the number came from, how it was normalized, whether it was approved, and what decision it produced.'}</p>
        </div>
        <div className="rounded-3xl border border-ink-200 bg-white p-5">
          <div className="text-sm font-black text-ink-900">{ar ? 'ما لا ندّعيه' : 'What we do not claim'}</div>
          <p className="mt-3 text-sm leading-7 text-ink-500">{ar ? 'الموصلات المباشرة للمتاجر وERP تحتاج اعتمادًا خاصًا بكل منصة، مفاتيح/OAuth، اختبارات قراءة حقيقية، وعزل tenant. لذلك تُعرض كطبقة موصلات واضحة بدل نجاح وهمي.' : 'Direct store and ERP adapters require platform-specific auth, real read tests, tenant isolation, and runtime proof. They are shown as an adapter layer rather than simulated success.'}</p>
        </div>
      </section>
    </div>
  );
}
