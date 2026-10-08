export type ScenarioMode='optimistic'|'base'|'pessimistic';
export interface ScenarioVariable{key:string;base:number;upside:number;downside:number;}
export interface ScenarioOutput{mode:ScenarioMode;variables:Record<string,number>;score:number;warnings:string[];}
export interface ScenarioInput { variables: ScenarioVariable[]; mode?: ScenarioMode; }
export function runScenarios(vars:ScenarioVariable[]):ScenarioOutput[]{const modes:ScenarioMode[]=['optimistic','base','pessimistic'];return modes.map(mode=>{const variables:Record<string,number>={};for(const v of vars)variables[v.key]=mode==='optimistic'?v.upside:mode==='pessimistic'?v.downside:v.base;const values=Object.values(variables);const score=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;const warnings:string[]=[];if(mode==='pessimistic')warnings.push('هذا سيناريو ضغط وليس توقعًا مؤكدًا');return{mode,variables,score,warnings};});}
export function simulateScenario(input: ScenarioInput): ScenarioOutput { const mode=input.mode ?? 'base'; return runScenarios(input.variables).find(x=>x.mode===mode)!; }
export interface CustomScenario{variables:Record<string,number>;delta:number;score:number;label:string}
export function runCustomScenario(vars:ScenarioVariable[],changes:Record<string,number>,impact:(values:Record<string,number>)=>number):CustomScenario{const values=Object.fromEntries(vars.map(v=>[v.key,changes[v.key]??v.base]));const base=impact(Object.fromEntries(vars.map(v=>[v.key,v.base])));const score=impact(values);return{variables:values,delta:score-base,score,label:score>=base?'تحسن متوقع':'تراجع متوقع'};}
export function rankCustomScenarios(results:CustomScenario[]):CustomScenario[]{return[...results].sort((a,b)=>b.delta-a.delta);}
