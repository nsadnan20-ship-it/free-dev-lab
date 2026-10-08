import type {EvidenceLedger} from './evidence-ledger';
import {calculateReorderPolicy,type ReorderInput} from './reorder-policy';
import {forecastCashflow,type CashPoint} from './cashflow-forecast';
import {simulateScenario,type ScenarioInput} from './scenario-engine';
export interface AnalyticsBundle{generatedAt:string;reorder:ReturnType<typeof calculateReorderPolicy>[];cash:ReturnType<typeof forecastCashflow>|null;scenario:ReturnType<typeof simulateScenario>|null;evidence:EvidenceLedger;quality:number;warnings:string[]}
export interface OrchestrationInput{reorder?:ReorderInput[];cash?:CashPoint[];scenario?:ScenarioInput;evidence?:EvidenceLedger;dataQuality?:number}
export function runAnalytics(input:OrchestrationInput):AnalyticsBundle{const warnings:string[]=[];const reorder=(input.reorder??[]).map(calculateReorderPolicy);const cash=input.cash?.length?forecastCashflow(input.cash):null;const scenario=input.scenario?simulateScenario(input.scenario):null;const evidence=input.evidence??{items:[]};const quality=Math.max(0,Math.min(100,input.dataQuality??100));if(!input.cash?.length)warnings.push('cashflow data unavailable');if(!input.reorder?.length)warnings.push('inventory demand data unavailable');if(quality<80)warnings.push('low data quality: recommendations require review');return{generatedAt:new Date().toISOString(),reorder,cash,scenario,evidence,quality,warnings};}
