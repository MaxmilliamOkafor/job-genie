/**
 * The candidate's own location, printed once and printed cleanly.
 *
 * Callers (the extension, the web app, older saved payloads) have sent
 * city/country values that already contain a full location string, which
 * produced headers like "Dublin, Dublin, IE, Ireland, Ireland". Locations are
 * therefore normalised here rather than trusted: repeated segments collapse,
 * a bare ISO code is dropped when its full country name is present, and the
 * result is capped at two segments (city, country).
 */

const ISO_TO_COUNTRY: Record<string, string> = {
  IE: "ireland",
  GB: "united kingdom",
  UK: "united kingdom",
  US: "united states",
  USA: "united states",
  DE: "germany",
  FR: "france",
  ES: "spain",
  NL: "netherlands",
  PT: "portugal",
  IT: "italy",
  PL: "poland",
  CA: "canada",
  AU: "australia",
};

export function normaliseLocation(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  const segments = raw
    .split(",")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Collapse repeats, case-insensitively, keeping first appearance.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const seg of segments) {
    const key = seg.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(seg);
  }

  // A bare ISO code is redundant when the full country name is also present.
  const lower = new Set(unique.map((s) => s.toLowerCase()));
  const kept = unique.filter((seg) => {
    const full = ISO_TO_COUNTRY[seg.toUpperCase()];
    return !(full && lower.has(full));
  });

  // City, country. Anything beyond that is either a duplicate or noise.
  if (kept.length <= 2) return kept.join(", ");
  return [kept[0], kept[kept.length - 1]].join(", ");
}

/** City and country from the saved profile, normalised into one header string. */
export function buildCandidateLocation(city: unknown, country: unknown): string {
  const parts = [city, country]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .join(", ");
  return normaliseLocation(parts);
}
