export type ExtractionStatus = 'not_started'|'succeeded'|'failed'|'partial';
export type AnalysisInputMode = 'canonical_text'|'structured_source_fallback';

export interface CanonicalTextArtifact { sourceHash:string; textHash:string; text:string; status:ExtractionStatus; sourceType:string; warnings:string[]; errors:string[]; }
export interface ExtractionOutcome { artifact?:CanonicalTextArtifact; status:ExtractionStatus; continueWithFallback:boolean; analysisInputMode:AnalysisInputMode; warnings:string[]; errors:string[]; }

export function normalizeExtractedText(input:string):string {
  return input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').trimEnd();
}

export async function hashText(text:string):Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function finalizeExtraction(sourceHash:string, sourceType:string, rawText:string, extractionError?:unknown):Promise<ExtractionOutcome> {
  const errors = extractionError ? [extractionError instanceof Error ? extractionError.message : String(extractionError)] : [];
  const text = normalizeExtractedText(rawText);
  if (text.trim()) {
    const textHash = await hashText(text);
    return { status: extractionError ? 'partial' : 'succeeded', continueWithFallback: false, analysisInputMode:'canonical_text',
      artifact:{sourceHash,textHash,text,status:extractionError?'partial':'succeeded',sourceType,warnings:extractionError?['EXTRACTION_PARTIAL_FALLBACK_USED']:[],errors},warnings:[],errors };
  }
  // Extraction is a preferred accuracy layer, never a single point of failure. Downstream structured analysis may continue.
  return { status:'failed', continueWithFallback:true, analysisInputMode:'structured_source_fallback', warnings:['CANONICAL_TEXT_UNAVAILABLE_ANALYSIS_CONTINUES'], errors };
}

export function canAnalyzeAfterExtraction(outcome:ExtractionOutcome):boolean { return outcome.status==='succeeded' || outcome.status==='partial' || outcome.continueWithFallback; }
