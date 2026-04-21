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
    'track record of success': 'record',
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

      // 1. Break consecutive sentences starting with "I" — AI writing signature
      //    "I did X. I then Y. I also Z." → vary with "The", "This", "My", drop subject
      r = r.replace(/(\. )(I )(have |had |am |was |will |would |can |could |did )?/g, (match, dot, subj, aux, offset) => {
        const rand = Math.random();
        if (rand < 0.25) return dot + (aux || '');       // drop subject entirely: ". Had..."
        if (rand < 0.45) return dot + 'My ';              // ". My work..."
        if (rand < 0.60) return dot + 'This ';            // ". This..."
        return match;                                      // keep 40% unchanged for variety
      });

      // 2. Vary paragraph/sentence openers — flag if 3+ consecutive sentences start same way
      const sentences = r.split(/(?<=[.!?])\s+/);
      if (sentences.length >= 3) {
        const openers = sentences.map(s => (s.match(/^\S+/) || [''])[0].toLowerCase());
        for (let i = 2; i < openers.length; i++) {
          if (openers[i] === openers[i - 1] && openers[i] === openers[i - 2]) {
            const alts = ['Specifically, ', 'For example, ', 'In practice, ', 'Here, ', 'At ', 'One example: '];
            const pick = alts[Math.floor(Math.random() * alts.length)];
            sentences[i] = pick + sentences[i].charAt(0).toLowerCase() + sentences[i].slice(1);
          }
        }
        r = sentences.join(' ');
      }

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
        // v3.2 additions to never-leak guard
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
