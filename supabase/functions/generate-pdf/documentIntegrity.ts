/** Text and file properties shared by every document export path. */
export const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return "";
  return (
    String(text)
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD]/g, "")
      .replace(/[\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'")
      .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
      .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(
        /[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25A0\u25A1\u25CF\u25CB\u25D8\u25D9\u2B24\u2B58\u29BF\u25C6\u25C7\u2666\u2756\u2605\u2606\u2713\u2714\u2717\u2718\u2794\u27A4\u25B6\u25B8\u25BA\u25BC\u25BE\u25C0\u25C2\u25C4]/g,
        "-",
      )
      .replace(/[\u2190-\u21FF]/g, "->")
      .replace(/[\u2713\u2714\u2715\u2716\u2717\u2718]/g, "*")
      .replace(/\u00A9/g, "(c)")
      .replace(/\u00AE/g, "(R)")
      .replace(/\u2122/g, "(TM)")
      // Currency symbols are kept: "GBP2.6bn" misreads as a code, and both
      // symbols exist in the document font and in ATS text extraction.

      .replace(/\u00A5/g, "JPY")
      .replace(/\u00B0/g, " deg")
      .replace(/\u00B1/g, "+/-")
      .replace(/\u00D7/g, "x")
      .replace(/\u00F7/g, "/")
      // Preserve middot (·) used as our contact separator and the pound and
      // euro signs used in figures; preserve Latin-1 accents
      .replace(/[^\x00-\x7F\u00A1-\u00FF\u20AC]/g, " ")

      .replace(/\s+/g, " ")
      .trim()
  );
};

export function candidateDocumentProperties(name: string, type: "resume" | "cover_letter") {
  return { creator: name, lastModifiedBy: name, title: `${name} ${type === "resume" ? "CV" : "Cover Letter"}` };
}

export async function createCandidatePdf<T extends { setTitle(title: string): void; setAuthor(author: string): void }>(
  factory: { create(options: { updateMetadata: boolean }): Promise<T> }, title: string, author: string,
): Promise<T> {
  const doc = await factory.create({ updateMetadata: false });
  doc.setTitle(title);
  doc.setAuthor(author);
  return doc;
}
