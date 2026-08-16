/**
 * Job Genie - JD SKILL EXTRACTOR
 * ===================================================================
 * WHY THIS EXISTS
 * -------------------------------------------------------------------
 * universal-keyword-strategy.js finds skills by intersecting the JD with
 * closed lists: ROI_CLASSIFICATION.HIGH/MEDIUM/LOW and HARD_SKILLS. Those
 * lists are software-engineering vocabulary (332 terms opening python,
 * java, javascript). Measured against one real mechanical and industrial
 * engineering posting, 14 of its 17 hard skills were absent from them:
 * SolidWorks, AutoCAD, ISO 9001, lean manufacturing, CAD/CAM software,
 * time studies, process flow, quality control, quality standards,
 * technical reports, process design, mechanical engineering, industrial
 * engineering, manufacturing engineering.
 *
 * The one open path, `unclassified`, cannot recover them either. It
 * splits the JD on whitespace, so it is SINGLE WORDS ONLY: every
 * multi-word skill above is structurally impossible to extract. What it
 * does return is the top 15 words by raw frequency, which on any posting
 * is generic filler.
 *
 * An extension that cannot SEE a skill cannot place it, so this is
 * upstream of every complaint about hard and soft skills missing from the
 * tailored CV.
 *
 * THE APPROACH
 * -------------------------------------------------------------------
 * Soft skills are a genuinely BOUNDED vocabulary. Every industry draws on
 * the same few dozen: communication, analytical, detail-oriented. A list
 * is the right tool and it is used here.
 *
 * Hard skills are UNBOUNDED. Every industry has its own tools, standards
 * and methods, and no list is ever finished; that is precisely how the
 * current one came to be all software. So hard skills are not listed.
 * What IS listed is roughly 150 skill HEAD NOUNS, the words that end a
 * skill phrase in any industry: analysis, control, engineering, design,
 * standards, studies, assurance, documentation. "Root cause analysis",
 * "quality control", "lean manufacturing" and "time studies" are all
 * caught by their last word, whatever industry they come from. Head nouns
 * are shared across industries in a way that skills are not, so a short
 * list of them generalises where a long list of skills does not.
 *
 * Three further signals need no list at all:
 *   an internal capital  ->  SolidWorks, AutoCAD, MATLAB
 *   letters then digits   ->  ISO 9001, AS9100, IPC-A-610
 *   a stated cue          ->  "experience with X", "proficiency in X"
 *
 * NOTHING HERE INVENTS A SKILL. It reads what the posting asked for. What
 * the CV may then claim is decided elsewhere, against the candidate's own
 * history.
 */
(function (global) {
  'use strict';

  // ===================================================================
  // SOFT SKILLS: a closed list, legitimately.
  // Stored in canonical form. Matching is morphological, so "communication"
  // also answers "communication skills" and "detail oriented" answers
  // "detail-oriented" -- the reason the previous list missed terms it
  // actually contained.
  // ===================================================================
  const SOFT_SKILLS = [
    'communication', 'written communication', 'verbal communication',
    'interpersonal', 'presentation', 'public speaking', 'active listening',
    'negotiation', 'influencing', 'storytelling',
    'leadership', 'mentoring', 'coaching', 'team management', 'people management',
    'delegation', 'stakeholder management', 'collaboration', 'teamwork',
    'cross-functional', 'relationship building',
    'analytical', 'critical thinking', 'problem solving', 'troubleshooting',
    'decision making', 'judgement', 'attention to detail', 'detail-oriented',
    'accuracy', 'consistent', 'consistency', 'thorough', 'methodical',
    'organisation', 'organisational', 'time management', 'prioritisation',
    'multitasking', 'planning', 'self-motivated', 'proactive', 'initiative',
    'independent', 'autonomous', 'reliable', 'dependable', 'accountable',
    'adaptable', 'flexible', 'resilient', 'work under pressure',
    'fast-paced', 'continuous improvement mindset', 'willingness to learn',
    'follow instructions', 'following procedures', 'process changes',
    'customer service', 'customer focus', 'empathy', 'patience',
    'conflict resolution', 'creativity', 'innovation', 'curiosity',
    'work ethic', 'integrity', 'professionalism', 'punctual', 'punctuality',
    'written', 'verbal', 'documentation skills', 'reporting skills',
  ];

  // ===================================================================
  // SKILL HEAD NOUNS: the last word of a skill phrase, in any industry.
  // This is what replaces a list of skills. It is short because head
  // nouns are shared: "analysis" ends root cause analysis, gap analysis,
  // financial analysis and blood analysis alike.
  // ===================================================================
  const HEADS = new Set([
    'analysis', 'analyses', 'analytics', 'assessment', 'assessments',
    'assurance', 'audit', 'audits', 'auditing', 'automation',
    'accounting', 'administration', 'architecture', 'assembly',
    'benchmarking', 'bookkeeping', 'budgeting', 'calibration', 'care',
    'coding', 'compliance', 'configuration', 'construction', 'control',
    'controls', 'costing', 'counselling', 'databases', 'design',
    'development', 'diagnostics', 'dispensing', 'documentation', 'drafting',
    'drawings', 'engineering', 'estimating', 'evaluation', 'fabrication',
    'finishing', 'flow', 'forecasting', 'governance', 'grinding',
    'handling', 'imaging', 'implementation', 'improvement', 'inspection',
    'installation', 'instrumentation', 'integration', 'inventory',
    'layout', 'licensing', 'logistics', 'machining', 'maintenance',
    'management', 'manufacturing', 'mapping', 'marketing', 'measurement',
    'methodologies', 'methods', 'metrology', 'migration', 'modelling',
    'modeling', 'monitoring', 'negotiation', 'onboarding', 'operations',
    'optimisation', 'optimization', 'packaging', 'payroll', 'planning',
    'practices', 'preparation', 'prevention', 'pricing', 'procedures',
    'processing', 'procurement', 'programming', 'protocols', 'prototyping',
    'provisioning', 'purchasing', 'qualification', 'reconciliation',
    'recruitment', 'reporting', 'reports', 'research', 'resolution',
    'review', 'reviews', 'safety', 'sampling', 'scheduling', 'sourcing',
    'specifications', 'standards', 'sterilisation', 'strategy', 'studies',
    'study', 'support', 'surveying', 'systems', 'techniques', 'testing',
    'tooling', 'training', 'troubleshooting', 'underwriting', 'validation',
    'verification', 'welding', 'workflow', 'writing',
    'software', 'hardware', 'tools', 'equipment', 'machinery', 'instruments',
  ]);

  // Words that must never open or close a candidate. A phrase hanging off
  // one of these is a fragment of a sentence, not the name of a skill.
  const EDGE_STOP = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
    'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'this', 'that', 'these', 'those', 'it', 'you',
    'your', 'we', 'our', 'they', 'their', 'will', 'would', 'can', 'could',
    'should', 'may', 'might', 'must', 'all', 'any', 'both', 'each', 'other',
    'such', 'own', 'same', 'than', 'then', 'more', 'most', 'some', 'very',
    'across', 'through', 'including', 'include', 'includes', 'using', 'use',
    'strong', 'excellent', 'good', 'great', 'proven', 'demonstrated', 'solid',
    'relevant', 'related', 'similar', 'comparable', 'ability', 'able',
    'experience', 'years', 'year', 'knowledge', 'understanding', 'familiar',
    'familiarity', 'proficiency', 'proficient', 'expertise', 'skills', 'skill',
    'work', 'working', 'role', 'position', 'job', 'team', 'company', 'business',
    'new', 'existing', 'multiple', 'various', 'well', 'high', 'highly',
    'plus', 'essential', 'desirable', 'preferred', 'required', 'requirements',
    'e', 'g', 'i', 'etc', 'such', 'via', 'per',
    // A candidate from ANY path must not open with one of these. The
    // backward walk stops at them, but the cue path does not walk: it
    // splits "Familiarity with WMS software, ideally SAP EWM" on the
    // comma and took "ideally SAP EWM" whole.
    'ideally', 'preferably', 'complete', 'accurate', 'accurately',
    'safely', 'ensuring', 'administer', 'escalate', 'liaise',
    // Counting words open a quantity, not a skill: "across two assembly
    // lines" was arriving as the skill "two assembly".
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'several', 'many', 'few', 'numerous', 'multiple',
  ]);

  // Where a noun phrase STARTS.
  //
  // A skill phrase in English extends leftward from its head noun:
  // analysis <- cause analysis <- root cause analysis. Walking back has
  // to stop at the word that is not part of the name, or the phrase
  // collects the verb in front of it and "time studies" arrives as
  // "carry out time studies". These are the words that end the walk:
  // the verbs a posting uses to introduce a duty, prepositions, articles,
  // and the vague adjectives that pad a requirement.
  const BOUNDARY = new Set([
    'lead', 'leads', 'leading', 'carry', 'carries', 'carrying', 'out',
    'support', 'supports', 'supporting', 'ensure', 'ensures', 'ensuring',
    'produce', 'produces', 'producing', 'revise', 'revises', 'revising',
    'drive', 'drives', 'driving', 'own', 'owns', 'owning', 'contribute',
    'contributes', 'contributing', 'maintain', 'maintains', 'maintaining',
    'develop', 'develops', 'developing', 'create', 'creates', 'creating',
    'build', 'builds', 'building', 'manage', 'manages', 'managing',
    'perform', 'performs', 'performing', 'conduct', 'conducts', 'conducting',
    'execute', 'executes', 'executing', 'deliver', 'delivers', 'delivering',
    'provide', 'provides', 'providing', 'present', 'presents', 'presenting',
    'prepare', 'prepares', 'preparing', 'establish', 'establishes',
    'identify', 'identifies', 'identifying', 'implement', 'implements',
    'implementing', 'join', 'joins', 'joining', 'apply', 'applies',
    'assist', 'assists', 'assisting', 'help', 'helps', 'helping',
    'oversee', 'oversees', 'overseeing', 'coordinate', 'coordinates',
    'monitor', 'monitors', 'track', 'tracks', 'handle', 'handles',
    'run', 'runs', 'running', 'operate', 'operates', 'operating',
    'adherence', 'compliance', 'approach', 'degree', 'discipline',
    'defined', 'given', 'applicable', 'appropriate', 'suitable',
    'key', 'core', 'critical', 'daily', 'overall', 'general',
    // Found by running this over nursing, finance and warehouse
    // postings, none of which it was built against. "ideally SAP EWM"
    // and "complete clinical documentation" are an adverb and a verb
    // that the walk should never have crossed.
    'ideally', 'preferably', 'complete', 'completes', 'completing',
    'accurate', 'accurately', 'administer', 'administers', 'escalate',
    'liaise', 'local', 'direct', 'safely', 'ensuring',
  ]);

  // Heads that read as a skill standing alone. Every other head needs a
  // modifier: bare "systems" or "reports" names nothing, but bare
  // "documentation" and "welding" are skills a CV genuinely lists.
  const STANDALONE_OK = new Set([
    'documentation', 'machining', 'welding', 'drafting', 'prototyping',
    'troubleshooting', 'forecasting', 'budgeting', 'purchasing', 'procurement',
    'scheduling', 'bookkeeping', 'payroll', 'metrology', 'surveying',
    'automation', 'calibration', 'fabrication', 'underwriting', 'recruitment',
    'analytics', 'logistics', 'sourcing', 'programming', 'estimating',
  ]);

  // Phrases that look skill-shaped but name the workplace, not a skill.
  const NOT_A_SKILL = new Set([
    'production environment', 'work environment', 'fast paced environment',
    'team environment', 'our team', 'the team', 'the role', 'the business',
    'the company', 'our company', 'related discipline', 'related field',
    'degree', 'bachelors degree', 'masters degree',
  ]);

  const _lower = (s) => String(s || '').toLowerCase();
  // Hyphens become spaces so "detail-oriented" and "detail oriented" are
  // one term. Slashes are KEPT: CAD/CAM is a name, not two words.
  const _norm = (s) => _lower(s)
    .replace(/[‐-―]/g, '-')
    .replace(/[^a-z0-9/+#.\- ]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  /** Does the phrase read as a skill rather than a fragment? */
  function _isPhraseShaped(words) {
    if (!words.length || words.length > 4) return false;
    if (EDGE_STOP.has(words[0]) || EDGE_STOP.has(words[words.length - 1])) return false;
    if (words.every((w) => EDGE_STOP.has(w))) return false;
    if (words.some((w) => w.length < 2 && !/^[0-9]$/.test(w))) return false;
    return true;
  }

  // ---- signals that need no list ------------------------------------
  // An internal capital names a product: SolidWorks, AutoCAD, MATLAB,
  // PowerPoint. Deliberately requires a lowercase letter BEFORE the
  // second capital, so an ordinary Title Case word never matches.
  const INTERNAL_CAP = /\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/g;
  // Letters then digits names a standard: ISO 9001, AS9100, IPC-A-610,
  // Section 508. Two or more capitals so an initial does not match.
  const STANDARD = /\b[A-Z]{2,}(?:-[A-Z0-9]+)*[ -]?\d{3,}(?:[:-]\d+)?\b/g;
  // An all-capitals acronym, optionally slashed: CAD, CAD/CAM, GD&T, PLC.
  const ACRONYM = /\b[A-Z]{2,}(?:\/[A-Z]{2,})+\b|\b[A-Z]{3,}\b/g;

  // "experience with X", "proficiency in X" -- the posting naming a skill
  // outright. The same shape autofill-core uses to read a form question.
  const CUE = new RegExp(
    '(?:experience (?:with|in|using|of)|proficien(?:cy|t) (?:with|in)'
    + '|knowledge of|familiar(?:ity)? with|skilled in|expertise (?:with|in)'
    + '|competen(?:t|cy) (?:with|in)|background in|trained in|certified in'
    + '|working knowledge of|hands[- ]on (?:experience )?(?:with|in)?'
    + '|ability to (?:use|operate|run)|use of|using)\\s+([^.;:\\n]{2,120})', 'gi');

  /**
   * Split a captured cue span into individual skills. "SolidWorks and
   * AutoCAD" is two, and "root cause analysis methodologies such as 8D,
   * 5 Whys and fishbone diagrams" should not become one 12-word blob.
   */
  function _splitSpan(span) {
    return String(span)
      .replace(/\b(?:such as|including|e\.?g\.?|i\.?e\.?)\b/gi, ',')
      .split(/\s*(?:,|;|\/(?=\s)| and | or )\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function _addCandidate(map, raw, weight) {
    const n = _norm(raw);
    if (!n) return;
    const words = n.split(' ');
    if (!_isPhraseShaped(words)) return;
    if (NOT_A_SKILL.has(n)) return;
    const prev = map.get(n);
    if (prev) { prev.score += weight; if (raw.length < prev.display.length) prev.display = raw; }
    else map.set(n, { score: weight, display: String(raw).trim() });
  }

  /**
   * Soft skills present in the text. Matched morphologically: the stored
   * term, the term followed by "skills", and the -ed/-ing/-ion family, so
   * "communication skills", "organisational" and "detail-oriented" all
   * resolve to the term they belong to.
   */
  function extractSoftSkills(jdText) {
    const hay = ' ' + _norm(jdText) + ' ';
    const out = [];
    const seen = new Set();
    for (const term of SOFT_SKILLS) {
      const t = _norm(term);
      if (seen.has(t)) continue;
      const variants = [t, t + ' skills', t + 's'];
      // "analytical" <- "analytic", "organisational" <- "organisation".
      if (/(?:e|ion|y)$/.test(t)) variants.push(t.replace(/(?:e|ion|y)$/, 'ing'));
      if (/ion$/.test(t)) variants.push(t.replace(/ion$/, 'ional'));
      let hit = '';
      for (const v of variants) {
        if (hay.indexOf(' ' + v + ' ') !== -1) { hit = v; break; }
      }
      if (!hit) continue;
      seen.add(t);
      // Report what the posting said, preferring the "X skills" phrasing
      // when it used it, because that is what a scanner reads back.
      out.push(hay.indexOf(' ' + t + ' skills ') !== -1 ? term + ' skills' : term);
    }
    return out;
  }

  /**
   * Hard skills present in the text. Open extraction: nothing here is
   * matched against a list of skills.
   */
  function extractHardSkills(jdText, opts) {
    const o = opts || {};
    const limit = o.limit || 40;
    const text = String(jdText || '');
    const cands = new Map();

    // 1. Named outright by a cue. The strongest signal there is.
    let m;
    CUE.lastIndex = 0;
    while ((m = CUE.exec(text)) !== null) {
      for (const piece of _splitSpan(m[1])) _addCandidate(cands, piece, 6);
    }

    // 2. Shapes that name a product or a standard, no list required.
    for (const re of [INTERNAL_CAP, STANDARD, ACRONYM]) {
      re.lastIndex = 0;
      let x;
      while ((x = re.exec(text)) !== null) _addCandidate(cands, x[0], 5);
    }

    // 3. Phrases ending in a skill head noun, anywhere in the posting.
    // This is what catches root cause analysis, quality control, lean
    // manufacturing and time studies without knowing the industry.
    //
    // Segments split on commas and connectives as well as sentence
    // punctuation: "mechanical engineering, industrial engineering" is a
    // LIST, and normalising the comma away first fused it into one
    // four-word phrase that is neither of them.
    const segments = text.split(/[.;:\n()]|,| and | or /i);
    for (const segment of segments) {
      const words = _norm(segment).split(' ').filter(Boolean);
      for (let i = 0; i < words.length; i++) {
        if (!HEADS.has(words[i])) continue;
        // Extend LEFT while the previous word is part of the name, and
        // stop at the first word that is not. This yields exactly one
        // candidate per head: the maximal phrase. "cause analysis" is
        // therefore never produced at all, because the walk from
        // "analysis" does not stop until "root".
        let start = i;
        while (start > 0 && (i - start + 1) < 4) {
          const prev = words[start - 1];
          if (BOUNDARY.has(prev) || EDGE_STOP.has(prev)) break;
          start--;
        }
        const slice = words.slice(start, i + 1);
        if (slice.length === 1 && !STANDALONE_OK.has(slice[0])) continue;
        if (!_isPhraseShaped(slice)) continue;
        _addCandidate(cands, slice.join(' '), slice.length === 1 ? 3 : 3 + slice.length);
      }
    }

    // A term the posting repeats matters more, but only mildly: a skill
    // stated once in the requirements is still a requirement.
    const hay = ' ' + _norm(text) + ' ';
    for (const [key, v] of cands) {
      let count = 0, idx = hay.indexOf(' ' + key + ' ');
      while (idx !== -1 && count < 5) { count++; idx = hay.indexOf(' ' + key + ' ', idx + 1); }
      v.score += Math.min(count, 3) * 0.5;
    }

    // Drop anything that is really a soft skill wearing a noun.
    const soft = new Set(extractSoftSkills(text).map((s) => _norm(s).replace(/ skills$/, '')));

    // Drop a phrase that merely EXTENDS a shorter one to the right.
    //
    // The direction matters and it is not symmetric. A skill grows to the
    // LEFT of its head, so a longer left-extension is the better name:
    // "root cause analysis" over "analysis". Growth to the RIGHT is the
    // sentence continuing, not the skill: "quality assurance audits" is
    // the phrase "quality assurance" with the next noun swept in. So a
    // candidate is dropped when a shorter candidate is a strict PREFIX of
    // it, and never when one is merely a suffix.
    const keys = new Set(cands.keys());
    const ranked = [...cands.entries()]
      .sort((a, b) => b[1].score - a[1].score || a[0].length - b[0].length);
    const kept = [];
    for (const [key, v] of ranked) {
      if (soft.has(key)) continue;
      const words = key.split(' ');
      let extendsShorter = false;
      // From n = 2: a SINGLE word must never suppress the phrase it
      // begins. "ISO" was killing "ISO 9001" and "CAD/CAM" was killing
      // "CAD/CAM software", because the acronym rule finds the bare word
      // and the head-noun walk finds the phrase. The rule is meant to
      // drop "quality assurance audits" in favour of "quality
      // assurance", which is a two-word prefix and still does.
      for (let n = 2; n < words.length; n++) {
        if (keys.has(words.slice(0, n).join(' '))) { extendsShorter = true; break; }
      }
      if (extendsShorter) continue;
      kept.push({ key, display: v.display, score: v.score });
      if (kept.length >= limit) break;
    }
    return kept.map((k) => k.display);
  }

  function extractSkills(jdText, opts) {
    return {
      hardSkills: extractHardSkills(jdText, opts),
      softSkills: extractSoftSkills(jdText),
    };
  }

  const API = { extractSkills, extractHardSkills, extractSoftSkills,
    SOFT_SKILLS, HEADS, _norm };
  global.JDSkillExtractor = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
