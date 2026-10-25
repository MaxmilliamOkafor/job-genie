export interface CoverLetterStyle {
  template: "block" | "classic";
  accent: string;
  signature: { png: string; w: number; h: number; size: "S" | "M" | "L"; align: "left" | "center" | "right" } | null;
}

export function parseCoverLetterStyle(raw: unknown): CoverLetterStyle {
  const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const s = o.signature && typeof o.signature === "object" ? o.signature as Record<string, unknown> : {};
  const png = typeof s.png === "string" ? s.png : "";
  const w = Number(s.w), h = Number(s.h);
  const valid = png.length < 8_000_000 && /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(png) && Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0;
  return {
    template: o.template === "classic" ? "classic" : "block",
    accent: typeof o.accent === "string" && /^#[0-9a-f]{6}$/i.test(o.accent) ? o.accent.slice(1) : "1F4E79",
    signature: valid ? { png, w, h, size: s.size === "S" || s.size === "L" ? s.size : "M", align: s.align === "center" || s.align === "right" ? s.align : "left" } : null,
  };
}

/** Dimensions in inches; preserve aspect ratio when the width cap applies. */
export function signatureDimensions(signature: NonNullable<CoverLetterStyle["signature"]>) {
  const requested = { S: 0.38, M: 0.52, L: 0.68 }[signature.size];
  const width = Math.min(2.8, requested * signature.w / signature.h);
  return { width, height: width * signature.h / signature.w };
}

/** Shared closing spacing in points, with Word's equivalent twips. */
export function coverLetterClosingSpacing() {
  const line = 15;
  const signatureGap = 9;
  return { nameOffset: line * 2, blankLineTwips: line * 20, signatureGap, signatureGapTwips: signatureGap * 20 };
}