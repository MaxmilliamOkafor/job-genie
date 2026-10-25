import { describe, expect, it } from 'bun:test';
import { removeMonetaryClaims, removeMonetaryClaimsFromPayload } from '../supabase/functions/_shared/monetaryClaims.ts';
import { Document, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';

describe('monetary exclusion in CVs and cover letters', () => {
  it('removes £2.6bn and keeps the portfolio work', () => {
    expect(removeMonetaryClaims('Rebuilt SQL and Python credit risk reporting for a £2.6bn consumer lending portfolio, replacing four sources.'))
      .toBe('Rebuilt SQL and Python credit risk reporting for a consumer lending portfolio, replacing four sources.');
  });
  it('removes £3.2m and keeps the five bids and client CTOs', () => {
    expect(removeMonetaryClaims('Led architecture on five pre-sales bids totalling £3.2m, presenting solutions to client CTOs.'))
      .toBe('Led architecture on five pre-sales bids, presenting solutions to client CTOs.');
  });
  it('removes other currencies, codes, written amounts and split decimals', () => {
    for (const amount of ['£3. 2m', 'GBP 2.6bn', 'EUR 5 million', '$450,000', '€2.5m', '3 million pounds', 'two billion dollars', '500 USD', '₹5000', '₦20m']) {
      expect(removeMonetaryClaims(`Delivered contracts worth ${amount}.`)).toBe('Delivered contracts.');
    }
  });
  it('cleans truncated monetary clauses in older summaries', () => {
    expect(removeMonetaryClaims('Rebuilt reporting for a £2.6bn; trained 24 analysts.'))
      .toBe('Rebuilt reporting; trained 24 analysts.');
  });
  it('preserves non-monetary numbers, dates, standards and percentages', () => {
    const text = 'Cut costs 18%, trained 24 analysts, migrated 47 services in 11 months. IFRS 9, ISO 27001, 01-2023, +353 087 426 1508.';
    expect(removeMonetaryClaims(text)).toBe(text);
  });
  it('covers raw, structured and profile export inputs without mutating saved data', () => {
    const source = { content: 'Managed £2.6bn.', structuredCv: { summary: 'Won £3.2m.', experience: [{ bullets: ['Saved EUR 5 million.'] }] }, profileData: { professional_experience: [{ bullets: ['Won $100k.'] }] } };
    const clean = removeMonetaryClaimsFromPayload(source);
    expect(clean.content).toBe('Managed.');
    expect(clean.structuredCv.summary).toBe('Won.');
    expect(clean.structuredCv.experience[0].bullets).toEqual(['Saved.']);
    expect(clean.profileData.professional_experience[0].bullets).toEqual(['Won.']);
    expect(source.content).toBe('Managed £2.6bn.');
    expect(removeMonetaryClaimsFromPayload(clean)).toEqual(clean);
  });
  it('does not write excluded amounts into Word document text', async () => {
    const text = removeMonetaryClaims('At Citigroup, I rebuilt reporting for a £2.6bn portfolio; at Accenture, I led five bids totalling £3.2m.');
    const doc = new Document({ sections: [{ children: [new Paragraph(text)] }] });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
    const xml = await zip.file('word/document.xml')?.async('string');
    expect(xml).toBeDefined();
    expect(xml).not.toContain('£2.6bn');
    expect(xml).not.toContain('£3.2m');
    expect(xml).toContain('five bids');
  });
});