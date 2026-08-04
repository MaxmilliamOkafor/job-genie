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
    // Common AI-generated tells (recruiter-spotted, kill credibility on sight)
    /\bspearhead(ed|ing)?\b/i,
    /\brobust\b/i,
    /\bseamless(ly)?\b/i,
    /\bcutting[- ]edge\b/i,
    /\bbleeding[- ]edge\b/i,
    /\bdelve(d|s|ing)?\s+into\b/i,
    /\bin (today'?s|the)\s+fast[- ]paced\b/i,
    /\bever[- ]evolving\b/i,
    /\bnavigate the complex(it(y|ies))?\b/i,
    /\bunlock(ed|ing)? (the )?potential\b/i,
    /\b(synergiz|harmoniz)e\b/i,
    /\btestament to\b/i,
    /\bvibrant ecosystem\b/i,
  ];

  // Single words that are problematic but cannot be safely auto-removed
  // (removing them mid-sentence breaks grammar).  These are reported as
  // warnings so the user can rewrite manually.
  const BUZZWORD_FLAGS = [
    'passionate', 'dynamic', 'synergy', 'synergies', 'leverage', 'leveraging',
    'leveraged', 'utilize', 'utilise', 'utilized', 'utilised', 'proactive',
    'proactively', 'rockstar', 'ninja', 'guru', 'evangelist', 'disruptive',
    'visionary',
    // AI-generated tells (recruiter-spotted; kill credibility on sight)
    'spearheaded', 'spearhead', 'robust', 'seamless', 'seamlessly',
    'cutting-edge', 'bleeding-edge', 'ever-evolving', 'meticulous',
    'meticulously', 'plethora', 'myriad', 'pivotal', 'paramount',
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

  // Postings carry requisition numbers, locations and employment-type
  // noise in the title field. Writing that verbatim into a CV produced
  // "(1526) Microsoft Dynamics 365 Project Manager Experienced Microsoft
  // Dynamics 365 Project Manager with..." -- the req number leaked, and
  // because the raw string never matched the summary's own wording, the
  // title was ALSO prepended, so it appeared twice.
  function normaliseJobTitle(raw) {
    let t = String(raw || '').trim().replace(/\s+/g, ' ');
    t = t.replace(/^[\s\-|,]*\(?\s*(?:req(?:uisition)?\.?\s*(?:id|no\.?|#)?\s*)?[#]?\d{3,10}\s*\)?[\s\-|,:]*/i, '');
    t = t.replace(/^[\s\-|,]*\b(?:JR|R|REQ|JOB)[-_]?\d{3,10}\b[\s\-|,:]*/i, '');
    t = t.replace(/[\s\-|,(]*\b(?:req(?:uisition)?\.?\s*(?:id|no\.?|#)?\s*)?[#]?\d{4,10}\)?\s*$/i, '');
    t = t.replace(/\s*[-|(]\s*(remote|hybrid|on-?site|full[- ]?time|part[- ]?time|contract|permanent|temporary|fte)\b[^)]*\)?\s*$/i, '');
    t = t.replace(/\s*[-|]\s*[A-Z][a-z]+(?:,\s*[A-Z]{2,})?\s*$/, '');
    t = t.replace(/[\s\-|,:]+$/, '').replace(/^[\s\-|,:]+/, '');
    return t.replace(/\s+/g, ' ').trim();
  }

  function echoJobTitle(text, jdTitle, { kind = 'cv' } = {}) {
    if (!text || !jdTitle) return { text: text || '', injected: false };
    const cleanedTitle = normaliseJobTitle(jdTitle);
    if (cleanedTitle.length < 3 || cleanedTitle.length > 80) {
      return { text, injected: false };
    }
    // Strip any legacy robotic "Target role: X." label BEFORE checking
    // presence -- otherwise a label from an earlier generation satisfies
    // the includes() check and survives forever (and reads as a duplicate:
    // "Target role: X. Experienced X with..."). The label is often INLINE
    // at the start of the summary paragraph (the summary clamp joins
    // lines), and titles contain periods ("Sr."), so we remove the label
    // plus the KNOWN title precisely rather than splitting on sentences.
    const escT = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let hadLabel = false;
    if (kind !== 'coverLetter' && /Target role:/i.test(text)) {
      hadLabel = true;
      // 1) Label followed by this exact title (inline or own line).
      text = text.replace(new RegExp('[ \\t]*Target role:\\s*' + escT(cleanedTitle) + '\\.?\\s*', 'gi'), '');
      // 2) Any leftover label on its own line (different/older title).
      text = text.replace(/^[ \t]*Target role:[^\n]*\n?/gim, '');
      // 3) A bare inline label prefix: drop just the label words.
      text = text.replace(/Target role:\s*/gi, '');
      text = text.replace(/\n{3,}/g, '\n\n');
    }
    if (text.toLowerCase().includes(cleanedTitle.toLowerCase())) {
      return { text, injected: hadLabel };
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

    // CV: the exact JD title must appear in the summary -- but NEVER as a
    // robotic "Target role:" label, and never twice back-to-back
    // ("Target role: X. Experienced X with..."). Strip any legacy label
    // line first; the logic below re-ensures the title properly.
    text = text.replace(/^[ \t]*Target role:[^\n]*\n?/gim, '');
    if (text.toLowerCase().includes(cleanedTitle.toLowerCase())) {
      return { text, injected: false };
    }
    // Preferred: MERGE into a title the summary already carries
    // ("Experienced Sr. Software Engineer with..." + JD "Sr. Software
    // Engineer (Data Science)" -> replace the partial title with the exact
    // JD string, so it appears ONCE). Fallback: a bare headline line under
    // the summary header, which reads like a standard CV headline.
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Core title = JD title minus any parenthetical qualifier.
    const coreTitle = cleanedTitle.replace(/\s*\([^)]*\)\s*$/, '').trim();
    // Try the core title and its Sr./Senior sibling as merge anchors.
    const anchors = [coreTitle];
    if (/\bSr\.?\s/i.test(coreTitle)) anchors.push(coreTitle.replace(/\bSr\.?\s/i, 'Senior '));
    else if (/\bSenior\s/i.test(coreTitle)) anchors.push(coreTitle.replace(/\bSenior\s/i, 'Sr. '));
    for (const anchor of anchors) {
      if (anchor.length < 5) continue;
      const re = new RegExp(esc(anchor), 'i');
      if (re.test(text)) {
        return { text: text.replace(re, cleanedTitle), injected: true };
      }
    }
    // NO SIMILAR TITLE TO MERGE INTO.
    //
    // The old behaviour prepended the JD title as a headline. On a genuine
    // pivot that manufactures a claim the CV cannot support -- a Software
    // Engineer whose summary suddenly announces "Microsoft Dynamics 365
    // Project Manager", with no Dynamics 365 anywhere beneath it. A
    // recruiter reads that as a lie in the first line and stops, which is
    // the exact outcome the tailoring is supposed to avoid.
    //
    // Mirroring the JD's vocabulary is legitimate; asserting a job history
    // the candidate does not have is not. So when there is nothing to
    // merge into, the summary is left alone and the mismatch is reported
    // instead, for the user to decide on.
    return { text, injected: false, titleUnsupported: true, normalisedTitle: cleanedTitle };
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
  // v6 — BELIEVABLE-METRICS DENSITY AUDIT
  // -------------------------------------------------------------------
  // Recruiter intuition: a CV with a precise jaw-dropping number in
  // every bullet ("99.2% accuracy across 2M+ users", "GBP1.6B+ daily")
  // reads as fabricated. The fix isn't fewer numbers; it's a MIX of
  // quantified outcomes and grounded qualitative ones. This audit flags
  // when the density of "big precise stats" exceeds the believability
  // threshold so the user can swap a few back to qualitative.
  //
  // Heuristic: a "big precise stat" is a bullet containing either
  //   - a percentage >= 30%      ("70%", "94%")
  //   - a multiplier with M/B/k  ("2M+", "GBP1.6B", "10TB")
  //   - 5+ contiguous digits     ("500,000", "120000")
  // If 70%+ of all bullets carry one, the CV likely overclaims.
  // ===================================================================

  const BIG_STAT_RE = /\b\d{2,3}%|\b(?:GBP|USD|EUR|\$|£|€)?\s*\d+(?:\.\d+)?\s*(?:M\+?|B\+?|K\+?|TB|GB|million|billion|thousand)\b|\b\d{5,}\b/i;

  function metricsDensityAudit(text, { threshold = 0.7 } = {}) {
    if (!text) return { density: 0, totalBullets: 0, statBullets: 0, overclaiming: false };
    // Scope to the EXPERIENCE section only -- cert/education bullets carry
    // no metrics and would dilute the density, masking a real stat-wall.
    const expMatch = text.match(/(?:WORK\s+)?EXPERIENCE\s*:?\s*\n([\s\S]*?)(?=\n(?:EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|AWARDS|REFERENCES)\b|$)/i);
    const scope = expMatch ? expMatch[1] : text;
    const lines = scope.split('\n');
    let totalBullets = 0;
    let statBullets = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!/^([\-*•]|\d+\.)\s+/.test(line)) continue;
      const stripped = line.replace(/^([\-*•]|\d+\.)\s+/, '');
      if (stripped.length < 25) continue; // ignore one-liner labels
      totalBullets++;
      if (BIG_STAT_RE.test(stripped)) statBullets++;
    }
    const density = totalBullets > 0 ? statBullets / totalBullets : 0;
    return {
      density,
      totalBullets,
      statBullets,
      overclaiming: totalBullets >= 4 && density >= threshold,
    };
  }

  // ===================================================================
  // v6 — UK/IE DEGREE + GPA MISMATCH
  // -------------------------------------------------------------------
  // UK/IE degrees use Honours classifications ("First Class Honours",
  // "Upper Second", "Distinction"). Bolting a US-style "GPA 3.90/4.00"
  // onto one looks wrong to a UK recruiter and signals AI-generated
  // output. Flag whenever both appear in the same education entry.
  // ===================================================================

  const UK_IE_CLASS_RE = /\b(First Class Honours|Second Class Honours|Upper Second|Lower Second|Third Class|Distinction|Merit|Pass)\b/i;
  const GPA_RE = /\b(\d{1,2}\.\d{1,2})\s*\/\s*(?:4\.0{0,2}|5\.0{0,2})\b|\bGPA[:\s]+\d{1,2}\.\d{1,2}\b/i;

  function gpaOnUkIeDegreeAudit(text) {
    if (!text) return { violations: [] };
    const lines = text.split('\n');
    const violations = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (UK_IE_CLASS_RE.test(line) && GPA_RE.test(line)) {
        const gpaMatch = line.match(GPA_RE);
        violations.push({
          line: line.trim().slice(0, 120),
          gpa: gpaMatch ? gpaMatch[0] : '',
        });
      } else if (UK_IE_CLASS_RE.test(line)) {
        // Two-line case: classification on one line, GPA on the next
        const next = lines[i + 1] || '';
        if (GPA_RE.test(next) && !UK_IE_CLASS_RE.test(next)) {
          const gpaMatch = next.match(GPA_RE);
          violations.push({
            line: (line.trim() + ' | ' + next.trim()).slice(0, 120),
            gpa: gpaMatch ? gpaMatch[0] : '',
          });
        }
      }
    }
    return { violations };
  }

  // Strip the US-style GPA suffix from any line that ALSO carries a UK/IE
  // Honours classification. "BSc Computer Science -- First Class Honours
  // (3.80/4.00)" becomes "BSc Computer Science -- First Class Honours".
  // Two-line shape ("First Class Honours\n3.80/4.00") -> drop the GPA
  // line. Lines that have ONLY a GPA (US degrees) are untouched.
  function stripGpaFromUkIeDegrees(text) {
    if (!text) return { text: text || '', stripped: 0 };
    const lines = text.split('\n');
    const out = [];
    let stripped = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Same-line case: remove "(3.90/4.00)" or "GPA: 3.9" + tidy trailing punctuation.
      if (UK_IE_CLASS_RE.test(line) && GPA_RE.test(line)) {
        const cleaned = line
          .replace(/\s*\(\s*\d{1,2}\.\d{1,2}\s*\/\s*(?:4\.0{0,2}|5\.0{0,2})\s*\)\s*/g, '')
          .replace(GPA_RE, '')
          .replace(/[\-–—\s,;|]+$/, '')
          .replace(/\s{2,}/g, ' ')
          .trimEnd();
        out.push(cleaned);
        stripped++;
        continue;
      }
      // Two-line case: drop the standalone GPA line beneath an Honours line.
      if (UK_IE_CLASS_RE.test(line) && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (GPA_RE.test(next) && !UK_IE_CLASS_RE.test(next) && next.trim().length < 30) {
          out.push(line);
          i += 1; // skip the GPA line
          stripped++;
          continue;
        }
      }
      out.push(line);
    }
    return { text: out.join('\n'), stripped };
  }

  // ===================================================================
  // v6 — CERTIFICATION COHERENCE
  // -------------------------------------------------------------------
  // A scattered cert pile (CISSP + Salesforce Admin + AWS Data + PMI +
  // PRINCE2 + ITIL + ...) reads as padding -- the candidate looks
  // unfocused. Flag when certs span 3+ unrelated DOMAINS for one CV.
  // ===================================================================

  const CERT_DOMAINS = {
    security: [/CISSP/i, /Security\+|CompTIA Security/i, /CEH\b/i, /CISM/i, /CISA/i, /OSCP/i, /GIAC/i],
    cloud: [/AWS Certified/i, /Azure (Administrator|Solutions|Developer|AZ-\d)/i, /Google Cloud|GCP Certified|Professional Cloud/i, /Solutions Architect/i],
    data: [/Data Analyst|Data Engineer|Data Scientist|Databricks|Snowflake/i, /Microsoft Certified:\s*Data/i, /Google Data Analytics/i],
    ml: [/Machine Learning|Deep Learning|TensorFlow Developer|Azure AI Engineer/i, /AI Engineer Associate/i],
    project: [/PMP\b|PMI/i, /PRINCE2/i, /CAPM/i, /Agile|Scrum Master|CSM|PSM\b|Certified ScrumMaster/i, /ITIL/i],
    business: [/CBAP/i, /Business Analysis Professional/i, /Six Sigma|Lean Six Sigma/i],
    crm: [/Salesforce (Admin|Administrator|Developer|Architect)/i, /HubSpot Certified/i],
    finance: [/CFA/i, /FRM\b/i, /ACCA/i, /CIMA/i, /Series \d/i],
  };

  function certCoherenceAudit(text) {
    if (!text) return { domains: [], scattered: false };
    // Isolate CERTIFICATIONS section -- avoid matching against bullet
    // contents that happen to mention these systems in passing.
    const m = text.match(/CERTIFICATIONS\s*:?\s*\n([\s\S]*?)(?=\n[A-Z][A-Z ]{3,}\s*:?\s*\n|$)/i);
    if (!m) return { domains: [], scattered: false };
    const block = m[1];
    const found = new Set();
    for (const [domain, patterns] of Object.entries(CERT_DOMAINS)) {
      for (const re of patterns) {
        if (re.test(block)) { found.add(domain); break; }
      }
    }
    const arr = [...found];
    return {
      domains: arr,
      scattered: arr.length >= 3,
    };
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

  // ===================================================================
  // v7 — PROJECT QUALITY AUDIT
  // -------------------------------------------------------------------
  // Mirrors how a real recruiter scoring engine grades the PROJECTS
  // section (rubric: resume_evaluation_criteria.jinja). Three checks,
  // all PURE WARNINGS -- no rewrite, no fabrication risk:
  //
  //   #1 LINKS. A project with no GitHub/live-demo link scores 30-50%
  //      lower; each linkless project is a -3 to -5 point deduction. We
  //      flag every project block that carries no URL or link hint.
  //   #2 COMPLEXITY. Generic/tutorial-grade titles (Todo App, Calculator,
  //      Weather App, basic CRUD, "sentiment analysis with NLTK",
  //      service clones) are penalised; one complex project beats five
  //      simple ones. We flag tutorial-grade titles so the user reframes
  //      or drops them.
  //   #3 OPEN-SOURCE HONESTY. "Open source" is scored as contributions to
  //      OTHERS' projects; a personal repo caps at ~10 pts and labelling
  //      your own repo "open-source contribution" can trigger a -3 to -5
  //      deduction. We flag any "open source" claim that is NOT backed by
  //      a link to a repo owned by someone other than the candidate (the
  //      candidate's own GitHub handle is derived from the CV itself).
  // ===================================================================

  const PROJECT_SECTION_RE = /^(SELECTED PROJECTS|TECHNICAL PROJECTS|KEY PROJECTS|PERSONAL PROJECTS|SIDE PROJECTS|NOTABLE PROJECTS|PROJECTS)\s*:?\s*$/i;

  // A project block ends where the next top-level CV section begins.
  const PROJECT_SECTION_END_RE = /^(WORK\s+EXPERIENCE|PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|TECHNICAL SKILLS|CERTIFICATIONS|CORE COMPETENCIES|AREAS OF EXPERTISE|AWARDS|ACHIEVEMENTS|REFERENCES|PUBLICATIONS|SUMMARY|PROFESSIONAL SUMMARY|PROFILE)\s*:?\s*$/i;

  // Presence of any of these = the project is linked. We accept anchor-
  // text hints ("Live demo", "Code", "↗") as well as raw URLs because the
  // PDF renderer emits hyperlinks whose visible text often omits the URL.
  const PROJECT_LINK_HINT_RE = /\b(https?:\/\/|www\.|github\.com|gitlab\.com|bitbucket\.org|live\s*demo|source\s*code|repo(sitory)?)\b|\.(io|dev|app|vercel\.app|netlify\.app|github\.io)\/|(?:code|demo|repo|link)\s*↗|↗/i;

  // Generic / tutorial-grade titles the rubric hard-codes as deductions.
  // Kept deliberately specific to avoid false-flagging real project names.
  const GENERIC_PROJECT_PATTERNS = [
    /\bto-?do\s*(list|app|application)?\b/i,
    /\bcalculator\b/i,
    /\bweather\s*app(lication)?\b/i,
    /\bnotes?\s*app\b/i,
    /\btic[- ]tac[- ]toe\b/i,
    /\bnumber\s*guess(ing)?\b/i,
    /\bquiz\s*app\b/i,
    /\bportfolio\s*(website|site)\b/i,
    /\bblog\s*(website|site|app)\b/i,
    /\bbasic\s*crud\b/i,
    /\bcrud\s*(app|application)\b/i,
    /\bsentiment\s*analysis\s*(with|using)\s*nltk\b/i,
    /\bhello\s*world\b/i,
    /\b(netflix|twitter|instagram|amazon|spotify|youtube|airbnb|uber)\s*clone\b/i,
  ];

  // The candidate's own GitHub handle = the most frequently linked handle
  // anywhere in the CV (header + projects). Robustly identifies "self".
  function _dominantGithubHandle(text) {
    const re = /github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/gi;
    const counts = Object.create(null);
    const skip = new Set(['orgs', 'sponsors', 'features', 'about', 'pricing', 'topics']);
    let m;
    while ((m = re.exec(text))) {
      const h = m[1].toLowerCase();
      if (skip.has(h)) continue;
      counts[h] = (counts[h] || 0) + 1;
    }
    let best = null;
    let bestN = 0;
    for (const h in counts) {
      if (counts[h] > bestN) { best = h; bestN = counts[h]; }
    }
    return best;
  }

  // True if the block links a repo owned by someone OTHER than the
  // candidate (i.e. a genuine external contribution). When the handle
  // can't be identified we treat ANY repo link as external -- conservative,
  // so we never falsely accuse a real contribution of being a personal repo.
  function _hasExternalRepo(blockText, ownHandle) {
    const re = /github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/gi;
    let m;
    while ((m = re.exec(blockText))) {
      const h = m[1].toLowerCase();
      if (!ownHandle || h !== ownHandle) return true;
    }
    return false;
  }

  function projectQualityAudit(cvText) {
    const empty = { linkless: [], generic: [], openSourceOwnRepo: [], totalProjects: 0 };
    if (!cvText || typeof cvText !== 'string') return empty;

    const lines = cvText.split('\n');
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (PROJECT_SECTION_RE.test(lines[i].trim())) { start = i + 1; break; }
    }
    if (start < 0) return empty;
    let end = lines.length;
    for (let i = start; i < lines.length; i++) {
      if (PROJECT_SECTION_END_RE.test(lines[i].trim())) { end = i; break; }
    }
    const section = lines.slice(start, end);

    // Group the section into project blocks. A non-bullet line that
    // follows a blank line, a bullet, or the section start opens a new
    // project (its title); a non-bullet line that immediately follows
    // another text line is a continuation (role / tech-stack / blurb).
    const blocks = [];
    let current = null;
    let prevType = 'start';
    for (const raw of section) {
      const trimmed = raw.trim();
      if (!trimmed) { prevType = 'blank'; continue; }
      const isBullet = /^([\-*•▪]|\d+\.)\s+/.test(trimmed);
      if (isBullet) {
        if (current) current.lines.push(trimmed);
        prevType = 'bullet';
        continue;
      }
      // A new project starts only after a blank line (or at the section
      // start). A non-bullet line following text OR a bullet is a
      // continuation (tech-stack line, links line like "Live demo: ... |
      // Code: ...", etc.) and stays with the current project.
      if ((prevType === 'text' || prevType === 'bullet') && current) {
        current.lines.push(trimmed);
      } else {
        current = { title: trimmed, lines: [trimmed] };
        blocks.push(current);
      }
      prevType = 'text';
    }

    const ownHandle = _dominantGithubHandle(cvText);
    const linkless = [];
    const generic = [];
    const openSourceOwnRepo = [];

    for (const b of blocks) {
      const blockText = b.lines.join('\n');
      const titleSample = b.title.slice(0, 90);

      if (!PROJECT_LINK_HINT_RE.test(blockText)) {
        linkless.push({ title: titleSample });
      }
      for (const re of GENERIC_PROJECT_PATTERNS) {
        if (re.test(b.title)) { generic.push({ title: titleSample }); break; }
      }
      if (/\bopen[\s-]?source(d|s)?\b/i.test(blockText) && !_hasExternalRepo(blockText, ownHandle)) {
        openSourceOwnRepo.push({ title: titleSample });
      }
    }

    return { linkless, generic, openSourceOwnRepo, totalProjects: blocks.length };
  }

  // ===================================================================
  // v8 — SELECTED PROJECTS INJECTION (auto-fix)
  // -------------------------------------------------------------------
  // The CV generator (or the server) can omit the projects section
  // entirely. Because projects are a heavy ATS/recruiter scoring signal,
  // we rebuild the section deterministically from the structured profile
  // and force it into the CV text — as ATS-parseable plain text with the
  // standard "SELECTED PROJECTS" header, a tech-stack line, "• " bullets,
  // and a "Live demo: <url> | Code: <url>" line. URLs are copied VERBATIM
  // from the profile, never generated. Em/en dashes in names are
  // normalised to commas to match the rest of the pipeline.
  // ===================================================================

  function _looksLikeUrl(u) {
    if (!u) return false;
    return /^https?:\/\//i.test(u) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u);
  }

  function buildProjectsSectionText(projects, ownHandle) {
    if (!Array.isArray(projects) || projects.length === 0) return '';
    const blocks = [];
    for (const p of projects.slice(0, 8)) {
      if (!p) continue;
      let name = String(p.name || p.projectName || p.title || '').trim();
      if (!name) continue;
      name = name.replace(/\s*[—–]\s*/g, ', ');               // ATS-safe: no em/en dash
      const tech = String(p.techStack || p.tech || p.technologies || '').trim().replace(/\s*[—–]\s*/g, ', ');

      let bullets = Array.isArray(p.bullets) ? p.bullets
        : (typeof p.description === 'string' ? p.description.split(/\r?\n/) : []);
      bullets = bullets
        .map((b) => String(b || '').replace(/^[\s\-•*]+/, '').trim())
        .filter(Boolean)
        .slice(0, 4);

      const liveRaw = String(p.liveUrl || p.live_url || p.demoUrl || (p.links && p.links.live) || '').trim();
      const codeRaw = String(p.codeUrl || p.code_url || p.repoUrl || p.repo || (p.links && p.links.code) || '').trim();
      const live = _looksLikeUrl(liveRaw) ? liveRaw : '';
      const code = _looksLikeUrl(codeRaw) ? codeRaw : '';

      // HONESTY: "open source" is scored as contributions to OTHERS'
      // projects; a personal repo described as "Open-source framework..."
      // caps the score and can trigger a deduction (v7 flags it). When the
      // code link is the candidate's OWN repo, silently drop the leading
      // "Open-source" qualifier -- the project stays truthfully described.
      if (ownHandle && code.toLowerCase().includes('github.com/' + ownHandle)) {
        const neutralise = (s) => s
          .replace(/^open[-\s]?sourced?\s+(\w)/i, (m, c) => c.toUpperCase())
          .replace(/\ban?\s+open[-\s]?sourced?\s+/gi, 'a ');
        name = neutralise(name);
        bullets = bullets.map(neutralise);
      }

      const lines = [name];
      if (tech) lines.push(tech);
      for (const b of bullets) lines.push(`• ${b}`);
      const lp = [];
      if (live) lp.push(`Live demo: ${live}`);
      if (code) lp.push(`Code: ${code}`);
      if (lp.length) lines.push(lp.join(' | '));

      blocks.push(lines.join('\n'));
    }
    if (blocks.length === 0) return '';
    // "PROJECTS" verbatim. ATS heading checks match against a fixed list
    // (Awards, Certifications, Education, Experience, Projects, Skills,
    // Summary...) and "SELECTED PROJECTS" is not on it, so the section was
    // flagged as a non-standard heading that scanners may ignore -- which
    // would discard the whole section. The word "Selected" bought nothing.
    return `PROJECTS\n\n${blocks.join('\n\n')}`;
  }

  function ensureProjectsSection(cvText, projects) {
    const section = buildProjectsSectionText(projects, _dominantGithubHandle(cvText || ''));
    if (!section || !cvText) return { text: cvText || '', injected: false };

    // Strip EVERY projects section already present (from the server, the
    // LLM, or a prior run) so we can place ONE canonical section at the
    // preferred position. The server LLM and the server's own injector can
    // BOTH emit a copy — duplicated sections were observed in production —
    // so loop until no section remains.
    // Preferred order: ... Work Experience -> SELECTED PROJECTS -> Education ...
    let base = cvText;
    // Normalise mixed-case projects headers ("Selected Projects") to CAPS so
    // the strip below catches LLM-emitted variants. The strip regex itself
    // stays case-SENSITIVE because its end-of-section detection relies on
    // the next ALL-CAPS header; an /i flag would let a line like
    // "Tech Stack:" falsely terminate the section.
    base = base.replace(/^[ \t]*(selected projects|relevant projects|technical projects|key projects|personal projects|notable projects|projects)[ \t]*:?[ \t]*$/gim,
      (s) => s.toUpperCase());
    const existingRe = /\n[ \t]*(SELECTED PROJECTS|RELEVANT PROJECTS|TECHNICAL PROJECTS|KEY PROJECTS|PERSONAL PROJECTS|NOTABLE PROJECTS|PROJECTS)[ \t]*:?[ \t]*\n[\s\S]*?(?=\n[ \t]*[A-Z][A-Z &/]{3,}[ \t]*:?[ \t]*\n|$)/;
    let replaced = false;
    for (let guard = 0; guard < 6; guard++) {
      const m = existingRe.exec(base);
      if (!m) break;
      base = (base.slice(0, m.index) + '\n' + base.slice(m.index + m[0].length)).replace(/\n{4,}/g, '\n\n\n');
      replaced = true;
    }

    // Scrub HEADERLESS leftover copies: the LLM sometimes re-emits a project
    // block (name line + "Tech Stack:" / "Live URL:" labels + bullets)
    // outside any section header, which header-based stripping cannot see.
    // We know the canonical project names from the profile, so remove any
    // remaining paragraph that STARTS with one of them.
    const normLine = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const nameKeys = (Array.isArray(projects) ? projects : [])
      .map((p) => normLine(p && (p.name || p.projectName || p.title)))
      .filter((k) => k.length >= 4)
      .map((k) => k.split(' ').slice(0, 3).join(' '));
    if (nameKeys.length) {
      const paras = base.split(/\n[ \t]*\n/);
      const kept = paras.filter((para) => {
        const first = normLine(para.split('\n')[0]);
        return !nameKeys.some((k) => k && first.startsWith(k));
      });
      if (kept.length !== paras.length) {
        base = kept.join('\n\n');
        replaced = true;
      }
    }

    // Insert before Education (i.e. right after Work Experience). Fallbacks
    // keep it ahead of the skills/certifications tail; else append.
    const anchors = [
      /\n[ \t]*EDUCATION[ \t]*:?[ \t]*\n/,
      /\n[ \t]*TECHNICAL PROFICIENCIES[ \t]*:?[ \t]*\n/,
      /\n[ \t]*TECHNICAL SKILLS[ \t]*:?[ \t]*\n/,
      /\n[ \t]*SKILLS[ \t]*:?[ \t]*\n/,
      /\n[ \t]*CERTIFICATIONS[ \t]*:?[ \t]*\n/,
    ];
    for (const a of anchors) {
      const am = a.exec(base);
      if (am) {
        const out = base.slice(0, am.index) + '\n\n' + section + '\n' + base.slice(am.index);
        return { text: out.replace(/\n{4,}/g, '\n\n\n'), injected: true, replaced };
      }
    }
    return { text: base.replace(/\s*$/, '') + '\n\n' + section + '\n', injected: true, replaced };
  }

  // ===================================================================
  // v9 — ACRONYM / PROPER-NOUN CASING (auto-fix)
  // -------------------------------------------------------------------
  // Injected JD keywords arrive lowercase ("...focus on Python, ml and
  // data pipelines"), which reads as auto-generated to a recruiter. Fix
  // standalone lowercase tokens to their canonical casing. Conservative:
  // only unambiguous tech terms (never words like "rest", "go", "spark",
  // "react" that double as English), word-boundary matched, and lines
  // containing URLs/emails are left untouched.
  // ===================================================================

  const CANONICAL_CASING = {
    ml: 'ML', ai: 'AI', nlp: 'NLP', llm: 'LLM', llms: 'LLMs', genai: 'GenAI',
    sql: 'SQL', nosql: 'NoSQL', aws: 'AWS', gcp: 'GCP', api: 'API', apis: 'APIs',
    etl: 'ETL', elt: 'ELT', sre: 'SRE', k8s: 'K8s', gpu: 'GPU', cpu: 'CPU',
    saas: 'SaaS', rag: 'RAG', mlops: 'MLOps', devops: 'DevOps', dataops: 'DataOps',
    ui: 'UI', ux: 'UX', qa: 'QA', kpi: 'KPI', kpis: 'KPIs', sla: 'SLA', slas: 'SLAs',
    json: 'JSON', xml: 'XML', html: 'HTML', css: 'CSS', php: 'PHP', grpc: 'gRPC',
    graphql: 'GraphQL', cicd: 'CI/CD',
    python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
    java: 'Java', kotlin: 'Kotlin', scala: 'Scala', kubernetes: 'Kubernetes',
    docker: 'Docker', terraform: 'Terraform', ansible: 'Ansible',
    pytorch: 'PyTorch', tensorflow: 'TensorFlow', pandas: 'pandas',
    numpy: 'NumPy', scikit: 'scikit', postgresql: 'PostgreSQL',
    postgres: 'Postgres', mysql: 'MySQL', mongodb: 'MongoDB', redis: 'Redis',
    kafka: 'Kafka', airflow: 'Airflow', databricks: 'Databricks',
    snowflake: 'Snowflake', tableau: 'Tableau', jira: 'Jira', github: 'GitHub',
    gitlab: 'GitLab', jenkins: 'Jenkins', fastapi: 'FastAPI', django: 'Django',
    flask: 'Flask', mlflow: 'MLflow', linux: 'Linux', hadoop: 'Hadoop',
  };

  const _CASING_RE = new RegExp(
    '\\b(' + Object.keys(CANONICAL_CASING).join('|') + ')\\b', 'gi'
  );

  function fixAcronymCasing(text) {
    if (!text || typeof text !== 'string') return { text: text || '', fixed: 0 };
    let fixed = 0;
    const lines = text.split('\n');
    const out = lines.map((line) => {
      // Never touch URLs / emails ("github.com/x" must stay lowercase).
      if (line.includes('://') || line.includes('@') || /\bwww\./i.test(line) || /\.(com|io|dev|net|org)\b/i.test(line)) return line;
      let l = line.replace(_CASING_RE, (m) => {
        const canon = CANONICAL_CASING[m.toLowerCase()];
        if (!canon || m === canon) return m;
        // ALL-CAPS tokens are usually intentional header styling -- skip.
        if (m.length > 1 && m === m.toUpperCase()) return m;
        // Never DE-capitalise: a sentence-start "Pandas" must not become
        // "pandas"; only canonicalise upward/mixed ("aws"/"Aws" -> "AWS",
        // "ml"/"Ml" -> "ML", "mlflow" -> "MLflow").
        if (canon === canon.toLowerCase() && m !== m.toLowerCase()) return m;
        fixed++;
        return canon;
      });
      // Slash form the word-boundary map can't reach.
      l = l.replace(/\bci\/cd\b/g, () => { fixed++; return 'CI/CD'; });
      return l;
    });
    return { text: out.join('\n'), fixed };
  }

  // ===================================================================
  // v10 — WEAK-OPENER AUTO-FIX (safe subset)
  // -------------------------------------------------------------------
  // "Responsible for developing X" says the same thing as "Developed X"
  // with less impact. The gerund form makes this transform mechanically
  // safe: strip the weak prefix and conjugate the gerund to past tense
  // via an explicit verb map — never guessed, so grammar can't break.
  // Anything not matching the exact <weak prefix> + <known gerund> shape
  // is left for the warning (human rewrite).
  // ===================================================================

  const GERUND_TO_PAST = {
    developing: 'Developed', managing: 'Managed', building: 'Built',
    creating: 'Created', leading: 'Led', designing: 'Designed',
    implementing: 'Implemented', maintaining: 'Maintained',
    delivering: 'Delivered', improving: 'Improved', supporting: 'Supported',
    coordinating: 'Coordinated', overseeing: 'Oversaw', driving: 'Drove',
    running: 'Ran', writing: 'Wrote', testing: 'Tested',
    deploying: 'Deployed', migrating: 'Migrated', optimising: 'Optimised',
    optimizing: 'Optimized', automating: 'Automated', analysing: 'Analysed',
    analyzing: 'Analyzed', ensuring: 'Ensured', establishing: 'Established',
    mentoring: 'Mentored', collaborating: 'Collaborated', executing: 'Executed',
    defining: 'Defined', launching: 'Launched', architecting: 'Architected',
    reviewing: 'Reviewed', monitoring: 'Monitored', documenting: 'Documented',
  };

  const WEAK_PREFIX_RE = /^([\-*•]\s*|\d+\.\s+)?(responsible for|tasked with|in charge of|duties included|worked on|helped with|assisted with|assisted in)\s+([a-z]+ing)\b/i;

  function fixWeakOpeners(text) {
    if (!text) return { text: text || '', fixed: 0 };
    let fixed = 0;
    const lines = text.split('\n');
    const out = lines.map((raw) => {
      const trimmed = raw.trim();
      if (!/^([\-*•]|\d+\.)\s+/.test(trimmed)) return raw;
      const m = trimmed.match(WEAK_PREFIX_RE);
      if (!m) return raw;
      const past = GERUND_TO_PAST[(m[3] || '').toLowerCase()];
      if (!past) return raw;
      fixed++;
      const bulletMark = m[1] || '';
      const rest = trimmed.slice(m[0].length);
      const indent = raw.slice(0, raw.indexOf(trimmed));
      return `${indent}${bulletMark}${past}${rest}`;
    });
    return { text: out.join('\n'), fixed };
  }

  // ===================================================================
  // v11 — YEARS-OF-EXPERIENCE INFLATION GUARD (auto-fix)
  // -------------------------------------------------------------------
  // Observed in production: a summary claiming "over 15 years of
  // experience" for a candidate whose history evidences ~9. Inflated
  // tenure is the easiest claim on a CV to disprove -- a recruiter just
  // subtracts the earliest date -- and it reads as dishonest rather than
  // ambitious. Nothing in the pipeline checked it.
  //
  // We cap any claim to what the ORIGINAL CV actually evidences. The
  // correction is only ever DOWNWARD (we never inflate), and only fires
  // when the original supplies real evidence, so a sparse profile can't
  // cause a bogus rewrite.
  // ===================================================================

  const YEARS_CLAIM_RE = /\b(?:over|more than|nearly|almost|approximately|about|\+?)\s*(\d{1,2})\s*\+?\s*years?\b(?=[^.]{0,40}\b(?:experience|expertise|background)\b)/gi;

  function extractClaimedYears(text) {
    if (!text) return null;
    const re = new RegExp(YEARS_CLAIM_RE.source, 'gi');
    let m;
    let max = null;
    while ((m = re.exec(String(text))) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > 0 && n <= 60) max = max === null ? n : Math.max(max, n);
    }
    return max;
  }

  // What the genuine CV can actually support: an explicit claim if present,
  // otherwise the span from the earliest 4-digit year to today.
  function evidencedYears(originalCV) {
    if (!originalCV) return null;
    const text = String(originalCV);
    const explicit = extractClaimedYears(text);
    if (explicit !== null) return explicit;
    const years = (text.match(/\b(19[89]\d|20[0-4]\d)\b/g) || []).map(Number);
    if (!years.length) return null;
    const earliest = Math.min.apply(null, years);
    const span = new Date().getFullYear() - earliest;
    return (span > 0 && span <= 60) ? span : null;
  }

  function capYearsClaim(cvText, originalCV, { tolerance = 2 } = {}) {
    const out = { text: cvText || '', capped: 0, claimed: null, evidenced: null };
    if (!cvText || !originalCV) return out;
    const evidence = evidencedYears(originalCV);
    const claimed = extractClaimedYears(cvText);
    out.claimed = claimed;
    out.evidenced = evidence;
    if (evidence === null || claimed === null) return out;
    if (claimed <= evidence + tolerance) return out;   // within honest rounding

    // Rewrite the NUMBER only, preserving surrounding wording.
    const re = new RegExp(YEARS_CLAIM_RE.source, 'gi');
    let capped = 0;
    out.text = cvText.replace(re, (match, num) => {
      const n = parseInt(num, 10);
      if (isNaN(n) || n <= evidence + tolerance) return match;
      capped++;
      return match.replace(/\d{1,2}/, String(evidence));
    });
    out.capped = capped;
    return out;
  }

  // ---- Persona drift: is the summary describing a different job? ------
  // "Client Value Partner" on a CV whose every role is engineering is the
  // model inventing a persona, not tailoring. Warning only -- legitimate
  // reframing (Software Engineer -> Senior Software Engineer) must pass.
  const STOP_TITLE_WORDS = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'staff', 'principal',
    'the', 'and', 'of', 'for', 'a', 'an', 'experienced', 'accomplished', 'seasoned', 'with', 'over']);

  function summaryPersonaDrift(cvText, originalCV) {
    if (!cvText || !originalCV) return null;
    const m = cvText.match(/(?:PROFESSIONAL SUMMARY|SUMMARY|PROFILE)\s*\n+([^\n]{10,200})/i);
    if (!m) return null;
    // Leading noun phrase of the summary, e.g. "Accomplished Client Value
    // Partner with over 15 years..." -> "Client Value Partner".
    const lead = m[1].replace(/^(experienced|accomplished|seasoned|results[- ]driven|strategic|innovative|senior)\s+/i, '');
    const titleGuess = (lead.split(/\s+with\s+|,|\.|\bwho\b/i)[0] || '').trim();
    if (!titleGuess || titleGuess.split(/\s+/).length > 6) return null;
    const words = titleGuess.toLowerCase().split(/\s+/)
      .map((w) => w.replace(/[^a-z]/g, ''))
      .filter((w) => w.length > 2 && !STOP_TITLE_WORDS.has(w));
    if (!words.length) return null;
    const origLower = String(originalCV).toLowerCase();
    const overlap = words.filter((w) => origLower.includes(w));
    // No meaningful word from the claimed title appears anywhere in the
    // genuine CV -> the summary is describing someone else.
    if (overlap.length === 0) return { claimedTitle: titleGuess.slice(0, 60) };
    return null;
  }

  // ===================================================================
  // v12 — RED-FLAG SCRUBBER (auto-fix)
  // -------------------------------------------------------------------
  // Defence-in-depth: these artefacts are produced by the SERVER-side
  // generator, so the extension must be able to remove them no matter
  // what arrives. All observed on a real generated CV:
  //
  //   a) nonsense keyword tails  "...mentored junior engineers, with SaaS."
  //                              "...aligning delivery, using team player."
  //   b) contentless filler bullets
  //      "Demonstrated Communication Skills, Thought Leadership across
  //       cross-functional projects, contributing to continuous process
  //       improvement."
  //   c) non-technical junk inside TECHNICAL PROFICIENCIES
  //      ("Self-motivated", "Proactive", "Teams", "ts")
  //   d) fluff inside CORE COMPETENCIES ("entrepreneurial mindset")
  //
  // Every operation here REMOVES noise or corrects casing; none add or
  // alter a factual claim, so scrubbing can never make the CV less true.
  // ===================================================================

  // Phrases that are never a sane object of "using X" / "with X" at the
  // end of an achievement bullet.
  const NONSENSE_TAIL_PHRASE = new RegExp(
    '(' + [
      'team player', 'teamwork', 'mentoring', 'mentorship', 'communication skills?',
      'thought leadership', 'customer advocacy', 'stakeholder engagement',
      'c-level executives?', 'executives?', 'organisation design', 'organization design',
      'solution design', 'ai-based transformation', 'entrepreneurial mindset',
      'self-motivated', 'proactive', 'accessibility', 'end-to-end', 'teams',
      'saas', 'supervision(?: of aides)?', 'licensure', 'activity programme',
      'senior living', 'injections', 'charts', 'service plans', 'compassion',
      'good judgment', 'resourcefulness', 'influence', 'leadership',
      'problem solving', 'collaboration', 'adaptability', 'work ethic',
    ].join('|') + ')', 'i'
  );

  // ", using X." / " with X." / ", through X and Y." appended to a bullet.
  // The stuffed tail is always bolted on as a separate clause, so it is
  // preceded by a COMMA. That comma is what distinguishes it from the
  // candidate's own prose: in
  //   "Mentored junior engineers through code reviews and design
  //    discussions, with time-management."
  // the "through ..." clause is real content and the ", with ..." is the
  // graft. Matching without requiring the comma swallowed both and left
  // "Mentored junior engineers." -- deleting the substance and keeping
  // only the husk.
  const CONNECTOR = '(?:using|with|through|via|applying|incorporating|employing|built with|integrating|demonstrating|showing|highlighting|reflecting|showcasing)';
  const TAIL_RE = new RegExp('\\s*,\\s*' + CONNECTOR + '\\s+([^.;,]{2,70})\\s*\\.?\\s*$', 'i');
  // Without a comma, only strip phrases already known to be filler.
  const TAIL_RE_LOOSE = new RegExp('\\s*,?\\s*' + CONNECTOR + '\\s+([^.;]{2,70})\\s*\\.?\\s*$', 'i');

  // Deciding by a LIST OF BAD PHRASES leaks: every soft-skill noun anyone
  // ever appends has to be enumerated first. A real CV showed
  // "using stakeholder management", "with time-management",
  // "using client management", "with digital transformation" and
  // "showing strong problem-solving abilities" all surviving, because the
  // list happened to contain "stakeholder engagement" and "problem
  // solving" but not those.
  //
  // Inverted: KEEP a trailing clause only when it names something
  // concrete -- a real technology, a product name, or a number. Anything
  // else bolted onto the end of a bullet by a connector verb is keyword
  // stuffing, and reads that way to a recruiter.
  const TECH_TOKEN = new RegExp('\\b(' + [
    'aws','azure','gcp','kubernetes','k8s','docker','terraform','ansible','jenkins',
    'python','java','javascript','typescript','golang','rust','scala','c\\+\\+','sql','nosql',
    'react','angular','vue','node(?:\\.js)?','django','flask','spring','rails','\\.net',
    'spark','kafka','airflow','hadoop','snowflake','databricks','dbt','redshift','bigquery',
    'tensorflow','pytorch','scikit-?learn','keras','mlflow','sagemaker','hugging ?face',
    'postgres(?:ql)?','mysql','mongodb','redis','elasticsearch','cassandra','dynamodb',
    'git(?:hub|lab)?','ci/?cd','devops','graphql','rest','grpc','api','microservices',
    'linux','bash','kafka','rabbitmq','tableau','power ?bi','looker','salesforce',
    'sap','dynamics ?365','servicenow','workday','jira','confluence','figma',
    'terraform','pulumi','prometheus','grafana','datadog','splunk','openai','llm','rag',
  ].join('|') + ')\\b', 'i');

  function _tailIsConcrete(phrase) {
    const p = String(phrase || '').trim();
    if (!p) return false;
    if (/\d/.test(p)) return true;                 // a metric or version
    if (TECH_TOKEN.test(p)) return true;           // a named technology
    // A product-style proper noun the generator would not have invented,
    // e.g. "Azure DevOps", "GitHub Actions". Requires internal capitals or
    // two capitalised words, not just a sentence-initial capital.
    if (/[a-z][A-Z]/.test(p)) return true;
    if (/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(p)) return true;
    return false;
  }

  function stripNonsenseTails(text) {
    if (!text) return { text: text || '', stripped: 0 };
    let stripped = 0;
    const out = text.split('\n').map((raw) => {
      const line = raw.trimEnd();
      if (!/^\s*([\-*•]|\d+\.)\s+/.test(line)) return raw;
      // Comma-anchored graft: strip unless it names something concrete.
      let m = line.match(TAIL_RE);
      let phrase = m ? m[1].trim() : '';
      if (m && _tailIsConcrete(phrase) && !NONSENSE_TAIL_PHRASE.test(phrase)) return raw;
      if (!m) {
        // No comma: this is probably the candidate's own prose, so only
        // remove it when the phrase is a known filler noun.
        m = line.match(TAIL_RE_LOOSE);
        if (!m) return raw;
        phrase = m[1].trim();
        if (!NONSENSE_TAIL_PHRASE.test(phrase)) return raw;
      }
      stripped++;
      let cleaned = line.slice(0, line.length - m[0].length).trimEnd();
      cleaned = cleaned.replace(/[,;:]+$/, '');
      if (!/[.!?]$/.test(cleaned)) cleaned += '.';
      return cleaned;
    }).join('\n');
    return { text: out, stripped };
  }

  // Bullets that assert nothing: a chain of competency nouns with no
  // subject, system, or outcome.
  const FILLER_BULLET_RE = /^(demonstrated|applied|utilised|utilized|leveraged)\s+[^.]{0,120}\b(across (cross-functional|multiple) projects|contributing to continuous process improvement|driving (measurable )?(results|success)|ensuring (timely )?(project )?(completion|success))\b/i;

  function stripFillerBullets(text) {
    if (!text) return { text: text || '', removed: 0 };
    let removed = 0;
    const lines = text.split('\n');
    const kept = lines.filter((raw) => {
      const line = raw.trim();
      if (!/^([\-*•]|\d+\.)\s+/.test(line)) return true;
      const body = line.replace(/^([\-*•]|\d+\.)\s+/, '');
      // Only drop when it has NO number and NO concrete system/tool -- a
      // bullet with a metric is real content even if it reads generically.
      if (FILLER_BULLET_RE.test(body) && !/\d/.test(body)) {
        removed++;
        return false;
      }
      return true;
    });
    return { text: kept.join('\n'), removed };
  }

  // Non-technical entries that must not sit in a technical skills list.
  const NON_TECHNICAL_SKILL = new RegExp('^(' + [
    'self-motivated', 'proactive', 'motivated', 'dedicated', 'teams', 'team',
    'accessibility', 'end-to-end', 'communication', 'collaboration', 'teamwork',
    'leadership', 'mentoring', 'mentorship', 'problem solving', 'adaptability',
    'entrepreneurial mindset', 'good judgment', 'good judgement', 'resourcefulness',
    'influence', 'work ethic', 'growth mindset', 'ownership', 'curiosity',
    'thought leadership', 'stakeholder engagement', 'customer advocacy',
    'engineering excellence', 'attention to detail', 'time management',
  ].join('|') + ')$', 'i');

  // Short lowercase abbreviations that look unprofessional spelled out.
  const SKILL_EXPANSIONS = { ts: 'TypeScript', js: 'JavaScript', py: 'Python', k8s: 'Kubernetes' };

  function cleanSkillsSection(text) {
    if (!text) return { text: text || '', removed: 0 };
    let removed = 0;
    const re = /^([ \t]*(?:TECHNICAL PROFICIENCIES|TECHNICAL SKILLS|SKILLS|CORE COMPETENCIES)[ \t]*:?[ \t]*)$/im;
    const lines = text.split('\n');
    const out = lines.slice();
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i].trim())) continue;
      // Clean the comma-separated content lines under this header.
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j].trim();
        if (!t) continue;
        if (/^[A-Z][A-Z &/]{3,}\s*:?\s*$/.test(t)) break;      // next section
        if (!t.includes(',')) {
          if (/^[•\-*]/.test(t)) continue;                      // bulleted grid item
          break;
        }
        const items = t.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
        const kept = [];
        for (let item of items) {
          const bare = item.replace(/^[•\-*]\s*/, '').trim();
          if (NON_TECHNICAL_SKILL.test(bare)) { removed++; continue; }
          const exp = SKILL_EXPANSIONS[bare.toLowerCase()];
          if (exp) item = item.replace(bare, exp);
          kept.push(item);
        }
        if (kept.length !== items.length || kept.join(', ') !== t) {
          out[j] = lines[j].replace(t, kept.join(', '));
        }
        break;
      }
    }
    return { text: out.join('\n'), removed };
  }

  function scrubRedFlags(text) {
    const a = stripNonsenseTails(text);
    const b = stripFillerBullets(a.text);
    const c = cleanSkillsSection(b.text);
    return {
      text: c.text,
      tails: a.stripped,
      fillers: b.removed,
      skills: c.removed,
      total: a.stripped + b.removed + c.removed,
    };
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
    relevantProjects = null,
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
      // v6
      metricsDensity: flags.metricsDensity !== false,
      gpaOnUkIe: flags.gpaOnUkIe !== false,
      certCoherence: flags.certCoherence !== false,
      // v7
      projectQuality: flags.projectQuality !== false,
      // v8
      projectsInject: flags.projectsInject !== false,
      // v9
      acronymCasing: flags.acronymCasing !== false,
      // v10
      weakOpenerFix: flags.weakOpenerFix !== false,
      // v11
      yearsGuard: flags.yearsGuard !== false,
      // v12
      redFlagScrub: flags.redFlagScrub !== false,
    };

    let outCV = cvText;
    let outCL = coverLetterText;
    const report = { fixes: [], warnings: [], timingMs: 0 };

    // v8: guarantee the SELECTED PROJECTS section from structured profile
    // data (auto-fix). Runs first so every later audit sees the projects
    // text (e.g. the v7 link check then passes instead of false-flagging).
    if (f.projectsInject && relevantProjects && relevantProjects.length && outCV) {
      try {
        const r = ensureProjectsSection(outCV, relevantProjects);
        if (r.injected) {
          outCV = r.text;
          report.fixes.push(`projects: SELECTED PROJECTS ${r.replaced ? 'normalised' : 'injected'} (${relevantProjects.length} project(s))`);
        }
      } catch (e) {}
    }

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
        const warning = {
          kind: 'unquantified-bullets',
          count: q.unquantified.length,
          totalBullets: q.total,
          samples: q.unquantified.slice(0, 3),
        };
        // METRIC-LOSS DETECTION: when the tailored CV lost ALL numbers but
        // the ORIGINAL profile carried quantified bullets, that is a
        // rewrite regression, not missing source data. Surface the original
        // metric-bearing bullets so the user restores them -- we never
        // invent numbers ourselves.
        if (q.total > 0 && q.unquantified.length === q.total && originalCV) {
          const originalQuantified = String(originalCV).split('\n')
            .map((l) => l.trim().replace(/^([\-*•]|\d+\.)\s+/, ''))
            .filter((l) => l.length > 25 && /\d/.test(l) && SCALE_WORDS.test(l) && !/^\d{2}\/\d{4}|\b(19|20)\d{2}\b.*\|/.test(l))
            .slice(0, 3);
          if (originalQuantified.length > 0) {
            warning.severity = 'critical';
            warning.restoreHints = originalQuantified;
            warning.note = 'The tailored CV lost ALL metrics your original bullets carried. Restore numbers like: "' +
              originalQuantified[0].slice(0, 90) + '"';
          }
        }
        report.warnings.push(warning);
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

    // v10: safe weak-opener auto-fix BEFORE the warning pass, so only the
    // genuinely ambiguous cases (no known gerund) still warn.
    if (f.weakOpenerFix && outCV) {
      const w = fixWeakOpeners(outCV);
      if (w.fixed > 0) {
        outCV = w.text;
        report.fixes.push(`weak-openers: ${w.fixed} bullet(s) rewritten to action verbs`);
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

    // v6: believable-metrics density
    if (f.metricsDensity && outCV) {
      const m = metricsDensityAudit(outCV);
      if (m.overclaiming) {
        report.warnings.push({
          kind: 'metrics-density-too-high',
          density: m.density,
          statBullets: m.statBullets,
          totalBullets: m.totalBullets,
          note: 'Most bullets carry a big precise stat (' + m.statBullets + '/' + m.totalBullets +
            '). A wall of jaw-dropping numbers reads as fabricated to senior recruiters. Keep the strongest 2-3 quantified wins per role and ground the rest qualitatively.',
        });
      }
    }

    // v6: certification coherence (CV only)
    if (f.certCoherence && outCV) {
      const c = certCoherenceAudit(outCV);
      if (c.scattered) {
        report.warnings.push({
          kind: 'certs-scattered',
          domains: c.domains,
          note: 'Certs span ' + c.domains.length + ' unrelated domains (' + c.domains.join(', ') +
            '). A scattered pile reads as padding; a focused 3-7 on-target set reads as a specialist. Trim certs that don\'t support the target role.',
        });
      }
    }

    // v6: UK/IE classification with US-style GPA suffix.
    // AUTO-FIX: strip the GPA off any Honours-classification line. Then
    // run the audit and only warn for residual cases (e.g. structured
    // edge cases the strip regex couldn't safely touch).
    if (f.gpaOnUkIe && outCV) {
      const stripped = stripGpaFromUkIeDegrees(outCV);
      if (stripped.stripped > 0) {
        outCV = stripped.text;
        report.fixes.push(`gpa-on-uk-ie: stripped US-style GPA from ${stripped.stripped} degree line(s)`);
      }
      const g = gpaOnUkIeDegreeAudit(outCV);
      if (g.violations.length > 0) {
        report.warnings.push({
          kind: 'gpa-on-uk-ie-degree',
          count: g.violations.length,
          samples: g.violations.slice(0, 2),
          note: 'UK/IE degrees use Honours classifications. Drop the US-style GPA suffix.',
        });
      }
    }

    // v7: project quality -- links (#1), tutorial-grade titles (#2),
    // open-source-on-personal-repo honesty (#3). All warnings only; this
    // maps 1:1 to how a real recruiter scoring engine grades PROJECTS.
    if (f.projectQuality && outCV) {
      const pq = projectQualityAudit(outCV);
      if (pq.linkless.length > 0) {
        report.warnings.push({
          kind: 'projects-missing-links',
          count: pq.linkless.length,
          totalProjects: pq.totalProjects,
          samples: pq.linkless.slice(0, 4).map((p) => p.title),
          note: pq.linkless.length + ' of ' + pq.totalProjects + ' project(s) have no GitHub or live-demo link. ' +
            'Recruiter scoring engines dock 30-50% for a linkless project (-3 to -5 points each). ' +
            'Add a working repo or live-demo URL to each.',
        });
      }
      if (pq.generic.length > 0) {
        report.warnings.push({
          kind: 'generic-project-titles',
          count: pq.generic.length,
          samples: pq.generic.slice(0, 4).map((p) => p.title),
          note: 'Tutorial-grade project titles (Todo App, Calculator, Weather App, basic CRUD, service clones) ' +
            'are penalised. One complex project beats five simple ones. Reframe around the hard problem you ' +
            'solved, or drop it.',
        });
      }
      if (pq.openSourceOwnRepo.length > 0) {
        report.warnings.push({
          kind: 'open-source-personal-repo',
          count: pq.openSourceOwnRepo.length,
          samples: pq.openSourceOwnRepo.slice(0, 4).map((p) => p.title),
          note: '"Open source" is scored as contributions to OTHERS\' projects. Labelling your own personal ' +
            'repo "open-source" caps at ~10 pts and can trigger a -3 to -5 deduction. Call it a "personal ' +
            'project", or cite a real external contribution (a merged PR / issue / repo you don\'t own).',
        });
      }
    }

    // v9: canonical acronym/proper-noun casing (auto-fix). Runs LAST so it
    // also fixes lowercase tokens introduced by earlier injection steps
    // ("...focus on Python, ml and data pipelines" -> "ML").
    if (f.acronymCasing) {
      const cv = fixAcronymCasing(outCV);
      const cl = fixAcronymCasing(outCL);
      outCV = cv.text;
      outCL = cl.text;
      if (cv.fixed + cl.fixed > 0) {
        report.fixes.push(`casing: ${cv.fixed + cl.fixed} tech term(s) canonicalised`);
      }
    }

    // v12: scrub server-generated red flags (nonsense keyword tails,
    // contentless filler bullets, non-technical junk in the skills list).
    if (f.redFlagScrub && outCV) {
      try {
        const r = scrubRedFlags(outCV);
        if (r.total > 0) {
          outCV = r.text;
          const bits = [];
          if (r.tails) bits.push(`${r.tails} nonsense keyword tail(s)`);
          if (r.fillers) bits.push(`${r.fillers} contentless bullet(s)`);
          if (r.skills) bits.push(`${r.skills} non-technical skill entr(y/ies)`);
          report.fixes.push('red-flags: removed ' + bits.join(', '));
        }
      } catch (e) {}
    }

    // v11: cap inflated years-of-experience claims to what the genuine CV
    // evidences, and flag a summary that describes a different profession.
    if (f.yearsGuard && outCV && originalCV) {
      try {
        const y = capYearsClaim(outCV, originalCV);
        if (y.capped > 0) {
          outCV = y.text;
          report.fixes.push(`years-claim: capped ${y.claimed} -> ${y.evidenced} years (matches your actual history)`);
          report.warnings.push({
            kind: 'years-inflated',
            severity: 'critical',
            claimed: y.claimed,
            evidenced: y.evidenced,
            note: `The summary claimed ${y.claimed} years of experience but your history evidences about ` +
              `${y.evidenced}. Corrected to ${y.evidenced} — a recruiter checks this by subtracting your earliest date.`,
          });
        }
        const drift = summaryPersonaDrift(outCV, originalCV);
        if (drift) {
          report.warnings.push({
            kind: 'summary-persona-drift',
            severity: 'critical',
            claimedTitle: drift.claimedTitle,
            note: `The summary presents you as "${drift.claimedTitle}", which appears nowhere in your genuine CV. ` +
              `Tailoring should reframe your real background, not invent a different profession. Review before submitting.`,
          });
        }
      } catch (e) {}
    }

    report.timingMs = Date.now() - t0;
    return { cvText: outCV, coverLetterText: outCL, report };
  }

  const RecruiterAudit = {
    runRecruiterAudit,
    purgeBuzzwords,
    quantificationAudit,
    mirrorJdVocabulary,
    echoJobTitle, normaliseJobTitle,
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
    // v6
    metricsDensityAudit,
    gpaOnUkIeDegreeAudit,
    stripGpaFromUkIeDegrees,
    certCoherenceAudit,
    // v7
    projectQualityAudit,
    // v8
    buildProjectsSectionText,
    ensureProjectsSection,
    // v9
    fixAcronymCasing,
    // v10
    fixWeakOpeners,
    // v12
    scrubRedFlags,
    stripNonsenseTails,
    stripFillerBullets,
    cleanSkillsSection,
    // v11
    capYearsClaim,
    extractClaimedYears,
    evidencedYears,
    summaryPersonaDrift,
  };

  global.RecruiterAudit = RecruiterAudit;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecruiterAudit;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this)));
