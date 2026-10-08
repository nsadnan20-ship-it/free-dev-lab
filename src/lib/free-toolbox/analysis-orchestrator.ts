import {ensembleForecast, type ForecastPoint} from './forecast-ensemble';
import {evaluateAlerts, type AlertSignal} from './adaptive-alerts';
import {prioritizeActions, type ActionCandidate} from './action-priority';
import {qualityScore, type QualityDimensions} from './data-quality-score';
export interface AnalysisInput{series:ForecastPoint[];signals:AlertSignal[];actions:ActionCandidate[];quality:QualityDimensions}
export interface AnalysisResult{quality:ReturnType<typeof qualityScore>;forecast:ReturnType<typeof ensembleForecast>;alerts:ReturnType<typeof evaluateAlerts>;actions:ReturnType<typeof prioritizeActions>;blocked:boolean;generatedAt:string}
export function runAnalysis(input:AnalysisInput):AnalysisResult{const quality=qualityScore(input.quality);const blocked=quality.blocking;return{quality,forecast:ensembleForecast(input.series),alerts:evaluateAlerts(input.signals),actions:prioritizeActions(input.actions),blocked,generatedAt:new Date().toISOString()}}
