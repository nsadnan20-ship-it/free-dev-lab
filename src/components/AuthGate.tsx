import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { getAuthenticatedUser, onAuthStateChange } from '@/lib/auth-session';
import { resolveCurrentCompanyId, supabase } from '@/lib/supabase';
import { LoginPage } from '@/views/LoginPage';
import { AlertTriangle, CheckCircle2, Copy, RefreshCw, ShieldCheck, LogOut, Mail } from 'lucide-react';

interface AuthGateProps { children?: ReactNode; }

type GateState = 'checking' | 'ready' | 'unauthenticated' | 'tenant-missing';
type TenantBlockingReason = 'NO_MEMBERSHIP' | 'TENANT_CONTEXT_UNRESOLVED';

const TENANT_RETRY_COUNT = 6;
const TENANT_RETRY_DELAY_MS = 400;

async function resolveTenantWithRetry(): Promise<string | null> {
  for (let attempt = 1; attempt <= TENANT_RETRY_COUNT; attempt += 1) {
    const companyId = await resolveCurrentCompanyId();
    if (companyId) return companyId;
    if (attempt < TENANT_RETRY_COUNT) {
      await new Promise(resolve => window.setTimeout(resolve, TENANT_RETRY_DELAY_MS));
    }
  }
  return null;
}

async function resolveTenantBlockingReason(userId: string): Promise<TenantBlockingReason> {
  const { count, error } = await supabase
    .from('company_memberships')
    .select('company_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!error && (count ?? 0) > 0) return 'TENANT_CONTEXT_UNRESOLVED';
  return 'NO_MEMBERSHIP';
}

function TenantMissingState({
  user,
  reason,
  onRetry,
}: {
  user: User;
  reason: TenantBlockingReason;
  onRetry: () => void;
}) {
  const noMembership = reason === 'NO_MEMBERSHIP';
  const title = noMembership ? 'لا توجد عضوية شركة نشطة' : 'عضوية الشركة موجودة لكن السياق لم يثبت بعد';
  const description = noMembership
    ? 'تم التحقق من حسابك، لكن لا توجد عضوية نشطة تربط هذا الحساب بشركة. لذلك لا نعرض أي بيانات أعمال ولا نختار شركة افتراضية.'
    : 'الحساب لديه عضوية نشطة، لكن قاعدة البيانات لم تثبت شركة واحدة كسياق حاكم للجلسة. لذلك نوقف البيانات بدل المخاطرة بتحميل شركة خاطئة.';

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(user.email ?? '');
    } catch {
      // Clipboard permission is optional; the email remains visible below.
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#f7f7f8] p-5 text-ink-950">
      <div className="flex min-h-[calc(100vh-2.5rem)] items-center justify-center">
        <main className="w-full max-w-2xl rounded-[18px] border border-ink-200 bg-white p-6 shadow-card sm:p-8" aria-labelledby="tenant-gate-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-warning-50 text-warning-700 sm:mx-0">
              <AlertTriangle size={24} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-right">
              <div className="text-[10px] font-black tracking-[0.18em] text-primary-700">BUSINESS CONTEXT GATE</div>
              <h1 id="tenant-gate-title" className="mt-2 text-xl font-black text-ink-950 sm:text-2xl">{title}</h1>
              <p className="mt-2 text-sm leading-7 text-ink-500">{description}</p>
            </div>
          </div>

          <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="حالة الوصول">
            <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-4">
              <div className="text-[11px] font-bold text-ink-500">الهوية</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-black text-success-700"><CheckCircle2 size={15}/> موثقة</div>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-4">
              <div className="text-[11px] font-bold text-ink-500">عضوية الشركة</div>
              <div className={`mt-1 flex items-center gap-1.5 text-sm font-black ${noMembership ? 'text-warning-700' : 'text-success-700'}`}>
                {noMembership ? <AlertTriangle size={15}/> : <CheckCircle2 size={15}/>}
                {noMembership ? 'غير موجودة' : 'موجودة'}
              </div>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-4">
              <div className="text-[11px] font-bold text-ink-500">بيانات الأعمال</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-black text-ink-500"><ShieldCheck size={15}/> محجوبة بأمان</div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/50 p-5" aria-label="الإجراء المطلوب">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 shrink-0 text-primary-700" size={18} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-primary-900">ما الذي يجب فعله الآن؟</h2>
                {noMembership ? (
                  <ol className="mt-2 space-y-2 text-xs leading-6 text-primary-900/75">
                    <li><strong>1.</strong> اطلب من مالك/مدير الشركة إضافتك كعضو في الشركة الصحيحة.</li>
                    <li><strong>2.</strong> استخدم نفس بريد الحساب أدناه عند إرسال الدعوة.</li>
                    <li><strong>3.</strong> بعد قبول الدعوة اضغط «إعادة فحص العضوية» هنا.</li>
                  </ol>
                ) : (
                  <ol className="mt-2 space-y-2 text-xs leading-6 text-primary-900/75">
                    <li><strong>1.</strong> أعد تسجيل الدخول إذا كانت العضوية أُضيفت حديثًا أو تغيّر سياق الحساب.</li>
                    <li><strong>2.</strong> اضغط «إعادة فحص العضوية» بعد عودة الجلسة.</li>
                    <li><strong>3.</strong> لا يتم فتح أي بيانات حتى تثبت قاعدة البيانات سياق الشركة الحاكم.</li>
                  </ol>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-primary-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-ink-400">بريد الحساب</div>
                <div className="mt-1 truncate text-sm font-black text-ink-900" dir="ltr">{user.email || 'غير متاح'}</div>
              </div>
              <button type="button" onClick={copyEmail} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink-200 px-3 text-xs font-bold text-ink-700 hover:bg-ink-50">
                <Copy size={14} aria-hidden="true" /> نسخ البريد
              </button>
            </div>
          </section>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onRetry} className="btn-primary inline-flex min-h-11 flex-1 items-center justify-center gap-2">
              <RefreshCw size={16} aria-hidden="true" /> إعادة فحص العضوية
            </button>
            <button type="button" onClick={() => void supabase.auth.signOut()} className="btn-secondary inline-flex min-h-11 flex-1 items-center justify-center gap-2">
              <LogOut size={16} aria-hidden="true" /> تسجيل الخروج
            </button>
          </div>

          <p className="mt-5 text-center text-[11px] leading-5 text-ink-400">
            لا يتم اختيار شركة افتراضية، ولا يتم تجاوز RLS، ولا يتم عرض بيانات من مستأجر آخر لمجرد استمرار الجلسة.
          </p>
        </main>
      </div>
    </div>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<GateState>('checking');
  const [tenantReason, setTenantReason] = useState<TenantBlockingReason>('NO_MEMBERSHIP');
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let mounted = true;
    const sync = async (authenticatedUser: User | null) => {
      if (!authenticatedUser) {
        if (mounted) { setUser(null); setState('unauthenticated'); }
        return;
      }

      if (mounted) { setUser(authenticatedUser); setState('checking'); }

      const companyId = await resolveTenantWithRetry();
      if (!mounted) return;
      if (companyId) {
        setState('ready');
        return;
      }

      const reason = await resolveTenantBlockingReason(authenticatedUser.id);
      if (!mounted) return;
      setTenantReason(reason);
      setState('tenant-missing');
    };

    void getAuthenticatedUser().then(sync);
    const unsubscribe = onAuthStateChange(nextUser => { void sync(nextUser); });
    return () => { mounted = false; unsubscribe(); };
  }, [retryNonce]);

  if (state === 'checking') return (
    <div dir="rtl" className="min-h-screen bg-[#f7f7f8] p-5 text-ink-950">
      <div className="flex min-h-[calc(100vh-2.5rem)] items-center justify-center">
        <div className="w-full max-w-sm rounded-[14px] border border-ink-200 bg-white p-7 text-center shadow-card">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[9px] bg-ink-950 text-base font-black text-white">أ</div>
          <div className="mt-5 text-base font-black">الأغبري</div>
          <div className="mt-1 text-[10px] text-ink-400">جارٍ تثبيت الهوية وسياق الشركة</div>
          <div className="mx-auto mt-7 h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" role="status" aria-label="جارٍ التحقق"/>
        </div>
      </div>
    </div>
  );

  if (state === 'unauthenticated') return <LoginPage />;

  if (state === 'tenant-missing' && user) {
    return <TenantMissingState user={user} reason={tenantReason} onRetry={() => setRetryNonce(value => value + 1)} />;
  }

  return <>{children}</>;
}
