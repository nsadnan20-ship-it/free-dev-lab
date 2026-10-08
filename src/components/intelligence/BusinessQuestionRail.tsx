import { CheckCircle2, CircleAlert, HelpCircle, LockKeyhole } from 'lucide-react';
import type { BusinessQuestion, BusinessQuestionState } from '@/lib/report-intelligence/business-question-engine';

const labels: Record<BusinessQuestionState, string> = {
  ANSWERED: 'أُجيب',
  NOT_AVAILABLE: 'غير متاح',
  INSUFFICIENT_SAMPLE: 'عينة غير كافية',
  REVIEW_REQUIRED: 'مراجعة مطلوبة',
  BLOCKED: 'محجوب',
};

function icon(state: BusinessQuestionState) {
  if (state === 'ANSWERED') return <CheckCircle2 size={15} />;
  if (state === 'BLOCKED') return <LockKeyhole size={15} />;
  if (state === 'REVIEW_REQUIRED' || state === 'INSUFFICIENT_SAMPLE') return <CircleAlert size={15} />;
  return <HelpCircle size={15} />;
}

function displayAnswer(answer: unknown): string {
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'number' || typeof answer === 'boolean') return String(answer);
  if (answer && typeof answer === 'object') {
    const record = answer as Record<string, unknown>;
    for (const key of ['summary', 'observation', 'action', 'text']) {
      if (typeof record[key] === 'string' && record[key].trim()) return record[key] as string;
    }
  }
  return JSON.stringify(answer);
}

export function BusinessQuestionRail<TAnswer>({ questions }: { questions: BusinessQuestion<TAnswer>[] }) {
  return (
    <section dir="rtl" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div><div className="text-[9px] font-black tracking-[.14em] text-primary-700">BUSINESS QUESTIONS</div><h2 className="mt-1 text-base font-black text-ink-950">الأسئلة التي يجب أن يجيب عنها التقرير</h2></div>
        <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[9px] font-bold text-ink-600">{questions.length} سؤال</span>
      </div>
      <div className="mt-4 grid gap-2">
        {questions.map((question) => (
          <article key={question.id} className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
            <div className="flex items-center gap-2"><span className="text-primary-700">{icon(question.state)}</span><div className="min-w-0 flex-1"><div className="text-[11px] font-black text-ink-900">{question.label}</div><div className="mt-1 text-[9px] font-bold text-ink-500">{labels[question.state]}</div></div></div>
            {question.state === 'ANSWERED' && question.answer != null && <div className="mt-2 rounded-lg border border-success-200 bg-success-50 p-2.5 text-[10px] leading-5 text-success-950">{displayAnswer(question.answer)}</div>}
            {question.missingFields.length > 0 && <div className="mt-2 rounded-lg border border-warning-200 bg-warning-50 p-2.5 text-[9px] text-warning-950">الحقول المطلوبة: {question.missingFields.join('، ')}</div>}
            <div className="mt-2 text-[9px] leading-5 text-ink-500">{question.evidenceBoundary}</div>
            {question.followUpQuestion && (
              <div className="mt-2 rounded-lg border border-primary-100 bg-primary-50/40 p-2.5 text-[9px] leading-5 text-primary-900">
                <span className="font-black">السؤال التالي:</span> {question.followUpQuestion}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
