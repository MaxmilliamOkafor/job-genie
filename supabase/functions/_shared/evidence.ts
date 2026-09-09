/**
 * ONE set of evidence rules, shared by generation, revision and final
 * validation.
 *
 * The bug this module exists to kill: the pipeline used two different tests for
 * "does the candidate have this?". The revision pass asked "is there an
 * achievement that demonstrates it?" and correctly wrote in accurate wording;
 * the final validator then asked "is this word in the skills field?" and cut
 * the same wording back out. A capability the candidate demonstrably has was
 * removed because it had never been typed into a skills list.
 *
 * Every stage now calls classifyTerm() and gets the same answer:
 *
 *   explicit      - recorded as a tool, skill or qualification in the profile
 *   demonstrated  - not listed, but an achievement shows the capability
 *   unsupported   - nothing in the profile supports it; it stays out
 *
 * Only "unsupported" is ever removed. Nothing is invented at any tier.
 */

import { termAppearsIn } from "./coverage.ts";

export type EvidenceTier = "explicit" | "demonstrated" | "unsupported";

export interface EvidenceVerdict {
  tier: EvidenceTier;
  /** The profile text that supports it, quoted so the candidate can check it. */
  evidence?: string;
  source?: string;
}

export interface EvidenceSource {
  label: string;
  text: string;
  /** Skills/certification entries are records; bullets are demonstrations. */
  kind: "record" | "achievement";
}

/**
 * Capability phrases a job description asks for that a real achievement can
 * demonstrate without the candidate ever having typed the phrase.
 *
 * Deliberately limited to capabilities. A named tool, product, platform,
 * language or qualification is NEVER inferred: writing Airflow because someone
 * scheduled a job, or AWS because they deployed something, is a fabrication
 * that fails at interview. Those require an explicit record.
 */
const CAPABILITY_SYNONYMS: Record<string, string[]> = {
  "end-to-end": ["end to end", "end-to-end", "from ingestion", "owned the full", "designed and delivered", "built and deployed", "from source to"],
  ownership: ["owned", "led", "drove", "accountable for", "took responsibility", "responsible for"],
  "stakeholder management": ["stakeholder", "business partner", "presented findings", "vp-level", "senior leadership"],
  stakeholders: ["stakeholder", "business partner", "presented findings"],
  "data modelling": ["data model", "schema", "dimensional", "star schema", "normalis"],
  "data modeling": ["data model", "schema", "dimensional", "star schema", "normaliz"],
  "data quality": ["data quality", "validation", "reconcil", "accuracy check", "integrity"],
  collaboration: ["collaborat", "partnered", "worked with", "cross-functional", "cross functional"],
  "cross-functional": ["cross-functional", "cross functional", "partnered", "worked with"],
  mentoring: ["mentor", "coached", "onboarded", "trained"],
  mentorship: ["mentor", "coached", "onboarded", "trained"],
  automation: ["automat", "scheduled", "orchestrat"],
  "problem solving": ["diagnosed", "root cause", "resolved", "debugged", "troubleshot"],
  // COMMUNICATION IS DEMONSTRATED, NOT LISTED.
  // Presentations, training, workshops, documentation and stakeholder work all
  // demonstrate it. This makes the requirement count as ALIGNED; it does not
  // put the word "Communication" in a skills list, and it does not make the
  // term literally covered. Those two figures stay separate.
  communication: [
    "presented", "presentation", "documented", "documentation", "reported to", "briefed", "wrote",
    "trained", "training", "workshop", "demo", "walkthrough", "stakeholder", "liaised",
    "explained", "chaired", "facilitated", "onboarded", "knowledge sharing", "runbook",
  ],
  "communication skills": [
    "presented", "presentation", "documented", "trained", "training", "workshop",
    "stakeholder", "briefed", "liaised", "facilitated",
  ],
  "verbal and written communication": ["presented", "documented", "wrote", "briefed", "training"],
  // Provisioning infrastructure declaratively with Terraform/CloudFormation IS
  // infrastructure as code, whether or not the candidate typed the phrase.
  "infrastructure as code": ["terraform", "cloudformation", "pulumi", "provision", "ansible", "helm chart"],
  iac: ["terraform", "cloudformation", "pulumi", "provision", "ansible"],
  documentation: ["documented", "documentation", "runbook"],
  "attention to detail": ["reconcil", "validation", "accuracy check", "audit"],
  leadership: ["led", "managed", "headed", "mentored"],
  "team work": ["collaborat", "partnered", "worked with"],
  teamwork: ["collaborat", "partnered", "worked with"],
  "continuous improvement": ["improved", "reduced", "optimis", "optimiz", "refactor"],
  scalability: ["scaled", "scalable", "throughput", "high volume"],
  troubleshooting: ["debugged", "diagnosed", "root cause", "resolved"],
  testing: ["test", "unit test", "coverage"],
  monitoring: ["monitor", "alerting", "observability", "dashboard"],
  "performance optimisation": ["latency", "optimis", "reduced runtime", "throughput"],
  "performance optimization": ["latency", "optimiz", "reduced runtime", "throughput"],
  "agile": ["agile", "scrum", "sprint", "kanban"],
  "reporting": ["report", "dashboard", "presented findings"],
  "analytics": ["analytic", "analysis", "insight"],
  "governance": ["governance", "compliance", "control", "audit"],
  "compliance": ["compliance", "regulat", "audit", "control"],
};

/**
 * Negated or hypothetical mentions are not evidence. A profile line reading
 * "no exposure to Kafka" or a job description phrase copied into a note must
 * not license a claim.
 */
const NEGATION =
  /\b(no|not|none|never|without|lacking|limited|minimal|zero)\s+(?:\w+\s+){0,3}$/i;

function mentionIsNegated(text: string, term: string): boolean {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return false;
  return NEGATION.test(text.slice(Math.max(0, idx - 60), idx));
}

/** Collects the profile into labelled, tiered evidence lines. */
export function buildEvidenceSources(profile: any): EvidenceSource[] {
  const sources: EvidenceSource[] = [];
  const push = (label: string, text: unknown, kind: EvidenceSource["kind"]) => {
    const t = (text ?? "").toString().trim();
    if (t) sources.push({ label, text: t, kind });
  };

  // Explicit records: skills, certifications, education, per-role tech lists.
  const skills = profile?.skills;
  if (Array.isArray(skills)) {
    for (const s of skills) {
      if (typeof s === "string") push("saved skills", s, "record");
      else if (s && typeof s === "object") {
        push("saved skills", [s.name, s.category, Array.isArray(s.items) ? s.items.join(", ") : s.items].filter(Boolean).join(": "), "record");
      }
    }
  } else if (skills && typeof skills === "object") {
    for (const [group, items] of Object.entries(skills)) {
      push(`saved skills (${group})`, Array.isArray(items) ? items.join(", ") : items, "record");
    }
  }
  for (const c of Array.isArray(profile?.certifications) ? profile.certifications : []) {
    push("certification", typeof c === "string" ? c : (c as any)?.name, "record");
  }
  for (const e of Array.isArray(profile?.education) ? profile.education : []) {
    if (typeof e === "string") push("education", e, "record");
    else push("education", [(e as any)?.degree, (e as any)?.field, (e as any)?.institution].filter(Boolean).join(", "), "record");
  }

  // Demonstrations: achievement bullets on real roles, and project work.
  for (const role of Array.isArray(profile?.professionalExperience) ? profile.professionalExperience : []) {
    const label = [(role as any)?.title, (role as any)?.company].filter(Boolean).join(" at ") || "experience";
    for (const b of Array.isArray((role as any)?.bullets) ? (role as any).bullets : []) {
      push(label, b, "achievement");
    }
    const tech = (role as any)?.technologies ?? (role as any)?.techStack;
    push(`${label} (recorded tools)`, Array.isArray(tech) ? tech.join(", ") : tech, "record");
  }
  for (const p of Array.isArray(profile?.relevantProjects) ? profile.relevantProjects : []) {
    const label = (p as any)?.name || "project";
    const stack = (p as any)?.techStack;
    push(`${label} (recorded stack)`, Array.isArray(stack) ? stack.join(", ") : stack, "record");
    push(label, (p as any)?.description, "achievement");
    for (const b of Array.isArray((p as any)?.bullets) ? (p as any).bullets : []) push(label, b, "achievement");
  }
  return sources;
}

/**
 * The single evidence decision.
 *
 * `suppliedEvidence` is the extension's keyword -> evidence map. It is treated
 * as an explicit record because it is the candidate's own confirmed profile
 * data, never the job description. Job text is not passed in here at all, so it
 * cannot become evidence about the candidate by accident.
 */
export function classifyTerm(
  term: string,
  sources: EvidenceSource[],
  suppliedEvidence: Record<string, string> = {},
): EvidenceVerdict {
  const t = (term || "").trim();
  if (!t) return { tier: "unsupported" };

  const supplied = suppliedEvidence[t.toLowerCase()];
  if (supplied) return { tier: "explicit", evidence: supplied, source: "confirmed profile evidence" };

  for (const src of sources) {
    if (!termAppearsIn(src.text, t)) continue;
    if (mentionIsNegated(src.text, t)) continue;
    return {
      tier: src.kind === "record" ? "explicit" : "demonstrated",
      evidence: src.text,
      source: src.label,
    };
  }

  const synonyms = CAPABILITY_SYNONYMS[t.toLowerCase().replace(/\s+/g, " ")];
  if (synonyms) {
    for (const src of sources) {
      if (src.kind !== "achievement") continue;
      const lower = src.text.toLowerCase();
      const hit = synonyms.find((s) => lower.includes(s));
      if (hit && !mentionIsNegated(src.text, hit)) {
        return { tier: "demonstrated", evidence: src.text, source: src.label };
      }
    }
  }

  return { tier: "unsupported" };
}

// ============================================================
// ONE FIXED REQUIREMENT LIST PER JOB
//
// Initial, revised and final coverage are only comparable when they are
// measured against the same list. It is built once, deduplicated, and never
// rebuilt mid-run.
// ============================================================

/** Boilerplate that is not a requirement and only dilutes the denominator. */
const BOILERPLATE = new Set([
  "equal opportunity", "eoe", "benefits", "salary", "competitive salary", "bonus",
  "team", "teams", "company", "companies", "role", "roles", "job", "jobs",
  "position", "candidate", "candidates", "applicant",
  "opportunity", "responsibilities", "requirements", "qualifications",
  "years", "experience", "work", "working", "environment", "culture",
  "we", "you", "our", "your", "the role", "the team", "full time", "part time",
  "remote", "hybrid", "onsite", "office", "visa", "relocation", "pension",
  "healthcare", "insurance", "equity", "stock", "diversity", "inclusion",
  // Vendor prefixes that only ever qualify a product name. "Apache" on its own
  // is not a requirement; "Apache Spark" and "Apache Airflow" are, and they
  // survive as their own terms.
  "apache", "microsoft", "google", "amazon", "oracle", "ibm", "adobe",
]);

/** Words that only ever appear as part of a job title phrase. */
const TITLE_WORDS = ["senior", "junior", "lead", "principal", "staff", "mid", "head", "chief", "manager", "director"];

/**
 * Nouns that make a phrase a JOB TITLE rather than a requirement. The posting's
 * own title is not something the candidate has to "cover": counting "Data
 * Engineer" or "Analytics Engineer" as a requirement produced a permanent
 * unsupported entry that pushed alignment down for every application, and
 * "covering" it would only mean pasting the employer's title over the
 * candidate's real history.
 */
const TITLE_NOUNS = ["engineer", "developer", "analyst", "scientist", "architect", "administrator", "consultant", "specialist", "officer", "designer"];

function looksLikeJobTitle(key: string): boolean {
  const words = key.split(/\s+/);
  if (words.length > 4) return false;
  const last = words[words.length - 1];
  return TITLE_NOUNS.includes(last) || (words.length === 1 && TITLE_NOUNS.includes(key));
}

/**
 * Canonical spelling for terms whose casing carries meaning. Extraction
 * title-cases what it finds, which turned real requirements into "Etl", "Dbt"
 * and "Fastapi" - wrong on a CV and wrong in a report the candidate reads.
 */
const CANONICAL_CASE: Record<string, string> = {
  "etl": "ETL", "elt": "ELT", "dbt": "dbt", "fastapi": "FastAPI",
  "sql": "SQL", "nosql": "NoSQL", "api": "API", "apis": "APIs",
  "aws": "AWS", "gcp": "GCP", "ci/cd": "CI/CD", "cicd": "CI/CD",
  "node.js": "Node.js", "nodejs": "Node.js", "next.js": "Next.js",
  "typescript": "TypeScript", "javascript": "JavaScript",
  "postgresql": "PostgreSQL", "mysql": "MySQL", "graphql": "GraphQL",
  "c++": "C++", "c#": "C#", ".net": ".NET", "asp.net": "ASP.NET",
  "pytorch": "PyTorch", "tensorflow": "TensorFlow", "nlp": "NLP",
  "mlops": "MLOps", "devops": "DevOps", "kpi": "KPI", "kpis": "KPIs",
  "etls": "ETL", "html": "HTML", "css": "CSS", "json": "JSON",
  "rest": "REST", "grpc": "gRPC", "s3": "S3", "ec2": "EC2",
  "bigquery": "BigQuery", "github actions": "GitHub Actions",
  "power bi": "Power BI", "iac": "IaC",
  "mongodb": "MongoDB", "eks": "EKS", "argocd": "ArgoCD", "pyspark": "PySpark",
  "pytest": "pytest", "presto": "Presto", "nltk": "NLTK", "mlflow": "MLflow",
  "xgboost": "XGBoost", "shap": "SHAP", "ifrs 9": "IFRS 9", "aml": "AML",
  "hipaa": "HIPAA", "iso 27001": "ISO 27001", "rbac": "RBAC", "llm": "LLM", "llms": "LLMs",
  "js": "JS", "k8s": "Kubernetes", "tensorflow.js": "TensorFlow.js",
};

export interface RequirementList {
  terms: string[];
  removed: string[];
}

export function buildRequirementList(
  rawTerms: string[],
  employerNames: string[] = [],
  targetTitle = "",
): RequirementList {
  const employers = new Set(
    employerNames.flatMap((n) => (n || "").toLowerCase().split(/[^a-z0-9+#.]+/)).filter((w) => w.length > 2),
  );
  const target = targetTitle.toLowerCase().trim();

  const terms: string[] = [];
  const removed: string[] = [];
  const seen = new Map<string, string>();

  for (const raw of rawTerms) {
    let term = (raw || "")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .trim()
      .replace(/^[^A-Za-z0-9.+#]+|[^A-Za-z0-9.+#)]+$/g, "");
    if (!term) continue;

    const key = term.toLowerCase();
    // Restore the spelling a human would write before the term is reported or
    // written into a document.
    term = CANONICAL_CASE[key] ?? term;
    if (seen.has(key)) continue;
    if (key.length < 2) { removed.push(term); continue; }
    if (BOILERPLATE.has(key)) { removed.push(term); continue; }
    // Incidental employer names are not skills.
    if (employers.has(key)) { removed.push(term); continue; }
    // A bare seniority word carries no requirement of its own.
    if (TITLE_WORDS.includes(key)) { removed.push(term); continue; }
    // The posting's job title is not a requirement to satisfy.
    if (key === target || looksLikeJobTitle(key)) { removed.push(term); continue; }
    // Overlapping title phrases: "senior data engineer" and "data engineer"
    // are one requirement, so only the more specific phrase is credited.
    const stripped = key.split(/\s+/).filter((w) => !TITLE_WORDS.includes(w)).join(" ");
    if (stripped && stripped !== key && seen.has(stripped)) { removed.push(term); continue; }

    seen.set(key, term);
    if (stripped && stripped !== key) seen.set(stripped, term);
    terms.push(term);
  }

  // A phrase already fully contained in another retained multi-word phrase is
  // not separate credit ("data quality" inside "data quality checks").
  // A single word only loses its own credit when the longer phrase merely puts a
  // qualifier in front of it ("Leadership" under "Technical Leadership"), never
  // when the longer phrase is a different product ("SQL" is not "SQL Server").
  const QUALIFIERS = ["technical", "strong", "advanced", "basic", "excellent", "good", "solid", "deep", "hands-on", "proven", "apache", "modern"];
  const finalTerms = terms.filter((t) => {
    const words = t.toLowerCase().split(/\s+/);
    const dup = terms.some((other) => {
      if (other === t) return false;
      const o = other.toLowerCase();
      const ow = o.split(/\s+/);
      if (o === t.toLowerCase() || ow.length <= words.length) return false;
      if (words.length >= 2) return o.includes(t.toLowerCase());
      // single word: only a trailing match behind a qualifier counts as the same
      return ow[ow.length - 1] === words[0] && ow.slice(0, -1).every((w) => QUALIFIERS.includes(w));
    });
    if (dup) removed.push(t);
    return !dup;
  });
  // An acronym and its expansion are ONE requirement. Counting "NLP" and
  // "Natural Language Processing" separately inflated the denominator and then
  // pushed both spellings onto the skills line, which reads like stuffing.
  const acronyms = new Set(
    finalTerms.filter((t) => !/\s/.test(t) && t.length >= 2 && t.length <= 6 && t === t.toUpperCase())
      .map((t) => t.toLowerCase().replace(/[^a-z]/g, "")),
  );
  const deduped = finalTerms.filter((t) => {
    const words = t.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length < 2) return true;
    const initials = words.map((w) => w[0]).join("");
    const isExpansion = acronyms.has(initials);
    if (isExpansion) removed.push(t);
    return !isExpansion;
  });

  return { terms: deduped, removed };
}

/**
 * Two numbers that must never be blended into one score.
 *
 * literal    - the term appears verbatim in the exported document
 * alignment  - the requirement is backed by profile evidence, whether or not
 *              the exact word survived the final wording
 */
export interface CoverageReport {
  literal: { matched: string[]; missing: string[]; total: number; percent: number };
  alignment: { supported: string[]; unsupported: string[]; total: number; percent: number };
}

export function reportCoverage(
  documentText: string,
  terms: string[],
  sources: EvidenceSource[],
  suppliedEvidence: Record<string, string> = {},
): CoverageReport {
  const matched: string[] = [];
  const missing: string[] = [];
  const supported: string[] = [];
  const unsupported: string[] = [];
  for (const term of terms) {
    if (termAppearsIn(documentText, term)) matched.push(term);
    else missing.push(term);
    if (classifyTerm(term, sources, suppliedEvidence).tier === "unsupported") unsupported.push(term);
    else supported.push(term);
  }
  const pct = (n: number) => (terms.length === 0 ? 0 : Math.round((n / terms.length) * 100));
  return {
    literal: { matched, missing, total: terms.length, percent: pct(matched.length) },
    alignment: { supported, unsupported, total: terms.length, percent: pct(supported.length) },
  };
}
