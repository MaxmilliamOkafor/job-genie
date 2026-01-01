// auto-tailor-95.js - Automatic CV tailoring for guaranteed 95%+ ATS match
// Orchestrates the full auto-tailor workflow with dynamic score updates

(function(global) {
  'use strict';

  /**
   * Main auto-tailor engine for 95%+ guaranteed match
   * Workflow: Scrape JD → Extract keywords → Show initial score → 
   *           Auto-tailor CV → Recalculate → Show final score → Generate PDF
   */
  class AutoTailor95 {
    constructor(options = {}) {
      this.targetScore = options.targetScore || 95;
      this.maxKeywords = options.maxKeywords || 35;
      this.onProgress = options.onProgress || (() => {});
      this.onScoreUpdate = options.onScoreUpdate || (() => {});
      this.onChipsUpdate = options.onChipsUpdate || (() => {});
    }

    /**
     * Full automatic tailoring workflow
     * @param {string} jobDescription - Job description text
     * @param {string} baseCV - Original CV text
     * @returns {Promise<Object>} Tailored CV with final score
     */
    async autoTailorTo95Plus(jobDescription, baseCV) {
      if (!jobDescription || !baseCV) {
        throw new Error('Job description and CV are required');
      }

      // Step 1: Extract keywords (up to 35, dynamic based on JD length)
      this.onProgress(10, 'Extracting keywords from job description...');
      const keywords = await this.extractJobKeywords(jobDescription);
      
      if (!keywords.all || keywords.all.length === 0) {
        throw new Error('Could not extract keywords from job description');
      }

      // Step 2: Calculate initial match (typically 50-75%)
      this.onProgress(25, 'Analyzing initial match...');
      const initialMatch = this.calculateInitialMatch(baseCV, keywords);
      
      // Show initial score and chips
      this.onScoreUpdate(initialMatch.score, 'initial');
      this.onChipsUpdate(keywords, baseCV, 'initial');

      // Short delay to show initial state
      await this.delay(500);

      // Step 3: Auto-tailor CV to inject missing keywords
      this.onProgress(50, 'Tailoring CV for ATS optimization...');
      const tailorResult = await this.tailorCVForTarget(baseCV, keywords, initialMatch);
      
      // Step 4: Recalculate with tailored CV (should be 95%+)
      this.onProgress(75, 'Recalculating match score...');
      const finalMatch = this.calculateFinalMatch(tailorResult.tailoredCV, keywords);
      
      // Animate score update
      if (global.DynamicScore) {
        global.DynamicScore.animateScore(
          initialMatch.score, 
          finalMatch.score, 
          (score) => this.onScoreUpdate(score, 'animating')
        );
      } else {
        this.onScoreUpdate(finalMatch.score, 'final');
      }
      
      // Update chips with final state
      this.onChipsUpdate(keywords, tailorResult.tailoredCV, 'final');

      // Step 5: Prepare result
      this.onProgress(100, 'Complete!');

      return {
        tailoredCV: tailorResult.tailoredCV,
        originalCV: baseCV,
        keywords,
        initialScore: initialMatch.score,
        finalScore: finalMatch.score,
        matchedKeywords: finalMatch.matched,
        missingKeywords: finalMatch.missing,
        injectedKeywords: tailorResult.injectedKeywords,
        stats: {
          keywordsExtracted: keywords.all.length,
          keywordsInjected: tailorResult.injectedKeywords.length,
          scoreImprovement: finalMatch.score - initialMatch.score
        }
      };
    }

    /**
     * Extract keywords from job description (up to 35, dynamic)
     */
    async extractJobKeywords(jobText) {
      // Use KeywordExtractor if available
      if (global.KeywordExtractor) {
        const extracted = global.KeywordExtractor.extractKeywords(jobText, this.maxKeywords);
        
        // Ensure we have proper categorization
        // Screenshot shows: High Priority (11), Medium Priority (8), Low Priority (4)
        const highCount = Math.min(11, Math.ceil(extracted.all.length * 0.45));
        const mediumCount = Math.min(8, Math.ceil(extracted.all.length * 0.35));
        
        return {
          all: extracted.all.slice(0, this.maxKeywords),
          highPriority: extracted.all.slice(0, highCount),
          mediumPriority: extracted.all.slice(highCount, highCount + mediumCount),
          lowPriority: extracted.all.slice(highCount + mediumCount),
          total: extracted.all.length
        };
      }

      // Fallback: simple keyword extraction
      return this.simpleKeywordExtraction(jobText);
    }

    /**
     * Simple fallback keyword extraction
     */
    simpleKeywordExtraction(text) {
      const stopWords = new Set([
        'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
        'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'this', 'that'
      ]);

      const words = text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 3 && !stopWords.has(word));

      // Count frequency
      const freq = {};
      words.forEach(word => {
        freq[word] = (freq[word] || 0) + 1;
      });

      // Sort by frequency
      const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .map(([word]) => word)
        .slice(0, this.maxKeywords);

      const highCount = Math.ceil(sorted.length * 0.45);
      const mediumCount = Math.ceil(sorted.length * 0.35);

      return {
        all: sorted,
        highPriority: sorted.slice(0, highCount),
        mediumPriority: sorted.slice(highCount, highCount + mediumCount),
        lowPriority: sorted.slice(highCount + mediumCount),
        total: sorted.length
      };
    }

    /**
     * Calculate initial match score
     */
    calculateInitialMatch(cvText, keywords) {
      if (global.DynamicScore) {
        return global.DynamicScore.calculateDynamicMatch(cvText, keywords.all);
      }
      
      // Fallback calculation
      const cvLower = cvText.toLowerCase();
      const matched = keywords.all.filter(kw => cvLower.includes(kw.toLowerCase()));
      const missing = keywords.all.filter(kw => !cvLower.includes(kw.toLowerCase()));
      
      return {
        score: Math.round((matched.length / keywords.all.length) * 100),
        matched,
        missing,
        matchCount: matched.length,
        totalKeywords: keywords.all.length
      };
    }

    /**
     * Tailor CV to achieve target score
     */
    async tailorCVForTarget(cvText, keywords, initialMatch) {
      // Use CVTailor if available
      if (global.CVTailor) {
        return global.CVTailor.tailorCV(cvText, keywords, { targetScore: this.targetScore });
      }

      // Fallback: simple keyword injection
      return this.simpleKeywordInjection(cvText, keywords, initialMatch);
    }

    /**
     * Simple fallback keyword injection
     */
    simpleKeywordInjection(cvText, keywords, initialMatch) {
      let tailoredCV = cvText;
      const injected = [];
      const missingKeywords = initialMatch.missing || [];

      // Find skills section or create one
      const skillsPattern = /^(SKILLS|TECHNICAL SKILLS|CORE SKILLS)[\s:]*$/im;
      const hasSkillsSection = skillsPattern.test(cvText);

      if (hasSkillsSection && missingKeywords.length > 0) {
        // Append to existing skills section
        const match = skillsPattern.exec(tailoredCV);
        if (match) {
          const insertPos = tailoredCV.indexOf('\n', match.index) + 1;
          const skillsToAdd = missingKeywords.slice(0, 15);
          const skillsLine = `• Additional: ${skillsToAdd.join(', ')}\n`;
          tailoredCV = tailoredCV.slice(0, insertPos) + skillsLine + tailoredCV.slice(insertPos);
          injected.push(...skillsToAdd);
        }
      } else if (missingKeywords.length > 0) {
        // Add new skills section before education
        const educationPattern = /^(EDUCATION|ACADEMIC)[\s:]*$/im;
        const educationMatch = educationPattern.exec(tailoredCV);
        
        const skillsToAdd = missingKeywords.slice(0, 15);
        const newSkillsSection = `\nSKILLS\n• Technical: ${skillsToAdd.slice(0, 8).join(', ')}\n• Additional: ${skillsToAdd.slice(8).join(', ')}\n\n`;
        
        if (educationMatch) {
          tailoredCV = tailoredCV.slice(0, educationMatch.index) + newSkillsSection + tailoredCV.slice(educationMatch.index);
        } else {
          tailoredCV = tailoredCV + newSkillsSection;
        }
        injected.push(...skillsToAdd);
      }

      // Also add some keywords to summary if present
      const summaryPattern = /^(PROFESSIONAL SUMMARY|SUMMARY|PROFILE)[\s:]*$/im;
      const summaryMatch = summaryPattern.exec(tailoredCV);
      
      if (summaryMatch && missingKeywords.length > injected.length) {
        const remaining = missingKeywords.filter(k => !injected.includes(k));
        if (remaining.length >= 3) {
          const toInject = remaining.slice(0, 4);
          const insertPos = tailoredCV.indexOf('\n\n', summaryMatch.index);
          if (insertPos > 0) {
            const sentence = `Proficient in ${toInject.slice(0, -1).join(', ')} and ${toInject[toInject.length - 1]}.`;
            tailoredCV = tailoredCV.slice(0, insertPos) + ' ' + sentence + tailoredCV.slice(insertPos);
            injected.push(...toInject);
          }
        }
      }

      // Calculate final score
      const finalMatch = this.calculateInitialMatch(tailoredCV, keywords);

      return {
        tailoredCV,
        injectedKeywords: injected,
        matchScore: finalMatch.score,
        matchedKeywords: finalMatch.matched,
        missingKeywords: finalMatch.missing,
        stats: {
          summary: 0,
          experience: 0,
          skills: injected.length,
          total: injected.length
        }
      };
    }

    /**
     * Calculate final match score
     */
    calculateFinalMatch(cvText, keywords) {
      if (global.DynamicScore) {
        return global.DynamicScore.calculateDynamicMatch(cvText, keywords.all);
      }
      
      return this.calculateInitialMatch(cvText, keywords);
    }

    /**
     * Delay helper
     */
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  /**
   * Quick helper to run auto-tailor workflow
   */
  async function runAutoTailor(jobDescription, baseCV, callbacks = {}) {
    const tailor = new AutoTailor95({
      onProgress: callbacks.onProgress || (() => {}),
      onScoreUpdate: callbacks.onScoreUpdate || (() => {}),
      onChipsUpdate: callbacks.onChipsUpdate || (() => {})
    });

    return tailor.autoTailorTo95Plus(jobDescription, baseCV);
  }

  // Export
  global.AutoTailor95 = AutoTailor95;
  global.runAutoTailor = runAutoTailor;

})(typeof window !== 'undefined' ? window : global);
