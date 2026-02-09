// content-quality-engine.js - Anti-AI Detection & Content Quality v2.0
// Features: STRICT UK spelling enforcement, banned words filtering, em dash removal, sentence variation
// Ensures authentic, human-written content that avoids AI detection patterns
// CRITICAL: This is the FINAL sanitisation pass - ALL content MUST go through this before output

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
    'utilize', 'utilizing', 'utilized', 'utilising', 'utilised',
    'utilise', 'scalable', 'robust', 'seamlessly', 'holistic',
    'impactful', 'synergistic', 'proactively', 'strategically',
    'innovatively', 'transformative', 'disruptive', 'groundbreaking',
    'game-changing', 'revolutionary', 'unparalleled', 'unprecedented'
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
    'thought leadership', 'disruptive innovation',
    'scalable solutions', 'robust framework', 'seamlessly integrates',
    'leveraging expertise', 'driving innovation', 'passionate about',
    'dedicated to excellence', 'committed to delivering'
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
    'utilised': 'used',
    'utilise': 'use',
    'scalable': 'flexible',
    'robust': 'strong',
    'seamlessly': 'smoothly',
    'holistic': 'complete',
    'impactful': 'effective',
    'synergistic': 'collaborative',
    'proactively': 'actively',
    'strategically': 'carefully',
    'innovatively': 'creatively',
    'transformative': 'significant',
    'disruptive': 'innovative',
    'groundbreaking': 'notable',
    'game-changing': 'significant',
    'revolutionary': 'new',
    'unparalleled': 'exceptional',
    'unprecedented': 'notable'
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
    'in order to': 'to',
    'scalable solutions': 'flexible solutions',
    'robust framework': 'strong framework',
    'seamlessly integrates': 'integrates smoothly',
    'leveraging expertise': 'using expertise',
    'driving innovation': 'supporting innovation',
    'passionate about': 'focused on',
    'dedicated to excellence': 'committed to quality',
    'committed to delivering': 'focused on delivering'
  };

  // ============ COMPREHENSIVE US TO UK SPELLING CONVERSIONS ============
  // This is the AUTHORITATIVE list - ALL US spellings MUST be converted
  const US_TO_UK_SPELLING = {
    // -ize to -ise (CRITICAL - Most common AI detection pattern)
    'optimize': 'optimise', 'optimized': 'optimised', 'optimizing': 'optimising', 'optimization': 'optimisation', 'optimizer': 'optimiser',
    'organize': 'organise', 'organized': 'organised', 'organizing': 'organising', 'organization': 'organisation', 'organizational': 'organisational', 'organizer': 'organiser',
    'analyze': 'analyse', 'analyzed': 'analysed', 'analyzing': 'analysing', 'analyzer': 'analyser',
    'realize': 'realise', 'realized': 'realised', 'realizing': 'realising', 'realization': 'realisation',
    'specialize': 'specialise', 'specialized': 'specialised', 'specializing': 'specialising', 'specialization': 'specialisation', 'specialist': 'specialist',
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
    'categorize': 'categorise', 'categorized': 'categorised', 'categorizing': 'categorising', 'categorization': 'categorisation',
    'synchronize': 'synchronise', 'synchronized': 'synchronised', 'synchronizing': 'synchronising', 'synchronization': 'synchronisation',
    'utilize': 'use', 'utilized': 'used', 'utilizing': 'using', 'utilization': 'usage',
    'normalize': 'normalise', 'normalized': 'normalised', 'normalizing': 'normalising', 'normalization': 'normalisation',
    'localize': 'localise', 'localized': 'localised', 'localizing': 'localising', 'localization': 'localisation',
    'globalize': 'globalise', 'globalized': 'globalised', 'globalizing': 'globalising', 'globalization': 'globalisation',
    'formalize': 'formalise', 'formalized': 'formalised', 'formalizing': 'formalising', 'formalization': 'formalisation',
    'generalize': 'generalise', 'generalized': 'generalised', 'generalizing': 'generalising', 'generalization': 'generalisation',
    'initialize': 'initialise', 'initialized': 'initialised', 'initializing': 'initialising', 'initialization': 'initialisation',
    'personalize': 'personalise', 'personalized': 'personalised', 'personalizing': 'personalising', 'personalization': 'personalisation',
    'privatize': 'privatise', 'privatized': 'privatised', 'privatizing': 'privatising', 'privatization': 'privatisation',
    'publicize': 'publicise', 'publicized': 'publicised', 'publicizing': 'publicising',
    'rationalize': 'rationalise', 'rationalized': 'rationalised', 'rationalizing': 'rationalising', 'rationalization': 'rationalisation',
    'revolutionize': 'revolutionise', 'revolutionized': 'revolutionised', 'revolutionizing': 'revolutionising',
    'stabilize': 'stabilise', 'stabilized': 'stabilised', 'stabilizing': 'stabilising', 'stabilization': 'stabilisation',
    'terrorize': 'terrorise', 'terrorized': 'terrorised', 'terrorizing': 'terrorising',
    'capitalize': 'capitalise', 'capitalized': 'capitalised', 'capitalizing': 'capitalising', 'capitalization': 'capitalisation',
    'characterize': 'characterise', 'characterized': 'characterised', 'characterizing': 'characterising', 'characterization': 'characterisation',
    'conceptualize': 'conceptualise', 'conceptualized': 'conceptualised', 'conceptualizing': 'conceptualising',
    'contextualize': 'contextualise', 'contextualized': 'contextualised', 'contextualizing': 'contextualising',
    'decentralize': 'decentralise', 'decentralized': 'decentralised', 'decentralizing': 'decentralising', 'decentralization': 'decentralisation',
    'demoralize': 'demoralise', 'demoralized': 'demoralised', 'demoralizing': 'demoralising',
    'energize': 'energise', 'energized': 'energised', 'energizing': 'energising',
    'hospitalize': 'hospitalise', 'hospitalized': 'hospitalised', 'hospitalizing': 'hospitalising',
    'hypothesize': 'hypothesise', 'hypothesized': 'hypothesised', 'hypothesizing': 'hypothesising',
    'immunize': 'immunise', 'immunized': 'immunised', 'immunizing': 'immunising', 'immunization': 'immunisation',
    'jeopardize': 'jeopardise', 'jeopardized': 'jeopardised', 'jeopardizing': 'jeopardising',
    'legalize': 'legalise', 'legalized': 'legalised', 'legalizing': 'legalising', 'legalization': 'legalisation',
    'liberalize': 'liberalise', 'liberalized': 'liberalised', 'liberalizing': 'liberalising', 'liberalization': 'liberalisation',
    'marginalize': 'marginalise', 'marginalized': 'marginalised', 'marginalizing': 'marginalising',
    'materialize': 'materialise', 'materialized': 'materialised', 'materializing': 'materialising',
    'memorize': 'memorise', 'memorized': 'memorised', 'memorizing': 'memorising',
    'neutralize': 'neutralise', 'neutralized': 'neutralised', 'neutralizing': 'neutralising',
    'paralyze': 'paralyse', 'paralyzed': 'paralysed', 'paralyzing': 'paralysing',
    'patronize': 'patronise', 'patronized': 'patronised', 'patronizing': 'patronising',
    'penalize': 'penalise', 'penalized': 'penalised', 'penalizing': 'penalising',
    'pressurize': 'pressurise', 'pressurized': 'pressurised', 'pressurizing': 'pressurising',
    'radicalize': 'radicalise', 'radicalized': 'radicalised', 'radicalizing': 'radicalising',
    'randomize': 'randomise', 'randomized': 'randomised', 'randomizing': 'randomising',
    'reorganize': 'reorganise', 'reorganized': 'reorganised', 'reorganizing': 'reorganising', 'reorganization': 'reorganisation',
    'revitalize': 'revitalise', 'revitalized': 'revitalised', 'revitalizing': 'revitalising',
    'romanticize': 'romanticise', 'romanticized': 'romanticised', 'romanticizing': 'romanticising',
    'scrutinize': 'scrutinise', 'scrutinized': 'scrutinised', 'scrutinizing': 'scrutinising',
    'sensationalize': 'sensationalise', 'sensationalized': 'sensationalised', 'sensationalizing': 'sensationalising',
    'socialize': 'socialise', 'socialized': 'socialised', 'socializing': 'socialising',
    'subsidize': 'subsidise', 'subsidized': 'subsidised', 'subsidizing': 'subsidising',
    'symbolize': 'symbolise', 'symbolized': 'symbolised', 'symbolizing': 'symbolising',
    'sympathize': 'sympathise', 'sympathized': 'sympathised', 'sympathizing': 'sympathising',
    'systematize': 'systematise', 'systematized': 'systematised', 'systematizing': 'systematising',
    'tantalize': 'tantalise', 'tantalized': 'tantalised', 'tantalizing': 'tantalising',
    'traumatize': 'traumatise', 'traumatized': 'traumatised', 'traumatizing': 'traumatising',
    'trivialize': 'trivialise', 'trivialized': 'trivialised', 'trivializing': 'trivialising',
    'vandalize': 'vandalise', 'vandalized': 'vandalised', 'vandalizing': 'vandalising',
    'vaporize': 'vaporise', 'vaporized': 'vaporised', 'vaporizing': 'vaporising',
    'verbalize': 'verbalise', 'verbalized': 'verbalised', 'verbalizing': 'verbalising',
    'visualize': 'visualise', 'visualized': 'visualised', 'visualizing': 'visualising',
    'westernize': 'westernise', 'westernized': 'westernised', 'westernizing': 'westernising',
    
    // -or to -our
    'color': 'colour', 'colors': 'colours', 'colored': 'coloured', 'coloring': 'colouring', 'colorful': 'colourful',
    'favor': 'favour', 'favors': 'favours', 'favored': 'favoured', 'favoring': 'favouring', 'favorite': 'favourite', 'favorable': 'favourable', 'favorably': 'favourably',
    'labor': 'labour', 'labors': 'labours', 'labored': 'laboured', 'laboring': 'labouring', 'laborer': 'labourer',
    'neighbor': 'neighbour', 'neighbors': 'neighbours', 'neighboring': 'neighbouring', 'neighborhood': 'neighbourhood',
    'honor': 'honour', 'honors': 'honours', 'honored': 'honoured', 'honoring': 'honouring', 'honorable': 'honourable',
    'humor': 'humour', 'humors': 'humours', 'humorous': 'humourous',
    'behavior': 'behaviour', 'behaviors': 'behaviours', 'behavioral': 'behavioural',
    'endeavor': 'endeavour', 'endeavors': 'endeavours', 'endeavored': 'endeavoured', 'endeavoring': 'endeavouring',
    'harbor': 'harbour', 'harbors': 'harbours', 'harbored': 'harboured', 'harboring': 'harbouring',
    'flavor': 'flavour', 'flavors': 'flavours', 'flavored': 'flavoured', 'flavoring': 'flavouring', 'flavorful': 'flavourful',
    'savior': 'saviour', 'saviors': 'saviours',
    'vigor': 'vigour', 'vigorous': 'vigourous',
    'rigor': 'rigour', 'rigorous': 'rigourous',
    'rumor': 'rumour', 'rumors': 'rumours', 'rumored': 'rumoured',
    'tumor': 'tumour', 'tumors': 'tumours',
    'clamor': 'clamour', 'clamored': 'clamoured', 'clamoring': 'clamouring',
    'glamor': 'glamour', 'glamorous': 'glamourous',
    'odor': 'odour', 'odors': 'odours', 'odorless': 'odourless',
    'parlor': 'parlour', 'parlors': 'parlours',
    'valor': 'valour',
    
    // -er to -re
    'center': 'centre', 'centers': 'centres', 'centered': 'centred', 'centering': 'centring',
    'meter': 'metre', 'meters': 'metres',
    'liter': 'litre', 'liters': 'litres',
    'fiber': 'fibre', 'fibers': 'fibres',
    'theater': 'theatre', 'theaters': 'theatres',
    'caliber': 'calibre',
    'somber': 'sombre',
    'specter': 'spectre', 'specters': 'spectres',
    'scepter': 'sceptre', 'scepters': 'sceptres',
    'luster': 'lustre',
    'meager': 'meagre',
    
    // -log to -logue
    'analog': 'analogue', 'analogs': 'analogues',
    'catalog': 'catalogue', 'catalogs': 'catalogues', 'cataloged': 'catalogued', 'cataloging': 'cataloguing',
    'dialog': 'dialogue', 'dialogs': 'dialogues',
    'monolog': 'monologue', 'monologs': 'monologues',
    'prolog': 'prologue', 'prologs': 'prologues',
    'epilog': 'epilogue', 'epilogs': 'epilogues',
    
    // -ense to -ence
    'defense': 'defence', 'defenses': 'defences', 'defensive': 'defensive',
    'offense': 'offence', 'offenses': 'offences', 'offensive': 'offensive',
    'license': 'licence', 'licenses': 'licences', 'licensed': 'licenced', 'licensing': 'licencing',
    'pretense': 'pretence', 'pretenses': 'pretences',
    
    // -l to -ll (past tense/gerund)
    'traveled': 'travelled', 'traveling': 'travelling', 'traveler': 'traveller', 'travelers': 'travellers',
    'modeled': 'modelled', 'modeling': 'modelling', 'modeler': 'modeller',
    'canceled': 'cancelled', 'canceling': 'cancelling', 'cancellation': 'cancellation',
    'labeled': 'labelled', 'labeling': 'labelling',
    'leveled': 'levelled', 'leveling': 'levelling',
    'fueled': 'fuelled', 'fueling': 'fuelling',
    'signaled': 'signalled', 'signaling': 'signalling',
    'counseled': 'counselled', 'counseling': 'counselling', 'counselor': 'counsellor',
    'paneled': 'panelled', 'paneling': 'panelling',
    'channeled': 'channelled', 'channeling': 'channelling',
    'dueled': 'duelled', 'dueling': 'duelling',
    'equaled': 'equalled', 'equaling': 'equalling',
    'jeweled': 'jewelled', 'jeweler': 'jeweller', 'jewelry': 'jewellery',
    'marveled': 'marvelled', 'marveling': 'marvelling', 'marvelous': 'marvellous',
    'rivaled': 'rivalled', 'rivaling': 'rivalling',
    'totaled': 'totalled', 'totaling': 'totalling',
    'dialed': 'dialled', 'dialing': 'dialling',
    
    // Other common differences
    'program': 'programme', 'programs': 'programmes',
    'gray': 'grey', 'grays': 'greys',
    'acknowledgment': 'acknowledgement', 'acknowledgments': 'acknowledgements',
    'judgment': 'judgement', 'judgments': 'judgements',
    'fulfill': 'fulfil', 'fulfills': 'fulfils', 'fulfilled': 'fulfilled', 'fulfilling': 'fulfilling', 'fulfillment': 'fulfilment',
    'skillful': 'skilful', 'skillfully': 'skilfully',
    'willful': 'wilful', 'willfully': 'wilfully',
    'enrollment': 'enrolment', 'enrollments': 'enrolments',
    'installment': 'instalment', 'installments': 'instalments',
    'aging': 'ageing',
    'artifact': 'artefact', 'artifacts': 'artefacts',
    'esthetic': 'aesthetic', 'esthetics': 'aesthetics', 'esthetically': 'aesthetically',
    'aluminum': 'aluminium',
    'skeptic': 'sceptic', 'skeptical': 'sceptical', 'skepticism': 'scepticism',
    'maneuver': 'manoeuvre', 'maneuvered': 'manoeuvred', 'maneuvering': 'manoeuvring', 'maneuvers': 'manoeuvres',
    'plow': 'plough', 'plowed': 'ploughed', 'plowing': 'ploughing',
    'inquire': 'enquire', 'inquired': 'enquired', 'inquiring': 'enquiring', 'inquiry': 'enquiry', 'inquiries': 'enquiries',
    'toward': 'towards',
    'backward': 'backwards',
    'forward': 'forwards',
    'afterward': 'afterwards',
    'upward': 'upwards',
    'downward': 'downwards',
    'inward': 'inwards',
    'outward': 'outwards',
    'apologize': 'apologise', 'apologized': 'apologised', 'apologizing': 'apologising',
    'criticize': 'criticise', 'criticized': 'criticised', 'criticizing': 'criticising', 'criticism': 'criticism',
    'baptize': 'baptise', 'baptized': 'baptised', 'baptizing': 'baptising',
    'analyze': 'analyse', 'analyzed': 'analysed', 'analyzing': 'analysing',
    'paralyze': 'paralyse', 'paralyzed': 'paralysed', 'paralyzing': 'paralysing',
    'catalyze': 'catalyse', 'catalyzed': 'catalysed', 'catalyzing': 'catalysing',
    'cozy': 'cosy',
    'donut': 'doughnut', 'donuts': 'doughnuts',
    'draft': 'draught',
    'fulfill': 'fulfil',
    'installment': 'instalment',
    'sulfur': 'sulphur',
    'tire': 'tyre', 'tires': 'tyres',
    'curb': 'kerb',
    'pajamas': 'pyjamas',
    'check': 'cheque', 'checks': 'cheques', // For bank context
    'ax': 'axe',
    'peddler': 'pedlar',
    'molt': 'moult', 'molted': 'moulted', 'molting': 'moulting',
    'smolder': 'smoulder', 'smoldered': 'smouldered', 'smoldering': 'smouldering',
    'mold': 'mould', 'molded': 'moulded', 'molding': 'moulding', 'moldy': 'mouldy',
    'story': 'storey', 'stories': 'storeys', // For buildings
    'pediatric': 'paediatric', 'pediatrics': 'paediatrics', 'pediatrician': 'paediatrician',
    'anesthesia': 'anaesthesia', 'anesthetic': 'anaesthetic', 'anesthetics': 'anaesthetics',
    'encyclopedia': 'encyclopaedia', 'encyclopedias': 'encyclopaedias',
    'gynecology': 'gynaecology', 'gynecologist': 'gynaecologist',
    'archeology': 'archaeology', 'archeological': 'archaeological', 'archeologist': 'archaeologist',
    'medieval': 'mediaeval',
    'fetus': 'foetus', 'fetuses': 'foetuses',
    'hemophilia': 'haemophilia',
    'leukemia': 'leukaemia',
    'orthopedic': 'orthopaedic', 'orthopedics': 'orthopaedics',
    'esophagus': 'oesophagus',
    'estrogen': 'oestrogen',
    'dialog': 'dialogue',
    'catalog': 'catalogue',
    'canceled': 'cancelled',
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
    // CRITICAL: This is the PRIMARY UK enforcement layer
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
      
      // FALLBACK REGEX: Catch ANY remaining -ize/-ization patterns not in dictionary
      // This is the nuclear option to ensure NO US spellings escape
      result = result.replace(/\b(\w+)(izing)\b/gi, (match, root, suffix) => {
        const lowerRoot = root.toLowerCase();
        // Skip if already handled or if it's a word that genuinely ends in -izing in UK English
        const exceptions = ['prizing', 'sizing', 'seizing'];
        if (exceptions.includes(lowerRoot + suffix.toLowerCase())) return match;
        const replacement = root + 'ising';
        // Preserve case
        if (match[0] === match[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
      
      result = result.replace(/\b(\w+)(ized)\b/gi, (match, root, suffix) => {
        const lowerRoot = root.toLowerCase();
        const exceptions = ['prized', 'sized', 'seized'];
        if (exceptions.includes(lowerRoot + suffix.toLowerCase())) return match;
        const replacement = root + 'ised';
        if (match[0] === match[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
      
      result = result.replace(/\b(\w+)(ize)\b/gi, (match, root, suffix) => {
        const lowerRoot = root.toLowerCase();
        const exceptions = ['prize', 'size', 'seize'];
        if (exceptions.includes(lowerRoot + suffix.toLowerCase())) return match;
        const replacement = root + 'ise';
        if (match[0] === match[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
      
      result = result.replace(/\b(\w+)(ization)\b/gi, (match, root, suffix) => {
        const replacement = root + 'isation';
        if (match[0] === match[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
      
      result = result.replace(/\b(\w+)(izations)\b/gi, (match, root, suffix) => {
        const replacement = root + 'isations';
        if (match[0] === match[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
      
      console.log('[ContentQualityEngine] UK spelling conversion complete');
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
  
  console.log('[ContentQualityEngine] v2.0 loaded - STRICT UK English & Anti-AI Detection Active');

})(typeof window !== 'undefined' ? window : this);
