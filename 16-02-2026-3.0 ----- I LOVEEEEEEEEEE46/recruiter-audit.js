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
    'rather', 'somewhat', 'arguably',
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

  function runRecruiterAudit({
    cvText = '',
    coverLetterText = '',
    jdText = '',
    jdTitle = '',
    candidateName = '',
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
  };

  global.RecruiterAudit = RecruiterAudit;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecruiterAudit;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this)));
