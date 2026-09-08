/**
 * One export path for both documents.
 *
 * The DOCX is built from exactly the text shown in the preview, so preview,
 * copy, text download and the file that reaches an employer are the same
 * version. When DOCX generation fails the caller gets an error: there is no
 * silent fall back to an older file, because sending yesterday's CV is worse
 * than an export that visibly failed.
 */
import { supabase } from '@/integrations/supabase/client';

export type DocKind = 'cv' | 'coverletter';

export function documentSlug(value: string): string {
  return (value || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
}

/** Fingerprint of the reviewed text, so a stale export can be detected. */
export function documentVersion(text: string, jobTitle: string, company: string): string {
  const source = `${jobTitle}\u0000${company}\u0000${text}`;
  let h = 5381;
  for (let i = 0; i < source.length; i += 1) {
    h = ((h << 5) + h + source.charCodeAt(i)) | 0;
  }
  return `${source.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

export interface DocxResult {
  base64: string;
  fileName: string;
  version: string;
}

export async function generateDocx(opts: {
  text: string;
  kind: DocKind;
  jobTitle?: string;
  company?: string;
  fileName?: string;
  /** Passed so the header carries the real name instead of guessing at the first line. */
  firstName?: string;
  lastName?: string;
}): Promise<DocxResult> {
  const text = (opts.text ?? '').trim();
  if (!text) {
    throw new Error('There is no reviewed text to export yet.');
  }

  const { data, error } = await supabase.functions.invoke('generate-pdf', {
    body: {
      content: text,
      type: opts.kind,
      jobTitle: opts.jobTitle ?? '',
      company: opts.company ?? '',
      fileName: opts.fileName,
      firstName: opts.firstName ?? '',
      lastName: opts.lastName ?? '',
    },
  });


  if (error) {
    throw new Error(error.message || 'The Word file could not be created. Nothing was downloaded.');
  }
  const base64 = (data as { docx?: string; pdf?: string; error?: string } | null)?.docx
    ?? (data as { pdf?: string } | null)?.pdf;
  const returnedError = (data as { error?: string } | null)?.error;
  if (returnedError) throw new Error(returnedError);
  if (!base64) {
    throw new Error('The Word file came back empty. Nothing was downloaded.');
  }

  return {
    base64,
    fileName:
      (data as { fileName?: string }).fileName ||
      opts.fileName ||
      `${documentSlug(opts.company ?? 'company')}-${opts.kind === 'cv' ? 'CV' : 'Cover-Letter'}.docx`,
    version: documentVersion(text, opts.jobTitle ?? '', opts.company ?? ''),
  };
}

export function downloadBase64Docx(base64: string, fileName: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
