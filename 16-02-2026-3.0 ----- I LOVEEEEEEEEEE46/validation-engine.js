// validation-engine.js - Score validation and reliability checking v3.3
// v3.3: Added role-title signal, priority coverage, contact-info check, quantified-achievement detection,
//       action-verb coverage, section presence, and score boost safeguards for ATS success
(function(global) {
  'use strict';

  // ============ CONFIDENCE LEVELS ============
  const CONFIDENCE_LEVELS = {
    HIGH:   { label: 'High Confidence',    minScore: 90, minKeywords: 15, minDensity: 2.0 },
    MEDIUM: { label: 'Medium Confidence',  minScore: 80, minKeywords: 10, minDensity: 1.5 },
    LOW:    { label: 'Low Confidence',     minScore: 70, minKeywords: 5,  minDensity: 1.0 },
    UNRELIABLE: { label: 'Unreliable',     minScore: 0,  minKeywords: 0,  minDensity: 0 }
  };

  // ============ STRONG ACTION VERBS (ATS prefers these) ============
  const ACTION_VERBS = new Set([
    'achieved','accelerated','accomplished','administered','advanced','analysed','analyzed','architected',
    'automated','boosted','built','championed','collaborated','conceived','conducted','consolidated',
    'consulted','coordinated','created','cultivated','decreased','delivered','demonstrated','deployed',
    'designed','developed','directed','drove','engineered','enhanced','established','exceeded','executed',
    'expanded','facilitated','forecasted','founded','generated','grew','guided','headed','identified',
    'implemented','improved','increased','influenced','initiated','innovated','instituted','integrated',
    'introduced','invented','launched','led','leveraged','managed','mentored','migrated','modernised',
    'modernized','monitored','negotiated','operated','optimised','optimized','orchestrated','originated',
    'overhauled','oversaw','owned','partnered','performed','pioneered','planned','produced','programmed',
    'proposed','prototyped','rebuilt','recovered','recruited','redesigned','reduced','refactored',
    'regulated','reinforced','reorganised','reorganized','researched','resolved','restructured',
    'revamped','revitalised','revitalized','saved','scaled','secured','shaped','shipped','simplified',
    'solved','spearheaded','standardised','standardized','streamlined','strengthened','structured',
    'supervised','supported','surpassed','synthesised','synthesized','targeted','taught','tested',
    'trained','transformed','transitioned','unified','upgraded','validated'
  ]);

  /**
   * Calculate keyword density — percentage of CV words that are job keywords
   */
  function calculateKeywordDensity(cvText, matchedKeywords) {
    if (!cvText || !matchedKeywords || matchedKeywords.length === 0) return 0;
    const totalWords = cvText.split(/\s+/).filter(w => w.length >= 2).length;
    if (totalWords === 0) return 0;

    let keywordOccurrences = 0;
    const cvLower = cvText.toLowerCase();
    for (const keyword of matchedKeywords) {
      const regex = new RegExp('\\b' + keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      const matches = cvLower.match(regex);
      keywordOccurrences += matches ? matches.length : 0;
    }

    return Math.round((keywordOccurrences / totalWords) * 100 * 10) / 10;
  }

  function getConfidenceLevel(score, keywordCount, density) {
    if (score >= CONFIDENCE_LEVELS.HIGH.minScore &&
        keywordCount >= CONFIDENCE_LEVELS.HIGH.minKeywords &&
        density >= CONFIDENCE_LEVELS.HIGH.minDensity) {
      return 'HIGH';
    }
    if (score >= CONFIDENCE_LEVELS.MEDIUM.minScore &&
        keywordCount >= CONFIDENCE_LEVELS.MEDIUM.minKeywords &&
        density >= CONFIDENCE_LEVELS.MEDIUM.minDensity) {
      return 'MEDIUM';
    }
    if (score >= CONFIDENCE_LEVELS.LOW.minScore &&
        keywordCount >= CONFIDENCE_LEVELS.LOW.minKeywords &&
        density >= CONFIDENCE_LEVELS.LOW.minDensity) {
      return 'LOW';
    }
    return 'UNRELIABLE';
  }

  function detectKeywordStuffing(cvText, matchedKeywords, maxRepetitions = 6) {
    if (!cvText || !matchedKeywords) return [];
    const cvLower = cvText.toLowerCase();
    const stuffed = [];

    for (const keyword of matchedKeywords) {
      const regex = new RegExp('\\b' + keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      const matches = cvLower.match(regex);
      if (matches && matches.length > maxRepetitions) {
        stuffed.push({ keyword, count: matches.length, max: maxRepetitions });
      }
    }

    return stuffed;
  }

  /**
   * v3.3: Role-title signal — does the CV contain wording aligned with the job title?
   * Strong ATS signal: ATS often boosts CVs whose current/recent role echoes the target title.
   */
  function detectRoleTitleSignal(cvText, jobTitle) {
    if (!cvText || !jobTitle) return { matched: false, coverage: 0, tokens: [] };
    const stop = new Set(['and','or','the','a','an','of','for','to','in','at','with','&','-','/','senior','junior','staff','lead','principal','head','of','i','ii','iii','iv']);
    const titleTokens = jobTitle.toLowerCase()
      .replace(/[^a-z0-9\s+#.]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !stop.has(t));
    if (titleTokens.length === 0) return { matched: false, coverage: 0, tokens: [] };

    const cvLower = cvText.toLowerCase();
    const hits = titleTokens.filter(t => new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(cvLower));
    const coverage = Math.round((hits.length / titleTokens.length) * 100);
    return { matched: coverage >= 60, coverage, tokens: hits };
  }

  /**
   * v3.3: High-priority keyword coverage — ATS scorers weight priority keywords highest.
   */
  function calculatePriorityCoverage(cvText, keywordsByPriority) {
    if (!cvText || !keywordsByPriority) return { high: 0, medium: 0, low: 0, overall: 0 };
    const cvLower = cvText.toLowerCase();
    const tally = (list) => {
      if (!Array.isArray(list) || list.length === 0) return 100; // absent priority band — not penalised
      let hit = 0;
      for (const kw of list) {
        const re = new RegExp('\\b' + String(kw).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        if (re.test(cvLower)) hit++;
      }
      return Math.round((hit / list.length) * 100);
    };
    const high   = tally(keywordsByPriority.high || keywordsByPriority.High || []);
    const medium = tally(keywordsByPriority.medium || keywordsByPriority.Medium || []);
    const low    = tally(keywordsByPriority.low || keywordsByPriority.Low || []);
    // Weighted overall: High 3x, Medium 2x, Low 1x
    const overall = Math.round((high * 3 + medium * 2 + low * 1) / 6);
    return { high, medium, low, overall };
  }

  /**
   * v3.3: Contact-info presence — ATS parsers fail if contact fields are missing.
   */
  function checkContactInfo(cvText) {
    if (!cvText) return { email: false, phone: false, linkedin: false, location: false, complete: false };
    const email = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(cvText);
    const phone = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/.test(cvText);
    const linkedin = /linkedin\.com\/in\/[A-Za-z0-9\-_.]+/i.test(cvText);
    const location = /\b(London|Manchester|Birmingham|Leeds|Bristol|Liverpool|Edinburgh|Glasgow|Cardiff|Belfast|Dublin|New York|San Francisco|Boston|Seattle|Austin|Chicago|Los Angeles|Toronto|Berlin|Paris|Amsterdam|Remote|Hybrid|United Kingdom|UK|USA|US|EU|Europe)\b/i.test(cvText);
    const complete = email && phone && (linkedin || location);
    return { email, phone, linkedin, location, complete };
  }

  /**
   * v3.3: Quantified-achievement detection — CVs with metrics score higher with recruiters/ATS.
   */
  function detectQuantifiedAchievements(cvText) {
    if (!cvText) return { count: 0, samples: [] };
    const patterns = [
      /\b\d+(?:\.\d+)?\s*%/g,                                  // 25%, 3.5%
      /\b(?:£|\$|€|¥)\s?\d[\d.,]*\s*(?:k|m|bn|b|million|billion|thousand)?\b/gi,
      /\b\d[\d,]{2,}\s*(?:users|customers|clients|accounts|records|requests|transactions|orders|deals|leads|hours|queries|API calls|downloads|installs)\b/gi,
      /\b(?:by|to|from|of|over|under|above|below)\s+\d+(?:\.\d+)?\s*(?:%|x|times|fold)\b/gi,
      /\b\d+(?:\.\d+)?\s*(?:x|×)\s+(?:faster|slower|more|less|increase|reduction|improvement|growth|uplift)\b/gi,
      /\b\d+(?:\.\d+)?\s*(?:ms|s|seconds|minutes|hours|days|weeks|months|years)\b/gi
    ];
    let count = 0;
    const samples = [];
    for (const re of patterns) {
      const matches = cvText.match(re) || [];
      count += matches.length;
      for (const m of matches.slice(0, 3)) samples.push(m.trim());
    }
    return { count, samples: samples.slice(0, 8) };
  }

  /**
   * v3.3: Action-verb coverage — strong verbs in bullet starts correlate with higher ATS ranking.
   */
  function calculateActionVerbCoverage(cvText) {
    if (!cvText) return { bulletsStartingWithVerb: 0, totalBullets: 0, coverage: 0 };
    const lines = cvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const bulletRE = /^(?:[•\-\*\u2022\u25CF\u25A0\u2023\u2043]|\d+\.)\s*(.+)/;
    let total = 0;
    let startsWithVerb = 0;
    for (const line of lines) {
      const m = line.match(bulletRE);
      if (!m) continue;
      total++;
      const firstWord = m[1].split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
      if (ACTION_VERBS.has(firstWord)) startsWithVerb++;
    }
    const coverage = total === 0 ? 0 : Math.round((startsWithVerb / total) * 100);
    return { bulletsStartingWithVerb: startsWithVerb, totalBullets: total, coverage };
  }

  /**
   * v3.3: Required-section presence — missing sections hurt ATS parsing reliability.
   */
  function checkSectionPresence(cvText) {
    if (!cvText) return { summary: false, experience: false, education: false, skills: false, complete: false };
    const find = (re) => re.test(cvText);
    const summary    = find(/\b(?:summary|profile|about me|personal statement|career objective)\b/i);
    const experience = find(/\b(?:experience|employment|work history|professional experience|career history)\b/i);
    const education  = find(/\b(?:education|academic background|qualifications|degrees)\b/i);
    const skills     = find(/\b(?:skills|technical skills|core competenc(?:y|ies)|technologies|tech stack)\b/i);
    const complete = experience && education && skills;
    return { summary, experience, education, skills, complete };
  }

  /**
   * v3.3: Safeguarded score — prevents misleading "95%+ reliability" when foundations are weak.
   */
  function applyScoreSafeguards(baseScore, checks) {
    let adjusted = baseScore;
    const deductions = [];

    if (!checks.contact.complete) { adjusted -= 8;  deductions.push('-8 missing contact info'); }
    if (!checks.sections.complete){ adjusted -= 6;  deductions.push('-6 missing required sections'); }
    if (checks.quantified.count < 3) { adjusted -= 5; deductions.push('-5 few quantified achievements'); }
    if (checks.actionVerbs.coverage < 50 && checks.actionVerbs.totalBullets >= 5) { adjusted -= 4; deductions.push('-4 weak action-verb coverage'); }
    if (!checks.roleTitle.matched) { adjusted -= 4; deductions.push('-4 role-title signal weak'); }
    if (checks.priority.high < 70) { adjusted -= Math.min(10, Math.round((70 - checks.priority.high) / 5)); deductions.push(`-priority coverage low (${checks.priority.high}%)`); }
    if (checks.stuffedCount > 0)   { adjusted -= 3 * checks.stuffedCount; deductions.push(`-keyword stuffing`); }

    adjusted = Math.max(0, Math.min(100, adjusted));
    return { adjusted, deductions };
  }

  /**
   * Validate tailoring quality with comprehensive checks (v3.3)
   */
  function validateTailoring(cvText, jobKeywords, jobMeta = {}) {
    const keywords = Array.isArray(jobKeywords) ? jobKeywords : (jobKeywords?.all || []);
    const keywordsByPriority = (jobKeywords && !Array.isArray(jobKeywords) && (jobKeywords.high || jobKeywords.medium || jobKeywords.low))
      ? jobKeywords
      : (jobMeta.keywordsByPriority || null);

    const match = global.ReliableExtractor?.matchKeywords(cvText, keywords) || { matchScore: 0, matched: [], missing: keywords };

    const score = match.matchScore || 0;
    const matched = match.matched || [];
    const missing = match.missing || [];
    const keywordCount = matched.length;

    const density = calculateKeywordDensity(cvText, matched);
    const confidence = getConfidenceLevel(score, keywordCount, density);
    const stuffedKeywords = detectKeywordStuffing(cvText, matched);

    // v3.3 quality checks
    const roleTitle   = detectRoleTitleSignal(cvText, jobMeta.title || jobMeta.jobTitle || '');
    const priority    = calculatePriorityCoverage(cvText, keywordsByPriority || {});
    const contact     = checkContactInfo(cvText);
    const quantified  = detectQuantifiedAchievements(cvText);
    const actionVerbs = calculateActionVerbCoverage(cvText);
    const sections    = checkSectionPresence(cvText);

    const safeguarded = applyScoreSafeguards(score, {
      contact, sections, quantified, actionVerbs, roleTitle, priority,
      stuffedCount: stuffedKeywords.length
    });

    const reliable = safeguarded.adjusted >= 85 &&
                     keywordCount >= 10 &&
                     density >= 1.0 &&
                     stuffedKeywords.length === 0 &&
                     contact.complete &&
                     sections.complete;

    return {
      score,
      adjustedScore: safeguarded.adjusted,
      scoreDeductions: safeguarded.deductions,
      keywordCount,
      reliable,
      matched,
      missing,
      density,
      confidence,
      confidenceLabel: CONFIDENCE_LEVELS[confidence].label,
      stuffedKeywords,
      roleTitle,
      priorityCoverage: priority,
      contact,
      quantified,
      actionVerbs,
      sections,
      warnings: [
        ...(stuffedKeywords.length > 0 ? [`Keyword stuffing detected: ${stuffedKeywords.map(s => `"${s.keyword}" (${s.count}x)`).join(', ')}`] : []),
        ...(density > 5.0 ? ['Keyword density too high — may trigger ATS spam filters'] : []),
        ...(density < 1.0 && keywordCount > 0 ? ['Keyword density too low — keywords may not be prominent enough'] : []),
        ...(keywordCount < 5 ? ['Too few keywords matched — tailoring may be insufficient'] : []),
        ...(missing.length > matched.length ? ['More keywords missing than matched — consider adding more relevant terms'] : []),
        ...(!contact.email ? ['Missing email — ATS cannot contact you'] : []),
        ...(!contact.phone ? ['Missing phone — recruiters may skip your CV'] : []),
        ...(!contact.linkedin && !contact.location ? ['Missing LinkedIn/location — add at least one'] : []),
        ...(!sections.experience ? ['Missing "Experience" section — critical ATS parsing failure risk'] : []),
        ...(!sections.education ? ['Missing "Education" section — many ATS require it'] : []),
        ...(!sections.skills ? ['Missing "Skills" section — ATS relies on it for keyword extraction'] : []),
        ...(quantified.count < 3 ? [`Only ${quantified.count} quantified achievements — add metrics (%, £, counts) for higher ATS + recruiter scoring`] : []),
        ...(actionVerbs.totalBullets >= 5 && actionVerbs.coverage < 50 ? [`Only ${actionVerbs.coverage}% bullets start with strong action verbs`] : []),
        ...(!roleTitle.matched && jobMeta.title ? [`Role-title signal weak (${roleTitle.coverage}% of title keywords in CV)`] : []),
        ...(priority.high < 70 ? [`High-priority keyword coverage only ${priority.high}% — target ≥ 80%`] : [])
      ]
    };
  }

  function getScoreStatus(score) {
    if (score >= 95) return { label: 'Excellent', color: 'excellent', emoji: '🎯' };
    if (score >= 90) return { label: 'Great', color: 'great', emoji: '✨' };
    if (score >= 80) return { label: 'Good', color: 'good', emoji: '👍' };
    if (score >= 70) return { label: 'Fair', color: 'fair', emoji: '📈' };
    return { label: 'Needs Work', color: 'needs-work', emoji: '⚠️' };
  }


  // ---- placeholder tokens must never reach a recruiter -----------------
  // The tailoring prompt forbids inventing metrics, and forbids emitting
  // "[FILL IN]"-style stand-ins for the ones it cannot evidence. A model
  // can still slip one through. In a chat window that is harmless -- the
  // human proof-reads before submitting. This tool attaches the document
  // to real applications and can email it unattended, so an escaped token
  // lands on a recruiter's desk and reads as carelessness.
  // Two patterns, because case matters for one of them and not the other.
  // The bracketed word list is case-insensitive ("[FILL IN]", "[fill in]").
  // The angle form is deliberately ALL-CAPS only, so ordinary prose that
  // happens to contain "<" is not flagged.
  const PLACEHOLDER_PATTERNS = [
    /\[\s*(?:fill[\s_-]*in|insert|add|your|tbd|todo|number|metric|percent|amount|value|placeholder|company[\s_-]*name|role[\s_-]*title|x+|\d*\s*%)[^\]]*\]/gi,
    /\b(?:TBD|TODO)\b/g,
    /<[A-Z][A-Z_]{2,}>/g,
    // The response schema labels its own fields with bracketed prompts
    // ("[Job Title]", "[GPA if applicable]"). A model echoes those back
    // whenever it has no value for the field, so they arrive looking like
    // real content. Matched by name rather than by shape, so genuine
    // bracketed prose ("[see portfolio]") is not flagged.
    /\[\s*(?:job|role)\s*title\s*\]|\[\s*(?:degree|school|university|institution)\s*name\s*\]|\[\s*dates?\s*\]|\[[^\]]{0,40}if\s+applicable[^\]]*\]/gi,
  ];

  /**
   * Every placeholder token left in a document, deduplicated and in order.
   * Pure: takes text, returns strings. Empty array means safe to send.
   */
  function findPlaceholders(text) {
    const src = String(text == null ? '' : text);
    const out = [];
    const seen = new Set();
    for (const re of PLACEHOLDER_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const tok = m[0].trim();
        const k = tok.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(tok); }
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
    return out;
  }

  global.ValidationEngine = {
    validateTailoring,
    findPlaceholders,
    getScoreStatus,
    calculateKeywordDensity,
    getConfidenceLevel,
    detectKeywordStuffing,
    detectRoleTitleSignal,
    calculatePriorityCoverage,
    checkContactInfo,
    detectQuantifiedAchievements,
    calculateActionVerbCoverage,
    checkSectionPresence,
    applyScoreSafeguards,
    ACTION_VERBS,
    CONFIDENCE_LEVELS
  };
})(typeof window !== 'undefined' ? window : global);
