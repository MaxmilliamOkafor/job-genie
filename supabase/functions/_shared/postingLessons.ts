// LESSONS FROM A STRIPE APPLICATION IN DUBLIN (12 Nov extension brief, H).
//
// Pure, idempotent helpers. The tailoring function runs them on the finished
// CV and letter, after the earlier final rules and before monetary exclusion.
// Each one only removes, rewords or moves what the document already says; the
// only sentence ever added is the language line, built from the CV's own
// Languages entry.

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const splitSentences = (s: string) => String(s || "").split(/(?<=[.!?])\s+(?=[A-Z"(])/).filter((x) => x.trim());

// ── A requirement is never a bullet's verb ─────────────────────────────
const IRREGULAR_PAST: Record<string, string> = {
  lead: "Led", build: "Built", run: "Ran", write: "Wrote", drive: "Drove", make: "Made", take: "Took", set: "Set",
  cut: "Cut", put: "Put", bring: "Brought", buy: "Bought", sell: "Sold", teach: "Taught", win: "Won", grow: "Grew",
  hold: "Held", keep: "Kept", send: "Sent", spend: "Spent", meet: "Met", find: "Found", give: "Gave", begin: "Began",
  choose: "Chose", deal: "Dealt", rewrite: "Rewrote", rebuild: "Rebuilt", oversee: "Oversaw", undertake: "Undertook",
};

/** "architecting" -> "Architected", "leading" -> "Led", "applying" -> "Applied". */
export function graftPast(gerund: string): string {
  const stem = String(gerund || "").toLowerCase().replace(/ing$/, "");
  for (const base of [stem, stem + "e", stem.replace(/(.)\1$/, "$1")]) if (IRREGULAR_PAST[base]) return IRREGULAR_PAST[base];
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  if (/[^aeiou]y$/.test(stem)) return cap(stem.slice(0, -1)) + "ied";
  return cap(stem) + (/e$/.test(stem) ? "d" : "ed");
}

const GRAFT = /^(?:Understood|Demonstrated|Showed|Showcased|Exhibited|Displayed|Possessed|Proved|Evidenced|Applied (?:an? |my )?(?:ability|understanding|knowledge)|Leveraged (?:an? |my )?(?:ability|understanding|knowledge|expertise))\b[^,;.]{0,90}?\bby ([a-z]{3,}ing)\b\s*/;
const LETTER_GRAFT = /\b(I(?: also)?) (?:understood|demonstrated|showed|showcased|exhibited|displayed|possessed|proved)\b[^,;.]{0,90}?\bby ([a-z]{3,}ing)\b/g;

/** True when a bullet or sentence opens on the posting's ability with the work demoted to "by ...ing". */
export function hasGraftedAbility(text: string): boolean {
  const t = String(text || "");
  return t.split("\n").some((l) => GRAFT.test(l.replace(/^\s*(?:[•●▪◦‣∙·*]|-)\s+/, "")))
    || splitSentences(t).some((s) => GRAFT.test(s.trim()))
    || new RegExp(LETTER_GRAFT.source).test(t);
}

// ── A bracketed word goes only where a phrase ends ─────────────────────
const MID_PHRASE = (rest: string) => /^\s+[A-Za-z]/.test(rest)
  && !/^\s+(?:in|on|for|with|and|or|but|by|to|across|from|at|of|that|which|who|so|while|within|into|using|via|through|after|before|during|over|under|as|then|than|cutting|reducing|saving|leading)\b/i.test(rest);

/** "cutting annual (operational efficiency) infrastructure cost" -> "cutting annual infrastructure cost". */
export function strayGloss(s: string): string {
  return String(s || "").replace(/(^|[^\w-])([a-z][a-z-]*) \(([a-z][a-z /-]{3,40})\)(?=( [A-Za-z][\s\S]*)$)/g,
    (m0, pre: string, w: string, _g: string, rest: string) => (MID_PHRASE(rest) ? pre + w : m0));
}

/** The work leads the bullet, in the past tense; the posting's ability phrase goes. */
export function noGraftedAbility(body: string): string {
  const b = strayGloss(body);
  const m = GRAFT.exec(b);
  if (!m) return b;
  return graftPast(m[1]) + " " + b.slice(m[0].length);
}

/** "I also understood complex technical ecosystems by architecting..." -> "I also architected...". */
export function letterGraftOut(line: string): string {
  return strayGloss(line).replace(LETTER_GRAFT, (_m0, who: string, ger: string) => who + " " + graftPast(ger).toLowerCase());
}

// ── Page titles, cities and right to work ──────────────────────────────

/** "Job Application for <role> at <Company>" gives the role and the company. */
export function unwrapPageTitle(title: string): { title: string; company: string } {
  const t = String(title || "");
  const m = /^\s*(?:job\s+)?application\s+for\s+(?:the\s+)?(.+?)(?:\s+at\s+(.+?))?(?:\s+[|–—-]\s+.*)?\s*$/i.exec(t);
  if (!m || !m[1]) return { title: t.trim(), company: "" };
  return { title: m[1].trim(), company: (m[2] || "").trim() };
}

/** "Job Application for" is never part of the role, the letter or a file name. */
export const dropPageTitleWrapper = (text: string) => String(text || "").replace(/\b(?:the )?Job Application for (?:the )?/gi, (m) => (/^the /i.test(m) ? "the " : ""));

/** Never "Relocating to <city>" or "happy to relocate to <city>" when the candidate already lives there. */
export function noHomeRelocation(text: string, homeCity: string): string {
  const city = String(homeCity || "").split(",")[0].trim();
  if (!city) return text;
  const c = esc(city);
  return String(text || "")
    .replace(new RegExp(`\\s*[|·•]\\s*Relocating to ${c}\\b[^|\\n]*?(?=\\s*[|·•]|\\s*\\n|\\s*$)`, "gi"), "")
    .replace(new RegExp(`^\\s*Relocating to ${c}\\b[^|\\n]*(?:\\s*[|·•]\\s*)?`, "gim"), "")
    .replace(new RegExp(`\\s*(?:I am|I'm|and am) (?:happy|willing|open|ready) to (?:relocate|move) to ${c}\\b[^.\\n]*\\.`, "gi"), "");
}

/** Never "US work authorised" for a job outside the US. Unknown country: unchanged. */
export function noForeignUsAuthorisation(text: string, jobCountryName: string | null): string {
  if (!jobCountryName || jobCountryName === "united states") return text;
  const US = "(?:US|U\\.S\\.|USA|United States)";
  return String(text || "")
    .replace(new RegExp(`\\s*[|·•]\\s*${US} [Ww]ork [Aa]uthori[sz]ed\\b[^|\\n]*?(?=\\s*[|·•]|\\s*\\n|\\s*$)`, "g"), "")
    .replace(new RegExp(`^\\s*${US} [Ww]ork [Aa]uthori[sz]ed\\b[^|\\n]*(?:\\s*[|·•]\\s*)?`, "gm"), "")
    .replace(new RegExp(`\\s*[^.\\n]*\\b(?:${US} [Ww]ork [Aa]uthori[sz]ed|[Aa]uthori[sz]ed to work in (?:the )?${US})\\b[^.\\n]*\\.`, "g"), "");
}

// ── The Skills lines ───────────────────────────────────────────────────

/** Products named like ordinary words: on the CV only when the saved profile shows the candidate used them. */
export const WORD_NAMED_TOOL = /^(?:segment|heap|mode|linear|monday|notion|front|basecamp|loom|pitch|close|gong|outreach|clay)$/i;
export const SKILL_FRAGMENT: Record<string, string> = {
  "cross functional": "Cross-functional Collaboration",
  "cross-functional": "Cross-functional Collaboration",
  "analytical ability": "Analytical Skills",
  "analytical abilities": "Analytical Skills",
  "communication ability": "Communication",
  "problem solving ability": "Problem Solving",
};
const LANG_LINE = /^(\s*(?:Spoken\s+)?Languages?(?:\s*(?:&|and)\s*Citizenship)?\s*:\s*)(.+)$/i;

/** "German (advanced), German" -> "German (advanced)": one entry per language, the one with the level kept. */
export function oneEntryPerLanguage(cv: string): string {
  const lines = String(cv || "").split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const m = LANG_LINE.exec(lines[i]);
    if (!m) continue;
    const tail = /\s+-\s+([^,()]+)$/.exec(m[2]);
    const body = tail ? m[2].slice(0, tail.index) : m[2];
    const items = body.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
    const seen = new Map<string, string>();
    for (const x of items) {
      const bare = x.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
      const had = seen.get(bare);
      if (had === undefined || (/\(/.test(x) && !/\(/.test(had))) seen.set(bare, x);
    }
    const one = [...seen.values()];
    if (one.length === items.length) continue;
    lines[i] = m[1] + one.join(", ") + (tail ? ` - ${tail[1].trim()}` : "");
    changed = true;
  }
  return changed ? lines.join("\n") : cv;
}

const SKILLS_HEAD = /^(?:TECHNICAL SKILLS|SKILLS|CORE SKILLS|KEY SKILLS|TECHNICAL PROFICIENCIES)$/i;
const HEAD_LINE = /^[A-Z][A-Z &/]{3,}$/;

/** Word-named products the profile never shows come out of Skills; half-phrases read as a person lists them. */
export function skillsReadRight(cv: string, profileText: string): { cv: string; notes: string[] } {
  const lines = String(cv || "").split("\n");
  const notes: string[] = [];
  const shown = (term: string) => new RegExp(`(?<![\\w])${esc(term)}(?![\\w])`).test(String(profileText || ""));
  let inSkills = false;
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (SKILLS_HEAD.test(t)) { inSkills = true; continue; }
    if (HEAD_LINE.test(t)) { inSkills = false; continue; }
    if (!inSkills || LANG_LINE.test(lines[i])) continue;
    const m = /^(\s*[^:]{2,40}:\s*)(.+)$/.exec(lines[i]);
    if (!m) continue;
    const items = m[2].split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
    const out: string[] = [];
    for (const x0 of items) {
      const term = x0.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (WORD_NAMED_TOOL.test(term) && !shown(term)) { notes.push(`removed ${term}, not shown in the profile`); continue; }
      const x = SKILL_FRAGMENT[x0.toLowerCase()] || x0;
      if (x !== x0) notes.push(`${x0} written as ${x}`);
      if (out.some((y) => y.toLowerCase() === x.toLowerCase()) || (x !== x0 && items.some((y) => y !== x0 && y.toLowerCase() === x.toLowerCase()))) continue;
      out.push(x);
    }
    if (out.join(", ") === items.join(", ")) continue;
    lines[i] = out.length ? m[1] + out.join(", ") : "\u0000";
    changed = true;
  }
  return { cv: changed ? lines.filter((l) => l !== "\u0000").join("\n") : cv, notes };
}

// ── The letter ─────────────────────────────────────────────────────────

/** A term the posting states in words; a hyphen joins, so "pre-sales" is not "sales". */
export function postingSays(term: string, posting: string): boolean {
  const t = String(term || "").trim();
  if (!t) return false;
  return new RegExp(`(?:^|[^\\w-])${esc(t)}(?![\\w-])`, "i").test(String(posting || ""));
}

/** "The X role at Y asks for A, and I have done it." names only needs the posting states. */
export function needsFromTheAd(letter: string, posting: string): string {
  if (!posting) return letter;
  return String(letter || "").replace(/(^|\n)(\s*)The (.+? (?:role|position)(?: at [^.,\n]+)?) asks for (.+?), and I have done (?:it|both)\./g,
    (m0, nl: string, sp: string, role: string, needs: string) =>
      needs.split(/,\s*|\s+and\s+/).every((x) => postingSays(x.trim(), posting)) ? m0 : `${nl}${sp}I am applying for the ${role.replace(/^the /i, "")}.`);
}

/** Two sentences in a row never both open "At <employer>,": the second says "Also at <employer>,". */
export function noRepeatedOpeners(lines: string[]): string[] {
  let last = "";
  return lines.map((l) => {
    if (!l.trim()) return l;
    return splitSentences(l).map((s) => {
      const m = /^(\s*)At ([A-Z][\w&.' -]{1,40}),\s/.exec(s);
      if (!m) { last = ""; return s; }
      if (m[2] === last) return s.replace(/^(\s*)At /, "$1Also at ");
      last = m[2];
      return s;
    }).join(" ");
  });
}

const SIGNOFF = /^(?:Kind regards|Sincerely|Yours|Best regards|Best wishes|Regards)\b/i;

/** The sentence the letter adds for a language the posting asks for, or "" when none is due. */
export function languageLine(letterBody: string, posting: string, cv: string): string {
  const row = (String(cv || "").split("\n").map((l) => LANG_LINE.exec(l)).find(Boolean) || [])[2] || "";
  if (!row || !posting) return "";
  const list = row.replace(/\s+-\s+[^,()]+$/, "");
  const body = String(letterBody || "").replace(/\([^)]*\)/g, " ");
  for (const item of list.split(/\s*,\s*/)) {
    const m = /^([A-Z][a-z]+)(?:\s*\(([^)]+)\))?$/.exec(item.trim());
    if (!m || m[1] === "English") continue;
    const lang = m[1];
    const asks = new RegExp(`\\b${lang}\\b[^.\\n]{0,40}\\b(?:fluen|proficien|speak|spoken|written|language|native)|\\b(?:fluen|proficien|speak)\\w*\\b[^.\\n]{0,40}\\b${lang}\\b`, "i");
    if (!asks.test(posting) || new RegExp(`\\b${lang}\\b`, "i").test(body)) continue;
    const level = (m[2] || "").trim().toLowerCase();
    if (level === "fluent" || level === "native" || level === "bilingual") return `I speak ${lang} fluently.`;
    if (level) return `I speak ${lang} at ${/^[aeiou]/.test(level) ? "an" : "a"} ${level} level.`;
    return `I speak ${lang}.`;
  }
  return "";
}

/** Says the language once, at the CV's level, before the closing line. */
export function languageTheAdAsks(letter: string, posting: string, cv: string): string {
  const lines = String(letter || "").split("\n");
  const dear = lines.findIndex((l) => /^\s*(?:dear|hello|hi)\b/i.test(l));
  if (dear === -1) return letter;
  let end = lines.findIndex((l, i) => i > dear && SIGNOFF.test(l.trim()));
  if (end === -1) end = lines.length;
  const line = languageLine(lines.slice(dear + 1, end).join(" "), posting, cv);
  if (!line) return letter;
  let at = -1;
  for (let i = end - 1; i > dear; i--) if (lines[i].trim()) { at = i; break; }
  if (at === -1) return letter;
  const sents = splitSentences(lines[at]);
  const close = sents.findIndex((s) => /\b(?:available|happy to talk|call|speak with|discuss)\b/i.test(s) || /^Thank you\b/i.test(s));
  if (close === -1) sents.push(line); else sents.splice(close, 0, line);
  const next = lines.slice();
  next[at] = sents.join(" ");
  return next.join("\n");
}
