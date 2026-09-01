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
    // ---- "track record", in every form -------------------------------
    // Banned outright, not softened. The system used to MANUFACTURE it:
    // the prompt listed "track record" as the approved replacement for
    // "proven track record", the prompt's own example summary opened
    // "Strong track record in designing scalable solutions" (models copy
    // examples), two client-side maps rewrote "proven track record" into
    // it, and two hard-coded fallback paragraphs contained it. Removing
    // the qualifier while keeping the phrase was never going to work.
    //
    // Ordered longest-first so the article and qualifier are consumed
    // with it -- replacing only the phrase would leave "with a
    // experience of".
    // The preposition has to survive or be re-chosen. "track record of
    // delivering" -> "experience delivering" reads correctly because the
    // next word is a gerund, but the same rule turns "track record with
    // Kubernetes" into "experience Kubernetes". So look at what follows.
    [/\b(?:(?:a|an)\s+)?(?:(?:proven|strong|demonstrated|successful|solid|consistent|excellent|established|long)\s+)?track\s+record\s+(of|in|with|for)\s+(?=(\w+))/gi,
      (_m, prep, next) => (/ing$/i.test(next)
        ? 'experience '                       // experience delivering
        : 'experience ' + (/^(?:for)$/i.test(prep) ? 'in' : prep.toLowerCase()) + ' ')],
    [/\b(?:a|an)\s+(?:(?:proven|strong|demonstrated|successful|solid|consistent|excellent|established|long)\s+)?track\s+record\b/gi, 'experience'],
    [/\b(?:proven|strong|demonstrated|successful|solid|consistent|excellent|established|long)\s+track\s+record\b/gi, 'experience'],
    [/\btrack\s+record\b/gi, 'experience'],
    [/\bextensive experience\b/gi, 'experience'],
    [/\bsubject matter expert\b/gi, 'expert'],
    [/\b(strong|excellent|great|outstanding) (communication|interpersonal) skills\b/gi, ''],

    // ---- the verbs that read as machine-written -----------------------
    // The tailoring prompt already bans these, but a prompt ban has two
    // dependencies: the model obeying it, and the edge function being
    // deployed. Neither holds for text that arrives from the user's own
    // profile, and neither holds before a deploy. This is the layer that
    // actually builds the document, so it enforces the same list.
    //
    // These are one-for-one swaps, so grammar is unaffected: the verb is
    // replaced, not deleted.
    [/\bspearheaded\b/gi, 'led'],
    [/\bspearheading\b/gi, 'leading'],
    [/\bspearhead\b/gi, 'lead'],
    [/\bleveraged\b/gi, 'used'],
    [/\bleveraging\b/gi, 'using'],
    [/\bleverages\b/gi, 'uses'],
    [/\bleverage\b/gi, 'use'],
    [/\bsynergised\b/gi, 'combined'],
    [/\bsynergising\b/gi, 'combining'],
    [/\bsynergise\b/gi, 'combine'],
    [/\bsynergies\b/gi, 'shared gains'],
    [/\bsynergy\b/gi, 'collaboration'],
    [/\borchestrated\b/gi, 'directed'],
    [/\bchampioned\b/gi, 'led'],
    [/\bhelmed\b/gi, 'led'],

    // ---- filler adjectives --------------------------------------------
    // Deleted rather than swapped, so each pattern takes the trailing
    // space with it and, where the word sits in a pair, the conjunction
    // too. Removing only the adjective is what turned "Dynamic and
    // results-driven professional" into "Dynamic and professional".
    //
    // "dynamic" is matched ONLY as a leading personal adjective. The
    // word is legitimate in "dynamic pricing" and the candidate's own
    // history mentions Dynamics 365.
    [/^\s*dynamic\s+and\s+/gim, ''],
    [/\bdynamic\s+(?=professional\b|engineer\b|leader\b)/gi, ''],
    [/\band\s+dynamic\b/gi, ''],
    // Only where it modifies something vague. "High-impact solutions"
    // is filler; "high-impact incidents" is how incident management
    // actually classifies severity, and deleting it loses real meaning.
    [/\bhigh[- ]impact\s+(?=(?:solutions?|results?|outcomes?|projects?|initiatives?|work|contributions?|deliverables?)\b)/gi, ''],
    [/\bfast[- ]paced\s+/gi, ''],
    [/\btransformational\s+/gi, ''],
    [/\binnovative\s+/gi, ''],
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
      // A removed adjective leaves the conjunction that joined it to the
      // next one: "Dynamic and results-driven professional" became
      // "Dynamic and professional", and stripping the other adjective
      // instead leaves a sentence opening with "and". Both read as a
      // typo, which is worse than the buzzword was.
      .replace(/^([ \t]*)(?:and|or|but)\s+/gim, '$1')
      .replace(/\s+\b(and|or)\s+\1\b/gi, ' $1')
      .replace(/\b(an?)\s+(?=[.,;:])/gi, '')
      .replace(/^\s*,\s*/gm, '')
      .replace(/[ \t]+([.,;:])/g, '$1')
      .replace(/\(\s*\)/g, '')
      .replace(/[ \t]+$/gm, '');

    // Re-capitalise any line the purge left starting lower-case: cutting
    // the opening adjective promotes the next word to first position.
    //
    // Prose sentences only. A skills line is a comma list whose first
    // entry may legitimately be lower-case -- dbt and pgvector are
    // written that way by their own projects -- and capitalising it is
    // a different kind of wrong.
    out = out.split('\n').map((l) => {
      const t = l.trimStart();
      if (!t || /^[-•*]/.test(t)) return l;
      if (t[0] !== t[0].toLowerCase() || !/[a-z]/.test(t[0])) return l;
      const looksLikeSentence = /[.!?]\s*$/.test(t) && /\s/.test(t) && !/^[^\s,]+,/.test(t);
      if (!looksLikeSentence) return l;
      const lead = l.slice(0, l.length - t.length);
      return lead + t[0].toUpperCase() + t.slice(1);
    }).join('\n');

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

  // Which spelling does the JD actually use? Returns it with the JD's own
  // capitalisation, so the CV can carry the posting's exact string.
  //
  // This used to be `jdLower.includes(term)` over a group ordered
  // shortest-first, and both halves were wrong:
  //
  //   substring, not word boundary -- a JD mentioning "MLOps" contains
  //   "ml", so "ml" was chosen and every "Machine Learning" in the CV was
  //   rewritten to it. "PostgreSQL" contains "postgres"; "REST APIs"
  //   contains "rest api".
  //
  //   first hit wins -- with the groups ordered shortest-first, the
  //   ABBREVIATION always beat the full term.
  //
  // The result was a CV advertising "ML, Postgres, rest API" against a
  // posting asking for "Machine Learning, PostgreSQL, REST APIs" -- three
  // exact-match keywords lost to a function whose entire purpose is to
  // mirror the JD's vocabulary. A recruiter searching the full term finds
  // the other candidate.
  //
  // Longest match wins now: the most specific phrase the posting actually
  // uses is the one worth carrying.
  function _findCanonicalForJd(jdText, group) {
    let best = null;
    for (const term of group) {
      const re = new RegExp('\\b' + term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      const m = jdText.match(re);
      if (!m) continue;
      if (!best || m[0].length > best.length) best = m[0];   // JD's own casing
    }
    // Postings often set requirement headings in capitals ("MACHINE
    // LEARNING"), and carrying that verbatim would shout on the CV.
    // Genuine acronyms are short and single-word, so only fold a
    // multi-word all-caps match back to title case.
    if (best && / /.test(best) && best === best.toUpperCase()) {
      best = best.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    }
    return best;
  }

  function mirrorJdVocabulary(cvText, jdText) {
    if (!cvText || !jdText) return { text: cvText || '', swaps: 0 };
    let out = cvText;
    let swaps = 0;
    for (const group of SYNONYM_GROUPS) {
      const canonical = _findCanonicalForJd(jdText, group);
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
  // ACRONYM PAIRING -- both forms on the page when the posting uses both
  // -------------------------------------------------------------------
  // An ATS dictionary matches one exact string; the human who searches
  // the pile afterwards types whichever form they think in. When the
  // posting writes "Anti-Money Laundering (AML)", one candidate's CV
  // says "AML" and another's says "anti money laundering" -- and each
  // is invisible to half the searches. The vocabulary mirror above
  // makes it worse, not better: it swaps the CV to the JD's canonical
  // form, so exactly one form survives.
  //
  // THE POSTING DEFINES ITS OWN PAIRS. There is no curated list here
  // to go stale or to pair "SQL" with an expansion nobody writes: a
  // pair exists only where the JD itself prints the long form with the
  // acronym in parentheses. And nothing is claimed the CV does not
  // already claim -- a CV carrying NEITHER form is left alone; one
  // carrying either form gains the other beside it, once, at the first
  // occurrence.
  const _ACRO_DEF_RE = /\b([A-Z][A-Za-z&-]*(?:[ -][A-Za-z&-]+){0,5})\s*\(\s*([A-Z]{2,7})\s*\)/g;

  function _initialsOf(phrase) {
    return phrase.split(/[ \-/]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('');
  }
  // "Know Your Customer" -> KYC exactly; "Continuous Integration and
  // Delivery" -> CIAD contains CID in order. Subsequence tolerates the
  // minor words a phrase carries and an acronym skips.
  function _isSubsequence(short, initials) {
    let i = 0;
    for (const ch of initials) if (ch === short[i]) i++;
    return i === short.length;
  }

  function pairJdAcronyms(cvText, jdText) {
    if (!cvText || !jdText) return { text: cvText || '', paired: [] };
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let out = cvText;
    const paired = [];
    const done = new Set();
    let m;
    _ACRO_DEF_RE.lastIndex = 0;
    while ((m = _ACRO_DEF_RE.exec(jdText)) !== null) {
      const rawLong = m[1].trim();
      const short = m[2].trim();
      if (done.has(short)) continue;
      // The capture reaches greedily leftwards ("We need experience
      // with Anti-Money Laundering"), so shrink to the SHORTEST
      // trailing phrase whose first word starts with the acronym's
      // first letter and whose initials still produce the acronym.
      // That is also what rejects junk: "modern tools (SQL)" and
      // "Data (AI)" leave no trailing phrase that qualifies, and a
      // one-word phrase is not a long form at all.
      const tokens = rawLong.split(/[ -]+/).filter(Boolean);
      let long = null;
      for (let s = tokens.length - 2; s >= 0; s--) {
        const cand = tokens.slice(s);
        if (cand[0][0].toUpperCase() !== short[0]) continue;
        if (!_isSubsequence(short, _initialsOf(cand.join(' ')))) continue;
        // Recover the phrase with its ORIGINAL separators -- the JD
        // hyphenates where the CV uses spaces, or the reverse.
        const tail = new RegExp('(?:^|[ -])(' + cand.map(esc).join('[ -]+') + ')$').exec(rawLong);
        long = (tail ? tail[1] : cand.join(' ')).trim();
        break;
      }
      if (!long) continue;
      const longRe = new RegExp(
        '\\b' + long.split(/[ -]+/).map(esc).join('[ -]+') + '\\b', 'i');
      const shortRe = new RegExp('\\b' + esc(short) + '\\b');
      const hasLong = longRe.test(out);
      const hasShort = shortRe.test(out);
      if (hasLong === hasShort) continue;   // both there, or neither claimed
      if (hasLong) {
        out = out.replace(longRe, (hit) => hit + ' (' + short + ')');
      } else {
        out = out.replace(shortRe, long + ' (' + short + ')');
      }
      done.add(short);
      paired.push(long + ' (' + short + ')');
    }
    return { text: out, paired };
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
  // STRICT REVERSE-CHRONOLOGICAL ORDER (opt-in)
  // -------------------------------------------------------------------
  // ATS date checks read the sequence of START dates and expect them
  // strictly descending. Concurrent work legitimately breaks that: a
  // part-time contract begun after a still-current full-time role sorts
  // ABOVE it by start date, even though the full-time role is the
  // candidate's primary position.
  //
  // So this is OPT-IN, not automatic. Enabling it clears the flag without
  // altering a single date; the cost is that the first entry a recruiter
  // reads may be a part-time contract rather than the current role. That
  // is a judgement about audience, not a correctness fix, so the choice
  // stays with the user.
  // ===================================================================
  const ROLE_DATE_RE = /^\s*(?:([A-Za-z]{3,9})\.?\s+(\d{4})|(\d{1,2})\/(\d{4})|(\d{4}))\s*[-\u2013\u2014]\s*(present|current|.+)$/i;

  function _startMonths(dateLine) {
    const m = ROLE_DATE_RE.exec(String(dateLine || ''));
    if (!m) return null;
    const MON = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12,
      january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
    if (m[1]) return (parseInt(m[2],10) * 12) + (MON[m[1].toLowerCase()] || 1);
    if (m[3]) return (parseInt(m[4],10) * 12) + parseInt(m[3],10);
    if (m[5]) return (parseInt(m[5],10) * 12) + 1;
    return null;
  }

  // ===================================================================
  // BULLET ORDER WITHIN A ROLE
  // -------------------------------------------------------------------
  // Reviewers read the first three bullets of a role and stop. Bullets
  // arrive in whatever order the source CV recorded them, which is
  // usually the order the work happened -- not the order that answers
  // THIS posting.
  //
  // A real example: the strongest bullet for a Business Analyst posting
  // was "Investigated trading-system anomalies with SQL and Pandas,
  // built Tableau dashboards and presented root-cause findings and
  // recommendations to VP-level stakeholders." It was the LAST bullet of
  // the FOURTH role. Nobody reading top-down would reach it.
  //
  // This changes ORDER ONLY. No word is rewritten, no fact moves between
  // roles, chronology between roles is untouched. It is therefore the one
  // relevance improvement with no fabrication risk at all.
  //
  // Scoring is deliberately blunt: how many of the posting's keywords the
  // bullet contains, plus a small bonus for carrying a number, because a
  // quantified bullet outperforms an unquantified one for the same
  // keyword count. Ties keep their original order, so a role whose
  // bullets are equally relevant is left exactly as it was.
  //
  // Scope is the experience section and nothing else. An EDUCATION or
  // CERTIFICATIONS list is in date order on purpose -- ranking those by
  // keyword would put the BSc above the MSc, which is a worse document,
  // not a more relevant one.
  const _BACKREF = /^\s*[-•*]?\s*(on top of that|additionally|also|separately|in addition|this |these |that work|building on|alongside this)/i;
  const _EXP_HEAD = /^\s*(?:PROFESSIONAL\s+|WORK\s+|RELEVANT\s+)?(?:EXPERIENCE|EMPLOYMENT(?:\s+HISTORY)?|CAREER\s+HISTORY)\s*:?\s*$/i;
  const _ANY_HEAD = /^\s*[A-Z][A-Z &/'-]{3,}\s*:?\s*$/;

  function orderBulletsByRelevance(cvText, jobKeywords) {
    const kws = _flatKeywords(jobKeywords)
      .map((k) => String(k || '').trim().toLowerCase())
      .filter((k) => k.length > 2);
    if (!kws.length || !cvText) return { text: cvText || '', moved: 0 };

    const lines = String(cvText).split('\n');
    const isBullet = (l) => /^\s*[-•*]\s*\S/.test(l);
    let moved = 0;
    let inExperience = false;
    let i = 0;
    while (i < lines.length) {
      if (_EXP_HEAD.test(lines[i])) { inExperience = true; i++; continue; }
      if (_ANY_HEAD.test(lines[i])) { inExperience = false; i++; continue; }
      if (!inExperience || !isBullet(lines[i])) { i++; continue; }
      let j = i;
      while (j < lines.length && isBullet(lines[j])) j++;
      const run = lines.slice(i, j);
      // A single bullet, or a run short enough that order cannot matter.
      if (run.length >= 3) {
        const score = (b) => {
          const low = b.toLowerCase();
          let n = 0;
          for (const k of kws) if (low.includes(k)) n++;
          if (/\d/.test(b)) n += 0.5;
          // A bullet that opens by referring back to the previous one
          // cannot lead. Keep it where it is rather than produce
          // "Also, I..." as the first thing a reviewer reads.
          if (_BACKREF.test(b)) n -= 100;
          return n;
        };
        const ranked = run
          .map((b, idx) => ({ b, idx, s: score(b) }))
          .sort((x, y) => (y.s - x.s) || (x.idx - y.idx))
          .map((x) => x.b);
        if (ranked.some((b, k) => b !== run[k])) {
          for (let k = 0; k < ranked.length; k++) lines[i + k] = ranked[k];
          moved++;
        }
      }
      i = j;
    }
    return { text: lines.join('\n'), moved };
  }

  // ===================================================================
  // HOW MANY BULLETS A ROLE GETS
  // -------------------------------------------------------------------
  // As many as the profile records.
  //
  // capBulletsPerRole used to live here, trimming each role to six
  // bullets for the two most recent and four for the rest, on the
  // reasoning that attention is finite and a role from eight years ago
  // spends the reader's patience. That reasoning is sound in general
  // and was the wrong call here: it deleted work its owner had
  // deliberately written down, from code that has never seen the
  // posting being answered, and it did so on every CV whether or not
  // space was actually short.
  //
  // Reported twice, in their words: "why did you limit my professional
  // experience roles bullets to 2 each? I never asked for that", and
  // then "remove that limit as it might also be preventing the actual
  // tailor of bullet points".
  //
  // Two things still shape a role, and both earn it. orderBulletsByRelevance
  // puts the bullets that answer THIS posting first, which is tailoring
  // and costs nothing. fitToOnePage trims only when trimming actually
  // reaches a page, and puts everything back when it cannot. A page is a
  // real constraint. Six was an opinion.

  // ===================================================================
  // EACH ROLE CARRIES WHERE IT HAPPENED
  // -------------------------------------------------------------------
  // Workday's "Apply with Resume" has a Location field on every
  // work-experience block, and it is not alone. With nothing in the CV to
  // fill it, the field arrives empty and gets typed by hand, once per
  // role, on every application.
  //
  // The location is attached to the COMPANY line with a tab, so the
  // renderer can set it right-aligned against the employer it belongs to.
  // That keeps a role header at two lines -- company + location, then
  // title + dates -- where it currently takes three, so adding a field
  // makes the CV shorter rather than longer.
  //
  // Nothing is invented. A location is attached only when the profile
  // records one for a company the CV already names.
  // A COMPANY LINE THAT ALREADY SWALLOWED ITS LOCATION.
  //
  // A live parse returned Company = "Meta, Dublin, Ireland". The tailoring
  // model, once the profile carried locations, wrote them straight into
  // the company line comma-joined, and a comma is not a delimiter a parser
  // can act on: the whole string lands in the Company field, so matching
  // an employer named "Meta" fails, exactly as "Meta (formerly Facebook
  // Inc)" and "Meta, Software Engineer" did before it.
  //
  // Split on the FIRST comma whose tail looks like a place: a short,
  // capitalised, comma-separated trail with no digits and no company
  // suffix. "Meta, Dublin, Ireland" splits; "Booz Allen Hamilton, Inc."
  // and "Marks, Spencer and Co" do not.
  const _CO_SUFFIX = /\b(?:inc|llc|ltd|limited|plc|gmbh|ag|sa|bv|nv|oy|ab|as|pty|co|corp|corporation|company|group|holdings|partners|llp|lp)\b\.?$/i;
  const _PLACE_TAIL = /^[A-Z][A-Za-z.'\u00C0-\u024F -]{1,28}(?:,\s*[A-Z][A-Za-z.'\u00C0-\u024F -]{1,28}){0,2}$/;

  function _splitCompanyAndPlace(line) {
    const raw = String(line || '');
    if (raw.indexOf('\t') !== -1) return null;          // already delimited
    const bits = raw.split(',');
    if (bits.length < 2) return null;
    for (let cut = 1; cut < bits.length; cut++) {
      const head = bits.slice(0, cut).join(',').trim();
      const tail = bits.slice(cut).join(',').trim();
      if (!head || !tail) continue;
      if (/\d/.test(tail)) continue;                    // dates, street numbers
      if (_CO_SUFFIX.test(head) && cut === 1) continue;  // "Acme, Inc." is the name
      if (_CO_SUFFIX.test(tail.replace(/,.*$/, ''))) continue;
      if (!_PLACE_TAIL.test(tail)) continue;
      return { company: head, place: tail };
    }
    return null;
  }

  // THE LOCATION IS TYPED BY A HUMAN INTO A FREE-TEXT BOX.
  //
  // Company and location are joined with a TAB, so a tab inside the
  // location makes three fields where the renderer expects two, and a
  // newline truncates it: "Dublin\nIreland" arrived as "Meta\tDublin"
  // with the country silently dropped. Neither is visible until an ATS
  // reads it back wrong.
  //
  // Everything collapses to single spaces, and the field is capped -- a
  // location long enough to wrap would push the right-aligned text off
  // its tab stop and back onto the company name.
  //
  // KEY NAME AND SHAPE, DEFENSIVELY.
  //
  // The profile is edited in a separate app, so neither the exact key
  // this lands under nor its shape is under this code's control. Reading
  // only "location" means a near-miss like "role_location" does nothing
  // at all AND says nothing; and a form that saves {city, country} as an
  // object would put "[object Object]" on the page through String().
  // Accept the names the same field plausibly gets, in either shape.
  function _roleLocationOf(src) {
    const raw = (src && (src.location || src.city || src.role_location
      || src.roleLocation || src.job_location || src.jobLocation
      || src.work_location || src.workLocation || src.based_in
      || src.basedIn || src.locationName)) || '';
    const s = (raw && typeof raw === 'object')
      ? [raw.city || raw.town, raw.state || raw.region || raw.county, raw.country]
        .filter(Boolean).map(String).join(', ')
      : String(raw);
    return s
      .replace(/[\t\r\n\v\f]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 60)
      .trim();
  }

  function attachRoleLocations(cvText, experience) {
    const text = String(cvText || '');
    if (!text) return { text, attached: 0 };
    const lines = text.split('\n');

    let inExp = false, attached = 0;
    const claimed = new Set();
    for (let i = 0; i < lines.length; i++) {
      if (_EXP_HEAD.test(lines[i])) { inExp = true; continue; }
      if (_ANY_HEAD.test(lines[i])) { inExp = false; continue; }
      if (!inExp) continue;

      const l = lines[i].trim();
      if (!l || /^\s*[-•*]/.test(l) || l.indexOf('\t') !== -1) continue;
      if (ROLE_DATE_RE.test(l) || /\b(?:19|20)\d{2}\b/.test(l)) continue;
      // A company line is the one whose NEXT line is the job title. A
      // title line matched here would put the city beside the title.
      const next = (lines[i + 1] || '').trim();
      if (!next || !_TITLE_WORD.test(next)) continue;

      // A company line that already carries its location comma-joined is
      // re-delimited here, with or without profile data, because the
      // damage is done by the comma rather than by the location.
      const split = _splitCompanyAndPlace(l);
      if (split) {
        lines[i] = split.company + '\t' + split.place;
        attached++;
        continue;
      }

      const key = _eduNorm(l);
      if (key.length < 2) continue;
      for (let e = 0; e < experience.length; e++) {
        if (claimed.has(e)) continue;
        const src = experience[e] || {};
        const co = _eduNorm(src.company || src.employer || src.organisation
          || src.organization || src.name);
        if (!co || (co.indexOf(key) === -1 && key.indexOf(co) === -1)) continue;
        const loc = _roleLocationOf(src);
        if (!loc) { claimed.add(e); break; }
        lines[i] = lines[i].replace(/\s+$/, '') + '\t' + loc;
        claimed.add(e);
        attached++;
        break;
      }
    }
    return { text: lines.join('\n'), attached };
  }

  // ===================================================================
  // THE HEADLINE UNDER THE NAME
  // -------------------------------------------------------------------
  // A one-line role under the name is the first thing a recruiter's eye
  // lands on. Reading a CV goes down the left edge and across the top --
  // the "F" pattern -- so the line directly beneath the name is prime
  // real estate, and leaving it empty wastes the only glance some
  // applications get.
  //
  // It was removed for a good reason and the reason was not parsing.
  // Scored against OpenResume's own name features, the bold name gets
  // +3 for letters-only and +2 for bold, and a headline gets +3; the
  // name wins every time, so a headline cannot steal the Name field.
  // What it CAN do is manufacture a claim: prepending the posting's
  // title gives a software engineer a CV announcing "Microsoft Dynamics
  // 365 Project Manager", which is a lie in the first line.
  //
  // So the line comes back, with the claim checked. The posting's title
  // is used when the employment history actually contains it -- that is
  // both true and the best keyword match available. Otherwise the
  // candidate's own most recent title is used, which is always true.
  // Nothing is invented, and the slot is never left empty when a real
  // title exists to fill it.
  function ensureHeadline(cvText, jdTitle) {
    const text = String(cvText || '');
    if (!text) return { text, added: false };
    const lines = text.split('\n');

    let nameAt = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) { nameAt = i; break; }
    }
    if (nameAt === -1) return { text, added: false };

    // The role lines, for both the containment test and the fallback.
    let inExp = false;
    const roleLines = [];
    for (const l of lines) {
      if (_EXP_HEAD.test(l)) { inExp = true; continue; }
      if (_ANY_HEAD.test(l)) { inExp = false; continue; }
      if (!inExp) continue;
      if (/^\s*[-•*]/.test(l) || !l.trim()) continue;
      roleLines.push(l.trim());
    }
    if (!roleLines.length) return { text, added: false };

    const title = String(jdTitle == null ? '' : jdTitle).replace(/\s+/g, ' ').trim();
    const blob = roleLines.join(' | ').toLowerCase();

    let headline = '';
    if (title && blob.indexOf(title.toLowerCase()) !== -1) {
      headline = title;                       // true AND the best keyword match
    } else {
      // The candidate's own most recent title: the line after a company
      // that is not itself a date.
      for (let i = 0; i < roleLines.length; i++) {
        const l = roleLines[i];
        if (ROLE_DATE_RE.test(l) || /\b(?:19|20)\d{2}\b/.test(l)) continue;
        if (_TITLE_WORD.test(l) && l.split(/\s+/).length <= 7) {
          // Without the employment-type parenthetical. The role line still
          // carries "(Contract, part-time)" at this point -- a later pass
          // moves it into the first bullet -- and a headline reading
          // "Data Analyst (Internship)" under the name sells the job
          // short in the one line that gets read first.
          headline = l.replace(/\s*\([^)]*\)\s*$/, '').trim();
          if (headline) break;
        }
      }
    }
    if (!headline) return { text, added: false };

    // Already there, in any form? Adding a second one would read as a
    // stutter directly under the name.
    const next = (lines[nameAt + 1] || '').trim();
    if (next && next.toLowerCase() === headline.toLowerCase()) return { text, added: false };
    if (next && _TITLE_WORD.test(next) && next.indexOf('|') === -1
      && next.indexOf('@') === -1 && next.split(/\s+/).length <= 8) {
      // A HEADLINE THIS CODE DID NOT WRITE IS NOT AUTOMATICALLY TRUE.
      //
      // This returned here, unconditionally, on the reasoning that a
      // headline already existed so there was nothing to add. The check
      // above -- only ever a title the history contains -- was therefore
      // applied to headlines this function WROTE and to no others.
      //
      // The tailoring prompt tells the model to put the posting's title
      // on exactly this line ("TARGET TITLE LINE: the line immediately
      // after the candidate's name is the job title being applied for").
      // So the model writes it, this pass sees a headline and steps
      // aside, and the document goes out claiming a title the candidate
      // has never held -- "Business Operations Sr Analyst" above an
      // employment block whose top entry reads "Software Engineer,
      // Meta, January 2023 - Present". Verified on a real generated
      // file: "Director of Business Operations" survives this pass with
      // no warning.
      //
      // The prompt calls that positioning rather than a claim. A parser
      // cannot read intent. EVERY resume parser takes the line under the
      // name as the title held now, so the stored candidate record says
      // one thing and the employment history says another, and the
      // recruiter reading both sees a person misrepresenting their job.
      // On an ATS that merges candidates by email address, the stored
      // headline also changes on every application to the same employer.
      //
      // So the truthfulness rule applies to the line however it got
      // there. A held title stays. An unheld one is replaced by the real
      // most recent title, which is the same value this function would
      // have written into an empty slot.
      if (blob.indexOf(next.toLowerCase()) !== -1) return { text, added: false };
      if (next.toLowerCase() === headline.toLowerCase()) return { text, added: false };
      lines[nameAt + 1] = headline;
      return { text: lines.join('\n'), added: false, replaced: true,
        headline, was: next };
    }

    lines.splice(nameAt + 1, 0, headline);
    return { text: lines.join('\n'), added: true, headline };
  }

  // ===================================================================
  // THE HEADER SAYS WHERE YOU LIVE, NOT WHERE THE JOB IS
  // -------------------------------------------------------------------
  // A CV generated for a Sao Paulo posting went out reading
  //
  //   Sao Paulo, BR  |  +353 087 426 1508  |  maxokafordev@gmail.com
  //
  // A Brazilian address and an Irish phone number, on one line. The
  // location is rewritten to the POSTING's location on the theory that
  // it matches what the recruiter is filtering for. It does, and that
  // is the problem: it wins the filter by asserting a fact that is not
  // true, and the contradiction is visible in the next eight characters
  // of the same line, on a document sitting beside a LinkedIn profile
  // that says Dublin.
  //
  // Two things follow and both are worse than not matching the filter.
  // A screening question about work authorisation is now answered
  // against a country the candidate does not live in. And a recruiter
  // who notices reads it as a false statement on an application rather
  // than as aggressive targeting, which ends that application and any
  // future one at the same employer.
  //
  // Relocation is a real and sayable thing. "Dublin, Ireland (open to
  // relocation)" claims nothing untrue, keeps the candidate in the
  // running for a role elsewhere, and reads as intent rather than as a
  // residence. So the real location goes back on the page, and the
  // willingness is stated in words.
  //
  // Only ever the profile's own value. With no profile location to put
  // back this does nothing at all, because guessing is what produced
  // the problem.
  const _CONTACT_LINE = /[|·•]/;
  function ensureTruthfulLocation(cvText, profileLocation, jobLocation) {
    const text = String(cvText || '');
    const real = String(profileLocation || '').replace(/\s+/g, ' ').trim();
    if (!text || !real) return { text, changed: false };

    const lines = text.split('\n');
    // The contact line: the first line with a pipe, an email or a phone,
    // inside the first handful of lines.
    let at = -1;
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      if (_CONTACT_LINE.test(l) && (/@/.test(l) || /\+?\d[\d\s().-]{6,}/.test(l))) { at = i; break; }
    }
    if (at === -1) return { text, changed: false };

    const parts = lines[at].split(/\s*[|·•]\s*/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return { text, changed: false };

    // The location segment is the one that is not an email, a phone or a
    // URL. Conventionally the first, but not assumed to be.
    let seg = -1;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (/@/.test(p) || /https?:|www\.|\.com|\.io|\.dev|\.app/i.test(p)) continue;
      if (/\+?\d[\d\s().-]{6,}/.test(p)) continue;
      if (!/[A-Za-z]/.test(p)) continue;
      seg = i; break;
    }
    if (seg === -1) return { text, changed: false };

    const shown = parts[seg];
    // Already the truth? A city match is enough: "Dublin, IE" and
    // "Dublin, Ireland" are the same claim.
    const city = (s) => String(s).split(',')[0].trim().toLowerCase();
    if (city(shown) === city(real)) return { text, changed: false };

    // ── WHEN "(open to relocation)" IS WORTH SAYING ──────────────────
    //
    // It was appended whenever the posting's city differed from the
    // candidate's, which fired on two cases where it says nothing and
    // costs a line of the six seconds a header gets:
    //
    //   REMOTE. "Remote", "Remote (EMEA)", "Anywhere" -- there is
    //   nothing to relocate to, and offering to move for a remote job
    //   reads as not having understood the posting.
    //
    //   THE SAME COUNTRY. Dublin to Cork is a commute or a move nobody
    //   needs reassuring about, and no filter is screening it out.
    //
    // Reported exactly that way: fine for remote and Irish roles, but
    // not something that was asked for. It earns its place only on a
    // posting in ANOTHER COUNTRY, where a recruiter's first question
    // about a foreign address is whether the candidate would actually
    // move, and where staying silent invites the assumption that they
    // would not.
    const job = String(jobLocation || '').replace(/\s+/g, ' ').trim();
    const REMOTE = /\b(remote|anywhere|work from home|wfh|distributed|virtual)\b/i;
    const countryOf = (v) => {
      const bits = String(v).split(',').map((x) => x.trim()).filter(Boolean);
      return (bits.length > 1 ? bits[bits.length - 1] : '').toLowerCase();
    };
    const ISO = { ie: 'ireland', gb: 'united kingdom', uk: 'united kingdom',
      us: 'united states', usa: 'united states', de: 'germany', fr: 'france',
      nl: 'netherlands', es: 'spain', it: 'italy', pt: 'portugal', br: 'brazil',
      ca: 'canada', au: 'australia', in: 'india', sg: 'singapore', ch: 'switzerland' };
    const norm = (c) => ISO[c] || c;
    const jobCountry = norm(countryOf(job));
    const realCountry = norm(countryOf(real));
    // Abroad only when BOTH countries are known and they differ. An
    // unknown country is not evidence of anything, so it says nothing.
    const abroad = !!job && !REMOTE.test(job)
      && !!jobCountry && !!realCountry && jobCountry !== realCountry;
    parts[seg] = abroad ? real + ' (open to relocation)' : real;
    lines[at] = parts.join('  |  ');
    return { text: lines.join('\n'), changed: true, was: shown, now: parts[seg] };
  }

  // ===================================================================
  // A COMPANY LINE IS THE COMPANY, ON ITS OWN
  // -------------------------------------------------------------------
  // A generated CV opened its experience section with:
  //
  //   Meta, Software Engineer
  //   January 2023 - Present
  //
  // One bold line carrying both. Measured on two real parsers, this is
  // the most expensive line in the document.
  //
  // OpenResume returned Company "Meta, Software Engineer" and Job Title
  // "Meta, Software Engineer" -- the SAME string in both fields. Its
  // company feature is "is bolded or doesn't match job title & date" and
  // its title feature is "contains a job title keyword". A line that is
  // bolded AND contains "Engineer" wins both, so one field is always
  // wrong and an employer search for "Meta" matches neither.
  //
  // Workday was worse, because Workday asks the human to fix it: the
  // live "Apply with Resume" form came back with Job Title "Meta,
  // Software Engineer" and Company EMPTY -- and Company is a REQUIRED
  // field. Every application meant retyping four employers by hand.
  //
  // The generator already renders company, then title, then date on
  // separate lines. This is the guarantee for text that arrives with
  // them already merged, which is what the tailoring model emits when
  // left to itself.
  //
  // Splitting only happens on real evidence: a single comma, a right
  // side that reads as a job title, and a left side short enough to be a
  // company. "Booz Allen Hamilton" has no comma and is untouched;
  // "Meta, Software Engineer" splits; "Johnson & Johnson, Senior
  // Engineer" splits at the last comma, keeping the employer whole.
  const _TITLE_WORD = new RegExp('\\b(?:engineer|developer|analyst|manager|director'
    + '|architect|scientist|consultant|specialist|administrator|designer|lead'
    + '|officer|associate|assistant|coordinator|supervisor|technician|advisor'
    + '|strategist|researcher|programmer|intern|president|head|chief|partner'
    + '|controller|accountant|nurse|teacher|editor|writer|recruiter|planner)\\b', 'i');

  function splitCompanyAndTitle(cvText) {
    const text = String(cvText || '');
    if (!text) return { text, split: 0 };
    const lines = text.split('\n');

    let inExp = false, split = 0;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (_EXP_HEAD.test(raw)) { inExp = true; out.push(raw); continue; }
      if (_ANY_HEAD.test(raw)) { inExp = false; out.push(raw); continue; }
      const l = raw.trim();
      if (!inExp || !l || /^\s*[-•*]/.test(l)) { out.push(raw); continue; }

      // A role line already carrying its own date is a different shape
      // and is handled elsewhere. Only the bare "A, B" line is in scope.
      if (ROLE_DATE_RE.test(l) || /\b(?:19|20)\d{2}\b/.test(l)
        || l.indexOf('\t') !== -1) { out.push(raw); continue; }
      if ((l.match(/,/g) || []).length !== 1) { out.push(raw); continue; }

      const cut = l.lastIndexOf(',');
      const left = l.slice(0, cut).trim();
      const right = l.slice(cut + 1).trim();
      // The right side must read as a title, the left as an employer.
      // Without both, leave it alone -- a wrongly split line invents an
      // employer, which is worse than the merge it was fixing.
      const ok = left.length >= 2 && left.split(/\s+/).length <= 6
        && right.length >= 3 && right.split(/\s+/).length <= 6
        && _TITLE_WORD.test(right) && !_TITLE_WORD.test(left);
      if (!ok) { out.push(raw); continue; }

      out.push(left);
      out.push(right);
      split++;
    }
    return { text: out.join('\n'), split };
  }

  // ===================================================================
  // ONE PAGE
  // -------------------------------------------------------------------
  // A recruiter working through a stack decides whether to read a CV
  // before they decide what it says, and a second page is where a lot of
  // that decision gets made. The generator already squeezes spacing and
  // the type scale to fit, but typography has a floor: four roles at the
  // per-role caps is twenty bullets, and twenty bullets of real length do
  // not fit on a page at any size worth reading.
  //
  // So the last of the fitting is done here, where relevance to the
  // posting is known and the generator's is not. It runs AFTER
  // orderBulletsByRelevance, so the tail of each
  // role is already its least relevant material.
  //
  // What it will not do:
  //
  //   * touch a bullet holding the CV's only mention of a posting
  //     keyword -- the same guard the per-role cap uses, for the same
  //     reason. A missed keyword costs more than a second page.
  //   * take a role below two bullets. A role reduced to one line reads
  //     as filler and invites the question of why it is there at all.
  //   * touch anything outside the experience section. Education,
  //     skills and projects are not padding.
  //   * trim past the point of fitting. It stops the moment the budget
  //     is met, so a CV that is one line over loses one line.
  //
  // If it cannot fit within those rules, it stops and the CV runs to two
  // pages, which is the honest outcome for a CV with more on it than a
  // page holds.
  //
  // WHO DECIDES WHETHER IT FITS.
  //
  // The generator, and only the generator. It measures the XML it
  // actually emitted, after choosing a density, so it is the one place
  // that knows. This module carried its own line-count heuristic for a
  // first version and the two disagreed badly: on a CV the generator
  // would have fitted at full size, the heuristic cut 22 bullets down to
  // 8 and still reported that it did not fit. Two estimators for one
  // question is one too many.
  //
  // The fallback exists only for callers that load this module without
  // the generator, and is deliberately generous: given no way to
  // measure, doing nothing is the right answer.
  const _MIN_ROLE_BULLETS = 2;

  function _fits(cvText) {
    const G = (typeof window !== 'undefined' && window.DocxGenerator)
      || (typeof global !== 'undefined' && global.DocxGenerator);
    if (G && typeof G.measureCv === 'function') {
      try { return !!G.measureCv(cvText).fitsOnePage; } catch (e) { return true; }
    }
    return true;
  }

  // ---- the cheaper levers, spent before a bullet is --------------------
  //
  // A bullet from a real job was the ONLY thing this could spend, so a CV
  // with more on it than a page holds paid for the page entirely out of
  // its employment history: four roles, every one cut to the floor of
  // two. The user's own words -- "why did you limit my professional
  // experience roles bullets to 2 each, I never asked for that".
  //
  // Two lines are worth less than a bullet at Meta. Group labels are a
  // reading aid, and a third personal project sits under four roles of
  // real work. Both go first.

  // Labelled skill groups back to one comma list. Saves two or three
  // lines and loses no term.
  function _flattenSkillGroups(lines) {
    const at = lines.findIndex((l) => _SKILL_HEAD.test(l.trim()));
    if (at === -1) return false;
    let end = at + 1;
    const body = [];
    for (; end < lines.length; end++) {
      const t = lines[end].trim();
      if (!t) { if (body.length) break; continue; }
      if (/^[A-Z][A-Z &/]{3,}\s*:?\s*$/.test(t)) break;
      body.push(t);
    }
    if (body.length < 2 || !body.every((l) => /^[A-Z][A-Za-z &/]{1,28}:\s*\S/.test(l))) return false;
    const flat = body.map((l) => l.replace(/^[A-Z][A-Za-z &/]{1,28}:\s*/, '')).join(', ');
    lines.splice(at + 1, end - (at + 1), flat);
    return true;
  }

  // The last project, whole. Never below two: a projects section with one
  // entry reads as an afterthought, and the section is there to show
  // range.
  const _MIN_PROJECTS = 2;
  function _dropLastProject(lines) {
    const at = lines.findIndex((l) => /^\s*(SELECTED PROJECTS|PROJECTS)\s*:?\s*$/i.test(l));
    if (at === -1) return false;
    let end = at + 1;
    for (; end < lines.length; end++) {
      if (_ANY_HEAD.test(lines[end]) && !/^\s*(SELECTED PROJECTS|PROJECTS)\s*:?\s*$/i.test(lines[end])) break;
    }
    // A project starts on a line that is neither a bullet nor a link.
    const starts = [];
    for (let i = at + 1; i < end; i++) {
      const t = lines[i].trim();
      if (!t || /^[-•*]/.test(t) || /https?:\/\/|\b\w+\.[a-z]{2,}\//i.test(t)) continue;
      if (starts.length && i === starts[starts.length - 1] + 1) continue;  // its tech-stack line
      starts.push(i);
    }
    if (starts.length <= _MIN_PROJECTS) return false;
    const from = starts[starts.length - 1];
    let to = end;
    while (to > from && !lines[to - 1].trim()) to--;     // keep the blank line
    lines.splice(from, to - from);
    return true;
  }

  function fitToOnePage(cvText, jobKeywords) {
    const text = String(cvText || '');
    if (!text || _fits(text)) return { text, trimmed: 0, fits: true };

    const kws = _flatKeywords(jobKeywords)
      .map((k) => String(k || '').trim().toLowerCase())
      .filter((k) => k.length > 2);
    const isBullet = (l) => /^\s*[-•*]\s*\S/.test(l);

    let lines = text.split('\n');
    const counts = Object.create(null);
    for (const l of lines) {
      if (!isBullet(l)) continue;
      const low = l.toLowerCase();
      for (const k of kws) if (low.includes(k)) counts[k] = (counts[k] || 0) + 1;
    }
    const isSoleCarrier = (b) => {
      const low = b.toLowerCase();
      for (const k of kws) if (counts[k] === 1 && low.includes(k)) return true;
      return false;
    };

    let trimmed = 0, flattened = false, projectsDropped = 0;

    // Cheapest first: the group labels, then projects down to two.
    if (!_fits(lines.join('\n')) && _flattenSkillGroups(lines)) flattened = true;
    for (let g = 0; g < 6; g++) {
      if (_fits(lines.join('\n'))) break;
      if (!_dropLastProject(lines)) break;
      projectsDropped++;
    }

    // Each pass removes at most one bullet, from the last bullet of the
    // LAST role that can still spare one -- oldest work, least relevant
    // bullet, which is the cheapest line on the page.
    for (let guard = 0; guard < 40; guard++) {
      if (_fits(lines.join('\n'))) break;

      // Map the experience section's bullet runs.
      const runs = [];
      let inExp = false;
      for (let i = 0; i < lines.length; i++) {
        if (_EXP_HEAD.test(lines[i])) { inExp = true; continue; }
        if (_ANY_HEAD.test(lines[i])) { inExp = false; continue; }
        if (!inExp || !isBullet(lines[i])) continue;
        let j = i;
        while (j < lines.length && isBullet(lines[j])) j++;
        runs.push({ start: i, end: j });
        i = j - 1;
      }

      // Take from the role with the MOST bullets, oldest first on a tie.
      //
      // Working strictly oldest-first instead left the newest role at six
      // bullets and stripped the second-newest to the floor of two, which
      // reads as though the second job barely happened. Taking from the
      // longest run levels the page: every role keeps enough to be a real
      // entry, and the last bullet of a six-bullet role is a cheaper loss
      // than the third of a three-bullet one. Ties go to the older role,
      // so attention still ends up front-loaded.
      let cut = -1, bestLen = _MIN_ROLE_BULLETS;
      for (let r = runs.length - 1; r >= 0; r--) {
        const { start, end } = runs[r];
        const len = end - start;
        if (len <= bestLen) continue;
        for (let k = end - 1; k >= start + _MIN_ROLE_BULLETS; k--) {
          if (!isSoleCarrier(lines[k])) { cut = k; bestLen = len; break; }
        }
      }
      if (cut === -1) break;      // nothing left that may honestly go
      lines.splice(cut, 1);
      trimmed++;
    }

    const out = lines.join('\n');
    const fits = _fits(out);

    // IF IT DID NOT WORK, PUT IT BACK.
    //
    // The CV that prompted this was 139% of a page. Every role was cut to
    // the floor, the projects and the labels went, and it was still 1.3
    // pages -- so the entire employment history was mutilated to buy
    // nothing at all. A two-page CV with whole roles is strictly better
    // than a 1.3-page CV with gutted ones, and the caller gets a warning
    // naming what would actually have to go.
    if (!fits) return { text, trimmed: 0, fits: false, reverted: true };

    return { text: out, trimmed, fits, flattened, projectsDropped };
  }

  // ===================================================================
  // A WORD USED TWICE IN ONE BULLET
  // -------------------------------------------------------------------
  // "surfacing fraud and risk exposure for the risk team" reads as a
  // draft nobody re-read. It is a small thing that a human notices
  // immediately and an ATS does not notice at all.
  //
  // This REPORTS and does not rewrite, deliberately. Fixing it means
  // knowing what the team was actually called, and that is a fact about
  // the candidate's employer that this code does not have. Guessing it
  // would put an invented team name on a CV that a reference check can
  // contradict -- a far worse outcome than a repeated word. So the
  // warning names the bullet and the word, and the human edits it.
  const _STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this',
    'into', 'over', 'across', 'using', 'their', 'them', 'were', 'was', 'has',
    'had', 'have', 'via', 'per', 'out', 'not', 'all', 'new', 'end', 'its',
    'data', 'team', 'work', 'time', 'year', 'years', 'more', 'than', 'both']);

  // ===================================================================
  // A PIVOT IS ARGUED WITH REAL OVERLAP, NOT A BORROWED TITLE
  // -------------------------------------------------------------------
  // Applying to a role you have not held is normal and worth doing well.
  // What sinks it is opening the summary with the posting's title as
  // though it were yours:
  //
  //   "Experienced Manager of Clinical Services with a strong background
  //    in clinical pharmacy leadership and operational excellence."
  //
  // written over a history of software engineering. A recruiter in that
  // field discards it on the first line, because the claim is contradicted
  // three inches further down the same page. The candidate loses the
  // chance to be read at all -- including the parts that genuinely were
  // relevant.
  //
  // This rewrites rather than reports. Two moves, both checkable against
  // the document itself:
  //
  //   1. A title asserted in the opening that appears nowhere in the
  //      employment history is replaced by the candidate's actual most
  //      recent title.
  //   2. A trailing "with a background in X" clause whose distinctive
  //      words appear nowhere else in the CV is dropped, because nothing
  //      in the document supports it.
  //
  // What it deliberately does NOT do is invent a replacement. Building
  // the bridge sentence -- the evidenced overlap that makes a pivot
  // interesting -- needs judgement about which of the candidate's real
  // work is closest to this posting, and that belongs to the model, under
  // RULE 1b. This is the floor: whatever else happens, the CV does not
  // open by claiming to be something the rest of it contradicts.
  const _SUMMARY_HEAD = /^\s*(PROFESSIONAL\s+SUMMARY|SUMMARY|PROFILE)\s*:?\s*$/i;
  const _STOP = new Set(['with', 'and', 'a', 'an', 'the', 'in', 'of', 'for', 'strong',
    'background', 'experience', 'experienced', 'proven', 'across', 'to', 'on', 'by',
    'senior', 'lead', 'manager', 'management', 'services', 'team', 'teams']);

  function rewritePivotSummary(cvText, jdTitle) {
    const text = String(cvText || '');
    const title = String(jdTitle == null ? '' : jdTitle).replace(/\s+/g, ' ').trim();
    if (!text || !title) return { text, changed: false };

    const lines = text.split('\n');

    // The experience section, and the real titles inside it.
    let inExp = false;
    const roleLines = [];
    for (const l of lines) {
      if (_EXP_HEAD.test(l)) { inExp = true; continue; }
      if (_ANY_HEAD.test(l)) { inExp = false; continue; }
      if (!inExp) continue;
      if (/^\s*[-•*]/.test(l) || !l.trim()) continue;
      roleLines.push(l);
    }
    if (!roleLines.length) return { text, changed: false };
    const historyBlob = roleLines.join(' | ').toLowerCase();

    // Does the history contain this title at all? If it does, claiming it
    // is honest and nothing here applies.
    if (historyBlob.indexOf(title.toLowerCase()) !== -1) return { text, changed: false };

    // The candidate's real, most recent title. The role line is the one
    // carrying the DATE RANGE -- a company sits on its own line, and
    // taking the first non-bullet line instead yields "Experienced Meta",
    // which is worse than the claim it replaced. Roles are already in
    // newest-first order by the time this runs.
    const DATE_RE = /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*[-–—]/i;
    // Two layouts, and only one used to work.
    //
    //   "Software Engineer\tJanuary 2023 - Present"   title and date share
    //                                                 a line: split it
    //   "Software Engineer"                           title and date on
    //   "January 2023 - Present"                      SEPARATE lines
    //
    // The second is what the generator emits, and splitting its date line
    // yields an empty string before the date, so no real title was found
    // and this returned unchanged. A CV claiming "AFC Advisory Manager,
    // 5+ years anti-financial crime" over Meta and Citigroup software
    // bullets went through untouched, which is the entire case this
    // function exists for.
    // Without the employment-type parenthetical. The role line still
    // carries "(Contract, part-time)" when this runs -- a later pass
    // moves it into the first bullet -- and a summary opening "Senior
    // Software Engineer (Contract, part-time) with a foundation in..."
    // announces part-time in the first six words of the CV. The headline
    // pass strips it for exactly this reason; this one did not.
    const _cleanTitle = (t) => String(t || '')
      .replace(/\s{2,}.*$/, '').replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/[,|·-]\s*$/, '').trim();
    const _isTitle = (t) => !!t && /[a-z]/.test(t) && t.split(/\s+/).length <= 7;
    let realTitle = '';
    for (let i = 0; i < roleLines.length; i++) {
      const l = roleLines[i];
      if (!DATE_RE.test(l)) continue;
      const sameLine = _cleanTitle(l.split('\t')[0].split(DATE_RE)[0]);
      if (_isTitle(sameLine)) { realTitle = sameLine; break; }
      // Nothing before the date on this line, so the title is the line
      // above it. The line above THAT is the company, which is why this
      // takes the nearest one and not the first.
      const prev = _cleanTitle(roleLines[i - 1]);
      if (_isTitle(prev) && !DATE_RE.test(prev)) { realTitle = prev; break; }
    }
    if (!realTitle) return { text, changed: false };

    // The summary block.
    const start = lines.findIndex((l) => _SUMMARY_HEAD.test(l));
    if (start === -1) return { text, changed: false };
    let end = start + 1;
    while (end < lines.length && !_ANY_HEAD.test(lines[end])) end++;

    // Everything outside the summary, for checking whether a claim is
    // supported anywhere in the document.
    const rest = lines.slice(0, start).concat(lines.slice(end)).join(' ').toLowerCase();

    let changed = false;
    for (let i = start + 1; i < end; i++) {
      let line = lines[i];
      if (!line.trim()) continue;

      // 1. The borrowed title.
      //
      // ON A WORD BOUNDARY, or it cuts a word in half. A posting titled
      // "Manufacturing Engineer" matched inside "Manufacturing
      // engineering technician" and the summary went out reading
      // "Senior Software Engineering technician with a foundation in
      // process optimisation" -- the opening line of the CV, and not
      // English. The boundary is added only where the title itself ends
      // in a word character: a title like "Engineer (Remote)" ends in a
      // bracket, and \b after it would never match anything.
      const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp((/^\w/.test(title) ? '\\b' : '') + esc
        + (/\w$/.test(title) ? '\\b' : ''), 'i');
      if (re.test(line)) { line = line.replace(re, realTitle); changed = true; }

      // 2. An unsupported "background in X" clause.
      line = line.replace(/,?\s*with\s+(?:a\s+)?(?:strong\s+|solid\s+|deep\s+)?background\s+in\s+([^.]+)/i,
        (m, claim) => {
          const words = String(claim).toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
          const distinctive = words.filter((w) => !_STOP.has(w));
          if (!distinctive.length) return m;
          const supported = distinctive.filter((w) => rest.indexOf(w) !== -1).length;
          // Keep it if the CV backs most of it up; drop it otherwise.
          if (supported >= Math.ceil(distinctive.length * 0.5)) return m;
          changed = true;
          return '';
        });

      lines[i] = line.replace(/\s{2,}/g, ' ').replace(/\s+\./g, '.').replace(/\.\s*\./g, '.').trim();
    }

    return { text: lines.join('\n'), changed };
  }

  // ===================================================================
  // A YEARS-IN-A-FIELD CLAIM NEEDS A FIELD THE CV ACTUALLY SHOWS
  // -------------------------------------------------------------------
  // The title half of the problem above is only half. Replace the
  // borrowed title and the sentence still reads:
  //
  //   "Experienced Software Engineer with 5+ years in anti-financial
  //    crime compliance and AFC governance across EU markets."
  //
  // over bullets that are Kafka, Kubernetes and MLflow start to finish.
  // Every parser scores that at 100%. The first human or LLM screener
  // reads two lines, sees the contradiction, and stops. It is the most
  // expensive sentence in the document precisely because nothing
  // automated flags it.
  //
  // What makes it checkable is the choice of evidence base. A claim
  // about years spent in a field is answered by the record of what the
  // candidate did and earned -- experience bullets, education,
  // certifications, projects. It is NOT answered by the skills list or
  // Core Competencies, because those were written by the same pass that
  // wrote the summary. A competency line reading "Anti-Financial Crime"
  // is the claim restated, not evidence for it, and scoring the summary
  // against it would let any invented domain vouch for itself.
  //
  // Unsupported clauses come out. Nothing is invented to replace them,
  // same rule as the pivot rewrite above.
  //
  // The tolerance is deliberately generous, because wrongly deleting a
  // true claim makes the CV weaker and that is the opposite of
  // tailoring. A claim survives on a single word of support; it is cut
  // only when the record contains nothing of it at all, or when a long
  // domain phrase is carried by one incidental word.
  const _CLAIM_HEAD = new RegExp('^\\s*(?:PROFESSIONAL\\s+SUMMARY|SUMMARY|PROFILE|OBJECTIVE'
    + '|(?:CORE\\s+|KEY\\s+|TECHNICAL\\s+|RELEVANT\\s+)?(?:COMPETENC(?:Y|IES)|SKILLS'
    + '|EXPERTISE|STRENGTHS)|AREAS\\s+OF\\s+EXPERTISE)\\s*:?\\s*$', 'i');

  const _YEARS_CLAUSE = new RegExp(
    // Optional connective, which is where the cut lands when there is one.
    '(?:,?\\s*\\b(with|bringing|offering|combining)\\b\\s+)?'
    + '(?:\\b(?:over|more\\s+than|nearly|almost)\\b\\s+)?'
    + '\\d{1,2}\\s*\\+?\\s*years?(?:’s|\'s)?'
    + '(?:\\s+of)?'
    + '(?:\\s+(?:professional|hands-on|combined|progressive|direct|dedicated'
    + '|practical|international|cumulative))?'
    + '(?:\\s+experience)?'
    + '\\s+(?:in|within|across|spanning|supporting|of|with)\\s+'
    + '([^.;]+)', 'i');

  function stripUnsupportedDomainClaim(cvText) {
    const text = String(cvText || '');
    if (!text) return { text, changed: false };
    const lines = text.split('\n');

    const start = lines.findIndex((l) => _SUMMARY_HEAD.test(l));
    if (start === -1) return { text, changed: false };
    let end = start + 1;
    while (end < lines.length && !_ANY_HEAD.test(lines[end])) end++;

    // The record: sections that report what happened, not sections that
    // assert what the candidate is good at.
    let recording = false;
    const evidence = [];
    for (const l of lines) {
      if (_ANY_HEAD.test(l)) { recording = !_CLAIM_HEAD.test(l); continue; }
      if (recording && l.trim()) evidence.push(l);
    }
    const blob = evidence.join(' ').toLowerCase();
    // With no record to check against there is no basis to cut anything.
    if (blob.split(/\s+/).length < 8) return { text, changed: false };

    let changed = false;
    const rewritten = [];
    for (let i = start + 1; i < end; i++) {
      const line = lines[i];
      if (!line.trim()) { rewritten.push(line); continue; }

      const sentences = line.match(/[^.]+\.?/g) || [line];
      const kept = [];
      for (const s of sentences) {
        const m = s.match(_YEARS_CLAUSE);
        if (!m) { kept.push(s); continue; }

        const words = String(m[2]).toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
        const distinctive = words.filter((w) => !_STOP.has(w));
        if (!distinctive.length) { kept.push(s); continue; }
        const supported = distinctive.filter((w) => blob.indexOf(w) !== -1).length;
        const unsupported = supported === 0 || (distinctive.length >= 4 && supported <= 1);
        if (!unsupported) { kept.push(s); continue; }

        if (m[1]) {
          // There is a connective to cut at, so the rest of the sentence
          // survives and still says something the CV backs up.
          const trimmed = s.replace(_YEARS_CLAUSE, '')
            .replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1')
            .replace(/,\s*\./g, '.').replace(/,\s*$/, '').trim();
          if (trimmed.split(/\s+/).filter(Boolean).length >= 3) {
            kept.push(/[.!?]$/.test(trimmed) ? trimmed : trimmed + '.');
            changed = true;
            continue;
          }
        }
        // Nothing to cut at, or nothing usable left over: the sentence
        // WAS the claim, so it goes.
        changed = true;
      }

      rewritten.push(kept.join(' ').replace(/\s{2,}/g, ' ').trim());
    }

    if (!changed) return { text, changed: false };
    // Never leave an empty summary behind. A CV opening on a blank
    // section reads worse than one opening on an overreach, so if the
    // whole block would go, it stays and the model's judgement decides.
    if (!rewritten.join('').trim()) return { text, changed: false };

    for (let i = start + 1; i < end; i++) lines[i] = rewritten[i - start - 1];
    return { text: lines.join('\n'), changed: true };
  }

  // ===================================================================
  // EDUCATION ENTRIES CARRY THEIR DATES
  // -------------------------------------------------------------------
  // A live Workday parse of a generated CV returned both education
  // entries with `date: ""`. Workday's education block has required
  // From/To year fields, and it is not alone -- the same required-year
  // shape appears across the enterprise ATS tier. Every one of those
  // applications was being hand-typed, on a field the profile already
  // knows the answer to.
  //
  // The cause is that the generator writes the education section from
  // the model's tailored text, and the model reliably emits degree and
  // institution and reliably drops the year. Asking it more firmly is
  // not a guarantee; reading the date out of the structured profile and
  // putting it back is.
  //
  // Nothing is invented. A date is restored only when the profile
  // carries one for an entry the CV already names, and an entry that
  // already shows a year is left exactly as it is.
  const _EDU_HEAD = new RegExp('^\\s*(?:EDUCATION|ACADEMIC\\s+BACKGROUND'
    + '|ACADEMIC\\s+QUALIFICATIONS|EDUCATIONAL\\s+QUALIFICATIONS'
    + '|ACADEMIC\\s+HISTORY|QUALIFICATIONS)\\s*:?\\s*$', 'i');
  const _HAS_YEAR = /\b(?:19|20)\d{2}\b/;
  const _EDU_STOP = new Set(['university', 'college', 'school', 'institute',
    'academy', 'bachelor', 'master', 'science', 'arts', 'degree', 'honours',
    'honors', 'with', 'and', 'the', 'of', 'in']);

  // The graduation date arrives under whichever name its source used, so
  // accept the usual aliases rather than one canonical field.
  function _eduDates(edu) {
    if (!edu || typeof edu !== 'object') return '';
    const one = edu.dates || edu.date || edu.year || edu.graduationDate
      || edu.graduation_date || edu.graduationYear || edu.graduation_year;
    if (one) return String(one).trim();
    const start = edu.startDate || edu.start_date || edu.startYear || edu.start_year;
    const end = edu.endDate || edu.end_date || edu.endYear || edu.end_year;
    if (start && end) return String(start).trim() + ' - ' + String(end).trim();
    return String(start || end || '').trim();
  }

  // En/em dashes to a hyphen, the separator every documented ATS date
  // parser splits on, and the same one the experience block already uses.
  const _prettyEduDate = (d) => String(d).trim()
    .replace(/\s*[–—]\s*/g, ' - ').replace(/\s*-\s*/g, ' - ')
    .replace(/\s{2,}/g, ' ').trim();

  const _eduNorm = (s) => String(s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  function restoreEducationDates(cvText, education) {
    const text = String(cvText || '');
    if (!text || !Array.isArray(education) || !education.length) return { text, added: 0 };
    const lines = text.split('\n');

    const start = lines.findIndex((l) => _EDU_HEAD.test(l));
    if (start === -1) return { text, added: 0 };
    let end = start + 1;
    while (end < lines.length && !_ANY_HEAD.test(lines[end])) end++;

    const inserts = [];
    const claimed = new Set();
    for (const edu of education) {
      const dates = _eduDates(edu);
      if (!dates || !_HAS_YEAR.test(dates)) continue;

      // Anchor on the institution, falling back to the degree. The date
      // goes under whichever line the CV actually shows, so an entry the
      // tailoring dropped never gets a date bolted to a different school.
      let at = -1;
      const keys = [edu.institution || edu.school || edu.university || edu.name,
        edu.degree || edu.qualification || edu.course];
      for (const key of keys) {
        const k = _eduNorm(key);
        if (k.length < 4) continue;
        for (let i = start + 1; i < end; i++) {
          if (claimed.has(i)) continue;
          const l = _eduNorm(lines[i]);
          if (l.length < 4) continue;
          if (l.indexOf(k) !== -1 || k.indexOf(l) !== -1) { at = i; break; }
        }
        if (at !== -1) break;
      }
      if (at === -1) continue;
      claimed.add(at);

      // Already dated somewhere in the entry, so there is nothing to
      // restore and re-stating the year would read as a duplicate.
      if (_HAS_YEAR.test(lines[at])) continue;
      if (_HAS_YEAR.test(lines[at - 1] || '')) continue;
      const next = (lines[at + 1] || '').trim();
      if (next && _HAS_YEAR.test(next) && next.split(/\s+/).length <= 6) continue;

      inserts.push({ at, line: _prettyEduDate(dates) });
    }
    if (!inserts.length) return { text, added: 0 };

    // Back to front, so earlier indices stay valid as lines are inserted.
    inserts.sort((a, b) => b.at - a.at);
    for (const ins of inserts) lines.splice(ins.at + 1, 0, ins.line);
    return { text: lines.join('\n'), added: inserts.length };
  }

  // ===================================================================
  // PERCENTAGES COME OUT
  // -------------------------------------------------------------------
  // A percentage is the easiest figure to invent and the hardest for a
  // reader to check: "by 40%" invites 40% of what, measured how, against
  // what baseline. A reader who cannot answer discounts the bullet, and
  // often the document with it. The underlying facts are almost always
  // stronger anyway -- "cut the manual review queue with no loss of
  // precision across millions of daily users" says more than the 40% did.
  //
  // Removed even when the source CV supplied it, because that is what
  // was asked for and it is the candidate's own material to decide about.
  // Nothing else in the sentence is touched: no fact is added, no number
  // is converted into another number, and every non-percentage figure --
  // counts, durations, volumes, "50+", "two hours", "millions" -- is left
  // exactly as written, since those are the evidence worth keeping.
  const _PCT = /\d{1,3}(?:[.,]\d+)?\s*(?:%|per\s?cent|percent)/i;

  /**
   * A STANDARD BOLTED ONTO THE END OF A BULLET THAT IS NOT ABOUT IT.
   *
   * Read off the real generated CV by a parser:
   *
   *   "Implemented full-stack observability with the ELK Stack,
   *    Prometheus and Grafana, enabling early-warning alerting and
   *    cutting mean time to resolution substantially, with iso 9001."
   *
   *   "Built and maintained CI/CD pipelines with Azure DevOps and GitHub
   *    Actions, enabling automated deployments across staging,
   *    using as9100."
   *
   * ISO 9001 is a quality management standard and AS9100 is its
   * aerospace equivalent. Neither has anything to do with observability
   * or a deployment pipeline. They were appended to reach a keyword, and
   * the seam shows: a trailing clause with no verb, hanging off a
   * sentence that had already finished, in lower case.
   *
   * A recruiter in that industry reads this as someone who has never
   * worked to the standard, which is worse than not matching the keyword
   * at all. So the clause goes.
   *
   * Two rules, both narrow on purpose:
   *
   *   A standard is REMOVED only when it forms a trailing clause of the
   *   shape ", with X." or ", using X." at the very end of a bullet.
   *   That shape is the bolt-on. A standard named inside the sentence
   *   ("audited the line against ISO 9001 before release") is real work
   *   and is left exactly as it is.
   *
   *   A standard that stays is RECASED. "iso 9001" and "as9100" are
   *   proper names and are written ISO 9001 and AS9100. Lower case is
   *   itself a tell that the term was pasted rather than written.
   */
  // Two halves, because four of these prefixes are also ordinary English
  // words. "AS", "EN", "UL" and "API" may only be followed IMMEDIATELY by
  // the number (as9100, EN1090). Allowing a space would have matched
  // "...as 2023 revenue..." and rewritten it to "AS 2023", inventing a
  // standard out of a sentence. The unambiguous prefixes may be spaced,
  // which is how they are normally written, and two digits are enough
  // because NFPA 70 exists.
  const _STANDARD = '(?:\\b(?:ISO|IEC|DIN|ANSI|ASTM|ASME|IPC|NFPA|OSHA|SAE|MIL|BS)'
    + '(?:[\\s-]?[A-Z])?[\\s-]?\\d{2,5}(?:[:-]\\d{2,4})?)'
    + '|(?:\\b(?:AS|EN|UL|API)-?\\d{2,5}(?:[:-]\\d{2,4})?)';

  /**
   * EMPLOYMENT TYPE BELONGS IN THE DESCRIPTION, NOT IN THE JOB TITLE.
   *
   * Measured on a generated document: the Job Title a parser extracts is
   *
   *     "AI Product Manager (Contract, part-time)"
   *
   * That is a real field. Workday, Taleo and iCIMS store it, recruiters
   * search and filter on it, and several normalise it against a title
   * taxonomy. "AI Product Manager (Contract, part-time)" matches neither
   * a search for "AI Product Manager" nor any taxonomy entry, so the role
   * is harder to find than if the qualifier were not there.
   *
   * The information itself matters and is NOT dropped. It moves to the
   * one place that costs nothing: the description. Ranked by how much
   * damage a stray qualifier does,
   *
   *     Job Title   searched and matched directly    keep clean
   *     Company     matched against employer names   keep clean
   *     Dates       parsed for tenure arithmetic     keep clean
   *     Bullets     free text, matched by keyword    safe
   *
   * so it becomes the role's first bullet, where a recruiter reads it in
   * the same glance and no structured field carries it.
   *
   * Only genuine employment-type qualifiers move. A parenthetical that is
   * part of the title itself, "(EMEA)" or "(Data Platform)", is left
   * alone: it is the name of the job, not a note about the contract.
   */
  const _EMP_TYPE = new RegExp(
    '\\s*\\(\\s*((?:contract|contractor|part[\\s-]?time|full[\\s-]?time|freelance'
    + '|temporary|temp|fixed[\\s-]?term|interim|internship|intern|placement'
    + '|seasonal|maternity cover|parental cover|secondment|consultant|consultancy'
    + '|permanent|perm|remote|hybrid|on[\\s-]?site)'
    + '(?:\\s*,\\s*[a-z\\s-]+)*)\\s*\\)\\s*$', 'i');

  /**
   * THE COMPANY FIELD IS THE COMPANY'S NAME.
   *
   * "Meta (formerly Facebook Inc)" is one text item, and it lands in the
   * Company field a parser stores. Employers match that field against a
   * name: "Meta" matches, "Meta (formerly Facebook Inc)" does not. Same
   * fault as the employment type in the job title, one line up.
   *
   * EVERY parenthetical goes, and none of it is kept elsewhere.
   *
   * A rename is the employer's corporate history rather than the
   * candidate's work: nobody screening for Meta experience searches for
   * Facebook Inc. A descriptor like "(AI Startup)" is a slightly closer
   * call, but it is a label the candidate applied to the employer, not
   * something they did, and the bullets under the role already show what
   * kind of place it was. Neither is worth the risk of a company field
   * that fails to match the company.
   */
  const _COMPANY_PAREN = /\s*\(([^)]{2,60})\)\s*$/;

  function cleanCompanyLine(cvText) {
    if (!cvText || typeof cvText !== 'string') return { text: cvText || '', cleaned: 0 };
    const lines = cvText.split('\n');
    const out = [];
    let inExp = false, cleaned = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bare = line.trim();
      if (_EXP_HEAD.test(bare)) { inExp = true; out.push(line); continue; }
      if (inExp && _ANY_HEAD.test(bare) && !_EXP_HEAD.test(bare)) { inExp = false; out.push(line); continue; }

      // A COMPANY line: inside the experience section, not a bullet, not
      // itself carrying the dates, and followed by the line that does.
      // That last condition is what distinguishes it from a job title,
      // which is handled separately and must not be touched here.
      const next = (lines[i + 1] || '').trim();
      const nextNext = (lines[i + 2] || '').trim();

      // THE COMPANY LINE NOW CARRIES ITS LOCATION.
      //
      // This used to require the line to hold no tab at all, which was
      // true when it was written and stopped being true the day
      // per-role locations were added: the company line became
      // "Meta (formerly Facebook Inc)\tDublin, Ireland", the tab test
      // rejected it, and the rename went straight back into the Company
      // field -- the exact fault this function exists to prevent,
      // reintroduced by a feature that never touched it. It only showed
      // when the profile HAD a location for the role, which is now the
      // normal case.
      //
      // So the line is split at the tab and only the company half is
      // examined. The tab test earned its place by keeping the title out
      // of here -- "Software Engineer\tJanuary 2023 - Present" would
      // otherwise have lost its "(Contract, part-time)" to a rule about
      // company names -- and that job is done by checking the half after
      // the tab for a date instead.
      const lead = line.slice(0, line.length - line.trimStart().length);
      const tabAt = bare.indexOf('\t');
      const head = tabAt === -1 ? bare : bare.slice(0, tabAt);
      const tail = tabAt === -1 ? '' : bare.slice(tabAt);

      // company, then TITLE, then date. The title line is also followed
      // by a date, so without excluding that this claimed the title too
      // and took "(Contract, part-time)" off it as though it were a
      // company parenthetical -- undoing the employment-type rule one
      // line down and reporting the wrong fix.
      const isCompany = inExp && bare && !/^\s*[-*•]/.test(line)
        && !ROLE_DATE_RE.test(head) && !ROLE_DATE_RE.test(tail)
        && !ROLE_DATE_RE.test(next)
        && (ROLE_DATE_RE.test(nextNext) || /\t/.test(next));
      const m = isCompany ? head.match(_COMPANY_PAREN) : null;
      if (!m) { out.push(line); continue; }

      out.push(lead + head.replace(_COMPANY_PAREN, '') + tail);
      cleaned++;
    }
    return { text: out.join('\n'), cleaned };
  }

  function moveEmploymentType(cvText) {
    if (!cvText || typeof cvText !== 'string') return { text: cvText || '', moved: 0 };
    const lines = cvText.split('\n');
    const out = [];
    let inExp = false, moved = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bare = line.trim();
      if (_EXP_HEAD.test(bare)) { inExp = true; out.push(line); continue; }
      if (inExp && _ANY_HEAD.test(bare) && !_EXP_HEAD.test(bare)) { inExp = false; out.push(line); continue; }

      const m = (inExp && bare && !/^\s*[-*•]/.test(line)) ? line.match(_EMP_TYPE) : null;
      if (!m) { out.push(line); continue; }

      out.push(line.replace(_EMP_TYPE, ''));
      // The date line, when there is one, must stay immediately under the
      // title: that adjacency is how a parser binds a date to a role.
      const next = lines[i + 1];
      if (next && ROLE_DATE_RE.test(next.trim())) { out.push(next); i++; }
      const label = m[1].replace(/\s+/g, ' ').trim();
      out.push('- ' + label.charAt(0).toUpperCase() + label.slice(1) + '.');
      moved++;
    }
    return { text: out.join('\n'), moved };
  }

  /**
   * THE EMPLOYMENT TYPE NOW ARRIVES IN ITS OWN FIELD.
   *
   * moveEmploymentType above takes "(Contract, part-time)" off a job
   * title and writes it as the role's first bullet, because the title
   * field is searched and matched directly and a qualifier in it costs
   * the match. That pass reads the CV TEXT, which is where the qualifier
   * used to be.
   *
   * The profile now splits it out at source into employment_type, so the
   * title arrives clean and moveEmploymentType finds nothing to do --
   * and the information disappears. A contract or part-time role
   * presented as though it were permanent and full-time is a
   * misrepresentation by omission, and it surfaces at reference stage,
   * which is the worst possible moment for it.
   *
   * So it is put back where it was: the role's first bullet, read in the
   * same glance, in no structured field.
   *
   * FULL-TIME AND PERMANENT ARE NOT ANNOTATED. They are what a reader
   * assumes, so stating them says nothing and costs a line per role.
   */
  const _EMP_TYPE_VALUE = new RegExp(
    '^(?:contract|contractor|part[\\s-]?time|freelance|temporary|temp'
    + '|fixed[\\s-]?term|interim|internship|intern|placement|seasonal'
    + '|maternity cover|parental cover|secondment|consultant|consultancy)'
    + '(?:\\s*,\\s*[a-z\\s-]+)*$', 'i');

  /**
   * WORK THE PROFILE RECORDS AND THE CV DOES NOT.
   *
   * Reported: "I updated my profile section with new bullets but all
   * bullets aren't generating." Twenty-eight bullets across four roles
   * went in; thirteen came out. Nothing in the extension had dropped
   * them -- the tailoring model had, before the text ever arrived here,
   * under a prompt rule capping each role at four to six bullets.
   *
   * That may even be the right call for a given posting. What is not
   * defensible is that it happened silently. The user wrote those
   * bullets deliberately, and the only way to discover half were gone
   * was to count them by hand against the profile page.
   *
   * So this counts, per employer, and names what is missing. It does NOT
   * put the bullets back: the model rewrote the ones it kept to match
   * the posting, and splicing raw profile text in beside them would
   * produce a CV in two voices. Restoring is a decision, and it belongs
   * to whoever is applying for the job.
   */
  const _STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into',
    'across', 'their', 'them', 'they', 'were', 'was', 'are', 'has', 'had', 'have', 'been',
    'which', 'while', 'after', 'before', 'over', 'under', 'through', 'every', 'each',
    'more', 'than', 'then', 'when', 'where', 'what', 'who', 'whom', 'its', 'it', 'a', 'an',
    'of', 'in', 'on', 'to', 'by', 'at', 'as', 'is', 'be', 'or', 'so', 'up', 'out', 'all']);

  // THE TITLE IS NOT ALWAYS THE VERY NEXT LINE.
  //
  // Both passes below identified a role by "company line, then title
  // line". On every CV that carries a per-role location -- which is
  // every one this ships, since the audit adds locations itself -- the
  // real shape is company, LOCATION, title, dates. So no role was ever
  // recognised on a real document, and the bullet accounting silently
  // measured nothing at all. It was written against the fixtures, and
  // the fixtures had no locations.
  //
  // Look ahead a couple of lines for the title instead of demanding it
  // immediately, and stop at anything that ends the block.
  //
  // And the line AFTER the company is a candidate too, which is the
  // second half of the same bug: "Dublin, Ireland" is followed by
  // "Software Engineer", so the location line opened a role of its own
  // and every bullet in the block was filed under a company called
  // Dublin. A role, once opened, owns the next few header lines --
  // location, title, dates -- and nothing in them may open another.
  const _HEADER_RUN = 3;
  const _titleNear = (lines, i) => {
    for (let k = i + 1; k <= i + 2 && k < lines.length; k++) {
      const t = (lines[k] || '').trim();
      if (!t) return false;
      if (/^[-•*]\s*\S/.test(t)) return false;
      if (_ANY_HEAD.test(t)) return false;
      if (ROLE_DATE_RE.test(t)) continue;          // a date line, keep looking
      if (_TITLE_WORD.test(t)) return true;
    }
    return false;
  };

  const _distinctive = (s) => {
    const words = String(s || '').toLowerCase().match(/[a-z][a-z0-9.+#-]{2,}/g) || [];
    return words.filter((w) => !_STOP_WORDS.has(w));
  };

  // IS THIS CV BULLET A REWRITE OF THAT PROFILE BULLET?
  //
  // The first version asked one question: how many of the profile
  // bullet's distinctive words survive into the CV's. That is the wrong
  // direction for what the tailoring actually does, which is COMPRESS.
  // "Hold primary on call responsibility for two critical services.
  // Authored the incident response documentation the team now uses, and
  // led the review that resolved a failure which had recurred monthly
  // for over a year" came back as "Authored incident response
  // documentation and led reviews that resolved recurring failures":
  // seven of the source's twenty-one words, which scores 0.33 and reads
  // as a different bullet. Restoring then printed BOTH.
  //
  // Ask it the other way round as well. Almost every word of a
  // compression comes from its source, so the short bullet's coverage
  // of the long one is high exactly when one is a rewrite of the other.
  // Whichever direction scores higher is the answer.
  //
  // Stems, not words, because the rewrite conjugates: review/reviews,
  // failure/failures, recurred/recurring. Five characters is enough to
  // keep "reporting" and "regulatory" apart and short enough to fold
  // those together.
  const _stems = (s) => new Set(_distinctive(s).map((w) => w.slice(0, 5)));
  const _cover = (a, b) => {
    if (!a.size) return 0;
    let n = 0;
    for (const w of a) if (b.has(w)) n++;
    return n / a.size;
  };
  // WHICHEVER FIELD THE PROFILE PUT THEM IN.
  //
  // This read src.bullets and src.description and nothing else. The
  // location field has already turned up missing once for exactly this
  // reason -- saved under a name the extension did not ask for -- and a
  // bullet list that arrives as `responsibilities` or `achievements`
  // fails the same way, silently, because an empty list is
  // indistinguishable from a role the model kept in full.
  const _BULLET_FIELDS = ['bullets', 'description', 'descriptions', 'responsibilities',
    'achievements', 'accomplishments', 'highlights', 'points', 'details', 'duties',
    'summary', 'text', 'content'];
  const _profileBullets = (src) => {
    if (!src || typeof src !== 'object') return [];
    const out = [];
    for (const f of _BULLET_FIELDS) {
      const v = src[f];
      if (!v) continue;
      if (Array.isArray(v)) out.push(...v.map((x) => (x && typeof x === 'object')
        ? String(x.text || x.bullet || x.value || '') : String(x || '')));
      else if (typeof v === 'string') out.push(...v.split(/\r?\n/));
      if (out.length) break;                  // the first field that has them wins
    }
    return out.map((b) => String(b || '').replace(/^[\s\-•*]+/, '').trim())
      .filter((b) => b.length > 20);
  };

  const _BULLET_MATCH = 0.45;
  const _bulletsMatch = (profileBullet, cvBullet) => {
    const A = _stems(profileBullet);
    if (A.size < 4) return 0;                  // too short to judge
    const B = _stems(cvBullet);
    return Math.max(_cover(A, B), _cover(B, A));
  };

  function reportDroppedBullets(cvText, experience) {
    const text = String(cvText || '');
    if (!text || !Array.isArray(experience) || !experience.length) return null;

    // The CV's bullets, grouped by the employer they sit under.
    const byCompany = new Map();
    const lines = text.split('\n');
    let inExp = false, current = '', held = 0;
    for (let i = 0; i < lines.length; i++) {
      const bare = lines[i].trim();
      if (_EXP_HEAD.test(bare)) { inExp = true; current = ''; held = 0; continue; }
      if (_ANY_HEAD.test(bare)) { inExp = false; continue; }
      if (!inExp || !bare) continue;
      if (/^[-•*]\s*\S/.test(bare)) {
        held = 0;
        if (current) byCompany.get(current).push(bare.replace(/^[-•*]\s*/, ''));
        continue;
      }
      // A company line: not a date, and a title follows within a line or
      // two. Not while an open role still holds its own header lines.
      if (ROLE_DATE_RE.test(bare)) continue;
      if (held > 0) { held--; continue; }
      const head = bare.indexOf('\t') === -1 ? bare : bare.slice(0, bare.indexOf('\t'));
      if (_titleNear(lines, i)) {
        held = _HEADER_RUN;
        current = _eduNorm(head);
        if (!byCompany.has(current)) byCompany.set(current, []);
      }
    }
    if (!byCompany.size) return null;

    const missing = [];
    let profileTotal = 0, cvTotal = 0;
    for (const src of experience) {
      if (!src) continue;
      const key = _eduNorm(src.company || src.employer || src.organisation
        || src.organization || src.name);
      if (!key) continue;
      let cvBullets = null;
      for (const [k, v] of byCompany) {
        if (k === key || k.indexOf(key) !== -1 || key.indexOf(k) !== -1) { cvBullets = v; break; }
      }
      if (!cvBullets) continue;              // the role itself is not on the CV

      const profileBullets = _profileBullets(src);
      if (!profileBullets.length) continue;

      profileTotal += profileBullets.length;
      cvTotal += cvBullets.length;

      // The model REWRITES what it keeps, so an exact match finds
      // nothing. A bullet counts as present when most of the words that
      // make it distinctive turn up in one of the CV's bullets for that
      // same employer.
      const gone = profileBullets.filter((b) => _stems(b).size >= 4
        && !cvBullets.some((c) => _bulletsMatch(b, c) >= _BULLET_MATCH));
      if (gone.length) {
        missing.push({
          company: String(src.company || src.employer || src.name).trim(),
          profileBullets: profileBullets.length,
          cvBullets: cvBullets.length,
          dropped: gone.map((b) => b.slice(0, 90)),
        });
      }
    }

    if (!missing.length) return null;
    const total = missing.reduce((n, m) => n + m.dropped.length, 0);
    return {
      kind: 'profile-bullets-dropped',
      count: total,
      profileTotal,
      cvTotal,
      roles: missing,
      note: 'The tailoring never returned ' + total + ' bullet(s) your profile records: '
        + missing.map((m) => m.company + ' ' + m.cvBullets + ' of ' + m.profileBullets).join(', ')
        + '. This is counted before anything here trims, so it is the model choosing '
        + 'what fits the posting -- RULE 11b in the tailoring prompt caps each role at '
        + '4 to 6 bullets for the two most recent and 2 to 4 for the rest. Raising that '
        + 'cap is what brings them back. Nothing in the extension caps them any '
        + 'more: it prints every bullet the tailoring returns.',
    };
  }

  /**
   * AND THEN IT PUTS THEM BACK.
   *
   * Reporting the loss was the first half. It was written on the view
   * that restoring is a decision belonging to whoever is applying, and
   * that splicing raw profile text beside rewritten text gives a CV in
   * two voices. The decision has since been made, twice, in the same
   * words both times: the bullets are still capped, and they should be
   * coming from the profile.
   *
   * The two-voices worry did not survive contact with the output. A
   * real run turned
   *
   *   "cut response times by running downstream calls in parallel
   *    rather than in sequence"
   *
   * into
   *
   *   "which improved response times significantly"
   *
   * The rewrite is not a better voice. It is the same claim with the
   * mechanism and the specificity removed, which is exactly what a
   * reviewer discounts. So the profile's own wording is not a foreign
   * body on this CV; on the evidence it is the stronger half.
   *
   * WHAT THIS DOES, PER ROLE: walk the profile's bullets in the order
   * the profile has them. Where the tailoring returned a rewrite of one
   * -- same match test as the report, most of the distinctive words
   * present -- keep the rewrite, because that is the tailored, keyword
   * bearing version and it is why the model was called at all. Where it
   * returned nothing, print the profile's bullet verbatim. Anything the
   * model wrote that answers to no profile bullet is kept too, at the
   * end, since it is content the CV would otherwise lose.
   *
   * The result is every bullet the profile records, in the profile's
   * order, tailored where tailoring happened.
   *
   * THIS WILL OFTEN MAKE THE CV TWO PAGES, and that is the right
   * outcome rather than a side effect to apologise for: a nine year
   * history with twenty seven recorded bullets is a two page CV.
   * fitToOnePage still runs afterwards and still tries, and still puts
   * everything back when it cannot get there without gutting the
   * history.
   */
  function restoreDroppedBullets(cvText, experience) {
    const text = String(cvText || '');
    if (!text || !Array.isArray(experience) || !experience.length) {
      return { text, restored: 0, reordered: 0, matchedRoles: 0, profileBulletsSeen: 0,
        cvRoles: 0, cvCompanies: [] };
    }

    const lines = text.split('\n');

    // Every role block on the CV: where its bullets start, where they
    // end, and the marker they are written with.
    const roles = [];
    let inExp = false, open = null, held = 0;
    for (let i = 0; i < lines.length; i++) {
      const bare = lines[i].trim();
      if (_EXP_HEAD.test(bare)) { inExp = true; open = null; held = 0; continue; }
      if (_ANY_HEAD.test(bare)) { inExp = false; open = null; held = 0; continue; }
      if (!inExp) continue;
      if (/^[-•*]\s*\S/.test(bare)) {
        held = 0;
        if (open) { open.bullets.push(bare.replace(/^[-•*]\s*/, '')); open.end = i; }
        continue;
      }
      if (!bare) continue;
      if (ROLE_DATE_RE.test(bare)) continue;
      if (held > 0) { held--; continue; }
      const head = bare.indexOf('\t') === -1 ? bare : bare.slice(0, bare.indexOf('\t'));
      if (_titleNear(lines, i)) {
        held = _HEADER_RUN;
        open = { key: _eduNorm(head), raw: head, start: -1, end: -1, bullets: [] };
        roles.push(open);
      }
    }
    // The first bullet line of each block, now that its extent is known.
    for (const r of roles) {
      if (r.end === -1) continue;
      let s = r.end;
      while (s > 0 && /^\s*[-•*]\s*\S/.test(lines[s - 1])) s--;
      r.start = s;
      const m = lines[s].match(/^(\s*[-•*]\s*)/);
      r.marker = m ? m[1] : '- ';
    }

    let restored = 0, reordered = 0, matchedRoles = 0, profileBulletsSeen = 0;
    const edits = [];
    for (const src of experience) {
      if (!src) continue;
      const key = _eduNorm(src.company || src.employer || src.organisation
        || src.organization || src.name);
      if (!key) continue;
      const role = roles.find((r) => r.start !== -1
        && (r.key === key || r.key.indexOf(key) !== -1 || key.indexOf(r.key) !== -1));
      if (!role) continue;

      matchedRoles++;
      const profileBullets = _profileBullets(src);
      if (!profileBullets.length) continue;
      profileBulletsSeen += profileBullets.length;

      // Greedy best match, one CV bullet to one profile bullet, so a
      // single rewrite covering two source bullets cannot stand in for
      // both of them.
      const taken = new Set();
      const rebuilt = [];
      let added = 0;
      for (const pb of profileBullets) {
        let best = -1, bestScore = _BULLET_MATCH;
        role.bullets.forEach((cb, idx) => {
          if (taken.has(idx)) return;
          const sc = _bulletsMatch(pb, cb);
          if (sc >= bestScore) { bestScore = sc; best = idx; }
        });
        if (best !== -1) { taken.add(best); rebuilt.push(role.bullets[best]); }
        else { rebuilt.push(pb); added++; }
      }
      // Whatever the model wrote that answers to nothing in the profile.
      role.bullets.forEach((cb, idx) => { if (!taken.has(idx)) rebuilt.push(cb); });

      // ORDER IS PART OF THE JOB, NOT A SIDE EFFECT OF RESTORING.
      //
      // This used to skip a role that was missing nothing, which left
      // the relevance re-ordering above as the last word on it. The
      // report was "look at Citigroup, that was not my first bullet in
      // my layout": a role can come back complete and still be shuffled
      // out of the order its owner arranged it in. A profile that
      // records the work also records the order of it.
      const changed = added > 0
        || rebuilt.length !== role.bullets.length
        || rebuilt.some((b, i) => b !== role.bullets[i]);
      if (!changed) continue;
      restored += added;
      if (!added) reordered++;
      edits.push({ start: role.start, end: role.end,
        lines: rebuilt.map((b) => role.marker + b) });
    }

    const stats = { restored, reordered, matchedRoles, profileBulletsSeen,
      cvRoles: roles.length, cvCompanies: roles.map((r) => r.raw || r.key).filter(Boolean) };
    if (!edits.length) return Object.assign({ text }, stats);
    // Bottom up, so earlier line numbers stay valid.
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) lines.splice(e.start, e.end - e.start + 1, ...e.lines);
    return Object.assign({ text: lines.join('\n') }, stats);
  }

  function attachEmploymentTypes(cvText, experience) {
    const text = String(cvText || '');
    if (!text || !Array.isArray(experience) || !experience.length) {
      return { text, attached: 0 };
    }
    const lines = text.split('\n');
    let inExp = false, attached = 0;
    const claimed = new Set();

    for (let i = 0; i < lines.length; i++) {
      if (_EXP_HEAD.test(lines[i])) { inExp = true; continue; }
      if (_ANY_HEAD.test(lines[i])) { inExp = false; continue; }
      if (!inExp) continue;

      const bare = lines[i].trim();
      if (!bare || /^\s*[-•*]/.test(bare)) continue;
      // The company line, whether or not it carries its location.
      const head = bare.indexOf('\t') === -1 ? bare : bare.slice(0, bare.indexOf('\t'));
      if (ROLE_DATE_RE.test(head)) continue;
      const next = (lines[i + 1] || '').trim();
      if (!next || !_TITLE_WORD.test(next) || ROLE_DATE_RE.test(next)) continue;

      const key = _eduNorm(head);
      if (key.length < 2) continue;

      for (let e = 0; e < experience.length; e++) {
        if (claimed.has(e)) continue;
        const src = experience[e] || {};
        const co = _eduNorm(src.company || src.employer || src.organisation
          || src.organization || src.name);
        if (!co || (co.indexOf(key) === -1 && key.indexOf(co) === -1)) continue;
        claimed.add(e);

        // Named defensively, like the location field: the profile is
        // edited in a separate app and a near-miss key would otherwise
        // do nothing and say nothing.
        const raw = String(src.employment_type || src.employmentType
          || src.contract_type || src.contractType || src.work_type
          || src.workType || src.job_type || src.jobType || '')
          .replace(/[\t\r\n\v\f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (!raw || !_EMP_TYPE_VALUE.test(raw)) break;

        // Where the bullet goes: after the title, and after the date line
        // when there is one. That adjacency is how a parser binds a date
        // to a role and it must not be broken.
        let at = i + 2;
        if (ROLE_DATE_RE.test((lines[i + 2] || '').trim())) at = i + 3;

        // Already stated, by moveEmploymentType or by the writer.
        const already = [lines[i], lines[i + 1], lines[at], lines[at + 1]]
          .map((l) => String(l || '').toLowerCase()).join(' ');
        const first = raw.split(',')[0].trim().toLowerCase();
        if (first && already.indexOf(first) !== -1) break;

        const label = raw.charAt(0).toUpperCase() + raw.slice(1);
        lines.splice(at, 0, '- ' + label.replace(/\.*$/, '') + '.');
        attached++;
        i = at;                       // resume past what was inserted
        break;
      }
    }
    return { text: lines.join('\n'), attached };
  }

  function stripBoltedStandards(text) {
    if (!text || typeof text !== 'string') return { text: text || '', removed: 0, recased: 0 };
    let removed = 0, recased = 0;
    const lines = text.split('\n').map((line) => {
      let out = line;
      // Only a BULLET can carry a bolt-on: a heading or a skills list
      // legitimately ends in a bare term.
      if (/^\s*[-*•]/.test(out)) {
        const bolt = new RegExp('\\s*,\\s*(?:with|using|including|per|to|under|and)\\s+('
          + _STANDARD + ')\\s*\\.?\\s*$', 'i');
        const m = out.match(bolt);
        if (m) { out = out.replace(bolt, '.'); removed++; }
      }
      // Whatever survived is a real mention, so write it properly.
      out = out.replace(new RegExp(_STANDARD, 'gi'), (s) => {
        const fixed = s.toUpperCase();
        if (fixed !== s) recased++;
        return fixed;
      });
      return out;
    });
    return { text: lines.join('\n'), removed, recased };
  }

  function stripPercentages(cvText) {
    if (!cvText || !_PCT.test(cvText)) return { text: cvText || '', removed: 0 };
    const N = '\\d{1,3}(?:[.,]\\d+)?\\s*(?:%|per\\s?cent|percent)';
    let removed = 0;
    const out = String(cvText).split('\n').map((line) => {
      if (!/^\s*[-•*]\s*\S/.test(line) && !/^[A-Z]/.test(line)) return line;
      if (!_PCT.test(line)) return line;
      const before = line;
      let l = line;

      // "cut X by 40%" -> "cut X". The commonest shape by far.
      l = l.replace(new RegExp(',?\\s*by\\s+(?:about\\s+|around\\s+|roughly\\s+|nearly\\s+|over\\s+|up\\s+to\\s+)?' + N, 'gi'), '');
      // "a 40% reduction" -> "a reduction"; "the 40% uplift" -> "the uplift"
      l = l.replace(new RegExp('\\b(a|an|the)\\s+' + N + '\\s+', 'gi'), '$1 ');
      // "40% faster" -> "faster"
      l = l.replace(new RegExp('\\b' + N + '\\s+(?=[a-z])', 'gi'), '');
      // "(40%)" and any remaining bare token
      l = l.replace(new RegExp('\\s*\\(\\s*' + N + '\\s*\\)', 'gi'), '');
      l = l.replace(new RegExp('\\s*' + N, 'gi'), '');

      // Tidy what the removal left behind.
      l = l.replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.;:])/g, '$1')
        .replace(/,\s*,/g, ',')
        .replace(/\bby\s*([,.;:])/gi, '$1')
        .replace(/\s+(and|with|to)\s*\./gi, '.')
        .replace(/,\s*\./g, '.')
        .replace(/\s+$/, '');
      if (l !== before) removed++;
      return l;
    }).join('\n');
    return { text: out, removed };
  }

  function detectRepeatedWords(cvText) {
    const found = [];
    if (!cvText) return found;
    for (const line of String(cvText).split('\n')) {
      if (!/^\s*[-•*]\s*\S/.test(line)) continue;
      const words = (line.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])
        .filter((w) => !_STOPWORDS.has(w));
      const seen = Object.create(null);
      for (const w of words) seen[w] = (seen[w] || 0) + 1;
      for (const w of Object.keys(seen)) {
        if (seen[w] >= 2) {
          found.push({ word: w, bullet: line.trim() });
          break;   // one flag per bullet is enough to prompt a re-read
        }
      }
    }
    return found;
  }

  // Splits WORK EXPERIENCE into role blocks and sorts them by start date,
  // newest first. Dates themselves are never touched.
  function sortExperienceByStartDate(cvText) {
    const text = String(cvText || '');
    const lines = text.split('\n');
    const HEAD_RE = /^(WORK EXPERIENCE|EXPERIENCE|EMPLOYMENT(?: HISTORY)?)\s*:?\s*$/i;
    const ANY_HEAD_RE = /^[A-Z][A-Z &/]{3,}\s*:?\s*$/;

    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (HEAD_RE.test(lines[i].trim())) { start = i + 1; break; }
    }
    if (start < 0) return { text, sorted: false, reason: 'no experience section' };

    let end = lines.length;
    for (let i = start; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t && ANY_HEAD_RE.test(t) && !HEAD_RE.test(t)) { end = i; break; }
    }

    // A block starts at a non-empty line that follows a blank line, and
    // must contain a parseable date to be sortable at all.
    const blocks = [];
    let cur = null;
    for (let i = start; i < end; i++) {
      const raw = lines[i];
      const t = raw.trim();
      if (!t) { if (cur) cur.lines.push(raw); continue; }
      const isBullet = /^([\-*\u2022]|\d+\.)\s+/.test(t);
      if (!isBullet && (!cur || cur.closed)) { cur = { lines: [raw], startAt: null, closed: false }; blocks.push(cur); }
      else if (cur) { cur.lines.push(raw); }
      if (cur && cur.startAt === null) {
        const sm = _startMonths(t);
        if (sm !== null) cur.startAt = sm;
      }
      if (cur && isBullet) cur.sawBullet = true;
      if (cur && cur.sawBullet && !isBullet && !/^([\-*\u2022]|\d+\.)/.test(t) && _startMonths(t) === null && cur.startAt !== null) {
        // A new non-bullet line after bullets begins the next role.
        cur.closed = true;
        cur = { lines: [raw], startAt: null, closed: false };
        cur.lines = [raw];
        blocks[blocks.length - 1].lines.pop();
        blocks.push(cur);
      }
    }

    const datable = blocks.filter((b) => b.startAt !== null);
    if (datable.length < 2) return { text, sorted: false, reason: 'fewer than two dated roles' };

    const before = datable.map((b) => b.startAt);
    const isDescending = before.every((v, i) => i === 0 || before[i - 1] >= v);
    if (isDescending) return { text, sorted: false, reason: 'already in start-date order' };

    const order = blocks.slice().sort((a, b) => {
      if (a.startAt === null || b.startAt === null) return 0;
      return b.startAt - a.startAt;
    });
    const body = order.map((b) => b.lines.join('\n').replace(/\s+$/, '')).join('\n\n');
    // Reassembling dropped the blank line that separated the last role
    // from the next section heading, so bullets ran straight into
    // EDUCATION and the section boundary was lost to the parser.
    const tail = lines.slice(end);
    const sep = (tail.length && tail[0].trim()) ? [''] : [];
    const out = lines.slice(0, start).concat(body.split('\n'), sep, tail).join('\n');
    return { text: out.replace(/\n{3,}/g, '\n\n'), sorted: true, roles: datable.length };
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

    // (c) Em and en dashes to neutral punctuation.
    //
    // In PROSE a comma is right: it keeps the sentence whole without the
    // glyph. BETWEEN TWO DATES it is wrong twice over. A CV reads
    // "January 2023 - Present", and "January 2023, Present" is not just
    // odd to read: it stops the line matching ROLE_DATE_RE, which is how
    // every later pass finds where one role ends and the next begins. So
    // bullet ordering, the per-role cap and the pivot summary rewrite all
    // ran against a document whose roles they could no longer see, and
    // did nothing at all -- silently, on a CV that still looked fine.
    // This ran BEFORE all three of them, so nothing downstream could
    // recover. Models write date ranges with an en dash by default, so
    // this was the normal case rather than an edge one.
    const D = '(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{4}'
      + '|\\d{1,2}/\\d{4}|\\b\\d{4}\\b|\\b(?:Present|Current|Ongoing|Now|To Date)\\b)';
    out = out.replace(new RegExp('(' + D + ')\\s*[–—]\\s*(' + D + ')', 'gi'), '$1 - $2');

    // Everything still carrying one is prose.
    out = out
      .replace(/\s*[–—]\s*/g, ', ')
      .replace(/[–—]/g, ', ');

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
  //   * <= 220 characters -- TWO RENDERED LINES at body size. The
  //     summary earns its place as the keyword landing zone, but a
  //     recruiter gives the top of the page seconds: two lines get
  //     read on the way to the experience, five get skipped. Was 360
  //     (three-plus lines); tightened on the decision to keep the
  //     section rather than remove it.
  //     (truncated at sentence boundary, never mid-word)
  //   * No "looking for X" / "open to X" / "seeking X" sentence (techtalk
  //     skill: "do not include a line about what they're looking to do
  //     next — this adds no value and wastes character space").
  // Safe-mode: only touches text BETWEEN the summary header and the
  // next blank line or next ALL-CAPS section header.  If the boundary
  // can't be found cleanly, the clamp is skipped.
  // ===================================================================

  const SUMMARY_HEADER_RE = /^(SUMMARY|PROFESSIONAL SUMMARY|PROFILE|ABOUT(?: ME)?)\s*:?\s*$/im;
  // THE HEADING THAT WAS NOT ON THIS LIST DELETED THE REST OF THE CV.
  //
  // The list was a hand-written set of section names, and the one it
  // did not name was PROFESSIONAL EXPERIENCE -- which is the heading
  // the renderer canonicalises everything to, so it is on nearly every
  // document this ships. TECHNICAL SKILLS, SELECTED PROJECTS,
  // ACHIEVEMENTS, AWARDS, PUBLICATIONS and REFERENCES were missing too.
  //
  // On its own that is harmless, because the scan also stops at a blank
  // line. Together with a CV that has no blank line between the summary
  // paragraph and the next heading -- which is what the tailoring model
  // emits, and what comes back out of a rendered document -- the end of
  // the summary was never found, so the summary block became THE WHOLE
  // REST OF THE FILE. Clamping it to 360 characters then deleted the
  // experience, the skills, the projects and the education, and
  // reported itself as the fix "summary clamped to 360 chars".
  //
  // Any all-caps line is a heading. Matching the shape rather than a
  // list is what stops this returning the next time a section is named
  // something nobody wrote down here.
  const NEXT_SECTION_RE = _ANY_HEAD;
  const LOOKING_SENTENCE_RE = /[^.!?\n]*\b(looking (?:for|to)|seeking|open to (?:new )?(?:opportunit|role|position)|aspir(?:e|ing) to)\b[^.!?\n]*[.!?]?/gi;

  function clampSummary(text, { maxChars = 220 } = {}) {
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

    // AND IF THE BOUNDARY IS STILL WRONG, DO NOTHING.
    //
    // The heading list above was wrong for years and the failure was
    // silent and total. A summary is a short paragraph: a few lines, no
    // bullets, no role dates. Anything else means the end of the block
    // was not found, and the right response to that is to leave the
    // document alone rather than clamp whatever got swept up. This
    // costs a clamp on a pathological summary and cannot cost the CV.
    const summaryLines = lines.slice(headerIdx + 1, endIdx);
    const looksLikeMore = summaryLines.length > 6
      || summaryLines.some((l) => /^\s*[-•*]\s*\S/.test(l))
      || summaryLines.some((l) => ROLE_DATE_RE.test(l.trim()));
    if (looksLikeMore) return { text, clamped: false, removedSentences: 0 };

    let summary = summaryLines.join(' ').trim();
    let removedSentences = 0;

    // Strip "looking to / seeking / open to" sentences first.
    const before = summary;
    summary = summary.replace(LOOKING_SENTENCE_RE, '').replace(/\s{2,}/g, ' ').trim();
    if (summary !== before) removedSentences = 1;

    // Truncate at sentence boundary if still too long.
    //
    // A sentence ends at punctuation FOLLOWED BY WHITESPACE (or the
    // end of the text). The old split ([^.!?]+[.!?]+) ended one at any
    // full stop, so "a GBP 2.6bn portfolio" contained a "sentence"
    // ending "GBP 2." -- and since that fragment fit the cap, the
    // clamp published it as the whole summary. Invisible at 360 chars,
    // guaranteed at a cap the first sentence usually exceeds.
    let clamped = false;
    if (summary.length > maxChars) {
      const matched = summary.match(/[\s\S]*?[.!?]+(?=\s|$)\s*/g) || [];
      const consumed = matched.join('');
      if (consumed.length < summary.length) matched.push(summary.slice(consumed.length));
      const sentences = matched.length ? matched : [summary];
      let acc = '';
      for (const s of sentences) {
        if ((acc + s).length > maxChars) break;
        acc += s;
      }
      // A model-written summary is often ONE long sentence, so at a
      // two-line cap no whole sentence may fit. Cut at the last clause
      // boundary inside the cap before resorting to a mid-phrase
      // slice: ", delivering X" lost whole reads better than "and
      // proc." Only a clause long enough to stand alone (>= 100 chars)
      // is kept, otherwise the hard slice below still applies.
      let usedBoundary = !!acc;
      if (!acc) {
        const head = summary.slice(0, maxChars);
        const clauseAt = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '));
        if (clauseAt >= 100) { acc = head.slice(0, clauseAt); usedBoundary = true; }
      }
      summary = (acc || summary.slice(0, maxChars)).trim();
      // Don't end mid-word -- but ONLY when we hard-sliced. A boundary
      // cut already ends cleanly; stripping its last word produced
      // truncated phrases like "ensuring exceptional."
      if (!usedBoundary) {
        summary = summary.replace(/\s+\S*$/, m => m.length < 25 ? '' : m).trim();
      }
      summary = summary.replace(/[,;]$/, '');
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
  // WHAT THE SCORING TOOLS CHECK AND THIS DID NOT
  // -------------------------------------------------------------------
  // Enhancv, Resume Worded, Jobscan and Rezi were read against the
  // thirty checks already here. Most of their rubric was covered, and
  // several things they do not check at all were covered better --
  // fabricated keywords, an inflated years figure, a headline claiming
  // an unheld title. Four real gaps remained, and all four are things a
  // HUMAN discounts rather than scoring conventions.
  //
  // Deliberately not copied: an overall 0-100 score. A number invites
  // optimising for the number, and the checks below name a specific
  // defect and where it is, which is more useful.
  // ===================================================================

  // ── 1. TENSE ────────────────────────────────────────────────────────
  // A finished job described in the present tense is the most common
  // thing a reader notices and the writer does not. "Build and own
  // backend services" under a role that ended in 2021 reads as
  // carelessness on the one document that is supposed to be careful.
  //
  // Only the unambiguous direction is flagged: a PAST role opening a
  // bullet with a base-form verb. The reverse -- past tense inside a
  // current role -- is legitimate for work that is finished, so it is
  // left alone. Irregular pasts are listed because "led", "built" and
  // "held" are not "-ed" and a naive rule calls them present tense.
  const _BASE_VERBS = new Set(['build', 'lead', 'manage', 'own', 'drive', 'deliver',
    'develop', 'design', 'create', 'maintain', 'support', 'run', 'oversee', 'handle',
    'coordinate', 'collaborate', 'partner', 'work', 'write', 'author', 'review',
    'analyse', 'analyze', 'report', 'monitor', 'track', 'test', 'deploy', 'automate',
    'optimise', 'optimize', 'improve', 'reduce', 'increase', 'ensure', 'provide',
    'produce', 'present', 'train', 'mentor', 'hold', 'serve', 'act', 'help',
    'contribute', 'participate', 'facilitate', 'administer', 'implement', 'integrate',
    'configure', 'troubleshoot', 'resolve', 'investigate', 'define', 'plan', 'set']);
  // Past forms that do not end in -ed, so they are not mistaken for base forms.
  const _IRREGULAR_PAST = new Set(['led', 'built', 'held', 'ran', 'wrote', 'drove',
    'grew', 'made', 'kept', 'set', 'cut', 'put', 'spent', 'taught', 'brought', 'won',
    'took', 'gave', 'began', 'chose', 'found', 'met', 'sent', 'sold', 'spoke',
    'rebuilt', 'oversaw', 'drew', 'rose', 'became', 'left', 'dealt', 'brought']);

  function tenseAudit(cvText) {
    const text = String(cvText || '');
    if (!text) return { violations: [] };
    const lines = text.split('\n');
    const violations = [];
    let inExp = false, roleIsCurrent = null, roleLabel = '';
    for (let i = 0; i < lines.length; i++) {
      const bare = lines[i].trim();
      if (_EXP_HEAD.test(bare)) { inExp = true; roleIsCurrent = null; continue; }
      if (_ANY_HEAD.test(bare)) { inExp = false; roleIsCurrent = null; continue; }
      if (!inExp || !bare) continue;

      // A date line decides the tense for the bullets beneath it.
      if (ROLE_DATE_RE.test(bare)) {
        roleIsCurrent = /\b(present|current|now|to date|ongoing)\b/i.test(bare);
        continue;
      }
      if (!/^[-•*]\s*\S/.test(bare)) {
        if (!ROLE_DATE_RE.test(bare) && bare.length < 80) roleLabel = bare.split('\t')[0].trim();
        continue;
      }
      if (roleIsCurrent !== false) continue;         // unknown or current: leave it

      const opener = bare.replace(/^[-•*]\s*/, '').split(/\s+/)[0] || '';
      const w = opener.toLowerCase().replace(/[^a-z]/g, '');
      if (!w || _IRREGULAR_PAST.has(w) || /ed$/.test(w)) continue;
      if (!_BASE_VERBS.has(w)) continue;
      violations.push({ role: roleLabel, verb: opener,
        sample: bare.replace(/^[-•*]\s*/, '').slice(0, 90) });
      if (violations.length >= 6) break;
    }
    return { violations };
  }

  // ── 2. PRONOUNS ─────────────────────────────────────────────────────
  // The cover letter was already checked for being "I"-heavy. The CV
  // was not checked at all, and a bullet reading "I managed a team of
  // six" is marked down by every scoring tool and reads as a first
  // draft. A CV is written in the implied first person; the pronoun is
  // the one word that never needs to be there.
  const _PRONOUN_RE = /(^|[^A-Za-z])(I|I'm|I've|my|me|mine|we|our|ours|us)([^A-Za-z]|$)/;
  function pronounAudit(cvText) {
    const text = String(cvText || '');
    if (!text) return { violations: [] };
    const violations = [];
    for (const raw of text.split('\n')) {
      const bare = raw.trim();
      if (!/^[-•*]\s*\S/.test(bare)) continue;
      const body = bare.replace(/^[-•*]\s*/, '');
      // Case matters for "I"; the rest are matched case-insensitively
      // but only as whole words, so "us" inside "customers" is safe.
      const hit = _PRONOUN_RE.exec(body) || /(^|[^A-Za-z])(my|me|mine|we|our|ours|us)([^A-Za-z]|$)/i.exec(body);
      if (!hit) continue;
      violations.push({ word: hit[2], sample: body.slice(0, 90) });
      if (violations.length >= 6) break;
    }
    return { violations };
  }

  // ── 3. PASSIVE AND DUTY LANGUAGE ────────────────────────────────────
  // "Was responsible for the migration" and "Migrated 47 services" can
  // describe the same work, and only one of them says the candidate did
  // it. This is the single most-flagged category across every tool
  // read, and it is flagged because it is right: passive voice hides
  // agency, which is the only thing a bullet exists to establish.
  const _PASSIVE_RES = [
    [/\b(?:was|were|been|being)\s+(?:[a-z]+ly\s+)?[a-z]+(?:ed|en)\b/i, 'passive voice'],
    [/\bresponsible\s+for\b/i, '"responsible for"'],
    [/\btasked\s+with\b/i, '"tasked with"'],
    [/\bduties\s+(?:included|involved)\b/i, '"duties included"'],
    [/\bin\s+charge\s+of\b/i, '"in charge of"'],
    [/\binvolved\s+in\b/i, '"involved in"'],
    [/\bhelped\s+(?:to\s+)?[a-z]+/i, '"helped"'],
    [/\bassisted\s+(?:with|in)\b/i, '"assisted with"'],
  ];
  function passiveVoiceAudit(cvText) {
    const text = String(cvText || '');
    if (!text) return { violations: [] };
    const violations = [];
    for (const raw of text.split('\n')) {
      const bare = raw.trim();
      if (!/^[-•*]\s*\S/.test(bare)) continue;
      const body = bare.replace(/^[-•*]\s*/, '');
      for (const [re, label] of _PASSIVE_RES) {
        if (!re.test(body)) continue;
        violations.push({ pattern: label, sample: body.slice(0, 90) });
        break;
      }
      if (violations.length >= 6) break;
    }
    return { violations };
  }

  // ── 4. SCOPE ────────────────────────────────────────────────────────
  // Resume Worded scores explicitly for evidence of scale: team size,
  // budget, headcount, the number of stakeholders or systems. It is the
  // difference between "led the migration" and "led the migration of 47
  // services for a GBP 2.6bn portfolio", and it is what separates a
  // senior CV from a competent one.
  //
  // This is the one check here that reports an ABSENCE. A CV with no
  // scope signal anywhere is not necessarily wrong, but on a senior
  // application it is nearly always a CV whose owner left the numbers
  // out of their profile rather than one who never had them.
  const _SCOPE_RES = [
    /\bteam of \d+|\b\d+\s+(?:engineers|analysts|developers|people|reports|consultants|staff)\b/i,
    /[£$€]\s?\d[\d,.]*\s?(?:k|m|bn|b|million|billion)?\b/i,
    /\b\d+\s+(?:stakeholder|client|customer|country|countries|office|market|team|service|system|application)s?\b/i,
    /\b(?:managed|led|mentored|trained|supervised)\s+\d+/i,
  ];
  function scopeAudit(cvText) {
    const text = String(cvText || '');
    if (!text) return { bullets: 0, withScope: 0 };
    let bullets = 0, withScope = 0;
    for (const raw of text.split('\n')) {
      const bare = raw.trim();
      if (!/^[-•*]\s*\S/.test(bare)) continue;
      bullets++;
      if (_SCOPE_RES.some((re) => re.test(bare))) withScope++;
    }
    return { bullets, withScope };
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

  // THE CHECK DID NOT RECOGNISE THE HEADING THE RENDERER WRITES.
  //
  // The experience pattern was /^(WORK\s+)?EXPERIENCE$/, which does not
  // match PROFESSIONAL EXPERIENCE -- the heading every document this
  // extension produces uses, because the renderer canonicalises to it
  // on purpose. So every generated CV reported "Missing/non-standard:
  // Experience" about a section that was present, correctly named, and
  // parsing fine.
  //
  // The same fault as the summary clamp: a hand-written list of section
  // names that did not contain the one this code itself standardises
  // on. _EXP_HEAD is the shared pattern the rest of the file already
  // uses for exactly this question, and it covers PROFESSIONAL, WORK
  // and RELEVANT EXPERIENCE, EMPLOYMENT HISTORY and CAREER HISTORY.
  // _EXP_HEAD is tested line by line elsewhere, so it carries no `m`
  // flag; here the whole document is tested at once. Same pattern, one
  // flag added, rather than a second copy that can drift from it.
  const _EXP_HEAD_MULTILINE = new RegExp(_EXP_HEAD.source, 'im');
  const STANDARD_SECTION_HEADERS = [
    _EXP_HEAD_MULTILINE,
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

  /**
   * A PROJECT DESCRIPTION IS ONE LINE.
   *
   * Asked for twice -- "is there a way to make the project better look
   * better and more concist", then "make project more concist" -- and
   * the layout was what got fixed both times: title and tech stack on
   * one line, both links on another. The DESCRIPTION was never touched,
   * and it is the part that costs:
   *
   *   "Streams live financial news and filings through an LLM that
   *    extracts entities and sentiment with inline source citations and
   *    a hallucination-eval harness, surfacing ticker-level signals on a
   *    live dashboard updated within seconds of publication."
   *
   * 240 characters, three rendered lines, one of three projects. Nine
   * lines of a page spent on the descriptions alone, on a CV whose
   * employment history was being cut to two bullets a role to save two.
   *
   * A bullet paragraph is indented 360 twips inside a 10106 twip page
   * and set at 10.5pt, which is 98 characters to the line. So the limit
   * is what fits: one line, cut at a clause boundary so it still reads
   * as a sentence, and never left ending on a conjunction.
   */
  const _PROJECT_LINE_CHARS = 96;
  // What a truncated clause must not end on. The function words are the
  // obvious half; the adverb is the one that bit -- cutting at a word
  // boundary produced "...watches a deployed model for data and concept
  // drift and automatically.", which reads as a typo rather than as a
  // decision. Stripping repeatedly walks back "and automatically" to
  // "concept drift", which is a whole thought.
  const _DANGLING = /\s+(?:and|or|with|through|that|which|for|to|of|in|on|by|using|from|while|plus|including|via|as|at|a|an|the|[a-z]+ly)$/i;

  function _tightenSentence(text, limit) {
    let s = String(text || '').trim();
    if (s.length <= limit) return s;

    // The first sentence, when there is more than one and it fits.
    const firstStop = s.search(/[.!?](?:\s|$)/);
    if (firstStop !== -1 && firstStop + 1 <= limit) return s.slice(0, firstStop + 1);

    // Otherwise the last clause boundary that fits. A comma is where the
    // writer already decided one thought ended.
    const head = s.slice(0, limit + 1);
    let cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '));
    if (cut < limit * 0.5) cut = head.lastIndexOf(' ');   // no clause: last whole word
    if (cut <= 0) return s.slice(0, limit).trim();

    let out = s.slice(0, cut).replace(/[\s,;:]+$/, '');
    // Cutting mid-clause can strand the word that was leading into the
    // next one, which reads as a typo rather than a decision.
    for (let i = 0; i < 3 && _DANGLING.test(out); i++) out = out.replace(_DANGLING, '');
    out = out.replace(/[\s,;:]+$/, '');
    return out ? out + '.' : s.slice(0, limit).trim();
  }

  const _PROJECT_HEAD = /^\s*(SELECTED PROJECTS|PROJECTS)\s*:?\s*$/i;

  function tightenProjectBullets(cvText) {
    const text = String(cvText || '');
    if (!text) return { text, tightened: 0, dropped: 0 };
    const lines = text.split('\n');
    const at = lines.findIndex((l) => _PROJECT_HEAD.test(l));
    if (at === -1) return { text, tightened: 0, dropped: 0 };

    let end = at + 1;
    for (; end < lines.length; end++) {
      if (_ANY_HEAD.test(lines[end]) && !_PROJECT_HEAD.test(lines[end])) break;
    }

    const out = [];
    let tightened = 0, dropped = 0, seenInThisProject = 0;
    for (let i = at + 1; i < end; i++) {
      const raw = lines[i];
      const t = raw.trim();
      const isBullet = /^[-•*]\s*\S/.test(t);

      if (!isBullet) {
        // A title, a tech stack or a links line: the next bullet belongs
        // to a new project only when a non-bullet line separated them.
        if (t) seenInThisProject = 0;
        out.push(raw);
        continue;
      }

      // ONE BULLET PER PROJECT. A second is a paragraph about a side
      // project sitting under four roles of paid work.
      if (seenInThisProject >= 1) { dropped++; continue; }
      seenInThisProject++;

      const body = t.replace(/^[-•*]\s*/, '');
      const tight = _tightenSentence(body, _PROJECT_LINE_CHARS);
      if (tight !== body) tightened++;
      out.push('- ' + tight);
    }

    lines.splice(at + 1, end - (at + 1), ...out);
    return { text: lines.join('\n'), tightened, dropped };
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
    // Newer AI tooling. These arrive lowercase from the JD keyword
    // extractor and were printed that way -- "langgraph, crewai" beside
    // "Python, TypeScript" is the clearest tell on the page that the
    // list was assembled rather than written.
    langgraph: 'LangGraph', langchain: 'LangChain', crewai: 'CrewAI',
    llamaindex: 'LlamaIndex', huggingface: 'Hugging Face', openai: 'OpenAI',
    pinecone: 'Pinecone', weaviate: 'Weaviate', chromadb: 'ChromaDB',
    pgvector: 'pgvector', vllm: 'vLLM', ollama: 'Ollama', bedrock: 'Bedrock',
    sagemaker: 'SageMaker', vertexai: 'Vertex AI', mlflow: 'MLflow',
    kubeflow: 'Kubeflow', dbt: 'dbt', evidently: 'Evidently',
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
  //
  // The second group is JD vocabulary rather than soft skills: market
  // and segment words the keyword extractor pulls out of a posting
  // because they are frequent, and the injector then writes into the
  // skills list because they are "missing keywords". A real CV came out
  // listing "langgraph, crewai, b2b, enterprise" as proficiencies. "B2B"
  // is not a skill anyone can be proficient in, and a recruiter reading
  // it knows immediately that a machine assembled the line -- which is
  // the opposite of what the section is for.
  // Deliberately NOT in this list: saas, fintech, healthtech, edtech,
  // martech, e-commerce, mid-market, smb. Those read oddly as
  // "proficiencies", but recruiters genuinely search them as domain
  // terms and the posting asked for them, so stripping them would cost
  // real keyword score to buy a small amount of tidiness. The ones below
  // are words nobody can be proficient in at all.
  // Narrowed deliberately. An earlier draft also stripped delivery,
  // quality, strategy, business, transformation, stakeholders, customers,
  // clients and users. Those read oddly in a proficiencies list, but a
  // posting can genuinely require "Delivery" or "Quality" as a named
  // competency -- and removing a word the JD asked for costs an exact
  // keyword match to buy a little tidiness, which is the wrong trade for
  // a candidate competing against someone who listed it. What is left is
  // only what nobody can be proficient in: market segments, work
  // arrangements and contract types.
  const NON_TECHNICAL_SKILL = new RegExp('^(' + [
    'b2b', 'b2c', 'enterprise', 'startup', 'scale-up', 'scaleup',
    'fast-paced', 'remote', 'hybrid', 'onsite', 'on-site', 'full-time',
    'part-time', 'contract', 'permanent', 'domain',
    'self-motivated', 'proactive', 'motivated', 'dedicated', 'teams', 'team',
    'accessibility', 'end-to-end', 'communication', 'collaboration', 'teamwork',
    'leadership', 'mentoring', 'mentorship', 'problem solving', 'adaptability',
    'entrepreneurial mindset', 'good judgment', 'good judgement', 'resourcefulness',
    'influence', 'work ethic', 'growth mindset', 'ownership', 'curiosity',
    'thought leadership', 'stakeholder engagement', 'customer advocacy',
    'engineering excellence', 'attention to detail', 'time management',
  ].join('|') + ')$', 'i');

  // A SHAPE, NOT A LIST.
  //
  // The list above is exact-match, so it catches "entrepreneurial
  // mindset" and misses "collaborative mindset". A real CV went out
  // reading "... Windows and macOS Support, collaborative mindset,
  // discipline, customer-centric mentality, Python ..." -- three
  // unfalsifiable claims, in lower case, in the middle of a list of
  // tools. Anything of that shape is the same thing under a different
  // noun, so the shape is what gets matched.
  const _FLUFF_SHAPE = new RegExp('^(?:'
    + '.*\\b(?:mindset|mentality|attitude|ethos|demeanou?r|disposition)$'
    + '|discipline|professionalism|positivity|enthusiasm|passion|drive'
    + '|integrity|reliability|flexibility|patience|empathy|initiative'
    + ')$', 'i');

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
          if (NON_TECHNICAL_SKILL.test(bare) || _FLUFF_SHAPE.test(bare)) { removed++; continue; }
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

  /**
   * THE SKILLS SECTION IS SCANNED, NOT READ.
   *
   * The two skills sections became one, which fixed the parsing, and
   * left a thirty-eight term comma list under a single heading:
   *
   *   Customer Support, Cybersecurity Solutions, Technical
   *   Problem-Solving, Team Collaboration, Training and Mentoring,
   *   Windows and macOS Support, Python, Java, TypeScript, C++, SQL,
   *   Node.js, React, AWS, Azure, Google Cloud Platform, Kubernetes...
   *
   * A recruiter filling a support role has to read all thirty-eight to
   * find out whether the two that matter are there. Labelled groups are
   * read by jumping to the label -- and an ATS is indifferent, because
   * "Programming Languages: Python, Java" carries the same terms with
   * the same comma delimiter it already parses.
   *
   * WHAT THIS WILL NOT DO IS INVENT A TAXONOMY IT DOES NOT HAVE. The
   * groups below are recognised by name. A CV for a nurse, a solicitor
   * or an accountant matches almost none of them, and rather than
   * inventing labels for terms it does not understand, this leaves the
   * list exactly as it found it. Categorising is an improvement only
   * when the categories are right.
   */
  const _SKILL_GROUPS = [
    ['Programming Languages', /^(?:python|java|javascript|typescript|c\+\+|c#|c|go|golang|rust|ruby|php|swift|kotlin|scala|r|sql|t-sql|pl\/sql|bash|shell scripting|shell|powershell|matlab|perl|dart|vba|objective-c|solidity|assembly)$/i],
    ['Frameworks & Libraries', /^(?:react(?:\.js)?|angular|vue(?:\.js)?|next\.js|node(?:\.js)?|express(?:\.js)?|django|flask|fastapi|spring(?: boot)?|\.net|asp\.net|rails|laravel|jquery|graphql|rest apis?|restful apis?|html|html5|css|css3|tailwind|bootstrap|hugging face transformers|streamlit)$/i],
    ['Cloud & DevOps', /^(?:aws|amazon web services|azure|microsoft azure|gcp|google cloud(?: platform)?|kubernetes|k8s|docker|terraform|ansible|helm|jenkins|github actions|gitlab ci|ci\/cd|cloudformation|openshift|linux|unix|prometheus|grafana|datadog|elk stack|observability|monitoring|serverless|aws lambda|git|github|gitlab|cloud security|cloud migration)$/i],
    ['Data & AI', /^(?:machine learning|deep learning|pytorch|tensorflow|keras|scikit-learn|xgboost|nlp|natural language processing|computer vision|llms?|rag|mlops|mlflow|(?:apache )?spark|(?:apache )?airflow|(?:apache )?kafka|snowflake|databricks|dbt|etl|elt|hadoop|pandas|numpy|power bi|tableau|looker|data modell?ing|data warehousing|data engineering|data analysis|data analytics|data pipelines|analytics|statistics|a\/b testing|generative ai|prompt engineering|excel|microsoft excel|google sheets|pivot tables?|vlookup|forecasting|financial modell?ing|budgeting|variance analysis|kpis?|kpi reporting|business intelligence|bi|dashboards?|data visuali[sz]ation|reporting automation)$/i],
    ['Databases', /^(?:postgresql|postgres|mysql|mongodb|redis|oracle|sql server|dynamodb|elasticsearch|bigquery|cassandra|neo4j|sqlite|nosql)$/i],
    ['Security', /^(?:cyber ?security(?: solutions)?|information security|infosec|siem|soc|penetration testing|pen testing|owasp|incident response|vulnerability management|identity and access management|iam|zero trust|encryption|gdpr|iso 27001|soc 2|hipaa compliance|threat detection|security operations)$/i],
    ['Support & Platforms', /^(?:customer support|technical support|it support|end[- ]user support|help ?desk|service desk|troubleshooting|itil|zendesk|jira|confluence|servicenow|salesforce|freshdesk|intercom|sla management|escalation management|windows(?: and macos support| support)?|macos(?: support)?|ios|android|active directory|office 365|microsoft 365|remote desktop|ticketing systems)$/i],
    ['Architecture & Systems', /^(?:distributed systems|microservices|system design|systems design|cloud architecture|solution architecture|software architecture|event[- ]driven architecture|scalability|high availability|disaster recovery|site reliability|sre|api design|networking|infrastructure as code)$/i],
    // Last, and deliberately a shape rather than a list: these are the
    // tailored phrases, and they are the half of the section a recruiter
    // reads first.
    ['Core Competencies', /(?:management|collaboration|mentoring|mentorship|coaching|training|communication|leadership|problem[- ]solving|stakeholder|documentation|process improvement|onboarding|delivery|governance|reporting|facilitation|quality assurance|^agile$|^scrum$|^kanban$|^waterfall$|cost optimisation|cost optimization)/i],
  ];

  const _SKILL_HEAD = /^(?:TECHNICAL SKILLS|TECHNICAL PROFICIENCIES|SKILLS|CORE COMPETENCIES|AREAS OF EXPERTISE)\s*:?\s*$/i;
  const _MAX_SKILL_GROUPS = 6;

  function categoriseSkills(cvText, jobKeywords) {
    const text = String(cvText || '');
    if (!text) return { text, grouped: 0 };
    const lines = text.split('\n');

    const at = lines.findIndex((l) => _SKILL_HEAD.test(l.trim()));
    if (at === -1) return { text, grouped: 0 };

    let end = at + 1;
    const body = [];
    for (; end < lines.length; end++) {
      const t = lines[end].trim();
      if (!t) { if (body.length) break; continue; }
      if (/^[A-Z][A-Z &/]{3,}\s*:?\s*$/.test(t)) break;
      body.push(t);
    }
    if (!body.length) return { text, grouped: 0 };

    // ALREADY DONE. The generator runs this pass again on its way to the
    // file, and a second pass must find nothing to do or the two
    // documents drift apart.
    if (body.some((l) => /^[A-Z][A-Za-z &/]{1,28}:\s*\S/.test(l))) {
      return { text, grouped: 0 };
    }

    let items = body.join(', ').split(/\s*,\s*/)
      .map((s) => s.replace(/^[•\-*]\s*/, '').trim())
      .filter(Boolean);
    if (items.length < 8) return { text, grouped: 0 };   // short list reads fine as it is

    // A TERM ALREADY SPELLED OUT INSIDE ANOTHER IS NOT A SECOND TERM.
    //
    // The live CV listed "Cybersecurity Solutions" and "Cybersecurity",
    // "Windows and macOS Support" and "macOS". Dropping the shorter one
    // loses no keyword at all, because its text is still there, inside
    // the longer one, for any parser matching on substrings.
    const kept = [];
    for (const it of items) {
      const lc = it.toLowerCase();
      const swallowed = items.some((other) => {
        if (other === it) return false;
        const ol = other.toLowerCase();
        return ol.length > lc.length
          && new RegExp('\\b' + lc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(ol);
      });
      if (!swallowed && !kept.some((k) => k.toLowerCase() === lc)) kept.push(it);
    }
    items = kept;

    // A QUALIFIED TERM IS STILL THE SAME TERM.
    //
    // Every pattern in the taxonomy is anchored, which is what stops
    // "Customer Support" being read as a programming language. It also
    // means one adjective is enough to lose a term: "Advanced SQL",
    // "Power BI Dashboards" and "Python (pandas)" match nothing at all
    // and drop into "Additional:", so the two skills a business
    // operations posting actually named ended up on the unlabelled
    // line while the recognised deep learning frameworks kept theirs.
    //
    // The qualifier is stripped for the LOOKUP only. What prints is
    // what the CV said, because "Advanced SQL" is a stronger claim than
    // "SQL" and it is not this function's business to weaken it.
    const _QUAL = new RegExp('^(?:advanced|basic|intermediate|expert|proficient|strong'
      + '|working knowledge of|hands[- ]on|solid)\\s+'
      + '|\\s+(?:dashboards?|reporting|development|programming|scripting|queries'
      + '|querying|administration|fundamentals|essentials)$', 'gi');
    const _bare = (s) => String(s || '').replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(_QUAL, '').replace(/\s{2,}/g, ' ').trim();
    const _labelOf = (it) => {
      for (const [name, re] of _SKILL_GROUPS) if (re.test(it)) return name;
      const bare = _bare(it);
      if (bare && bare !== it) {
        for (const [name, re] of _SKILL_GROUPS) if (re.test(bare)) return name;
      }
      return '';
    };

    const buckets = new Map();
    let classified = 0;
    for (const it of items) {
      const label = _labelOf(it);
      if (!label) continue;
      classified++;
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(it);
    }

    // Not enough of it is understood to label honestly.
    if (buckets.size < 3 || classified < items.length * 0.6) return { text, grouped: 0 };

    // Terms the taxonomy does not recognise go on their own line, which
    // claims nothing about them, rather than under a label that would be
    // wrong.
    const unknown = items.filter((it) => !_labelOf(it));
    if (unknown.length) buckets.set('Additional', unknown);

    // TOO MANY LABELS IS ITS OWN PROBLEM, AND THE FIX IS NOT TO PUT A
    // TERM UNDER THE WRONG ONE.
    //
    // Spilling the overflow into whichever group came last put React and
    // Node.js under "Programming Languages", which is wrong in a way any
    // engineer reading the CV would notice.
    //
    // Two moves instead, in this order, until the section is back inside
    // its line budget: merge two groups that share a real combined name,
    // then move the smallest group's terms down to "Additional". A group
    // holding one term is the first to go -- a whole line to say
    // "Databases: PostgreSQL" is not what the labels are for.
    // WHAT THE POSTING ASKED FOR, MATCHED ON WORDS AND NOT ON LETTERS.
    //
    // The old test was a bare two-way indexOf, which makes a one or two
    // letter skill match almost anything: "R" is inside "reporting",
    // "C" is inside "customer support", "Go" is inside "Django". A CV
    // listing R and C scored a hit against every keyword on the page,
    // so relevance was noise and the ordering fell through to taxonomy
    // order every time. Word boundaries, and only where the term
    // actually starts and ends on a word character, so "C++" and
    // ".NET" still match.
    const _esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const _has = (hay, needle) => {
      if (!hay || !needle) return false;
      if (hay === needle) return true;
      const b = /^[a-z0-9]/i.test(needle) ? '\\b' : '';
      const e = /[a-z0-9]$/i.test(needle) ? '\\b' : '';
      try { return new RegExp(b + _esc(needle) + e, 'i').test(hay); } catch (e2) { return false; }
    };
    const kw = (Array.isArray(jobKeywords) ? jobKeywords : [])
      .map((k) => String(k || '').toLowerCase().trim()).filter((k) => k.length > 1);
    const asked = (s) => {
      const t = String(s || '').toLowerCase();
      return kw.some((k) => _has(t, k) || _has(k, t));
    };
    const relevance = (list) => list.filter(asked).length;

    const rankOfGroup = new Map();
    _SKILL_GROUPS.forEach(([name], i) => rankOfGroup.set(name, i));
    rankOfGroup.set('Additional', _SKILL_GROUPS.length + 1);   // always last

    const PAIRS = [
      ['Frameworks & Libraries', 'Programming Languages', 'Languages & Frameworks'],
      ['Databases', 'Data & AI', 'Data & Databases'],
      ['Security', 'Support & Platforms', 'Support & Security'],
      ['Architecture & Systems', 'Cloud & DevOps', 'Cloud & Architecture'],
    ];
    let guard = 20;
    while (buckets.size > _MAX_SKILL_GROUPS && guard-- > 0) {
      const pair = PAIRS.find(([from, into]) => buckets.has(from) && buckets.has(into));
      if (pair) {
        const [from, into, combined] = pair;
        const merged = buckets.get(into).concat(buckets.get(from));
        rankOfGroup.set(combined, Math.min(rankOfGroup.get(into), rankOfGroup.get(from)));
        buckets.delete(from);
        buckets.delete(into);
        buckets.set(combined, merged);
        continue;
      }
      // THE GROUP THAT LOSES ITS LABEL IS THE ONE THE POSTING DID NOT
      // ASK FOR.
      //
      // This used to demote the smallest group. On a business
      // operations posting that read as: SQL and Power BI, the two
      // things the job actually named, dropped into "Additional:"
      // because their groups were short, while a long list of deep
      // learning frameworks kept a labelled line at the top. The
      // section then opened with PyTorch and Kubernetes on an
      // application for an analyst role, which is the reading the
      // grouping exists to prevent.
      //
      // Least relevant first, smallest as the tie-break. A group
      // carrying something the posting named keeps its label until
      // every group that carries nothing has already gone.
      const demote = [...buckets.keys()]
        .filter((k) => k !== 'Additional' && k !== 'Core Competencies')
        .sort((a, b) => {
          const d = relevance(buckets.get(a)) - relevance(buckets.get(b));
          if (d) return d;
          return buckets.get(a).length - buckets.get(b).length;
        })[0];
      if (!demote) break;
      const spilled = buckets.get(demote);
      buckets.delete(demote);
      buckets.set('Additional', (buckets.get('Additional') || []).concat(spilled));
    }

    // AND INSIDE A LINE, THE ASKED-FOR TERMS COME FIRST.
    //
    // A labelled line is read left to right and abandoned early. Eight
    // terms in, the one the posting named is past the point a scan
    // reaches. Stable, so everything else holds the order it had.
    for (const [label, list] of buckets) {
      if (label === 'Additional' && !kw.length) continue;
      buckets.set(label, list.slice().sort((a, b) => (asked(b) ? 1 : 0) - (asked(a) ? 1 : 0)));
    }

    // Taxonomy order breaks the ties. Size is not a tie-break worth
    // having: it would rank a long list of frameworks above the
    // languages they are written in.
    const taxonomyAt = (label) => {
      const i = rankOfGroup.has(label) ? rankOfGroup.get(label) : -1;
      return i === -1 ? _SKILL_GROUPS.length : i;
    };

    // Core Competencies leads: it is the tailored half and the half a
    // recruiter reads first. The rest follow by how much of each group
    // the posting actually asked for, so a support role does not open
    // its skills section with deep-learning frameworks.
    const order = [...buckets.keys()].sort((a, b) => {
      if (a === 'Core Competencies') return -1;
      if (b === 'Core Competencies') return 1;
      if (a === 'Additional') return 1;
      if (b === 'Additional') return -1;
      const d = relevance(buckets.get(b)) - relevance(buckets.get(a));
      if (d) return d;
      return taxonomyAt(a) - taxonomyAt(b);
    });

    const out = order.map((label) => label + ': ' + buckets.get(label).join(', '));
    lines.splice(at + 1, end - (at + 1), ...out);
    return { text: lines.join('\n'), grouped: out.length };
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
    education = null,
    experience = null,
    // The candidate's ACTUAL location, from their profile. Not the
    // posting's. See ensureTruthfulLocation.
    profileLocation = '',
    // The posting's location, used only to decide whether the relocation
    // note is worth adding. Never printed as the candidate's own.
    jdLocation = '',
    flags = {},
  } = {}) {
    const t0 = Date.now();
    cvText = _cleanCorruption(cvText, 'cv');
    coverLetterText = _cleanCorruption(coverLetterText, 'cover');
    const f = {
      truthfulLocation: flags.truthfulLocation !== false,
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
      // v14: where the posting prints "Long Form (ACRO)", a CV claiming
      // either form carries both.
      acronymPairing: flags.acronymPairing !== false,
      // v13 -- ON by default. This was briefly opt-in on the belief that
      // sorting could demote a current role beneath a concurrent
      // part-time contract. It can, but only when concurrency exists, and
      // the pass is a no-op whenever the order is already correct: it
      // returns the text byte-identical rather than rewriting it. So the
      // switch only ever mattered for CVs that were genuinely out of
      // order, which is exactly the case it should fix. Pass
      // { strictDateOrder: false } to suppress it.
      strictDateOrder: flags.strictDateOrder !== false,
    };

    let outCV = cvText;
    let outCL = coverLetterText;
    const report = { fixes: [], warnings: [], timingMs: 0 };

    // v13: strict reverse-chronological order. Runs before every other
    // pass so the rest of the audit sees the final role order. Changes
    // ORDER only -- never a date value -- and does nothing at all when the
    // roles are already newest-first.
    if (f.strictDateOrder) {
      const sorted = sortExperienceByStartDate(outCV);
      if (sorted.sorted) {
        outCV = sorted.text;
        report.fixes.push('Sorted ' + sorted.roles + ' roles into strict start-date order (no dates changed)');
      }
    }

    // Within each role, lead with the bullets that answer THIS posting.
    // Order only -- no rewriting, no movement between roles.
    //
    // ONLY WHEN THERE IS NO PROFILE TO DEFER TO. The restore below
    // rebuilds each covered role in the order the profile records, so
    // running both means this one shuffles the lines and that one puts
    // them back -- wasted work, and a fix log that contradicts itself.
    // A profile that records the work records the order of it; without
    // one, relevance is the best available answer.
    const _exp = Array.isArray(experience) ? experience : [];
    if (jobKeywords && !_exp.length) {
      const ordered = orderBulletsByRelevance(outCV, jobKeywords);
      if (ordered.moved) {
        outCV = ordered.text;
        report.fixes.push('Re-ordered bullets in ' + ordered.moved
          + ' role(s) so the most relevant lead (no wording changed)');
      }
    }

    // WHAT THE MODEL LEFT OUT, COUNTED BEFORE ANYTHING HERE TRIMS.
    //
    // NO PER-ROLE CAP. The bullets a role gets are the bullets the
    // profile records.
    //
    // There used to be one here, at six for the recent roles and four
    // for the rest, on the reasoning that attention is finite. It is,
    // but that is a judgement about someone else's CV made by code that
    // has never seen the posting they are answering, and it removed work
    // its owner had deliberately written down. Twice now that has been
    // the complaint, in their words: "why did you limit my professional
    // experience roles bullets to 2 each? I never asked for that", and
    // then "remove that limit as it might also be preventing the actual
    // tailor of bullet points".
    //
    // What remains is the ORDERING above -- the bullets that answer this
    // posting lead -- and fitToOnePage, which trims only when trimming
    // actually achieves a page and puts everything back when it does
    // not. A page is a real constraint. Six was an opinion.
    // TWO try BLOCKS, NOT ONE.
    //
    // They shared one, so a throw anywhere in the counting skipped the
    // restore as well -- and the catch was empty, so the whole thing
    // became a silent no-op that looks exactly like the model having
    // returned everything. The restore is the half that changes the
    // document and it does not depend on the count.
    let _dropped = null;
    if (outCV) {
      try { _dropped = reportDroppedBullets(outCV, _exp); } catch (e) {}
    }
    if (outCV) {
      try {
        // Counted first, restored second, so the report says what the
        // tailoring actually did rather than what the page ended up
        // holding. Then the CV carries the whole history regardless,
        // which is the point: the prompt lives in an edge function
        // deployed separately, so a fix made only there does not reach
        // a single generated document until that deploy happens.
        const back = restoreDroppedBullets(outCV, _exp);
        if (back.restored || back.reordered) {
          outCV = back.text;
          const parts = [];
          if (back.restored) parts.push('restored ' + back.restored + ' bullet(s) the tailoring dropped');
          if (back.reordered) parts.push('put ' + back.reordered + ' role(s) back into your profile\'s order');
          report.fixes.push('Work experience: ' + parts.join(' and ')
            + ', keeping the tailored rewrite wherever one came back.');
        }
        if (_dropped) {
          _dropped.restored = back.restored;
          if (back.restored >= _dropped.count) _dropped.kind = 'profile-bullets-restored';
          report.warnings.push(_dropped);
        }
        // A SILENT NO-OP IS THE ONE OUTCOME NOBODY CAN DEBUG.
        //
        // If the profile carried roles and not one of them could be
        // matched to a role on the page, the pass did nothing and the
        // document looks untouched -- indistinguishable from the model
        // having returned everything. Say so, with what it was looking
        // for and what it found, because every version of this bug so
        // far has been a field arriving under a name nobody expected.
        if (_exp.length && !back.matchedRoles) {
          report.warnings.push({
            kind: 'profile-experience-unmatched',
            profileRoles: _exp.length,
            cvRoles: back.cvRoles,
            note: 'Your profile records ' + _exp.length + ' role(s) and none of them could be '
              + 'matched to a role on the generated CV, so no bullet was restored and the '
              + 'order is the tailoring\'s rather than yours. Either the company names '
              + 'disagree, or the profile is not sending its bullets. Companies on the CV: '
              + (back.cvCompanies || []).join(', ') + '. Companies in the profile: '
              + _exp.map((e) => String((e && (e.company || e.employer || e.name)) || '?'))
                .join(', ') + '.',
          });
        } else if (_exp.length && back.matchedRoles && !back.profileBulletsSeen) {
          report.warnings.push({
            kind: 'profile-experience-has-no-bullets',
            profileRoles: _exp.length,
            note: 'The roles matched, but not one of them carried any bullet text, so there '
              + 'was nothing to restore. The profile is sending companies and titles '
              + 'without the work underneath them -- check which field the bullets save '
              + 'under and whether it is in the payload the extension reads.',
          });
        }
      } catch (e) {
        report.warnings.push({ kind: 'profile-bullets-restore-failed', note: String(e && e.message || e) });
      }
    }

    // Company and title on separate lines. Runs early: the role-shape
    // passes below all assume company, then title, then date, and a
    // merged line silently defeats every one of them.
    if (outCV) {
      try {
        const sp = splitCompanyAndTitle(outCV);
        if (sp.split) {
          outCV = sp.text;
          report.fixes.push('Split ' + sp.split + ' merged company/title line(s) '
            + '(a combined "Meta, Software Engineer" line fills Workday\'s required '
            + 'Company field with nothing and puts the same string in both fields)');
        }
      } catch (e) {}
    }

    // Where each role happened, onto the company line. After the split
    // above, so a company line is a company line.
    // Runs whenever there is a CV, not only when the profile carries
    // locations: half its job is re-delimiting a company line that
    // already swallowed its location, and that damage exists with or
    // without profile data.
    if (outCV) {
      try {
        const roles = Array.isArray(experience) ? experience : [];
        const rl = attachRoleLocations(outCV, roles);
        if (rl.attached) {
          outCV = rl.text;
          report.fixes.push('Added the location to ' + rl.attached + ' role(s), '
            + 'right-aligned on the company line (Workday and others map a '
            + 'per-role Location field, and this costs no extra lines)');
        }
        // A LOCATION THAT NEVER ARRIVES LOOKS EXACTLY LIKE ONE THAT WAS
        // NEVER ASKED FOR.
        //
        // Nothing here can invent a city, so a profile with no location
        // on a role simply produces a CV without one -- and the only
        // symptom is an absence, which is invisible until an employer's
        // form asks for it and it has to be typed by hand again. Say
        // which roles, by name.
        //
        // BUT THE VERDICT IS READ OFF THE PAGE, NOT OFF THE PROFILE.
        // This fired "4 role(s) have no location" on a profile whose
        // roles all HAD one -- the tailored text already carried each
        // city, the attach above had nothing to do, and the profile
        // object reaching this code was shaped differently from the
        // table row it came from. The claim in the note is that the CV
        // GOES OUT without a location; the CV is right here, so check
        // the CV. Only a role whose block on the finished page carries
        // no location is worth a warning.
        const _cvLines = outCV.split('\n');
        const _pageCarriesLocation = (companyName) => {
          const key = _eduNorm(companyName);
          if (key.length < 2) return false;
          let inExp = false;
          for (let i = 0; i < _cvLines.length; i++) {
            if (_EXP_HEAD.test(_cvLines[i])) { inExp = true; continue; }
            if (_ANY_HEAD.test(_cvLines[i])) { inExp = false; continue; }
            if (!inExp) continue;
            const l = _cvLines[i].trim();
            if (!l || /^\s*[-•*]/.test(l)) continue;
            const norm = _eduNorm(l.split('\t')[0]);
            if (!norm || (norm.indexOf(key) === -1 && key.indexOf(norm) === -1)) continue;
            // Company \t City, Country -- the attach above, or the
            // generator, already put it on the company line.
            if (l.indexOf('\t') !== -1) return true;
            // Company / City, Country / Title -- the tailored text's own
            // layout, a location line between company and title. A date
            // line is not a location, and neither is a bullet. The
            // re-delimiting pass above may already have turned the comma
            // into a tab; fold it back before judging the shape.
            const next = (_cvLines[i + 1] || '').trim().replace(/\t+/g, ', ');
            return /^[A-Za-z][^,\t]*,\s*[A-Za-z][^\t]*$/.test(next)
              && !ROLE_DATE_RE.test(next) && !/\b(?:19|20)\d{2}\b/.test(next)
              && !/^\s*[-•*]/.test(next);
          }
          return false;
        };
        const placeless = roles
          .filter((r) => r && (r.company || r.employer || r.name))
          .filter((r) => !_roleLocationOf(r))
          .map((r) => String(r.company || r.employer || r.name).trim())
          .filter((name) => name && !_pageCarriesLocation(name));
        if (placeless.length) {
          report.warnings.push({
            kind: 'roles-without-location',
            count: placeless.length,
            samples: placeless.slice(0, 4),
            note: placeless.length + ' role(s) in your profile have no location, so the CV '
              + 'goes out without one: ' + placeless.slice(0, 4).join(', ')
              + '. Workday and Greenhouse both map a Location field on every '
              + 'work-experience block, and an empty one gets typed by hand on '
              + 'every application. Add it as "City, Country" in your profile.',
          });
        }
      } catch (e) {}
    }

    // The headline under the name. Runs AFTER the company/title split, so
    // the real most-recent title is readable as its own line.
    if (outCV) {
      try {
        const hl = ensureHeadline(outCV, jdTitle);
        if (hl.added) {
          outCV = hl.text;
          report.fixes.push('Added the role headline under your name ("' + hl.headline
            + '") -- the first line a recruiter\'s eye lands on, and only ever a '
            + 'title your history actually contains');
        } else if (hl.replaced) {
          outCV = hl.text;
          report.fixes.push('Replaced the headline under your name: "' + hl.was
            + '" is a title your history does not contain, so it now reads "'
            + hl.headline + '". Every resume parser stores the line under the name '
            + 'as the job you hold NOW, so the posting\'s title there contradicts '
            + 'the employment block directly underneath it.');
          report.warnings.push({
            kind: 'headline-claimed-an-unheld-title',
            was: hl.was,
            now: hl.headline,
            note: 'The tailoring wrote "' + hl.was + '" under your name. Your '
              + 'employment history does not contain it, and a parser reads that '
              + 'line as your current job title -- so the stored record said you '
              + 'hold a role you have never held, above a history that says '
              + 'otherwise. Corrected on this CV. The prompt rule that writes it '
              + '(TARGET TITLE LINE) still needs changing at the source.',
          });
        }
      } catch (e) {}
    }

    // The header states where the candidate lives, not where the job is.
    // Runs beside the headline fix because it is the same fault on the
    // next line down: a field a parser reads as fact, filled with the
    // posting's value instead of the candidate's.
    // ONE FLAG TURNS IT OFF: flags.truthfulLocation === false.
    //
    // Asked to leave the header alone "if it is not causing serious
    // issue". My reading is that it is, and the reason is not taste: a
    // residence is a FACT a form asks about separately, so the page
    // asserting Sao Paulo while the phone number says +353 is not
    // aggressive targeting, it is an application that contradicts
    // itself in one line. It also makes every work-authorisation answer
    // on the same form refer to the wrong country. So this defaults on,
    // and it is one flag to disable rather than a code change.
    if (outCV && profileLocation && f.truthfulLocation) {
      try {
        const loc = ensureTruthfulLocation(outCV, profileLocation, jdLocation);
        if (loc.changed) {
          outCV = loc.text;
          report.fixes.push('Header location corrected from "' + loc.was + '" to "'
            + loc.now + '" -- it is read as where you live, and it sat beside '
            + 'your own phone number saying otherwise.');
          report.warnings.push({
            kind: 'header-claimed-the-jobs-location',
            was: loc.was,
            now: loc.now,
            note: 'The CV header said "' + loc.was + '", which is the posting\'s '
              + 'location rather than yours. It matches what a recruiter filters '
              + 'on by asserting something untrue, on the same line as a phone '
              + 'number from another country, and it makes every work '
              + 'authorisation answer on the form refer to the wrong place.',
          });
        }
      } catch (e) {}
    }

    // A pivot must not open by borrowing the posting's title. Runs before
    // the audits below so everything downstream sees the corrected text.
    if (outCV && jdTitle) {
      const pivot = rewritePivotSummary(outCV, jdTitle);
      if (pivot.changed) {
        outCV = pivot.text;
        report.fixes.push('Summary no longer claims a title the employment history '
          + 'does not contain (a pivot is argued with real overlap, not a borrowed title)');
      }
    }

    // The other half of the same sentence. Runs whether or not a title
    // was borrowed, because "5+ years in X" is just as unsupported under
    // an honest title, and is checked against the record of what the
    // candidate did rather than against the skills list, which restates
    // the claim instead of evidencing it.
    if (outCV) {
      const domain = stripUnsupportedDomainClaim(outCV);
      if (domain.changed) {
        outCV = domain.text;
        report.fixes.push('Summary no longer claims years in a field the CV never shows '
          + '(a parser scores that at 100%; the first human screener stops reading)');
      }
    }

    // Percentages out. Runs before the wording audits so they see the
    // final sentence rather than one with a figure about to be removed.
    if (outCV) {
      const pct = stripPercentages(outCV);
      if (pct.removed) {
        outCV = pct.text;
        report.fixes.push('Removed percentage claims from ' + pct.removed
          + ' line(s); counts, durations and volumes were left untouched');
      }
    }
    if (outCL) {
      const pctCL = stripPercentages(outCL);
      if (pctCL.removed) outCL = pctCL.text;
    }

    // The company field is the company's name.
    if (outCV) {
      const co = cleanCompanyLine(outCV);
      outCV = co.text;
      if (co.cleaned) {
        report.fixes.push('Took the parenthetical off ' + co.cleaned + ' company name(s) so the '
          + 'employer field matches the company a recruiter searches for');
      }
    }

    // Employment type out of the job title and into the description.
    if (outCV) {
      const emp = moveEmploymentType(outCV);
      outCV = emp.text;
      if (emp.moved) {
        report.fixes.push('Moved the employment type out of ' + emp.moved
          + ' job title(s) and into the role description, so the title field '
          + 'a recruiter searches on is the title alone');
      }
    }

    // And the same information when the profile carries it in its own
    // field rather than welded to the title. Runs second, so a role that
    // still arrives with "(Contract)" in the title is handled by the
    // pass above and not stated twice.
    if (outCV) {
      const et = attachEmploymentTypes(outCV, Array.isArray(experience) ? experience : []);
      if (et.attached) {
        outCV = et.text;
        report.fixes.push('Stated the employment type on ' + et.attached
          + ' role(s) from your profile, in the description rather than the '
          + 'title field, so a contract or part-time role is not read as permanent');
      }
    }

    // A standard bolted onto the end of an unrelated bullet.
    if (outCV) {
      const bolt = stripBoltedStandards(outCV);
      outCV = bolt.text;
      if (bolt.removed) {
        report.fixes.push('Removed ' + bolt.removed + ' standard(s) bolted onto the end of '
          + 'a bullet that was not about them');
      }
      if (bolt.recased) {
        report.fixes.push('Corrected the casing of ' + bolt.recased + ' standard(s)');
      }
    }
    if (outCL) outCL = stripBoltedStandards(outCL).text;

    // A word used twice in one bullet. Reported, never rewritten -- the
    // correct fix needs a fact about the employer that this code does not
    // have, and inventing one is worse than the repetition.
    if (outCV) {
      const repeats = detectRepeatedWords(outCV);
      if (repeats.length) {
        report.warnings.push({
          kind: 'repeated-word-in-bullet',
          count: repeats.length,
          samples: repeats.slice(0, 3),
          message: 'A word appears twice in the same bullet (e.g. "'
            + repeats[0].word + '"). Reads as an unedited draft to a human; '
            + 'invisible to an ATS. Left as-is because rewording it needs '
            + 'facts about the role that only you have.',
        });
      }
    }

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

    // One line per project, whichever route the section arrived by --
    // injected from the profile above, or written by the model.
    if (outCV) {
      try {
        const tp = tightenProjectBullets(outCV);
        if (tp.tightened || tp.dropped) {
          outCV = tp.text;
          const parts = [];
          if (tp.tightened) parts.push('shortened ' + tp.tightened + ' description(s) to one line');
          if (tp.dropped) parts.push('kept one bullet each, dropping ' + tp.dropped);
          report.fixes.push('Projects made concise: ' + parts.join('; ')
            + ' -- three descriptions at three lines each is nine lines of a page '
            + 'spent on side projects');
        }
      } catch (e) {}
    }

    // Education dates back from the structured profile. Workday and the
    // rest of the enterprise tier have required From/To year fields on
    // the education block, and the tailored text reliably drops them.
    if (outCV && Array.isArray(education) && education.length) {
      try {
        const r = restoreEducationDates(outCV, education);
        if (r.added) {
          outCV = r.text;
          report.fixes.push('education: graduation date restored on ' + r.added
            + ' entr' + (r.added === 1 ? 'y' : 'ies')
            + ' (enterprise ATS education blocks require From/To years)');
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

    // After the mirror, which deliberately leaves one form standing:
    // where the posting itself prints both forms ("Anti-Money
    // Laundering (AML)"), a CV that claims either carries both, so a
    // search for either finds it.
    if (f.acronymPairing && jdText && outCV) {
      try {
        const p = pairJdAcronyms(outCV, jdText);
        if (p.paired.length) {
          outCV = p.text;
          report.fixes.push('Paired ' + p.paired.length + ' acronym(s) with the full term the '
            + 'posting itself uses (' + p.paired.slice(0, 3).join(', ')
            + ') so both the ATS dictionary and a human search match');
        }
      } catch (e) {}
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

    // The four gaps found by reading what Enhancv, Resume Worded,
    // Jobscan and Rezi score. Warnings only: every one of them needs a
    // judgement about the work that this code does not have, and a
    // rewrite it guessed at would be worse than the sentence it
    // replaced.
    if (outCV) {
      try {
        const tn = tenseAudit(outCV);
        if (tn.violations.length) {
          report.warnings.push({
            kind: 'tense-mismatch',
            count: tn.violations.length,
            samples: tn.violations.slice(0, 3),
            note: 'A role that has ended is described in the present tense. '
              + tn.violations.map((v) => '"' + v.verb + '"').slice(0, 3).join(', ')
              + ' should be past tense. It is the most common thing a reader '
              + 'notices and the writer does not.',
          });
        }
      } catch (e) {}

      try {
        const pr = pronounAudit(outCV);
        if (pr.violations.length) {
          report.warnings.push({
            kind: 'pronouns-in-bullets',
            count: pr.violations.length,
            samples: pr.violations.slice(0, 3),
            note: 'A CV is written in the implied first person, so "I", "we" and '
              + '"my" never need to be there. Every scoring tool marks them down '
              + 'and they read as a first draft.',
          });
        }
      } catch (e) {}

      try {
        const pv = passiveVoiceAudit(outCV);
        if (pv.violations.length) {
          report.warnings.push({
            kind: 'passive-or-duty-language',
            count: pv.violations.length,
            samples: pv.violations.slice(0, 3),
            note: '"Was responsible for the migration" and "Migrated 47 services" '
              + 'describe the same work, and only one says you did it. Passive '
              + 'voice hides agency, which is the only thing a bullet exists to '
              + 'establish.',
          });
        }
      } catch (e) {}

      try {
        const sc = scopeAudit(outCV);
        // Only worth saying on a CV with enough bullets for the absence
        // to mean something.
        if (sc.bullets >= 6 && sc.withScope === 0) {
          report.warnings.push({
            kind: 'no-scope-signals',
            count: sc.bullets,
            note: 'Not one bullet carries a number for scale: team size, budget, '
              + 'headcount, how many systems or stakeholders. That is the '
              + 'difference between "led the migration" and "led the migration of '
              + '47 services for a GBP 2.6bn portfolio", and on a senior '
              + 'application it is usually a profile with the numbers left out '
              + 'rather than a career without them.',
          });
        }
      } catch (e) {}
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

    // v3: summary clamp (auto-fix: two rendered lines max + strip
    // "looking to..." sentences)
    if (f.summaryClamp && outCV) {
      try {
        const c = clampSummary(outCV, { maxChars: 220 });
        if (c.clamped || c.removedSentences > 0) {
          outCV = c.text;
          const parts = [];
          if (c.removedSentences > 0) parts.push(`${c.removedSentences} "looking-to" sentence(s) stripped`);
          if (c.clamped) parts.push('summary tightened to two lines (recruiters read two on the way to the experience; they skip five)');
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
              `${y.evidenced}. Corrected to ${y.evidenced}. A recruiter checks this by subtracting your earliest date.`,
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

    // WHAT IS PREVIEWED IS WHAT IS SENT.
    //
    // Section order, the canonical headings and the merge of the two
    // skills sections are all decided inside the DOCX generator, on the
    // way to the file. So the panel showed the model's raw output --
    // EDUCATION wherever it happened to land, CORE COMPETENCIES and
    // TECHNICAL SKILLS as two separate blocks -- while the attachment
    // went out reordered, renamed and merged. Two documents, one of them
    // invisible until it reached an employer.
    //
    // Calling the generator's own pass here, rather than reimplementing
    // it, is the same decision as measuring the page with measureCv:
    // there is one definition of the finished shape and both paths use
    // it. It is idempotent, so the generator running it again on the way
    // to the file changes nothing.
    if (outCV) {
      try {
        const DG = (typeof window !== 'undefined' && window.DocxGenerator)
          || (typeof global !== 'undefined' && global.DocxGenerator);
        if (DG && typeof DG.normalizeSections === 'function') {
          const before = outCV;
          const normalised = DG.normalizeSections(outCV);
          if (normalised && normalised !== before) {
            outCV = normalised;
            report.fixes.push('Sections normalised for the preview: standard headings, '
              + 'education last, one skills section');
          }
        }
      } catch (e) {}
    }

    // Labelled groups, once the two skills sections are one section.
    // Runs after the merge above and before the page is measured, since
    // it changes how many lines the section takes.
    if (outCV) {
      try {
        const grp = categoriseSkills(outCV, jobKeywords);
        if (grp.grouped) {
          outCV = grp.text;
          report.fixes.push('Grouped the skills section under ' + grp.grouped
            + ' labels (Programming Languages, Core Competencies and so on) so a '
            + 'recruiter scanning it can jump to the group the posting asked for');
        }
      } catch (e) {}
    }

    // ONE PAGE, LAST.
    //
    // Runs after every other pass, because every one of them changes the
    // length: projects are injected, education gains a date line, a
    // summary sentence comes out. Measuring before all that would fit the
    // wrong document.
    //
    // The generator squeezes spacing and the type scale first; this only
    // bites when four roles of real bullets will not fit at any readable
    // size, and it never takes a role below two bullets, never touches
    // the sole mention of a posting keyword, and stops the moment it
    // fits.
    if (outCV) {
      try {
        const fitted = fitToOnePage(outCV, jobKeywords);
        if (fitted.fits && (fitted.trimmed || fitted.projectsDropped || fitted.flattened)) {
          outCV = fitted.text;
          const spent = [];
          if (fitted.flattened) spent.push('grouped the skills back into one line');
          if (fitted.projectsDropped) spent.push('dropped ' + fitted.projectsDropped + ' project(s)');
          if (fitted.trimmed) {
            spent.push('dropped ' + fitted.trimmed + ' least-relevant bullet(s), levelled '
              + 'across the longest roles (never below two per role, never the sole '
              + 'mention of a keyword)');
          }
          report.fixes.push('Fitted to one page: ' + spent.join('; '));
        }
        report.onePage = fitted.fits;
        // NOTHING WAS CUT, BECAUSE CUTTING WOULD NOT HAVE WORKED.
        //
        // Say so, and say what would. A CV 40% over a page cannot be
        // rescued by trimming bullets, and silently gutting the
        // employment history to arrive at 1.3 pages is the worst of both.
        if (fitted.reverted) {
          report.warnings.push({
            kind: 'two-pages',
            note: 'This CV runs to two pages and trimming bullets would not have '
              + 'changed that, so nothing was cut -- the roles are intact. To reach '
              + 'one page the content itself has to come down: shorten the project '
              + 'descriptions to a single line each, keep your four strongest '
              + 'certifications, and cut the summary to two sentences. Two pages '
              + 'with whole roles beats one and a bit with hollow ones.',
          });
        }
      } catch (e) {}
    }

    // The AI-tell reading, on the FINAL text, so the caller can drive a
    // rewrite from it rather than guessing. Reported, never acted on
    // here: the fix for a machine rhythm is a model writing differently,
    // not a regex operating on someone's CV.
    try {
      const CQ = (typeof window !== 'undefined' && window.ContentQualityEngine)
        || (typeof global !== 'undefined' && global.ContentQualityEngine);
      if (CQ && typeof CQ.scoreAiTells === 'function') {
        const prose = [outCV, outCL].filter(Boolean).join('\n');
        const r = CQ.scoreAiTells(prose);
        report.aiTells = {
          score: r.score,
          tells: r.tells,
          instruction: (typeof CQ.aiTellsInstruction === 'function')
            ? CQ.aiTellsInstruction(prose) : '',
          note: r.note,
        };
      }
    } catch (e) {}

    report.timingMs = Date.now() - t0;
    return { cvText: outCV, coverLetterText: outCL, report };
  }

  const RecruiterAudit = {
    runRecruiterAudit,
    // Exported so the boundary between a bolted-on standard and a real
    // mention can be asserted directly.
    stripBoltedStandards, cleanCompanyLine,
    purgeBuzzwords,
    quantificationAudit,
    mirrorJdVocabulary,
    pairJdAcronyms,
    echoJobTitle, normaliseJobTitle, sortExperienceByStartDate,
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
