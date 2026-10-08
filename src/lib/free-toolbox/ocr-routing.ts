export type ExtractionMethod = 'native' | 'table' | 'ocr';
export interface PageSignal { page:number; nativeChars:number; hasImages:boolean; tableCandidates:number; }
export interface ExtractionDecision { page:number; methods:ExtractionMethod[]; reason:string; }

export function routeExtraction(signals:PageSignal[]):ExtractionDecision[]{
  return signals.map(s=>{
    const methods:ExtractionMethod[]=[];
    if(s.nativeChars>40) methods.push('native');
    if(s.tableCandidates>0) methods.push('table');
    if(s.nativeChars<=40 && s.hasImages) methods.push('ocr');
    if(!methods.length) methods.push('native');
    return {page:s.page,methods,reason:methods.includes('ocr')?'insufficient native text; OCR required':methods.includes('table')?'structured table candidate detected':'native extraction preferred'};
  });
}
export function normalizeArabicDigits(input:string){return input.replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));}
export function normalizeExtractedText(input:string){return normalizeArabicDigits(input).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[ \t]+/g,' ').trim();}
export function parseNumericCandidate(input:string):number|null{const value=normalizeArabicDigits(input).replace(/[٬,]/g,'').replace(/[٫]/g,'.').replace(/[^0-9.+-]/g,'');if(!value||value==='-'||value==='+')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
