import {runAnalysis,type AnalysisInput} from './analysis-orchestrator';
import {evaluateKPIs,type KPIInput} from './kpi-registry';
import {buildExecutiveSummary} from './executive-summary';
import {buildDashboardModel} from './dashboard-model';
import {createReportSnapshot} from './report-contract';
import {summarizeDecisions} from './decision-metrics';
import {createDecision} from './decision-log';
export interface ExecutivePipelineInput extends AnalysisInput{kpis:KPIInput[]}
export function runExecutivePipeline(input:ExecutivePipelineInput){const analysis=runAnalysis(input);const kpis=evaluateKPIs(input.kpis);const summary=buildExecutiveSummary(kpis,analysis.alerts,analysis.actions);const dashboard=buildDashboardModel(summary,kpis,analysis.alerts);const decisions=analysis.actions.filter(a=>Array.isArray(a.evidenceIds)&&a.evidenceIds.length>0).slice(0,5).map(a=>createDecision({title:a.title,reason:`Priority ${a.rank}: impact=${a.impact}, urgency=${a.urgency}, confidence=${a.confidence}`,status:'proposed',priority:a.rank,expectedImpact:a.impact,evidenceIds:[...(a.evidenceIds??[])],action:a.title}));const snapshot=createReportSnapshot({kpis,alerts:analysis.alerts,decisions,quality:analysis.quality});return{analysis,kpis,summary,dashboard,decisions,decisionMetrics:summarizeDecisions(decisions),snapshot,valid:snapshot.schemaVersion===1&&!snapshot.quality.blocking}}
