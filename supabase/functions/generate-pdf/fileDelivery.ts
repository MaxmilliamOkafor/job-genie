export type DocumentFormat = 'pdf' | 'docx';
export function documentFileName(name: string, format: DocumentFormat = 'pdf'): string {
  return `${name.replace(/\.(?:pdf|docx)$/i, '')}.${format}`;
}
export function documentEnvelope(pdf: string, docx: string, name: string) {
  if (!pdf.startsWith('JVBER')) throw new Error('No valid PDF was generated.');
  if (!docx.startsWith('UEs')) throw new Error('No valid Word document was generated.');
  return { pdf, docx, fileName: documentFileName(name), docxFileName: documentFileName(name, 'docx') };
}