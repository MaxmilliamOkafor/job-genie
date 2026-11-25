// Contact-line phone format shared by CV, letter, PDF and Word output.
// "+353 087 426 1508": country code, then the national number with its trunk 0,
// grouped 3-3-4 when it has ten digits. Never reorders digits.
const TRUNK_ZERO = new Set(["353", "44", "49", "33", "31", "32", "61", "64", "27", "91", "43", "41", "46", "47", "358", "48", "90", "86", "81", "82", "62", "63", "66", "234", "254", "20"]);
const CODES = [...TRUNK_ZERO, "1", "39", "34", "351", "45", "30", "7", "52", "55", "65", "971", "972", "966", "36", "420", "40"].sort((a, b) => b.length - a.length);

export function formatContactPhone(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  let digits = text.replace(/\(0\)/g, "0").replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) return text; // no country code recorded: leave as saved
  const all = digits.slice(1);
  const code = CODES.find((c) => all.startsWith(c));
  // Only Irish numbers have a confirmed 3-3-4 layout; others keep their saved grouping.
  if (code !== "353") return text;
  let national = all.slice(code.length);
  if (TRUNK_ZERO.has(code) && !national.startsWith("0")) national = `0${national}`;
  if (national.length !== 10) return text;
  return `+${code} ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** Rewrite phone numbers on contact header lines only, never body figures. */
export function normaliseHeaderPhones(document: string): string {
  const lines = String(document ?? "").split("\n");
  const end = lines.findIndex((l) => /^(?:SUMMARY|PROFESSIONAL SUMMARY|PROFILE|PROFESSIONAL EXPERIENCE|Dear|Hello|Re:)/i.test(l.trim()));
  const limit = end < 0 ? Math.min(lines.length, 10) : end;
  return lines.map((l, i) => i < limit ? l.replace(/\+\d[\d\s()-]{7,18}\d/g, (m) => formatContactPhone(m)) : l).join("\n");
}
