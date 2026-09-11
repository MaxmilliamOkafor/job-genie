/**
 * PLACING RECOVERED SKILLS WHERE A READER EXPECTS THEM.
 *
 * The recovery step used to paste every missing-but-recorded term onto the end
 * of whatever the skills section happened to contain. On a CV whose skills
 * section is a set of labelled groups ("Programming: ...", "Cloud & DevOps:
 * ...") that produced a comma run hanging off the last group, so Jira landed
 * under Programming and Scrum under Cloud.
 *
 * This module answers one question per term: which labelled line does it belong
 * on? It reuses the candidate's own equivalent label when one exists, and only
 * writes a new labelled line when the section has no suitable group.
 *
 * It never decides WHETHER a term may be added - that is the evidence rule in
 * evidence.ts. It only decides WHERE.
 */

export type SkillCategory =
  | "programming"
  | "data"
  | "cloud"
  | "tools"
  | "methods";

/** The label written when the section has no equivalent group already. */
export const CATEGORY_LABEL: Record<SkillCategory, string> = {
  programming: "Programming",
  data: "Data & Analytics",
  cloud: "Cloud & DevOps",
  tools: "Tools & Platforms",
  methods: "Methods & Delivery",
};

/**
 * Words that identify an EXISTING group label as the equivalent of a category,
 * so "Languages & Frameworks", "Engineering" or "Ways of Working" are reused
 * rather than duplicated by a new line.
 */
const LABEL_HINTS: Record<SkillCategory, string[]> = {
  programming: ["programming", "language", "coding", "development", "framework", "backend", "frontend", "software"],
  data: ["data", "analytic", "analysis", "bi", "reporting", "modelling", "modeling", "database", "warehouse", "machine learning", "ml", "ai"],
  cloud: ["cloud", "devops", "infrastructure", "platform engineering", "deployment", "ci/cd", "sre", "operations"],
  tools: ["tool", "platform", "software", "systems", "applications", "productivity", "itsm tool"],
  methods: ["method", "delivery", "process", "practice", "agile", "ways of working", "governance", "framework"],
};

/** Known terms, by category. Matching is exact on the lower-cased term. */
const KNOWN: Record<SkillCategory, string[]> = {
  programming: [
    "python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "golang", "rust", "ruby", "php",
    "scala", "kotlin", "swift", "r", "matlab", "perl", "bash", "shell", "shell scripting", "powershell",
    "vba", "sql", "pl/sql", "t-sql", "html", "css", "react", "node.js", "next.js", "angular", "vue",
    "django", "flask", "fastapi", "spring", "spring boot", ".net", "asp.net", "express", "graphql",
  ],
  data: [
    "etl", "elt", "data modelling", "data modeling", "data warehousing", "data warehouse", "data quality",
    "data governance", "data analysis", "data analytics", "analytics", "reporting", "dashboards",
    "power bi", "tableau", "looker", "qlik", "excel", "advanced excel", "pandas", "numpy", "spark",
    "pyspark", "apache spark", "hadoop", "hive", "presto", "kafka", "airflow", "apache airflow", "dbt",
    "snowflake", "bigquery", "redshift", "databricks", "postgresql", "mysql", "sql server", "oracle",
    "mongodb", "nosql", "statistics", "forecasting", "machine learning", "nlp", "scikit-learn",
    "tensorflow", "pytorch", "mlflow", "xgboost", "data visualisation", "data visualization", "sas", "spss",
  ],
  cloud: [
    "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "terraform", "ansible", "jenkins",
    "ci/cd", "github actions", "gitlab ci", "cloudformation", "iac", "argocd", "helm", "linux",
    "monitoring", "observability", "prometheus", "grafana", "datadog", "splunk", "s3", "ec2", "lambda",
    "eks", "serverless", "devops", "site reliability", "networking",
  ],
  tools: [
    "jira", "confluence", "servicenow", "visio", "sharepoint", "trello", "asana", "monday.com", "slack",
    "figma", "miro", "salesforce", "sap", "workday", "netsuite", "quickbooks", "zendesk", "hubspot",
    "notion", "postman", "git", "github", "gitlab", "bitbucket", "azure devops", "power apps",
    "power automate", "microsoft project", "smartsheet", "lucidchart", "remedy", "bmc",
  ],
  methods: [
    "agile", "scrum", "kanban", "safe", "waterfall", "uat", "user acceptance testing", "itsm", "itil",
    "process design", "process improvement", "process mapping", "business process", "requirements gathering",
    "requirements analysis", "gap analysis", "change management", "release management", "incident management",
    "problem management", "change control", "test planning", "test automation", "qa", "sdlc",
    "stakeholder workshops", "backlog management", "sprint planning", "root cause analysis",
    "continuous improvement", "lean", "six sigma", "prince2", "pmp", "risk management",
  ],
};

/** Substring cues used when a term is not in the known lists. */
const CUES: Array<[SkillCategory, RegExp]> = [
  [methodsCue(), /\b(agile|scrum|kanban|uat|itsm|itil|sdlc|process|delivery|governance|lifecycle|methodolog|workshop|backlog|sprint|testing|test)\b/i],
  [dataCue(), /\b(data|analytic|analysis|report|dashboard|sql|warehous|model(l)?ing|statistic|forecast|bi|ml|machine learning)\b/i],
  [cloudCue(), /\b(cloud|aws|azure|gcp|kubernetes|docker|terraform|pipeline|ci\/cd|deploy|infrastructur|monitor|observab)\b/i],
  [programmingCue(), /\b(script|programming|framework|api|language|develop)\b/i],
];
function methodsCue(): SkillCategory { return "methods"; }
function dataCue(): SkillCategory { return "data"; }
function cloudCue(): SkillCategory { return "cloud"; }
function programmingCue(): SkillCategory { return "programming"; }

/**
 * Capabilities that belong in an achievement, never in a skills list. These are
 * demonstrated by what a bullet says happened; asserted as list items they read
 * as filler and a reviewer discounts the whole section.
 */
const SOFT_CAPABILITIES = new Set([
  "communication", "communications", "written communication", "verbal communication",
  "mentoring", "mentorship", "coaching", "leadership", "teamwork", "team work",
  "collaboration", "cross-functional collaboration", "problem solving", "problem-solving",
  "attention to detail", "adaptability", "flexibility", "time management", "ownership",
  "stakeholder management", "stakeholder engagement", "interpersonal skills", "presentation skills",
  "critical thinking", "organisational skills", "organizational skills", "self-motivated",
  "work ethic", "customer service", "customer focus", "initiative", "creativity", "empathy",
  "negotiation", "influencing", "multitasking", "prioritisation", "prioritization",
]);

export function isSoftCapability(term: string): boolean {
  return SOFT_CAPABILITIES.has(term.trim().toLowerCase());
}

export function categoriseSkill(term: string): SkillCategory {
  const key = term.trim().toLowerCase();
  for (const [cat, list] of Object.entries(KNOWN) as Array<[SkillCategory, string[]]>) {
    if (list.includes(key)) return cat;
  }
  for (const [cat, re] of CUES) {
    if (re.test(key)) return cat;
  }
  return "tools";
}

interface SkillLine {
  index: number;
  label: string;
  items: string[];
}

/**
 * Splits the skills section into labelled lines. The languages / citizenship
 * line is identified so nothing is ever added to it.
 */
function parseSkillLines(lines: string[], start: number, end: number): SkillLine[] {
  const out: SkillLine[] = [];
  for (let i = start; i < end; i++) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const label = line.slice(0, idx).trim();
    if (!label || label.length > 40) continue;
    // The spoken-languages / citizenship line is built from saved fields and is
    // never added to. A label like "Languages & Frameworks" is a real technical
    // group and stays eligible; a bare "Languages" is treated as the spoken one.
    if (/citizen/i.test(label) || /^languages?$/i.test(label)) continue;
    out.push({
      index: i,
      label,
      items: line.slice(idx + 1).split(",").map((s) => s.trim()).filter(Boolean),
    });
  }
  return out;
}

function labelMatchesCategory(label: string, category: SkillCategory): boolean {
  const l = label.toLowerCase();
  if (l === CATEGORY_LABEL[category].toLowerCase()) return true;
  return LABEL_HINTS[category].some((h) => l.includes(h));
}

const HEADING = /^[A-Z][A-Z0-9 &/-]{3,}$/;

export interface PlacementResult {
  text: string;
  added: Array<{ term: string; label: string; created: boolean }>;
  skipped: Array<{ term: string; reason: "duplicate" | "soft capability" | "no skills section" | "group full" }>;
  /** The skills section before and after, for reporting. */
  before: string;
  after: string;
}

/**
 * Adds each term to the right labelled line of the CV's existing skills
 * section. Terms already present anywhere in the section are skipped, so a
 * second run over the same document changes nothing.
 */
export function placeSkillsInSection(resume: string, terms: string[]): PlacementResult {
  const added: PlacementResult["added"] = [];
  const skipped: PlacementResult["skipped"] = [];
  const lines = resume.split("\n");

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!HEADING.test(t)) continue;
    if (/SKILL|PROFICIENC|COMPETENC/i.test(t)) { start = i + 1; break; }
  }
  if (start < 0) {
    for (const term of terms) skipped.push({ term, reason: "no skills section" });
    return { text: resume, added, skipped, before: "", after: "" };
  }
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t && HEADING.test(t) && !t.includes(":")) { end = i; break; }
  }
  // Trailing blank lines are not part of the section.
  while (end > start && !lines[end - 1].trim()) end--;

  const before = lines.slice(start, end).join("\n");
  const groups = parseSkillLines(lines, start, end);
  const sectionLower = before.toLowerCase();
  const present = new Set<string>();
  for (const g of groups) for (const item of g.items) present.add(item.toLowerCase().replace(/\s*\(.*\)$/, "").trim());

  const whole = (hay: string, needle: string) => {
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z0-9+#./])${esc}([^A-Za-z0-9+#./]|$)`, "i").test(hay);
  };

  const created = new Map<SkillCategory, SkillLine>();

  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;
    if (isSoftCapability(term)) { skipped.push({ term, reason: "soft capability" }); continue; }
    const key = term.toLowerCase();
    if (present.has(key) || whole(sectionLower, key)) { skipped.push({ term, reason: "duplicate" }); continue; }

    const category = categoriseSkill(term);
    let target = groups.find((g) => labelMatchesCategory(g.label, category));
    let isNew = false;
    if (!target) {
      target = created.get(category);
      if (!target) {
        target = { index: -1, label: CATEGORY_LABEL[category], items: [] };
        created.set(category, target);
        groups.push(target);
        isNew = true;
      }
    }
    if (target.items.length >= 10) {
      skipped.push({ term, reason: "group full" });
      continue;
    }
    target.items.push(term);
    present.add(key);
    added.push({ term, label: target.label, created: isNew || target.index === -1 });
  }

  if (added.length === 0) {
    return { text: resume, added, skipped, before, after: before };
  }

  // Rewrite the touched existing lines in place, then append any new labelled
  // lines at the end of the section. Every other line of the document,
  // including the languages / citizenship line, is untouched.
  const out = [...lines];
  for (const g of groups) {
    if (g.index >= 0) out[g.index] = `${g.label}: ${g.items.join(", ")}`;
  }
  const newLines = groups.filter((g) => g.index < 0).map((g) => `${g.label}: ${g.items.join(", ")}`);
  out.splice(end, 0, ...newLines);

  const after = out.slice(start, end + newLines.length).join("\n");
  return { text: out.join("\n"), added, skipped, before, after };
}

/** Merges duplicate labels and caps every labelled skills line at ten items. */
export function normaliseSkillsSection(resume: string): string {
  const lines = resume.split("\n");
  const heading = lines.findIndex((line) => /^\s*TECHNICAL\s+SKILLS\s*$/i.test(line));
  if (heading < 0) return resume;
  let end = heading + 1;
  while (end < lines.length && !(/^\s*[A-Z][A-Z0-9 &/-]{3,}\s*$/.test(lines[end]) && !lines[end].includes(":"))) end++;

  const order: string[] = [];
  const labels = new Map<string, string>();
  const items = new Map<string, string[]>();
  const seenSkills = new Set<string>();
  const untouched: string[] = [];
  for (const line of lines.slice(heading + 1, end)) {
    const match = line.trim().match(/^([^:]{1,40}):\s*(.+)$/);
    if (!match) {
      if (line.trim()) untouched.push(line.trim());
      continue;
    }
    const key = match[1].trim().toLowerCase();
    if (!items.has(key)) {
      order.push(key);
      labels.set(key, match[1].trim());
      items.set(key, []);
    }
    const bucket = items.get(key);
    if (!bucket) continue;
    for (const raw of match[2].split(",")) {
      const item = raw.trim();
      const itemKey = item.toLowerCase().replace(/\s*\(.*\)$/, "").trim();
      if (!item || seenSkills.has(itemKey) || bucket.length >= 10) continue;
      seenSkills.add(itemKey);
      bucket.push(item);
    }
  }
  const grouped = order
    .map((key) => `${labels.get(key)}: ${(items.get(key) || []).join(", ")}`)
    .filter((line) => !/:\s*$/.test(line));
  lines.splice(heading + 1, end - heading - 1, ...grouped, ...untouched);
  return lines.join("\n");
}
