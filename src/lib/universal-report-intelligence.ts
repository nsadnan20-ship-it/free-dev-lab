import type { CanonicalField } from './report-intelligence/canonical-schema';
import { matchCanonicalField } from './report-intelligence/canonical-schema';
import { applyArchetypeRuleSet } from './report-intelligence/archetype-evaluator';
import { detectReportArchetype, getReportArchetype, type ArchetypeProfile } from './report-intelligence/archetype-registry';
import { buildAdvisoryPacket, type AdvisoryPacket } from './report-intelligence/report-advisory-orchestrator';
import {
  deriveReportIntelligence,
  selectExecutiveRecommendation,
  selectExecutiveSignal,
  type ReportIntelligence,
  type ReportRecommendation,
  type ReportSignal,
} from './report-intelligence/report-smart-insights';

export type UniversalIntelligenceStageStatus =
  | 'VERIFIED'
  | 'TRUSTED'
  | 'DERIVED'
  | 'REVIEW_REQUIRED'
  | 'PROPOSED'
  | 'NOT_AVAILABLE'
  | 'INSUFFICIENT_DATA'
  | 'GAP_DETECTED';

export type UniversalIntelligenceStage = {
  key: string;
  label: string;
  status: UniversalIntelligenceStageStatus;
  headline: string;
  detail: string;
  evidence: string[];
  next: string;
};

export type UniversalIntelligenceResult = {
  intelligence: ReportIntelligence;
  advisory: AdvisoryPacket;
  archetype: ArchetypeProfile | null;
  archetypeState: string;
  archetypeReason: string;
  confidence: number;
  mappedFieldCount: number;
  totalFieldCount: number;
  stages: UniversalIntelligenceStage[];
  topQuestions: Array<{
    id: string;
    label: string;
    state: string;
    answer: string;
    followUp: string | null;
  }>;
};

type UniversalReportInput = Parameters<typeof deriveReportIntelligence>[0] & {
  sourcePath?: string | null;
  sourceHash?: string | null;
  reportJobId?: string | null;
  archetypeId?: string | null;
  tenantId?: string | null;
  evidenceSnapshotId?: string | null;
  evidencePassportId?: string | null;
  availableFields?: CanonicalField[];
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function canonicalFields(input: UniversalReportInput): CanonicalField[] {
  const provided = Array.isArray(input.availableFields) ? input.availableFields : [];
  const dataset = input.sourceAnalysis?.datasets?.[0];
  const columns = dataset && typeof dataset === 'object' && Array.isArray((dataset as Record<string, unknown>).columns)
    ? (dataset as Record<string, unknown>).columns as Array<Record<string, unknown>>
    : [];

  const candidates = [
    ...provided,
    ...columns.flatMap((column) => [text(column.mappedField), text(column.name)]),
    ...(input.canonicalRows ?? []).flatMap((row) => Object.keys(row.data ?? {})),
  ];

  const fields = new Set<CanonicalField>();
  for (const candidate of candidates) {
    const exact = text(candidate) as CanonicalField;
    if (provided.includes(exact)) fields.add(exact);
    const matched = matchCanonicalField(candidate);
    if (matched) fields.add(matched);
    if (provided.includes(candidate as CanonicalField)) fields.add(candidate as CanonicalField);
  }
  return [...fields];
}

function fieldStats(input: UniversalReportInput) {
  const dataset = input.sourceAnalysis?.datasets?.[0];
  const columns = dataset && typeof dataset === 'object' && Array.isArray((dataset as Record<string, unknown>).columns)
    ? (dataset as Record<string, unknown>).columns as Array<Record<string, unknown>>
    : [];
  const total = columns.length;
  const mapped = columns.filter((column) => {
    const raw = text(column.mappedField);
    return Boolean(raw || matchCanonicalField(text(column.name)));
  }).length;
  const rows = Math.max(0, Number(input.rowCount ?? input.canonicalRows?.length ?? 0));
  let nullCells = 0;
  let cells = 0;
  for (const row of input.canonicalRows ?? []) {
    for (const column of columns) {
      cells += 1;
      const key = text(column.mappedField || column.name);
      const value = row.data?.[key];
      if (value == null || text(value) === '') nullCells += 1;
    }
  }
  const completeness = cells ? Math.round(100 - (nullCells / cells) * 100) : null;
  return { total, mapped, rows, completeness };
}

function strongestEvidence(signal: ReportSignal | null, recommendation: ReportRecommendation | null, intelligence: ReportIntelligence): string[] {
  if (signal?.evidence?.length) return signal.evidence.slice(0, 6);
  if (recommendation?.evidence?.length) return recommendation.evidence.slice(0, 6);
  const finding = intelligence.findings?.[0] ?? intelligence.risks?.[0] ?? intelligence.opportunities?.[0];
  return finding?.evidence?.slice(0, 6) ?? [];
}

function stage(
  key: string,
  label: string,
  status: UniversalIntelligenceStageStatus,
  headline: string,
  detail: string,
  evidence: string[],
  next: string,
): UniversalIntelligenceStage {
  return { key, label, status, headline, detail, evidence, next };
}

export function buildUniversalReportIntelligence(input: UniversalReportInput): UniversalIntelligenceResult {
  const fields = canonicalFields(input);
  const stats = fieldStats(input);
  const exactArchetype = text(input.archetypeId) ? getReportArchetype(text(input.archetypeId)) : null;
  const detection = exactArchetype
    ? { profile: exactArchetype, state: 'SUPPORTED', reason: 'EXACT_RUNTIME_ARCHETYPE' }
    : detectReportArchetype({
        sourcePath: input.sourcePath ?? null,
        specialty: input.specialty ?? null,
        availableFields: fields,
      });
  const effectiveSpecialty = input.specialty ?? detection.profile?.adapterSpecialty ?? null;
  const base = deriveReportIntelligence({ ...input, specialty: effectiveSpecialty });

  let intelligence = base;
  let archetype = detection.profile;
  if (archetype) {
    intelligence = applyArchetypeRuleSet(
      archetype,
      { ...input, specialty: effectiveSpecialty } as Parameters<typeof applyArchetypeRuleSet>[1],
      base,
    );
  }

  const provenance = {
    tenantId: input.tenantId ?? 'preview',
    sourceHash: text(input.sourceHash).replace(/^sha256:/, '') || 'preview:unhashed',
    reportExecutionJobId: input.reportJobId ?? 'preview:report',
    evidenceSnapshotId: input.evidenceSnapshotId ?? null,
    evidencePassportId: input.evidencePassportId ?? null,
  };

  const advisory = buildAdvisoryPacket({
    intelligence,
    provenance,
    availableFields: fields,
    sampleSize: stats.rows,
    archetypeId: archetype?.id ?? null,
    profileVersion: archetype?.version ?? null,
  });

  const signal = selectExecutiveSignal(intelligence);
  const recommendation = selectExecutiveRecommendation(intelligence, signal);
  const evidence = strongestEvidence(signal, recommendation, intelligence);
  const primaryFinding = intelligence.findings?.[0] ?? intelligence.risks?.[0] ?? intelligence.opportunities?.[0] ?? null;
  const hasRows = stats.rows > 0;
  const quality = stats.completeness ?? null;
  const mappingRatio = stats.total ? stats.mapped / stats.total : 0;
  const evidenceRatio = signal
    ? Math.min(1, (signal.evidence?.filter((item) => String(item).includes('='))?.length ?? 0) / 3)
    : 0;
  // This is confidence in the *analysis result*, not a cosmetic quality score.
  // Keep semantic coverage and source completeness visible in the calculation and
  // prevent a high signal count from masking weak field definitions.
  const confidence = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (hasRows ? 30 : 0)
        + (quality == null ? 0 : quality * 0.30)
        + mappingRatio * 25
        + evidenceRatio * 15,
      ),
    ),
  );

  const proofText = provenance.evidenceSnapshotId && provenance.evidencePassportId
    ? 'Evidence Passport + snapshot مرتبطان بالمصدر.'
    : 'النتيجة قابلة للمراجعة، لكن اعتماد القرار النهائي يحتاج Evidence Passport/Snapshot مكتملًا.';

  const stages: UniversalIntelligenceStage[] = [
    stage(
      'source',
      'المصدر',
      hasRows ? 'VERIFIED' : 'INSUFFICIENT_DATA',
      input.sourcePath ? 'المصدر معروف ومربوط بالتحليل.' : 'المصدر حاضر داخل سياق التحليل.',
      `${stats.rows.toLocaleString('ar-YE')} سجلًا متاحًا للتحليل${input.sourceHash ? ' · بصمة المصدر موجودة' : ''}.`,
      input.sourceHash ? ['sourceHash=' + input.sourceHash] : [],
      'ثبّت هوية الملف والدورة قبل مشاركة القرار.',
    ),
    stage(
      'extraction',
      'الاستخراج',
      hasRows ? 'TRUSTED' : 'INSUFFICIENT_DATA',
      hasRows ? 'تم استخراج سجلات قابلة للتحليل.' : 'لم ينتج الاستخراج عينة كافية.',
      'الذكاء يبني على الصفوف القانونية نفسها، وليس على أرقام تجميلية.',
      ['rows=' + stats.rows, 'fields=' + stats.total],
      stats.rows ? 'انتقل من الاستخراج إلى فحص الحقول والاكتمال.' : 'أكمل الاستخراج أو صحح المصدر.',
    ),
    stage(
      'truth',
      'كشف الحقيقة',
      quality != null && quality >= 85 ? 'VERIFIED' : 'REVIEW_REQUIRED',
      quality == null ? 'جودة البيانات تحتاج قياسًا إضافيًا.' : `اكتمال الخلايا ${quality}%، والربط الدلالي ${stats.mapped}/${Math.max(1, stats.total)} حقل.`,
      quality != null && quality >= 85
        ? 'الحقول الأساسية قابلة للاعتماد ضمن نطاق المصدر.'
        : 'وجود حقول ناقصة أو غير معرّفة يحد من قوة الاستنتاج.',
      ['mappedFields=' + stats.mapped, ...(quality == null ? [] : ['completeness=' + quality + '%'])],
      quality != null && quality >= 85 ? 'ابحث عن الإشارة وليس مجرد الوصف.' : 'راجع الحقول التي تحد من القرار.',
    ),
    stage(
      'signal',
      'الإشارة',
      signal ? 'DERIVED' : 'NOT_AVAILABLE',
      signal ? signal.message : 'لم تظهر إشارة تنفيذية مؤهلة من البيانات الحالية.',
      signal ? signal.title : 'لا نحول غياب الإشارة إلى حكم إيجابي.',
      evidence,
      signal ? 'اختبر لماذا ظهرت الإشارة قبل تحويلها إلى توصية.' : 'وسّع العينة أو حسّن تعريف الحقول.',
    ),
    stage(
      'why',
      'لماذا',
      signal ? 'REVIEW_REQUIRED' : 'NOT_AVAILABLE',
      signal ? (signal.priorityReason?.[0] ?? 'توجد أسباب مرتبطة بالأولوية.') : 'لا يوجد تفسير مثبت.',
      signal ? 'هذا تفسير تحليلي للقرائن المرصودة وليس إثباتًا سببيًا ما لم توجد أدلة إضافية.' : 'لا نختلق سببًا غير موجود في المصدر.',
      signal?.drivers?.flatMap((driver) => driver.proof).slice(0, 6) ?? [],
      signal ? 'راجع المحرك أو البعد الأكثر مساهمة.' : 'لا يوجد مسار سبب موثوق بعد.',
    ),
    stage(
      'meaning',
      'ماذا يعني',
      signal ? 'DERIVED' : 'NOT_AVAILABLE',
      signal?.soWhat || primaryFinding?.statement || intelligence.summary,
      signal?.impact || primaryFinding?.limitation || 'الأثر المالي أو التشغيلي النهائي غير مثبت.',
      strongestEvidence(signal, recommendation, intelligence),
      'حدد ما الذي يجب تغييره وما الذي يجب قياسه.',
    ),
    stage(
      'recommendation',
      'التوصية',
      recommendation ? 'PROPOSED' : 'NOT_AVAILABLE',
      recommendation?.title || intelligence.advisorBrief.recommendedAction || 'لا توجد توصية كافية.',
      recommendation?.action || recommendation?.limitation || 'التوصية غير متاحة دون دليل كافٍ.',
      recommendation?.evidence?.slice(0, 6) ?? evidence,
      recommendation ? 'اعرض التوصية كاقتراح، لا كقرار منفذ.' : 'أكمل الدليل قبل التوصية.',
    ),
    stage(
      'measurement',
      'القياس',
      recommendation?.measurement ? 'PROPOSED' : 'NOT_AVAILABLE',
      recommendation?.measurement || intelligence.advisorBrief.measurement || 'لا يوجد مقياس مثبت بعد.',
      recommendation?.expectedOutcome || 'النتيجة المتوقعة ليست نتيجة محققة.',
      recommendation?.evidence?.slice(0, 4) ?? evidence,
      'ثبّت خط أساس ثم أعد القياس بعد الإجراء.',
    ),
    stage(
      'decision',
      'القرار',
      advisory.actionState === 'ACTIONABLE' ? 'TRUSTED' : advisory.actionState === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'NOT_AVAILABLE',
      advisory.actionState === 'ACTIONABLE' ? 'التوصية مؤهلة لمسار قرار/عمل بعد اكتمال الحوكمة.' : 'القرار ليس معتمدًا بعد.',
      proofText,
      [advisory.proofState, advisory.actionState],
      advisory.actionState === 'ACTIONABLE' ? 'حوّل التوصية إلى مهمة محددة بمالك وموعد.' : 'أكمل Passport/Snapshot أو ارفع فجوة الإثبات.',
    ),
    stage(
      'work',
      'العمل',
      advisory.actionState === 'ACTIONABLE' ? 'PROPOSED' : 'REVIEW_REQUIRED',
      recommendation?.action || 'لا توجد مهمة تنفيذية مؤهلة بعد.',
      recommendation?.ownerHint ? 'المالك المقترح: ' + recommendation.ownerHint : 'مالك التنفيذ غير محدد.',
      recommendation?.evidence?.slice(0, 4) ?? evidence,
      'بعد التنفيذ، سجّل النتيجة بنفس هوية التقرير.',
    ),
    stage(
      'outcome',
      'النتيجة',
      'NOT_AVAILABLE',
      'لا توجد نتيجة تنفيذية مثبتة في هذا السياق.',
      'لا نسمّي المتوقع «متحققًا» قبل وصول دليل بعد التنفيذ.',
      [],
      'أعد القياس على نفس المصدر/المؤشر ثم ثبّت النتيجة.',
    ),
    stage(
      'learning',
      'التعلّم',
      'NOT_AVAILABLE',
      'التعلّم ينتظر نتيجة فعلية قابلة للمقارنة.',
      'سيُربط الدرس بما تغيّر وبالمقياس الذي تم تتبعه.',
      [],
      'قارن قبل/بعد ثم حدّث قاعدة التوصية.',
    ),
    stage(
      'benchmark',
      'المقارنة',
      'GAP_DETECTED',
      'لا يوجد Benchmark خارجي موثوق ضمن هذا المصدر.',
      'لا يتم اختلاق متوسط سوق أو منافس. المقارنة تُفتح فقط عند وجود مرجع موثق.',
      [],
      'أضف مرجعًا داخليًا أو خارجيًا موثقًا قبل إصدار مقارنة.',
    ),
  ];

  const topQuestions = advisory.questions.slice(0, 8).map((question) => {
    const rawAnswer = question.answer;
    let answer = '';
    if (rawAnswer && typeof rawAnswer === 'object') {
      const record = rawAnswer as Record<string, unknown>;
      answer = text(record.summary ?? record.statement ?? record.action ?? record.observation ?? record.finding ?? '');
    }
    return {
      id: question.id,
      label: question.label,
      state: String(question.state),
      answer: answer || 'لا توجد إجابة مكتملة من الدليل الحالي.',
      followUp: question.followUpQuestion ?? null,
    };
  });

  return {
    intelligence,
    advisory,
    archetype,
    archetypeState: detection.state,
    archetypeReason: detection.reason,
    confidence,
    mappedFieldCount: stats.mapped,
    totalFieldCount: stats.total,
    stages,
    topQuestions,
  };
}
