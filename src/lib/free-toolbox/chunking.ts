export interface Chunk<T>{index:number;items:T[]}
export function chunk<T>(items:readonly T[],size=500):Chunk<T>[] { const n=Math.max(1,Math.floor(size)); const out:Chunk<T>[]=[]; for(let i=0;i<items.length;i+=n) out.push({index:out.length,items:Array.from(items.slice(i,i+n))}); return out }
export function forEachChunk<T>(items:readonly T[],size:number,fn:(items:T[],index:number)=>void):void { const n=Math.max(1,Math.floor(size)); let index=0; for(let i=0;i<items.length;i+=n) fn(Array.from(items.slice(i,i+n)),index++) }
