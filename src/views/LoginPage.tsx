import { FormEvent, useState } from 'react';
import { Link } from '@/lib/router-compat';
import { AlertCircle, ArrowLeft, Brain, CheckCircle2, FileSearch, Loader2, LogIn, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LanguageToggle } from '@/components/LanguageToggle';

const principles = [
  { icon: ShieldCheck, title: 'حقيقة متعددة الطبقات', text: 'المصدر → الصيغة → الفترة → الشركة → الدليل → النتيجة.' },
  { icon: FileSearch, title: 'المستند ليس رقمًا', text: 'استخراج وتطبيع والتحقق مع حفظ الثقة والدليل قبل الاعتماد.' },
  { icon: Brain, title: 'الذكاء داخل السياق', text: 'التوصيات والتنبؤات والسيناريوهات تُعرض داخل مساحة القرار، لا كروبوت منفصل.' },
  { icon: CheckCircle2, title: 'العزل قبل الراحة', text: 'الهوية والصلاحيات وبيانات الشركة تُثبت قبل فتح المساحة التشغيلية.' },
];

const customerValueLanes = [
  { title: 'تقارير تفهمها الإدارة', text: 'من المصدر إلى المؤشرات، الإشارات، المخاطر والفرص داخل تقرير واحد.', state: 'مبني على الدليل' },
  { title: 'دليل لا يضيع', text: 'كل نتيجة تبقى مربوطة بالمصدر والبصمة ولقطة الدليل وحالة الثقة.', state: 'تتبع المصدر' },
  { title: 'قرار بدل شاشة', text: 'التوصية لا تتوقف عند التحليل؛ تنتقل إلى مساحة قرار وموافقة منفصلة.', state: 'القرار' },
  { title: 'إجراء ونتيجة', text: 'ينتقل السياق إلى العمل ثم يعود بنتيجة فعلية عندما تُسجل، بلا تخمين.', state: 'النتيجة' },
  { title: 'عربي أصيل', text: 'RTL أصلية ومسارات تشغيلية مترابطة، وليست ترجمة سطحية لواجهة أجنبية.', state: 'العربية أولًا' },
];

const competitiveProofLanes = [
  { title: 'ذكاء أعمال مبني على الدليل', text: 'التحليل يبدأ من المصدر الموثق، ويحافظ على البصمة ولقطة الدليل قبل الاستنتاج.', state: 'ميزة جوهرية' },
  { title: 'ملفات أعمال محكومة', text: 'ملفات العمل اليومية تدخل مسارًا محكومًا للتطبيع والجودة والتتبع بدل أن تصبح أرقامًا بلا أصل.', state: 'ميزة تشغيلية' },
  { title: 'تجربة أعمال عربية وRTL', text: 'القرار والتنفيذ والإثبات مصممة أصلًا بالعربية وRTL، لا كتجربة مترجمة فوق واجهة عامة.', state: 'ميزة تجربة' },
  { title: 'المخزون والتحصيل', text: 'المنتج يربط ذكاء المخزون والتحصيل بالإشارة والقرار والعمل، بدل فصل كل تقرير في شاشة مستقلة.', state: 'ميزة نطاق' },
  { title: 'عزل الشركة وأمن البيانات', text: 'عزل الشركة والصلاحيات وحدود الكتابة جزء من المسار التشغيلي، لا طبقة لاحقة بعد الواجهة.', state: 'ميزة ثقة' },
];

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      const code = String(signInError.code ?? '').toLowerCase();
      const message = String(signInError.message ?? '').toLowerCase();
      console.error('[LoginPage] Supabase sign-in failed', { code: signInError.code, message: signInError.message });
      if (code.includes('invalid') || message.includes('invalid login credentials')) {
        setError('بيانات البريد أو كلمة المرور غير صحيحة.');
      } else if (code.includes('email_not_confirmed') || message.includes('email not confirmed')) {
        setError('البريد الإلكتروني للحساب غير مؤكد بعد.');
      } else if (message.includes('rate limit') || code.includes('rate')) {
        setError('تم تجاوز حد محاولات الدخول مؤقتًا. أعد المحاولة لاحقًا.');
      } else {
        setError('تعذر الوصول إلى خدمة الهوية. تحقّق من الاتصال ثم أعد المحاولة.');
      }
    }
    setSubmitting(false);
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#f6f7fb] text-ink-950">
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,.85fr)]">
        <section className="ag-login-value order-2 border-t border-slate-800 bg-[#0b1020] text-white lg:order-1 lg:border-l border-slate-800 lg:border-t-0">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
            <div className="flex items-center justify-between border-b border-ink-200 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-ink-950 text-sm font-black text-white">أ</div>
                <div>
                  <div className="text-[14px] font-black">الأغبري</div>
                  <div className="text-[10px] text-ink-400">ذكاء الأعمال والقرار</div>
                </div>
              </div>
              <LanguageToggle />
            </div>

            <div className="flex-1 py-10 lg:py-14">
              <div className="max-w-2xl">
                <div className="section-kicker">منصة أعمال · مبني على الدليل</div>
                <h1 className="mt-3 text-[34px] font-black leading-[1.18] tracking-tight text-ink-950 sm:text-[44px]">
                  من أول تقرير.
                  <span className="block text-primary-700">إلى قرار يمكن متابعته وقياسه.</span>
                </h1>
                <p className="mt-5 max-w-2xl text-[14px] leading-7 text-ink-600">
                  ارفع تقريرك كما هو. الأغبري يحافظ على المصدر، يثبت الحقيقة، يفسر ما حدث، يبرز ما يحتاج انتباهًا، ثم يربط التوصية بالقرار والعمل والنتيجة — داخل مساحة عربية أصلية.
                </p>
                <div className="mt-4 flex flex-wrap gap-2" aria-label="مبادئ المنصة">
                  <span className="rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-[9px] font-black text-primary-800">Evidence-first · مبني على الدليل</span>
                  <span className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[9px] font-black text-ink-600">Provenance · تتبع المصدر</span>
                  <span className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[9px] font-black text-ink-600">Decision · مسار القرار</span>
                  <span className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[9px] font-black text-ink-600">Outcome · النتيجة الفعلية</span>
                  <span className="rounded-full border border-accent-200 bg-accent-50 px-2.5 py-1 text-[9px] font-black text-accent-800">Arabic-first · العربية أولًا</span>
                </div>

                <div className="mt-8 grid gap-px overflow-hidden rounded-[12px] border border-ink-200 bg-ink-200 sm:grid-cols-2">
                  {principles.map(({ icon: Icon, title, text }) => (
                    <div key={title} className="bg-white p-4 sm:p-5">
                      <div className="flex items-center gap-2 text-[13px] font-black text-ink-900"><Icon size={17} className="text-primary-700"/>{title}</div>
                      <p className="mt-2 text-[11px] leading-5 text-ink-500">{text}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-8">
                  <div className="flex items-center gap-2 text-[12px] font-black text-ink-900"><Sparkles size={15} className="text-primary-700"/>خمس طرق محددة لمنافسة المشاريع الأكبر</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {competitiveProofLanes.map(lane => (
                      <div key={lane.title} className="rounded-[10px] border border-primary-100 bg-primary-50/40 p-3.5">
                        <div className="flex items-center justify-between gap-2"><div className="text-[11px] font-black text-ink-900">{lane.title}</div><span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-primary-700 ring-1 ring-inset ring-primary-200">{lane.state}</span></div>
                        <p className="mt-1.5 text-[10px] leading-5 text-ink-600">{lane.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8">
                  <div className="flex items-center gap-2 text-[12px] font-black text-ink-900"><Sparkles size={15} className="text-primary-700"/>ما الذي يحصل عليه العميل</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {customerValueLanes.map(lane => (
                      <div key={lane.title} className="rounded-[10px] border border-ink-200 bg-ink-50/70 p-3.5">
                        <div className="flex items-center justify-between gap-2"><div className="text-[11px] font-black text-ink-900">{lane.title}</div><span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-ink-500 ring-1 ring-inset ring-ink-200">{lane.state}</span></div>
                        <p className="mt-1.5 text-[10px] leading-5 text-ink-500">{lane.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-ink-200 pt-4 text-[10px] font-medium text-ink-400"><Upload size={12} className="mr-1 inline"/> ابدأ من مستند واحد. لا تحتاج إلى إعادة بناء نظامك كي ترى قيمة التحليل.</div>
          </div>
        </section>

        <section className="order-1 flex items-center border-b border-ink-200 bg-[#f6f7fb] px-5 py-8 sm:px-8 lg:order-2 lg:border-b-0 lg:px-12">
          <div className="mx-auto w-full max-w-[430px]">
            <div className="mb-7 lg:hidden"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-ink-950 text-sm font-black text-white">أ</div><div><div className="text-[14px] font-black">الأغبري</div><div className="text-[10px] text-ink-400">مساحة العمل</div></div></div><LanguageToggle/></div></div>
            <div className="rounded-[14px] border border-ink-200 bg-white p-6 shadow-card sm:p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-primary-50 text-primary-700"><LogIn size={18}/></div>
              <h2 className="mt-5 text-[24px] font-black tracking-tight text-ink-950">الدخول إلى مساحة العمل</h2>
              <p className="mt-2 text-[12px] leading-6 text-ink-500">حسابك يحدد الشركة والصلاحيات والمساحة التي ستراها بعد التحقق.</p>
              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                <div><label htmlFor="login-email" className="mb-1.5 block text-[12px] font-bold text-ink-700">البريد الإلكتروني</label><input id="login-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} className="input min-h-12 text-[16px] lg:text-sm" placeholder="name@company.com" dir="ltr"/></div>
                <div><label htmlFor="login-password" className="mb-1.5 block text-[12px] font-bold text-ink-700">كلمة المرور</label><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="input min-h-12 text-[16px] lg:text-sm" placeholder="••••••••••" dir="ltr"/></div>
                {error && <div role="alert" className="flex items-start gap-2.5 rounded-[10px] border border-danger-200 bg-danger-50 px-3.5 py-3 text-[12px] leading-5 text-danger-700"><AlertCircle size={17} className="mt-0.5 shrink-0"/><span>{error}</span></div>}
                <button type="submit" disabled={submitting} className="btn-primary min-h-12 w-full justify-center text-[13px]">{submitting ? <Loader2 size={17} className="animate-spin"/> : <ArrowLeft size={17}/>} {submitting ? 'جارٍ التحقق…' : 'الدخول إلى مساحة العمل'}</button>
              </form>
              <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[9px] border border-ink-200 bg-ink-200"><div className="bg-white px-3 py-2.5 text-center text-[10px] font-semibold text-ink-500">هوية موثقة</div><div className="bg-white px-3 py-2.5 text-center text-[10px] font-semibold text-ink-500">شركة معزولة</div></div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <Link to="/proposal-demo" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[11px] font-black text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-100">
                  <Sparkles size={14}/> مشاهدة العرض الحي أولًا
                </Link>
                <div className="flex min-h-11 items-center justify-center rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-center text-[10px] font-semibold text-ink-500">بدون بيانات أعمال تجريبية</div>
              </div>
              <p className="mt-4 text-center text-[10px] leading-5 text-ink-400">العرض الحي يشرح قيمة المنتج ومسار القرار فقط؛ بيانات الأعمال الحقيقية لا تظهر إلا داخل شركة وحساب مصرحين.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
