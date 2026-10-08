export interface ConcurrencyStats{limit:number;active:number;queued:number;completed:number;rejected:number}
export interface ConcurrencyOptions{limit?:number;maxQueue?:number}
export class BoundedConcurrency{private readonly limit:number;private readonly maxQueue:number;private active=0;private completed=0;private rejected=0;private queue:Array<()=>void>=[];constructor(options:ConcurrencyOptions={}){this.limit=Math.max(1,Math.floor(options.limit??4));this.maxQueue=Math.max(0,Math.floor(options.maxQueue??100))}
 getStats():ConcurrencyStats{return{limit:this.limit,active:this.active,queued:this.queue.length,completed:this.completed,rejected:this.rejected}}
 run<T>(task:()=>Promise<T>):Promise<T>{if(this.active<this.limit)return this.start(task);if(this.queue.length>=this.maxQueue){this.rejected++;return Promise.reject(new Error('concurrency queue limit exceeded'))}return new Promise<T>((resolve,reject)=>this.queue.push(()=>this.start(task).then(resolve,reject)))}
 private start<T>(task:()=>Promise<T>):Promise<T>{this.active++;return task().then(v=>{this.completed++;return v},e=>{throw e}).finally(()=>{this.active--;const next=this.queue.shift();if(next)next()})}}
