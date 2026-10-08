import type { CanonicalField } from './canonical-schema.js';
import { evaluateBusinessQuestion, sortBusinessQuestions, type BusinessQuestion } from './business-question-engine.js';
import { buildBusinessQuestionSet, type BusinessArchetype } from './business-question-catalog.js';
import { buildClaimsFromReportIntelligence } from './report-claim-adapter.js';
import type { ClaimProvenance, Claim } from './claim-ledger.js';
import type { ReportIntelligence } from './report-smart-insights.js';

export type AdvisoryPacket = {
  claims: Claim[];
  questions: BusinessQuestion<Record<string, unknown>>[];
  primarySignal: Claim | null;
  nextRecommendation: Claim | null;
  proofState: 'VERIFIED' | 'REVIEW_REQUIRED' | 'NOT_AVAILABLE';
  actionState: 'ACTIONABLE' | 'REVIEW_REQUIRED' | 'NOT_AVAILABLE';
  outcomeState: 'OBSERVED' | 'INSUFFICIENT' | 'NOT_AVAILABLE';
};

export type AdvisoryPacketInput = {
  intelligence: ReportIntelligence;
  provenance: ClaimProvenance;
  availableFields: CanonicalField[];
  sampleSize: number;
  scope?: { period?: string | null; filters?: Record<string, string | number | boolean | null> };
  archetypeId?: string | null;
  profileVersion?: number | null;
};

function claimStateForProof(provenance: ClaimProvenance): AdvisoryPacket['proofState'] {
  // VERIFIED requires the complete source-bound evidence chain. A single identifier
  // is not sufficient to establish the authoritative passport/snapshot relationship.
  return provenance.evidenceSnapshotId && provenance.evidencePassportId
    ? 'VERIFIED'
    : 'REVIEW_REQUIRED';
}

type AdvisoryQuestionAnswer = Record<string, unknown>;

function answerText(value: string): AdvisoryQuestionAnswer {
  return { summary: value };
}

function followUpForQuestion(question: BusinessQuestion<AdvisoryQuestionAnswer>): string | null {
  if (question.state === 'NOT_AVAILABLE' && question.missingFields.length) {
    return 'ما البيانات التي يجب توفيرها أولًا؟ (' + question.missingFields.join('، ') + ')';
  }
  if (question.state === 'INSUFFICIENT_SAMPLE') {
    return 'هل يمكن توسيع العينة إلى الحد الأدنى المطلوب (' + question.minimumSample + ')؟';
  }
  if (question.state === 'BLOCKED') return 'ما العائق الذي يجب رفعه قبل متابعة التحليل؟';
  const next: Record<string, string> = {
    'report.what-happened': 'أين تركز التغير، ومن ساهم فيه؟',
    'report.where': 'من/ما الذي ساهم في هذه البؤرة؟',
    'report.contributors': 'هل توجد مخاطر أو فرص مرتبطة بهذه المساهمة؟',
    'report.detractors': 'ما الإجراء الذي يمكن تجربته لمعالجة هذا الانحراف؟',
    'report.primary-signal': 'هل الدليل الحالي كافٍ لتحويل الإشارة إلى قرار؟',
    'report.why': 'ما الدليل المباشر الذي يثبت هذا التفسير؟',
    'report.so-what': 'من المسؤول، وما النتيجة التي سنقيسها بعد التنفيذ؟',
    'report.what-next': 'كيف سنقرأ النتيجة بعد التنفيذ ونتعلم منها؟',
    'report.proof': 'هل أصبحت الأدلة كافية لاعتماد القرار؟',
  };
  return next[question.id] ?? 'ما القرار أو الإجراء التالي الذي يتطلبه هذا السؤال؟';
}

function buildQuestions(input: AdvisoryPacketInput, claims: Claim[]): BusinessQuestion<AdvisoryQuestionAnswer>[] {
  const signalClaims = claims.filter((claim) => claim.claimId.startsWith('signal:'));
  const recommendationClaims = claims.filter((claim) => claim.claimId.startsWith('recommendation:'));
  const primarySignal = signalClaims[0] ?? null;
  const nextRecommendation = recommendationClaims[0] ?? null;

  const business = input.intelligence;
  const topFinding = business.findings?.[0] ?? null;
  const topRisk = business.risks?.[0] ?? null;
  const topOpportunity = business.opportunities?.[0] ?? null;
  const contributorFinding = business.findings?.find((item) => item.id.endsWith(':change-contributor')) ?? business.findings?.find((item) => item.id.endsWith(':top-party')) ?? null;

  const whatAnswer = input.sampleSize > 0
    ? answerText('تم تحليل ' + input.sampleSize + ' سجلًا من المصدر الكانوني. ' + (topFinding?.statement ?? input.intelligence.summary))
    : null;

  const whereAnswer = contributorFinding
    ? answerText(contributorFinding.dimensionLabel + ': ' + String(contributorFinding.dimensionValue ?? 'غير محدد') + ' — ' + contributorFinding.statement)
    : topFinding?.dimensionLabel
      ? answerText(topFinding.dimensionLabel + ': ' + String(topFinding.dimensionValue ?? 'غير محدد'))
      : null;

  const contributorsAnswer = contributorFinding
    ? answerText(contributorFinding.statement + ' الدليل: ' + contributorFinding.evidence.join(' · '))
    : null;

  const detractorsAnswer = topRisk
    ? answerText(topRisk.statement + ' الإجراء المقترح: ' + topRisk.action)
    : null;

  const whyAnswer = primarySignal
    ? { observation: primarySignal.statement, boundary: 'هذه قراءة للملاحظة/المساهمة وليست إثباتًا سببيًا.' }
    : null;

  const soWhatAnswer = topRisk
    ? answerText(topRisk.title + ' — ' + topRisk.action)
    : topOpportunity
      ? answerText(topOpportunity.title + ' — ' + topOpportunity.action)
      : topFinding?.action
        ? answerText(topFinding.action)
        : null;

  const nextAnswer = nextRecommendation
    ? { action: nextRecommendation.statement }
    : business.advisorBrief?.recommendedAction
      ? { action: business.advisorBrief.recommendedAction }
      : null;

  const universal = [
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.what-happened',
      label: 'ماذا حدث في هذا المصدر؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 100,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: whatAnswer,
    }),
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.where',
      label: 'أين تركز التغير؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 95,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: whereAnswer,
    }),
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.contributors',
      label: 'من/ما الذي ساهم في التغير؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 90,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: contributorsAnswer,
    }),
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.detractors',
      label: 'من/ما الذي سحب النتيجة إلى الأسفل؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 85,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: detractorsAnswer,
    }),
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.primary-signal',
      label: 'ما أهم إشارة مثبتة الآن؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 90,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: primarySignal
        ? answerText(primarySignal.statement)
        : null,
    }),
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.why',
      label: 'ما الذي يفسر الملاحظة، وما حدود ذلك؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 80,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: whyAnswer,
      reviewRequired: Boolean(primarySignal),
    }),
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.so-what',
      label: 'ما أثر ذلك على القرار؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 75,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: soWhatAnswer,
      reviewRequired: Boolean(topRisk || topOpportunity),
    }),
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.what-next',
      label: 'ما الإجراء التالي المقترح؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 70,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: nextAnswer,
      reviewRequired: Boolean(nextRecommendation || business.advisorBrief?.recommendedAction),
    }),
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.proof',
      label: 'هل يمكن إثبات هذه النتيجة من المصدر؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 60,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: claimStateForProof(input.provenance) === 'VERIFIED'
        ? { sourceHash: input.provenance.sourceHash, jobId: input.provenance.reportExecutionJobId, evidenceSnapshotId: input.provenance.evidenceSnapshotId ?? null, passportId: input.provenance.evidencePassportId ?? null }
        : null,
    }),
    evaluateBusinessQuestion<Record<string, unknown>>({
      id: 'report.after-action',
      label: 'هل لدينا نتيجة فعلية بعد الإجراء؟',
      requiredFields: [],
      minimumSample: 1,
      priority: 50,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer: null,
    }),
  ];

  const archetypeFamily: BusinessArchetype = input.archetypeId?.startsWith('sales.')
    ? 'sales'
    : input.archetypeId?.startsWith('purchases.')
      ? 'purchases'
      : input.archetypeId?.startsWith('inventory.')
        ? 'inventory'
        : input.archetypeId?.startsWith('receivables.')
          ? 'receivables'
          : input.archetypeId?.startsWith('payments.')
            ? 'payments'
            : input.archetypeId?.startsWith('profitability.')
              ? 'profitability'
              : 'generic';
  const answerFor = (id: string): AdvisoryQuestionAnswer | null => {
    const findingById = (needle: string) => business.findings?.find((item) => item.id === needle)
      ?? business.risks?.find((item) => item.id === needle)
      ?? business.opportunities?.find((item) => item.id === needle)
      ?? null;
    if (id === 'sales.trend' || id === 'purchases.trend') {
      const finding = business.findings?.find((item) => item.id.endsWith(':period-change')) ?? null;
      return finding
        ? answerText(finding.statement + ' القياس: ' + (business.forecast?.status === 'AVAILABLE' ? business.forecast.note : 'لا يوجد توقع متاح.'))
        : null;
    }
    if (id === 'sales.customer-concentration') {
      const finding = findingById('sales:top-party');
      return finding ? answerText(finding.statement) : null;
    }
    if (id === 'purchases.supplier-concentration') {
      const finding = findingById('purchases:top-party');
      return finding ? answerText(finding.statement) : null;
    }
    if (id === 'sales.profitability' || id === 'profitability.margin') {
      const finding = findingById('profitability:margin');
      return finding ? answerText(finding.statement) : null;
    }
    if (id === 'inventory.position') {
      const finding = findingById('inventory:position');
      return finding ? answerText(finding.statement) : null;
    }
    if (id === 'inventory.valuation') {
      const finding = findingById('inventory:position');
      return finding ? answerText(finding.statement) : null;
    }
    if (id === 'receivables.concentration') {
      const finding = findingById('receivables:concentration-risk');
      return finding ? answerText(finding.statement) : null;
    }
    return null;
  };

  const definitions = buildBusinessQuestionSet<Record<string, unknown>>(archetypeFamily, evaluateBusinessQuestion, {
    availableFields: input.availableFields,
    sampleSize: input.sampleSize,
    answers: {},
  });
  const specialized = definitions.map((question) => {
    const answer = answerFor(question.id);
    if (answer == null) return question;

    // Re-evaluate the question with the actual intelligence answer so the state
    // reflects ANSWERED/REVIEW_REQUIRED rather than remaining NOT_AVAILABLE/REVIEW_REQUIRED
    // from the initial empty-answer pass.
    return evaluateBusinessQuestion<AdvisoryQuestionAnswer>({
      id: question.id,
      label: question.label,
      requiredFields: question.requiredFields,
      minimumSample: question.minimumSample,
      priority: question.priority,
      availableFields: input.availableFields,
      sampleSize: input.sampleSize,
      answer,
    });
  }).filter((question) => !universal.some((existing) => existing.id === question.id));

  const modelFinding = input.archetypeId
    ? business.findings?.find((item) => item.id.startsWith('archetype:' + input.archetypeId + ':')) ?? null
    : null;
  const archetypeQuestion = input.archetypeId
    ? evaluateBusinessQuestion<AdvisoryQuestionAnswer>({
        id: 'archetype:' + input.archetypeId + ':primary-question',
        label: 'النموذج ' + input.archetypeId + ' — ما النتيجة الأساسية؟',
        requiredFields: [],
        minimumSample: 1,
        priority: 110,
        availableFields: input.availableFields,
        sampleSize: input.sampleSize,
        answer: modelFinding
          ? {
              finding: modelFinding.statement,
              evidence: modelFinding.evidence,
              limitation: modelFinding.limitation,
              action: modelFinding.action,
            }
          : null,
        reviewRequired: Boolean(input.archetypeId) && !modelFinding,
      })
    : null;

  return sortBusinessQuestions([
    ...universal,
    ...specialized,
    ...(archetypeQuestion ? [archetypeQuestion] : []),
  ]).map((question) => ({
    ...question,
    followUpQuestion: question.followUpQuestion ?? followUpForQuestion(question),
  }));
}

export function buildAdvisoryPacket(input: AdvisoryPacketInput): AdvisoryPacket {
  const claims = buildClaimsFromReportIntelligence({
    intelligence: input.intelligence,
    provenance: input.provenance,
    inputFields: input.availableFields,
    sampleSize: input.sampleSize,
    scope: input.scope,
    archetypeId: input.archetypeId,
    profileVersion: input.profileVersion,
  });

  const questions = buildQuestions(input, claims);
  const primarySignal = claims.find((claim) => claim.claimId.startsWith('signal:')) ?? null;
  const nextRecommendation = claims.find((claim) => claim.claimId.startsWith('recommendation:')) ?? null;
  const proofState = claimStateForProof(input.provenance);

  return {
    claims,
    questions,
    primarySignal,
    nextRecommendation,
    proofState,
    actionState: nextRecommendation ? (proofState === 'VERIFIED' ? 'ACTIONABLE' : 'REVIEW_REQUIRED') : 'NOT_AVAILABLE',
    outcomeState: 'INSUFFICIENT',
  };
}
