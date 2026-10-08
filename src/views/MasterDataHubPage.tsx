import { ArrowLeft, Boxes, BookOpenCheck, KeyRound, Package, Tags, Truck, Users, Warehouse } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/States';

const entityLinks = [
  { path: '/customers', title: 'العملاء', desc: 'الكيانات والعملاء وسياقهم التجاري.', icon: Users },
  { path: '/products', title: 'المنتجات', desc: 'الأصناف والهوية المرجعية ومفاتيح الأعمال.', icon: Package },
  { path: '/inventory', title: 'المخزون', desc: 'مرجع المخزون والكميات المرتبطة بالمصدر.', icon: Boxes },
  { path: '/suppliers', title: 'الموردون', desc: 'هوية الموردين وسياقهم المرجعي المرتبط بالمشتريات.', icon: Truck },
  { path: '/alternative-groups', title: 'البدائل', desc: 'مجموعات الأصناف البديلة والتحقيق في الاستبدال.', icon: Tags },
];

const unavailableSurfaces = [
  { title: 'المستودعات والمواقع', icon: Warehouse, detail: 'السياق يظهر داخل بيانات المخزون عند توفره، ولا توجد شاشة مستقلة مثبتة هنا.' },
];

const semanticSurfaces = [
  { title: 'مفاتيح الأعمال', icon: KeyRound, detail: 'تظهر كمفهوم حاكم داخل المسارات الكانونية؛ لا توجد شاشة تحرير مستقلة مثبتة.' },
  { title: 'المرادفات والوحدات', icon: Tags, detail: 'تُحفظ كجزء من السياق الدلالي عند توفر source mapping، وإلا تبقى غير متاحة.' },
  { title: 'القاموس الدلالي', icon: BookOpenCheck, detail: 'مرجع تحليلي مستهدف؛ لا يتم عرض سجل اصطناعي عند غياب المصدر.' },
];export function MasterDataHubPage() {
  return <div dir="rtl" className="ag-master-data-surface space-y-6 animate-fade-in pb-10">
    <PageHeader
      title="البيانات المرجعية"
      subtitle="هوية الكيانات والمفاتيح والدلالات التي تمنح التحليل سياقه الصحيح دون تحويل المنصة إلى نظام CRUD."
    />

    <section className="ag-operational-hero overflow-hidden rounded-[1.75rem] border border-primary-100 p-6 lg:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr] lg:items-end">
        <div>
          <div className="text-[10px] font-black tracking-[.14em] text-primary-700">MASTER DATA / SEMANTIC CONTEXT</div>
          <h2 className="mt-2 text-2xl font-black text-ink-950 lg:text-3xl">كيانات واضحة، سياق موثوق، وقرارات أدق.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-500">هذه الطبقة تربط الهوية المرجعية بالتحليل. الحسابات والتدفقات التشغيلية تبقى في مساراتها الكانونية.</p>
        </div>
        <div className="rounded-2xl border border-primary-100 bg-white/80 p-4">
          <div className="text-[10px] font-black text-ink-400">الحالة الحالية</div>
          <div className="mt-1 text-sm font-black text-ink-900">مرجع جزئي مع حدود معلنة</div>
          <div className="mt-1 text-[11px] leading-5 text-ink-500">المتاح يفتح المسار الحقيقي؛ غير المتاح يظهر كحالة، لا كسجل مختلق.</div>
        </div>
      </div>
    </section>

    <section className="ag-decision-strip" aria-label="ملخص البيانات المرجعية">
      <div className="ag-decision-cell"><span className="ag-decision-label">العملاء</span><span className="ag-decision-value">مسار حقيقي</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">المنتجات</span><span className="ag-decision-value">مسار حقيقي</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">المخزون</span><span className="ag-decision-value">مسار حقيقي</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">الموردون</span><span className="ag-decision-value">مسار حقيقي</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">السياق الدلالي</span><span className="ag-decision-value">جزئي / معلن</span></div>
    </section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {entityLinks.map(({ path, title, desc, icon: Icon }) => <Link key={path} to={path} className="group">
        <Card className="h-full transition hover:-translate-y-1 hover:border-primary-300">
          <CardBody>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"><Icon size={20}/></span>
            <h3 className="mt-4 text-base font-black text-ink-900">{title}</h3>
            <p className="mt-2 min-h-12 text-xs leading-6 text-ink-500">{desc}</p>
            <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-[10px] font-black text-primary-700"><span>فتح المسار</span><ArrowLeft size={14}/></div>
          </CardBody>
        </Card>
      </Link>)}
    </section>    <section className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="كيانات مرجعية إضافية" subtitle="تُعرض كحالات صريحة عندما لا يملك التطبيق شاشة مستقلة مثبتة." />
        <CardBody className="grid gap-3 md:grid-cols-2">
          {unavailableSurfaces.map(({ title, detail, icon: Icon }) => <div key={title} className="rounded-2xl border border-warning-200 bg-warning-50/55 p-4">
            <div className="flex items-center gap-2"><Icon size={18} className="text-warning-700"/><span className="text-sm font-black text-ink-900">{title}</span></div>
            <div className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-warning-800 ring-1 ring-inset ring-warning-200">INSUFFICIENT DATA / SURFACE</div>
            <p className="mt-2 text-[11px] leading-5 text-warning-900">{detail}</p>
          </div>)}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="السياق الدلالي" subtitle="المفاهيم محفوظة كطبقة سياق، وليست أقسامًا تجارية مستقلة." />
        <CardBody className="space-y-3">
          {semanticSurfaces.map(({ title, detail, icon: Icon }) => <div key={title} className="flex gap-3 rounded-2xl border border-ink-100 bg-ink-50/45 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Icon size={16}/></div>
            <div><div className="text-xs font-black text-ink-900">{title}</div><p className="mt-1 text-[10px] leading-5 text-ink-500">{detail}</p></div>
          </div>)}
        </CardBody>
      </Card>
    </section>

    <Card>
      <CardHeader title="خط المرجع إلى القرار" subtitle="واجهة توضيحية للترابط بين المصدر والكيان والمعنى والتحليل، دون ادعاء اكتمال تشغيلي." />
      <CardBody>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {['Source', 'Business Key', 'Entity', 'Semantic Field', 'Analytics', 'Decision'].map((stage, index) => <div key={stage} className="relative rounded-xl border border-ink-100 bg-white p-3 text-center">
            <div className="text-[9px] font-black tracking-[.12em] text-ink-400">{String(index + 1).padStart(2, '0')}</div>
            <div className="mt-1 text-xs font-black text-ink-800">{stage}</div>
            <div className="mt-1 text-[9px] text-ink-400">{index < 2 ? 'مرجع النظام' : 'السياق يعتمد على المصدر'}</div>
          </div>)}
        </div>
      </CardBody>
    </Card>

    <div className="rounded-2xl border border-warning-200 bg-warning-50/60 p-4 text-xs leading-6 text-warning-800">
      لا تُعرض كيانات غير مثبتة كبيانات حقيقية. ما لا يملك مسارًا موثقًا يبقى غير متاح، بينما تبقى قدرته محفوظة في الخريطة المرجعية للتوسع لاحقًا.
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/trust" className="inline-flex min-h-11 items-center rounded-xl border border-warning-300 bg-white px-3 font-bold text-warning-900">فحص الدليل</Link>
        <Link to="/import" className="inline-flex min-h-11 items-center rounded-xl bg-primary-600 px-3 font-bold text-white hover:bg-primary-700">إدخال مصدر موحد</Link>
      </div>
    </div>
  </div>;
}
