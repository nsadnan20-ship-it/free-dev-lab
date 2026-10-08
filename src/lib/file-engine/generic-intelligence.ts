import type { Dataset } from './types.js';
import {
  deriveReportIntelligence,
  type BusinessFinding,
  type ReportIntelligence,
  type ReportRecommendation,
  type ReportSignal,
} from '../report-intelligence/report-smart-insights.js';

const RISK_TERMS = [
  'خطر', 'مخاطر', 'تأخير', 'متأخر', 'عجز', 'نقص', 'مشكلة', 'تنبيه', 'حرج', 'نفاد', 'فقد', 'انحراف',
  'risk', 'delay', 'delayed', 'shortage', 'issue', 'warning', 'critical', 'overdue', 'loss', 'deficit',
];
const ACTION_TERMS = [
  'يجب', 'يلزم', 'إجراء', 'توصية', 'اعتماد', 'تنفيذ', 'مراجعة', 'متابعة', 'قرار', 'الموافقة',
  'must', 'need', 'action', 'recommendation', 'approve', 'review', 'follow up', 'decision',
];
const STOP_WORDS = new Set([
  'هذا', 'هذه', 'ذلك', 'تلك', 'من', 'في', 'على', 'عن', 'إلى', 'مع', 'هو', 'هي', 'و', 'او', 'أو', 'ثم', 'كما',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'were', 'into', 'our', 'your',
]);

function text(value: unknown): string { return String(value ?? '').trim(); }
function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي');
}
function datasetText(dataset: Dataset): string[] {
  return (dataset.rows ?? []).flatMap((row) => {
    const values = Object.values(row).filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
    return [values.map(text).join(' | ')];
  }).filter(Boolean);
}
function matchingLines(lines: string[], terms: string[], limit = 5): string[] {
  return lines.filter((line) => terms.some((term) => normalize(line).includes(normalize(term)))).slice(0, limit);
}
function countMatches(lines: string[], terms: string[]): number {
  return lines.reduce((count, line) => count + terms.filter((term) => normalize(line).includes(normalize(term))).length, 0);
}
function topKeywords(lines: string[]): Array<{ word: string; count: number }> {
  const counts = new Map<string, number>();
  for (const line of lines) for (const raw of line.match(/[\p{L}\p{N}]{4,}/gu) ?? []) {
    const word = normalize(raw);
    if (!word || STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([word, count]) => ({ word, count }));
}
function numericEvidence(lines: string[]): string[] {
  const result: string[] = [];
  const numericRegex = /(?:[$€£¥]|ر\.?س|ريال|دولار|USD|EUR|SAR|YER)?\s*[-+]?\d[\d,\u066B\u066C.]*/gi;
  for (const line of lines) {
    const values = line.match(numericRegex) ?? [];
    if (values.length) result.push(line + ' · أرقام مرصودة: ' + values.slice(0, 5).join(', '));
    if (result.length >= 5) break;
  }
  return result;
}
function genericRecommendation(evidence: string[], context: string): ReportRecommendation {
  return {
    id: 'generic:file:review', status: 'PROPOSED', priority: evidence.length ? 'medium' : 'low',
    title: 'مراجعة الملف وتحويل الإشارات إلى قرار موثق',
    action: 'راجع الأدلة المحددة في الملف، ثبّت المالك والمطلوب، ثم حوّل ما يثبت إلى قرار أو مهمة قابلة للقياس.',
    why: context, evidence, ownerHint: 'المسؤول التشغيلي المناسب لمحتوى الملف',
    impact: 'التحليل يحدد مواضع الانتباه؛ الأثر المالي أو التشغيلي لا يُثبت من النص وحده.',
    expectedOutcome: 'إزالة الغموض عن البنود ذات الصلة وربطها بقرار أو إجراء قابل للمتابعة.',
    whyNow: evidence.length ? 'ظهرت إشارات نصية مباشرة تستحق المراجعة.' : 'المصدر يحتاج فحصًا دلاليًا قبل اعتماد أي حكم.',
    measurement: 'عدد البنود التي تم تأكيدها + حالة القرار/الإجراء المرتبط بكل بند.',
    risk: 'قد تكون اللغة وصفية أو سياقية؛ لا تُعامل الإشارة النصية كإثبات سببي.',
    blocker: 'لا يوجد أثر تنفيذي مثبت في الملف نفسه.',
    limitation: 'الاستنتاج العام مبني على النص/القيم المتاحة؛ لا توجد دلالة تجارية مفترضة من اسم الملف فقط.',
  };
}
export function buildGenericFileIntelligence(dataset: Dataset, format: string): ReportIntelligence {
  const lines = datasetText(dataset);
  const allText = lines.join('\n');
  const words = allText.split(/\s+/).filter(Boolean);
  const riskLines = matchingLines(lines, RISK_TERMS);
  const actionLines = matchingLines(lines, ACTION_TERMS);
  const numbers = numericEvidence(lines);
  const keywords = topKeywords(lines);
  const riskCount = countMatches(lines, RISK_TERMS);
  const actionCount = countMatches(lines, ACTION_TERMS);
  const dateCount = (allText.match(/\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g) ?? []).length;
  const base = deriveReportIntelligence({ specialty: null, rowCount: dataset.rowCount, sourceAnalysis: { datasets: [dataset] }, canonicalRows: dataset.rows.map((data, index) => ({ row_number: index + 1, data })) });
  const signals: ReportSignal[] = [];
  if (riskLines.length) {
    const severity = riskCount >= 5 ? 'high' : riskCount >= 2 ? 'medium' : 'low';
    signals.push({
      id: 'generic:file:risk-language', severity, title: 'إشارات مخاطر أو استثناءات داخل المحتوى',
      message: 'رُصدت ' + riskCount + ' إشارات لغوية مرتبطة بالمخاطر/الاستثناءات ضمن ' + lines.length + ' سطرًا قابلاً للفحص.',
      evidence: riskLines, affectedRows: riskLines.length,
      soWhat: 'هذه البنود تستحق مراجعة مباشرة وربطها بمصدرها أو إجراءها، لكنها ليست إثباتًا سببيًا بحد ذاتها.',
      impact: 'الأثر غير مثبت ماليًا/تشغيليًا من المحتوى وحده.', ownerHint: 'المسؤول عن الموضوع المذكور في الملف',
      priority: severity === 'high' ? 'P1' : 'P2', priorityReason: ['risk_terms=' + riskCount, 'evidence_lines=' + riskLines.length],
    });
  }
  if (actionLines.length) {
    signals.push({
      id: 'generic:file:action-language', severity: riskLines.length ? 'medium' : 'low', title: 'لغة قرار أو إجراء داخل الملف',
      message: 'رُصدت ' + actionCount + ' إشارات مرتبطة بالإجراء/المراجعة/الاعتماد.',
      evidence: actionLines, affectedRows: actionLines.length,
      soWhat: 'يوجد محتوى يمكن تحويله إلى قائمة إجراءات أو قرارات موثقة بدل بقائه نصًا ساكنًا.',
      impact: 'لم يُثبت التنفيذ الفعلي من الملف وحده.', ownerHint: 'المسؤول الوظيفي المرتبط بالإجراء',
      priority: riskLines.length ? 'P2' : 'P3', priorityReason: ['action_terms=' + actionCount],
    });
  }
  const genericFinding: BusinessFinding = {
    id: 'generic:file:content-profile', kind: riskLines.length ? 'RISK' : actionLines.length ? 'FINDING' : 'OPPORTUNITY',
    priority: riskLines.length ? 'high' : 'medium',
    title: 'بروفايل المحتوى العام',
    statement: 'الملف من نوع ' + format + ' ويحتوي ' + lines.length.toLocaleString('ar-YE') + ' وحدة نصية قابلة للفحص، ' + words.length.toLocaleString('ar-YE') + ' كلمة تقريبًا، ' + dateCount + ' تواريخ و' + numbers.length + ' مقاطع رقمية قابلة للعرض.',
    evidence: [...riskLines.slice(0, 3), ...actionLines.slice(0, 2), ...numbers.slice(0, 2)],
    limitation: 'هذا تحليل عام للمحتوى، وليس تصنيفًا تجاريًا مفترضًا.',
    action: riskLines.length ? 'راجع بنود المخاطر المقتبسة واربط كل بند بمالك ومصدر وقرار.' : 'حدّد الغرض التجاري من الملف ثم اربط الحقول/الفقرات ذات الصلة بمؤشر أو قرار.',
  };
  const recommendation = genericRecommendation([...riskLines.slice(0, 4), ...actionLines.slice(0, 2)], riskLines.length ? 'ظهرت عبارات مرتبطة بمخاطر/استثناءات داخل المصدر.' : 'الملف لا يثبت سياقه التجاري تلقائيًا، لذلك يبدأ التحليل من المحتوى نفسه.');
  const keywordEvidence = keywords.map((item) => item.word + ':' + item.count).join(' · ');
  return {
    ...base,
    businessQuestion: 'ماذا يقول هذا الملف فعليًا، وما الإشارات التي تستحق انتباهًا أو إجراءً؟',
    summary: 'تم فحص ' + lines.length.toLocaleString('ar-YE') + ' وحدة محتوى من ' + format + '. التحليل استخرج إشارات المخاطر، لغة الإجراء، التواريخ، والمقاطع الرقمية دون افتراض نموذج أعمال.',
    signals,
    recommendations: signals.length ? [recommendation, ...base.recommendations.filter((item) => !item.id.startsWith('generic:file:'))] : [recommendation],
    findings: [genericFinding, ...base.findings], risks: riskLines.length ? [genericFinding, ...base.risks] : base.risks, opportunities: !riskLines.length && !actionLines.length ? [genericFinding, ...base.opportunities] : base.opportunities,
    guidance: {
      ...base.guidance, focus: riskLines[0] ? 'بنود المخاطر/الاستثناءات' : actionLines[0] ? 'بنود الإجراء والاعتماد' : 'فهم محتوى الملف',
      inspect: [...riskLines.slice(0, 3), ...actionLines.slice(0, 2), ...numbers.slice(0, 2), ...(keywordEvidence ? ['الكلمات البارزة: ' + keywordEvidence] : [])],
      boundary: 'التحليل العام يحفظ الدليل كما ورد في الملف. لا يحول النص الوصفي إلى حقيقة تجارية أو أثر مالي دون مصدر إضافي.',
    },
    advisorBrief: {
      health: riskLines.length ? 'REVIEW_REQUIRED' : actionLines.length ? 'ATTENTION' : 'HEALTHY',
      headline: riskLines[0] ?? actionLines[0] ?? ('الملف قابل للفحص العام: ' + lines.length.toLocaleString('ar-YE') + ' وحدة محتوى.'),
      topFinding: genericFinding, topRisk: riskLines.length ? genericFinding : null, topOpportunity: !riskLines.length && !actionLines.length ? genericFinding : null,
      recommendedAction: recommendation.action, ownerHint: recommendation.ownerHint, expectedOutcome: recommendation.expectedOutcome, measurement: recommendation.measurement,
      proofRequirement: 'كل ادعاء يجب أن يبقى مرتبطًا بالمصدر والبصمة والدليل المستخرج؛ لا اعتماد تلقائي للنتيجة النهائية.',
    },
  };
}