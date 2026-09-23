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

/**
 * Unwraps whatever a profile field holds into readable text.
 *
 * An achievement stored as { text: "..." } used to stringify to
 * "[object Object]", which matched nothing and read as corrupt evidence. Nested
 * values are unwrapped instead of stringified, at every depth a profile uses.
 */
function evidenceText(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (depth > 3) return "";
  if (Array.isArray(value)) {
    return value.map((v) => evidenceText(v, depth + 1)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["text", "bullet", "achievement", "description", "detail", "summary", "name", "title", "label", "value"]) {
      const inner = evidenceText(o[key], depth + 1);
      if (inner) return inner;
    }
    return Object.values(o).map((v) => evidenceText(v, depth + 1)).filter(Boolean).join(", ");
  }
  return "";
}

/** Reads the first present alias of a field, so snake_case profiles are not invisible. */
function alias(record: any, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) return value;
  }
  return undefined;
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Collects the profile into labelled, tiered evidence lines.
 *
 * Reads every shape a profile arrives in: camelCase and snake_case keys, and on
 * each role or project the bullets, description, achievements and
 * responsibilities as demonstrations, with technologies, techStack, tech_stack
 * and skills as records. A reader that knew only camelCase returned nothing at
 * all against a stored snake_case profile, every requirement then classified as
 * unsupported, and the tailoring had no evidence to write from.
 *
 * The same role reached through two aliases is one piece of evidence, so an
 * identical source line is never pushed twice: duplication reads as
 * corroboration that does not exist.
 */
export function buildEvidenceSources(profile: any): EvidenceSource[] {
  const sources: EvidenceSource[] = [];
  const seen = new Set<string>();
  // Each array element is its own source. Joining a stack into one string made
  // ["No Kafka experience", "Python"] a single line, and the negation test -
  // which reads backwards from the term - then negated Python along with Kafka.
  const push = (label: string, text: unknown, kind: EvidenceSource["kind"], depth = 0) => {
    if (Array.isArray(text) && depth < 4) {
      for (const item of text) push(label, item, kind, depth + 1);
      return;
    }
    const t = evidenceText(text);
    if (!t) return;
    const key = `${kind}::${t.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({ label, text: t, kind });
  };

  // Every spelling present is read, not just the first one found: a project
  // carrying technologies: ["Kafka"] AND tech_stack: ["Python"] reported only
  // Python, and Kafka came back unsupported on a profile that names it.
  const pushEveryAlias = (
    label: string,
    record: any,
    keys: string[],
    kind: EvidenceSource["kind"],
  ) => {
    for (const key of keys) {
      const value = record?.[key];
      if (value === undefined || value === null) continue;
      push(label, value, kind);
    }
  };

  // Explicit records: skills, certifications, education, per-role tech lists.
  const skills = alias(profile, "skills", "technicalSkills", "technical_skills");
  if (Array.isArray(skills)) {
    for (const s of skills) {
      if (typeof s === "string") push("saved skills", s, "record");
      else if (s && typeof s === "object") {
        const entry = s as any;
        push(
          "saved skills",
          [entry.name, entry.category, evidenceText(alias(entry, "items", "skills", "entries"))]
            .filter(Boolean)
            .join(": "),
          "record",
        );
      }
    }
  } else if (skills && typeof skills === "object") {
    for (const [group, items] of Object.entries(skills)) {
      push(`saved skills (${group})`, items, "record");
    }
  }
  for (const c of asArray(alias(profile, "certifications", "certification"))) {
    push("certification", typeof c === "string" ? c : alias(c, "name", "title", "text"), "record");
  }
  for (const e of asArray(alias(profile, "education"))) {
    if (typeof e === "string") push("education", e, "record");
    else push(
      "education",
      [
        (e as any)?.degree,
        (e as any)?.field_of_study,
        (e as any)?.fieldOfStudy,
        (e as any)?.field,
        (e as any)?.major,
        (e as any)?.school,
        (e as any)?.institution,
      ].filter(Boolean).join(", "),
      "record",
    );
  }

  // Demonstrations: achievement bullets on real roles, and project work.
  for (const role of asArray(alias(profile, "professionalExperience", "professional_experience", "workExperience", "work_experience"))) {
    const r = role as any;
    const label = [r?.title, alias(r, "company", "employer")].filter(Boolean).map((v) => evidenceText(v)).filter(Boolean).join(" at ") || "experience";
    const demonstrations = [
      ...asArray(alias(r, "bullets", "highlights")),
      ...asArray(alias(r, "achievements")),
      ...asArray(alias(r, "responsibilities")),
      ...asArray(alias(r, "description")),
    ];
    for (const b of demonstrations) {
      const text = evidenceText(b);
      // A description stored as one block is several bullets on one line.
      for (const line of text.split(/\n+/)) push(label, line.replace(/^\s*[-•*]\s*/, ""), "achievement");
    }
    pushEveryAlias(
      `${label} (recorded tools)`,
      r,
      ["technologies", "techStack", "tech_stack", "skills", "tools"],
      "record",
    );
  }
  for (const p of asArray(alias(profile, "relevantProjects", "relevant_projects", "projects"))) {
    const proj = p as any;
    const label = evidenceText(alias(proj, "name", "title")) || "project";
    pushEveryAlias(`${label} (recorded stack)`, proj, ["techStack", "tech_stack", "technologies", "skills"], "record");
    const demonstrations = [
      ...asArray(alias(proj, "description")),
      ...asArray(alias(proj, "bullets", "highlights")),
      ...asArray(alias(proj, "achievements")),
      ...asArray(alias(proj, "responsibilities")),
    ];
    for (const b of demonstrations) {
      const text = evidenceText(b);
      for (const line of text.split(/\n+/)) push(label, line.replace(/^\s*[-•*]\s*/, ""), "achievement");
    }
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

/**
 * Benefits, logistics and application boilerplate. A candidate cannot evidence a
 * dental plan, so these must never enter the requirement list in the first
 * place. Kept deliberately narrow: "reliability", "availability", "automation",
 * "scalability", "observability", "collaboration" and "stakeholder management"
 * are real requirements on technical and management postings and must survive.
 */
const FURNITURE = [
  "competitive salary", "competitive pay", "salary range", "401k", "401(k)",
  "dental", "vision", "dental insurance", "vision insurance", "health insurance",
  "medical insurance", "health cover", "paid time off", "pto", "holiday allowance",
  "annual leave", "parental leave", "maternity leave", "paternity leave",
  "sick leave", "stock options", "share options", "rsu", "rsus", "bonus",
  "bonus scheme", "signing bonus", "perks", "wellness", "gym membership",
  "free lunch", "full-time", "full time", "part-time", "part time", "permanent",
  "contract", "temporary", "internship", "hybrid", "remote", "onsite",
  "on-site", "work from home", "flexible hours", "flexible working",
  "equal opportunity", "equal opportunity employer", "eoe", "affirmative action",
  "background check", "drug screening", "fast-paced", "fast paced",
  "fast-paced environment", "dynamic environment", "apply now", "submit resume",
  "submit your resume", "submit cv", "how to apply", "join us", "about us",
  "our mission", "why join", "reference number", "job id", "requisition id",
  "start date", "notice period", "relocation assistance", "visa sponsorship",
  "pension", "pension scheme", "life insurance", "employee discount",
];

const FURNITURE_SET = new Set(FURNITURE);

/** True when a term is benefits, logistics or application boilerplate. */
export function isFurniture(term: string): boolean {
  const key = (term || "").toLowerCase().trim().replace(/\s+/g, " ");
  if (!key) return true;
  if (FURNITURE_SET.has(key)) return true;
  // These are answered by dated employment/education records or application
  // questions. They are not skills and must not become permanent CV misses.
  // "7+ years", "minimum 8 years", "10+ years of relevant experience".
  const YEARS_TAIL = "(?:\\s+of)?(?:\\s+[a-z-]+){0,3}?\\s+experience";
  if (new RegExp(`^(?:minimum\\s+|at least\\s+)?\\d+\\s*(?:\\+|plus)?\\s*years?(?:${YEARS_TAIL})?$`).test(key)) return true;
  if (new RegExp(`^\\d+\\s*-\\s*\\d+\\s*years?(?:${YEARS_TAIL})?$`).test(key)) return true;
  if (/^(?:bachelor(?:'s|s)?|master(?:'s|s)?|doctoral|doctorate|phd)(?:\s+degree)?(?:\s+in\s+.+)?$/.test(key)) return true;
  // Kit, shifts, codes and half-words: never a CV keyword.
  if (/^\d+\s?(?:gb|tb|mb|ghz|mbps)\b/.test(key)) return true;
  if (/^(?:ram|hd|ssd|cpu|ups|webcam|hd webcam|headset|noise[- ]cancell?ing headset|internet connection|internet speed|backup power|night shift|graveyard shift|pre|pre-employment|ph|ph time|est|pst|cst|us hours)$/.test(key)) return true;
  if (/^(?:ph|in|ca|au|nz|sg|de|fr|es|nl|pl|pt|mx|br|za|ae|inr|aud|cad|sgd|chf|usd|eur|gbp)$/.test(key)) return true;
  if (key === 'languages') return true;
  // A compensation HR skill is a real requirement; a pay line is not.
  if (/^(?:compensation (?:planning|analysis|analytics|strategy|benchmarking|design|administration)|comp(?:ensation)? (?:and|&) ben(?:efits)?|executive compensation)$/.test(key)) return false;
  // Phrases that only ever describe the package or the process.
  return /\b(salary|compensation|benefit|benefits|insurance|401k|pto|vacation|holiday|perk|perks|bonus|equity vest|apply|application process|recruiter|interview process|eoe|equal opportunity)\b/.test(
    key,
  );
}

// ============================================================
// LIFTED PROSE IS NOT A KEYWORD
//
// "experience at a competitor", "Kubernetes is a plus" and "building for
// internal users" are sentences cut out of the posting. No CV contains those
// strings and no ATS filters on them, so they can only ever show as a
// permanent miss. Where a sentence names a real skill, the skill is returned
// on its own; where it names none, nothing is returned.
// ============================================================

/** Phrases whose meaning IS a skill, even though the posting wrote a sentence. */
const PROSE_SALVAGE: Record<string, string> = {
  "building for internal users": "Internal Tools",
  "building for internal teams": "Internal Tools",
  "internal users": "Internal Tools",
  "internal customers": "Internal Tools",
  "internal tooling": "Internal Tools",
  "internal tools": "Internal Tools",
  "internal platforms": "Internal Tools",
};

/**
 * Recognised NAMES of skills, tools, regulations and methodologies. A name is
 * kept whatever words it happens to contain: "Know Your Customer" is the KYC
 * regulation, "Software as a Service" is SaaS, "A/B Testing" is a method.
 * The test is "is this a sentence or a clause", not "does it contain an article
 * or a pronoun" - a generic article/pronoun test destroys real skills.
 */
const NAMED_SKILLS = new Set([
  "infrastructure as a service", "platform as a service", "software as a service",
  "desktop as a service", "database as a service", "function as a service",
  "everything as a service", "data as a service",
  "infrastructure as code", "configuration as code", "policy as code",
  "know your customer", "know your business", "know your customer (kyc)",
  "a/b testing", "a/b tests", "managing a team", "managing a p&l",
  "leading a team", "building a team", "voice of the customer",
  "train the trainer", "the cloud",
]);
/** Backwards-compatible alias: the article test became a named-skill test. */
const ARTICLE_ALLOWLIST = NAMED_SKILLS;


/** Sentence scaffolding that only ever wraps a requirement, never is one. */
const PROSE_LEADS = [
  /^(?:prior|previous|proven|demonstrated|demonstrable|strong|solid|deep|extensive|hands-on|practical|relevant|significant)\s+/,
  /^(?:experience|experienced|expertise|knowledge|familiarity|familiar|understanding|background|exposure|track record|comfort|comfortable|ability|able|willingness|willing|passion|passionate|interest|interested|desire|proficiency|proficient|fluency|fluent|competence|competency|skills?)\s+(?:at|in|with|of|using|on|for|to|around|across)\s+(?:a|an|the)?\s*/,
  /^(?:worked|working|work)\s+(?:at|in|with|on|for|across)\s+(?:a|an|the)?\s*/,
  /^(?:you|we|they|it)\s+/,
  /^(?:must|should|would)\s+(?:have|be)\s+/,
];

/**
 * Words a salvage can land on that name nothing a candidate could evidence.
 * "experience at a competitor" reduces to "competitor", which is not a skill.
 */
const DEAD_SALVAGE = /\b(?:competitor|competitors|startup|startups|scaleup|environment|environments|candidate|candidates|company|companies|team player|degree|culture|setting|workplace)\b/;


const PROSE_TAILS = [
  /\s+(?:is|are|would be|will be)\s+(?:a\s+)?(?:plus|bonus|advantage|benefit|desirable|preferred|required|essential|nice to have)\.?$/,
  /\s+(?:a\s+)?(?:plus|bonus|advantage|nice to have|preferred|desirable|required|essential|mandatory|beneficial|advantageous)\.?$/,
  /\s+(?:experience|expertise|knowledge|familiarity|understanding|background|exposure|skills?)\.?$/,
];

/** Pronouns only ever appear when a sentence, not a requirement, was extracted. */
const PROSE_MARKERS = /\b(?:you|your|we|our|us|they|their|them|who|whom|whose)\b/;

/** Experience wording that, followed later by an article, marks a lifted clause. */
const EXPERIENCE_OPENER = /^(?:prior|previous|proven|demonstrated|demonstrable|strong|solid|deep|extensive|hands-on|practical|relevant|significant)?\s*(?:experience|experienced|experiences|worked|working|work|background|familiarity|familiar|exposure|knowledge|understanding|comfortable|comfort|proven)\b/;

/** Preference wording: a requirement is never phrased as a preference. */
const PREFERENCE_WORDING = /\b(?:preferably|ideally|nice to have|nice-to-have|bonus)\b|\bis\s+a\s+plus\b|\b(?:preferred|desirable)\s*\.?$/;

/**
 * True when a term is a clause lifted from the posting rather than a requirement.
 *
 * Deliberately narrow: filtering out a real skill is unrecoverable downstream,
 * while a stray chip is merely visible. So there is no verb rule (gerunds such
 * as "Machine Learning" and "Automated Testing" are noun phrases) and no
 * word-count rule (certifications like "AWS Certified Solutions Architect
 * Associate" run to five words). When in doubt, let it through.
 */
export function isLiftedProse(term: string): boolean {
  const key = (term || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!key) return true;
  if (ARTICLE_ALLOWLIST.has(key)) return false;
  // A phrase that is already its own canonical skill name is not prose; one that
  // maps to a different name still needs salvaging.
  if (PROSE_SALVAGE[key] && PROSE_SALVAGE[key].toLowerCase() === key) return false;

  if (PROSE_MARKERS.test(key)) return true;
  if (PREFERENCE_WORDING.test(key)) return true;
  // "experience at a competitor", "worked at a startup", "experience in a
  // fast-paced environment": experience wording plus an article. "experience
  // with Python" and "Infrastructure as a Service" are untouched.
  if (EXPERIENCE_OPENER.test(key) && /(^|\s)(?:a|an|the)(\s|$)/.test(key.replace(EXPERIENCE_OPENER, ""))) return true;
  return false;
}


/**
 * Reduces a lifted clause to the requirement it names, or drops it. Returns null
 * when the sentence names nothing a candidate could evidence.
 */
export function salvageRequirement(term: string): string | null {
  let key = (term || "").trim().replace(/\s+/g, " ").replace(/[.;,]+$/, "");
  if (!key) return null;
  const direct = PROSE_SALVAGE[key.toLowerCase()];
  if (direct) return direct;
  if (ARTICLE_ALLOWLIST.has(key.toLowerCase())) return key;

  // Peel the sentence scaffolding off, repeatedly: "SaaS experience preferred"
  // becomes "SaaS", "Kubernetes is a plus" becomes "Kubernetes".
  for (let pass = 0; pass < 4; pass++) {
    const before = key;
    for (const tail of PROSE_TAILS) key = key.replace(tail, "");
    for (const lead of PROSE_LEADS) key = key.replace(lead, "");
    key = key.trim().replace(/[.;,]+$/, "");
    if (key === before) break;
  }
  if (!key) return null;
  const salvaged = PROSE_SALVAGE[key.toLowerCase()];
  if (salvaged) return salvaged;
  if (isFurniture(key)) return null;
  if (DEAD_SALVAGE.test(key.toLowerCase())) return null;
  if (isLiftedProse(key)) return null;

  return key;
}

/**

 * Qualifier words and generic trailing nouns that turn one requirement into
 * three phrasings. "payroll", "global payroll" and "payroll management" are one
 * thing; the stem is what identifies the requirement.
 */
const VARIANT_QUALIFIERS = new Set([
  "global", "international", "regional", "overall", "general", "end-to-end",
  "end", "to", "strong", "solid", "proven", "deep", "advanced", "excellent",
  "good", "hands-on", "practical", "extensive", "demonstrable", "relevant",
  "modern", "enterprise", "full", "complete", "core", "day-to-day",
  // "ad-hoc data analysis" is "data analysis"; "custom reports" is "reports".
  "ad-hoc", "ad", "hoc", "custom", "bespoke", "various", "multiple", "complex",
  "detailed",
]);

const GENERIC_TAILS = new Set([
  "management", "managing", "operations", "operation", "systems", "system",
  "skills", "skill", "building", "build", "development", "processes", "process",
  "activities", "practices", "practice", "administration", "delivery",
  "knowledge", "expertise", "ability", "abilities", "understanding",
  "background", "capability", "capabilities",
  // "forecasting models" is "forecasting"; "reporting suite" is "reporting".
  "models", "model", "suite", "suites",
]);

/** Requirement phrasings that are the same ask under different words. */
const REQUIREMENT_ALIASES: Record<string, string> = {
  "people management": "team leadership",
  "line management": "team leadership",
  "team management": "team leadership",
  "managing people": "team leadership",
  "feedback": "performance management",
  "team performance": "performance management",
  "performance reviews": "performance management",
  "artificial intelligence": "AI",
  "ai building": "AI",
  "ai development": "AI",
  "machine learning models": "machine learning",
  "stakeholder engagement": "stakeholder management",
  "stakeholder communication": "stakeholder management",
  "cross functional": "cross-functional",
  "continuous integration": "CI/CD",
  "continuous delivery": "CI/CD",
  "continuous deployment": "CI/CD",
};

/**
 * Compound modifiers hang off a head noun: "AI-driven" is the same requirement
 * as "AI". "Remote-first" and "cloud-native" name their own thing, so only the
 * modifier suffixes listed here are stripped.
 */
const MODIFIER_SUFFIXES = ["driven", "focused", "heavy", "based", "led", "oriented", "centric", "intensive", "enabled", "powered"];

/**
 * Adjective and noun forms of one word are one requirement: "scrappy" and
 * "scrappiness", "ownership" and "owner". Deliberately narrow so that
 * "reliability", "availability" and "observability" keep their own identities.
 */
function wordStem(word: string): string {
  let w = word;
  for (const suffix of MODIFIER_SUFFIXES) {
    if (w.endsWith(`-${suffix}`)) w = w.slice(0, -(suffix.length + 1));
  }
  if (w.length > 5 && w.endsWith("iness")) w = `${w.slice(0, -5)}y`;
  else if (w.length > 5 && w.endsWith("ness")) w = w.slice(0, -4);
  if (w.length > 6 && w.endsWith("ship")) w = w.slice(0, -4);
  if (w.length > 4 && w.endsWith("er")) w = w.slice(0, -2);
  return w;
}

function variantStem(term: string): string {
  const words = term
    .toLowerCase()
    .replace(/[^a-z0-9+#./\- ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !VARIANT_QUALIFIERS.has(w))
    .map(wordStem);
  while (words.length > 1 && GENERIC_TAILS.has(words[words.length - 1])) words.pop();
  const stem = words.join(" ");
  // Never collapse a term to nothing, and never merge single words that mean
  // different things ("reliability" keeps its own stem).
  return stem || term.toLowerCase().trim();
}

/**
 * One entry per requirement. Qualifier and phrasing variants collapse onto the
 * canonical form, so a posting saying "payroll", "global payroll" and "payroll
 * management" contributes one requirement rather than three.
 */
// Duplicate PHRASINGS collapse here; a distinct requirement is never cut for
// sitting past a cap, so the default ceiling is generous rather than tight.
export function collapseRequirements(terms: string[], max = 60): { terms: string[]; removed: string[] } {

  const removed: string[] = [];
  const byStem = new Map<string, string>();
  for (const raw of terms) {
    const term = (raw || "").trim();
    if (!term) continue;
    const aliased = REQUIREMENT_ALIASES[term.toLowerCase()] ?? term;
    const stem = variantStem(aliased);
    const held = byStem.get(stem);
    if (!held) {
      byStem.set(stem, aliased);
      continue;
    }
    // Prefer the canonical (shortest, least-qualified) wording.
    const keep = aliased.length < held.length ? aliased : held;
    const drop = keep === held ? aliased : held;
    byStem.set(stem, keep);
    removed.push(drop);
  }
  const kept = Array.from(byStem.values());
  if (kept.length > max) removed.push(...kept.slice(max));
  return { terms: kept.slice(0, max), removed };
}

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
// Shorthand a posting actually uses ("Postgres", "K8s") is NOT rewritten to its
// long form here. The extension pairs the posting's own string against the CV,
// so normalising it away silently loses the match it was built to win.
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
  "infrastructure as code": "Infrastructure as Code",
  "mongodb": "MongoDB", "eks": "EKS", "argocd": "ArgoCD", "pyspark": "PySpark",
  "pytest": "pytest", "presto": "Presto", "nltk": "NLTK", "mlflow": "MLflow",
  "xgboost": "XGBoost", "shap": "SHAP", "ifrs 9": "IFRS 9", "aml": "AML",
  "hipaa": "HIPAA", "iso 27001": "ISO 27001", "rbac": "RBAC", "llm": "LLM", "llms": "LLMs",
  "js": "JS", "ts": "TS", "tensorflow.js": "TensorFlow.js",
  // CASE-LOCKED ACRONYMS. An ATS keyword screen is case-sensitive for these, so
  // no lowercasing or title-casing pass may touch them. "IT" must never become
  // "it", and "P&L", "C#" and "C++" keep their punctuation.
  "ai": "AI", "ml": "ML", "xml": "XML", "yaml": "YAML", "ecs": "ECS",
  "rds": "RDS", "sre": "SRE", "slo": "SLO", "slos": "SLOs", "sla": "SLA",
  "slas": "SLAs", "qa": "QA", "ux": "UX", "ui": "UI", "sap": "SAP",
  "hris": "HRIS", "kyc": "KYC", "gtm": "GTM", "okr": "OKR", "okrs": "OKRs",
  "p&l": "P&L", "str": "STR", "sop": "SOP", "sops": "SOPs", "adp": "ADP",
  "php": "PHP", "c": "C", "r": "R", "it": "IT",
};


/** Single-letter names that really are skills. */
const SINGLE_LETTER_SKILLS = new Set(["c", "r"]);

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

    // Sentences lifted out of the posting are reduced to the skill they name,
    // or dropped. "Kubernetes is a plus" is Kubernetes; "experience at a
    // competitor" is nothing at all.
    if (isLiftedProse(term) || PROSE_SALVAGE[term.toLowerCase().trim()]) {
      const salvaged = salvageRequirement(term);
      if (!salvaged) { removed.push(term); continue; }
      if (salvaged.toLowerCase() !== term.toLowerCase()) removed.push(term);
      term = salvaged;
    }

    const key = term.toLowerCase();
    // Restore the spelling a human would write before the term is reported or
    // written into a document.
    term = CANONICAL_CASE[key] ?? term;
    if (seen.has(key)) continue;

    // "C" and "R" are languages an ATS screens on, so the minimum-length rule
    // has to spare them.
    if (key.length < 2 && !SINGLE_LETTER_SKILLS.has(key)) { removed.push(term); continue; }

    if (BOILERPLATE.has(key)) { removed.push(term); continue; }
    // Benefits, logistics and application boilerplate are not requirements.
    if (isFurniture(key)) { removed.push(term); continue; }
    // An output, a quality or a mood is not a skill: "custom reports" and
    // "independence" can only ever show as a permanent miss.
    if (isGenericOutcome(key)) { removed.push(term); continue; }
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

  // One entry per requirement, capped so the denominator stays honest.
  const collapsed = collapseRequirements(deduped);
  removed.push(...collapsed.removed);
  return { terms: collapsed.terms, removed };
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

// ============================================================
// GENERIC OUTPUT AND CULTURE WORDING IS NOT A REQUIREMENT
//
// "data-driven recommendations", "custom reports", "ad-hoc data analysis",
// "complex data sets", "independence", "warmth": none of these appears in a
// skills section, so none can ever match. The skill is what is wanted
// ("Forecasting", "Data Analysis"), never the deliverable the posting named or
// the temperament its culture paragraph advertised.
// ============================================================

/** Exact phrases that name an output, a quality or a mood, never a skill. */
const GENERIC_OUTCOMES = new Set([
  "recommendations", "recommendation", "data-driven recommendations",
  "reports", "custom reports", "regular reports", "reporting requests",
  "analysis", "analyses", "ad-hoc analysis", "ad hoc analysis",
  "ad-hoc data analysis", "ad hoc data analysis", "ad-hoc requests",
  "data sets", "datasets", "data set", "complex data sets", "complex datasets",
  "large data sets", "large datasets", "insights", "actionable insights",
  "deliverables", "results", "outcomes", "impact", "tasks", "daily tasks",
  "day-to-day tasks", "duties", "responsibilities", "projects",
  "independence", "autonomy", "warmth", "humility", "positivity", "enthusiasm",
  "passion", "curiosity", "grit", "hustle", "fun", "kindness", "empathy",
  "sales performance", "business performance", "high standards",
  "attention", "initiative", "self-starter", "self starter", "go-getter",
  "go the extra mile", "extra mile", "team player", "can-do attitude",
  "hard work", "work ethic", "flexibility", "adaptability", "resilience",
]);

/** Qualifier + generic head noun: "custom reports", "complex data sets". */
const OUTCOME_QUALIFIER =
  /^(?:complex|ad-hoc|ad hoc|custom|bespoke|various|multiple|large|high-quality|high quality|detailed|data-driven|regular|day-to-day)\s+/;
const OUTCOME_HEAD =
  /^(?:reports?|reporting|analysis|analyses|data ?sets?|recommendations?|insights?|requests?|tasks?|projects?|deliverables?|dashboards?|spreadsheets?|documents?|files?|problems?|questions?)$/;

/**
 * True when the string names an output, a quality or a mood rather than a skill.
 * The test the user set: would this string appear in a skills section?
 */
export function isGenericOutcome(term: string): boolean {
  const key = (term || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/[.,;]+$/, "");
  if (!key) return true;
  if (NAMED_SKILLS.has(key)) return false;
  if (GENERIC_OUTCOMES.has(key)) return true;
  const stripped = key.replace(OUTCOME_QUALIFIER, "").trim();
  if (stripped !== key && OUTCOME_HEAD.test(stripped)) return true;
  // "Onboarding" is never bare: IT, employee and customer onboarding are three
  // different requirements, and a bare chip cannot be matched to any of them.
  if (key === "onboarding" || key === "on-boarding") return true;
  return false;
}

// ============================================================
// ONLY SECTIONS THAT STATE REQUIREMENTS ARE READ
//
// "Benefits Administration" reached a CV from an employee benefits list,
// "Training" from a training budget, "Mentorship" from a mentorship programme,
// "Ownership" from equity. A statement in the benefits section is a promise to
// the employee, however skill-shaped its words are, so those sections are
// removed BEFORE the model ever sees the posting.
// ============================================================

const NON_REQUIREMENT_HEADING =
  /(benefit|perks?|compensation|salary|remuneration|equity|stock|pension|what (?:we|you'll) (?:offer|get)|why (?:join|work)|about (?:us|the (?:company|role|team)|our)|who we are|our (?:story|values|culture|mission|team|people)|values|culture|diversity|inclusion|belonging|equal (?:employment )?opportunity|eeo|e-verify|legal|privacy|data protection|gdpr|accommodation|disability|how to apply|application (?:process|instructions)|hiring process|interview process|next steps|life at|our offer|package)/i;

const REQUIREMENT_HEADING =
  /(requirement|qualification|skills?|experience|responsibilit|duties|what you'?ll do|what you'?ll bring|what we'?re looking for|about you|you (?:will|should) have|must have|nice to have|the role|role overview|day to day|day-to-day|tech stack|technologies)/i;

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (t.endsWith(":")) return true;
  if (/[.!?]$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 8) return false;
  return t === t.toUpperCase() || /^[A-Z]/.test(t);
}

/**
 * Removes benefits, perks, compensation, company description, values and
 * culture, legal/EEO, privacy and application-instruction sections. A section
 * whose heading names requirements is always kept, and prose with no headings
 * at all is returned untouched rather than silently emptied.
 */
export function stripNonRequirementSections(
  jobDescription: string,
): { text: string; removedSections: string[] } {
  const lines = (jobDescription || "").split(/\r?\n/);
  const kept: string[] = [];
  const removedSections: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (looksLikeHeading(line)) {
      const heading = line.trim();
      if (REQUIREMENT_HEADING.test(heading)) skipping = false;
      else if (NON_REQUIREMENT_HEADING.test(heading)) {
        skipping = true;
        removedSections.push(heading.replace(/:$/, ""));
        continue;
      } else skipping = false;
    }
    if (!skipping) kept.push(line);
  }

  const text = kept.join("\n").trim();
  // Never hand the model an empty posting because the headings were unusual.
  if (text.length < Math.min(400, (jobDescription || "").trim().length * 0.3)) {
    return { text: (jobDescription || "").trim(), removedSections: [] };
  }
  return { text, removedSections };
}
