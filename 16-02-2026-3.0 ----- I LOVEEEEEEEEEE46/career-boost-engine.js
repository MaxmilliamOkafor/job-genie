/**
 * Job Genie - Career Boost Engine
 *
 * Four upgrades inspired by santifer/career-ops, focused exclusively on
 * making the tailored CV + cover letter convert better:
 *
 *   1. detectArchetype(jd)       -> one of 6 role archetypes (drives summary
 *                                   framing + which bullets get priority)
 *   2. analyzeGaps(jd, cv)       -> JD requirements not present in the CV,
 *                                   each with a one-line bridge sentence the
 *                                   cover letter can use to pre-empt the gap
 *   3. extractJdHook(jd, company)-> a single concrete hook (team / product /
 *                                   challenge / recent move) for the cover
 *                                   letter opener so it cannot read generic
 *   4. keywordCoverage(cv, kws)  -> exact % of JD keywords present in the
 *                                   tailored CV, surfaced as a badge in popup
 *
 * Pure DOM-free utility module - safe to load both in content scripts and
 * the popup.  No network calls, no API keys.
 */
(function (global) {
  'use strict';

  // ===================================================================
  // 1. ARCHETYPE DETECTION
  // -------------------------------------------------------------------
  // Each archetype has weighted signal phrases; the JD scores against
  // every archetype and the top one (plus runner-up if score gap < 25%)
  // becomes the "framing" that the CV summary + bullet priority follow.
  // ===================================================================

  const ARCHETYPES = {
    'engineering-builder': {
      label: 'Engineering / Builder',
      summaryFraming: 'Engineer who ships production systems end-to-end.',
      bulletPriority: ['built', 'shipped', 'designed', 'deployed', 'scaled', 'architected', 'launched', 'released'],
      signals: {
        strong: ['software engineer', 'backend', 'frontend', 'full stack', 'fullstack', 'platform engineer', 'distributed systems', 'microservices', 'apis', 'system design', 'production'],
        medium: ['code', 'codebase', 'github', 'pull request', 'ci/cd', 'deployment', 'infrastructure', 'kubernetes', 'docker'],
      },
    },
    'data-ml': {
      label: 'Data / ML / AI',
      summaryFraming: 'Practitioner shipping data and ML systems with measurable business impact.',
      bulletPriority: ['modelled', 'trained', 'deployed', 'evaluated', 'productionised', 'shipped', 'measured', 'instrumented'],
      signals: {
        strong: ['machine learning', 'data scientist', 'ml engineer', 'mlops', 'llm', 'rag', 'embeddings', 'evals', 'fine-tun', 'pytorch', 'tensorflow', 'pipelines'],
        medium: ['model', 'inference', 'training data', 'feature store', 'observability', 'monitoring', 'data pipeline'],
      },
    },
    'product-manager': {
      label: 'Product Manager',
      summaryFraming: 'Product owner who turns ambiguous problems into shipped, measurable outcomes.',
      bulletPriority: ['shipped', 'launched', 'led', 'defined', 'prioritised', 'discovered', 'measured', 'grew'],
      signals: {
        strong: ['product manager', 'product owner', 'roadmap', 'prd', 'discovery', 'stakeholder', 'product strategy', 'user research', 'okr'],
        medium: ['kpi', 'metric', 'a/b test', 'experiment', 'go-to-market', 'launch', 'backlog', 'prioritisation'],
      },
    },
    'solutions-architect': {
      label: 'Solutions Architect / Pre-sales',
      summaryFraming: 'Architect translating customer requirements into deployable enterprise integrations.',
      bulletPriority: ['architected', 'designed', 'integrated', 'led', 'delivered', 'scaled', 'consolidated', 'modernised'],
      signals: {
        strong: ['solutions architect', 'enterprise architect', 'pre-sales', 'presales', 'technical account', 'integration', 'reference architecture', 'rfp', 'sow'],
        medium: ['architecture', 'enterprise', 'b2b', 'customer-facing', 'workshops', 'design review', 'cloud architect'],
      },
    },
    'consultant-transformation': {
      label: 'Consultant / Transformation',
      summaryFraming: 'Consultant who drives adoption and change in complex organisations.',
      bulletPriority: ['advised', 'led', 'delivered', 'transformed', 'consolidated', 'scaled', 'embedded', 'enabled'],
      signals: {
        strong: ['consultant', 'transformation', 'change management', 'advisory', 'big four', 'mckinsey', 'deloitte', 'strategy consultant', 'engagement'],
        medium: ['client engagement', 'workshops', 'maturity model', 'operating model', 'enablement', 'adoption'],
      },
    },
    'leadership-people': {
      label: 'Leadership / People Manager',
      summaryFraming: 'Engineering leader hiring, growing and shipping with cross-functional teams.',
      bulletPriority: ['hired', 'grew', 'led', 'mentored', 'managed', 'restructured', 'aligned', 'delivered'],
      signals: {
        strong: ['engineering manager', 'head of', 'director', 'vp ', 'lead', 'principal', 'tech lead', 'team lead', 'people manager', 'reports'],
        medium: ['mentor', 'coaching', '1:1', 'performance review', 'hiring', 'budget', 'org design'],
      },
    },
  };

  function _normalise(text) {
    return String(text || '').toLowerCase();
  }

  function detectArchetype(jdText) {
    const text = _normalise(jdText);
    if (!text || text.length < 40) {
      return { primary: null, secondary: null, scores: {}, confidence: 0 };
    }

    const scores = {};
    for (const [key, def] of Object.entries(ARCHETYPES)) {
      let score = 0;
      for (const sig of def.signals.strong) {
        if (text.includes(sig)) score += 3;
      }
      for (const sig of def.signals.medium) {
        if (text.includes(sig)) score += 1;
      }
      scores[key] = score;
    }

    const ranked = Object.entries(scores)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);

    if (ranked.length === 0) {
      return { primary: null, secondary: null, scores, confidence: 0 };
    }

    const [topKey, topScore] = ranked[0];
    const runnerUp = ranked[1];
    const isHybrid = runnerUp && (topScore - runnerUp[1]) <= Math.max(2, topScore * 0.25);

    return {
      primary: { key: topKey, ...ARCHETYPES[topKey], score: topScore },
      secondary: isHybrid ? { key: runnerUp[0], ...ARCHETYPES[runnerUp[0]], score: runnerUp[1] } : null,
      scores,
      confidence: Math.min(1, topScore / 12),
    };
  }

  // ===================================================================
  // 2. GAP ANALYSIS WITH MITIGATION BRIDGES
  // -------------------------------------------------------------------
  // Pulls explicit "must have" / "required" / "X+ years" lines from the JD
  // and checks each against the CV.  For misses, builds a short bridge
  // sentence of the form "While I have not [X], I have [adjacent Y]" using
  // a concrete adjacent skill we DO see in the CV - never invents.
  // ===================================================================

  const REQUIREMENT_PATTERNS = [
    /(?:^|\n)\s*[•\-\*]\s*([^\n]{8,160})/g,         // bullet list lines
    /\b(\d+\+?\s*years?[^.\n]{2,120})/gi,                // years-of-experience
    /(?:must have|required|requirements?|you have|you bring)\s*[:\-]\s*([^\n]{10,200})/gi,
    /(?:experience (?:with|in|of|using))\s+([^\n.,;]{4,80})/gi,
    /(?:strong|deep|proven|hands-on)\s+(?:knowledge|experience|background)\s+(?:of|in|with)\s+([^\n.,;]{4,80})/gi,
  ];

  const ADJACENT_MAP = {
    'kubernetes': ['docker', 'containers', 'ecs', 'fargate', 'helm'],
    'aws': ['gcp', 'azure', 'cloud', 'ec2', 'lambda', 's3'],
    'gcp': ['aws', 'azure', 'cloud', 'gke', 'bigquery'],
    'azure': ['aws', 'gcp', 'cloud'],
    'react': ['vue', 'svelte', 'angular', 'next.js', 'remix', 'frontend'],
    'vue': ['react', 'svelte', 'angular', 'frontend'],
    'typescript': ['javascript', 'flow', 'node'],
    'python': ['ruby', 'go', 'java', 'scripting'],
    'go': ['rust', 'c++', 'java'],
    'rust': ['go', 'c++'],
    'rag': ['llm', 'embeddings', 'vector', 'semantic search', 'retrieval'],
    'llm': ['gpt', 'claude', 'transformers', 'fine-tuning', 'prompt engineering'],
    'pytorch': ['tensorflow', 'jax', 'numpy'],
    'tensorflow': ['pytorch', 'jax', 'keras'],
    'sql': ['postgres', 'mysql', 'snowflake', 'bigquery', 'queries'],
    'spark': ['hadoop', 'flink', 'beam', 'data pipelines'],
    'kafka': ['rabbitmq', 'pubsub', 'sqs', 'event streaming'],
    'graphql': ['rest', 'grpc', 'apis'],
    'terraform': ['cloudformation', 'pulumi', 'ansible', 'iac'],
    'ci/cd': ['github actions', 'jenkins', 'circleci', 'gitlab ci', 'pipelines'],
    'agile': ['scrum', 'kanban', 'sprints'],
    'scrum': ['agile', 'kanban', 'sprints'],
  };

  function _extractRequirements(jdText) {
    const text = String(jdText || '');
    const out = new Set();
    for (const re of REQUIREMENT_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const captured = (m[1] || '').trim().replace(/[.;:,]+$/, '');
        if (captured.length >= 6 && captured.length <= 200) out.add(captured);
        if (out.size > 60) break;
      }
    }
    return [...out];
  }

  function _findBridge(missingTerm, cvText) {
    const term = missingTerm.toLowerCase();
    const cvLower = _normalise(cvText);
    for (const [canonical, adjacents] of Object.entries(ADJACENT_MAP)) {
      if (term.includes(canonical)) {
        for (const adj of adjacents) {
          if (cvLower.includes(adj)) {
            return `While I have not used ${canonical} in production, my hands-on work with ${adj} maps directly onto its core concepts and I would expect to ramp quickly.`;
          }
        }
      }
    }
    return null;
  }

  function analyzeGaps(jdText, cvText, options = {}) {
    const { maxGaps = 6 } = options;
    const requirements = _extractRequirements(jdText);
    const cvLower = _normalise(cvText);

    const covered = [];
    const gaps = [];

    // Tokens we treat as "tech terms" that, if present in a requirement,
    // become better probes than the surrounding words ("kubernetes" beats
    // "in production").  The list also seeds the bridge lookup.
    const TECH_TOKENS = Object.keys(ADJACENT_MAP);

    for (const req of requirements) {
      const cleaned = req.replace(/^[\W_]+|[\W_]+$/g, '').toLowerCase();
      if (!cleaned) continue;
      const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
      if (words.length === 0) continue;

      // Prefer a known tech token if the requirement contains one.
      const techHit = TECH_TOKENS.find((t) => cleaned.includes(t));
      const probe = techHit || words.slice(-3).join(' ');
      const head = words.slice(0, 3).join(' ');

      if (cvLower.includes(probe) || cvLower.includes(head)) {
        covered.push(req);
        continue;
      }

      const bridge = _findBridge(probe, cvText) || _findBridge(head, cvText);
      const subject = techHit || head;
      gaps.push({
        requirement: req,
        bridge: bridge ||
          `If ${subject} is a hard requirement I would welcome the chance to walk through my closest adjacent experience.`,
        hasAdjacent: !!bridge,
      });
      if (gaps.length >= maxGaps) break;
    }

    return { covered, gaps, requirementCount: requirements.length };
  }

  // ===================================================================
  // 3. JD HOOK EXTRACTOR
  // -------------------------------------------------------------------
  // Pulls one concrete, non-generic detail from the JD that the cover
  // letter opener can reference.  Priority: named team/product > stated
  // challenge > recent milestone > tech-stack specificity.  Falls back
  // to the role's "first 90 days" framing if nothing concrete found.
  // ===================================================================

  const HOOK_PATTERNS = [
    {
      tag: 'team',
      re: /\bjoin(?:ing)?\s+(?:our|the)\s+([A-Z][\w\- ]{3,60}?)\s+(?:team|squad|pod|guild)\b/,
      shape: (m) => `the work happening on the ${m[1].trim()} team`,
    },
    {
      tag: 'team-prefix',
      re: /\b(?:our|the)\s+([A-Z][\w\- ]{3,60}?)\s+(?:team|squad|pod|guild)\s+is\b/,
      shape: (m) => `the ${m[1].trim()} team's current focus`,
    },
    {
      tag: 'product',
      re: /\b(?:building|launching|scaling|growing)\s+([A-Z][\w\- ]{3,60})\b/,
      shape: (m) => `your work on ${m[1].trim()}`,
    },
    {
      tag: 'mission',
      re: /\b(?:our mission|we are on a mission)\s+(?:is\s+)?to\s+([^.\n]{15,140})/i,
      shape: (m) => `the mission to ${m[1].trim().replace(/[.;:,]+$/, '')}`,
    },
    {
      tag: 'challenge',
      re: /\b(?:you ?will|you'?ll|the role will)\s+([^.\n]{20,160})/i,
      shape: (m) => `the ${m[1].trim().replace(/[.;:,]+$/, '')} challenge described in the brief`,
    },
    {
      tag: 'milestone',
      re: /\b(?:recently|just)\s+(raised|launched|shipped|acquired|hired|opened)\s+([^.\n]{6,120})/i,
      shape: (m) => `that ${m[0].toLowerCase()}`,
    },
  ];

  function extractJdHook(jdText, companyName) {
    const text = String(jdText || '');
    if (text.length < 50) {
      return {
        hook: companyName ? `the work ${companyName} is doing right now` : 'the role described in the brief',
        kind: 'fallback',
      };
    }

    for (const pat of HOOK_PATTERNS) {
      const m = text.match(pat.re);
      if (m) {
        const hook = pat.shape(m);
        if (hook && hook.length >= 8 && hook.length <= 180) {
          return { hook, kind: pat.tag };
        }
      }
    }

    // Tech-stack specificity fallback - find a distinctive phrase like "X, Y and Z"
    const stackMatch = text.match(/\b((?:[A-Z][a-zA-Z0-9\.+#]{1,18}|[a-z]{3,12})(?:,\s+[A-Za-z0-9\.+#]{2,18}){2,4}(?:,?\s+and\s+[A-Za-z0-9\.+#]{2,18}))/);
    if (stackMatch) {
      return {
        hook: `the ${stackMatch[1]} stack listed in the role`,
        kind: 'stack',
      };
    }

    return {
      hook: companyName
        ? `what ${companyName} is building right now`
        : 'the role described in the brief',
      kind: 'fallback',
    };
  }

  // ===================================================================
  // 4. KEYWORD COVERAGE %
  // -------------------------------------------------------------------
  // After the CV has been tailored, score how many of the JD keywords are
  // actually present.  The popup surfaces this as a badge so the user
  // sees objective ATS-match feedback before submitting.
  // ===================================================================

  function _flatKeywords(jobKeywords) {
    if (!jobKeywords) return [];
    if (Array.isArray(jobKeywords)) return jobKeywords;
    if (jobKeywords.all && Array.isArray(jobKeywords.all)) return jobKeywords.all;
    const acc = [];
    for (const k of ['highPriority', 'mediumPriority', 'lowPriority']) {
      if (Array.isArray(jobKeywords[k])) acc.push(...jobKeywords[k]);
    }
    return acc;
  }

  function keywordCoverage(cvText, jobKeywords) {
    const cvLower = _normalise(cvText);
    const flat = _flatKeywords(jobKeywords)
      .map((k) => String(k || '').trim().toLowerCase())
      .filter((k) => k.length >= 2);

    if (flat.length === 0) {
      return { percent: 0, matched: [], missing: [], total: 0 };
    }

    const seen = new Set();
    const matched = [];
    const missing = [];

    for (const kw of flat) {
      if (seen.has(kw)) continue;
      seen.add(kw);
      if (cvLower.includes(kw)) matched.push(kw);
      else missing.push(kw);
    }

    const total = matched.length + missing.length;
    const percent = total === 0 ? 0 : Math.round((matched.length / total) * 100);

    return {
      percent,
      matched,
      missing: missing.slice(0, 12),
      total,
      band: percent >= 85 ? 'strong' : percent >= 70 ? 'good' : percent >= 50 ? 'moderate' : 'weak',
    };
  }

  // ===================================================================
  // 5. SUMMARY FRAMING - reads the detected archetype and rewrites the
  //    professional-summary opener so it leads with the right archetype.
  // ===================================================================

  function buildArchetypeSummary({ archetype, yearsExp, domain, baseSummary, topKeywords = [] }) {
    if (!archetype || !archetype.primary) return baseSummary;
    const a = archetype.primary;
    const top3 = topKeywords.slice(0, 3).filter(Boolean);
    const kwClause = top3.length ? ` Recent focus areas: ${top3.join(', ')}.` : '';
    const lead = `${a.summaryFraming} ${yearsExp ? `${yearsExp}+ years` : 'Multi-year'} in ${domain || 'the field'}.${kwClause}`;
    if (!baseSummary) return lead;
    return `${lead} ${baseSummary}`;
  }

  // ===================================================================
  // EXPORT
  // ===================================================================
  const CareerBoostEngine = {
    detectArchetype,
    analyzeGaps,
    extractJdHook,
    keywordCoverage,
    buildArchetypeSummary,
    ARCHETYPES,
  };

  global.CareerBoostEngine = CareerBoostEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CareerBoostEngine;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this)));
