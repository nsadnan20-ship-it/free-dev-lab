export type FileStage='detected'|'validated'|'classified'|'parsed'|'fingerprinted'|'reconciled'|'imported'|'analyzed'|'archived'|'failed';
export interface FileLifecycle {fileId:string;stage:FileStage;attempt:number;lastError?:string;updatedAt:string;}
const order:FileStage[]=['detected','validated','classified','parsed','fingerprinted','reconciled','imported','analyzed','archived'];
export function advanceFile(state:FileLifecycle,next:FileStage,now=new Date().toISOString(),error?:string):FileLifecycle{if(next==='failed')return {...state,stage:'failed',attempt:state.attempt+1,lastError:error??'unknown error',updatedAt:now};const current=order.indexOf(state.stage),target=order.indexOf(next);if(target<0||target>current+1)throw new Error(`invalid transition: ${state.stage} -> ${next}`);return {...state,stage:next,lastError:undefined,updatedAt:now};}
export function canResume(state:FileLifecycle):boolean{return state.stage!=='archived'&&state.stage!=='imported'&&state.stage!=='analyzed';}
