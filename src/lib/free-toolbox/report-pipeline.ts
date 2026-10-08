import {runAnalysis,type AnalysisInput,type AnalysisResult} from './analysis-orchestrator';
import {createDecision,type DecisionLogEntry} from './decision-log';
export interface PipelineResult{analysis:AnalysisResult;decisions:DecisionLogEntry[];readyForReport:boolean}
export function runReportPipeline(input:AnalysisInput):PipelineResult{
  const analysis=runAnalysis(input);
  const decisions=analysis.actions
    .filter(a=>Array.isArray(a.evidenceIds)&&a.evidenceIds.length>0)
    .slice(0,5)
    .map(a=>createDecision({title:a.title,reason:`أولوية ${a.rank} وفق الأثر والاستعجال والثقة والجهد`,status:'proposed',priority:a.rank,expectedImpact:a.impact,evidenceIds:[...(a.evidenceIds??[])],action:a.title}));
  return{analysis,decisions,readyForReport:!analysis.blocked};
}
