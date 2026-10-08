export type QueryWindow={from?:string;to?:string};
export type QueryPlan={table:string;columns:string[];filters:Record<string,string|number|boolean|string[]>;window?:QueryWindow;limit:number;orderBy?:{column:string;ascending:boolean};fingerprint:string};
const ALLOWED_TABLES=new Set(['products','inventory','orders','order_items','payments','customers','alternative_group_members']);
const SAFE_COLUMNS=new Set(['id','company_id','product_id','customer_id','order_id','quantity','stock','price','net_total','paid_amount','status','created_at','updated_at','sku','category_id','alternative_group_id']);
const SAFE_FILTERS=new Set(['id','product_id','customer_id','order_id','status','sku','category_id','alternative_group_id']);
const normalizeValue=(value:string|number|boolean|string[])=>Array.isArray(value)?[...value].map(String).sort() : typeof value==='string'?value.trim():value;
/** Build a deterministic query plan without accepting a tenant/company id from the caller. */
export function planQuery(input:{table:string;columns:string[];filters?:Record<string,string|number|boolean|string[]>;window?:QueryWindow;limit?:number;orderBy?:{column:string;ascending?:boolean}}):QueryPlan{
 if(!ALLOWED_TABLES.has(input.table)) throw new Error(`unsupported query table: ${input.table}`);
 const columns=[...new Set(input.columns)].filter(c=>SAFE_COLUMNS.has(c));
 if(!columns.length) throw new Error('query must request at least one safe column');
 if(!columns.includes('company_id')) columns.push('company_id');
 const filters={...(input.filters??{})};
 const safeFilters=Object.fromEntries(Object.entries(filters).filter(([key])=>SAFE_FILTERS.has(key)).map(([key,value])=>[key,normalizeValue(value)]));
 const window=planDateWindow(input.window?.from,input.window?.to);
 const limit=Math.min(Math.max(Math.trunc(input.limit??500),1),5000);
 const orderBy=input.orderBy&&SAFE_COLUMNS.has(input.orderBy.column)?{column:input.orderBy.column,ascending:input.orderBy.ascending!==false}:undefined;
 const fingerprint=JSON.stringify({table:input.table,columns:[...columns].sort(),filters:Object.fromEntries(Object.entries(safeFilters).sort()),window,limit,orderBy});
 return {table:input.table,columns,filters:safeFilters,window,limit,orderBy,fingerprint};
}
export function planDateWindow(from?:string,to?:string){if(!from&&!to)return undefined;const f=from?new Date(from):undefined,t=to?new Date(to):undefined;if(f&&Number.isNaN(f.getTime())||t&&Number.isNaN(t.getTime()))throw new Error('invalid query date window');if(f&&t&&f>t)throw new Error('query window start must not exceed end');return {from,to};}
