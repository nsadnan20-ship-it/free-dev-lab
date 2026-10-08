import type {DecisionLogEntry} from './decision-log';
import {decisionAccuracy} from './decision-log';

export interface DecisionMetrics {
  total:number;
  executed:number;
  approved:number;
  accuracy:number|null;
  averageExpectedImpact:number|null;
  averageActualImpact:number|null;
}

export function summarizeDecisions(entries:DecisionLogEntry[]):DecisionMetrics {
  const measured=entries.map(decisionAccuracy).filter((v):v is number=>v!==null);
  const expected=entries.map(e=>e.expectedImpact).filter((v):v is number=>Number.isFinite(v));
  const actual=entries.map(e=>e.actualImpact).filter((v):v is number=>Number.isFinite(v));
  return {
    total:entries.length,
    executed:entries.filter(e=>e.status==='executed').length,
    approved:entries.filter(e=>e.status==='approved').length,
    accuracy:measured.length?measured.reduce((s,v)=>s+v,0)/measured.length:null,
    averageExpectedImpact:expected.length?expected.reduce((s,v)=>s+v,0)/expected.length:null,
    averageActualImpact:actual.length?actual.reduce((s,v)=>s+v,0)/actual.length:null,
  };
}
