// validation-engine.js - Score validation and reliability checking v3.2
// v3.2: Added keyword density validation, confidence levels, stricter reliability checks
(function(global) {
  'use strict';

  // ============ CONFIDENCE LEVELS ============
  const CONFIDENCE_LEVELS = {
    HIGH:   { label: 'High Confidence',   minScore: 90, minKeywords: 15, minDensity: 2.0 },
    MEDIUM: { label: 'Medium Confidence',  minScore: 80, minKeywords: 10, minDensity: 1.5 },
    LOW:    { label: 'Low Confidence',     minScore: 70, minKeywords: 5,  minDensity: 1.0 },
    UNRELIABLE: { label: 'Unreliable',     minScore: 0,  minKeywords: 0,  minDensity: 0 }
  };

  /**
   * Calculate keyword density — percentage of CV words that are job keywords
   * @param {string} cvText - The CV text
   * @param {Array} matchedKeywords - Keywords found in CV
   * @returns {number} Density as a percentage
   */
  function calculateKeywordDensity(cvText, matchedKeywords) {
    if (!cvText || !matchedKeywords || matchedKeywords.length === 0) return 0;
    const totalWords = cvText.split(/\s+/).filter(w => w.length >= 2).length;
    if (totalWords === 0) return 0;

    // Count total keyword occurrences (not just unique matches)
    let keywordOccurrences = 0;
    const cvLower = cvText.toLowerCase();
    for (const keyword of matchedKeywords) {
      const regex = new RegExp('\\b' + keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      const matches = cvLower.match(regex);
      keywordOccurrences += matches ? matches.length : 0;
    }

    return Math.round((keywordOccurrences / totalWords) * 100 * 10) / 10; // 1 decimal place
  }

  /**
   * Determine confidence level based on score, keyword count, and density
   */
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

  /**
   * Check for keyword stuffing — too many repetitions of the same keyword
   * @returns {Array} Keywords that appear suspiciously often
   */
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
   * Validate tailoring quality with comprehensive checks
   */
  function validateTailoring(cvText, jobKeywords) {
    const keywords = Array.isArray(jobKeywords) ? jobKeywords : (jobKeywords?.all || []);
    const match = global.ReliableExtractor?.matchKeywords(cvText, keywords) || { matchScore: 0, matched: [], missing: keywords };

    const score = match.matchScore || 0;
    const matched = match.matched || [];
    const missing = match.missing || [];
    const keywordCount = matched.length;

    // Calculate keyword density
    const density = calculateKeywordDensity(cvText, matched);

    // Determine confidence level
    const confidence = getConfidenceLevel(score, keywordCount, density);

    // Detect keyword stuffing
    const stuffedKeywords = detectKeywordStuffing(cvText, matched);

    // Stricter reliability: score ≥ 85 AND matched ≥ 10 AND density ≥ 1.0 AND no stuffing
    const reliable = score >= 85 &&
                     keywordCount >= 10 &&
                     density >= 1.0 &&
                     stuffedKeywords.length === 0;

    return {
      score,
      keywordCount,
      reliable,
      matched,
      missing,
      density,
      confidence,
      confidenceLabel: CONFIDENCE_LEVELS[confidence].label,
      stuffedKeywords,
      warnings: [
        ...(stuffedKeywords.length > 0 ? [`Keyword stuffing detected: ${stuffedKeywords.map(s => `"${s.keyword}" (${s.count}x)`).join(', ')}`] : []),
        ...(density > 5.0 ? ['Keyword density too high — may trigger ATS spam filters'] : []),
        ...(density < 1.0 && keywordCount > 0 ? ['Keyword density too low — keywords may not be prominent enough'] : []),
        ...(keywordCount < 5 ? ['Too few keywords matched — tailoring may be insufficient'] : []),
        ...(missing.length > matched.length ? ['More keywords missing than matched — consider adding more relevant terms'] : [])
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

  global.ValidationEngine = {
    validateTailoring,
    getScoreStatus,
    calculateKeywordDensity,
    getConfidenceLevel,
    detectKeywordStuffing,
    CONFIDENCE_LEVELS
  };
})(typeof window !== 'undefined' ? window : global);
