const SECTION_HEADING = /^\s*[A-Z][A-Z0-9 &/-]{3,}\s*$/;

const educationLines = (education: any[]): string[] => {
  const lines: string[] = [];
  for (const row of education) {
    const degree = String(row?.degree || row?.qualification || "").trim();
    const institution = String(row?.institution || row?.school || "").trim();
    if (degree) lines.push(degree);
    if (institution && institution.toLowerCase() !== degree.toLowerCase()) lines.push(institution);
    if (degree || institution) lines.push("");
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
};

/** Rebuilds education from saved qualifications, deliberately excluding dates. */
export function enforceEducationSection(resume: string, education: any[]): { text: string; restored: boolean } {
  if (!resume || !Array.isArray(education) || education.length === 0) return { text: resume, restored: false };
  const body = educationLines(education);
  if (!body.length) return { text: resume, restored: false };
  const lines = resume.split("\n");
  const start = lines.findIndex((line) => /^\s*EDUCATION\s*$/i.test(line));
  if (start < 0) {
    return { text: `${resume.trimEnd()}\n\nEDUCATION\n${body.join("\n")}`.trim(), restored: true };
  }
  let end = start + 1;
  while (end < lines.length && !SECTION_HEADING.test(lines[end])) end++;
  lines.splice(start + 1, end - start - 1, ...body);
  return { text: lines.join("\n"), restored: false };
}