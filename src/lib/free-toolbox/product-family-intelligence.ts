export type ProductFamilyAssignmentState='suggested'|'approved'|'locked';

export interface ProductFamilyItem {
  sku:string;
  name:string;
  unit?:string;
  brand?:string;
  category?:string;
  description?:string;
}

export interface ProductFamilyAttributes {
  productType:string;
  quantity?:number;
  unit?:string;
  packCount?:number;
  brand?:string;
  variant?:string;
}

export interface ProductFamilySuggestion {
  familyKey:string;
  displayName:string;
  memberSkus:string[];
  confidence:number;
  evidence:string[];
  conflicts:string[];
  state:ProductFamilyAssignmentState;
  attributes:ProductFamilyAttributes;
}

const DIGIT_MAP:Record<string,string>={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
const UNIT_ALIASES:Record<string,string>={'كجم':'kg','كيلو':'kg','كيلوجرام':'kg','كيلوغرام':'kg','كغ':'kg','kg':'kg','kgs':'kg','جم':'g','جرام':'g','غرام':'g','g':'g','لتر':'l','ل':'l','litre':'l','liter':'l','l':'l','مل':'ml','ملل':'ml','ml':'ml','حبة':'piece','حبه':'piece','قطعة':'piece','قطعه':'piece','piece':'piece','كرتون':'carton','كرتونه':'carton','carton':'carton'};

function digits(s:string):string{return s.replace(/[٠-٩۰-۹]/g,c=>DIGIT_MAP[c]??c)}
function normalizeText(s:string):string{return digits(s).normalize('NFKC').toLowerCase().replace(/[ـ]/g,'').replace(/[.,،؛;:_/\\()[\]{}+*=|]/g,' ').replace(/\s+/g,' ').trim()}
function normalizeUnit(s?:string):string|undefined{if(!s)return undefined;const n=normalizeText(s);return UNIT_ALIASES[n]??n}
function numberUnitTokens(s:string):Array<{quantity:number;unit?:string}> { const out:Array<{quantity:number;unit?:string}>=[]; const n=normalizeText(s); const re=/(\d+(?:\.\d+)?)\s*(kg|kgs|كجم|كيلو|كيلوجرام|كيلوغرام|كغ|g|جم|جرام|غرام|l|لتر|مل|ml|حبة|حبه|قطعة|قطعه|piece|كرتون|كرتونه|carton)?\b/g; let m:RegExpExecArray|null; while((m=re.exec(n))){out.push({quantity:Number(m[1]),unit:normalizeUnit(m[2])})} return out }

export function normalizeProductName(name:string):string{return normalizeText(name)}

export function extractProductFamilyAttributes(item:ProductFamilyItem):ProductFamilyAttributes{
  const text=normalizeText([item.name,item.description??''].filter(Boolean).join(' '));
  const tokens=numberUnitTokens(text);
  const explicitUnit=normalizeUnit(item.unit);
  const sized=tokens.find(t=>t.unit&&['kg','g','l','ml','piece','carton'].includes(t.unit));
  const quantity=sized?.quantity;
  const unit=explicitUnit??sized?.unit;
  const type=text.replace(/\b\d+(?:\.\d+)?\s*(kg|kgs|كجم|كيلو|كيلوجرام|كيلوغرام|كغ|g|جم|جرام|غرام|l|لتر|مل|ml|حبة|حبه|قطعة|قطعه|piece|كرتون|كرتونه|carton)?\b/g,' ').replace(/\s+/g,' ').trim();
  return {productType:type,quantity,unit,brand:item.brand?normalizeText(item.brand):undefined,variant:item.category?normalizeText(item.category):undefined};
}

function familyKey(a:ProductFamilyAttributes):string{return [a.productType,a.quantity??'',a.unit??'',a.packCount??''].join('|')}

export function suggestProductFamilies(items:ProductFamilyItem[], options?:{lockedSkus?:Set<string>; approved?:Map<string,string>}):ProductFamilySuggestion[]{
  const buckets=new Map<string,{attributes:ProductFamilyAttributes;skus:string[];evidence:Set<string>;conflicts:Set<string>}>();
  for(const item of items){
    const a=extractProductFamilyAttributes(item); const key=familyKey(a); const b=buckets.get(key)??{attributes:a,skus:[],evidence:new Set<string>(),conflicts:new Set<string>()}; b.skus.push(item.sku); b.evidence.add('normalized product type'); if(a.quantity!==undefined)b.evidence.add('normalized size/quantity'); if(a.unit)b.evidence.add('normalized unit'); if(a.brand)b.evidence.add('brand retained as an attribute, not an automatic substitute'); buckets.set(key,b);
  }
  return [...buckets.entries()].filter(([,b])=>b.skus.length>1).map(([key,b])=>({familyKey:key,displayName:[b.attributes.productType,b.attributes.quantity!==undefined?`${b.attributes.quantity} ${b.attributes.unit??''}`:''].filter(Boolean).join(' — '),memberSkus:b.skus,confidence:Math.min(0.99,0.70+b.evidence.size*0.07),evidence:[...b.evidence],conflicts:[...b.conflicts],state:b.skus.some(s=>options?.lockedSkus?.has(s))?'locked':(options?.approved?.has(key)?'approved':'suggested'),attributes:b.attributes}));
}

export interface ProductFamilyOverride { familyKey:string; name:string; memberSkus:string[]; state:'approved'|'locked'; reason?:string; }
export function applyProductFamilyOverride(suggestions:ProductFamilySuggestion[], override:ProductFamilyOverride):ProductFamilySuggestion[]{
  const selected=new Set(override.memberSkus); return suggestions.filter(s=>s.familyKey!==override.familyKey || !s.memberSkus.some(sku=>selected.has(sku))).concat([{familyKey:override.familyKey,displayName:override.name,memberSkus:[...selected],confidence:1,evidence:['merchant manual selection'],conflicts:[],state:override.state,attributes:{productType:override.name}}]);
}

export function validateFamilyOverride(override:ProductFamilyOverride, knownSkus:Set<string>):void{if(!override.familyKey.trim()||!override.name.trim()||!override.memberSkus.length)throw new Error('PRODUCT_FAMILY_OVERRIDE_INVALID');for(const sku of override.memberSkus)if(!knownSkus.has(sku))throw new Error('PRODUCT_FAMILY_UNKNOWN_SKU');if(new Set(override.memberSkus).size!==override.memberSkus.length)throw new Error('PRODUCT_FAMILY_DUPLICATE_SKU');}
