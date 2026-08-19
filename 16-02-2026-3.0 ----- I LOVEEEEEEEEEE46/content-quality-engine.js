// content-quality-engine.js - Anti-AI Detection & Content Quality v3.0
// v3.0: Comprehensive anti-AI humaniser — 200+ banned words, 150+ banned phrases,
//       50+ regex patterns, sentence-structure variation, paragraph-opening diversification

(function(global) {
  'use strict';

  // ============ BANNED WORDS (AI Detection Flags) ============
  const BANNED_WORDS = [
    'orchestrated', 'championed', 'pioneered', 'helmed', 'realm',
    'comprehensive', 'demonstrating', 'showcasing', 'spearheaded',
    'meticulous', 'approximately', 'dynamic', 'synergy', 'cutting-edge',
    'best-in-class', 'world-class', 'results-driven', 'detail-oriented',
    'team player', 'go-getter', 'various', 'assisted',
    'leverage', 'leveraging', 'leveraged',
    'utilize', 'utilizing', 'utilized', 'utilising', 'utilised',
    'utilise', 'utilization', 'utilisation',
    'measurable',
    'proactively', 'proactive', 'passionate', 'passion',
    'extensive experience', 'strong background',
    'highly skilled', 'well-versed', 'adept',
    'robust', 'seamless', 'holistic', 'synergistic', 'transformative',
    'groundbreaking', 'revolutionary', 'unparalleled', 'unprecedented',
    'invaluable', 'instrumental', 'paramount', 'pivotal',
    'fostered', 'cultivated', 'harnessed', 'amplified',
    'delved', 'navigated', 'traversed', 'embarked',
    'multifaceted', 'streamlined', 'nuanced',
    'impactful', 'synergize', 'ideate', 'operationalize',
    'ecosystem', 'landscape', 'wheelhouse', 'deep-dive',
    'self-starter', 'hard-working', 'hardworking',
    'seasoned', 'consummate', 'top-notch', 'first-rate',
    // v3.0 — words flagged by GPTZero, Originality.ai, Turnitin, Copyleaks
    'furthermore', 'moreover', 'additionally', 'subsequently',
    'consequently', 'henceforth', 'nonetheless', 'notwithstanding',
    'facilitate', 'facilitated', 'facilitating',
    'endeavour', 'endeavor', 'endeavoured', 'endeavored',
    'spearhead', 'trailblazing', 'trailblazer',
    'cornerstone', 'linchpin', 'bedrock', 'catalyst',
    'intricate', 'intricacies', 'complexities',
    'plethora', 'myriad', 'copious', 'abundant',
    'burgeoning', 'nascent', 'fledgling',
    'trajectory', 'paradigm', 'ethos',
    'proficient', 'proficiency',
    'adeptly', 'astutely', 'diligently',
    'meticulously', 'rigorously', 'strategically',
    'wholeheartedly', 'steadfastly', 'unwavering',
    'exemplary', 'commendable', 'noteworthy', 'remarkable',
    'indispensable', 'imperative', 'quintessential',
    'amalgamation', 'confluence', 'convergence',
    'bolstered', 'bolster', 'augmented', 'augment',
    'propelled', 'catapulted', 'galvanised', 'galvanized',
    'underscored', 'underscore', 'underscoring',
    'dovetails', 'dovetail', 'dovetailed',
    'juxtapose', 'juxtaposed', 'juxtaposition',
    'dichotomy', 'interplay', 'nexus', 'tapestry',
    'overarching', 'wide-ranging', 'far-reaching',
    'underpinned', 'underpinning', 'underpin',
    'spanned', 'encompassed', 'encompassing',
    'ensured', 'ensuring',
    'whilst', 'hereby', 'therein', 'thereof', 'whereby',
    'aforementioned', 'abovementioned',
    'honed', 'refined',
    'garnered', 'accrued', 'amassed',
    'poised', 'primed',
    'bespoke', 'tailor-made',
    'unmatched', 'unsurpassed', 'unrivalled', 'unrivaled',
    'cognisant', 'cognizant', 'conversant',
    'elucidated', 'elucidate', 'delineated', 'delineate',
    'exigencies', 'vicissitudes'
  ];

  const BANNED_PHRASES = [
    'proven ability', 'proven track record', 'proven record',
    'proven proficiency', 'proven proficiency in', 'proven expertise',
    'the intersection of', 'drive impactful outcomes',
    'strategic initiatives', 'stakeholder environments',
    'think outside the box', 'highly motivated',
    'deep dive', 'low-hanging fruit', 'move the needle',
    'circle back', 'touch base', 'game-changer', 'paradigm shift',
    'best practices', 'core competencies', 'value proposition',
    'actionable insights', 'bandwidth', 'synergize', 'holistic approach',
    'robust solution', 'seamless integration', 'end-to-end',
    'state-of-the-art', 'next-generation', 'mission-critical',
    'thought leadership', 'disruptive innovation',
    'optimizing ci/cd processes', 'optimising ci/cd processes',
    'in order to', 'as well as', 'a wide range of', 'a plethora of',
    'a myriad of', 'wide array of', 'vast array of',
    'plays a crucial role', 'plays a key role', 'plays a vital role',
    'it is worth noting', 'it should be noted', 'it goes without saying',
    'needless to say', 'at the end of the day',
    'fast-paced environment', 'results-oriented professional',
    'strong communicator', 'excellent communication skills',
    'attention to detail', 'works well under pressure',
    'above and beyond', 'hit the ground running',
    'with that being said', 'having said that',
    'in today\'s competitive landscape', 'in this day and age',
    'passionate about', 'enthusiastic about driving',
    'uniquely positioned', 'well-positioned to',
    'demonstrated ability to', 'demonstrated expertise in',
    // v3.0 — deep AI-detection phrases (GPTZero/Originality/Copyleaks research)
    'it is important to note', 'it is crucial to note',
    'it is essential to', 'it is imperative to',
    'in light of', 'in the realm of', 'in the context of',
    'with respect to', 'with regard to', 'in terms of',
    'on the other hand', 'by the same token',
    'to that end', 'to this end', 'in this regard',
    'it cannot be overstated', 'it bears mentioning',
    'a testament to', 'a reflection of',
    'stands as a', 'serves as a testament',
    'has been instrumental in', 'was instrumental in',
    'has played a pivotal role', 'played a pivotal role',
    'at the forefront of', 'has been at the forefront',
    'I am deeply committed', 'deeply committed to',
    'I firmly believe', 'I am firmly committed',
    'I am well-equipped', 'well-equipped to',
    'I am eager to', 'eager to contribute',
    'I bring a wealth of', 'a wealth of experience',
    'track record of success', 'track record of delivering',
    'consistent track record', 'strong track record',
    'hands-on experience with', 'extensive experience with',
    'extensive knowledge of', 'in-depth knowledge of',
    'in-depth understanding', 'deep understanding of',
    'solid understanding of', 'thorough understanding of',
    'significant experience', 'considerable experience',
    'honed my skills', 'sharpened my skills',
    'committed to excellence', 'strive for excellence',
    'dedicated to delivering', 'dedicated to ensuring',
    'aligned with the company', 'aligned with your mission',
    'in a fast-paced', 'thrives in fast-paced',
    'cross-functional collaboration', 'cross-functional teams',
    'I am confident that', 'I am confident my',
    'make me an ideal candidate', 'ideal candidate for',
    'make me a strong candidate', 'strong candidate for',
    'the perfect fit', 'a perfect fit',
    'I look forward to the opportunity', 'relish the opportunity',
    'I welcome the opportunity', 'welcome the chance',
    'I would be thrilled', 'I would be delighted',
    'at your earliest convenience', 'at your convenience',
    'do not hesitate to contact', 'please do not hesitate',
    'thank you for your time and consideration',
    'thank you for considering my application',
    'I am excited about', 'excited to bring',
    'I am enthusiastic about', 'enthusiastic about joining',
    'tangible results', 'tangible outcomes', 'tangible impact',
    'measurable results', 'measurable outcomes', 'measurable impact',
    'concrete results', 'quantifiable results',
    'directly contributed to', 'contributed significantly to',
    'was pivotal in', 'was crucial in', 'was key in',
    'high-stakes environment', 'high-stakes environments',
    'high-visibility', 'high-impact',
    'drove significant', 'drove substantial',
    'successfully implemented', 'successfully delivered',
    'successfully managed', 'successfully led',
    'effectively managed', 'effectively led',
    'strategically planned', 'strategically positioned',
    'throughout my career', 'throughout my tenure',
    'over the course of', 'during my tenure',
    'my professional journey', 'career journey',
    'throughout my professional journey',
    'skill set', 'skillset', 'toolkit',
    'brings to the table', 'bring to the table',
    'in my capacity as', 'in my role as',
    'a combination of', 'combining my',
    'coupled with', 'coupled with my',
    'paired with', 'paired with my',
    'I wholeheartedly', 'I am wholeheartedly',
    'resonates deeply', 'resonates strongly',
    'your esteemed', 'your renowned', 'your prestigious'
  ];

  // ============ AI DETECTION PHRASE PATTERNS (regex) ============
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
    /in tandem with/gi,
    /this (ensured|enabled|allowed|facilitated)/gi,
    /I (successfully|effectively|strategically|proactively)\s/gi,
    /as a result of (my|this|these)/gi,
    /played a (key|crucial|vital|pivotal|instrumental) role/gi,
    /was responsible for/gi,
    /served as (a|the)/gi,
    /tasked with/gi,
    /furthermore,?\s/gi,
    /moreover,?\s/gi,
    /additionally,?\s/gi,
    /in (my|this|the) (capacity|role) as/gi,
    /demonstrat(ed|ing) (a |my )?(strong|deep|solid)/gi,
    // v3.0 — patterns AI detectors specifically key on
    /I am (deeply|firmly|strongly|fully) (committed|convinced|confident|dedicated)/gi,
    /this (position|role|opportunity) (aligns|resonates|dovetails)/gi,
    /I (possess|bring|offer) a (unique|rare|strong|diverse) (combination|blend|mix)/gi,
    /(my|the) ability to (seamlessly|effectively|efficiently|strategically)/gi,
    /I (thrive|excel|flourish) in/gi,
    /has (equipped|prepared|positioned) me/gi,
    /has (honed|sharpened|refined|strengthened) my/gi,
    /I have (consistently|continually|repeatedly) (delivered|exceeded|surpassed)/gi,
    /I am (well-suited|well suited|ideally suited|uniquely suited)/gi,
    /(extensive|considerable|significant|substantial) experience in/gi,
    /a (proven|demonstrated|established|solid|strong) track record/gi,
    /I (believe|feel|think) (that )?my (experience|background|skills)/gi,
    /would (make|render) me (an?|the) (ideal|excellent|strong|perfect)/gi,
    /allow me to (hit the ground running|contribute immediately)/gi,
    /I am (writing|reaching out|applying) to express/gi,
    /I am confident (that |in )?(my|I)/gi,
    /(poised|ready|prepared|equipped) to (make|deliver|drive|contribute)/gi,
    /what (sets|makes) me (apart|unique|different|stand out)/gi,
    /not only .{5,40} but also/gi,
    /both .{3,20} and .{3,20} (skills|abilities|capabilities)/gi,
    /my (unique|diverse|broad|extensive) (background|experience|skill set)/gi,
    /I (look forward|am eager|am excited|am keen) to (the opportunity|discussing|exploring|contributing)/gi,
    /(sincerely|genuinely|truly) (believe|feel|hope)/gi,
    /I have a (strong|genuine|deep) (interest|desire|commitment)/gi,
    /aligns (well|closely|perfectly|directly) with/gi,
    /your (esteemed|renowned|prestigious|respected) (company|organisation|organization|firm)/gi,
    /\b(utilise|utilize|leverage|harness|employ) (my|the|this|these) (expertise|experience|knowledge|skills)\b/gi,
    /I have (always|long) been (passionate|fascinated|interested)/gi,
    /I would (relish|cherish|welcome|appreciate) the (opportunity|chance|prospect)/gi,
    /^(in conclusion|to summarise|to summarize|in summary),?\s/gim,
    /^(as mentioned|as noted|as discussed|as stated|as highlighted),?\s/gim
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
    'measurable': 'quantified',
    // Roast-flagged replacements
    'proactively': '',          // Remove - just state the action
    'proactive': 'anticipatory',
    'passionate': 'committed',
    'passion': 'commitment',
    'highly skilled': 'skilled',
    'well-versed': 'experienced',
    'adept': 'skilled',
    // v3.2 additions — replacements for newly banned words
    'robust understanding': 'strong understanding',
    'robust knowledge': 'strong knowledge',
    'robust': 'reliable',
    'seamless': 'smooth',
    'holistic': 'complete',
    'synergistic': 'collaborative',
    'transformative': 'significant',
    'groundbreaking': 'innovative',
    'revolutionary': 'innovative',
    'unparalleled': 'exceptional',
    'unprecedented': 'first',
    'invaluable': 'valuable',
    'instrumental': 'key',
    'paramount': 'critical',
    'pivotal': 'key',
    'fostered': 'built',
    'cultivated': 'developed',
    'harnessed': 'applied',
    'amplified': 'increased',
    'delved': 'explored',
    'navigated': 'managed',
    'traversed': 'covered',
    'embarked': 'started',
    'multifaceted': 'varied',
    'streamlined': 'simplified',
    'nuanced': 'detailed',
    'impactful': 'effective',
    'synergize': 'collaborate',
    'ideate': 'brainstorm',
    'operationalize': 'implement',
    'ecosystem': 'environment',
    'landscape': 'field',
    'wheelhouse': 'area of expertise',
    'deep-dive': 'analysis',
    'self-starter': 'independent',
    'hard-working': 'dedicated',
    'hardworking': 'dedicated',
    'seasoned': 'experienced',
    'consummate': 'skilled',
    'top-notch': 'excellent',
    'first-rate': 'excellent',
    // v3.0 — replacements for newly banned words
    'furthermore': '',
    'moreover': '',
    'additionally': 'also',
    'subsequently': 'then',
    'consequently': 'so',
    'nonetheless': 'still',
    'notwithstanding': 'despite',
    'facilitate': 'help',
    'facilitated': 'helped',
    'facilitating': 'helping',
    'endeavour': 'effort',
    'endeavor': 'effort',
    'cornerstone': 'foundation',
    'linchpin': 'core',
    'bedrock': 'basis',
    'catalyst': 'driver',
    'intricate': 'complex',
    'plethora': 'many',
    'myriad': 'many',
    'copious': 'many',
    'abundant': 'plenty of',
    'trajectory': 'direction',
    'paradigm': 'model',
    'ethos': 'culture',
    'proficient': 'skilled',
    'proficiency': 'skill',
    'adeptly': 'well',
    'astutely': 'carefully',
    'diligently': 'carefully',
    'meticulously': 'carefully',
    'rigorously': 'thoroughly',
    'strategically': '',
    'wholeheartedly': 'fully',
    'steadfastly': 'consistently',
    'unwavering': 'steady',
    'exemplary': 'strong',
    'commendable': 'good',
    'noteworthy': 'notable',
    'remarkable': 'strong',
    'indispensable': 'essential',
    'imperative': 'important',
    'quintessential': 'typical',
    'bolstered': 'strengthened',
    'bolster': 'strengthen',
    'augmented': 'added to',
    'augment': 'add to',
    'propelled': 'moved',
    'catapulted': 'pushed',
    'galvanised': 'motivated',
    'galvanized': 'motivated',
    'underscored': 'showed',
    'underscore': 'show',
    'overarching': 'broad',
    'wide-ranging': 'broad',
    'far-reaching': 'broad',
    'underpinned': 'supported',
    'underpinning': 'supporting',
    'encompassed': 'included',
    'encompassing': 'including',
    'ensured': 'made sure',
    'ensuring': 'making sure',
    'whilst': 'while',
    'hereby': '',
    'aforementioned': 'previous',
    'honed': 'improved',
    'refined': 'improved',
    'garnered': 'gained',
    'accrued': 'gained',
    'amassed': 'built up',
    'poised': 'ready',
    'primed': 'ready',
    'bespoke': 'custom',
    'tailor-made': 'custom',
    'unmatched': 'strong',
    'unsurpassed': 'top',
    'unrivalled': 'top',
    'unrivaled': 'top',
    'cognisant': 'aware',
    'cognizant': 'aware',
    'conversant': 'familiar'
  };

  const PHRASE_REPLACEMENTS = {
    // "Proven X" phrases (must be removed, not rephrased)
    // User requirement: replace "proven ability" with plain "ability" (no adjectives)
    'proven ability': 'ability',
    'proven track record': 'experience',
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
    'in order to': 'to',
    // v3.2 additions — expanded phrase replacements for natural language
    'as well as': 'and',
    'a wide range of': 'various',
    'a plethora of': 'many',
    'a myriad of': 'many',
    'wide array of': 'range of',
    'vast array of': 'range of',
    'plays a crucial role': 'contributes to',
    'plays a key role': 'contributes to',
    'plays a vital role': 'supports',
    'it is worth noting': '',
    'it should be noted': '',
    'needless to say': '',
    'it goes without saying': '',
    'at the end of the day': 'ultimately',
    'fast-paced environment': 'busy environment',
    'above and beyond': 'beyond expectations',
    'hit the ground running': 'start contributing immediately',
    'with that being said': '',
    'having said that': '',
    'in today\'s competitive landscape': 'currently',
    'in this day and age': 'today',
    'passionate about': 'committed to',
    'enthusiastic about driving': 'focused on delivering',
    'uniquely positioned': 'well suited',
    'well-positioned to': 'ready to',
    'demonstrated ability to': 'ability to',
    'demonstrated expertise in': 'expertise in',
    'was responsible for': '',
    'served as a': 'worked as a',
    'served as the': 'worked as the',
    'tasked with': '',
    'furthermore': '',
    'moreover': '',
    'additionally': 'also',
    // v3.0 — replacements for newly banned phrases
    'it is important to note': '',
    'it is crucial to note': '',
    'it is essential to': 'I need to',
    'it is imperative to': 'I need to',
    'in light of': 'given',
    'in the realm of': 'in',
    'in the context of': 'within',
    'with respect to': 'about',
    'with regard to': 'about',
    'in terms of': 'for',
    'to that end': 'so',
    'to this end': 'so',
    'in this regard': 'here',
    'it cannot be overstated': '',
    'it bears mentioning': '',
    'a testament to': 'showing',
    'a reflection of': 'showing',
    'at the forefront of': 'leading',
    'I am deeply committed': 'I am committed',
    'deeply committed to': 'committed to',
    'I am firmly committed': 'I am committed',
    'I firmly believe': 'I believe',
    'I am well-equipped': 'I am ready',
    'well-equipped to': 'ready to',
    'I am eager to': 'I want to',
    'eager to contribute': 'ready to contribute',
    'I bring a wealth of': 'I bring',
    'a wealth of experience': 'experience',
    'track record of success': 'record of success',
    'track record of delivering': 'history of delivering',
    'extensive experience with': 'experience with',
    'extensive knowledge of': 'knowledge of',
    'in-depth knowledge of': 'knowledge of',
    'in-depth understanding': 'understanding',
    'deep understanding of': 'understanding of',
    'solid understanding of': 'understanding of',
    'thorough understanding of': 'understanding of',
    'significant experience': 'experience',
    'considerable experience': 'experience',
    'honed my skills': 'built my skills',
    'committed to excellence': 'committed to quality',
    'I am confident that': '',
    'I am confident my': 'My',
    'make me an ideal candidate': 'suit this role',
    'ideal candidate for': 'a fit for',
    'make me a strong candidate': 'suit this role',
    'I look forward to the opportunity': 'I look forward',
    'I welcome the opportunity': 'I would like',
    'I would be thrilled': 'I would be glad',
    'I would be delighted': 'I would be glad',
    'at your earliest convenience': 'when convenient',
    'do not hesitate to contact': 'feel free to contact',
    'please do not hesitate': 'feel free',
    'tangible results': 'results',
    'tangible outcomes': 'outcomes',
    'measurable results': 'results',
    'measurable outcomes': 'outcomes',
    'concrete results': 'results',
    'quantifiable results': 'results',
    'successfully implemented': 'implemented',
    'successfully delivered': 'delivered',
    'successfully managed': 'managed',
    'successfully led': 'led',
    'effectively managed': 'managed',
    'effectively led': 'led',
    'strategically planned': 'planned',
    'throughout my career': 'across my career',
    'over the course of': 'over',
    'during my tenure': 'while there',
    'my professional journey': 'my career',
    'career journey': 'career',
    'skill set': 'skills',
    'skillset': 'skills',
    'toolkit': 'skills',
    'brings to the table': 'offers',
    'bring to the table': 'offer',
    'in my capacity as': 'as',
    'in my role as': 'as',
    'coupled with': 'along with',
    'coupled with my': 'along with my',
    'I am excited about': 'I am interested in',
    'I am enthusiastic about': 'I am interested in',
    'high-stakes environment': 'demanding environment',
    'high-visibility': 'visible',
    'high-impact': 'important',
    'cross-functional collaboration': 'working across teams',
    'cross-functional teams': 'mixed teams',
    'your esteemed': 'your',
    'your renowned': 'your',
    'your prestigious': 'your'
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

  // ============ UK -> US, for postings in American English ============
  //
  // Built by inverting the map above rather than maintaining a second
  // one, so the two directions can never drift apart. Three kinds of
  // entry must NOT be inverted:
  //
  //   'utilize' -> 'use'      a word-quality rule, not a spelling one.
  //                           Inverted it would turn every "use" in the
  //                           CV into "utilize", which is the exact
  //                           padding the engine exists to remove.
  //   'analysis' -> 'analysis' identity pairs, present in the map only as
  //                           a guard. Inverting them is a no-op at best.
  //   'inquire' -> 'enquire'  kept, but see below: several UK forms are
  //                           ordinary English words in their own right.
  //
  // The point of the direction is literal ATS keyword matching. A Chicago
  // posting asking for "optimization" scores nothing against a CV that
  // says "optimisation".
  const NEVER_FROM_UK = new Set([
    'use', 'used', 'using', 'usage',            // the utilize->use rule
    'programme', 'programmes',                  // 'program' is correct in
                                                // computing in BOTH, and
                                                // the map excludes it
  ]);

  const UK_TO_US_SPELLING = (() => {
    const out = {};
    for (const us of Object.keys(US_TO_UK_SPELLING)) {
      const uk = US_TO_UK_SPELLING[us];
      if (!uk || uk === us) continue;           // identity guard
      if (NEVER_FROM_UK.has(uk)) continue;      // not a spelling pair
      // First writer wins, so 'utilise'->'use' cannot overwrite a real
      // pair that was registered earlier.
      if (!(uk in out)) out[uk] = us;
    }
    return out;
  })();

  // A word is left alone when it is Capitalised in the middle of a
  // sentence, because that is a proper noun and not prose: "World Health
  // Organisation" and "Defence Forces Ireland" are names, and an employer
  // or certification name must survive verbatim. Sentence-initial and
  // bullet-initial capitals are ordinary text and are converted.
  function _isMidSentenceCapital(text, offset, match) {
    if (match[0] !== match[0].toUpperCase() || match[0] === match[0].toLowerCase()) return false;
    const before = text.slice(0, offset).replace(/[ \t]+$/, '');
    if (!before) return false;                          // start of document
    if (/[.!?:\n]$/.test(before)) return false;         // start of sentence
    if (/[-•*]$/.test(before)) return false;            // start of a bullet
    return true;
  }

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
        removePronouns = true,
        // 'UK' | 'US'. Which English the posting is written in, from
        // RegionalFormat.resolveRegion(). Defaults to UK, which is what
        // this engine always did.
        spelling = 'UK'
      } = options;

      let result = text;

      // Step 0: Swap the letter formulas for plainer wording BEFORE any
      // deletion pass sees them. Order is the whole point: run after the
      // banned-phrase removal and there is nothing left to swap, only the
      // wreckage it left -- ", my interest in X" and "The opportunity to
      // work at Acme" were both produced that way.
      result = this.letterBoilerplate(result);

      // Step 1: Remove banned words and phrases FIRST (before spelling, since some banned words have US spelling)
      if (removeBannedWords) {
        result = this.removeBannedContent(result);
      }

      // Step 2: Match the posting's English. An ATS that scores keywords
      // by literal substring match does not know "optimise" and
      // "optimization" are the same word.
      if (convertToUK) {
        result = spelling === 'US'
          ? this.convertToUSSpelling(result)
          : this.convertToUKSpelling(result);
      }

      // Step 3: Remove em dashes, and the approximation markers that read
      // as a guessed number.
      if (removeEmDashes) {
        result = this.removeEmDashes(result);
      }
      result = this.stripApproximations(result);

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

      // Step 7: Humaniser pass — break AI-detectable patterns
      result = this.humaniseText(result);

      // Final cleanup
      result = this.finalCleanup(result);

      return result;
    },

    // ============ HUMANISER PASS (v3.0 anti-AI detection) ============
    humaniseText(text) {
      if (!text || typeof text !== 'string') return text;
      let r = text;

      // 1. REMOVED: substituting the subject pronoun.
      //
      // This rewrote ". I <verb>" into ". This <verb>", ". My <verb>" or
      // ". <verb>", and no branch of it produces valid English:
      //
      //   "I think I could add value"  -> "This think I could add value"
      //   "I have gone from..."        -> "My have gone from..."
      //   "I am particularly proud"    -> "am particularly proud"
      //
      // The auxiliary list it relied on covers only nine verbs, so any
      // other verb left the substitution stranded with no subject at
      // all. It fired on 60% of first-person sentences, which in a cover
      // letter -- a document that is first-person by nature -- is most
      // of the text. Varying sentence openings is a real goal; swapping
      // out the subject is not a way to achieve it.
      //
      // The contraction variation below does the same job grammatically.

      // 2. Vary paragraph/sentence openers — flag if 3+ consecutive sentences start same way
      //
      // Rewritten to work a line at a time. It used to split the WHOLE
      // text on sentence boundaries and rejoin with `sentences.join(' ')`,
      // which replaced every newline between them with a space -- so a
      // four-paragraph cover letter came out as one unbroken block.
      r = r.split('\n').map((lineText) => {
        const sentences = lineText.split(/(?<=[.!?])\s+/);
        if (sentences.length < 3) return lineText;
        const openers = sentences.map((s) => (s.match(/^\S+/) || [''])[0].toLowerCase());
        for (let i = 2; i < openers.length; i++) {
          if (openers[i] && openers[i] === openers[i - 1] && openers[i] === openers[i - 2]) {
            const alts = ['Specifically, ', 'For example, ', 'In practice, ', 'Here, ', 'One example: '];
            const pick = alts[Math.floor(Math.random() * alts.length)];
            sentences[i] = pick + sentences[i].charAt(0).toLowerCase() + sentences[i].slice(1);
          }
        }
        return sentences.join(' ');
      }).join('\n');

      // 3. Contract formal phrases to casual contractions (human writers use these)
      r = r.replace(/\bI have\b/g, () => Math.random() < 0.4 ? "I've" : 'I have');
      r = r.replace(/\bI would\b/g, () => Math.random() < 0.4 ? "I'd" : 'I would');
      r = r.replace(/\bI will\b/g, () => Math.random() < 0.3 ? "I'll" : 'I will');
      r = r.replace(/\bdo not\b/g, () => Math.random() < 0.3 ? "don't" : 'do not');
      r = r.replace(/\bdid not\b/g, () => Math.random() < 0.3 ? "didn't" : 'did not');
      r = r.replace(/\bcannot\b/g, () => Math.random() < 0.3 ? "can't" : 'cannot');
      r = r.replace(/\bwould not\b/g, () => Math.random() < 0.3 ? "wouldn't" : 'would not');
      r = r.replace(/\bit is\b/g, () => Math.random() < 0.3 ? "it's" : 'it is');
      r = r.replace(/\bthat is\b/g, () => Math.random() < 0.3 ? "that's" : 'that is');

      // 4. Vary sentence length — split overly long sentences (AI tends to write long, even ones)
      r = r.replace(/([^.!?]{120,?})(,\s)(which |that |where |and )/g, (m, before, comma, conj) => {
        if (Math.random() < 0.4) return before + '. ' + conj.charAt(0).toUpperCase() + conj.slice(1);
        return m;
      });

      // 5. Remove adverb-stacking (two+ adverbs near each other is an AI signature)
      r = r.replace(/\b(consistently|effectively|efficiently|significantly|substantially|dramatically|tremendously|considerably)\s+(improved|enhanced|increased|reduced|decreased|boosted|grew|delivered)/gi,
        (m, adv, verb) => verb);

      // 6. Replace passive "was/were + past participle" with active where possible
      r = r.replace(/\bwas (given|assigned|tasked|entrusted|appointed)\b/gi, 'received');
      r = r.replace(/\bwere (implemented|deployed|developed|built|created)\b/gi, (m, verb) => verb);

      // 7. Remove filler hedging that AI inserts ("I believe that", "I feel that")
      r = r.replace(/\bI (believe|feel|think) that\b/gi, '');

      // 8. Collapse double spaces introduced by removals
      r = r.replace(/ {2,}/g, ' ');
      r = r.replace(/\.\s*\.\s/g, '. ');

      return r.trim();
    },

    // ============ CV/ATS BLOCK SANITISATION (Preserve line layout) ============
    // For multi-line CV blocks we avoid adding sentence-ending punctuation per line.
    // `spelling` is 'UK' (the default and the historical behaviour) or
    // 'US' when the posting is North American. Callers get it from
    // RegionalFormat.resolveRegion(jobLocation).spelling.
    sanitiseCVBlock(text, spelling) {
      // FIRST: Fix inline headers (e.g., "SKILLS: PYTHON, JAVA, C++" → separate lines with proper casing)
      let result = this.normaliseInlineHeaders(text);

      result = this.sanitiseContent(result, {
        convertToUK: true,
        removeBannedWords: true,
        removeEmDashes: true,
        fixPunctuation: false,
        removePronouns: true,
        spelling: spelling === 'US' ? 'US' : 'UK'
      });

      // ██ FINAL NEVER-LEAK GUARD ██
      // Catches any stray spellings or banned words that survived the pipeline
      result = this.neverLeakGuard(result, spelling);

      return result;
    },

    // ============ INBUILT AI-TELL SCORER ============
    //
    // Runs locally, in the extension, with no model and no dependency.
    //
    // The alternative was a real classifier -- Desklib, the old OpenAI
    // RoBERTa detector -- and both are Python and PyTorch. Running one
    // means sending the CV to a server, which is precisely the exposure
    // this extension exists to avoid. A detector that leaks the document
    // it is protecting is not a trade worth making.
    //
    // So this takes the heuristics rather than the model: vocabulary
    // diversity, sentence-length variation, passive voice and stock
    // phrasing are all a handful of statistics over the text, and they
    // are the same signals the lightweight open-source detectors use.
    //
    // WHAT THIS SCORE IS NOT: it is not QuillBot's number and will never
    // match it. Different model, different training, and their own report
    // says no detector is reliable. What it is good for is direction --
    // it falls when the text genuinely improves, and it names the
    // sentences responsible so they can be fixed rather than guessed at.
    scoreAiTells(text) {
      const src = String(text || '');
      const tells = [];
      if (src.trim().split(/\s+/).filter(Boolean).length < 40) {
        return { score: 0, tells: [], note: 'too short to judge' };
      }

      const sentences = (src.match(/[^.!?\n]+[.!?]/g) || [])
        .map((x) => x.trim()).filter((x) => x.split(/\s+/).length > 2);
      const words = src.toLowerCase().match(/[a-z][a-z'-]+/g) || [];
      let score = 0;

      // 1. BURSTINESS. Human writing varies sentence length a lot; a
      // model holds a steady rhythm. Measured as the coefficient of
      // variation, which is scale-free so it works on any length.
      if (sentences.length >= 4) {
        const lens = sentences.map((x) => x.split(/\s+/).length);
        const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
        const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
        const cv = mean ? sd / mean : 0;
        if (cv < 0.35) {
          score += 25;
          tells.push({ kind: 'uniform-sentence-length', detail:
            'sentences vary by only ' + Math.round(cv * 100) + '% around the mean; '
            + 'human writing usually varies 40% or more' });
        }
      }

      // 2. VOCABULARY DIVERSITY, over the first 200 words so the ratio
      // is not simply a function of length.
      const window = words.slice(0, 200);
      if (window.length >= 80) {
        const ttr = new Set(window).size / window.length;
        if (ttr < 0.45) {
          score += 15;
          tells.push({ kind: 'low-vocabulary-diversity', detail:
            Math.round(ttr * 100) + '% unique words in the first 200' });
        }
      }

      // 3. PARTICIPIAL TAILS. ", enabling X", ", ensuring Y", ", allowing
      // Z" closing a clause is the single most characteristic shape of
      // generated CV prose, and rare in writing people do themselves.
      const tails = (src.match(/,\s+(?:enabling|ensuring|allowing|providing|delivering|driving|leveraging|facilitating|streamlining|empowering)\b/gi) || []);
      if (tails.length >= 2) {
        score += Math.min(25, tails.length * 8);
        tells.push({ kind: 'participial-tails', count: tails.length, detail:
          tails.length + ' clauses end with ", enabling/ensuring/allowing ..."' });
      }

      // 4. TRICOLONS. "A, B, and C" once is normal; three times in a
      // short document is a rhythm, not a coincidence.
      const tri = (src.match(/\b\w+, \w+,? and \w+/g) || []);
      if (tri.length >= 3) {
        score += 10;
        tells.push({ kind: 'tricolon-rhythm', count: tri.length, detail:
          tri.length + ' three-item lists' });
      }

      // 5. STOCK PHRASING that survived the substitutions above.
      const STOCK = [/\bfast-paced environment/i, /\bproven track record/i,
        /\bresults-driven/i, /\bdynamic professional/i, /\bcross-functional teams\b/i,
        /\bhigh-quality (?:solutions|products|results)/i, /\bmake a difference/i,
        /\bwealth of experience/i, /\bpassionate about/i, /\bseamless(?:ly)?\b/i,
        /\bcutting-edge/i, /\bmeticulous/i, /\bhoned my skills/i];
      const stockHits = STOCK.filter((re) => re.test(src));
      if (stockHits.length) {
        score += Math.min(20, stockHits.length * 7);
        tells.push({ kind: 'stock-phrasing', count: stockHits.length, detail:
          stockHits.length + ' stock phrase(s) still present' });
      }

      // 6. PASSIVE VOICE, which models reach for far more than people do.
      if (sentences.length >= 4) {
        const passive = sentences.filter((x) =>
          /\b(?:was|were|been|being|is|are)\s+\w+(?:ed|en)\b/i.test(x)).length;
        const rate = passive / sentences.length;
        if (rate > 0.3) {
          score += 10;
          tells.push({ kind: 'passive-voice', detail:
            Math.round(rate * 100) + '% of sentences are passive' });
        }
      }

      return {
        score: Math.min(100, score),
        tells,
        sentences: sentences.length,
        note: 'local heuristic, not a classifier; use it for direction, not as a verdict',
      };
    },

    // ============ TURN THE TELLS INTO A REWRITE INSTRUCTION ============
    //
    // The scorer says what is wrong. This says what to do about it, in a
    // form that can be appended to the generation prompt so the next
    // draft comes out right instead of being patched afterwards.
    //
    // Why not just rewrite the text here: this session established, at
    // some cost, that mechanically editing real prose reads WORSE than
    // leaving it. Deleting a buzzword produced "with a ability" and "with
    // in driving"; splitting a bullet at its participial tail would need
    // the same kind of surgery on grammar the code cannot actually
    // parse. A model writing fresh produces grammatical sentences; a
    // regex operating on someone's CV produces wreckage, and wreckage is
    // the loudest machine tell there is.
    //
    // So the tells go back into generation. The instructions are concrete
    // and about STRUCTURE, never about inserting errors or padding --
    // varied sentence length and fewer three-item lists are simply what
    // good CV writing looks like, which is why they read as human.
    aiTellsInstruction(text) {
      const r = this.scoreAiTells(text);
      if (!r.tells.length) return '';
      const lines = [];
      for (const tell of r.tells) {
        if (tell.kind === 'uniform-sentence-length') {
          lines.push('Vary the length of the bullets sharply. Right now they are '
            + 'all within a few words of each other, which is the single clearest '
            + 'sign of generated text. Mix short ones of eight to twelve words with '
            + 'longer ones; let at least two be under twelve words.');
        } else if (tell.kind === 'participial-tails') {
          lines.push('Stop ending clauses with ", enabling ...", ", ensuring ..." '
            + 'or ", allowing ...". There are ' + tell.count + '. Put the result in '
            + 'its own short sentence, or state it directly.');
        } else if (tell.kind === 'tricolon-rhythm') {
          lines.push('Reduce the three-item lists ("A, B, and C"). There are '
            + tell.count + '. Two items, or one specific item, reads as a person '
            + 'writing rather than a pattern being filled.');
        } else if (tell.kind === 'stock-phrasing') {
          lines.push('Remove the remaining stock phrasing and say the specific '
            + 'thing instead.');
        } else if (tell.kind === 'low-vocabulary-diversity') {
          lines.push('Widen the vocabulary; the same words are repeating.');
        } else if (tell.kind === 'passive-voice') {
          lines.push('Use the active voice. ' + tell.detail + '.');
        }
      }
      return lines.length
        ? 'REWRITE NOTES (structure only -- keep every fact, never add errors '
          + 'or padding):\n- ' + lines.join('\n- ')
        : '';
    },

    // ============ REPLACE LETTER BOILERPLATE, DO NOT DELETE IT ============
    //
    // A cover letter scored 100% AI. The tells were not subtle words --
    // they were whole formulas that every generated letter opens and
    // closes with:
    //
    //   "I am writing to express my interest in the X position at Y"
    //   "I am excited about the opportunity to ... make a difference"
    //   "at your earliest convenience"
    //   "This experience honed my skills in ..."
    //
    // Deleting them made it worse, not better. "I am writing to express
    // my interest in X" became ", my interest in X" -- a sentence opening
    // with a comma -- and "I am excited about the opportunity to work at
    // Acme" became "The opportunity to work at Acme", which is not a
    // sentence. Wreckage reads as machine-written far more loudly than
    // the boilerplate did.
    //
    // So these are SUBSTITUTED for the plainer thing a person actually
    // writes, before any deletion pass can see them. Same meaning, no
    // debris, and none of it is the phrasing a detector has been trained
    // on. This runs first for that reason.
    letterBoilerplate(text) {
      if (!text || typeof text !== 'string') return text;
      const SWAPS = [
        [/\bI am writing to (?:express|convey|share) my (?:strong |keen |genuine )?interest in\b/gi, 'I am applying for'],
        [/\bI am writing to apply for\b/gi, 'I am applying for'],
        [/\bI am (?:very |really |truly )?excited (?:about|for) the opportunity to\b/gi, 'I would like to'],
        [/\bI am (?:very |really |truly )?(?:excited|thrilled|delighted) to (?:apply|submit)\b/gi, 'I am applying'],
        [/\bat your earliest convenience\b/gi, 'whenever suits you'],
        [/\bI look forward to (?:the opportunity of )?discussing how my skills(?: and experiences?)? align with your needs\b/gi,
          'I would welcome the chance to talk it through'],
        [/\bthis experience honed my skills in\b/gi, 'that work taught me'],
        [/\bwhich further solidified my expertise in\b/gi, 'which deepened my work in'],
        [/\bcontribute to innovative projects that make a difference\b/gi, 'do work that matters'],
        [/\bwith a strong (?:foundation|background) in\b/gi, 'having worked in'],
        [/\bI have successfully (\w+ed)\b/gi, 'I $1'],
        [/\bwhich aligns well with\b/gi, 'which matches'],
        [/\bleveraging my expertise in\b/gi, 'using my work in'],
        [/\bI am confident that my (?:skills and )?experience\b/gi, 'My experience'],
        [/\bthank you for (?:your time and )?considering my application\b/gi, 'Thank you for reading this'],
      ];
      let out = text;
      for (const [re, to] of SWAPS) out = out.replace(re, to);
      return out;
    },

    // ============ AN UNFILLED PLACEHOLDER MUST NEVER SHIP ============
    //
    // A generated cover letter went out containing, verbatim:
    //
    //   "I am eager to expand my knowledge in specific areas such as
    //    [insert specific technology or skill mentioned in the job
    //    description that the candidate lacks]."
    //
    // That is an instruction to the model, printed to the recruiter. It
    // is worse than any AI-detection score: it says the letter was
    // generated AND never read, and it volunteers a gap in the same
    // breath. One of those ends an application on its own.
    //
    // The guard removes the whole SENTENCE, not just the brackets.
    // Deleting the bracket alone leaves "...areas such as ." which is
    // its own tell, and the sentence exists only to host the placeholder.
    // If that empties a paragraph, the paragraph goes too: a missing
    // paragraph is invisible, a broken one is not.
    stripUnfilledPlaceholders(text) {
      if (!text || typeof text !== 'string') return text;

      // Square brackets are the common shape, but the same leak arrives
      // as {{mustache}}, <angle>, and bare TBD/TODO/XXX markers.
      const PLACEHOLDER = /(\[[^\]\n]{3,}\]|\{\{[^}\n]+\}\}|<[a-z][^>\n]{3,}>|\b(?:TBD|TODO|XXX|FIXME|LOREM IPSUM)\b|\byour company name\b|\binsert [a-z][^.!?\n]{0,80})/i;

      const paragraphs = text.split(/\n/);
      const kept = paragraphs.map((para) => {
        if (!PLACEHOLDER.test(para)) return para;
        // Split into sentences, drop only the offending ones.
        const sentences = para.match(/[^.!?]+[.!?]*/g) || [para];
        const survivors = sentences.filter((sn) => !PLACEHOLDER.test(sn));
        const rebuilt = survivors.join(' ').replace(/\s{2,}/g, ' ').trim();
        // A paragraph reduced to a fragment is worse than one removed.
        return rebuilt.split(/\s+/).filter(Boolean).length >= 4 ? rebuilt : '';
      });

      return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    },

    // ============ NEVER-LEAK GUARD ============
    // Absolute last-resort catch for words that MUST NEVER appear in output
    // `spelling` is 'UK' (default, and what this always did) or 'US'.
    // The spelling half of the guard flips with it; the word-quality half
    // -- utilize/leverage/spearheaded and the rest -- is the same in every
    // country and never flips.
    neverLeakGuard(text, spelling) {
      if (!text || typeof text !== 'string') return text;

      // First, because a placeholder shipping is worse than any spelling.
      text = this.stripUnfilledPlaceholders(text);

      // Spelling, in whichever English the posting is written in. These
      // exist because the map upstream can be bypassed; the guard is the
      // last line and has to agree with the region, or it silently undoes
      // the conversion it was meant to protect.
      const FORCE_UK = [
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
      ];
      const FORCE_US = [
        [/\bmodernise\b/gi, 'modernize'],
        [/\bmodernised\b/gi, 'modernized'],
        [/\bmodernising\b/gi, 'modernizing'],
        [/\bmodernises\b/gi, 'modernizes'],
        [/\bmodernisation\b/gi, 'modernization'],
        [/\banalysing\b/gi, 'analyzing'],
        [/\banalysed\b/gi, 'analyzed'],
        [/\banalyse\b/gi, 'analyze'],
        [/\banalyses\b/gi, 'analyzes'],
        [/\banalyser\b/gi, 'analyzer'],
        [/\boptimising\b/gi, 'optimizing'],
        [/\boptimised\b/gi, 'optimized'],
        [/\boptimise\b/gi, 'optimize'],
        [/\boptimisation\b/gi, 'optimization'],
      ];

      // These MUST be replaced no matter what — case-insensitive word-boundary match
      const ABSOLUTE_REPLACEMENTS = [
        // "utilise" is padding for "use" in both Englishes, so this pair
        // is a word-quality rule and stays in force for every region.
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
      ].concat(spelling === 'US' ? FORCE_US : FORCE_UK).concat([
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
        // v3.2 additions to never-leak guard
        // "reliable" fits a system, not an abstract noun: "robust
        // understanding" became "reliable understanding", which is not
        // English anyone writes. Pick by what the word is modifying.
        [/\brobust\b(?=\s+(?:understanding|knowledge|grasp|background|experience|command|appreciation|foundation))/gi, 'strong'],
        [/\brobust\b(?=\s+(?:set|suite|range|portfolio))/gi, 'broad'],
        [/\brobust\b/gi, 'reliable'],
        [/\bseamless\b/gi, 'smooth'],
        [/\bholistic\b/gi, 'complete'],
        [/\btransformative\b/gi, 'significant'],
        [/\bgroundbreaking\b/gi, 'innovative'],
        [/\bunparalleled\b/gi, 'exceptional'],
        [/\binstrumental\b/gi, 'key'],
        [/\bpivotal\b/gi, 'key'],
        [/\bfostered\b/gi, 'built'],
        [/\bcultivated\b/gi, 'developed'],
        [/\bharnessed\b/gi, 'applied'],
        [/\bdelved\b/gi, 'explored'],
        [/\bimpactful\b/gi, 'effective'],
        [/\bstreamlined\b/gi, 'simplified'],
        [/\bnuanced\b/gi, 'detailed'],
        [/\bseasoned\b/gi, 'experienced'],
        [/\bmeticulous\b/gi, 'detailed'],
        // Phrases that must be replaced (multi-word)
        [/\bproven ability\b/gi, 'ability'],
        [/\bproven track record\b/gi, 'experience'],
        [/\bproven expertise\b/gi, 'expertise'],
        [/\bresults-driven\b/gi, 'results-focused'],
        [/\bself-motivated\b/gi, 'proactive'],
        [/\bgo-getter\b/gi, 'driven professional'],
        [/\bsynergy\b/gi, 'collaboration'],
        [/\bsynergies\b/gi, 'collaborations'],
        [/\bparadigm\b/gi, 'approach'],
        [/\brobust\b/gi, 'strong'],
      ]);

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

    // ============ CONVERT UK -> US SPELLING ============
    // Runs instead of convertToUKSpelling when the posting is American.
    // Explicit map only -- no generic -ise -> -ize fallback, because that
    // fallback would have to know that advise, supervise, expertise,
    // enterprise, advertise, comprise, revise, devise, promise, precise
    // and franchise are spelt -ise in American English too. A curated map
    // cannot make that mistake; a regex eventually will.
    convertToUSSpelling(text) {
      if (!text || typeof text !== 'string') return text;
      let result = text;

      const sortedWords = Object.keys(UK_TO_US_SPELLING).sort((a, b) => b.length - a.length);
      for (const ukWord of sortedWords) {
        const usWord = UK_TO_US_SPELLING[ukWord];
        const regex = new RegExp(`\\b${ukWord}\\b`, 'gi');
        result = result.replace(regex, (match, offset, whole) => {
          if (_isMidSentenceCapital(whole, offset, match)) return match;
          if (match === match.toUpperCase()) return usWord.toUpperCase();
          if (match[0] === match[0].toUpperCase()) {
            return usWord.charAt(0).toUpperCase() + usWord.slice(1);
          }
          return usWord;
        });
      }
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

      // Context-sensitive substitutions, BEFORE the word loop below.
      //
      // That loop walks BANNED_WORDS and looks up a single replacement
      // per word, so "robust" always became "reliable" -- which fits a
      // system and not an abstract noun. A real generated cover letter
      // went out saying "I possess a reliable understanding of data
      // profiling", which is not English anyone writes. Choosing by what
      // the word modifies has to happen before the blanket swap.
      result = result
        .replace(/\brobust\b(?=\s+(?:understanding|knowledge|grasp|background|experience|command|appreciation|foundation))/gi, 'strong')
        .replace(/\brobust\b(?=\s+(?:set|suite|range|portfolio))/gi, 'broad')
        .replace(/\bcomprehensive\b(?=\s+(?:understanding|knowledge|grasp))/gi, 'thorough');

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
    // "~40%" is the symbol form of "approximately", which is already a
    // banned word -- so the ban was evaded by writing it as punctuation.
    // A hedged figure reads as a guessed figure, which costs more
    // credibility than having no figure at all.
    stripApproximations(text) {
      if (!text) return text;
      return String(text)
        // ~40%, ≈40%, c.40%, approx. 40%, circa 40%, around 40%
        .replace(/[~≈∼]\s*(?=[\d£$€])/g, '')
        .replace(/\b(?:approx\.?|circa|c\.)\s+(?=[\d£$€])/gi, '')
        .replace(/\b(?:roughly|approximately|about|around|an estimated|in the region of)\s+(?=[\d£$€])/gi, '')
        .replace(/[ \t]{2,}/g, ' ');
    },

    removeEmDashes(text) {
      if (!text) return text;

      return text
        // A dash between numbers, or before Present/Current, is a RANGE --
        // employment dates, not punctuation. Turning "January 2023 — Present"
        // into "January 2023. Present" destroys the dates an ATS parses to
        // work out tenure, so those become a plain hyphen.
        .replace(/(\d)\s*[—–]\s*(\d)/g, '$1 - $2')
        .replace(/(\d)\s*[—–]\s*(Present|Current|Now|Date)\b/gi, '$1 - $2')
        // "June 2019 – December 2022": a year on the left, a month name on
        // the right, so the digit-to-digit rule above does not see it.
        .replace(/(\d{4})\s*[—–]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi, '$1 - $2')
        // A dash between two capitalised words is part of a NAME, not
        // punctuation in a sentence: "AWS Certified Machine Learning -
        // Specialty", "Microsoft Certified - Azure". A comma there mangles
        // the credential, and an ATS matches certifications as exact
        // strings, so it stops matching at all.
        .replace(/\s*[—–]\s*(?=[A-Z0-9])/g, ' - ')
        // Everything else is a parenthetical inside a sentence. A comma
        // keeps the sentence whole; a full stop cut it into fragments like
        // "Reduced cost. a 12% saving. in year one." -- which reads far
        // more machine-written than the dash it replaced.
        .replace(/\s*[—–]\s*/g, ', ')
        // Clean up doubled punctuation left behind.
        .replace(/,\s*,/g, ',')
        .replace(/\.\s*,/g, '.')
        .replace(/,\s*\./g, '.')
        .replace(/[ \t]{2,}/g, ' ');
    },

    // ============ FIX PUNCTUATION ============
    fixPunctuation(text) {
      if (!text) return text;

      // A letter's salutation and sign-off end in a comma by
      // convention, and a signature line is not a sentence. Neither
      // should be 'corrected'.
      const LETTER_LINE = /^\s*(dear\b|hi\b|hello\b|yours\b|kind regards|best regards|regards|sincerely)/i;
      return text
        // Remove excessive commas
        .replace(/,(\s*,)+/g, ',')
        // Fix comma spacing
        .replace(/\s+,/g, ',')
        .replace(/,(?!\s)/g, ', ')
        // Fix period spacing
        .replace(/\s+\./g, '.')
        .replace(/\.(?!\s|$|\d)/g, '. ')
        // Remove trailing punctuation from bullets -- but a letter's
        // salutation and sign-off END in a comma by convention, and
        // stripping it produced "Dear Hiring Manager" then "Yours
        // sincerely" with a full stop bolted on by the rule below.
        // `[ \t]*` not `\s*`: with /m, a greedy `\s*$` reaches past the
        // line's own newline to the end of the NEXT (blank) line, so the
        // replacement swallowed the blank line separating the salutation
        // from the body.
        .replace(/([,;])([ \t]*)$/gm, (m, punct, tail, off, whole) => {
          const line = whole.slice(whole.lastIndexOf('\n', off - 1) + 1, off + 1);
          return LETTER_LINE.test(line) ? m : tail;
        })
        // Ensure sentences end with period, leaving those lines alone.
        .replace(/([a-z])([ \t]*)$/gm, (m, ch, tail, off, whole) => {
          const line = whole.slice(whole.lastIndexOf('\n', off - 1) + 1, off + 1);
          return LETTER_LINE.test(line) ? m : ch + '.' + tail;
        })
        // Deleting a banned phrase from the middle of a sentence can
        // strand the verb before an infinitive -- removing "welcome the
        // chance" from "I would welcome the chance to talk" leaves
        // "I would to talk". Repair the few shapes that produces.
        .replace(/\b(I|we|they|you)\s+(would|will|could|should)\s+to\s+/gi, '$1 $2 like to ')
        .replace(/\b(I|we|they|you)'(d|ll)\s+to\s+/gi, "$1'$2 like to ")
        .replace(/\b(I|we|they|you)\s+(am|are|is)\s+to\s+(?=[a-z])/gi, '$1 $2 happy to ')
        // Clean up multiple spaces
        .replace(/[ \t]{2,}/g, ' ');
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
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    },

    // ============ FINAL CLEANUP ============
    // ============ REPAIR WHAT A REMOVAL LEFT BEHIND ============
    //
    // Every purge above deletes words out of the middle of a sentence,
    // and deleting a word leaves the words either side of it stranded:
    //
    //   "with a proven ability"          -> "with a ability"
    //   "with extensive experience in"   -> "with in"
    //   "...initiatives. ability to..."  -> a sentence starting lowercase
    //
    // All three appeared in a real generated CV. They matter more than
    // they look: the point of removing a buzzword is to stop the text
    // reading as machine-written, and mangled grammar reads as machine-
    // written far more loudly than the buzzword did. A human writer
    // simply does not produce "with a ability".
    //
    // So every removal is followed by a repair pass. It only fixes
    // damage, never rewrites meaning.
    repairAfterRemoval(text) {
      if (!text || typeof text !== 'string') return text;
      return text
        // Two prepositions left adjacent by a deletion between them.
        // The SECOND one is the one that governs what follows, so it
        // survives: "professional with in driving" -> "professional in
        // driving".
        .replace(/\b(with|and|of|for|to|in|on|at|by)\s+(in|of|with|on|at|by|for)\b/gi,
          (m0, a, b) => b)
        // An article stranded against the word that followed the one
        // that was deleted. "a ability" is the tell; the exceptions are
        // the vowel-initial words English still takes "a" before.
        .replace(/\ba\s+(?![uU](?:ni|se|ti|ne|ro|k)|[oO]ne\b)([aeiouAEIOU]\w*)/g, 'an $1')
        .replace(/\ban\s+([^aeiouAEIOU\s\W]\w*)/g, 'a $1')
        // An article or preposition left hanging at the end of a clause.
        .replace(/\b(?:a|an|the|with|of|in|and)\s*([.,;])/gi, '$1')
        // Tidy the punctuation the deletions disturbed.
        .replace(/\s+([.,;:])/g, '$1')
        .replace(/([.,;:]){2,}/g, '$1')
        .replace(/,\s*\./g, '.')
        .replace(/[ \t]{2,}/g, ' ')
        // A deletion at a sentence START leaves the punctuation that
        // followed it stranded at the front: "I am writing to express my
        // interest in X" became ", my interest in X".
        .replace(/^[\s,;:]+/, '')
        .replace(/([.!?]\s+)[,;:]\s*/g, '$1')
        // A deletion at a sentence start leaves it lowercase.
        .replace(/(^|[.!?]\s+)([a-z])/g, (m0, pre, ch) => pre + ch.toUpperCase())
        .trim();
    },

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

      // Repair first, so the capitalisation fix below sees repaired text.
      text = this.repairAfterRemoval(text);

      return text
        // Collapse duplicated section headers (regression guard)
        .replace(dupHeaderRegex, '$1')
        // Remove double spaces
        .replace(/[ \t]{2,}/g, ' ')
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

        // MONSTER SENTENCE GUARD: Truncate bullets over 30 words
        // Roast rule: "Let it breathe!" — dense bullets hurt readability
        const words = cleaned.split(/\s+/);
        if (words.length > 30) {
          // Find a natural break point (comma, semicolon) near word 25-30
          const truncated = words.slice(0, 30).join(' ');
          const lastComma = truncated.lastIndexOf(',');
          const lastSemicolon = truncated.lastIndexOf(';');
          const breakPoint = Math.max(lastComma, lastSemicolon);
          if (breakPoint > truncated.length * 0.6) {
            cleaned = truncated.slice(0, breakPoint).trim();
          } else {
            cleaned = truncated.trim();
          }
          console.warn(`[ContentQualityEngine] Trimmed monster bullet (${words.length} words → ~30)`);
        }

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
