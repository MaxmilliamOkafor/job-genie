// strategic-keyword-integration.js - Intelligent Keyword Integration into Work Experience
// CRITICAL: Moves keywords from Skills section into Work Experience bullets for maximum ATS impact
// ATS systems weight keywords in context MORE than keywords in skills lists

(function(global) {
  'use strict';

  // ============ KEYWORD CATEGORIES ============
  const KEYWORD_CATEGORIES = {
    TECHNICAL: 'technical',
    METHODOLOGY: 'methodology',
    SOFT_SKILL: 'soft_skill',
    DOMAIN: 'domain',
    TOOL: 'tool',
    CERTIFICATION: 'certification'
  };

  // ============ INJECTION STRATEGIES ============
  const INJECTION_STRATEGIES = {
    // Parenthetical Addition - safest, adds context in parentheses
    PARENTHETICAL: 'parenthetical',
    // Technology Stack - adds tech after action verb
    TECH_STACK: 'tech_stack',
    // Methodology Integration - adds methodology context
    METHODOLOGY: 'methodology',
    // Outcome Amplification - adds impact context
    OUTCOME: 'outcome'
  };

  // ============ NATURAL INTEGRATION TEMPLATES ============
  const INTEGRATION_TEMPLATES = {
    // After action verbs: "Led [keyword]-focused initiatives..."
    afterVerb: [
      '{verb} {keyword}-focused',
      '{verb} {keyword}-driven',
      '{verb} cross-functional {keyword}'
    ],

    // Technology context: "...using [keyword] and [keyword]"
    techContext: [
      'using {keywords}',
      'applying {keywords}',
      'implementing {keywords}',
      'employing {keywords}',
      'deploying {keywords}'
    ],

    // Methodology context: "...following [keyword] methodology"
    methodologyContext: [
      'following {keyword} methodology',
      'applying {keyword} principles',
      'using {keyword} framework',
      'through {keyword} practices'
    ],

    // Impact context: "...achieving {metric} through {keyword}"
    impactContext: [
      'achieving {metric} through {keyword}',
      'producing {metric} via {keyword}',
      'delivering {metric} using {keyword}'
    ],

    // Ending additions: "..., incorporating {keywords}."
    ending: [
      ', incorporating {keywords}',
      ', using {keywords}',
      ' through {keywords}',
      ' via {keywords}',
      ', applying {keywords}'
    ]
  };

  // ============ CATEGORY DETECTION ============
  const CATEGORY_PATTERNS = {
    technical: new Set([
      'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'kotlin', 'swift',
      'react', 'angular', 'vue', 'node.js', 'django', 'flask', 'spring', 'express',
      'sql', 'nosql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
      'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'terraform', 'jenkins',
      'tensorflow', 'pytorch', 'pandas', 'spark', 'hadoop', 'kafka',
      'html', 'css', 'graphql', 'rest', 'api', 'microservices'
    ]),
    methodology: new Set([
      'agile', 'scrum', 'kanban', 'lean', 'waterfall', 'devops', 'ci/cd', 'tdd', 'bdd',
      'sprint', 'backlog', 'retrospective', 'standup', 'iteration'
    ]),
    soft_skill: new Set([
      'leadership', 'communication', 'collaboration', 'teamwork', 'mentoring',
      'problem-solving', 'critical thinking', 'adaptability', 'flexibility',
      'stakeholder management', 'cross-functional', 'interpersonal'
    ]),
    domain: new Set([
      'machine learning', 'deep learning', 'nlp', 'computer vision', 'ai',
      'data science', 'data engineering', 'analytics', 'etl', 'data pipeline',
      'fintech', 'healthtech', 'e-commerce', 'saas', 'b2b', 'b2c',
      'compliance', 'security', 'fraud detection', 'risk management'
    ]),
    tool: new Set([
      'jira', 'confluence', 'git', 'github', 'gitlab', 'bitbucket',
      'slack', 'teams', 'trello', 'asana', 'notion',
      'tableau', 'power bi', 'looker', 'datadog', 'splunk', 'grafana'
    ])
  };

  // ============ MAIN ENGINE CLASS ============
  const StrategicKeywordIntegration = {

    // ============ CATEGORIZE KEYWORDS ============
    categorizeKeywords(keywords) {
      const categorized = {
        technical: [],
        methodology: [],
        soft_skill: [],
        domain: [],
        tool: [],
        uncategorized: []
      };

      const allKeywords = Array.isArray(keywords) ? keywords : (keywords?.all || []);

      for (const keyword of allKeywords) {
        const kwLower = keyword.toLowerCase();
        let found = false;

        for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
          if (patterns.has(kwLower)) {
            categorized[category].push(keyword);
            found = true;
            break;
          }
        }

        if (!found) {
          categorized.uncategorized.push(keyword);
        }
      }

      return categorized;
    },

    // ============ MATCH KEYWORDS TO EXPERIENCE ============
    matchKeywordsToExperience(categorizedKeywords, workExperience) {
      const matches = [];

      for (const [roleIdx, role] of workExperience.entries()) {
        const roleMatches = {
          roleIndex: roleIdx,
          company: role.company || role.companyName || '',
          position: role.title || role.position || '',
          existingKeywords: [],
          compatibleKeywords: [],
          bulletOpportunities: []
        };

        const bullets = role.bullets || role.achievements || role.description || [];
        const bulletsArray = Array.isArray(bullets) ? bullets : [bullets];

        // Analyze each bullet for integration opportunities
        for (const [bulletIdx, bullet] of bulletsArray.entries()) {
          const bulletLower = (bullet || '').toLowerCase();
          
          // Find keywords already in bullet
          const existing = [];
          const compatible = [];
          
          const allKeywords = [
            ...categorizedKeywords.technical,
            ...categorizedKeywords.methodology,
            ...categorizedKeywords.domain,
            ...categorizedKeywords.tool,
            ...categorizedKeywords.uncategorized
          ];

          for (const kw of allKeywords) {
            if (bulletLower.includes(kw.toLowerCase())) {
              existing.push(kw);
            } else if (this.isKeywordCompatibleWithBullet(kw, bulletLower, categorizedKeywords)) {
              compatible.push(kw);
            }
          }

          roleMatches.existingKeywords.push(...existing);

          if (compatible.length > 0) {
            roleMatches.bulletOpportunities.push({
              index: bulletIdx,
              originalBullet: bullet,
              compatibleKeywords: compatible.slice(0, 4), // Max 4 per bullet
              strategies: this.determineIntegrationStrategies(bullet, compatible)
            });
          }
        }

        roleMatches.compatibleKeywords = [...new Set(
          roleMatches.bulletOpportunities.flatMap(b => b.compatibleKeywords)
        )];

        matches.push(roleMatches);
      }

      return matches;
    },

    // ============ CHECK KEYWORD COMPATIBILITY ============
    isKeywordCompatibleWithBullet(keyword, bulletLower, categorizedKeywords) {
      const kwLower = keyword.toLowerCase();

      // Technical keywords are compatible with technical bullets
      if (categorizedKeywords.technical.includes(keyword)) {
        return /(?:built|developed|designed|implemented|created|deployed|engineered|architected)/i.test(bulletLower);
      }

      // Methodology keywords compatible with process bullets
      if (categorizedKeywords.methodology.includes(keyword)) {
        return /(?:led|managed|drove|spearheaded|coordinated|organized|planned)/i.test(bulletLower);
      }

      // Domain keywords compatible with outcome bullets
      if (categorizedKeywords.domain.includes(keyword)) {
        return /(?:improved|reduced|increased|achieved|delivered|optimised|enhanced)/i.test(bulletLower);
      }

      // Tool keywords compatible with any implementation bullet
      if (categorizedKeywords.tool.includes(keyword)) {
        return /(?:using|with|through|via|implementing|deploying|applying)/i.test(bulletLower);
      }

      // Default: compatible if bullet is substantial (>50 chars)
      return bulletLower.length > 50;
    },

    // ============ DETERMINE INTEGRATION STRATEGIES ============
    determineIntegrationStrategies(bullet, compatibleKeywords) {
      const strategies = [];
      const bulletLower = bullet.toLowerCase();

      // Check for action verb at start
      if (/^(led|managed|developed|built|created|implemented|designed|engineered|delivered|drove|spearheaded)/i.test(bullet)) {
        strategies.push(INJECTION_STRATEGIES.TECH_STACK);
      }

      // Check for methodology context
      if (/(?:process|workflow|initiative|project|sprint|iteration)/i.test(bulletLower)) {
        strategies.push(INJECTION_STRATEGIES.METHODOLOGY);
      }

      // Check for metrics/outcomes
      if (/\d+%|\$\d|reduced|increased|improved|achieved/i.test(bulletLower)) {
        strategies.push(INJECTION_STRATEGIES.OUTCOME);
      }

      // Default: parenthetical is always safe
      if (strategies.length === 0) {
        strategies.push(INJECTION_STRATEGIES.PARENTHETICAL);
      }

      return strategies;
    },

    // ============ ENHANCE BULLET POINTS WITH KEYWORDS ============
    enhanceBulletPointsWithKeywords(workExperience, keywords, options = {}) {
      const categorized = this.categorizeKeywords(keywords);
      const matches = this.matchKeywordsToExperience(categorized, workExperience);
      
      const enhancedExperience = JSON.parse(JSON.stringify(workExperience));
      const stats = {
        bulletsModified: 0,
        keywordsIntegrated: 0,
        strategiesUsed: {}
      };

      // Global tracking of used keywords
      const usedKeywords = new Set();

      for (const match of matches) {
        const roleIdx = match.roleIndex;
        const role = enhancedExperience[roleIdx];
        
        if (!role) continue;

        const bullets = role.bullets || role.achievements || role.description || [];
        const bulletsArray = Array.isArray(bullets) ? bullets : [bullets];

        for (const opportunity of match.bulletOpportunities) {
          const bulletIdx = opportunity.index;
          const originalBullet = opportunity.originalBullet;
          
          // Filter out already used keywords
          const availableKeywords = opportunity.compatibleKeywords
            .filter(kw => !usedKeywords.has(kw.toLowerCase()));

          if (availableKeywords.length === 0) continue;

          // Select best strategy
          const strategy = opportunity.strategies[0] || INJECTION_STRATEGIES.PARENTHETICAL;
          
          // Enhance the bullet
          const enhanced = this.enhanceSingleBullet(
            originalBullet,
            availableKeywords.slice(0, 3), // Max 3 keywords per bullet
            strategy,
            categorized
          );

          if (enhanced !== originalBullet) {
            bulletsArray[bulletIdx] = enhanced;
            stats.bulletsModified++;
            stats.keywordsIntegrated += Math.min(3, availableKeywords.length);
            stats.strategiesUsed[strategy] = (stats.strategiesUsed[strategy] || 0) + 1;

            // Mark keywords as used
            for (const kw of availableKeywords.slice(0, 3)) {
              usedKeywords.add(kw.toLowerCase());
            }
          }
        }

        // Update the role with enhanced bullets
        if (role.bullets) role.bullets = bulletsArray;
        else if (role.achievements) role.achievements = bulletsArray;
        else if (role.description) role.description = bulletsArray;
      }

      stats.integratedKeywords = [...usedKeywords];

      return {
        enhancedExperience,
        stats,
        categorizedKeywords: categorized
      };
    },

    // ============ ENHANCE SINGLE BULLET ============
    enhanceSingleBullet(bullet, keywords, strategy, categorized) {
      if (!bullet || !keywords || keywords.length === 0) return bullet;

      let enhanced = bullet;
      const bulletLower = bullet.toLowerCase();

      // Skip if all keywords already present
      const missing = keywords.filter(kw => !bulletLower.includes(kw.toLowerCase()));
      if (missing.length === 0) return bullet;

      switch (strategy) {
        case INJECTION_STRATEGIES.TECH_STACK:
          enhanced = this.integrateWithTechStack(bullet, missing);
          break;

        case INJECTION_STRATEGIES.METHODOLOGY:
          enhanced = this.integrateWithMethodology(bullet, missing, categorized);
          break;

        case INJECTION_STRATEGIES.OUTCOME:
          enhanced = this.integrateWithOutcome(bullet, missing);
          break;

        case INJECTION_STRATEGIES.PARENTHETICAL:
        default:
          enhanced = this.integrateParenthetical(bullet, missing);
          break;
      }

      return enhanced;
    },

    // ============ TECH STACK INTEGRATION ============
    integrateWithTechStack(bullet, keywords) {
      // Pattern: "Led [keyword]-focused..." or "...using [keyword1] and [keyword2]"
      const verbMatch = bullet.match(/^(Led|Managed|Developed|Built|Created|Implemented|Designed|Engineered|Delivered|Drove|Spearheaded)\s+/i);
      
      if (verbMatch) {
        // Insert after verb
        const verb = verbMatch[1];
        const rest = bullet.slice(verbMatch[0].length);
        
        if (keywords.length === 1) {
          return `${verb} ${keywords[0]}-focused ${rest}`;
        } else {
          const kwList = keywords.slice(0, 2).join('/');
          return `${verb} ${kwList} ${rest}`;
        }
      }

      // Fallback: add at end with "using"
      return this.appendWithPhrase(bullet, keywords, 'using');
    },

    // ============ METHODOLOGY INTEGRATION ============
    integrateWithMethodology(bullet, keywords, categorized) {
      // Find methodology keywords specifically
      const methodKeywords = keywords.filter(kw => 
        categorized.methodology.includes(kw) || 
        /agile|scrum|kanban|devops|ci\/cd/i.test(kw)
      );

      if (methodKeywords.length > 0) {
        // Pattern: "...following [methodology] principles"
        return this.appendWithPhrase(bullet, methodKeywords, 'following', ' principles');
      }

      // For non-methodology keywords, use standard integration
      return this.appendWithPhrase(bullet, keywords, 'using');
    },

    // ============ OUTCOME INTEGRATION ==========
    integrateWithOutcome(bullet, keywords) {
      // Pattern: "...achieving [metric] through [keyword]"
      // Find the metric in the bullet
      const metricMatch = bullet.match(/(\d+%|\$[\d,]+[KMB]?|\d+x)/);
      
      if (metricMatch) {
        // Insert keywords before or after metric context
        const metricIdx = bullet.indexOf(metricMatch[0]);
        const beforeMetric = bullet.slice(0, metricIdx);
        const afterMetric = bullet.slice(metricIdx);
        
        return `${beforeMetric.trimEnd()} through ${keywords.slice(0, 2).join(' and ')}, ${afterMetric}`;
      }

      // No metric found, use standard ending
      return this.appendWithPhrase(bullet, keywords, 'through');
    },

    // ============ PARENTHETICAL INTEGRATION ============
    integrateParenthetical(bullet, keywords) {
      // Safest method: add in parentheses or with comma at end
      if (bullet.endsWith('.')) {
        const core = bullet.slice(0, -1);
        return `${core} (${keywords.join(', ')}).`;
      }
      return `${bullet} (${keywords.join(', ')})`;
    },

    // ============ APPEND WITH PHRASE ============
    appendWithPhrase(bullet, keywords, phrase, suffix = '') {
      const kwList = keywords.length === 1 
        ? keywords[0] 
        : keywords.length === 2 
          ? `${keywords[0]} and ${keywords[1]}`
          : `${keywords.slice(0, -1).join(', ')}, and ${keywords[keywords.length - 1]}`;

      if (bullet.endsWith('.')) {
        return `${bullet.slice(0, -1)}, ${phrase} ${kwList}${suffix}.`;
      }
      return `${bullet}, ${phrase} ${kwList}${suffix}`;
    },

    // ============ VALIDATE ENHANCEMENT QUALITY ============
    validateEnhancement(original, enhanced) {
      const checks = {
        lengthReasonable: enhanced.length <= original.length + 80,
        keywordsNotOverstuffed: (enhanced.match(/,/g) || []).length <= 5,
        maintainsReadability: enhanced.length <= 200,
        preservesMeaning: true // Semantic check would require NLP
      };

      return Object.values(checks).every(check => check === true);
    },

    // ============ REMOVE KEYWORDS FROM SKILLS (MOVED TO EXPERIENCE) ============
    removeIntegratedKeywordsFromSkills(skills, integratedKeywords) {
      if (!skills || !integratedKeywords?.length) return skills;

      const integratedSet = new Set(integratedKeywords.map(k => k.toLowerCase()));
      
      if (Array.isArray(skills)) {
        return skills.filter(skill => !integratedSet.has(skill.toLowerCase()));
      }

      // If skills is a string
      return skills.split(',')
        .map(s => s.trim())
        .filter(s => !integratedSet.has(s.toLowerCase()))
        .join(', ');
    }
  };

  // ============ EXPORTS ============
  global.StrategicKeywordIntegration = StrategicKeywordIntegration;

})(typeof window !== 'undefined' ? window : global);
