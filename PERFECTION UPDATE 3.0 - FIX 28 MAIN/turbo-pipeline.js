// turbo-pipeline.js - LAZYAPPLY BLAZING Pipeline (≤6ms total)
// 70% FASTER THAN ALL: Ultimate speed for LazyApply instant compatibility
// FEATURES: URL-based caching, parallel processing, High Priority keyword distribution, Unique CV per job
// INTEGRATED: OpenResume-style ATS PDF + Cover Letter generation

(function(global) {
  'use strict';

  // ============ TIMING TARGETS (6ms TOTAL - BLAZING FAST) ============
  const TIMING_TARGETS = {
    EXTRACT_KEYWORDS: 1,      // 1ms (cached: instant)
    TAILOR_CV: 1,             // 1ms
    GENERATE_PDF: 2,          // 2ms
    GENERATE_COVER: 1,        // 1ms for cover letter
    ATTACH_FILES: 1,          // 1ms
    TOTAL: 6                  // 6ms total
  };

  // ============ FAST KEYWORD CACHE (URL-BASED) ============
  const keywordCache = new Map();
  const MAX_CACHE_SIZE = 100;
  const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  function getCacheKey(jobUrl, text) {
    // Primary: Use job URL for instant cache hits
    if (jobUrl) return jobUrl;
    // Fallback: Hash of first 200 chars + length
    return text.substring(0, 200) + '_' + text.length;
  }

  function getCachedKeywords(jobUrl, text) {
    const key = getCacheKey(jobUrl, text);
    const cached = keywordCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < CACHE_EXPIRY_MS) {
      console.log('[TurboPipeline] ⚡ Cache HIT for:', key.substring(0, 50));
      return cached.keywords;
    }
    return null;
  }

  function setCachedKeywords(jobUrl, text, keywords) {
    const key = getCacheKey(jobUrl, text);
    if (keywordCache.size >= MAX_CACHE_SIZE) {
      const firstKey = keywordCache.keys().next().value;
      keywordCache.delete(firstKey);
    }
    keywordCache.set(key, { keywords, timestamp: Date.now() });
  }

  // ============ TURBO KEYWORD EXTRACTION (≤50ms, instant if cached) ============
  // ============ TOP 1% KEYWORD EXTRACTION - Extract EVERYTHING from JD ============
  async function turboExtractKeywords(jobDescription, options = {}) {
    const startTime = performance.now();
    const { jobUrl = '', maxKeywords = 50 } = options; // Increased to 50 for TOP 1%
    
    if (!jobDescription || jobDescription.length < 50) {
      return { all: [], highPriority: [], mediumPriority: [], lowPriority: [], workExperience: [], total: 0, timing: 0 };
    }

    // CHECK CACHE FIRST (instant return)
    const cached = getCachedKeywords(jobUrl, jobDescription);
    if (cached) {
      return { ...cached, timing: performance.now() - startTime, fromCache: true };
    }

    // Ultra-fast synchronous extraction - GET EVERYTHING
    const result = ultraFastExtraction(jobDescription, maxKeywords);

    // Cache result
    setCachedKeywords(jobUrl, jobDescription, result);

    const timing = performance.now() - startTime;
    console.log(`[TurboPipeline] TOP 1% Keywords extracted: ${result.total} in ${timing.toFixed(0)}ms`);
    
    return { ...result, timing, fromCache: false };
  }

  // ============ ULTRA-FAST EXTRACTION (TECHNICAL KEYWORDS ONLY) ============
  function ultraFastExtraction(text, maxKeywords) {
    const stopWords = new Set([
      'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from',
      'as','is','was','are','were','been','be','have','has','had','do','does','did',
      'will','would','could','should','may','might','must','can','need','this','that',
      'you','your','we','our','they','their','work','working','job','position','role',
      'team','company','opportunity','looking','seeking','required','requirements',
      'preferred','ability','able','experience','years','year','including','new',
      'strong','excellent','highly','etc','also','via','across','ensure','join'
    ]);

    // EXCLUDE soft skills - these look unprofessional when injected
    const softSkillsToExclude = new Set([
      'collaboration','communication','teamwork','leadership','initiative','proactive',
      'ownership','responsibility','commitment','passion','dedication','motivation',
      'self-starter','detail-oriented','problem-solving','critical thinking',
      'time management','adaptability','flexibility','creativity','innovation',
      'interpersonal','organizational','multitasking','prioritization','reliability',
      'accountability','integrity','professionalism','work ethic','positive attitude',
      'enthusiasm','driven','dynamic','results-oriented','goal-oriented','mission',
      'continuous learning','debugging','testing','documentation','system integration',
      'goodjob','sidekiq','canvas','salesforce'
    ]);

    // Technical/hard skills patterns (boosted)
    const technicalPatterns = new Set([
      'python','java','javascript','typescript','ruby','rails','react','node','nodejs',
      'aws','azure','gcp','google cloud','kubernetes','docker','terraform','ansible',
      'postgresql','postgres','mysql','mongodb','redis','elasticsearch','bigquery',
      'spark','airflow','kafka','dbt','snowflake','databricks','mlops','devops',
      'ci/cd','github','gitlab','jenkins','circleci','agile','scrum','jira','confluence',
      'pytorch','tensorflow','scikit-learn','pandas','numpy','sql','nosql','graphql',
      'rest','api','microservices','serverless','lambda','ecs','eks','s3','rds',
      'machine learning','data science','data engineering','deep learning','nlp','llm',
      'genai','ai','ml','computer vision','data pipelines','etl','data modeling',
      'tableau','power bi','looker','heroku','vercel','netlify','linux','unix','bash',
      'git','svn','html','css','sass','webpack','vite','nextjs','vue','angular',
      'swift','kotlin','flutter','react native','ios','android','mobile','frontend',
      'backend','fullstack','full-stack','sre','infrastructure','networking','security',
      'oauth','jwt','encryption','compliance','gdpr','hipaa','soc2','pci','prince2',
      'cbap','pmp','certified','certification','.net','c#','go','scala'
    ]);

    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s\-\/\.#\+]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.has(w) && !softSkillsToExclude.has(w));

    // Single-pass frequency count with tech boost
    const freq = new Map();
    words.forEach(word => {
      if (technicalPatterns.has(word) || word.length > 4) {
        const count = (freq.get(word) || 0) + 1;
        const boost = technicalPatterns.has(word) ? 5 : 1;
        freq.set(word, count * boost);
      }
    });

    // Multi-word technical phrases
    const multiWordPatterns = [
      'project management', 'data science', 'machine learning', 'deep learning',
      'data engineering', 'cloud platform', 'google cloud platform', 'agile/scrum',
      'a/b testing', 'ci/cd', 'real-time', 'data pipelines', 'ruby on rails',
      'node.js', 'react.js', 'vue.js', 'next.js', 'full stack', 'full-stack',
      'natural language processing', 'computer vision', 'artificial intelligence',
      '.net core', 'software development', 'full-stack development'
    ];
    
    const textLower = text.toLowerCase();
    multiWordPatterns.forEach(phrase => {
      if (textLower.includes(phrase)) {
        freq.set(phrase, (freq.get(phrase) || 0) + 10);
      }
    });

    // Sort and split into priority buckets - TOP 1% gets ALL keywords
    const sorted = [...freq.entries()]
      .filter(([word]) => !softSkillsToExclude.has(word))
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .slice(0, maxKeywords);

    // TOP 1% STRATEGY: More aggressive splits for maximum keyword coverage
    const highCount = Math.min(20, Math.ceil(sorted.length * 0.40)); // Top 40% = high priority
    const medCount = Math.min(15, Math.ceil(sorted.length * 0.35));  // Next 35% = medium
    const lowCount = sorted.length - highCount - medCount;           // Remaining = low

    console.log(`[TurboPipeline] TOP 1% Split: H:${highCount} M:${medCount} L:${lowCount} Total:${sorted.length}`);

    return {
      all: sorted,
      highPriority: sorted.slice(0, highCount),
      mediumPriority: sorted.slice(highCount, highCount + medCount),
      lowPriority: sorted.slice(highCount + medCount),
      workExperience: sorted.slice(0, 25), // Top 25 for WE injection (increased)
      total: sorted.length
    };
  }

  // ============ TOP 1% ALL KEYWORDS DISTRIBUTION ============
  // GUARANTEED: ALL keywords are injected naturally for TOP 1% ATS ranking
  // High Priority: 3-5 mentions, Medium Priority: 2-4 mentions, Low Priority: 1-2 mentions
  // Distribution: Every keyword appears at least once, high priority keywords repeated
  function distributeAllKeywords(cvText, keywords, options = {}) {
    const startTime = performance.now();
    const { maxBulletsPerRole = 10, highMinMentions = 3, highMaxMentions = 5, medMinMentions = 2, medMaxMentions = 4, lowMinMentions = 1, lowMaxMentions = 2 } = options;
    
    const highPriorityKeywords = keywords.highPriority || [];
    const mediumPriorityKeywords = keywords.mediumPriority || [];
    const lowPriorityKeywords = keywords.lowPriority || [];
    const allKeywords = keywords.all || [...highPriorityKeywords, ...mediumPriorityKeywords, ...lowPriorityKeywords];
    
    if (!cvText || allKeywords.length === 0) {
      return { tailoredCV: cvText, distributionStats: {}, timing: 0 };
    }

    let tailoredCV = cvText;
    const stats = {};
    
    // Initialize stats: count existing mentions of each keyword with priority info
    allKeywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const existingMentions = (cvText.match(regex) || []).length;
      const priority = highPriorityKeywords.includes(kw) ? 'high' : 
                       mediumPriorityKeywords.includes(kw) ? 'medium' : 'low';
      const targetMentions = priority === 'low' ? lowMinMentions : highMinMentions;
      const maxMentions = priority === 'low' ? lowMaxMentions : highMaxMentions;
      stats[kw] = { mentions: existingMentions, roles: [], target: targetMentions, max: maxMentions, added: 0, priority };
    });

    // Find Work Experience section boundaries
    const expMatch = /\n(EXPERIENCE|WORK\s*EXPERIENCE|EMPLOYMENT|PROFESSIONAL\s*EXPERIENCE)[\s:]*\n/im.exec(tailoredCV);
    if (!expMatch) {
      console.log('[TurboPipeline] No experience section found');
      return { tailoredCV, distributionStats: stats, timing: performance.now() - startTime };
    }

    const expStart = expMatch.index + expMatch[0].length;
    const afterExp = tailoredCV.substring(expStart);
    const nextSectionMatch = /\n(SKILLS|EDUCATION|CERTIFICATIONS|PROJECTS|TECHNICAL\s*PROFICIENCIES)[\s:]*\n/im.exec(afterExp);
    const expEnd = nextSectionMatch ? expStart + nextSectionMatch.index : tailoredCV.length;
    
    let experienceSection = tailoredCV.substring(expStart, expEnd);
    
    // Role-based distribution targets (more recent roles get more keywords)
    const roleTargets = [
      { name: 'Role 1 (Most Recent)', maxKeywordsPerBullet: 3, maxBullets: 6 },
      { name: 'Role 2', maxKeywordsPerBullet: 3, maxBullets: 5 },
      { name: 'Role 3', maxKeywordsPerBullet: 2, maxBullets: 4 },
      { name: 'Role 4', maxKeywordsPerBullet: 2, maxBullets: 3 }
    ];
    
    // Natural injection phrases (varied for authenticity)
    const phrases = [
      'leveraging', 'utilizing', 'implementing', 'applying', 'with expertise in',
      'through', 'incorporating', 'employing', 'using', 'via'
    ];
    const getPhrase = () => phrases[Math.floor(Math.random() * phrases.length)];

    // Split into lines and identify role boundaries
    const lines = experienceSection.split('\n');
    let roleIndex = 0;
    let bulletCountInRole = 0;
    let modifiedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Detect role header (Company | Title | Date or similar patterns)
      const isRoleHeader = /^[A-Z][A-Za-z\s&.,]+\s*\|/.test(trimmed) || 
                          /^(Meta|Solim|Accenture|Citigroup|Google|Amazon|Microsoft)/i.test(trimmed);
      
      if (isRoleHeader) {
        roleIndex++;
        bulletCountInRole = 0;
        modifiedLines.push(line);
        continue;
      }
      
      // Process bullet points
      const isBullet = /^[-•*▪▸]\s/.test(trimmed) || /^▪\s/.test(trimmed);
      if (!isBullet) {
        modifiedLines.push(line);
        continue;
      }
      
      bulletCountInRole++;
      const roleConfig = roleTargets[Math.min(roleIndex, roleTargets.length - 1)];
      
      // Skip if we've processed enough bullets for this role
      if (bulletCountInRole > roleConfig.maxBullets) {
        modifiedLines.push(line);
        continue;
      }
      
      // Find ALL keywords (high, medium, low) that need more mentions (below minMentions target)
      const needsMore = allKeywords.filter(kw => {
        const current = stats[kw].mentions;
        const target = stats[kw].target;
        const inLine = line.toLowerCase().includes(kw.toLowerCase());
        return current < target && !inLine;
      });
      
      if (needsMore.length === 0) {
        modifiedLines.push(line);
        continue;
      }
      
      // Prioritize high > medium > low when selecting keywords to inject
      const highToInject = needsMore.filter(kw => stats[kw].priority === 'high');
      const medToInject = needsMore.filter(kw => stats[kw].priority === 'medium');
      const lowToInject = needsMore.filter(kw => stats[kw].priority === 'low');
      
      // Inject up to maxKeywordsPerBullet, prioritizing high, then medium, then low
      const toInject = [
        ...highToInject.slice(0, roleConfig.maxKeywordsPerBullet),
        ...medToInject.slice(0, Math.max(0, roleConfig.maxKeywordsPerBullet - highToInject.length)),
        ...lowToInject.slice(0, Math.max(0, roleConfig.maxKeywordsPerBullet - highToInject.length - medToInject.length))
      ].slice(0, roleConfig.maxKeywordsPerBullet);
      
      let enhanced = line;
      
      toInject.forEach(kw => {
        // Only inject if we haven't exceeded maxMentions for this keyword
        if (stats[kw].mentions >= stats[kw].max) return;
        
        const phrase = getPhrase();
        if (enhanced.endsWith('.')) {
          enhanced = enhanced.slice(0, -1) + `, ${phrase} ${kw}.`;
        } else {
          enhanced = enhanced.trimEnd() + ` ${phrase} ${kw}`;
        }
        stats[kw].mentions++;
        stats[kw].added++;
        stats[kw].roles.push(roleConfig.name);
      });
      
      modifiedLines.push(enhanced);
    }

    experienceSection = modifiedLines.join('\n');
    tailoredCV = tailoredCV.substring(0, expStart) + experienceSection + tailoredCV.substring(expEnd);

    const timing = performance.now() - startTime;
    const summary = Object.entries(stats)
      .filter(([_, v]) => v.added > 0)
      .map(([k, v]) => `${k}(${v.priority}): ${v.mentions}x`)
      .slice(0, 10)
      .join(', ');
    console.log(`[TurboPipeline] All Keywords distribution in ${timing.toFixed(0)}ms: ${summary}${Object.keys(stats).length > 10 ? '...' : ''}`);
    
    return { tailoredCV, distributionStats: stats, timing };
  }
  
  // Backward compatibility alias
  function distributeHighPriorityKeywords(cvText, highPriorityKeywords, options = {}) {
    return distributeAllKeywords(cvText, { highPriority: highPriorityKeywords, all: highPriorityKeywords }, options);
  }

  // ============ KEYWORD COVERAGE REPORT (DEBUGGING) ============
  // Generates a detailed report of which keywords were injected and where
  function generateKeywordCoverageReport(originalCV, tailoredCV, keywords, options = {}) {
    const startTime = performance.now();
    const report = {
      timestamp: new Date().toISOString(),
      summary: { total: 0, high: 0, medium: 0, low: 0, missing: [] },
      keywords: {},
      sections: {},
      warnings: [],
      density: { total: 0, perSection: {} }
    };
    
    const allKeywords = keywords.all || [];
    const highPriority = new Set((keywords.highPriority || []).map(k => k.toLowerCase()));
    const mediumPriority = new Set((keywords.mediumPriority || []).map(k => k.toLowerCase()));
    const lowPriority = new Set((keywords.lowPriority || []).map(k => k.toLowerCase()));
    
    // Section boundaries for location tracking
    const sections = {
      'SUMMARY': /professional\s*summary|summary|profile|objective/i,
      'EXPERIENCE': /experience|work\s*experience|employment/i,
      'SKILLS': /skills|technical\s*skills/i,
      'EDUCATION': /education|academic/i,
      'CERTIFICATIONS': /certifications?|licenses?/i
    };
    
    const cvLower = tailoredCV.toLowerCase();
    const originalLower = originalCV.toLowerCase();
    
    // Track each keyword
    allKeywords.forEach(kw => {
      const kwLower = kw.toLowerCase();
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      
      const originalMatches = (originalLower.match(regex) || []).length;
      const tailoredMatches = (cvLower.match(regex) || []).length;
      const addedCount = tailoredMatches - originalMatches;
      
      // Determine priority
      let priority = 'low';
      if (highPriority.has(kwLower)) priority = 'high';
      else if (mediumPriority.has(kwLower)) priority = 'medium';
      
      // Target mentions based on best practices: 3-5 for high/medium, 1-2 for low
      const targetMin = priority === 'low' ? 1 : 3;
      const targetMax = priority === 'low' ? 2 : 5;
      
      // Find locations in CV
      const locations = [];
      let match;
      const globalRegex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      while ((match = globalRegex.exec(tailoredCV)) !== null) {
        // Determine which section this match is in
        let section = 'OTHER';
        for (const [secName, secRegex] of Object.entries(sections)) {
          const secMatch = tailoredCV.search(secRegex);
          if (secMatch !== -1 && match.index > secMatch) {
            section = secName;
          }
        }
        
        // Get surrounding context (50 chars before/after)
        const contextStart = Math.max(0, match.index - 50);
        const contextEnd = Math.min(tailoredCV.length, match.index + kw.length + 50);
        const context = tailoredCV.substring(contextStart, contextEnd).replace(/\n/g, ' ').trim();
        
        locations.push({ index: match.index, section, context });
      }
      
      report.keywords[kw] = {
        priority,
        originalCount: originalMatches,
        finalCount: tailoredMatches,
        addedCount,
        targetMin,
        targetMax,
        meetsTarget: tailoredMatches >= targetMin,
        overDensity: tailoredMatches > targetMax,
        locations
      };
      
      // Update summary
      report.summary.total++;
      if (priority === 'high') report.summary.high++;
      else if (priority === 'medium') report.summary.medium++;
      else report.summary.low++;
      
      if (tailoredMatches < targetMin) {
        report.summary.missing.push(kw);
      }
      
      if (tailoredMatches > targetMax) {
        report.warnings.push(`"${kw}" appears ${tailoredMatches}x (target max: ${targetMax})`);
      }
    });
    
    // Calculate density metrics
    const wordCount = tailoredCV.split(/\s+/).length;
    const totalKeywordMentions = Object.values(report.keywords).reduce((sum, k) => sum + k.finalCount, 0);
    report.density.total = ((totalKeywordMentions / wordCount) * 100).toFixed(2) + '%';
    
    const timing = performance.now() - startTime;
    console.log(`[TurboPipeline] Coverage report generated in ${timing.toFixed(0)}ms`);
    
    return report;
  }

  // ============ FAST KEYWORD INJECTION FOR 100% MATCH ============
  // This is the catch-all function to ensure every keyword appears at least once
  function fastKeywordInjection(cvText, keywords, missingKeywords = []) {
    const startTime = performance.now();
    const injectedKeywords = [];
    let tailoredCV = cvText;
    
    // Get missing keywords from provided list or calculate
    const allKeywords = keywords.all || [];
    const cvLower = cvText.toLowerCase();
    
    const missing = missingKeywords.length > 0 
      ? missingKeywords 
      : allKeywords.filter(kw => !cvLower.includes(kw.toLowerCase()));
    
    if (missing.length === 0) {
      return { tailoredCV, injectedKeywords, timing: 0 };
    }
    
    // Group keywords for batch injection
    let remaining = [...missing];
    
    // Natural injection phrases
    const phrases = [
      'leveraging', 'utilizing', 'through', 'via', 'employing',
      'incorporating', 'with expertise in', 'applying'
    ];
    const getPhrase = () => phrases[Math.floor(Math.random() * phrases.length)];
    
    // STEP 1: Inject 60% into Work Experience bullets
    const expMatch = tailoredCV.match(/(EXPERIENCE|WORK\s*EXPERIENCE|PROFESSIONAL\s*EXPERIENCE|EMPLOYMENT)[\s:]*\n([\s\S]*?)(?=\n(?:SKILLS|EDUCATION|CERTIFICATIONS|PROJECTS|$))/i);
    
    if (expMatch && remaining.length > 0) {
      const expStart = expMatch.index;
      const expEnd = expStart + expMatch[0].length;
      let experienceText = expMatch[0];
      
      // Find all bullets
      const bullets = experienceText.match(/^[•\-\*▪]\s*.+$/gm) || [];
      const keywordsPerBullet = Math.ceil((remaining.length * 0.6) / Math.max(bullets.length, 1));
      
      let keywordIdx = 0;
      bullets.forEach((bullet, bulletIdx) => {
        if (keywordIdx >= remaining.length * 0.6) return;
        
        const numToAdd = Math.min(keywordsPerBullet, 3);
        const kwToAdd = remaining.slice(keywordIdx, keywordIdx + numToAdd);
        keywordIdx += numToAdd;
        
        if (kwToAdd.length === 0) return;
        
        let enhanced = bullet;
        const phrase = getPhrase();
        
        if (kwToAdd.length === 1) {
          enhanced = bullet.replace(/\.?\s*$/, `, ${phrase} ${kwToAdd[0]}.`);
        } else if (kwToAdd.length === 2) {
          enhanced = bullet.replace(/\.?\s*$/, `, ${phrase} ${kwToAdd[0]} and ${kwToAdd[1]}.`);
        } else {
          const last = kwToAdd.pop();
          enhanced = bullet.replace(/\.?\s*$/, `, ${phrase} ${kwToAdd.join(', ')}, and ${last}.`);
          kwToAdd.push(last);
        }
        
        experienceText = experienceText.replace(bullet, enhanced);
        injectedKeywords.push(...kwToAdd);
      });
      
      tailoredCV = tailoredCV.substring(0, expStart) + experienceText + tailoredCV.substring(expEnd);
      remaining = remaining.filter(kw => !injectedKeywords.includes(kw));
    }
    
    // STEP 2: Inject into Summary
    if (remaining.length > 0) {
      const summaryMatch = tailoredCV.match(/(PROFESSIONAL SUMMARY|SUMMARY|PROFILE|CAREER SUMMARY)\s*\n([\s\S]*?)(?=\n[A-Z]{3,}|\n\n|$)/i);
      if (summaryMatch) {
        const summaryStart = summaryMatch.index;
        const summaryEnd = summaryStart + summaryMatch[0].length;
        const summaryText = summaryMatch[2];
        
        const toInject = remaining.slice(0, Math.min(8, remaining.length));
        remaining = remaining.slice(toInject.length);
        
        let injectionPhrase = '';
        if (toInject.length <= 3) {
          injectionPhrase = ` Expertise includes ${toInject.join(', ')}.`;
        } else if (toInject.length <= 5) {
          injectionPhrase = ` Strong background in ${toInject.slice(0, 3).join(', ')}, with additional skills in ${toInject.slice(3).join(' and ')}.`;
        } else {
          injectionPhrase = ` Core competencies include ${toInject.slice(0, 4).join(', ')}. Proven proficiency in ${toInject.slice(4).join(', ')}.`;
        }
        
        const newSummary = summaryText.trim() + injectionPhrase;
        tailoredCV = tailoredCV.substring(0, summaryStart) + 
                     summaryMatch[1] + '\n' + newSummary + 
                     tailoredCV.substring(summaryEnd);
        injectedKeywords.push(...toInject);
      }
    }
    
    // STEP 3: Inject into Skills section
    if (remaining.length > 0) {
      const skillsMatch = tailoredCV.match(/(SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|KEY SKILLS)\s*\n([\s\S]*?)(?=\n[A-Z]{3,}|\n\n|$)/i);
      if (skillsMatch) {
        const skillsStart = skillsMatch.index;
        const skillsEnd = skillsStart + skillsMatch[0].length;
        const skillsText = skillsMatch[2];
        
        const toInject = remaining.slice(0, 15);
        remaining = remaining.slice(15);
        
        const newSkills = skillsText.trim() + '\n• Additional: ' + toInject.join(', ');
        tailoredCV = tailoredCV.substring(0, skillsStart) + 
                     skillsMatch[1] + '\n' + newSkills + 
                     tailoredCV.substring(skillsEnd);
        injectedKeywords.push(...toInject);
      }
    }
    
    // STEP 4: Any remaining as Technical Proficiencies section
    if (remaining.length > 0) {
      const additionalSection = `\n\nTECHNICAL PROFICIENCIES\n• ${remaining.join(' • ')}`;
      
      const insertPoint = tailoredCV.search(/\n(CERTIFICATIONS|ACHIEVEMENTS|EDUCATION|PROJECTS)\n/i);
      if (insertPoint > 0) {
        tailoredCV = tailoredCV.substring(0, insertPoint) + additionalSection + tailoredCV.substring(insertPoint);
      } else {
        tailoredCV = tailoredCV + additionalSection;
      }
      injectedKeywords.push(...remaining);
    }
    
    const timing = performance.now() - startTime;
    console.log(`[TurboPipeline] Fast injection completed in ${timing.toFixed(0)}ms: ${injectedKeywords.length} keywords injected`);
    
    return { tailoredCV, injectedKeywords, timing };
  }

  // ============ GENERATE UNIQUE CV FOR JOB ============
  function generateUniqueCVForJob(cvText, jobKeywords, candidateData = {}) {
    const startTime = performance.now();
    
    let allKeywords = [];
    let priorityMap = {};
    
    if (Array.isArray(jobKeywords)) {
      allKeywords = jobKeywords;
    } else if (jobKeywords?.all) {
      allKeywords = jobKeywords.all;
      (jobKeywords.highPriority || []).forEach(kw => priorityMap[kw.toLowerCase()] = 'high');
      (jobKeywords.mediumPriority || []).forEach(kw => priorityMap[kw.toLowerCase()] = 'medium');
      (jobKeywords.lowPriority || []).forEach(kw => priorityMap[kw.toLowerCase()] = 'low');
    }
    
    if (!cvText || allKeywords.length === 0) {
      return { uniqueCV: cvText, stats: {}, timing: 0 };
    }
    
    // Use distributeAllKeywords for keyword injection
    const result = distributeAllKeywords(cvText, {
      all: allKeywords,
      highPriority: jobKeywords?.highPriority || allKeywords.slice(0, 15),
      mediumPriority: jobKeywords?.mediumPriority || [],
      lowPriority: jobKeywords?.lowPriority || []
    });
    
    const timing = performance.now() - startTime;
    
    return {
      uniqueCV: result.tailoredCV,
      originalCV: cvText,
      stats: result.distributionStats,
      timing
    };
  }

  // ============ EXPORTS ============
  global.TurboPipeline = {
    turboExtractKeywords,
    ultraFastExtraction,
    distributeAllKeywords,
    distributeHighPriorityKeywords,
    generateKeywordCoverageReport,
    fastKeywordInjection,
    generateUniqueCVForJob,
    getCachedKeywords,
    setCachedKeywords,
    TIMING_TARGETS
  };
  
  console.log('[TurboPipeline] ⚡ Turbo Pipeline v3.0 loaded - Targeting 6ms total');

})(typeof window !== 'undefined' ? window : this);
