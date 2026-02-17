// content-quality-engine.js - Anti-AI Detection & Content Quality v2.0
// Features: UK spelling enforcement, banned words filtering, em dash removal, sentence variation
// Ensures authentic, human-written content that avoids AI detection patterns
// v2.0: Comprehensive UK spelling, expanded banned words, sentence structure variation detection

(function(global) {
  'use strict';

  // ============ BANNED WORDS & PHRASES (AI Detection Flags) ============
  // COMPLETE LIST - Never use these words in CV/Cover Letter content
  const BANNED_WORDS = [
    // Original banned list
    'orchestrated', 'championed', 'pioneered', 'helmed', 'realm',
    'comprehensive', 'demonstrating', 'showcasing', 'spearheaded',
    'meticulous', 'approximately', 'dynamic', 'synergy', 'cutting-edge',
    'best-in-class', 'world-class', 'results-driven', 'detail-oriented',
    'team player', 'go-getter', 'various', 'assisted',
    // Leverage/Utilize variants (buzzword usage)
    'leverage', 'leveraging', 'leveraged',
    'utilize', 'utilizing', 'utilized', 'utilising', 'utilised',
    'utilise', 'utilization', 'utilisation',
    // Additional banned terms from spec
    'measurable' // Replace with actual metrics/numbers
  ];

  const BANNED_PHRASES = [
    // Proven X phrases
    'proven ability', 'proven track record', 'proven record',
    'proven proficiency', 'proven proficiency in', 'proven expertise',
    // Buzzword phrases
    'the intersection of', 'drive impactful outcomes',
    'strategic initiatives', 'stakeholder environments',
    'think outside the box', 'highly motivated',
    // Corporate jargon
    'deep dive', 'low-hanging fruit', 'move the needle',
    'circle back', 'touch base', 'game-changer', 'paradigm shift',
    'best practices', 'core competencies', 'value proposition',
    'actionable insights', 'bandwidth', 'synergize', 'holistic approach',
    'robust solution', 'seamless integration', 'end-to-end',
    'state-of-the-art', 'next-generation', 'mission-critical',
    'thought leadership', 'disruptive innovation',
    'optimizing ci/cd processes', 'optimising ci/cd processes'
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
    'realm': 'field',           // Alternative: industry, sector
    'comprehensive': 'thorough', // Alternative: extensive, complete
    'demonstrating': 'showing',
    'showcasing': 'presenting',
    'spearheaded': 'led',
    'meticulous': 'detailed',    // Alternative: precise, exact
    'approximately': '',         // Remove - use specific numbers with +
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
    // Leverage/Utilize - replace with simpler alternatives
    'leverage': 'use',           // Alternative: employ, apply
    'leveraging': 'using',
    'leveraged': 'used',
    'utilize': 'use',
    'utilizing': 'using',
    'utilized': 'used',
    'utilising': 'using',
    'utilised': 'used',
    'utilise': 'use',
    'utilization': 'usage',
    'utilisation': 'usage',
    // Additional
    'measurable': 'quantified'
  };

  const PHRASE_REPLACEMENTS = {
    // "Proven X" phrases (must be removed, not rephrased)
    // User requirement: replace "proven ability" with plain "ability" (no adjectives)
    'proven ability': 'ability',
    'proven track record': 'track record',
    'proven record': 'record',
    'proven proficiency': 'proficiency',
    'proven proficiency in': 'proficiency in',
    'proven expertise': 'expertise',
    'the intersection of': 'across',        // Alternative: spanning, throughout
    'drive impactful outcomes': 'deliver results',
    'strategic initiatives': 'key projects',
    'stakeholder environments': 'business contexts',
    'think outside the box': 'approach problems creatively',
    'highly motivated': 'driven',
    'optimizing ci/cd processes': 'improving CI/CD pipelines',
    'optimising ci/cd processes': 'improving CI/CD pipelines',
    // AI detection patterns
    'resulting in': 'achieving',
    'leading to': 'producing',
    'which led to': ', achieving',
    'thereby': ', which',
    'thus enabling': ', enabling',
    'in order to': 'to'
  };

  // ============ US TO UK SPELLING CONVERSIONS ============
  // COMPREHENSIVE: Covers -ize/-ise, -or/-our, -er/-re, -ense/-ence, -og/-ogue, -l/-ll, -yze/-yse, misc
  const US_TO_UK_SPELLING = {
    // -ize to -ise (all forms)
    'optimize': 'optimise', 'optimized': 'optimised', 'optimizing': 'optimising', 'optimization': 'optimisation',
    'organize': 'organise', 'organized': 'organised', 'organizing': 'organising', 'organization': 'organisation',
    'realize': 'realise', 'realized': 'realised', 'realizing': 'realising', 'realization': 'realisation',
    'specialize': 'specialise', 'specialized': 'specialised', 'specializing': 'specialising', 'specialization': 'specialisation',
    'recognize': 'recognise', 'recognized': 'recognised', 'recognizing': 'recognising', 'recognition': 'recognition',
    'characterize': 'characterise', 'characterized': 'characterised', 'characterizing': 'characterising', 'characterization': 'characterisation',
    'categorize': 'categorise', 'categorized': 'categorised', 'categorizing': 'categorising', 'categorization': 'categorisation',
    'emphasize': 'emphasise', 'emphasized': 'emphasised', 'emphasizing': 'emphasising',
    'summarize': 'summarise', 'summarized': 'summarised', 'summarizing': 'summarising',
    'authorize': 'authorise', 'authorized': 'authorised', 'authorizing': 'authorising', 'authorization': 'authorisation',
    'standardize': 'standardise', 'standardized': 'standardised', 'standardizing': 'standardising', 'standardization': 'standardisation',
    'modernize': 'modernise', 'modernized': 'modernised', 'modernizing': 'modernising', 'modernization': 'modernisation',
    'minimize': 'minimise', 'minimized': 'minimised', 'minimizing': 'minimising', 'minimization': 'minimisation',
    'maximize': 'maximise', 'maximized': 'maximised', 'maximizing': 'maximising', 'maximization': 'maximisation',
    'prioritize': 'prioritise', 'prioritized': 'prioritised', 'prioritizing': 'prioritising', 'prioritization': 'prioritisation',
    'customize': 'customise', 'customized': 'customised', 'customizing': 'customising', 'customization': 'customisation',
    'finalize': 'finalise', 'finalized': 'finalised', 'finalizing': 'finalising', 'finalization': 'finalisation',
    'visualize': 'visualise', 'visualized': 'visualised', 'visualizing': 'visualising', 'visualization': 'visualisation',
    'mobilize': 'mobilise', 'mobilized': 'mobilised', 'mobilizing': 'mobilising', 'mobilization': 'mobilisation',
    'dramatize': 'dramatise', 'dramatized': 'dramatised', 'dramatizing': 'dramatising',
    'criticize': 'criticise', 'criticized': 'criticised', 'criticizing': 'criticising', 'criticism': 'criticism',
    'apologize': 'apologise', 'apologized': 'apologised', 'apologizing': 'apologising',
    'digitize': 'digitise', 'digitized': 'digitised', 'digitizing': 'digitising', 'digitization': 'digitisation',
    'terrorize': 'terrorise', 'terrorized': 'terrorised', 'terrorizing': 'terrorising',
    'harmonize': 'harmonise', 'harmonized': 'harmonised', 'harmonizing': 'harmonising', 'harmonization': 'harmonisation',
    'memorize': 'memorise', 'memorized': 'memorised', 'memorizing': 'memorising',
    'sterilize': 'sterilise', 'sterilized': 'sterilised', 'sterilizing': 'sterilising', 'sterilization': 'sterilisation',
    'stabilize': 'stabilise', 'stabilized': 'stabilised', 'stabilizing': 'stabilising', 'stabilization': 'stabilisation',
    'centralize': 'centralise', 'centralized': 'centralised', 'centralizing': 'centralising', 'centralization': 'centralisation',
    'monetize': 'monetise', 'monetized': 'monetised', 'monetizing': 'monetising', 'monetization': 'monetisation',
    'itemize': 'itemise', 'itemized': 'itemised', 'itemizing': 'itemising',
    'synchronize': 'synchronise', 'synchronized': 'synchronised', 'synchronizing': 'synchronising',
    'normalize': 'normalise', 'normalized': 'normalised', 'normalizing': 'normalising', 'normalization': 'normalisation',
    'localize': 'localise', 'localized': 'localised', 'localizing': 'localising', 'localization': 'localisation',
    'globalize': 'globalise', 'globalized': 'globalised', 'globalizing': 'globalising', 'globalization': 'globalisation',
    'capitalize': 'capitalise', 'capitalized': 'capitalised', 'capitalizing': 'capitalising', 'capitalization': 'capitalisation',
    'rationalize': 'rationalise', 'rationalized': 'rationalised', 'rationalizing': 'rationalising',
    'neutralize': 'neutralise', 'neutralized': 'neutralised', 'neutralizing': 'neutralising',
    'privatize': 'privatise', 'privatized': 'privatised', 'privatizing': 'privatising', 'privatization': 'privatisation',
    'randomize': 'randomise', 'randomized': 'randomised', 'randomizing': 'randomising',
    'customize': 'customise', 'customized': 'customised', 'customizing': 'customising',
    'incentivize': 'incentivise', 'incentivized': 'incentivised', 'incentivizing': 'incentivising',
    'utilize': 'use', 'utilized': 'used', 'utilizing': 'using', 'utilization': 'usage',
    'utilise': 'use', 'utilised': 'used', 'utilising': 'using', 'utilisation': 'usage',

    // -yze to -yse
    'analyze': 'analyse', 'analyzed': 'analysed', 'analyzing': 'analysing', 'analysis': 'analysis',
    'paralyze': 'paralyse', 'paralyzed': 'paralysed', 'paralyzing': 'paralysing',
    'catalyze': 'catalyse', 'catalyzed': 'catalysed', 'catalyzing': 'catalysing',

    // -or to -our
    'color': 'colour', 'colors': 'colours', 'colored': 'coloured', 'coloring': 'colouring',
    'favor': 'favour', 'favors': 'favours', 'favored': 'favoured', 'favoring': 'favouring', 'favorite': 'favourite',
    'flavor': 'flavour', 'flavors': 'flavours', 'flavored': 'flavoured',
    'honor': 'honour', 'honors': 'honours', 'honored': 'honoured', 'honoring': 'honouring',
    'humor': 'humour', 'humors': 'humours',
    'labor': 'labour', 'labors': 'labours', 'labored': 'laboured', 'laboring': 'labouring',
    'neighbor': 'neighbour', 'neighbors': 'neighbours', 'neighboring': 'neighbouring',
    'rumor': 'rumour', 'rumors': 'rumours',
    'vigor': 'vigour', 'vigorous': 'vigorous',
    'vapor': 'vapour', 'vapors': 'vapours',
    'splendor': 'splendour',
    'candor': 'candour',
    'odor': 'odour', 'odors': 'odours',
    'parlor': 'parlour', 'parlors': 'parlours',
    'savior': 'saviour', 'saviors': 'saviours',
    'behavior': 'behaviour', 'behaviors': 'behaviours', 'behavioral': 'behavioural',
    'endeavor': 'endeavour', 'endeavors': 'endeavours', 'endeavored': 'endeavoured',
    'harbor': 'harbour', 'harbors': 'harbours',

    // -er to -re
    'center': 'centre', 'centers': 'centres', 'centered': 'centred', 'centering': 'centring',
    'theater': 'theatre', 'theaters': 'theatres',
    'meter': 'metre', 'meters': 'metres',
    'liter': 'litre', 'liters': 'litres',
    'fiber': 'fibre', 'fibers': 'fibres',
    'caliber': 'calibre',
    'saber': 'sabre', 'sabers': 'sabres',
    'somber': 'sombre',
    'specter': 'spectre', 'specters': 'spectres',

    // -ense to -ence
    'defense': 'defence', 'defenses': 'defences',
    'offense': 'offence', 'offenses': 'offences',
    'license': 'licence', 'licenses': 'licences',
    'pretense': 'pretence', 'pretenses': 'pretences',

    // -og to -ogue
    'catalog': 'catalogue', 'catalogs': 'catalogues', 'cataloged': 'catalogued',
    'dialog': 'dialogue', 'dialogs': 'dialogues',
    'analog': 'analogue', 'analogs': 'analogues',
    'monolog': 'monologue', 'monologs': 'monologues',
    'epilog': 'epilogue', 'epilogs': 'epilogues',
    'prolog': 'prologue', 'prologs': 'prologues',

    // -l to -ll (before suffixes)
    'traveled': 'travelled', 'traveling': 'travelling', 'traveler': 'traveller', 'travelers': 'travellers',
    'canceled': 'cancelled', 'canceling': 'cancelling',
    'labeled': 'labelled', 'labeling': 'labelling',
    'modeled': 'modelled', 'modeling': 'modelling',
    'fueled': 'fuelled', 'fueling': 'fuelling',
    'leveled': 'levelled', 'leveling': 'levelling',
    'jeweler': 'jeweller', 'jewelers': 'jewellers',
    'marveled': 'marvelled', 'marveling': 'marvelling',
    'quarreled': 'quarrelled', 'quarreling': 'quarrelling',
    'signaled': 'signalled', 'signaling': 'signalling',
    'tunneled': 'tunnelled', 'tunneling': 'tunnelling',
    'counselor': 'counsellor', 'counselors': 'counsellors',
    'channeled': 'channelled', 'channeling': 'channelling',

    // Miscellaneous common differences
    'aging': 'ageing',
    'aluminum': 'aluminium',
    'artifact': 'artefact', 'artifacts': 'artefacts',
    'gray': 'grey', 'grays': 'greys',
    'enrollment': 'enrolment', 'enrollments': 'enrolments',
    'fulfillment': 'fulfilment',
    'installment': 'instalment', 'installments': 'instalments',
    'judgment': 'judgement', 'judgments': 'judgements',
    'skillful': 'skilful',
    'marvelous': 'marvellous',
    'woolen': 'woollen',
    'skeptic': 'sceptic', 'skeptical': 'sceptical', 'skepticism': 'scepticism',
    'maneuver': 'manoeuvre', 'maneuvered': 'manoeuvred', 'maneuvering': 'manoeuvring',
    'plow': 'plough', 'plowed': 'ploughed', 'plowing': 'ploughing',
    'acknowledgment': 'acknowledgement', 'acknowledgments': 'acknowledgements',
    'esthetic': 'aesthetic', 'esthetics': 'aesthetics',
    'fulfill': 'fulfil', 'fulfills': 'fulfils', 'fulfilled': 'fulfilled', 'fulfilling': 'fulfilling',
    'inquire': 'enquire', 'inquired': 'enquired', 'inquiring': 'enquiring', 'inquiry': 'enquiry',

    // Medical/Scientific terms
    'estrogen': 'oestrogen',
    'anemia': 'anaemia',
    'cesarean': 'caesarean',
    'diarrhea': 'diarrhoea',
    'feces': 'faeces',
    'fetus': 'foetus',
    'hemoglobin': 'haemoglobin',
    'hemorrhage': 'haemorrhage',
    'pediatric': 'paediatric', 'pediatrics': 'paediatrics',
    'leukemia': 'leukaemia',

    // NOTE: Context-sensitive words excluded from auto-replace to avoid false positives:
    // 'check' (cheque only for payment), 'draft' (draught only for air/beer),
    // 'curb' (kerb only for pavement), 'tire' (tyre only for wheels),
    // 'program' (programme only for TV/events, NOT computing)
  };

  // ============ FALLBACK REGEX PATTERNS for -ize/-ise ============
  // Catches any remaining US -ize words not explicitly listed above
  const IZE_PATTERN = /\b([a-z]+)iz(e[ds]?|ing|ation)\b/gi;
  const IZE_EXCEPTIONS = new Set([
    'size', 'sized', 'sizing', 'sizes', 'prize', 'prized', 'prizes',
    'seize', 'seized', 'seizes', 'seizing', 'capsize', 'capsized',
    'citizen', 'citizens', 'denizen', 'horizon', 'magazine',
    'wizard', 'lizard', 'bizarre', 'piazza', 'pizza', 'fizz',
    'quiz', 'whiz', 'frizz', 'jazz', 'buzz', 'fuzz',
    'amazon', 'organization' // 'organization' handled explicitly above
  ]);

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

      // Step 1: Remove banned words and phrases FIRST (before UK spelling, since some banned words have US spelling)
      if (removeBannedWords) {
        result = this.removeBannedContent(result);
      }

      // Step 2: Convert US to UK spelling
      if (convertToUK) {
        result = this.convertToUKSpelling(result);
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

      // Step 6: Second pass on banned content (catches anything introduced by UK conversion)
      if (removeBannedWords) {
        result = this.removeBannedContent(result);
      }

      // Final cleanup
      result = this.finalCleanup(result);

      return result;
    },

    // ============ CV/ATS BLOCK SANITISATION (Preserve line layout) ============
    // For multi-line CV blocks we avoid adding sentence-ending punctuation per line.
    sanitiseCVBlock(text) {
      // FIRST: Fix inline headers (e.g., "SKILLS: PYTHON, JAVA, C++" → separate lines with proper casing)
      let result = this.normaliseInlineHeaders(text);

      result = this.sanitiseContent(result, {
        convertToUK: true,
        removeBannedWords: true,
        removeEmDashes: true,
        fixPunctuation: false,
        removePronouns: true
      });

      // ██ FINAL NEVER-LEAK GUARD ██
      // Catches any US spellings or banned words that somehow survived the pipeline
      result = this.neverLeakGuard(result);

      return result;
    },

    // ============ NEVER-LEAK GUARD ============
    // Absolute last-resort catch for words that MUST NEVER appear in output
    neverLeakGuard(text) {
      if (!text || typeof text !== 'string') return text;

      // These MUST be replaced no matter what — case-insensitive word-boundary match
      const ABSOLUTE_REPLACEMENTS = [
        // US spellings that must always be UK
        [/\butilizing\b/gi, 'using'],
        [/\butilized\b/gi, 'used'],
        [/\butilize\b/gi, 'use'],
        [/\butilizes\b/gi, 'uses'],
        [/\butilization\b/gi, 'usage'],
        [/\butilising\b/gi, 'using'],   // Even UK form of utilize is banned (use "using" instead)
        [/\butilised\b/gi, 'used'],
        [/\butilise\b/gi, 'use'],
        [/\butilises\b/gi, 'uses'],
        [/\butilisation\b/gi, 'usage'],
        [/\bmodernize\b/gi, 'modernise'],
        [/\bmodernized\b/gi, 'modernised'],
        [/\bmodernizing\b/gi, 'modernising'],
        [/\bmodernizes\b/gi, 'modernises'],
        [/\bmodernization\b/gi, 'modernisation'],
        [/\banalyzing\b/gi, 'analysing'],
        [/\banalyzed\b/gi, 'analysed'],
        [/\banalyze\b/gi, 'analyse'],
        [/\banalyzes\b/gi, 'analyses'],
        [/\banalyzer\b/gi, 'analyser'],
        [/\boptimizing\b/gi, 'optimising'],
        [/\boptimized\b/gi, 'optimised'],
        [/\boptimize\b/gi, 'optimise'],
        [/\boptimization\b/gi, 'optimisation'],
        // Banned buzzwords that must never appear
        [/\borchestrated\b/gi, 'directed'],
        [/\bchampioned\b/gi, 'led'],
        [/\bpioneered\b/gi, 'established'],
        [/\bhelmed\b/gi, 'led'],
        [/\bspearheaded\b/gi, 'led'],
        [/\bleveraging\b/gi, 'using'],
        [/\bleveraged\b/gi, 'used'],
        [/\bleverage\b/gi, 'use'],
        [/\bcomprehensive\b/gi, 'thorough'],
        [/\bmeticulous\b/gi, 'detailed'],
        // Phrases that must be replaced (multi-word)
        [/\bproven ability\b/gi, 'ability'],
        [/\bproven track record\b/gi, 'track record'],
        [/\bproven expertise\b/gi, 'expertise'],
        [/\bresults-driven\b/gi, 'results-focused'],
        [/\bself-motivated\b/gi, 'proactive'],
        [/\bgo-getter\b/gi, 'driven professional'],
        [/\bsynergy\b/gi, 'collaboration'],
        [/\bsynergies\b/gi, 'collaborations'],
        [/\bparadigm\b/gi, 'approach'],
        [/\brobust\b/gi, 'strong'],
      ];

      let result = text;
      for (const [pattern, replacement] of ABSOLUTE_REPLACEMENTS) {
        result = result.replace(pattern, (match) => {
          // Preserve capitalisation
          if (match === match.toUpperCase()) return replacement.toUpperCase();
          if (match[0] === match[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
          return replacement;
        });
      }

      return result;
    },

    // ============ INLINE HEADER NORMALISATION ============
    // Converts "SKILLS: PYTHON, JAVA, C++" → "SKILLS\nPython, Java, C++"
    // Prevents inline headers from being rendered as all-caps bold content
    normaliseInlineHeaders(text) {
      if (!text || typeof text !== 'string') return text;
      
      const HEADER_KEYS = new Set([
        'PROFESSIONAL SUMMARY', 'SUMMARY', 'PROFILE', 'OBJECTIVE',
        'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'EXPERIENCE', 'EMPLOYMENT',
        'EDUCATION', 'SKILLS', 'TECHNICAL SKILLS', 'CORE SKILLS',
        'TECHNICAL PROFICIENCIES', 'CERTIFICATIONS', 'LICENSES', 'PROJECTS', 'ACHIEVEMENTS'
      ]);
      
      // Known technical terms with correct casing
      const KNOWN_FORMATS = {
        'PYTHON': 'Python', 'JAVA': 'Java', 'JAVASCRIPT': 'JavaScript',
        'TYPESCRIPT': 'TypeScript', 'NODE.JS': 'Node.js', 'REACT': 'React',
        'ANGULAR': 'Angular', 'VUE.JS': 'Vue.js', 'MONGODB': 'MongoDB',
        'POSTGRESQL': 'PostgreSQL', 'MYSQL': 'MySQL', 'REDIS': 'Redis',
        'DOCKER': 'Docker', 'KUBERNETES': 'Kubernetes', 'TERRAFORM': 'Terraform',
        'JENKINS': 'Jenkins', 'GITHUB': 'GitHub', 'GITLAB': 'GitLab',
        'JIRA': 'Jira', 'CONFLUENCE': 'Confluence', 'SLACK': 'Slack',
        'SALESFORCE': 'Salesforce', 'TABLEAU': 'Tableau', 'POWER BI': 'Power BI',
        'EXCEL': 'Excel', 'POWERPOINT': 'PowerPoint', 'AZURE': 'Azure',
        'C++': 'C++', 'C#': 'C#', 'KOTLIN': 'Kotlin', 'SWIFT': 'Swift',
        'GRAPHQL': 'GraphQL', 'REST': 'REST', 'RESTFUL': 'RESTful',
        'MACHINE LEARNING': 'Machine Learning', 'DEEP LEARNING': 'Deep Learning',
        'NATURAL LANGUAGE PROCESSING': 'Natural Language Processing',
        'DATA SCIENCE': 'Data Science', 'DATA ANALYSIS': 'Data Analysis',
        'BUSINESS INTELLIGENCE': 'Business Intelligence',
        'PROJECT MANAGEMENT': 'Project Management', 'AGILE': 'Agile',
        'SCRUM': 'Scrum', 'DEVOPS': 'DevOps', 'CI/CD': 'CI/CD',
        'GOOGLE CLOUD': 'Google Cloud', 'GOOGLE CLOUD PLATFORM': 'Google Cloud Platform'
      };
      
      // Acronyms to keep uppercase
      const ACRONYMS = new Set([
        'AWS', 'GCP', 'SQL', 'API', 'CSS', 'HTML', 'XML', 'JSON', 'REST',
        'CI', 'CD', 'ML', 'AI', 'UI', 'UX', 'ETL', 'LLM', 'IAC', 'SRE', 'NLP',
        'PMP', 'CPA', 'CFA', 'MBA', 'PHD', 'IIBA', 'CBAP', 'ITIL', 'HIPAA'
      ]);
      
      // Normalise ALL CAPS content to proper casing
      const normaliseContent = (content) => {
        if (!content) return '';
        const trimmed = content.trim();
        
        // If content is not all uppercase, return as-is (already properly cased)
        if (trimmed !== trimmed.toUpperCase()) return trimmed;
        
        // Split by comma, normalise each term
        return trimmed.split(',').map(term => {
          const t = term.trim();
          const upper = t.toUpperCase();
          
          // Check known formats first
          if (KNOWN_FORMATS[upper]) return KNOWN_FORMATS[upper];
          
          // Check if it's a pure acronym
          if (ACRONYMS.has(upper)) return upper;
          
          // Convert to Title Case, preserving acronyms within
          return t.toLowerCase().split(/[\s\-\/]+/).map((word) => {
            const wordUpper = word.toUpperCase();
            if (ACRONYMS.has(wordUpper)) return wordUpper;
            if (/^\d+\.?\d*$/.test(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
          }).join(' ');
        }).join(', ');
      };
      
      const lines = text.split(/\r?\n/);
      const out = [];
      
      for (const line of lines) {
        const trimmed = (line || '').trim();
        
        // Pattern: HEADER: content (header is all caps, followed by colon and content)
        const inlineMatch = trimmed.match(/^([A-Z][A-Z\s]{2,30}):\s*(.+)$/);
        if (inlineMatch) {
          const potentialHeader = inlineMatch[1].trim().toUpperCase();
          if (HEADER_KEYS.has(potentialHeader)) {
            // Split into header on its own line + normalised content
            out.push(potentialHeader);
            out.push(normaliseContent(inlineMatch[2].trim()));
            continue;
          }
        }
        
        // Keep line as-is
        out.push(line);
      }
      
      return out.join('\n');
    },

    // ============ FLEXIBLE PHRASE REGEX (handles whitespace/newlines) ============
    makeFlexiblePhraseRegex(phrase) {
      const escaped = String(phrase)
        .trim()
        .split(/\s+/)
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[\\s\\n]+');
      return new RegExp(`\\b${escaped}\\b`, 'gi');
    },

    // ============ SENTENCE STRUCTURE VARIATION DETECTION ============

    // Detect repetitive verb starts across bullet points
    detectBulletVerbRepetition(bullets) {
      const warnings = [];
      if (!Array.isArray(bullets) || bullets.length < 2) return { warnings, counts: {}, patterns: {} };

      const counts = {};
      const patternCounts = {};
      const normalise = (b) => String(b || '')
        .replace(/^[•\-\*▪▸►]+\s*/, '')
        .trim();

      for (const b of bullets) {
        const text = normalise(b);
        const firstWord = (text.match(/^([A-Za-z]+)/) || [])[1];
        if (!firstWord) continue;
        const key = firstWord.toLowerCase();
        counts[key] = (counts[key] || 0) + 1;

        // Detect sentence structure patterns
        const pattern = this._classifyBulletPattern(text);
        patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
      }

      // Flag verbs used 2+ times
      const repeats = Object.entries(counts)
        .filter(([_, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1]);

      repeats.forEach(([verb, n]) => {
        warnings.push(`Multiple bullets start with "${verb}" (${n}x). Consider varying openings.`);
      });

      // Flag repetitive sentence patterns (same pattern 3+ times)
      const patternRepeats = Object.entries(patternCounts)
        .filter(([_, n]) => n >= 3)
        .sort((a, b) => b[1] - a[1]);

      patternRepeats.forEach(([pattern, n]) => {
        warnings.push(`Repetitive bullet structure "${pattern}" used ${n}x. Vary sentence patterns.`);
      });

      // Flag uniform bullet length (all bullets within 20% of each other)
      const lengths = bullets.map(b => normalise(b).split(/\s+/).length).filter(l => l > 0);
      if (lengths.length >= 4) {
        const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const allSimilar = lengths.every(l => Math.abs(l - avg) / avg < 0.2);
        if (allSimilar) {
          warnings.push('All bullets have similar word count. Mix short punchy bullets with detailed ones.');
        }
      }

      return { warnings, counts, patterns: patternCounts };
    },

    // Classify bullet point into a structural pattern
    _classifyBulletPattern(text) {
      if (!text) return 'unknown';
      const lower = text.toLowerCase();

      // "Action + metric + outcome" pattern
      if (/^\w+ed?\s.*\d+%?.*(?:resulting|leading|achieving|producing)/i.test(text)) {
        return 'action-metric-outcome';
      }
      // "Action + using/via/through + tool" pattern
      if (/^\w+ed?\s.*(?:using|via|through|applying|employing)\s/i.test(text)) {
        return 'action-using-tool';
      }
      // "Action + by/for + purpose" pattern
      if (/^\w+ed?\s.*(?:by|for)\s/i.test(text)) {
        return 'action-by-purpose';
      }
      // Starts with number/metric
      if (/^\d/.test(text)) {
        return 'metric-first';
      }
      // Short punchy (under 10 words)
      if (text.split(/\s+/).length <= 10) {
        return 'short-punchy';
      }
      return 'standard';
    },

    // Extract bullets from a CV text block and run variation detection.
    detectBulletVerbRepetitionFromCV(cvText) {
      const bullets = String(cvText || '')
        .split(/\n/)
        .map(l => l.trim())
        .filter(l => /^[-•*▪▸►]\s+/.test(l) || /^[-•*▪▸►]\s*\S/.test(l))
        .map(l => l.replace(/^[-•*▪▸►]\s*/, '').trim());

      return this.detectBulletVerbRepetition(bullets);
    },

    // Auto-fix repetitive verb starts by suggesting alternative verbs
    suggestVerbAlternatives(verb) {
      const alternatives = {
        'led': ['Directed', 'Managed', 'Guided', 'Headed', 'Oversaw'],
        'managed': ['Directed', 'Oversaw', 'Coordinated', 'Administered', 'Handled'],
        'developed': ['Built', 'Created', 'Designed', 'Engineered', 'Constructed'],
        'implemented': ['Deployed', 'Executed', 'Rolled out', 'Introduced', 'Delivered'],
        'created': ['Built', 'Designed', 'Developed', 'Produced', 'Established'],
        'improved': ['Enhanced', 'Strengthened', 'Boosted', 'Elevated', 'Refined'],
        'built': ['Constructed', 'Developed', 'Designed', 'Assembled', 'Engineered'],
        'designed': ['Architected', 'Crafted', 'Created', 'Planned', 'Devised'],
        'delivered': ['Completed', 'Shipped', 'Produced', 'Achieved', 'Executed'],
        'drove': ['Accelerated', 'Advanced', 'Propelled', 'Initiated', 'Fostered'],
        'reduced': ['Cut', 'Decreased', 'Lowered', 'Minimised', 'Trimmed'],
        'increased': ['Grew', 'Raised', 'Boosted', 'Expanded', 'Elevated'],
        'established': ['Founded', 'Set up', 'Introduced', 'Initiated', 'Launched'],
        'streamlined': ['Simplified', 'Refined', 'Optimised', 'Consolidated', 'Rationalised'],
      };
      const key = (verb || '').toLowerCase();
      return alternatives[key] || ['Executed', 'Delivered', 'Achieved', 'Completed', 'Handled'];
    },

    // ============ CONVERT US TO UK SPELLING ============
    convertToUKSpelling(text) {
      if (!text) return text;

      let result = text;

      // HARD GUARD: never allow these exact US spellings to leak (even if other steps are changed)
      // Note: keep meaning; only convert to UK spelling.
      result = result
        .replace(/\butiliz(ing|ed|e|es|ation|ations)\b/gi, (m) => {
          const lower = m.toLowerCase();
          const map = {
            utilising: 'utilising',
            utilised: 'utilised',
            utilise: 'utilise',
            utilises: 'utilises',
            utilisation: 'utilisation',
            utilisations: 'utilisations',
          };

          // Convert using suffix mapping
          const converted = lower
            .replace(/^utiliz/, 'utilis')
            .replace(/isation$/, 'isation')
            .replace(/isations$/, 'isations');
          const out = map[converted] || converted;
          if (m === m.toUpperCase()) return out.toUpperCase();
          if (m[0] === m[0].toUpperCase()) return out.charAt(0).toUpperCase() + out.slice(1);
          return out;
        })
        .replace(/\bmoderniz(e|ed|es|ing|ation|ations)\b/gi, (m) => {
          const out = m.toLowerCase().replace('moderniz', 'modernis');
          if (m === m.toUpperCase()) return out.toUpperCase();
          if (m[0] === m[0].toUpperCase()) return out.charAt(0).toUpperCase() + out.slice(1);
          return out;
        })
        .replace(/\banalyz(e|ed|es|ing|er|ers)\b/gi, (m) => {
          const out = m.toLowerCase().replace('analyz', 'analys');
          if (m === m.toUpperCase()) return out.toUpperCase();
          if (m[0] === m[0].toUpperCase()) return out.charAt(0).toUpperCase() + out.slice(1);
          return out;
        });

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

      // FALLBACK: Catch remaining -ize words not in the explicit map
      result = result.replace(IZE_PATTERN, (match, stem, suffix) => {
        const full = match.toLowerCase();
        if (IZE_EXCEPTIONS.has(full)) return match;
        // Already handled by explicit map? Skip
        if (US_TO_UK_SPELLING[full]) return match;
        // Convert -ize to -ise
        const ukSuffix = suffix.replace(/z/g, 's');
        // Preserve case
        if (match === match.toUpperCase()) {
          return (stem + 'is' + ukSuffix.slice(1)).toUpperCase();
        }
        if (match[0] === match[0].toUpperCase()) {
          const uk = stem + 'is' + ukSuffix.slice(1);
          return uk.charAt(0).toUpperCase() + uk.slice(1);
        }
        return stem + 'is' + ukSuffix.slice(1);
      });

      return result;
    },

    // ============ REMOVE BANNED WORDS AND PHRASES ============
    removeBannedContent(text) {
      if (!text) return text;

      let result = text;

      // Replace banned phrases first (longer matches take priority)
      // Sort by length descending to match longer phrases first
      const sortedPhrases = [...BANNED_PHRASES].sort((a, b) => b.length - a.length);
      for (const phrase of sortedPhrases) {
        const regex = this.makeFlexiblePhraseRegex(phrase);
        const replacement = PHRASE_REPLACEMENTS[phrase.toLowerCase()] || '';
        result = result.replace(regex, replacement);
      }

      // Replace banned words
      for (const word of BANNED_WORDS) {
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
        const replacement = WORD_REPLACEMENTS[word.toLowerCase()] || '';
        result = result.replace(regex, replacement);
      }

      // Replace AI detection patterns
      for (const pattern of AI_PHRASE_PATTERNS) {
        const patternStr = pattern.source.toLowerCase();
        const replacement = PHRASE_REPLACEMENTS[patternStr] || '';
        result = result.replace(pattern, replacement || ', ');
      }

      // Final catch-all: any remaining "proven" + noun combinations
      result = result.replace(/\bproven\s+(ability|track\s+record|record|proficiency|expertise|experience)\b/gi, (match, noun) => {
        return noun.replace(/^\s+/, '');
      });

      return result;
    },

    // ============ REMOVE EM DASHES ============
    removeEmDashes(text) {
      if (!text) return text;

      return text
        // Replace em dash (—) with comma or full stop
        .replace(/\s*—\s*/g, '. ')
        // Replace en dash (–) used as em dash with comma
        .replace(/\s+–\s+/g, ', ')
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

      const SECTION_HEADERS = [
        'PROFESSIONAL SUMMARY',
        'PROFESSIONAL EXPERIENCE',
        'WORK EXPERIENCE',
        'EXPERIENCE',
        'EDUCATION',
        'SKILLS',
        'TECHNICAL PROFICIENCIES',
        'CERTIFICATIONS'
      ];

      // Build a regex that collapses duplicated headers on a single line:
      // "WORK EXPERIENCE WORK EXPERIENCE" → "WORK EXPERIENCE"
      // "SKILLS  SKILLS" → "SKILLS"
      const dupHeaderRegex = new RegExp(
        `^(${SECTION_HEADERS.map(h => h.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})(?:\\s+\\1)+$`,
        'gmi'
      );

      return text
        // Collapse duplicated section headers (regression guard)
        .replace(dupHeaderRegex, '$1')
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

      const sanitised = bullets.map(bullet => {
        let cleaned = this.sanitiseContent(bullet, {
          convertToUK: true,
          removeBannedWords: true,
          removeEmDashes: true,
          fixPunctuation: true,
          removePronouns: true
        });

        // Ensure bullet starts with action verb (capitalised)
        cleaned = cleaned.replace(/^[•\-*\s]+/, '').trim();
        if (cleaned.length > 0) {
          cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        }

        // Remove trailing period from bullets
        cleaned = cleaned.replace(/\.\s*$/, '');

        return cleaned;
      }).filter(b => b && b.length > 10); // Remove too-short bullets

      // Run variation detection and log warnings
      const variation = this.detectBulletVerbRepetition(sanitised);
      if (variation.warnings.length > 0) {
        console.warn('[ContentQualityEngine] Bullet variation issues:', variation.warnings);
      }

      return sanitised;
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
      if (!text) return { valid: true, issues: [], score: 100 };

      const issues = [];

      // Check for banned words
      for (const word of BANNED_WORDS) {
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escapedWord}\\b`, 'i').test(text)) {
          issues.push(`Contains banned word: "${word}"`);
        }
      }

      // Check for banned phrases (flexible whitespace matching)
      for (const phrase of BANNED_PHRASES) {
        const regex = this.makeFlexiblePhraseRegex(phrase);
        if (regex.test(text)) {
          issues.push(`Contains banned phrase: "${phrase}"`);
        }
      }

      // Check for "proven" + noun patterns
      if (/\bproven\s+(ability|track\s+record|record|proficiency|expertise)\b/i.test(text)) {
        issues.push('Contains "proven [noun]" pattern - remove "proven"');
      }

      // Check for em dashes
      if (text.includes('\u2014')) {
        issues.push('Contains em dash (\u2014) - replace with full stop or comma');
      }

      // Check for US spelling
      for (const usWord of Object.keys(US_TO_UK_SPELLING)) {
        if (new RegExp(`\\b${usWord}\\b`, 'i').test(text)) {
          issues.push(`Contains US spelling: "${usWord}" - use "${US_TO_UK_SPELLING[usWord]}"`);
        }
      }

      // Check for remaining -ize words (fallback)
      const izeMatches = text.match(/\b[a-z]+ize[ds]?\b/gi) || [];
      for (const izeWord of izeMatches) {
        if (!IZE_EXCEPTIONS.has(izeWord.toLowerCase()) && !US_TO_UK_SPELLING[izeWord.toLowerCase()]) {
          issues.push(`Contains US spelling: "${izeWord}" - convert -ize to -ise`);
        }
      }

      // Check for personal pronouns
      if (/\bI\s+/g.test(text) || /\bmy\s+/gi.test(text)) {
        issues.push('Contains personal pronouns (I, my) - remove for professional tone');
      }

      // Check bullet variation
      const bullets = text.split(/\n/).filter(l => /^[-•*▪▸►]\s/.test(l.trim()));
      if (bullets.length >= 3) {
        const variation = this.detectBulletVerbRepetition(bullets);
        variation.warnings.forEach(w => issues.push(w));
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
        .replace(/^(location[s]?|based\s*in|located\s*in|work\s*from|office\s*in|job\s*location|position\s*location|role\s*location|work\s*location)[\s:,]*/gi, '')
        .replace(/^(remote\s*[\-\u2013\u2014,]?\s*)?/i, '') // Strip "Remote -" prefix but keep location
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
    },

    // ============ RUN FULL QUALITY REPORT ============
    generateQualityReport(text) {
      const validation = this.validateContent(text);
      const sanitised = this.sanitiseContent(text);
      const postValidation = this.validateContent(sanitised);

      return {
        original: {
          text: text,
          issues: validation.issues,
          score: validation.score
        },
        sanitised: {
          text: sanitised,
          issues: postValidation.issues,
          score: postValidation.score
        },
        fixed: validation.issues.length - postValidation.issues.length,
        remaining: postValidation.issues
      };
    }
  };

  // Export
  global.ContentQualityEngine = ContentQualityEngine;

  console.log('[ContentQualityEngine] v2.0 loaded - Comprehensive UK Spelling, Anti-AI Detection & Sentence Variation Active');

})(typeof window !== 'undefined' ? window : this);
