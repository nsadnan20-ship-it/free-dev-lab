import { supabase } from './supabase';
import { getSemanticMetric, SEMANTIC_METRIC_REGISTRY, type SemanticMetricRegistryEntry } from './semantic-metric-registry.ts';
import { semanticMetricIsFresh } from './semantic-metric-freshness.ts';

export interface MetricGovernanceSnapshot {
  metricId: string; version: number; name: string; definition: string; formula: string;
  source: string[]; dimensions: string[]; filters: unknown[]; timeSemantics: Record<string, unknown>;
  freshness: Record<string, unknown>; owner: string; certificationStatus: 'DRAFT'|'REVIEWED'|'CERTIFIED'|'DEPRECATED';
  dependencies: string[]; consumers: string[]; tests: string[]; evidence: string[];
  createdAt: string; updatedAt: string; deprecatedAt: string | null;
}
export interface SemanticMetricContract { definition: SemanticMetricRegistryEntry; governance: MetricGovernanceSnapshot | null; }
function parseJsonArray(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : []; }
function mapGovernance(row: Record<string, unknown>): MetricGovernanceSnapshot {
  return {
    metricId:String(row.metric_id), version:Number(row.version), name:String(row.name), definition:String(row.definition), formula:String(row.formula),
    source:parseJsonArray(row.source), dimensions:parseJsonArray(row.dimensions), filters:Array.isArray(row.filters)?row.filters:[],
    timeSemantics:row.time_semantics&&typeof row.time_semantics==='object'?row.time_semantics as Record<string,unknown>:{},
    freshness:row.freshness&&typeof row.freshness==='object'?row.freshness as Record<string,unknown>:{}, owner:String(row.owner),
    certificationStatus:String(row.certification_status) as MetricGovernanceSnapshot['certificationStatus'], dependencies:parseJsonArray(row.dependencies),
    consumers:parseJsonArray(row.consumers), tests:parseJsonArray(row.tests), evidence:parseJsonArray(row.evidence), createdAt:String(row.created_at), updatedAt:String(row.updated_at),
    deprecatedAt:row.deprecated_at?String(row.deprecated_at):null,
  };
}
export async function getSemanticMetricContract(metricId:string):Promise<SemanticMetricContract>{
  const definition=getSemanticMetric(metricId); if(!definition) throw new Error(`Unknown semantic metric: ${metricId}`);
  const {data,error}=await supabase.from('metric_governance').select('*').eq('metric_id',definition.metricId).order('version',{ascending:false}).limit(1).maybeSingle();
  if(error) throw new Error(`Metric governance unavailable: ${error.message}`); return {definition,governance:data?mapGovernance(data as Record<string,unknown>):null};
}
export async function listSemanticMetricContracts():Promise<SemanticMetricContract[]>{
  const {data,error}=await supabase.from('metric_governance').select('*').order('metric_id').order('version',{ascending:false});
  if(error) throw new Error(`Metric governance unavailable: ${error.message}`);
  const latest=new Map<string,MetricGovernanceSnapshot>();
  for(const row of (data??[]) as Record<string,unknown>[]){
    const snapshot=mapGovernance(row);
    if(!latest.has(snapshot.metricId)) latest.set(snapshot.metricId,snapshot);
  }
  return SEMANTIC_METRIC_REGISTRY.map(definition => ({
    definition,
    governance: latest.get(definition.metricId) ?? null,
  }));
}
export { semanticMetricIsFresh } from './semantic-metric-freshness.ts';
