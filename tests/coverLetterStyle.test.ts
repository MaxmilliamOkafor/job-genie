import { describe, expect, it } from 'bun:test';
import { parseCoverLetterStyle, signatureDimensions } from '../supabase/functions/generate-pdf/coverLetterStyle.ts';

describe('saved cover letter style', () => {
  it('defaults null to Block without a signature', () => {
    expect(parseCoverLetterStyle(null).template).toBe('block');
    expect(parseCoverLetterStyle(null).signature).toBeNull();
  });
  it('preserves classic, accent and saved alignment', () => {
    const style = parseCoverLetterStyle({ template: 'classic', accent: '#123ABC', signature: { png: 'iVBORw0KGgo=', w: 200, h: 100, size: 'S', align: 'right' } });
    expect(style.template).toBe('classic');
    expect(style.accent).toBe('123ABC');
    expect(style.signature?.align).toBe('right');
  });
  for (const [size, height] of [['S', 0.38], ['M', 0.52], ['L', 0.68]] as const) {
    it(`sizes ${size} by its specified height`, () => {
      const dimensions = signatureDimensions({ png: '', w: 200, h: 100, size, align: 'left' });
      expect(dimensions.height).toBe(height);
      expect(dimensions.width).toBe(height * 2);
    });
  }
  it('caps width at 2.8 inches without distorting the image', () => {
    expect(signatureDimensions({ png: '', w: 1000, h: 100, size: 'L', align: 'center' })).toEqual({ width: 2.8, height: 0.28 });
  });
  it('ignores invalid signature data and dimensions', () => {
    expect(parseCoverLetterStyle({ signature: { png: 'not PNG', w: 100, h: 0 } }).signature).toBeNull();
  });
});