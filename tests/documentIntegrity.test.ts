import { describe, expect, it } from 'bun:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';
import { sanitizeText, candidateDocumentProperties, createCandidatePdf } from '../supabase/functions/generate-pdf/documentIntegrity.ts';
import { stripInvisible, stripLetterBanned } from '../supabase/functions/tailor-application/guards.ts';

describe('document text integrity', () => {
  it('removes invisible characters without splitting keywords and normalises spaces', () => {
    expect(stripInvisible('Py\u200Bthon on A\u00ADWS\u202Fnow')).toBe('Python on AWS now');
    expect(stripInvisible('a\u200Cb\u200Dc\u200Ed\u200Fe\u202Af\u2060g\uFEFFh')).toBe('abcdefgh');
  });
  it('preserves Latin-1 names and deletes zero-width characters before other sanitisation', () => {
    expect(sanitizeText('Société Générale')).toBe('Société Générale');
    expect(sanitizeText('Müller')).toBe('Müller');
    expect(sanitizeText('Py\u200Bthon')).toBe('Python');
    expect(sanitizeText('£3.2m €5 é ü ö ñ ç ó á í')).toBe('£3.2m €5 é ü ö ñ ç ó á í');
  });
});

describe('candidate-only file properties', () => {
  for (const type of ['resume', 'cover_letter'] as const) {
    it(`writes only candidate title and author to a generated ${type} PDF`, async () => {
      const name = 'Maxmilliam Okafor';
      const title = candidateDocumentProperties(name, type).title;
      const pdf = await createCandidatePdf(PDFDocument, title, name);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf.addPage().drawText(sanitizeText('Société Générale Müller Py\u200Bthon'), { font });
      const generated = await PDFDocument.load(await pdf.save(), { updateMetadata: false });
      expect(generated.getTitle()).toBe(type === 'resume' ? 'Maxmilliam Okafor CV' : 'Maxmilliam Okafor Cover Letter');
      expect(generated.getAuthor()).toBe(name);
      expect(generated.getCreator()).toBeUndefined();
      expect(generated.getProducer()).toBeUndefined();
      expect(generated.getKeywords()).toBeUndefined();
      expect(generated.getSubject()).toBeUndefined();
      expect(generated.getCreationDate()).toBeUndefined();
      expect(generated.getModificationDate()).toBeUndefined();
    });
    it(`writes candidate properties without product attribution in generated ${type} DOCX`, async () => {
      const props = candidateDocumentProperties('Maxmilliam Okafor', type);
      const doc = new Document({ ...props, sections: [{ children: [new Paragraph('Société Générale Müller')] }] });
      const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
      const core = await zip.file('docProps/core.xml')?.async('string');
      expect(core).toBeDefined();
      expect(core).toContain('<dc:creator>Maxmilliam Okafor</dc:creator>');
      expect(core).toContain('<cp:lastModifiedBy>Maxmilliam Okafor</cp:lastModifiedBy>');
      expect(core).toContain(`<dc:title>${props.title}</dc:title>`);
      for (const path of ['docProps/core.xml', 'docProps/app.xml']) {
        const xml = await zip.file(path)?.async('string');
        expect(xml).toBeDefined();
        expect(xml).not.toContain('QuantumHire');
      }
    });
  }
});

describe('cover-letter joining words', () => {
  it('removes formal lead-ins and changes Nevertheless to Still', () => {
    expect(stripLetterBanned('I built X. Consequently, costs fell 18%. Nevertheless, I kept Y. In conclusion, I would like to talk.'))
      .toBe('I built X. Costs fell 18%. Still, I kept Y. I would like to talk.');
  });
  for (const lead of ['Moreover', 'In addition', 'Thus', 'Hence', 'Therefore', 'Overall', 'Ultimately', 'In summary', 'To summarise', 'To summarize', 'To sum up', 'In essence', 'Essentially']) {
    it(`removes ${lead} at sentence and line starts`, () => {
      expect(stripLetterBanned(`${lead}, costs fell.\n${lead}, work continued.`)).toBe('Costs fell.\nWork continued.');
    });
  }
  it('keeps the next word unchanged after replacement transitions', () => {
    expect(stripLetterBanned('Nonetheless, costs fell. Firstly, I built X. Secondly, I kept Y.'))
      .toBe('Still, costs fell. First, I built X. Second, I kept Y.');
  });
});