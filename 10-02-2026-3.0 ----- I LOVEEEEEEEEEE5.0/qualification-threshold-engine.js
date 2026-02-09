// qualification-threshold-engine.js - 75% Qualification Threshold System
// CRITICAL: Ensures CV meets the 75%+ qualification match that gets you past recruiter screening
// Features: Qualification extraction, match scoring, threshold visualization, auto-tailoring

(function(global) {
  'use strict';

  // ============ QUALIFICATION CATEGORIES ============
  const QUALIFICATION_TYPES = {
    EDUCATION: 'education',
    EXPERIENCE_YEARS: 'experience_years',
    TECHNICAL_SKILL: 'technical_skill',
    CERTIFICATION: 'certification',
    SOFT_SKILL: 'soft_skill',
    DOMAIN_KNOWLEDGE: 'domain_knowledge',
    TOOL_PROFICIENCY: 'tool_proficiency'
  };

  // ============ WEIGHT MULTIPLIERS ============
  const QUALIFICATION_WEIGHTS = {
    education: 1.2,
    experience_years: 1.5,
    technical_skill: 1.3,
    certification: 1.1,
    soft_skill: 0.8,
    domain_knowledge: 1.2,
    tool_proficiency: 1.0
  };

  // ============ SECTION DETECTION PATTERNS ============
  const SECTION_PATTERNS = {
    required: [
      /required\s*qualifications?/i,
      /minimum\s*qualifications?/i,
      /must\s*have/i,
      /requirements?/i,
      /required\s*skills?/i,
      /what\s*you[']?ll?\s*need/i,
      /essential\s*criteria/i
    ],
    preferred: [
      /preferred\s*qualifications?/i,
      /nice\s*to\s*have/i,
      /bonus/i,
      /preferred\s*skills?/i,
      /plus/i,
      /desirable/i,
      /advantageous/i
    ]
  };

  // ============ QUALIFICATION EXTRACTION PATTERNS ============
  const EXTRACTION_PATTERNS = {
    // Experience years: \"5+ years\", \"3-5 years of experience\"
    experienceYears: /(\d+)\+?\s*(?:-\s*\d+)?\s*years?\s*(?:of\s*)?(?:experience|background)/gi,
    
    // Education: \"Bachelor's degree\", \"Master's in Computer Science\"
    education: /(?:bachelor[']?s?|master[']?s?|phd|doctorate|degree)\s*(?:in\s*)?([a-z\s,]+)?/gi,
    
    // Certifications: \"AWS Certified\", \"PMP\", \"CISSP\"
    certification: /(?:certified|certification|certificate)\s*(?:in\s*)?([a-z\s]+)|(?:aws|azure|gcp|pmp|cissp|cisa|scrum|agile)\s*certif/gi,
    
    // Technical skills from common patterns
    technicalSkills: /(?:experience\s*(?:with|in)|proficiency\s*(?:with|in)|knowledge\s*of|expertise\s*in)\s*([^,.;]+)/gi
  };

  // ============ KNOWN TECHNICAL SKILLS (for matching) ============
  const KNOWN_TECH_SKILLS = new Set([
    // Programming Languages
    'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'kotlin', 'swift', 'scala', 'ruby', 'php', 'r',
    // Frameworks
    'react', 'angular', 'vue', 'node.js', 'django', 'flask', 'spring', 'express', 'fastapi', '.net',
    // Cloud
    'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'terraform', 'jenkins', 'ci/cd',
    // Databases
    'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb', 'snowflake',
    // Data/ML
    'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'spark', 'hadoop', 'kafka',
    // Other
    'agile', 'scrum', 'jira', 'git', 'graphql', 'rest api', 'microservices'
  ]);

  // ============ MAIN ENGINE CLASS ============
  const QualificationThresholdEngine = {

    // ============ EXTRACT QUALIFICATIONS FROM JD ============
    extractQualifications(jobDescription) {
      if (!jobDescription || jobDescription.length < 100) {
        return { required: [], preferred: [], combined: [], stats: {} };
      }

      const jdLower = jobDescription.toLowerCase();
      const qualifications = {
        required: [],
        preferred: [],
        combined: []
      };

      // Step 1: Identify sections
      const sections = this.identifySections(jobDescription);
      
      // Step 2: Parse each section for qualifications
      if (sections.required) {
        qualifications.required = this.parseQualificationsList(sections.required, 'required');
      }
      
      if (sections.preferred) {
        qualifications.preferred = this.parseQualificationsList(sections.preferred, 'preferred');
      }

      // Step 3: If no clear sections, parse entire JD
      if (qualifications.required.length === 0) {
        qualifications.required = this.parseQualificationsList(jobDescription, 'required');
      }

      // Step 4: Combine and deduplicate
      qualifications.combined = [...qualifications.required, ...qualifications.preferred];

      // Step 5: Generate stats
      qualifications.stats = {
        totalRequired: qualifications.required.length,
        totalPreferred: qualifications.preferred.length,
        total: qualifications.combined.length,
        byType: this.countByType(qualifications.combined)
      };

      console.log('[QualificationEngine] Extracted:', qualifications.stats);
      return qualifications;
    },

    // ============ IDENTIFY SECTIONS IN JD ============
    identifySections(text) {
      const sections = { required: '', preferred: '', other: '' };
      
      // Find section boundaries
      let requiredStart = -1, requiredEnd = -1;
      let preferredStart = -1, preferredEnd = -1;

      // Find required section
      for (const pattern of SECTION_PATTERNS.required) {
        const match = text.match(pattern);
        if (match && match.index !== undefined) {
          if (requiredStart === -1 || match.index < requiredStart) {
            requiredStart = match.index;
          }
        }
      }

      // Find preferred section
      for (const pattern of SECTION_PATTERNS.preferred) {
        const match = text.match(pattern);
        if (match && match.index !== undefined) {
          if (preferredStart === -1 || match.index < preferredStart) {
            preferredStart = match.index;
          }
        }
      }

      // Determine section boundaries
      if (requiredStart !== -1) {
        requiredEnd = preferredStart > requiredStart ? preferredStart : text.length;
        sections.required = text.slice(requiredStart, requiredEnd);
      }

      if (preferredStart !== -1) {
        sections.preferred = text.slice(preferredStart);
      }

      return sections;
    },

    // ============ PARSE QUALIFICATION LIST ============
    parseQualificationsList(text, priority = 'required') {
      const qualifications = [];
      const lines = text.split(/[\n•\-\*\d+\.)]+/).filter(line => line.trim().length > 10);

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 10 || trimmed.length > 500) continue;

        const qualification = this.parseQualificationLine(trimmed, priority);
        if (qualification) {
          qualifications.push(qualification);
        }
      }

      return qualifications;
    },

    // ============ PARSE SINGLE QUALIFICATION LINE ============
    parseQualificationLine(line, priority) {
      const lineLower = line.toLowerCase();
      
      // Determine type
      let type = QUALIFICATION_TYPES.TECHNICAL_SKILL;
      let keywords = [];

      // Check for experience years
      const expMatch = lineLower.match(/(\d+)\+?\s*(?:years?|yrs?)/);
      if (expMatch) {
        type = QUALIFICATION_TYPES.EXPERIENCE_YEARS;
        keywords.push(`${expMatch[1]}+ years`);
      }

      // Check for education
      if (/bachelor|master|phd|degree|diploma/i.test(lineLower)) {
        type = QUALIFICATION_TYPES.EDUCATION;
      }

      // Check for certification
      if (/certif|certified|cpa|pmp|cissp|aws\s*certif|azure\s*certif/i.test(lineLower)) {
        type = QUALIFICATION_TYPES.CERTIFICATION;
      }

      // Check for soft skills (expanded detection)
      if (/communication|teamwork|leadership|collaborate|mentor|interpersonal|stakeholder|problem.?solving|critical.?thinking|adaptability|flexibility|empathy|prioriti[sz]ation|time.?management|conflict.?resolution|creative.?thinking|decision.?making|initiative|roadmap|negotiation|coaching|facilitation|delegation|accountability|strategic.?thinking|relationship.?building|change.?management|continuous.?improvement|analytical|attention.?to.?detail|cross.?functional|presentation|active.?listening|emotional.?intelligence|risk.?management|process.?improvement|customer.?focus|client.?management|vendor.?management|resource.?management|budget.?management|incident.?management|quality.?assurance|requirements.?gathering|user.?research|design.?thinking|data.?driven/i.test(lineLower)) {
        type = QUALIFICATION_TYPES.SOFT_SKILL;
      }

      // Extract keywords from line
      keywords = [...keywords, ...this.extractKeywordsFromLine(line)];

      if (keywords.length === 0) {
        // Fallback: use significant words from line
        keywords = lineLower.split(/\s+/)
          .filter(w => w.length > 4 && !/^(with|have|and|the|for|from|that|this|will|your|must|should)$/i.test(w))
          .slice(0, 5);
      }

      return {
        text: line.trim(),
        type,
        priority,
        weight: QUALIFICATION_WEIGHTS[type] || 1.0,
        keywords: [...new Set(keywords)]
      };
    },

    // ============ EXTRACT KEYWORDS FROM LINE ============
    extractKeywordsFromLine(line) {
      const keywords = [];
      const lineLower = line.toLowerCase();

      // Check for known tech skills
      for (const skill of KNOWN_TECH_SKILLS) {
        if (lineLower.includes(skill)) {
          keywords.push(skill);
        }
      }

      // Extract phrases after common patterns
      const patternMatches = [
        ...lineLower.matchAll(/(?:experience\s*(?:with|in)|proficiency\s*in|knowledge\s*of)\s*([^,.;]+)/gi),
        ...lineLower.matchAll(/(?:strong|solid|proven)\s*([^,.;]+)/gi)
      ];

      for (const match of patternMatches) {
        if (match[1]) {
          keywords.push(match[1].trim());
        }
      }

      return keywords;
    },

    // ============ COUNT QUALIFICATIONS BY TYPE ============
    countByType(qualifications) {
      const counts = {};
      for (const qual of qualifications) {
        counts[qual.type] = (counts[qual.type] || 0) + 1;
      }
      return counts;
    },

    // ============ CALCULATE QUALIFICATION MATCH ============
    calculateQualificationMatch(cv, qualifications) {
      if (!cv || !qualifications?.required?.length) {
        return {
          requiredMatch: 0,
          preferredMatch: 0,
          overallMatch: 0,
          requiredMetCount: 0,
          requiredTotalCount: 0,
          preferredMetCount: 0,
          preferredTotalCount: 0,
          qualificationBreakdown: [],
          meetsThreshold: false,
          thresholdMessage: ''
        };
      }

      const cvText = typeof cv === 'string' ? cv : this.stringifyCVContent(cv);
      const cvLower = cvText.toLowerCase();

      const results = {
        requiredMatch: 0,
        preferredMatch: 0,
        overallMatch: 0,
        requiredMetCount: 0,
        requiredTotalCount: qualifications.required.length,
        preferredMetCount: 0,
        preferredTotalCount: qualifications.preferred?.length || 0,
        qualificationBreakdown: [],
        weightedScore: 0,
        maxWeightedScore: 0
      };

      // Check each required qualification
      for (const qual of qualifications.required) {
        const match = this.checkQualificationMatch(cvLower, qual);
        results.qualificationBreakdown.push({
          qualification: qual.text,
          type: 'required',
          qualType: qual.type,
          met: match.met,
          confidence: match.confidence,
          evidence: match.evidence,
          keywords: qual.keywords
        });

        results.maxWeightedScore += qual.weight;
        if (match.met) {
          results.requiredMetCount++;
          results.weightedScore += qual.weight * match.confidence;
        }
      }

      // Check each preferred qualification
      for (const qual of (qualifications.preferred || [])) {
        const match = this.checkQualificationMatch(cvLower, qual);
        results.qualificationBreakdown.push({
          qualification: qual.text,
          type: 'preferred',
          qualType: qual.type,
          met: match.met,
          confidence: match.confidence,
          evidence: match.evidence,
          keywords: qual.keywords
        });

        if (match.met) {
          results.preferredMetCount++;
        }
      }

      // Calculate percentages
      results.requiredMatch = results.requiredTotalCount > 0 
        ? Math.round((results.requiredMetCount / results.requiredTotalCount) * 100) 
        : 0;
      
      results.preferredMatch = results.preferredTotalCount > 0 
        ? Math.round((results.preferredMetCount / results.preferredTotalCount) * 100) 
        : 0;

      // Overall match (weighted: required = 70%, preferred = 30%)
      results.overallMatch = Math.round(
        (results.requiredMatch * 0.7) + (results.preferredMatch * 0.3)
      );

      // Determine threshold status
      results.meetsThreshold = results.requiredMatch >= 75;
      results.thresholdMessage = this.getThresholdMessage(results.requiredMatch);
      results.thresholdStatus = this.getThresholdStatus(results.requiredMatch);

      return results;
    },

    // ============ CHECK SINGLE QUALIFICATION MATCH ============
    checkQualificationMatch(cvLower, qualification) {
      let matchedKeywords = 0;
      let totalKeywords = qualification.keywords.length;
      let evidence = [];

      for (const keyword of qualification.keywords) {
        const kwLower = keyword.toLowerCase();
        if (cvLower.includes(kwLower)) {
          matchedKeywords++;
          // Find evidence (context around keyword)
          const idx = cvLower.indexOf(kwLower);
          if (idx !== -1) {
            const start = Math.max(0, idx - 30);
            const end = Math.min(cvLower.length, idx + kwLower.length + 30);
            evidence.push(`...${cvLower.slice(start, end)}...`);
          }
        }
      }

      // Also check for semantic matches in qualification text
      const qualWords = qualification.text.toLowerCase().split(/\s+/)
        .filter(w => w.length > 4)
        .slice(0, 8);
      
      let semanticMatches = 0;
      for (const word of qualWords) {
        if (cvLower.includes(word)) {
          semanticMatches++;
        }
      }

      const keywordRatio = totalKeywords > 0 ? matchedKeywords / totalKeywords : 0;
      const semanticRatio = qualWords.length > 0 ? semanticMatches / qualWords.length : 0;
      
      const confidence = Math.max(keywordRatio, semanticRatio * 0.8);
      const met = confidence >= 0.5;

      return {
        met,
        confidence: Math.round(confidence * 100) / 100,
        evidence: evidence.slice(0, 2),
        matchedKeywords,
        totalKeywords
      };
    },

    // ============ STRINGIFY CV CONTENT ============
    stringifyCVContent(cv) {
      if (typeof cv === 'string') return cv;
      
      const parts = [];
      
      if (cv.summary) parts.push(cv.summary);
      
      if (cv.experience) {
        for (const exp of cv.experience) {
          parts.push(exp.company || '');
          parts.push(exp.title || '');
          if (exp.bullets) parts.push(exp.bullets.join(' '));
        }
      }
      
      if (cv.skills) {
        parts.push(Array.isArray(cv.skills) ? cv.skills.join(' ') : cv.skills);
      }
      
      if (cv.education) {
        for (const edu of cv.education) {
          parts.push(edu.institution || '');
          parts.push(edu.degree || '');
        }
      }
      
      if (cv.certifications) {
        parts.push(Array.isArray(cv.certifications) ? cv.certifications.join(' ') : cv.certifications);
      }

      return parts.join(' ');
    },

    // ============ GET THRESHOLD MESSAGE ============
    getThresholdMessage(score) {
      if (score >= 85) {
        return "🎯 Excellent match! Your CV strongly aligns with this role. High interview probability.";
      } else if (score >= 75) {
        return "✅ Good match! You meet the 75% threshold. Consider strengthening weak areas.";
      } else if (score >= 60) {
        return "⚠️ Close! You're just below the 75% threshold. Apply the recommended tailoring.";
      } else {
        return "❌ Significant gap. Substantial CV tailoring needed for this role.";
      }
    },

    // ============ GET THRESHOLD STATUS ============
    getThresholdStatus(score) {
      if (score >= 85) return 'excellent';
      if (score >= 75) return 'good';
      if (score >= 60) return 'close';
      return 'low';
    },

    // ============ GENERATE TAILORING RECOMMENDATIONS ============
    generateRecommendations(matchResults, cv, qualifications) {
      const recommendations = [];

      // Filter unmet qualifications
      const unmetRequired = matchResults.qualificationBreakdown
        .filter(q => q.type === 'required' && !q.met)
        .sort((a, b) => b.confidence - a.confidence);

      const weakMatches = matchResults.qualificationBreakdown
        .filter(q => q.met && q.confidence < 0.75);

      // Priority 1: Critical - Unmet required qualifications
      for (const qual of unmetRequired) {
        recommendations.push({
          priority: 'CRITICAL',
          type: qual.qualType,
          qualification: qual.qualification,
          keywords: qual.keywords,
          action: `Add experience with ${qual.keywords.slice(0, 3).join(', ')} to work experience bullets`,
          impact: this.calculateImpact(qual, matchResults)
        });
      }

      // Priority 2: High - Weak matches
      for (const qual of weakMatches) {
        recommendations.push({
          priority: 'HIGH',
          type: qual.qualType,
          qualification: qual.qualification,
          keywords: qual.keywords,
          action: `Strengthen evidence of ${qual.keywords.slice(0, 2).join(', ')} in CV`,
          impact: this.calculateImpact(qual, matchResults)
        });
      }

      // Priority 3: Medium - Unmet preferred (only if above 75% required)
      if (matchResults.requiredMatch >= 75) {
        const unmetPreferred = matchResults.qualificationBreakdown
          .filter(q => q.type === 'preferred' && !q.met)
          .slice(0, 3);

        for (const qual of unmetPreferred) {
          recommendations.push({
            priority: 'MEDIUM',
            type: qual.qualType,
            qualification: qual.qualification,
            keywords: qual.keywords,
            action: `Consider adding ${qual.keywords.slice(0, 2).join(', ')} for competitive advantage`,
            impact: this.calculateImpact(qual, matchResults)
          });
        }
      }

      return recommendations;
    },

    // ============ CALCULATE RECOMMENDATION IMPACT ============
    calculateImpact(qualification, matchResults) {
      if (matchResults.requiredTotalCount === 0) return 0;
      
      const weight = QUALIFICATION_WEIGHTS[qualification.qualType] || 1.0;
      const impactPerQual = 100 / matchResults.requiredTotalCount;
      
      return Math.round(impactPerQual * weight);
    },

    // ============ FORMAT DASHBOARD DATA ============
    formatDashboard(matchResults) {
      return {
        summary: {
          requiredMatch: `${matchResults.requiredMatch}%`,
          preferredMatch: `${matchResults.preferredMatch}%`,
          overallMatch: `${matchResults.overallMatch}%`,
          status: matchResults.thresholdStatus,
          meetsThreshold: matchResults.meetsThreshold,
          requiredMet: `${matchResults.requiredMetCount}/${matchResults.requiredTotalCount}`,
          preferredMet: `${matchResults.preferredMetCount}/${matchResults.preferredTotalCount}`
        },
        thresholdIndicator: {
          below75: matchResults.requiredMatch < 75,
          between75and85: matchResults.requiredMatch >= 75 && matchResults.requiredMatch < 85,
          above85: matchResults.requiredMatch >= 85,
          message: matchResults.thresholdMessage,
          color: this.getStatusColor(matchResults.thresholdStatus)
        },
        breakdown: matchResults.qualificationBreakdown.map(q => ({
          qualification: q.qualification.substring(0, 80) + (q.qualification.length > 80 ? '...' : ''),
          type: q.type,
          qualType: q.qualType,
          status: q.met ? '✅ Met' : '❌ Not Met',
          confidence: `${Math.round(q.confidence * 100)}%`,
          evidence: q.evidence?.[0] || 'Not found in CV',
          keywords: q.keywords?.slice(0, 5) || []
        }))
      };
    },

    // ============ GET STATUS COLOR ============
    getStatusColor(status) {
      const colors = {
        excellent: '#22c55e', // green
        good: '#84cc16',      // lime
        close: '#f59e0b',     // amber
        low: '#ef4444'        // red
      };
      return colors[status] || '#6b7280';
    }
  };

    // ============ AUTO-TAILOR CV TO REACH 75% THRESHOLD ============
    // Analyses unmet qualifications and generates keyword injection plan
    autoTailorForThreshold(cvText, jobDescription, options = {}) {
      const targetThreshold = options.threshold || 75;

      // Step 1: Extract qualifications
      const qualifications = this.extractQualifications(jobDescription);

      // Step 2: Calculate initial match
      const initialMatch = this.calculateQualificationMatch(cvText, qualifications);

      console.log(`[QualificationEngine] Initial required match: ${initialMatch.requiredMatch}% (target: ${targetThreshold}%)`);

      if (initialMatch.requiredMatch >= targetThreshold) {
        return {
          needsTailoring: false,
          initialScore: initialMatch.requiredMatch,
          finalScore: initialMatch.requiredMatch,
          matchResults: initialMatch,
          dashboard: this.formatDashboard(initialMatch),
          recommendations: [],
          keywordsToInject: []
        };
      }

      // Step 3: Generate recommendations
      const recommendations = this.generateRecommendations(initialMatch, cvText, qualifications);

      // Step 4: Extract keywords needed to close the gap
      const keywordsToInject = [];
      const unmetQuals = initialMatch.qualificationBreakdown
        .filter(q => !q.met)
        .sort((a, b) => {
          // Critical/required first, then by confidence (closest to meeting first)
          if (a.type !== b.type) return a.type === 'required' ? -1 : 1;
          return b.confidence - a.confidence;
        });

      for (const qual of unmetQuals) {
        if (qual.keywords?.length) {
          keywordsToInject.push(...qual.keywords.filter(kw =>
            !keywordsToInject.some(existing => existing.toLowerCase() === kw.toLowerCase())
          ));
        }
      }

      // Step 5: Categorise keywords for intelligent placement
      const categorised = {
        forExperience: [],  // Technical + soft skills -> work experience bullets
        forSummary: [],     // High-impact keywords -> professional summary
        forSkills: []       // Technical keywords -> skills section
      };

      const softSkillPatterns = /communication|collaboration|leadership|teamwork|mentoring|problem.?solving|critical.?thinking|adaptability|stakeholder|cross.?functional|empathy|prioriti|time.?management|conflict|creative|decision|initiative|negotiation|coaching|facilitation|delegation|strategic|relationship|change.?management|continuous.?improvement|analytical|attention.?to.?detail|presentation|design.?thinking|data.?driven|requirements.?gathering|process.?improvement|customer.?focus|client.?management|vendor.?management|resource.?management|budget.?management|quality.?assurance|incident.?management|knowledge.?sharing|risk.?management/i;

      for (const kw of keywordsToInject) {
        if (softSkillPatterns.test(kw)) {
          categorised.forExperience.push(kw);
        } else {
          // Technical keywords go to both experience and skills
          categorised.forExperience.push(kw);
          categorised.forSkills.push(kw);
        }
      }

      // Top 3 high-impact keywords go in summary
      categorised.forSummary = keywordsToInject.filter(kw => !softSkillPatterns.test(kw)).slice(0, 3);

      console.log('[QualificationEngine] Auto-tailor plan:', {
        unmetCount: unmetQuals.length,
        keywordsToInject: keywordsToInject.length,
        forExperience: categorised.forExperience.length,
        forSummary: categorised.forSummary.length,
        forSkills: categorised.forSkills.length
      });

      return {
        needsTailoring: true,
        initialScore: initialMatch.requiredMatch,
        targetScore: targetThreshold,
        gap: targetThreshold - initialMatch.requiredMatch,
        matchResults: initialMatch,
        dashboard: this.formatDashboard(initialMatch),
        recommendations,
        keywordsToInject,
        categorised,
        qualifications
      };
    }
  };

  // ============ EXPORTS ============
  global.QualificationThresholdEngine = QualificationThresholdEngine;

})(typeof window !== 'undefined' ? window : global);
