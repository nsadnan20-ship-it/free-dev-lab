export interface PerformanceBudget{firstContentfulPaintMs:number;interactiveMs:number;analysisPreviewMs:number;searchMs:number;maxBundleKb:number;maxRowsInUi:number}
export const DEFAULT_PERFORMANCE_BUDGET:PerformanceBudget={firstContentfulPaintMs:1800,interactiveMs:2500,analysisPreviewMs:1500,searchMs:300,maxBundleKb:450,maxRowsInUi:5000};
export interface PerformanceSample{metric:keyof PerformanceBudget;value:number}
export interface PerformanceResult{passed:boolean;violations:{metric:keyof PerformanceBudget;value:number;budget:number}[]}
export function evaluatePerformance(samples:PerformanceSample[],budget:PerformanceBudget=DEFAULT_PERFORMANCE_BUDGET):PerformanceResult{const violations=samples.filter(s=>s.value>budget[s.metric]).map(s=>({metric:s.metric,value:s.value,budget:budget[s.metric]}));return{passed:violations.length===0,violations}}
