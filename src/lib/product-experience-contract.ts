export const DECISION_LIFECYCLE = ['PROPOSED','PENDING_APPROVAL','APPROVED','REJECTED','OPEN','IN_PROGRESS','COMPLETED','OUTCOME'] as const;
export type DecisionLifecycle = (typeof DECISION_LIFECYCLE)[number];
export const PRODUCT_TRUTH_STATES = ['AVAILABLE','NOT_AVAILABLE','NOT_YET_EXECUTED','RUNTIME_BLOCKED'] as const;
export type ProductTruthState = (typeof PRODUCT_TRUTH_STATES)[number];
export type OutcomeTruth = { expected: ProductTruthState; actual: ProductTruthState; delta: ProductTruthState; quality: ProductTruthState; feedback: ProductTruthState; learning: ProductTruthState };
export const OUTCOME_EMPTY_STATE: OutcomeTruth = { expected:'AVAILABLE', actual:'NOT_YET_EXECUTED', delta:'NOT_YET_EXECUTED', quality:'NOT_YET_EXECUTED', feedback:'NOT_YET_EXECUTED', learning:'RUNTIME_BLOCKED' };
export const EXECUTIVE_REPORT_STORY = ['WHAT_HAPPENED','WHY','EVIDENCE','RECOMMENDATION','DECISION','OWNER','EXPECTED_IMPACT','ACTUAL_OUTCOME','LEARNING'] as const;
export type ExecutiveReportStory = (typeof EXECUTIVE_REPORT_STORY)[number];
export const ALERT_CONTEXT = { critical_insight:'/decision-experience', approval_required:'/decision-experience', decision_approved:'/decision-experience', decision_rejected:'/decision-experience', task_assigned:'/decision-experience', task_due:'/decision-experience', task_completed:'/decision-experience', outcome_available:'/decision-experience', learning_signal_available:'/decision-experience' } as const;
export const EVIDENCE_TRUTH_LABELS: Record<ProductTruthState,string> = { AVAILABLE:'Evidence available from a canonical source.', NOT_AVAILABLE:'Evidence unavailable from the canonical source.', NOT_YET_EXECUTED:'Evidence is not yet produced because execution has not occurred.', RUNTIME_BLOCKED:'Evidence requires authenticated runtime authority.' };
export function canTransitionDecision(from: DecisionLifecycle,to: DecisionLifecycle): boolean { const transitions: Record<DecisionLifecycle,readonly DecisionLifecycle[]> = { PROPOSED:['PENDING_APPROVAL'], PENDING_APPROVAL:['APPROVED','REJECTED'], APPROVED:['OPEN'], REJECTED:[], OPEN:['IN_PROGRESS'], IN_PROGRESS:['COMPLETED'], COMPLETED:['OUTCOME'], OUTCOME:[] }; return transitions[from].includes(to); }
export function canClaimVerifiedEvidence(state:ProductTruthState){return state==='AVAILABLE';}
export function canClaimActualOutcome(state:ProductTruthState){return state==='AVAILABLE';}
export function canClaimDelta(actual:ProductTruthState,expected:ProductTruthState){return canClaimActualOutcome(actual)&&expected==='AVAILABLE';}
export function canClaimOutcomeQuality(actual:ProductTruthState,quality:ProductTruthState){return canClaimActualOutcome(actual)&&quality==='AVAILABLE';}
export function canClaimFeedback(feedback:ProductTruthState){return feedback==='AVAILABLE';}
export function canClaimLearning(actual:ProductTruthState,learning:ProductTruthState){return actual==='AVAILABLE'&&learning==='AVAILABLE';}
export function getOutcomeMessage(actual:ProductTruthState,learning:ProductTruthState){if(actual==='NOT_YET_EXECUTED')return 'Awaiting actual outcome';if(learning==='RUNTIME_BLOCKED')return 'Actual outcome is available; runtime learning is not yet verified.';if(actual==='NOT_AVAILABLE')return 'Actual impact is not available from the canonical source.';return 'Outcome evidence is available for review.';}
