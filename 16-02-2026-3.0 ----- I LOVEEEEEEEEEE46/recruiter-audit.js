/**
 * Job Genie - Recruiter Audit (post-process pass)
 *
 * Runs after CV + cover letter are generated. Five recruiter-grade checks
 * derived from 40-years-of-hiring patterns: strip auto-gen noise, ensure
 * quantification, mirror exact JD vocabulary, echo the JD job title in the
 * scan zone, and verify the first-six-seconds layout of the CV.
 *
 * Pure text utility, no DOM, no network, target <50ms total.  Every check
 * is opt-out via flags so callers can disable any single behaviour.
 */
(function (global) {
  'use strict';

  // ===================================================================
  // v2 — FILLER WORD STRIP
  // -------------------------------------------------------------------
  // Single adverbs that add zero information ("very", "really", "just",
  // "basically", "actually"...).  Safe to remove because dropping an
  // adverb leaves a grammatical sentence.  We DO NOT touch them inside
  // proper nouns or quoted strings.
  // ===================================================================

  const FILLER_WORDS = [
    'very', 'really', 'just', 'basically', 'actually', 'literally',
    'essentially', 'absolutely', 'totally', 'simply', 'honestly',
    'definitely', 'certainly', 'obviously', 'clearly', 'quite',
    // NOTE: 'rather' deliberately excluded -- it is load-bearing in
    // "rather than X" constructions used by the cover-letter templates.
    'somewhat', 'arguably',
  ];

  function stripFillers(text) {
    if (!text || typeof text !== 'string') return { text: text || '', removed: 0 };
    let out = text;
    let removed = 0;
    for (const w of FILLER_WORDS) {
      const re = new RegExp(`\\b${w}\\b\\s*`, 'gi');
      const before = out;
      out = out.replace(re, '');
      if (out !== before) removed++;
    }
    out = out
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([.,;:])/g, '$1')
      .replace(/[ \t]+$/gm, '');
    // Re-capitalise: start of any bullet, and start of any sentence after
    // a sentence-end punctuation (filler removal at sentence-start lower-
    // cases the next word otherwise).
    out = out
      .replace(/(^|\n)([\-*•]|\d+\.)\s+([a-z])/g, (_, lf, b, c) => `${lf}${b} ${c.toUpperCase()}`)
      .replace(/([.!?]\s+)([a-z])/g, (_, p, c) => `${p}${c.toUpperCase()}`);
    return { text: out, removed };
  }

  // ===================================================================
  // v2 — WEAK-VERB FLAG ("Responsible for", "Helped with", "Assisted")
  // -------------------------------------------------------------------
  // These verbs describe presence, not impact.  Recruiters discount any
  // bullet that opens with one.  Surfaced as warnings (not auto-rewritten
  // because the right replacement requires real domain knowledge).
  // ===================================================================

  const WEAK_BULLET_OPENERS = [
    'responsible for', 'helped', 'helped with', 'helped to', 'assisted',
    'assisted with', 'worked on', 'worked with', 'participated in',
    'involved in', 'contributed to', 'in charge of', 'tasked with',
    'duties included', 'role involved', 'responsibilities included',
  ];

  function weakVerbAudit(text) {
    if (!text) return { weak: [] };
    const weak = [];
    const lines = text.split('\n');
    for (const raw of lines) {
      const line = raw.trim().replace(/^([\-*•]|\d+\.)\s+/, '');
      if (!line) continue;
      const lower = line.toLowerCase();
      for (const opener of WEAK_BULLET_OPENERS) {
        if (lower.startsWith(opener)) {
          weak.push({ opener, sample: line.slice(0, 110) });
          break;
        }
      }
      if (weak.length >= 8) break;
    }
    return { weak };
  }

  // ===================================================================
  // v2 — ACTION-VERB BULLET CHECK
  // -------------------------------------------------------------------
  // Bullets that lead with a strong past-tense action verb skim well.
  // Bullets that open with anything else (article, pronoun, gerund,
  // weak verb) get flagged.  Pure warning — no auto-rewrite.
  // ===================================================================

  const STRONG_ACTION_VERBS = new Set([
    'built', 'shipped', 'designed', 'launched', 'deployed', 'scaled', 'led',
    'managed', 'drove', 'delivered', 'owned', 'created', 'developed', 'engineered',
    'architected', 'rebuilt', 'reduced', 'increased', 'grew', 'doubled', 'tripled',
    'cut', 'saved', 'generated', 'closed', 'won', 'shipped', 'launched', 'mentored',
    'hired', 'rolled', 'migrated', 'consolidated', 'modernised', 'modernized',
    'automated', 'instrumented', 'productionised', 'productionized', 'open-sourced',
    'authored', 'published', 'presented', 'negotiated', 'partnered', 'enabled',
    'unblocked', 'fixed', 'optimised', 'optimized', 'restructured', 'refactored',
    'translated', 'consulted', 'advised',
  ]);

  function actionVerbAudit(text) {
    if (!text) return { weakOpeners: [] };
    const weakOpeners = [];
    const lines = text.split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!/^([\-*•]|\d+\.)\s+/.test(line)) continue;
      const stripped = line.replace(/^([\-*•]|\d+\.)\s+/, '').trim();
      const firstWord = stripped.split(/\s+/)[0]?.toLowerCase().replace(/[.,;:]$/, '');
      if (!firstWord) continue;
      if (STRONG_ACTION_VERBS.has(firstWord)) continue;
      // Allow numbers / metrics openers ("$2M saved...", "30% reduction...")
      if (/^[\$\d]/.test(firstWord)) continue;
      weakOpeners.push({ firstWord, sample: stripped.slice(0, 110) });
      if (weakOpeners.length >= 8) break;
    }
    return { weakOpeners };
  }

  // ===================================================================
  // v2 — COVER LETTER LENGTH + PRONOUN BALANCE
  // -------------------------------------------------------------------
  // Recruiter rule of thumb: cover letter <= 350 words, opener mentions
  // company/role more than self.  Auto-flag (not auto-trim) because
  // shortening risks losing important content.
  // ===================================================================

  function coverLetterHealth(coverText) {
    if (!coverText) return { wordCount: 0, tooLong: false, iCount: 0, youCount: 0, selfHeavy: false };
    const wordCount = coverText.split(/\s+/).filter(Boolean).length;
    const iCount = (coverText.match(/\bI\b/g) || []).length;
    const youCount = (coverText.match(/\b(you|your|we|our)\b/gi) || []).length;
    return {
      wordCount,
      tooLong: wordCount > 350,
      iCount,
      youCount,
      selfHeavy: iCount > 0 && youCount > 0 && iCount / (iCount + youCount) > 0.65,
    };
  }

  // ===================================================================
  // 1. BUZZWORD PURGE
  // -------------------------------------------------------------------
  // Only multi-word adjective phrases get auto-removed -- these almost
  // always sit as standalone modifiers ("a results-driven engineer who...")
  // so removal leaves clean English.  Verb-phrase noise ("I leverage...",
  // "I am passionate about...") is too risky to auto-rewrite and is
  // surfaced as a warning instead.
  // ===================================================================

  const BUZZWORD_PHRASE_REPLACEMENTS = [
    [/\bresults[- ]driven\b/gi, ''],
    [/\bresults[- ]oriented\b/gi, ''],
    [/\bgoal[- ]oriented\b/gi, ''],
    [/\bdetail[- ]oriented\b/gi, 'thorough'],
    [/\bteam[- ]oriented\b/gi, ''],
    [/\bbest[- ]in[- ]class\b/gi, ''],
    [/\bworld[- ]class\b/gi, ''],
    [/\bcutting[- ]edge\b/gi, ''],
    [/\bbleeding[- ]edge\b/gi, ''],
    [/\bnext[- ]generation\b/gi, ''],
    [/\bgame[- ]changing\b/gi, ''],
    [/\bvalue[- ]add(ed)?\b/gi, ''],
    [/\bproven track record\b/gi, 'record'],
    [/\bextensive experience\b/gi, 'experience'],
    [/\bsubject matter expert\b/gi, 'expert'],
    [/\b(strong|excellent|great|outstanding) (communication|interpersonal) skills\b/gi, ''],
  ];

  // Risky phrases that warp a sentence if removed -- flag, don't fix.
  const BUZZWORD_PHRASE_FLAGS = [
    /\bI am (a |an )?(highly )?passionate\b/i,
    /\bpassionate about\b/i,
    /\bteam player\b/i,
    /\bhit the ground running\b/i,
    /\bthink outside the box\b/i,
    /\bgo[- ]getter\b/i,
    /\bself[- ]starter\b/i,
    /\bmove the needle\b/i,
    /\bgame[- ]changer\b/i,
    /\bthought leader(ship)?\b/i,
  ];

  // Single words that are problematic but cannot be safely auto-removed
  // (removing them mid-sentence breaks grammar).  These are reported as
  // warnings so the user can rewrite manually.
  const BUZZWORD_FLAGS = [
    'passionate', 'dynamic', 'synergy', 'synergies', 'leverage', 'leveraging',
    'leveraged', 'utilize', 'utilise', 'utilized', 'utilised', 'proactive',
    'proactively', 'rockstar', 'ninja', 'guru', 'evangelist', 'disruptive',
    'visionary',
  ];

  function purgeBuzzwords(text) {
    if (!text || typeof text !== 'string') return { text: text || '', removed: 0, flagged: [] };
    let out = text;
    let removed = 0;
    for (const [re, repl] of BUZZWORD_PHRASE_REPLACEMENTS) {
      const before = out;
      out = out.replace(re, repl);
      if (out !== before) removed++;
    }
    // Tidy: collapse extra inline spaces (PRESERVE newlines), drop
    // orphan commas, drop orphan prepositions left dangling by phrase
    // removal ("with ." -> ".", "and ." -> "."), drop empty parens.
    out = out
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*(and|but|or)\s+/gi, ' $1 ')
      .replace(/\b(with|and|or|of|in|on|to|for|by)\s+([.,;:])/gi, '$2')
      .replace(/^\s*,\s*/gm, '')
      .replace(/[ \t]+([.,;:])/g, '$1')
      .replace(/\(\s*\)/g, '')
      .replace(/[ \t]+$/gm, '');

    // Human-readable phrase labels for the warning report.
    const PHRASE_LABELS = [
      'I am passionate', 'passionate about', 'team player', 'hit the ground running',
      'think outside the box', 'go-getter', 'self-starter', 'move the needle',
      'game-changer', 'thought leadership',
    ];
    const lower = out.toLowerCase();
    const flagged = [
      ...BUZZWORD_FLAGS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower)),
      ...PHRASE_LABELS.filter((p) => lower.includes(p.toLowerCase().replace(/-/g, '[- ]?'))),
    ];
    return { text: out, removed, flagged };
  }

  // ===================================================================
  // 2. QUANTIFICATION AUDIT
  // -------------------------------------------------------------------
  // Scan bullet lines (start with - * • or digit-then-dot) and flag any
  // that have no number/percentage/scale word.  We do NOT auto-invent
  // metrics -- inventing is the worst possible failure mode.  We surface
  // the unquantified bullets so the popup can show the user the gap.
  // ===================================================================

  const SCALE_WORDS = /\b(\d|million|billion|thousand|k\b|m\b|x\b|x\d+|first|only|sole|all|every)\b|%/i;

  function quantificationAudit(text) {
    if (!text || typeof text !== 'string') return { unquantified: [], total: 0 };
    const lines = text.split('\n');
    const unquantified = [];
    let total = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!/^([\-*•]|\d+\.)\s+/.test(line)) continue;
      total++;
      if (line.length < 25) continue;        // headers / short labels are fine
      if (SCALE_WORDS.test(line)) continue;
      unquantified.push(line.replace(/^([\-*•]|\d+\.)\s+/, '').slice(0, 120));
    }
    return {
      unquantified,
      total,
      ratio: total === 0 ? 1 : (total - unquantified.length) / total,
    };
  }

  // ===================================================================
  // 3. JD VOCABULARY MIRROR
  // -------------------------------------------------------------------
  // When the JD uses a specific term and the CV uses a synonym, swap the
  // CV term to the exact JD wording. Recruiters and ATS keyword scans
  // both reward exact-string matches.  We only swap when the candidate
  // has the adjacent skill (i.e. the synonym is already in the CV) --
  // never invent a skill that isn't there.
  // ===================================================================

  const SYNONYM_GROUPS = [
    ['rag pipeline', 'rag pipelines', 'retrieval pipeline', 'retrieval workflow', 'retrieval workflows'],
    ['llm', 'large language model', 'large language models', 'llms'],
    ['ml', 'machine learning'],
    ['ci/cd', 'ci cd', 'continuous integration', 'continuous deployment'],
    ['kubernetes', 'k8s'],
    ['aws', 'amazon web services'],
    ['gcp', 'google cloud', 'google cloud platform'],
    ['azure', 'microsoft azure'],
    ['rest api', 'rest apis', 'restful api', 'restful apis', 'rest endpoint', 'rest endpoints'],
    ['graphql', 'graph ql'],
    ['grpc', 'g rpc'],
    ['postgres', 'postgresql'],
    ['typescript', 'ts '],
    ['javascript', 'js '],
    ['react.js', 'react', 'reactjs'],
    ['next.js', 'nextjs', 'next js'],
    ['node.js', 'nodejs', 'node js'],
    ['frontend', 'front end', 'front-end'],
    ['backend', 'back end', 'back-end'],
    ['fullstack', 'full stack', 'full-stack'],
    ['devops', 'dev ops'],
    ['mlops', 'ml ops'],
    ['llmops', 'llm ops'],
    ['stakeholder management', 'stakeholder engagement', 'managing stakeholders'],
    ['user research', 'user interviews', 'customer research'],
    ['product discovery', 'discovery work'],
    ['a/b test', 'ab test', 'split test'],
    ['observability', 'observable', 'observable systems', 'monitoring and tracing'],
  ];

  function _findCanonicalForJd(jdLower, group) {
    for (const term of group) {
      if (jdLower.includes(term)) return term;
    }
    return null;
  }

  function mirrorJdVocabulary(cvText, jdText) {
    if (!cvText || !jdText) return { text: cvText || '', swaps: 0 };
    const jdLower = jdText.toLowerCase();
    let out = cvText;
    let swaps = 0;
    for (const group of SYNONYM_GROUPS) {
      const canonical = _findCanonicalForJd(jdLower, group);
      if (!canonical) continue;
      // If the JD uses one specific variant, swap every other variant in
      // the CV to that exact string -- only when the CV actually contains
      // a variant (i.e. the candidate has the experience).
      for (const variant of group) {
        if (variant === canonical) continue;
        // Word-boundary swap, case-insensitive.  We preserve the variant's
        // surrounding whitespace so layout is unaffected.
        const re = new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const before = out;
        out = out.replace(re, canonical);
        if (out !== before) swaps++;
      }
    }
    return { text: out, swaps };
  }

  // ===================================================================
  // 4. JOB TITLE ECHO
  // -------------------------------------------------------------------
  // The exact JD job title MUST appear in (a) the CV summary line and
  // (b) the cover letter opener. Recruiters skim for the title; if it's
  // not there, applications get filtered as "not interested in this role".
  // ===================================================================

  function echoJobTitle(text, jdTitle, { kind = 'cv' } = {}) {
    if (!text || !jdTitle) return { text: text || '', injected: false };
    const cleanedTitle = String(jdTitle).trim().replace(/\s+/g, ' ');
    if (cleanedTitle.length < 3 || cleanedTitle.length > 80) {
      return { text, injected: false };
    }
    if (text.toLowerCase().includes(cleanedTitle.toLowerCase())) {
      return { text, injected: false };
    }

    if (kind === 'coverLetter') {
      // Insert into the salutation/opening paragraph.  We look for the
      // first paragraph after "Dear" and prepend a target-role line.
      const lines = text.split('\n');
      const dearIdx = lines.findIndex((l) => /^dear/i.test(l.trim()));
      if (dearIdx >= 0 && dearIdx < lines.length - 2) {
        // Insert a target-line just below the salutation block.
        const insertAt = dearIdx + 2;
        lines.splice(insertAt, 0, `Re: ${cleanedTitle}`);
        lines.splice(insertAt + 1, 0, '');
        return { text: lines.join('\n'), injected: true };
      }
      return { text: `Re: ${cleanedTitle}\n\n${text}`, injected: true };
    }

    // CV: inject into the summary section (under SUMMARY / PROFESSIONAL SUMMARY / PROFILE).
    const summaryRe = /(SUMMARY|PROFESSIONAL SUMMARY|PROFILE)\s*\n/i;
    if (summaryRe.test(text)) {
      const out = text.replace(summaryRe, (m) => `${m}Target role: ${cleanedTitle}.\n`);
      return { text: out, injected: true };
    }
    return { text, injected: false };
  }

  // ===================================================================
  // 5. FIRST-SIX-SECONDS CHECK
  // -------------------------------------------------------------------
  // Read the first ~12 non-empty lines of the CV (top inch on screen)
  // and check that they contain: the candidate's name, a target title
  // string, and at least one quantified proof line.  We don't auto-fix
  // here -- we report what's missing so the popup can highlight it.
  // ===================================================================

  function firstSixSecondsCheck(cvText, candidateName, jdTitle) {
    if (!cvText) return { passes: false, missing: ['cv-empty'] };
    const lines = cvText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 14);
    const top = lines.join('\n');

    const missing = [];
    if (candidateName && !top.toLowerCase().includes(String(candidateName).toLowerCase().split(' ')[0])) {
      missing.push('name');
    }
    if (jdTitle && !top.toLowerCase().includes(String(jdTitle).toLowerCase())) {
      missing.push('target-title');
    }
    if (!SCALE_WORDS.test(top)) {
      missing.push('quantified-proof');
    }
    return { passes: missing.length === 0, missing, sample: top };
  }

  // ===================================================================
  // ORCHESTRATOR
  // ===================================================================

  // ===================================================================
  // PRE-PASS — defensive clean-up that runs BEFORE every other check.
  // -------------------------------------------------------------------
  // Catches three classes of corruption that would otherwise reach the
  // PDF renderer verbatim:
  //   (a) JSON-encoded escape sequences ("\n", "\t", \") that never got
  //       unescaped (happens when an LLM JSON response is fed in raw).
  //   (b) trailing JSON syntax leaked from the OTHER document field
  //       (e.g. CV ends with `","tailoredCoverLetter":"..."}`).
  //   (c) em-dashes (-- and --) that the user has explicitly asked us
  //       to never emit.  Replaced with comma + space, which preserves
  //       sentence cadence without the em-dash glyph.
  // ===================================================================

  function _cleanCorruption(text, type) {
    if (!text || typeof text !== 'string') return text || '';
    let out = text;

    // (a) Unescape literal JSON escape sequences.
    if (out.includes('\\n') || out.includes('\\t') || out.includes('\\"')) {
      out = out
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }

    // (b) Strip trailing other-document JSON fragments.
    const otherKey = type === 'cv' ? 'tailoredCoverLetter' : 'tailoredResume';
    const otherRe = new RegExp(`["\\s,]+\\\\?"?${otherKey}\\\\?"?\\s*:.*$`, 'is');
    if (otherRe.test(out)) {
      out = out.replace(otherRe, '').replace(/[",\s]+$/, '').trim();
    }
    // Strip a stray opening brace and "tailoredResume": prefix some LLMs leak.
    out = out.replace(/^\s*\{?\s*"tailoredResume"\s*:\s*"/, '');
    out = out.replace(/^\s*\{?\s*"tailoredCoverLetter"\s*:\s*"/, '');

    // (c) Em-dash and en-dash to neutral punctuation.  ` -- ` -> `, `,
    // bare `--` (no surrounding space) -> `, `, en-dash `-` -> hyphen-minus
    // when used as a punctuation separator (we leave date-range hyphens alone
    // by NOT touching the `-` already in the string).
    out = out
      .replace(/\s*—\s*/g, ', ')
      .replace(/—/g, ', ')
      .replace(/\s*–\s*/g, ', ')
      .replace(/–/g, ', ');

    return out;
  }

  // ===================================================================
  // v3 — HONESTY AUDIT
  // -------------------------------------------------------------------
  // For every JD keyword that appears in the TAILORED CV but does NOT
  // appear (in any form, including word stems) in the ORIGINAL CV, flag
  // it as potentially fabricated.  Recruiters trust authenticity more
  // than keyword density; this catches cases where the tailor engine has
  // injected a skill the candidate cannot actually back up in interview.
  //
  // Conservative: we only flag MULTI-CHARACTER terms (>=3 chars), allow
  // common transformations (plural/singular, hyphen variants, case), and
  // never flag the candidate's own name or proper nouns from the JD.
  // ===================================================================

  function _normalizeForCompare(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[‐-―]/g, '-')      // dashes to hyphen
      .replace(/[''']/g, "'")                // smart quotes
      .replace(/[\s\-_/]+/g, ' ')             // collapse separators
      .replace(/s\b/g, '')                    // drop trailing 's' (plural -> singular)
      .replace(/ing\b/g, '')                  // drop -ing
      .replace(/ed\b/g, '');                  // drop -ed
  }

  function honestyAudit({ tailoredCV, originalCV, jobKeywords }) {
    if (!tailoredCV || !originalCV) return { potentiallyFabricated: [] };
    const tailoredNorm = _normalizeForCompare(tailoredCV);
    const originalNorm = _normalizeForCompare(originalCV);
    const flat = _flatKeywords(jobKeywords)
      .map((k) => String(k || '').trim())
      .filter((k) => k.length >= 3);

    const seen = new Set();
    const flagged = [];
    for (const kw of flat) {
      const key = kw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const probe = _normalizeForCompare(kw);
      if (!probe) continue;
      const inTailored = tailoredNorm.includes(probe);
      const inOriginal = originalNorm.includes(probe);
      if (inTailored && !inOriginal) {
        flagged.push(kw);
        if (flagged.length >= 12) break;
      }
    }
    return { potentiallyFabricated: flagged };
  }

  function _flatKeywords(jobKeywords) {
    if (!jobKeywords) return [];
    if (Array.isArray(jobKeywords)) return jobKeywords;
    if (jobKeywords.all) return jobKeywords.all;
    const out = [];
    for (const k of ['highPriority', 'mediumPriority', 'lowPriority']) {
      if (Array.isArray(jobKeywords[k])) out.push(...jobKeywords[k]);
    }
    return out;
  }

  // ===================================================================
  // v3 — SUMMARY CLAMP
  // -------------------------------------------------------------------
  // Locates the Professional Summary block and enforces:
  //   * <= 360 characters (truncated at sentence boundary, never mid-word)
  //   * No "looking for X" / "open to X" / "seeking X" sentence (techtalk
  //     skill: "do not include a line about what they're looking to do
  //     next — this adds no value and wastes character space").
  // Safe-mode: only touches text BETWEEN the summary header and the
  // next blank line or next ALL-CAPS section header.  If the boundary
  // can't be found cleanly, the clamp is skipped.
  // ===================================================================

  const SUMMARY_HEADER_RE = /^(SUMMARY|PROFESSIONAL SUMMARY|PROFILE|ABOUT(?: ME)?)\s*:?\s*$/im;
  const NEXT_SECTION_RE = /^(EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS|CORE COMPETENCIES|AREAS OF EXPERTISE)\s*:?\s*$/im;
  const LOOKING_SENTENCE_RE = /[^.!?\n]*\b(looking (?:for|to)|seeking|open to (?:new )?(?:opportunit|role|position)|aspir(?:e|ing) to)\b[^.!?\n]*[.!?]?/gi;

  function clampSummary(text, { maxChars = 360 } = {}) {
    if (!text) return { text: text || '', clamped: false, removedSentences: 0 };
    const lines = text.split('\n');
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (SUMMARY_HEADER_RE.test(lines[i].trim())) { headerIdx = i; break; }
    }
    if (headerIdx < 0) return { text, clamped: false, removedSentences: 0 };

    // Find end of summary block: next blank line OR next ALL-CAPS section header.
    let endIdx = lines.length;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === '' || NEXT_SECTION_RE.test(t)) { endIdx = i; break; }
    }
    if (endIdx <= headerIdx + 1) return { text, clamped: false, removedSentences: 0 };

    const summaryLines = lines.slice(headerIdx + 1, endIdx);
    let summary = summaryLines.join(' ').trim();
    let removedSentences = 0;

    // Strip "looking to / seeking / open to" sentences first.
    const before = summary;
    summary = summary.replace(LOOKING_SENTENCE_RE, '').replace(/\s{2,}/g, ' ').trim();
    if (summary !== before) removedSentences = 1;

    // Truncate at sentence boundary if still too long.
    let clamped = false;
    if (summary.length > maxChars) {
      const sentences = summary.match(/[^.!?]+[.!?]+\s*/g) || [summary];
      let acc = '';
      for (const s of sentences) {
        if ((acc + s).length > maxChars) break;
        acc += s;
      }
      const usedSentenceBoundary = !!acc;
      summary = (acc || summary.slice(0, maxChars)).trim();
      // Don't end mid-word -- but ONLY when we hard-sliced. A sentence-
      // boundary cut already ends cleanly; stripping its last word
      // produced truncated phrases like "ensuring exceptional."
      if (!usedSentenceBoundary) {
        summary = summary.replace(/\s+\S*$/, m => m.length < 25 ? '' : m).trim();
      }
      if (!/[.!?]$/.test(summary)) summary += '.';
      clamped = true;
    }

    const newLines = [...lines.slice(0, headerIdx + 1), summary, ...lines.slice(endIdx)];
    return { text: newLines.join('\n'), clamped, removedSentences };
  }

  // ===================================================================
  // v3 — BULLET LENGTH CAP
  // -------------------------------------------------------------------
  // Bullets longer than ~280 chars (≈2 lines at 11pt body width) get
  // skimmed past.  Warning only — automatic truncation would lose meaning.
  // ===================================================================

  function bulletLengthAudit(text, { maxChars = 280 } = {}) {
    if (!text) return { tooLong: [] };
    const lines = text.split('\n');
    const tooLong = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!/^([\-*•]|\d+\.)\s+/.test(line)) continue;
      const stripped = line.replace(/^([\-*•]|\d+\.)\s+/, '');
      if (stripped.length > maxChars) {
        tooLong.push({ length: stripped.length, sample: stripped.slice(0, 110) + '…' });
        if (tooLong.length >= 5) break;
      }
    }
    return { tooLong };
  }

  // ===================================================================
  // v4 — ATS PARSE-SAFETY CHECKS
  // -------------------------------------------------------------------
  // The two most common reasons an ATS parser garbles an otherwise-good
  // CV: (a) mixed date formats confuse experience-duration extraction,
  // (b) non-standard section headers stop the parser from finding the
  // experience/education/skills blocks at all.  Both are warnings only.
  // ===================================================================

  const DATE_FORMAT_PATTERNS = {
    'MM/YYYY': /\b(0[1-9]|1[0-2])\/\d{4}\b/g,
    'Month YYYY': /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b/g,
    'YYYY-MM': /\b\d{4}-(0[1-9]|1[0-2])\b/g,
    'MM-YYYY': /\b(0[1-9]|1[0-2])-\d{4}\b/g,
  };

  function dateFormatAudit(text) {
    if (!text) return { consistent: true, formats: [] };
    const found = [];
    for (const [name, re] of Object.entries(DATE_FORMAT_PATTERNS)) {
      re.lastIndex = 0;
      const matches = text.match(re);
      if (matches && matches.length > 0) {
        found.push({ format: name, count: matches.length, example: matches[0] });
      }
    }
    return { consistent: found.length <= 1, formats: found };
  }

  const STANDARD_SECTION_HEADERS = [
    /^(WORK\s+)?EXPERIENCE\s*:?\s*$/im,
    /^(PROFESSIONAL\s+)?SUMMARY\s*:?\s*$|^PROFILE\s*:?\s*$/im,
    /^EDUCATION\s*:?\s*$/im,
    /^(TECHNICAL\s+)?SKILLS\s*:?\s*$|^TECHNICAL PROFICIENCIES\s*:?\s*$|^CORE COMPETENCIES\s*:?\s*$/im,
  ];
  const SECTION_NAMES = ['Experience', 'Summary/Profile', 'Education', 'Skills'];

  function sectionHeaderAudit(text) {
    if (!text) return { missing: [] };
    const missing = [];
    STANDARD_SECTION_HEADERS.forEach((re, i) => {
      if (!re.test(text)) missing.push(SECTION_NAMES[i]);
    });
    return { missing };
  }

  // ===================================================================
  // v5 — HIRING-COMPANY-IN-WRONG-BULLET DETECTOR
  // -------------------------------------------------------------------
  // The single worst failure mode: the tailor model writes the hiring
  // company's name (e.g. "AMD", "IEQ Capital") into an experience bullet
  // for a DIFFERENT employer (Meta, Accenture). That is an obvious
  // fabrication. We scan every bullet, identify which role it belongs to
  // by tracking the most-recent role header above it, and flag any
  // bullet that mentions the hiring company while sitting under a
  // different employer.
  // ===================================================================

  function hiringCompanyAudit(cvText, hiringCompany) {
    if (!cvText || !hiringCompany || hiringCompany.length < 2) return { violations: [] };
    const target = String(hiringCompany).trim();
    if (!target) return { violations: [] };
    // Build a flexible regex that matches the company name and common
    // possessive / acronym forms.
    const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${esc}(?:'s|\\.com)?\\b`, 'i');

    const lines = cvText.split('\n');
    const violations = [];
    // We track up to TWO recent non-bullet lines because the typical CV
    // shape is "Company\nTitle\nDates" -- the company name is two lines
    // above the dates, not one. After we see a bullet we reset, so the
    // next role's header is detected fresh.
    let employerLines = [];
    let inExperience = false;

    const stopWords = new Set(['SUMMARY','PROFESSIONAL SUMMARY','PROFILE','CORE COMPETENCIES','AREAS OF EXPERTISE','EDUCATION','SKILLS','CERTIFICATIONS','PROJECTS']);

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const upper = line.toUpperCase();

      if (/^(WORK\s+)?EXPERIENCE\s*:?\s*$|^EMPLOYMENT\s*:?\s*$/i.test(line)) {
        inExperience = true;
        continue;
      }
      if (stopWords.has(upper)) { inExperience = false; employerLines = []; continue; }
      if (!inExperience) continue;

      const isBullet = /^([\-*•]|\d+\.)\s+/.test(line);
      if (!isBullet) {
        const isDateLine = /\b(19|20)\d{2}\b/.test(line) && !/[a-z]{4,}\s+[a-z]{4,}/i.test(line);
        if (!isDateLine && line.length < 80) {
          employerLines.push(line);
          if (employerLines.length > 3) employerLines.shift();
        }
        continue;
      }
      // First bullet of a role -- the employer is the FIRST header line
      // we saw above it (companies appear before titles).
      const currentEmployer = employerLines[0] || null;

      // If it mentions the hiring company AND the current employer is
      // something else (and the hiring company isn't ANY header line of
      // this role), that's a fabrication.
      if (re.test(line)) {
        const headerMatches = employerLines.some(h => re.test(h));
        if (currentEmployer && !headerMatches) {
          violations.push({
            employer: currentEmployer.slice(0, 60),
            hiringCompany: target,
            sample: line.replace(/^([\-*•]|\d+\.)\s+/, '').slice(0, 140),
          });
        }
      }
      if (violations.length >= 6) break;
    }

    return { violations };
  }

  function runRecruiterAudit({
    cvText = '',
    coverLetterText = '',
    jdText = '',
    jdTitle = '',
    jdCompany = '',
    candidateName = '',
    originalCV = '',
    jobKeywords = null,
    flags = {},
  } = {}) {
    const t0 = Date.now();
    cvText = _cleanCorruption(cvText, 'cv');
    coverLetterText = _cleanCorruption(coverLetterText, 'cover');
    const f = {
      buzzwords: flags.buzzwords !== false,
      quantification: flags.quantification !== false,
      vocabulary: flags.vocabulary !== false,
      titleEcho: flags.titleEcho !== false,
      firstSixSeconds: flags.firstSixSeconds !== false,
      // v2
      fillerWords: flags.fillerWords !== false,
      weakVerbs: flags.weakVerbs !== false,
      actionVerbs: flags.actionVerbs !== false,
      coverHealth: flags.coverHealth !== false,
      // v3
      honesty: flags.honesty !== false,
      summaryClamp: flags.summaryClamp !== false,
      bulletLength: flags.bulletLength !== false,
      // v4
      dateFormats: flags.dateFormats !== false,
      sectionHeaders: flags.sectionHeaders !== false,
      // v5
      hiringCompanyLies: flags.hiringCompanyLies !== false,
    };

    let outCV = cvText;
    let outCL = coverLetterText;
    const report = { fixes: [], warnings: [], timingMs: 0 };

    if (f.buzzwords) {
      const cv = purgeBuzzwords(outCV);
      const cl = purgeBuzzwords(outCL);
      outCV = cv.text;
      outCL = cl.text;
      if (cv.removed + cl.removed > 0) {
        report.fixes.push(`buzzwords: ${cv.removed} CV / ${cl.removed} cover-letter phrases removed`);
      }
      const allFlagged = Array.from(new Set([...(cv.flagged || []), ...(cl.flagged || [])]));
      if (allFlagged.length > 0) {
        report.warnings.push({ kind: 'buzzword-words-flagged', words: allFlagged });
      }
    }

    if (f.vocabulary && jdText) {
      const cv = mirrorJdVocabulary(outCV, jdText);
      const cl = mirrorJdVocabulary(outCL, jdText);
      outCV = cv.text;
      outCL = cl.text;
      if (cv.swaps + cl.swaps > 0) {
        report.fixes.push(`jd-vocabulary: ${cv.swaps + cl.swaps} synonyms swapped to exact JD terms`);
      }
    }

    if (f.titleEcho && jdTitle) {
      const cv = echoJobTitle(outCV, jdTitle, { kind: 'cv' });
      const cl = echoJobTitle(outCL, jdTitle, { kind: 'coverLetter' });
      outCV = cv.text;
      outCL = cl.text;
      if (cv.injected || cl.injected) {
        report.fixes.push(`title-echo: target role injected (cv:${cv.injected} cl:${cl.injected})`);
      }
    }

    if (f.quantification) {
      const q = quantificationAudit(outCV);
      if (q.unquantified.length > 0) {
        report.warnings.push({
          kind: 'unquantified-bullets',
          count: q.unquantified.length,
          totalBullets: q.total,
          samples: q.unquantified.slice(0, 3),
        });
      }
    }

    if (f.firstSixSeconds) {
      const six = firstSixSecondsCheck(outCV, candidateName, jdTitle);
      if (!six.passes) {
        report.warnings.push({ kind: 'first-six-seconds', missing: six.missing });
      }
    }

    // v2: filler-word strip (auto-fix)
    if (f.fillerWords) {
      const cv = stripFillers(outCV);
      const cl = stripFillers(outCL);
      outCV = cv.text;
      outCL = cl.text;
      if (cv.removed + cl.removed > 0) {
        report.fixes.push(`fillers: ${cv.removed + cl.removed} adverbs removed`);
      }
    }

    // v2: weak-verb opener flag (warning only -- replacement requires domain knowledge)
    if (f.weakVerbs) {
      const w = weakVerbAudit(outCV);
      if (w.weak.length > 0) {
        report.warnings.push({ kind: 'weak-bullet-openers', count: w.weak.length, samples: w.weak.slice(0, 3) });
      }
    }

    // v2: action-verb opener check (warning)
    if (f.actionVerbs) {
      const a = actionVerbAudit(outCV);
      if (a.weakOpeners.length > 0) {
        report.warnings.push({
          kind: 'non-action-verb-openers',
          count: a.weakOpeners.length,
          samples: a.weakOpeners.slice(0, 3).map((x) => x.sample),
        });
      }
    }

    // v2: cover letter length + pronoun balance
    if (f.coverHealth && outCL) {
      const h = coverLetterHealth(outCL);
      if (h.tooLong) {
        report.warnings.push({ kind: 'cover-letter-too-long', wordCount: h.wordCount, target: 350 });
      }
      if (h.selfHeavy) {
        report.warnings.push({ kind: 'cover-letter-self-heavy', iCount: h.iCount, youCount: h.youCount });
      }
    }

    // v3: honesty audit (warning only -- never rewrites the CV)
    if (f.honesty && originalCV && jobKeywords) {
      try {
        const h = honestyAudit({ tailoredCV: outCV, originalCV, jobKeywords });
        if (h.potentiallyFabricated.length > 0) {
          report.warnings.push({
            kind: 'potentially-fabricated-keywords',
            count: h.potentiallyFabricated.length,
            samples: h.potentiallyFabricated.slice(0, 6),
            note: 'Keywords present in tailored CV but absent from your original CV. Review before submitting.',
          });
        }
      } catch (e) {
        // Defensive: never let an audit failure break the pipeline.
      }
    }

    // v3: summary clamp (auto-fix: <= 360 chars + strip "looking to..." sentences)
    if (f.summaryClamp && outCV) {
      try {
        const c = clampSummary(outCV, { maxChars: 360 });
        if (c.clamped || c.removedSentences > 0) {
          outCV = c.text;
          const parts = [];
          if (c.removedSentences > 0) parts.push(`${c.removedSentences} "looking-to" sentence(s) stripped`);
          if (c.clamped) parts.push('summary clamped to 360 chars');
          report.fixes.push(`summary: ${parts.join(', ')}`);
        }
      } catch (e) {}
    }

    // v3: bullet length cap (warning only -- truncation would lose meaning)
    if (f.bulletLength && outCV) {
      const b = bulletLengthAudit(outCV, { maxChars: 280 });
      if (b.tooLong.length > 0) {
        report.warnings.push({
          kind: 'over-long-bullets',
          count: b.tooLong.length,
          samples: b.tooLong.slice(0, 3),
          note: 'Bullets longer than ~2 lines get skimmed past by recruiters. Consider tightening.',
        });
      }
    }

    // v4: mixed date formats confuse ATS experience-duration extraction
    if (f.dateFormats && outCV) {
      const d = dateFormatAudit(outCV);
      if (!d.consistent) {
        report.warnings.push({
          kind: 'mixed-date-formats',
          formats: d.formats,
          note: 'CV mixes date formats (' + d.formats.map((x) => x.format).join(' + ') +
            '). ATS parsers extract experience duration most reliably from ONE consistent format.',
        });
      }
    }

    // v4: missing standard section headers stop ATS parsers finding blocks
    if (f.sectionHeaders && outCV) {
      const s = sectionHeaderAudit(outCV);
      if (s.missing.length > 0) {
        report.warnings.push({
          kind: 'missing-standard-headers',
          missing: s.missing,
          note: 'ATS parsers look for standard section headers. Missing/non-standard: ' + s.missing.join(', '),
        });
      }
    }

    // v5: hiring-company-in-wrong-bullet (the AMD-into-Meta fabrication).
    // This is a CRITICAL warning -- it represents an interview-killing
    // lie. Surfaced with a distinct kind so the popup can highlight it.
    if (f.hiringCompanyLies && outCV && jdCompany) {
      const hc = hiringCompanyAudit(outCV, jdCompany);
      if (hc.violations.length > 0) {
        report.warnings.push({
          kind: 'hiring-company-in-wrong-bullet',
          severity: 'critical',
          count: hc.violations.length,
          samples: hc.violations.slice(0, 3),
          note: 'CRITICAL: bullet(s) describe the hiring company (' + jdCompany +
            ') as part of work at a different employer. This is a fabrication a recruiter will flag. Edit before submitting.',
        });
      }
    }

    report.timingMs = Date.now() - t0;
    return { cvText: outCV, coverLetterText: outCL, report };
  }

  const RecruiterAudit = {
    runRecruiterAudit,
    purgeBuzzwords,
    quantificationAudit,
    mirrorJdVocabulary,
    echoJobTitle,
    firstSixSecondsCheck,
    // v2
    stripFillers,
    weakVerbAudit,
    actionVerbAudit,
    coverLetterHealth,
    // v3
    honestyAudit,
    clampSummary,
    bulletLengthAudit,
    // v4
    dateFormatAudit,
    sectionHeaderAudit,
    // v5
    hiringCompanyAudit,
  };

  global.RecruiterAudit = RecruiterAudit;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecruiterAudit;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this)));
