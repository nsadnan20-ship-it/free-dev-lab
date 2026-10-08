export interface ArtifactIntegrityInput { format: 'web' | 'pdf' | 'xlsx'; mimeType: string; fileName: string; contentBase64: string; expectedHash?: string; }
export interface ArtifactIntegrityResult { valid: boolean; byteLength: number; contentHash: string; reason?: string; }

function bytes(input: string): ArrayBuffer { const binary = atob(input); const data = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i); return data.buffer; }
function hex(buffer: ArrayBuffer): string { return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join(''); }

export async function verifyArtifactIntegrity(input: ArtifactIntegrityInput): Promise<ArtifactIntegrityResult> {
  if (!input.fileName || !input.mimeType || !input.contentBase64) return { valid: false, byteLength: 0, contentHash: '', reason: 'artifact metadata/content missing' };
  const data = bytes(input.contentBase64);
  const hash = hex(await crypto.subtle.digest('SHA-256', data));
  if (input.expectedHash && input.expectedHash !== hash) return { valid: false, byteLength: data.byteLength, contentHash: hash, reason: 'content hash mismatch' };
  const mimeOk = input.format === 'web' ? input.mimeType.startsWith('text/html') : input.format === 'pdf' ? input.mimeType === 'application/pdf' : input.mimeType.includes('spreadsheetml');
  return { valid: mimeOk, byteLength: data.byteLength, contentHash: hash, reason: mimeOk ? undefined : 'format/mime mismatch' };
}
