// content-quality-engine.js - Anti-AI Detection & Content Quality v1.0
// Features: UK spelling enforcement, banned words filtering, em dash removal, sentence variation
// Ensures authentic, human-written content that avoids AI detection patterns

(function(global) {
  'use strict';

  // ============ BANNED WORDS & PHRASES (AI Detection Flags) ============
  const BANNED_WORDS = [
    'orchestrated', 'championed', 'pioneered', 'helmed', 'realm',
    'comprehensive', 'demonstrating', 'showcasing', 'spearheaded',
    'meticulous', 'approximately', 'highly motivated', 'dynamic',
    'synergy', 'cutting-edge', 'best-in-class', 'world-class',
    'results-driven', 'detail-oriented', 'team player', 'go-getter',
    'various', 'assisted', 'leverage', 'leveraging', 'leveraged',
    'utilize', 'utilizing', 'utilized', 'utilising', 'utilised'
  ];

  const BANNED_PHRASES = [
    'proven ability', 'proven track record', 'proven record',
    'the intersection of', 'drive impactful outcomes',
    'strategic initiatives', 'stakeholder environments',
    'think outside the box', 'deep dive', 'low-hanging fruit',
    'move the needle', 'circle back', 'touch base',
    'game-changer', 'paradigm shift', 'best practices',
    'core competencies', 'value proposition', 'actionable insights',
    'bandwidth', 'synergize', 'holistic approach',
    'robust solution', 'seamless integration', 'end-to-end',
    'state-of-the-art', 'next-generation', 'mission-critical',
    'thought leadership', 'disruptive innovation'
  ];

  // ============ AI DETECTION PHRASE PATTERNS ============
  const AI_PHRASE_PATTERNS = [
    /resulting in/gi,
    /leading to/gi,
    /which led to/gi,
    /thereby/gi,
    /thus enabling/gi,
    /in order to/gi,
    /with a focus on/gi,
    /in alignment with/gi,
    /in conjunction with/gi,
    /in tandem with/gi
  ];

  // ============ REPLACEMENT MAPPINGS ============
  const WORD_REPLACEMENTS = {
    // Banned words to approved alternatives
    'orchestrated': 'directed',
    'championed': 'led',
    'pioneered': 'established',
    'helmed': 'led',
    'realm': 'field',
    'comprehensive': 'thorough',
    'demonstrating': 'showing',
    'showcasing': 'presenting',
    'spearheaded': 'led',
    'meticulous': 'detailed',
    'approximately': '', // Remove and use specific numbers with +
    'highly motivated': 'driven',
    'dynamic': 'adaptable',
    'synergy': 'collaboration',
    'cutting-edge': 'modern',
    'best-in-class': 'leading',
    'world-class': 'excellent',
    'results-driven': 'focused',
    'detail-oriented': 'precise',
    'team player': 'collaborative',
    'go-getter': 'proactive',
    'various': 'multiple',
    'assisted': 'supported',
    'leverage': 'use',
    'leveraging': 'using',
    'leveraged': 'used',
    'utilize': 'use',
    'utilizing': 'using',
    'utilized': 'used',
    'utilising': 'using',
    'utilised': 'used'
  };

  const PHRASE_REPLACEMENTS = {
    'proven ability': 'strong ability',
    'proven track record': 'track record',
    'proven record': 'record',
    'the intersection of': 'across',
    'drive impactful outcomes': 'deliver results',
    'strategic initiatives': 'key projects',
    'stakeholder environments': 'business contexts',
    'think outside the box': 'approach problems creatively',
    'resulting in': 'achieving',
    'leading to': 'producing',
    'which led to': ', achieving',
    'thereby': ', which',
    'thus enabling': ', enabling',
    'in order to': 'to'
  };

  // ============ US TO UK SPELLING CONVERSIONS ============
  const US_TO_UK_SPELLING = {
    // -ize to -ise
    'optimize': 'optimise', 'optimized': 'optimised', 'optimizing': 'optimising', 'optimization': 'optimisation',
    'organize': 'organise', 'organized': 'organised', 'organizing': 'organising', 'organization': 'organisation',
    'analyze': 'analyse', 'analyzed': 'analysed', 'analyzing': 'analysing', 'analysis': 'analysis',
    'realize': 'realise', 'realized': 'realised', 'realizing': 'realising', 'realization': 'realisation',
    'specialize': 'specialise', 'specialized': 'specialised', 'specializing': 'specialising', 'specialization': 'specialisation',
    'recognize': 'recognise', 'recognized': 'recognised', 'recognizing': 'recognising', 'recognition': 'recognition',
    'prioritize': 'prioritise', 'prioritized': 'prioritised', 'prioritizing': 'prioritising', 'prioritization': 'prioritisation',
    'standardize': 'standardise', 'standardized': 'standardised', 'standardizing': 'standardising', 'standardization': 'standardisation',
    'customize': 'customise', 'customized': 'customised', 'customizing': 'customising', 'customization': 'customisation',
    'minimize': 'minimise', 'minimized': 'minimised', 'minimizing': 'minimising', 'minimization': 'minimisation',
    'maximize': 'maximise', 'maximized': 'maximised', 'maximizing': 'maximising', 'maximization': 'maximisation',
    'centralize': 'centralise', 'centralized': 'centralised', 'centralizing': 'centralising', 'centralization': 'centralisation',
    'modernize': 'modernise', 'modernized': 'modernised', 'modernizing': 'modernising', 'modernization': 'modernisation',
    'authorize': 'authorise', 'authorized': 'authorised', 'authorizing': 'authorising', 'authorization': 'authorisation',
    'visualize': 'visualise', 'visualized': 'visualised', 'visualizing': 'visualising', 'visualization': 'visualisation',
    'finalize': 'finalise', 'finalized': 'finalised', 'finalizing': 'finalising', 'finalization': 'finalisation',
    'digitize': 'digitise', 'digitized': 'digitised', 'digitizing': 'digitising', 'digitization': 'digitisation',
    'harmonize': 'harmonise', 'harmonized': 'harmonised', 'harmonizing': 'harmonising', 'harmonization': 'harmonisation',
    'monetize': 'monetise', 'monetized': 'monetised', 'monetizing': 'monetising', 'monetization': 'monetisation',
    'itemize': 'itemise', 'itemized': 'itemised', 'itemizing': 'itemising',
    'summarize': 'summarise', 'summarized': 'summarised', 'summarizing': 'summarising',
    'emphasize': 'emphasise', 'emphasized': 'emphasised', 'emphasizing': 'emphasising',
    'categorize': 'categorise', 'categorized': 'categorised', 'categorizing': 'categorising',
    'synchronize': 'synchronise', 'synchronized': 'synchronised', 'synchronizing': 'synchronising',
    'utilize': 'use', 'utilized': 'used', 'utilizing': 'using', 'utilization': 'usage',
    
    // -or to -our
    'color': 'colour', 'colors': 'colours', 'colored': 'coloured', 'coloring': 'colouring',
    'favor': 'favour', 'favors': 'favours', 'favored': 'favoured', 'favoring': 'favouring', 'favorite': 'favourite',
    'labor': 'labour', 'labors': 'labours', 'labored': 'laboured', 'laboring': 'labouring',
    'neighbor': 'neighbour', 'neighbors': 'neighbours', 'neighboring': 'neighbouring',
    'honor': 'honour', 'honors': 'honours', 'honored': 'honoured', 'honoring': 'honouring',
    'humor': 'humour', 'humors': 'humours',
    'behavior': 'behaviour', 'behaviors': 'behaviours', 'behavioral': 'behavioural',
    'endeavor': 'endeavour', 'endeavors': 'endeavours', 'endeavored': 'endeavoured',
    'harbor': 'harbour', 'harbors': 'harbours',
    'flavor': 'flavour', 'flavors': 'flavours', 'flavored': 'flavoured',
    
    // -er to -re
    'center': 'centre', 'centers': 'centres', 'centered': 'centred', 'centering': 'centring',
    'meter': 'metre', 'meters': 'metres',
    'liter': 'litre', 'liters': 'litres',
    'fiber': 'fibre', 'fibers': 'fibres',
    'theater': 'theatre', 'theaters': 'theatres',
    
    // -log to -logue
    'analog': 'analogue', 'analogs': 'analogues',
    'catalog': 'catalogue', 'catalogs': 'catalogues', 'cataloged': 'catalogued',
    'dialog': 'dialogue', 'dialogs': 'dialogues',
    
    // -ense to -ence
    'defense': 'defence', 'defenses': 'defences',
    'offense': 'offence', 'offenses': 'offences',
    'license': 'licence', 'licenses': 'licences',
    
    // -l to -ll (past tense)
    'traveled': 'travelled', 'traveling': 'travelling', 'traveler': 'traveller',
    'modeled': 'modelled', 'modeling': 'modelling',
    'canceled': 'cancelled', 'canceling': 'cancelling',
    'labeled': 'labelled', 'labeling': 'labelling',
    'leveled': 'levelled', 'leveling': 'levelling',
    'fueled': 'fuelled', 'fueling': 'fuelling',
    'signaled': 'signalled', 'signaling': 'signalling',
    
    // Other common differences
    'program': 'programme', 'programs': 'programmes', 'programed': 'programmed', 'programing': 'programming',
    'gray': 'grey', 'grays': 'greys',
    'acknowledgment': 'acknowledgement', 'acknowledgments': 'acknowledgements',
    'judgment': 'judgement', 'judgments': 'judgements',
    'fulfill': 'fulfil', 'fulfills': 'fulfils', 'fulfilled': 'fulfilled', 'fulfilling': 'fulfilling',
    'skillful': 'skilful',
    'enrollment': 'enrolment', 'enrollments': 'enrolments',
    'installment': 'instalment', 'installments': 'instalments',
    'aging': 'ageing',
    'artifact': 'artefact', 'artifacts': 'artefacts',
    'esthetic': 'aesthetic', 'esthetics': 'aesthetics',
    'aluminum': 'aluminium',
    'skeptic': 'sceptic', 'skeptical': 'sceptical', 'skepticism': 'scepticism',
    'check': 'cheque', // Only for bank cheques - handle carefully
    'maneuver': 'manoeuvre', 'maneuvered': 'manoeuvred', 'maneuvering': 'manoeuvring',
    'draft': 'draught', // Only for certain contexts
    'plow': 'plough', 'plowed': 'ploughed', 'plowing': 'ploughing',
    'curb': 'kerb', // Only for road context
    'tire': 'tyre', 'tires': 'tyres', // Only for wheels
    'inquire': 'enquire', 'inquired': 'enquired', 'inquiring': 'enquiring', 'inquiry': 'enquiry',
  };

  // ============ CONTENT QUALITY ENGINE ============
  const ContentQualityEngine = {

    // ============ MAIN SANITISATION FUNCTION ============
    sanitiseContent(text, options = {}) {
      if (!text || typeof text !== 'string') return text;

      const {
        convertToUK = true,
        removeBannedWords = true,
        removeEmDashes = true,
        fixPunctuation = true,
        removePronouns = true
      } = options;

      let result = text;

      // Step 1: Convert US to UK spelling
      if (convertToUK) {
        result = this.convertToUKSpelling(result);
      }

      // Step 2: Remove banned words and phrases
      if (removeBannedWords) {
        result = this.removeBannedContent(result);
      }

      // Step 3: Remove em dashes
      if (removeEmDashes) {
        result = this.removeEmDashes(result);
      }

      // Step 4: Fix punctuation issues
      if (fixPunctuation) {
        result = this.fixPunctuation(result);
      }

      // Step 5: Remove personal pronouns (I, my, me, we, our)
      if (removePronouns) {
        result = this.removePronouns(result);
      }

      // Final cleanup
      result = this.finalCleanup(result);

      return result;
    },

    // ============ CV/ATS BLOCK SANITISATION (Preserve line layout) ============
    // For multi-line CV blocks we avoid adding sentence-ending punctuation per line.
    sanitiseCVBlock(text) {
      return this.sanitiseContent(text, {
        convertToUK: true,
        removeBannedWords: true,
        removeEmDashes: true,
        fixPunctuation: false,
        removePronouns: true
      });
    },

    // ============ FLEXIBLE PHRASE REGEX (handles whitespace/newlines) ============
    makeFlexiblePhraseRegex(phrase) {
      const escaped = String(phrase)
        .trim()
        .split(/\s+/)
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');
      return new RegExp(`\\b${escaped}\\b`, 'gi');
    },

    // ============ SENTENCE STRUCTURE VARIATION (Bullet Verb Repetition) ============
    detectBulletVerbRepetition(bullets) {
      const warnings = [];
      if (!Array.isArray(bullets) || bullets.length < 3) return { warnings, counts: {} };

      const counts = {};
      const normalise = (b) => String(b || '')
        .replace(/^[•\-\*▪▸]+\s*/, '')
        .trim();

      for (const b of bullets) {
        const text = normalise(b);
        const firstWord = (text.match(/^([A-Za-z]+)/) || [])[1];
        if (!firstWord) continue;
        const key = firstWord.toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }

      const repeats = Object.entries(counts)
        .filter(([_, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1]);

      repeats.forEach(([verb, n]) => {
        warnings.push(`Multiple bullets start with "${verb}" (${n}x). Consider varying openings.`);
      });

      return { warnings, counts };
    },

    // Extract bullets from a CV text block and run verb repetition detection.
    detectBulletVerbRepetitionFromCV(cvText) {
      const bullets = String(cvText || '')
        .split(/\n/)
        .map(l => l.trim())
        .filter(l => /^[-•*▪▸]\s+/.test(l))
        .map(l => l.replace(/^[-•*▪▸]\s+/, '').trim());

      return this.detectBulletVerbRepetition(bullets);
    },

    // ============ CONVERT US TO UK SPELLING ============
    convertToUKSpelling(text) {
      if (!text) return text;
      
      let result = text;
      
      // Sort by length (longest first) to avoid partial replacements
      const sortedWords = Object.keys(US_TO_UK_SPELLING).sort((a, b) => b.length - a.length);
      
      for (const usWord of sortedWords) {
        const ukWord = US_TO_UK_SPELLING[usWord];
        
        // Create word-boundary regex for case-insensitive replacement
        const regex = new RegExp(`\\b${usWord}\\b`, 'gi');
        
        result = result.replace(regex, (match) => {
          // Preserve original case
          if (match === match.toUpperCase()) {
            return ukWord.toUpperCase();
          }
          if (match[0] === match[0].toUpperCase()) {
            return ukWord.charAt(0).toUpperCase() + ukWord.slice(1);
          }
          return ukWord;
        });
      }
      
      return result;
    },

    // ============ REMOVE BANNED WORDS AND PHRASES ============
    removeBannedContent(text) {
      if (!text) return text;
      
      let result = text;
      
       // Replace banned phrases first (longer matches)
       // CRITICAL: Use flexible whitespace matching so it still catches "Proven\ntrack record" etc.
       for (const phrase of BANNED_PHRASES) {
         const regex = this.makeFlexiblePhraseRegex(phrase);
         const replacement = PHRASE_REPLACEMENTS[phrase.toLowerCase()] || '';
         result = result.replace(regex, replacement);
       }
      
      // Replace banned words
      for (const word of BANNED_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const replacement = WORD_REPLACEMENTS[word.toLowerCase()] || '';
        result = result.replace(regex, replacement);
      }
      
      // Replace AI detection patterns
      for (const pattern of AI_PHRASE_PATTERNS) {
        const replacement = PHRASE_REPLACEMENTS[pattern.source.replace(/\//g, '').toLowerCase()] || '';
        result = result.replace(pattern, replacement || ', ');
      }
      
      return result;
    },

    // ============ REMOVE EM DASHES ============
    removeEmDashes(text) {
      if (!text) return text;
      
      return text
        // Replace em dash (—) with comma or full stop
        .replace(/\s*—\s*/g, '. ')
        // Replace en dash (–) with hyphen where appropriate
        .replace(/\s*–\s*/g, ' - ')
        // Clean up double punctuation
        .replace(/\.\s*\./g, '.')
        .replace(/,\s*,/g, ',')
        .replace(/\.\s*,/g, '.')
        .replace(/,\s*\./g, '.');
    },

    // ============ FIX PUNCTUATION ============
    fixPunctuation(text) {
      if (!text) return text;
      
      return text
        // Remove excessive commas
        .replace(/,(\s*,)+/g, ',')
        // Fix comma spacing
        .replace(/\s+,/g, ',')
        .replace(/,(?!\s)/g, ', ')
        // Fix period spacing
        .replace(/\s+\./g, '.')
        .replace(/\.(?!\s|$|\d)/g, '. ')
        // Remove trailing punctuation from bullets
        .replace(/[,;]\s*$/gm, '')
        // Ensure sentences end with period
        .replace(/([a-z])\s*$/gm, '$1.')
        // Clean up multiple spaces
        .replace(/\s{2,}/g, ' ');
    },

    // ============ REMOVE PERSONAL PRONOUNS ============
    removePronouns(text) {
      if (!text) return text;
      
      return text
        // Remove "I " at start of sentences
        .replace(/\bI\s+/g, '')
        // Remove "my " 
        .replace(/\bmy\s+/g, '')
        // Remove "me " where it makes sense
        .replace(/\b(to|with|for)\s+me\b/gi, '')
        // Remove "we " at start
        .replace(/\bWe\s+/g, '')
        .replace(/\bwe\s+/g, '')
        // Remove "our "
        .replace(/\bour\s+/g, '')
        // Clean up leftover issues
        .replace(/\s{2,}/g, ' ')
        .trim();
    },

    // ============ FINAL CLEANUP ============
    finalCleanup(text) {
      if (!text) return text;
      
      return text
        // Remove double spaces
        .replace(/\s{2,}/g, ' ')
        // Remove empty lines
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Fix capitalisation after periods
        .replace(/\.\s+([a-z])/g, (match, letter) => `. ${letter.toUpperCase()}`)
        // Clean up bullet points
        .replace(/^[-•*]\s*/gm, '• ')
        // Trim whitespace
        .trim();
    },

    // ============ SANITISE CV BULLET POINTS ============
    sanitiseBullets(bullets) {
      if (!bullets || !Array.isArray(bullets)) return bullets;
      
      return bullets.map(bullet => {
        let sanitised = this.sanitiseContent(bullet, {
          convertToUK: true,
          removeBannedWords: true,
          removeEmDashes: true,
          fixPunctuation: true,
          removePronouns: true
        });
        
        // Ensure bullet starts with action verb (capitalised)
        sanitised = sanitised.replace(/^[•\-*\s]+/, '').trim();
        if (sanitised.length > 0) {
          sanitised = sanitised.charAt(0).toUpperCase() + sanitised.slice(1);
        }
        
        // Remove trailing period from bullets
        sanitised = sanitised.replace(/\.\s*$/, '');
        
        return sanitised;
      }).filter(b => b && b.length > 10); // Remove too-short bullets
    },

    // ============ SANITISE SUMMARY ============
    sanitiseSummary(summary) {
      if (!summary) return summary;
      
      let result = this.sanitiseContent(summary, {
        convertToUK: true,
        removeBannedWords: true,
        removeEmDashes: true,
        fixPunctuation: true,
        removePronouns: true
      });
      
      // Ensure summary doesn't start with "I am" or similar
      result = result
        .replace(/^(I am|I'm|I have been)\s+/gi, '')
        .replace(/^(A|An)\s+(highly motivated|results-driven|detail-oriented|dynamic)\s+/gi, '');
      
      // Capitalise first letter
      if (result.length > 0) {
        result = result.charAt(0).toUpperCase() + result.slice(1);
      }
      
      return result;
    },

    // ============ VALIDATE CONTENT QUALITY ============
    validateContent(text) {
      if (!text) return { valid: true, issues: [] };
      
      const issues = [];
      const textLower = text.toLowerCase();
      
      // Check for banned words
      for (const word of BANNED_WORDS) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
          issues.push(`Contains banned word: "${word}"`);
        }
      }
      
      // Check for banned phrases
      for (const phrase of BANNED_PHRASES) {
        if (textLower.includes(phrase.toLowerCase())) {
          issues.push(`Contains banned phrase: "${phrase}"`);
        }
      }
      
      // Check for em dashes
      if (text.includes('—')) {
        issues.push('Contains em dash (—) - replace with full stop or comma');
      }
      
      // Check for US spelling
      for (const usWord of Object.keys(US_TO_UK_SPELLING)) {
        if (new RegExp(`\\b${usWord}\\b`, 'i').test(text)) {
          issues.push(`Contains US spelling: "${usWord}" - use "${US_TO_UK_SPELLING[usWord]}"`);
        }
      }
      
      // Check for personal pronouns
      if (/\bI\s+/g.test(text) || /\bmy\s+/gi.test(text)) {
        issues.push('Contains personal pronouns (I, my) - remove for professional tone');
      }
      
      return {
        valid: issues.length === 0,
        issues,
        score: Math.max(0, 100 - (issues.length * 5))
      };
    },

    // ============ CLEAN LOCATION DATA ============
    cleanLocation(rawLocation) {
      if (!rawLocation || typeof rawLocation !== 'string') return '';
      
      // Remove common prefixes
      let cleaned = rawLocation
        .replace(/^(location[s]?|based\s*in|located\s*in|work\s*from|office\s*in)[\s:,]*/gi, '')
        .replace(/^(remote\s*[\-–—,]?\s*)?/i, '') // Strip "Remote -" prefix but keep location
        .trim();
      
      // Validate format (should start with capital letter and ideally contain comma)
      if (cleaned && !/^[A-Z]/.test(cleaned)) {
        // Capitalise first letter
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      
      // Warn if format looks incorrect
      if (cleaned && !/^[A-Z].*,/.test(cleaned) && cleaned.length > 3) {
        console.warn('[ContentQualityEngine] Location format may be incorrect:', cleaned);
      }
      
      return cleaned;
    },

    // ============ GET BANNED WORDS LIST ============
    getBannedWords() {
      return [...BANNED_WORDS];
    },

    // ============ GET BANNED PHRASES LIST ============
    getBannedPhrases() {
      return [...BANNED_PHRASES];
    },

    // ============ GET UK SPELLING MAP ============
    getUKSpellingMap() {
      return { ...US_TO_UK_SPELLING };
    }
  };

  // Export
  global.ContentQualityEngine = ContentQualityEngine;
  
  console.log('[ContentQualityEngine] v1.0 loaded - Anti-AI Detection & UK Spelling Active');

})(typeof window !== 'undefined' ? window : this);
