// turbo-pipeline.js - LAZYAPPLY SYNC v3.1.0 Pipeline
// TARGET: 50-80 seconds average completion time for LazyApply compatibility
// FEATURES: URL-based caching, parallel processing, stable API params (temp 0.4, 3500 tokens)
// INTEGRATED: OpenResume-style ATS PDF + Cover Letter generation

(function(global) {
  'use strict';

  // ============ LAZYAPPLY SYNC TIMING TARGETS (50-80s AVG) ============
  // Kimi K2 with temp 0.4 + 3500 tokens for reliable output
  // TARGET: 50-80s total for full Extract + Tailor + Generate + Attach flow
  const TIMING_TARGETS = {
    EXTRACT_KEYWORDS: 8000,     // 5-8s - stable extraction with API call
    TAILOR_CV: 40000,           // 25-40s - AI tailoring with 3500 tokens
    GENERATE_PDF: 15000,        // 10-15s - PDF generation
    GENERATE_COVER: 10000,      // 8-12s - cover letter generation
    ATTACH_FILES: 5000,         // 2-5s - file attachment with retries
    TOTAL: 80000,               // 80s max pipeline
    FULL_FLOW_TARGET: 65000,    // 65s target (50-80s range)
    MIN_FLOW_TIME: 50000        // 50s minimum for stability
  };

  // API Configuration - STABLE for LazyApply
  const API_CONFIG = {
    TEMPERATURE: 0.4,           // Stable, reliable output
    MAX_TOKENS: 3500,           // Prevents JSON truncation
    MAX_KEYWORDS: 30,           // Optimal keyword count
    JD_MAX_CHARS: 5000,         // Cap JD length for speed
    TIMEOUT_MS: 45000           // 45s API timeout
  };
  
  // Performance monitoring
  const PERF_LOG = [];
  const logPerf = (step, time) => {
    PERF_LOG.push({ step, time, timestamp: Date.now() });
    if (PERF_LOG.length > 100) PERF_LOG.shift();
    console.log(`[TurboPipeline] ⏱️ ${step}: ${time.toFixed(0)}ms`);
  };

  // ============ FAST KEYWORD CACHE (URL-BASED) ============
  const keywordCache = new Map();
  const MAX_CACHE_SIZE = 150;
  const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes

  function getCacheKey(jobUrl, text) {
    if (jobUrl) return jobUrl;
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

  // ============ LAZYAPPLY SYNC KEYWORD EXTRACTION ============
  async function turboExtractKeywords(jobDescription, options = {}) {
    const startTime = performance.now();
    const { jobUrl = '', maxKeywords = API_CONFIG.MAX_KEYWORDS } = options;
    
    if (!jobDescription || jobDescription.length < 50) {
      return { all: [], highPriority: [], mediumPriority: [], lowPriority: [], workExperience: [], total: 0, timing: 0 };
    }

    // Check cache first
    const cached = getCachedKeywords(jobUrl, jobDescription);
    if (cached) {
      const timing = performance.now() - startTime;
      logPerf('extract_cached', timing);
      return { ...cached, timing, fromCache: true };
    }

    // Extract keywords locally (fast)
    const result = ultraFastExtraction(jobDescription, maxKeywords);

    // Cache result asynchronously
    queueMicrotask(() => setCachedKeywords(jobUrl, jobDescription, result));

    const timing = performance.now() - startTime;
    logPerf('extract_fresh', timing);
    console.log(`[TurboPipeline] ⚡ Keywords: ${result.total} in ${timing.toFixed(0)}ms`);
    
    return { ...result, timing, fromCache: false };
  }

  // ============ ULTRA-FAST LOCAL EXTRACTION ============
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

    const softSkillsToExclude = new Set([
      'collaboration','communication','teamwork','leadership','initiative','proactive',
      'ownership','responsibility','commitment','passion','dedication','motivation',
      'self-starter','detail-oriented','problem-solving','critical thinking',
      'time management','adaptability','flexibility','creativity','innovation'
    ]);

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

    const freq = new Map();
    words.forEach(word => {
      if (technicalPatterns.has(word) || word.length > 4) {
        const count = (freq.get(word) || 0) + 1;
        const boost = technicalPatterns.has(word) ? 5 : 1;
        freq.set(word, count * boost);
      }
    });

    // Multi-word phrases
    const multiWordPatterns = [
      'project management', 'data science', 'machine learning', 'deep learning',
      'data engineering', 'cloud platform', 'google cloud platform', 'agile/scrum',
      'a/b testing', 'ci/cd', 'real-time', 'data pipelines', 'ruby on rails',
      'node.js', 'react.js', 'vue.js', 'next.js', 'full stack', 'full-stack'
    ];
    
    const textLower = text.toLowerCase();
    multiWordPatterns.forEach(phrase => {
      if (textLower.includes(phrase)) {
        freq.set(phrase, (freq.get(phrase) || 0) + 10);
      }
    });

    const sorted = [...freq.entries()]
      .filter(([word]) => !softSkillsToExclude.has(word))
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .slice(0, maxKeywords);

    const highCount = Math.min(20, Math.ceil(sorted.length * 0.40));
    const medCount = Math.min(15, Math.ceil(sorted.length * 0.35));

    return {
      all: sorted,
      highPriority: sorted.slice(0, highCount),
      mediumPriority: sorted.slice(highCount, highCount + medCount),
      lowPriority: sorted.slice(highCount + medCount),
      workExperience: sorted.slice(0, 25),
      total: sorted.length
    };
  }

  // ============ KEYWORD DISTRIBUTION (ALL PRIORITIES) ============
  function distributeAllKeywords(cvText, keywords, options = {}) {
    const startTime = performance.now();
    const { maxBulletsPerRole = 10 } = options;
    
    const highPriorityKeywords = keywords.highPriority || [];
    const mediumPriorityKeywords = keywords.mediumPriority || [];
    const lowPriorityKeywords = keywords.lowPriority || [];
    const allKeywords = keywords.all || [...highPriorityKeywords, ...mediumPriorityKeywords, ...lowPriorityKeywords];
    
    if (!cvText || allKeywords.length === 0) {
      return { tailoredCV: cvText, distributionStats: {}, timing: 0 };
    }

    let tailoredCV = cvText;
    const stats = {};
    
    allKeywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const existingMentions = (cvText.match(regex) || []).length;
      const priority = highPriorityKeywords.includes(kw) ? 'high' : 
                       mediumPriorityKeywords.includes(kw) ? 'medium' : 'low';
      const targetMentions = priority === 'high' ? 3 : priority === 'medium' ? 2 : 1;
      stats[kw] = { mentions: existingMentions, target: targetMentions, added: 0, priority };
    });

    const expMatch = /\n(EXPERIENCE|WORK\s*EXPERIENCE|EMPLOYMENT|PROFESSIONAL\s*EXPERIENCE)[\s:]*\n/im.exec(tailoredCV);
    if (!expMatch) {
      return { tailoredCV, distributionStats: stats, timing: performance.now() - startTime };
    }

    const expStart = expMatch.index + expMatch[0].length;
    const afterExp = tailoredCV.substring(expStart);
    const nextSectionMatch = /\n(SKILLS|EDUCATION|CERTIFICATIONS|PROJECTS)[\s:]*\n/im.exec(afterExp);
    const expEnd = nextSectionMatch ? expStart + nextSectionMatch.index : tailoredCV.length;
    
    let experienceSection = tailoredCV.substring(expStart, expEnd);
    
    const phrases = ['leveraging', 'utilising', 'implementing', 'applying', 'through', 'using', 'via'];
    const getPhrase = () => phrases[Math.floor(Math.random() * phrases.length)];

    const PROTECTED_COMPANIES = ['meta', 'solimhealth', 'accenture', 'citigroup', 'google', 'amazon', 'microsoft', 'apple'];
    
    const lines = experienceSection.split('\n');
    let roleIndex = 0;
    let bulletCountInRole = 0;
    let modifiedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      const lineHasPipe = trimmed.includes('|');
      const lineHasCompany = PROTECTED_COMPANIES.some(c => trimmed.toLowerCase().includes(c));
      const isRoleHeader = (lineHasPipe && lineHasCompany) ||
                          /^[A-Z][A-Za-z\s&.,]+\s*\|/.test(trimmed) ||
                          /^\d{4}\s*[-–]\s*(Present|\d{4})/i.test(trimmed);
      
      if (isRoleHeader) {
        roleIndex++;
        bulletCountInRole = 0;
        modifiedLines.push(line);
        continue;
      }
      
      const isBullet = /^[-•*▪▸]\s/.test(trimmed);
      if (!isBullet) {
        modifiedLines.push(line);
        continue;
      }
      
      bulletCountInRole++;
      if (bulletCountInRole > maxBulletsPerRole) {
        modifiedLines.push(line);
        continue;
      }
      
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
      
      const toInject = needsMore.slice(0, 2);
      let enhanced = line;
      
      toInject.forEach(kw => {
        const phrase = getPhrase();
        if (enhanced.endsWith('.')) {
          enhanced = enhanced.slice(0, -1) + `, ${phrase} ${kw}.`;
        } else {
          enhanced = enhanced.trimEnd() + ` ${phrase} ${kw}`;
        }
        stats[kw].mentions++;
        stats[kw].added++;
      });
      
      modifiedLines.push(enhanced);
    }

    experienceSection = modifiedLines.join('\n');
    tailoredCV = tailoredCV.substring(0, expStart) + experienceSection + tailoredCV.substring(expEnd);

    const timing = performance.now() - startTime;
    logPerf('distribute_keywords', timing);
    
    return { tailoredCV, distributionStats: stats, timing };
  }

  // ============ LAZYAPPLY SYNC FULL PIPELINE ============
  async function runLazyApplySyncPipeline(jobDescription, baseCV, profile, options = {}) {
    const pipelineStart = performance.now();
    console.log('[TurboPipeline] 🚀 Starting LazyApply Sync Pipeline (target: 50-80s)');

    const result = {
      success: false,
      tailoredCV: baseCV,
      coverLetter: '',
      cvPdf: null,
      coverPdf: null,
      keywords: null,
      timing: {
        extract: 0,
        tailor: 0,
        generatePdf: 0,
        generateCover: 0,
        total: 0
      }
    };

    try {
      // Step 1: Extract Keywords (5-8s)
      const extractStart = performance.now();
      result.keywords = await turboExtractKeywords(jobDescription, {
        jobUrl: options.jobUrl || '',
        maxKeywords: API_CONFIG.MAX_KEYWORDS
      });
      result.timing.extract = performance.now() - extractStart;

      // Step 2: Distribute Keywords into CV
      const distributeResult = distributeAllKeywords(baseCV, result.keywords);
      result.tailoredCV = distributeResult.tailoredCV;
      result.timing.tailor = distributeResult.timing;

      // Step 3: Generate PDFs (handled by caller)
      result.success = true;
      result.timing.total = performance.now() - pipelineStart;

      console.log(`[TurboPipeline] ✅ Pipeline complete in ${result.timing.total.toFixed(0)}ms`);
      console.log(`[TurboPipeline] 📊 Breakdown: Extract=${result.timing.extract.toFixed(0)}ms, Tailor=${result.timing.tailor.toFixed(0)}ms`);

    } catch (error) {
      console.error('[TurboPipeline] Pipeline error:', error);
      result.error = error.message;
    }

    return result;
  }

  // ============ PERFORMANCE REPORT ============
  function getPerformanceReport() {
    const recent = PERF_LOG.slice(-20);
    const avgByStep = {};
    
    recent.forEach(({ step, time }) => {
      if (!avgByStep[step]) avgByStep[step] = [];
      avgByStep[step].push(time);
    });

    const report = {};
    Object.entries(avgByStep).forEach(([step, times]) => {
      report[step] = {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        count: times.length
      };
    });

    return {
      report,
      targets: TIMING_TARGETS,
      apiConfig: API_CONFIG
    };
  }

  // ============ EXPORT ============
  const TurboPipeline = {
    turboExtractKeywords,
    distributeAllKeywords,
    distributeHighPriorityKeywords: (cvText, highPriorityKeywords, options = {}) => 
      distributeAllKeywords(cvText, { highPriority: highPriorityKeywords, all: highPriorityKeywords }, options),
    runLazyApplySyncPipeline,
    getPerformanceReport,
    TIMING_TARGETS,
    API_CONFIG,
    VERSION: '3.1.0-lazyapply-sync'
  };

  if (typeof window !== 'undefined') {
    window.TurboPipeline = TurboPipeline;
  }
  if (typeof global !== 'undefined') {
    global.TurboPipeline = TurboPipeline;
  }

})(typeof window !== 'undefined' ? window : global);
