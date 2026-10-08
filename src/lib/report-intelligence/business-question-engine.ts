import type { CanonicalField } from './canonical-schema.js';

export type BusinessQuestionState =
  | 'ANSWERED'
  | 'NOT_AVAILABLE'
  | 'INSUFFICIENT_SAMPLE'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';

export type BusinessQuestion<TAnswer = unknown> = {
  id: string;
  label: string;
  requiredFields: CanonicalField[];
  minimumSample: number;
  priority: number;
  answer?: TAnswer | null;
  state: BusinessQuestionState;
  missingFields: CanonicalField[];
  evidenceBoundary: string;
  followUpQuestion: string | null;
};

function uniqueFields(fields: CanonicalField[]): CanonicalField[] {
  return [...new Set(fields)];
}

export function evaluateBusinessQuestion<TAnswer>(
  question: Omit<BusinessQuestion<TAnswer>, 'state' | 'missingFields' | 'evidenceBoundary' | 'followUpQuestion'> & {
    availableFields: CanonicalField[];
    followUpQuestion?: string | null;
    sampleSize: number;
    answer?: TAnswer | null;
    reviewRequired?: boolean;
    blockedReason?: string | null;
  },
): BusinessQuestion<TAnswer> {
  const available = new Set(uniqueFields(question.availableFields));
  const required = uniqueFields(question.requiredFields);
  const missingFields = required.filter((field) => !available.has(field));

  if (question.blockedReason) {
    return {
      id: question.id,
      label: question.label,
      requiredFields: required,
      minimumSample: question.minimumSample,
      priority: question.priority,
      answer: null,
      state: 'BLOCKED',
      missingFields,
      evidenceBoundary: question.blockedReason,
          followUpQuestion: question.followUpQuestion ?? null,
    };
  }

  if (missingFields.length > 0) {
    return {
      id: question.id,
      label: question.label,
      requiredFields: required,
      minimumSample: question.minimumSample,
      priority: question.priority,
      answer: null,
      state: 'NOT_AVAILABLE',
      missingFields,
      evidenceBoundary: 'الإجابة تتطلب الحقول: ' + missingFields.join('، '),
          followUpQuestion: question.followUpQuestion ?? null,
    };
  }

  if (question.sampleSize < question.minimumSample) {
    return {
      id: question.id,
      label: question.label,
      requiredFields: required,
      minimumSample: question.minimumSample,
      priority: question.priority,
      answer: null,
      state: 'INSUFFICIENT_SAMPLE',
      missingFields: [],
      evidenceBoundary: 'العينة المتاحة أقل من الحد الأدنى المطلوب (' + question.minimumSample + ').',
          followUpQuestion: question.followUpQuestion ?? null,
    };
  }

  if (question.reviewRequired) {
    return {
      id: question.id,
      label: question.label,
      requiredFields: required,
      minimumSample: question.minimumSample,
      priority: question.priority,
      answer: question.answer ?? null,
      state: 'REVIEW_REQUIRED',
      missingFields: [],
      evidenceBoundary: 'الإجابة تحتاج مراجعة بشرية قبل اعتمادها كقرار.',
          followUpQuestion: question.followUpQuestion ?? null,
    };
  }

  if (question.answer == null) {
    return {
      id: question.id,
      label: question.label,
      requiredFields: required,
      minimumSample: question.minimumSample,
      priority: question.priority,
      answer: null,
      state: 'REVIEW_REQUIRED',
      missingFields: [],
      evidenceBoundary: 'المدخلات متاحة لكن لم تُنتج طبقة التحليل إجابة مثبتة.',
          followUpQuestion: question.followUpQuestion ?? null,
    };
  }

  return {
    id: question.id,
    label: question.label,
    requiredFields: required,
    minimumSample: question.minimumSample,
    priority: question.priority,
    answer: question.answer,
    state: 'ANSWERED',
    missingFields: [],
    evidenceBoundary: 'الإجابة مبنية على الحقول والعينة المحددة؛ ارجع إلى evidence/passport قبل القرار التنفيذي.',
        followUpQuestion: question.followUpQuestion ?? null,
  };
}

export function sortBusinessQuestions<TAnswer>(
  questions: BusinessQuestion<TAnswer>[],
): BusinessQuestion<TAnswer>[] {
  return [...questions].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
