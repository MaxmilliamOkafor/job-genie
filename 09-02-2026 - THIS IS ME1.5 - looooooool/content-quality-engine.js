// content-quality-engine.js - Anti-AI Detection & Content Quality v3.0.2
// Features: UK spelling enforcement, banned words filtering, em dash removal, sentence variation
// Ensures authentic, human-written content that completely avoids AI detection patterns
// ENHANCED: Stricter banned word coverage, audit() function, bullet variation detection

(function(global) {
  'use strict';

  // ============ BANNED WORDS & PHRASES (AI Detection Flags) ============
  // EXPANDED: Now includes all variants reported as still appearing
  const BANNED_WORDS = [
    // Core AI buzzwords
    'orchestrated', 'championed', 'pioneered', 'helmed', 'realm',
    'comprehensive', 'demonstrating', 'demonstrated', 'demonstrates',
    'showcasing', 'showcased', 'spearheaded', 'spearhead',
    'meticulous', 'approximately', 'highly motivated', 'dynamic',
    'synergy', 'cutting-edge', 'best-in-class', 'world-class',
    'results-driven', 'detail-oriented', 'team player', 'go-getter',
    'various', 'assisted', 
    // Leverage/utilize variations - ALL BANNED
    'leverage', 'leveraging', 'leveraged', 'leverages',
    'utilize', 'utilizing', 'utilized', 'utilizes',
    'utilise', 'utilising', 'utilised', 'utilises',
    // Additional AI-detection patterns
    'robust', 'seamless', 'seamlessly', 'scalable', 'cutting edge',
    'state-of-the-art', 'best practices', 'synergize', 'synergise',
    'impactful', 'paradigm', 'disruptive', 'innovative',
    'holistic', 'proactive', 'actionable', 'bandwidth',
    'deep dive', 'low-hanging fruit', 'move the needle',
    'game-changer', 'thought leadership', 'value-add', 'value proposition',
    'mission-critical', 'next-generation', 'world class'
  ];

  const BANNED_PHRASES = [
    // Proven patterns - ALL VARIANTS
    'proven ability', 'proven track record', 'proven record',
    'proven success', 'proven history', 'proven expertise',
    'proven experience', 'proven capabilities',
    // AI connector phrases
    'the intersection of', 'drive impactful outcomes',
    'strategic initiatives', 'stakeholder environments',
    'think outside the box', 'deep dive', 'low-hanging fruit',
    'move the needle', 'circle back', 'touch base',
    'game-changer', 'paradigm shift', 'best practices',
    'core competencies', 'value proposition', 'actionable insights',
    'synergize', 'synergise', 'holistic approach',
    'robust solution', 'robust solutions', 'seamless integration',
    'seamlessly integrates', 'seamlessly integrated',
    'state-of-the-art', 'next-generation', 'mission-critical',
    'thought leadership', 'disruptive innovation',
    'cutting-edge technology', 'cutting-edge solutions',
    'scalable solutions', 'scalable solution',
    'robust framework', 'robust frameworks',
    'perfect intersection of', 'perfect intersection',
    // Repetitive connectors (banned when overused)
    'resulting in', 'leading to', 'which led to',
    'thereby', 'thus enabling', 'in order to',
    'with a focus on', 'in alignment with',
    'in conjunction with', 'in tandem with'
  ];

  // ============ SPECIFIC PHRASE REPLACEMENTS ============
  // These handle exact phrases that need rewriting, not just removal
  const EXACT_PHRASE_REPLACEMENTS = {
    // Proven patterns -> Track record patterns
    'proven track record': 'track record',
    'proven ability': 'strong ability',
    'proven success': 'success',
    'proven experience': 'extensive experience',
    'proven expertise': 'expertise',
    'proven record': 'record',
    'proven history': 'history',
    'proven capabilities': 'capabilities',
    
    // Generic "optimising X" patterns -> rewrite completely
    'optimising ci/cd processes': 'improving CI/CD pipelines',
    'optimizing ci/cd processes': 'improving CI/CD pipelines',
    'optimising ci/cd': 'improving CI/CD pipelines',
    'optimizing ci/cd': 'improving CI/CD pipelines',
    
    // Utilising/utilizing -> using
    'utilising': 'using',
    'utilised': 'used',
    'utilises': 'uses',
    'utilizing': 'using',
    'utilized': 'used',
    'utilizes': 'uses',
    
    // Leveraging -> using
    'leveraging': 'using',
    'leveraged': 'used',
    'leverages': 'uses',
    
    // AI connectors -> simpler alternatives
    'resulting in': 'achieving',
    'leading to': 'producing',
    'which led to': ', achieving',
    'thereby': ', which',
    'thus enabling': ', enabling',
    'in order to': 'to',
    'with a focus on': 'focusing on',
    'in alignment with': 'aligned with',
    'in conjunction with': 'with',
    'in tandem with': 'alongside',
    
    // Buzzphrases -> plain English
    'the intersection of': 'across',
    'perfect intersection of': 'across',
    'drive impactful outcomes': 'deliver results',
    'strategic initiatives': 'key projects',
    'stakeholder environments': 'business contexts',
    'think outside the box': 'approach problems creatively',
    'robust solution': 'reliable solution',
    'robust solutions': 'reliable solutions',
    'seamless integration': 'smooth integration',
    'seamlessly integrates': 'integrates smoothly',
    'cutting-edge': 'modern',
    'state-of-the-art': 'advanced',
    'best-in-class': 'leading',
    'world-class': 'excellent',
    'next-generation': 'advanced',
    'mission-critical': 'essential',
    'game-changer': 'significant improvement',
    'paradigm shift': 'major change',
    'holistic approach': 'comprehensive approach',
    'actionable insights': 'practical insights',
    'thought leadership': 'expertise'
  };

  // ============ US TO UK SPELLING CONVERSIONS ============
  const US_TO_UK_SPELLING = {
    // -ize to -ise
    'optimize': 'optimise', 'optimized': 'optimised', 'optimizing': 'optimising', 'optimization': 'optimisation',
    'organize': 'organise', 'organized': 'organised', 'organizing': 'organising', 'organization': 'organisation',
    'analyze': 'analyse', 'analyzed': 'analysed', 'analyzing': 'analysing',
    'realize': 'realise', 'realized': 'realised', 'realizing': 'realising', 'realization': 'realisation',
    'specialize': 'specialise', 'specialized': 'specialised', 'specializing': 'specialising', 'specialization': 'specialisation',
    'recognize': 'recognise', 'recognized': 'recognised', 'recognizing': 'recognising',
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
    'characterize': 'characterise', 'characterized': 'characterised', 'characterizing': 'characterising',
    'apologize': 'apologise', 'apologized': 'apologised', 'apologizing': 'apologising',
    'memorize': 'memorise', 'memorized': 'memorised', 'memorizing': 'memorising',
    'sterilize': 'sterilise', 'sterilized': 'sterilised', 'sterilizing': 'sterilising',
    'stabilize': 'stabilise', 'stabilized': 'stabilised', 'stabilizing': 'stabilising',
    'mobilize': 'mobilise', 'mobilized': 'mobilised', 'mobilizing': 'mobilising',
    'dramatize': 'dramatise', 'dramatized': 'dramatised', 'dramatizing': 'dramatising',
    'criticize': 'criticise', 'criticized': 'criticised', 'criticizing': 'criticising',
    'terrorize': 'terrorise', 'terrorized': 'terrorised', 'terrorizing': 'terrorising',
    
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
    'vigor': 'vigour', 'rigors': 'rigours', 'vapor': 'vapour',
    'splendor': 'splendour', 'candor': 'candour', 'odor': 'odour',
    'parlor': 'parlour', 'savior': 'saviour',
    
    // -er to -re
    'center': 'centre', 'centers': 'centres', 'centered': 'centred', 'centering': 'centring',
    'meter': 'metre', 'meters': 'metres',
    'liter': 'litre', 'liters': 'litres',
    'fiber': 'fibre', 'fibers': 'fibres',
    'theater': 'theatre', 'theaters': 'theatres',
    'caliber': 'calibre', 'saber': 'sabre', 'somber': 'sombre', 'specter': 'spectre',
    
    // -log to -logue
    'analog': 'analogue', 'analogs': 'analogues',
    'catalog': 'catalogue', 'catalogs': 'catalogues', 'cataloged': 'catalogued',
    'dialog': 'dialogue', 'dialogs': 'dialogues',
    'monolog': 'monologue', 'epilog': 'epilogue', 'prolog': 'prologue',
    
    // -ense to -ence
    'defense': 'defence', 'defenses': 'defences',
    'offense': 'offence', 'offenses': 'offences',
    'license': 'licence', 'licenses': 'licences',
    'pretense': 'pretence',
    
    // -l to -ll (past tense)
    'traveled': 'travelled', 'traveling': 'travelling', 'traveler': 'traveller',
    'modeled': 'modelled', 'modeling': 'modelling',
    'canceled': 'cancelled', 'canceling': 'cancelling',
    'labeled': 'labelled', 'labeling': 'labelling',
    'leveled': 'levelled', 'leveling': 'levelling',
    'fueled': 'fuelled', 'fueling': 'fuelling',
    'signaled': 'signalled', 'signaling': 'signalling',
    'tunneled': 'tunnelled', 'counselor': 'counsellor',
    'channeled': 'channelled', 'marveled': 'marvelled', 'quarreled': 'quarrelled',
    'jeweler': 'jeweller',
    
    // -yze to -yse
    'analyze': 'analyse', 'paralyze': 'paralyse', 'catalyze': 'catalyse',
    
    // Other common differences
    'program': 'programme', 'programs': 'programmes',
    'gray': 'grey', 'grays': 'greys',
    'acknowledgment': 'acknowledgement', 'acknowledgments': 'acknowledgements',
    'judgment': 'judgement', 'judgments': 'judgements',
    'fulfill': 'fulfil', 'fulfills': 'fulfils', 'fulfillment': 'fulfilment',
    'skillful': 'skilful',
    'enrollment': 'enrolment', 'enrollments': 'enrolments',
    'installment': 'instalment', 'installments': 'instalments',
    'aging': 'ageing',
    'artifact': 'artefact', 'artifacts': 'artefacts',
    'esthetic': 'aesthetic', 'esthetics': 'aesthetics',
    'aluminum': 'aluminium',
    'skeptic': 'sceptic', 'skeptical': 'sceptical', 'skepticism': 'scepticism',
    'maneuver': 'manoeuvre', 'maneuvered': 'manoeuvred', 'maneuvering': 'manoeuvring',
    'plow': 'plough', 'plowed': 'ploughed', 'plowing': 'ploughing',
    'inquire': 'enquire', 'inquired': 'enquired', 'inquiring': 'enquiring', 'inquiry': 'enquiry',
    'tire': 'tyre', 'tires': 'tyres',
    'curb': 'kerb',
    'check': 'cheque',
    'donut': 'doughnut',
    'pajamas': 'pyjamas',
    'mustache': 'moustache',
    'leukemia': 'leukaemia',
    'anemia': 'anaemia',
    'cesarean': 'caesarean',
    'diarrhea': 'diarrhoea',
    'feces': 'faeces',
    'fetus': 'foetus',
    'hemoglobin': 'haemoglobin',
    'hemorrhage': 'haemorrhage',
    'pediatric': 'paediatric',
    'estrogen': 'oestrogen',
    'sulfur': 'sulphur',
    'woolen': 'woollen',
    'marvelous': 'marvellous'
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

      // Step 1: Apply exact phrase replacements FIRST (catches multi-word patterns)
      result = this.applyExactPhraseReplacements(result);

      // Step 2: Convert US to UK spelling
      if (convertToUK) {
        result = this.convertToUKSpelling(result);
      }

      // Step 3: Remove banned words and phrases
      if (removeBannedWords) {
        result = this.removeBannedContent(result);
      }

      // Step 4: Remove em dashes
      if (removeEmDashes) {
        result = this.removeEmDashes(result);
      }

      // Step 5: Fix punctuation issues
      if (fixPunctuation) {
        result = this.fixPunctuation(result);
      }

      // Step 6: Remove personal pronouns (I, my, me, we, our)
      if (removePronouns) {
        result = this.removePronouns(result);
      }

      // Final cleanup
      result = this.finalCleanup(result);

      return result;
    },

    // ============ APPLY EXACT PHRASE REPLACEMENTS ============
    applyExactPhraseReplacements(text) {
      if (!text) return text;
      
      let result = text;
      
      // Sort by length (longest first) to avoid partial replacements
      const sortedPhrases = Object.keys(EXACT_PHRASE_REPLACEMENTS).sort((a, b) => b.length - a.length);
      
      for (const phrase of sortedPhrases) {
        const replacement = EXACT_PHRASE_REPLACEMENTS[phrase];
        const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        
        result = result.replace(regex, (match) => {
          // Preserve case
          if (match === match.toUpperCase()) {
            return replacement.toUpperCase();
          }
          if (match[0] === match[0].toUpperCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
          }
          return replacement;
        });
      }
      
      return result;
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
      for (const phrase of BANNED_PHRASES) {
        const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const replacement = EXACT_PHRASE_REPLACEMENTS[phrase.toLowerCase()] || '';
        result = result.replace(regex, replacement);
      }
      
      // Replace banned words
      for (const word of BANNED_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const replacement = EXACT_PHRASE_REPLACEMENTS[word.toLowerCase()] || '';
        result = result.replace(regex, replacement);
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
        .replace(/[ \t]+,/g, ',')
        .replace(/,(?!\s)/g, ', ')
        // Fix period spacing
        .replace(/[ \t]+\./g, '.')
        .replace(/\.(?!\s|$|\d)/g, '. ')
        // Remove trailing punctuation from bullets
        .replace(/[,;]\s*$/gm, '')
        // Clean up multiple HORIZONTAL spaces only (preserve newlines!)
        .replace(/[^\S\n\r]{2,}/g, ' ');
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
        // Clean up leftover horizontal spaces only (preserve newlines!)
        .replace(/[^\S\n\r]{2,}/g, ' ')
        .trim();
    },

    // ============ FINAL CLEANUP ============
    finalCleanup(text) {
      if (!text) return text;

      return text
        // Remove double HORIZONTAL spaces only (preserve newlines!)
        .replace(/[^\S\n\r]{2,}/g, ' ')
        // Collapse 3+ blank lines into 2 (preserve paragraph breaks)
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

    // ============ ANALYZE BULLET VARIATION (NEW) ============
    // Detects repetitive patterns in bullet points
    analyzeBulletVariation(bullets) {
      if (!bullets || !Array.isArray(bullets) || bullets.length === 0) {
        return { ok: true, warnings: [] };
      }
      
      const warnings = [];
      
      // Extract first words from each bullet
      const firstWords = bullets.map((b, idx) => {
        const cleaned = (b || '').replace(/^[•\-*\s]+/, '').trim();
        const firstWord = cleaned.split(/\s+/)[0] || '';
        return { index: idx, word: firstWord.toLowerCase(), original: firstWord };
      });
      
      // Count first word occurrences
      const wordCounts = {};
      firstWords.forEach(({ word }) => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });
      
      // Flag repeated first words (>2 occurrences)
      Object.entries(wordCounts).forEach(([word, count]) => {
        if (count > 2 && word.length > 2) {
          const indices = firstWords.filter(fw => fw.word === word).map(fw => fw.index);
          warnings.push({
            type: 'repeated_verb',
            word: word,
            count: count,
            indices: indices,
            message: `Verb "${word}" starts ${count} bullets. Vary opening verbs for authenticity.`
          });
        }
      });
      
      // Check for repetitive connector patterns
      const connectorPatterns = [
        { pattern: /resulting in/gi, name: 'resulting in' },
        { pattern: /leading to/gi, name: 'leading to' },
        { pattern: /which led to/gi, name: 'which led to' },
        { pattern: /thereby/gi, name: 'thereby' },
        { pattern: /thus enabling/gi, name: 'thus enabling' },
        { pattern: /in order to/gi, name: 'in order to' }
      ];
      
      const connectorCounts = {};
      bullets.forEach((bullet, idx) => {
        connectorPatterns.forEach(({ pattern, name }) => {
          const matches = (bullet || '').match(pattern);
          if (matches) {
            if (!connectorCounts[name]) connectorCounts[name] = [];
            connectorCounts[name].push(idx);
          }
        });
      });
      
      // Flag overused connectors (>2 uses)
      Object.entries(connectorCounts).forEach(([connector, indices]) => {
        if (indices.length > 2) {
          warnings.push({
            type: 'repetitive_connector',
            pattern: connector,
            count: indices.length,
            indices: indices,
            message: `Connector "${connector}" used ${indices.length} times. Remove or vary connectors.`
          });
        }
      });
      
      return {
        ok: warnings.length === 0,
        warnings: warnings
      };
    },

    // ============ AUDIT FUNCTION (NEW - COMPREHENSIVE VALIDATION) ============
    // Returns structured report for verification
    audit(text) {
      if (!text || typeof text !== 'string') {
        return { ok: true, issues: [], summary: 'No text to audit' };
      }
      
      const issues = [];
      const textLower = text.toLowerCase();
      
      // Check for banned words
      const bannedWordHits = [];
      for (const word of BANNED_WORDS) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
          bannedWordHits.push(word);
        }
      }
      if (bannedWordHits.length > 0) {
        issues.push({
          type: 'banned_words',
          severity: 'error',
          items: bannedWordHits,
          message: `Found ${bannedWordHits.length} banned word(s): ${bannedWordHits.slice(0, 5).join(', ')}${bannedWordHits.length > 5 ? '...' : ''}`
        });
      }
      
      // Check for banned phrases
      const bannedPhraseHits = [];
      for (const phrase of BANNED_PHRASES) {
        if (textLower.includes(phrase.toLowerCase())) {
          bannedPhraseHits.push(phrase);
        }
      }
      if (bannedPhraseHits.length > 0) {
        issues.push({
          type: 'banned_phrases',
          severity: 'error',
          items: bannedPhraseHits,
          message: `Found ${bannedPhraseHits.length} banned phrase(s): ${bannedPhraseHits.slice(0, 3).join(', ')}${bannedPhraseHits.length > 3 ? '...' : ''}`
        });
      }
      
      // Check for US spellings
      const usSpellingHits = [];
      for (const usWord of Object.keys(US_TO_UK_SPELLING)) {
        if (new RegExp(`\\b${usWord}\\b`, 'i').test(text)) {
          usSpellingHits.push({ us: usWord, uk: US_TO_UK_SPELLING[usWord] });
        }
      }
      if (usSpellingHits.length > 0) {
        issues.push({
          type: 'us_spelling',
          severity: 'warning',
          items: usSpellingHits,
          message: `Found ${usSpellingHits.length} US spelling(s): ${usSpellingHits.slice(0, 3).map(h => h.us).join(', ')}${usSpellingHits.length > 3 ? '...' : ''}`
        });
      }
      
      // Check for em dashes
      const emDashCount = (text.match(/—/g) || []).length;
      if (emDashCount > 0) {
        issues.push({
          type: 'em_dashes',
          severity: 'warning',
          count: emDashCount,
          message: `Found ${emDashCount} em dash(es) - replace with full stops or commas`
        });
      }
      
      // Check for personal pronouns
      const pronounHits = [];
      if (/\bI\s+/g.test(text)) pronounHits.push('I');
      if (/\bmy\s+/gi.test(text)) pronounHits.push('my');
      if (/\bme\b/gi.test(text)) pronounHits.push('me');
      if (/\bwe\s+/gi.test(text)) pronounHits.push('we');
      if (/\bour\s+/gi.test(text)) pronounHits.push('our');
      if (pronounHits.length > 0) {
        issues.push({
          type: 'pronouns',
          severity: 'info',
          items: pronounHits,
          message: `Contains personal pronouns: ${pronounHits.join(', ')}`
        });
      }
      
      // Extract bullets for variation analysis
      const bulletLines = text.split('\n').filter(line => /^[•\-*]\s/.test(line.trim()));
      if (bulletLines.length > 3) {
        const variationResult = this.analyzeBulletVariation(bulletLines);
        if (!variationResult.ok) {
          variationResult.warnings.forEach(w => {
            issues.push({
              type: w.type,
              severity: 'warning',
              details: w,
              message: w.message
            });
          });
        }
      }
      
      // Calculate overall score
      const errorCount = issues.filter(i => i.severity === 'error').length;
      const warningCount = issues.filter(i => i.severity === 'warning').length;
      const score = Math.max(0, 100 - (errorCount * 20) - (warningCount * 5));
      
      const ok = errorCount === 0;
      
      // Log audit result
      if (ok) {
        console.log('%c[ContentQualityEngine] AUDIT: PASS ✓', 'color: green; font-weight: bold');
      } else {
        console.error('%c[ContentQualityEngine] AUDIT: FAIL ✗', 'color: red; font-weight: bold', issues);
      }
      
      return {
        ok: ok,
        issues: issues,
        score: score,
        summary: ok 
          ? 'Content passed all quality checks' 
          : `Found ${errorCount} error(s), ${warningCount} warning(s)`,
        bannedWordHits: bannedWordHits,
        bannedPhraseHits: bannedPhraseHits,
        usSpellingHits: usSpellingHits,
        emDashCount: emDashCount
      };
    },

    // ============ VALIDATE CONTENT QUALITY (LEGACY) ============
    validateContent(text) {
      const auditResult = this.audit(text);
      return {
        valid: auditResult.ok,
        issues: auditResult.issues.map(i => i.message),
        score: auditResult.score
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
  
  console.log('[ContentQualityEngine] v3.0.2 loaded - Anti-AI Detection & UK Spelling Active');

})(typeof window !== 'undefined' ? window : this);
