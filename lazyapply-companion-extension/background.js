// LazyApply 2.0 EXTREME - Enhanced Background Service Worker
// Full ATS support with Workday multi-page handling

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

// Extension state
const ExtState = {
  enabled: true,
  autoTailor: true,
  autoQueue: false,
  workdayMultiPage: true,
  tailoredCount: 0,
  sessionStats: {
    applicationsIntercepted: 0,
    documentsGenerated: 0,
    atsScoreAverage: 0,
    jobsQueued: 0,
    applied: 0
  },
  userProfile: null,
  accessToken: null,
  jobQueue: [],
  currentWorkdaySession: null
};

// Platform detection patterns - MEGA Extended Tier-1 ATS List (60+ platforms)
const PLATFORM_PATTERNS = {
  // ============ TIER 1: Premium ATS (LazyApply + Full Autofill) ============
  greenhouse: { pattern: /greenhouse\.io/i, name: 'Greenhouse', lazyApplySupported: true, tier: 1 },
  lever: { pattern: /lever\.co/i, name: 'Lever', lazyApplySupported: true, tier: 1 },
  ashby: { pattern: /ashbyhq\.com/i, name: 'Ashby', lazyApplySupported: true, tier: 1 },
  rippling: { pattern: /rippling\.com/i, name: 'Rippling', lazyApplySupported: true, tier: 1 },
  workday: { pattern: /(workday|myworkdayjobs)\.com/i, name: 'Workday', multiPage: true, tier: 1 },
  icims: { pattern: /icims\.com/i, name: 'iCIMS', tier: 1 },
  workable: { pattern: /workable\.com/i, name: 'Workable', tier: 1 },
  smartrecruiters: { pattern: /smartrecruiters\.com/i, name: 'SmartRecruiters', tier: 1 },
  taleo: { pattern: /taleo\.net/i, name: 'Oracle Taleo', tier: 1 },
  successfactors: { pattern: /successfactors\.com/i, name: 'SAP SuccessFactors', tier: 1 },
  bamboohr: { pattern: /bamboohr\.com/i, name: 'BambooHR', tier: 1 },
  jobvite: { pattern: /jobvite\.com/i, name: 'Jobvite', tier: 1 },
  brassring: { pattern: /brassring\.com/i, name: 'IBM Kenexa BrassRing', tier: 1 },
  paylocity: { pattern: /paylocity\.com/i, name: 'Paylocity', tier: 1 },
  paycom: { pattern: /paycom\.com/i, name: 'Paycom', tier: 1 },
  ultipro: { pattern: /ultipro\.com/i, name: 'UltiPro/UKG', tier: 1 },
  adp: { pattern: /adp\.com/i, name: 'ADP Workforce', tier: 1 },
  oracle_recruiting: { pattern: /oracle\.com.*recruiting/i, name: 'Oracle Recruiting Cloud', tier: 1 },
  
  // ============ TIER 2: Major Job Boards ============
  linkedin: { pattern: /linkedin\.com/i, name: 'LinkedIn', tier: 2 },
  indeed: { pattern: /indeed\.com/i, name: 'Indeed', tier: 2 },
  glassdoor: { pattern: /glassdoor\.com/i, name: 'Glassdoor', tier: 2 },
  dice: { pattern: /dice\.com/i, name: 'Dice', tier: 2 },
  monster: { pattern: /monster\.com/i, name: 'Monster', tier: 2 },
  ziprecruiter: { pattern: /ziprecruiter\.com/i, name: 'ZipRecruiter', tier: 2 },
  careerbuilder: { pattern: /careerbuilder\.com/i, name: 'CareerBuilder', tier: 2 },
  simplyhired: { pattern: /simplyhired\.com/i, name: 'SimplyHired', tier: 2 },
  
  // ============ TIER 3: Startup/Tech Focused ============
  wellfound: { pattern: /(wellfound|angel)\.co/i, name: 'Wellfound (AngelList)', tier: 3 },
  builtin: { pattern: /builtin\.com/i, name: 'BuiltIn', tier: 3 },
  otta: { pattern: /otta\.com/i, name: 'Otta', tier: 3 },
  ycombinator: { pattern: /ycombinator\.com|workatastartup\.com/i, name: 'Y Combinator', tier: 3 },
  triplebyte: { pattern: /triplebyte\.com/i, name: 'Triplebyte', tier: 3 },
  hired: { pattern: /hired\.com/i, name: 'Hired', tier: 3 },
  cord: { pattern: /cord\.co/i, name: 'Cord', tier: 3 },
  techstars: { pattern: /techstars\.com/i, name: 'Techstars', tier: 3 },
  
  // ============ TIER 4: International/Regional ============
  usajobs: { pattern: /usajobs\.gov/i, name: 'USAJobs', tier: 4 },
  seek: { pattern: /seek\.com/i, name: 'SEEK (AU/NZ)', tier: 4 },
  reed: { pattern: /reed\.co\.uk/i, name: 'Reed (UK)', tier: 4 },
  totaljobs: { pattern: /totaljobs\.com/i, name: 'TotalJobs (UK)', tier: 4 },
  cwjobs: { pattern: /cwjobs\.co\.uk/i, name: 'CWJobs (UK)', tier: 4 },
  xing: { pattern: /xing\.com/i, name: 'XING (EU)', tier: 4 },
  stepstone: { pattern: /stepstone\./i, name: 'StepStone (EU)', tier: 4 },
  naukri: { pattern: /naukri\.com/i, name: 'Naukri (India)', tier: 4 },
  
  // ============ TIER 5: Mid-Market ATS ============
  breezy: { pattern: /breezy\.hr/i, name: 'Breezy HR', tier: 5 },
  jazz: { pattern: /jazz\.co/i, name: 'JazzHR', tier: 5 },
  personio: { pattern: /personio\.com/i, name: 'Personio', tier: 5 },
  teamtailor: { pattern: /teamtailor\.com/i, name: 'Teamtailor', tier: 5 },
  recruitee: { pattern: /recruitee\.com/i, name: 'Recruitee', tier: 5 },
  applytojob: { pattern: /applytojob\.com/i, name: 'ApplyToJob', tier: 5 },
  fountain: { pattern: /fountain\.com/i, name: 'Fountain', tier: 5 },
  pinpoint: { pattern: /pinpointhq\.com/i, name: 'Pinpoint', tier: 5 },
  homerun: { pattern: /homerun\.co/i, name: 'Homerun', tier: 5 },
  comeet: { pattern: /comeet\.com/i, name: 'Comeet', tier: 5 },
  freshteam: { pattern: /freshteam\.com/i, name: 'Freshteam', tier: 5 },
  zoho_recruit: { pattern: /zoho\.com.*recruit/i, name: 'Zoho Recruit', tier: 5 },
  bullhorn: { pattern: /bullhornstaffing\.com/i, name: 'Bullhorn', tier: 5 },
  avature: { pattern: /avature\.net/i, name: 'Avature', tier: 5 },
  cornerstone: { pattern: /cornerstoneondemand\.com/i, name: 'Cornerstone', tier: 5 },
  dayforce: { pattern: /dayforcehcm\.com/i, name: 'Ceridian Dayforce', tier: 5 },
  apploi: { pattern: /apploi\.com/i, name: 'Apploi', tier: 5 },
  hiringthing: { pattern: /hiringthing\.com/i, name: 'HiringThing', tier: 5 },
  clearcompany: { pattern: /clearcompany\.com/i, name: 'ClearCompany', tier: 5 },
  hirebridge: { pattern: /hirebridge\.com/i, name: 'HireBridge', tier: 5 },
  
  // ============ TIER 6: Specialized/Niche ============
  greenhouse_bhp: { pattern: /boards\.greenhouse\.io/i, name: 'Greenhouse Board', tier: 6 },
  remoteok: { pattern: /remoteok\.com/i, name: 'RemoteOK', tier: 6 },
  weworkremotely: { pattern: /weworkremotely\.com/i, name: 'WeWorkRemotely', tier: 6 },
  flexjobs: { pattern: /flexjobs\.com/i, name: 'FlexJobs', tier: 6 },
  remote: { pattern: /remote\.co/i, name: 'Remote.co', tier: 6 },
  himalayas: { pattern: /himalayas\.app/i, name: 'Himalayas', tier: 6 },
  arc: { pattern: /arc\.dev/i, name: 'Arc.dev', tier: 6 },
  toptal: { pattern: /toptal\.com/i, name: 'Toptal', tier: 6 },
  gun: { pattern: /gun\.io/i, name: 'Gun.io', tier: 6 },
  turing: { pattern: /turing\.com/i, name: 'Turing', tier: 6 },
  andela: { pattern: /andela\.com/i, name: 'Andela', tier: 6 }
};

function detectPlatform(url) {
  for (const [key, config] of Object.entries(PLATFORM_PATTERNS)) {
    if (config.pattern.test(url)) {
      return { 
        id: key, 
        name: config.name, 
        lazyApplySupported: config.lazyApplySupported || false,
        multiPage: config.multiPage || false
      };
    }
  }
  return { id: 'unknown', name: 'Unknown ATS', lazyApplySupported: false, multiPage: false };
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 LazyApply 2.0 EXTREME installed!');
  
  chrome.storage.local.set({
    enabled: true,
    autoTailor: true,
    autoQueue: false,
    workdayMultiPage: true,
    tailorOnApply: true,
    attachDocuments: false,
    interceptLazyApply: true,
    userProfile: null,
    accessToken: null,
    jobQueue: [],
    stats: {
      searched: 0,
      queued: 0,
      tailored: 0,
      applied: 0
    }
  });
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Message received:', message.action);
  
  switch (message.action) {
    case 'GET_STATE':
      sendResponse({ success: true, state: ExtState });
      break;
      
    case 'SET_ENABLED':
      ExtState.enabled = message.enabled;
      chrome.storage.local.set({ enabled: message.enabled });
      broadcastState();
      sendResponse({ success: true });
      break;
      
    case 'SET_AUTO_TAILOR':
      ExtState.autoTailor = message.autoTailor;
      chrome.storage.local.set({ autoTailor: message.autoTailor });
      sendResponse({ success: true });
      break;
      
    case 'SET_PROFILE':
      ExtState.userProfile = message.profile;
      chrome.storage.local.set({ userProfile: message.profile });
      sendResponse({ success: true });
      break;
      
    case 'SET_ACCESS_TOKEN':
      ExtState.accessToken = message.token;
      chrome.storage.local.set({ accessToken: message.token });
      sendResponse({ success: true });
      break;
      
    case 'TAILOR_APPLICATION':
      handleTailorRequest(message.jobData, sender.tab?.id)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'TAILOR_FOR_QUEUE':
      handleTailorForQueue(message.job)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'LAZYAPPLY_DETECTED':
      handleLazyApplyDetection(message.jobData, sender.tab?.id);
      sendResponse({ success: true });
      break;
      
    case 'GET_PROFILE':
      chrome.storage.local.get(['userProfile', 'accessToken'], (data) => {
        sendResponse({ 
          success: true, 
          profile: data.userProfile,
          hasToken: !!data.accessToken 
        });
      });
      return true;
      
    case 'GET_STATS':
      sendResponse({ success: true, stats: ExtState.sessionStats });
      break;
    
    case 'ADD_TO_QUEUE':
      addJobsToQueue(message.jobs)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'GET_QUEUE':
      chrome.storage.local.get(['jobQueue'], (data) => {
        sendResponse({ success: true, queue: data.jobQueue || [] });
      });
      return true;
      
    case 'CLEAR_QUEUE':
      chrome.storage.local.set({ jobQueue: [] });
      ExtState.jobQueue = [];
      sendResponse({ success: true });
      break;
      
    case 'FETCH_LIVE_JOBS':
      fetchLiveJobs(message.keywords, message.location, message.dateFilter)
        .then(jobs => sendResponse({ success: true, jobs }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'START_BATCH_APPLY':
      startBatchApplyFromQueue()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'WORKDAY_PAGE_CHANGED':
      handleWorkdayPageChange(message.pageData, sender.tab?.id);
      sendResponse({ success: true });
      break;
      
    case 'MARK_JOB_APPLIED':
      markJobAsApplied(message.jobId);
      sendResponse({ success: true });
      break;
      
    case 'GET_CURRENT_JOB':
      chrome.storage.local.get(['currentApplyJob', 'attachDocuments'], (data) => {
        sendResponse({ 
          success: true, 
          job: data.currentApplyJob,
          attachDocuments: data.attachDocuments 
        });
      });
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});

// Add jobs to queue
async function addJobsToQueue(jobs) {
  const storage = await chrome.storage.local.get(['jobQueue']);
  const currentQueue = storage.jobQueue || [];
  
  const newJobs = jobs.filter(j => !currentQueue.some(q => q.url === j.url));
  const updatedQueue = [...currentQueue, ...newJobs];
  
  await chrome.storage.local.set({ jobQueue: updatedQueue });
  ExtState.jobQueue = updatedQueue;
  ExtState.sessionStats.jobsQueued += newJobs.length;
  
  console.log(`📋 Added ${newJobs.length} jobs to queue. Total: ${updatedQueue.length}`);
}

// Fetch live jobs from QuantumHire backend
async function fetchLiveJobs(keywords, location, dateFilter) {
  console.log('🔍 Fetching live jobs for:', keywords);
  
  const storage = await chrome.storage.local.get(['accessToken']);
  
  if (!storage.accessToken) {
    throw new Error('Not authenticated. Please load your profile from QuantumHire first.');
  }
  
  try {
    let query = keywords;
    if (location) {
      query += ` ${location}`;
    }
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/search-jobs-google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${storage.accessToken}`
      },
      body: JSON.stringify({ 
        keywords: query,
        dateFilter: dateFilter
      })
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        await chrome.storage.local.remove(['accessToken']);
        throw new Error('Session expired. Please reload your profile from QuantumHire.');
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`✅ Found ${data.jobs?.length || 0} jobs`);
    
    return data.jobs || [];
  } catch (error) {
    console.error('❌ Failed to fetch jobs:', error);
    throw error;
  }
}

// Start batch apply from queue
async function startBatchApplyFromQueue() {
  const storage = await chrome.storage.local.get(['jobQueue', 'userProfile', 'tailorOnApply']);
  const queue = storage.jobQueue || [];
  
  if (queue.length === 0) {
    throw new Error('No jobs in queue');
  }
  
  console.log(`🚀 Starting batch apply for ${queue.length} jobs`);
  
  // Get first pending job
  const pendingJob = queue.find(j => j.status === 'pending');
  if (!pendingJob) {
    console.log('All jobs processed!');
    return;
  }
  
  // Tailor if enabled and not already tailored
  if (storage.tailorOnApply && !pendingJob.tailored) {
    try {
      const tailored = await handleTailorForQueue(pendingJob);
      pendingJob.tailored = true;
      pendingJob.tailoredData = tailored;
      
      // Update queue
      const idx = queue.findIndex(j => j.id === pendingJob.id);
      if (idx >= 0) {
        queue[idx] = pendingJob;
      }
      await chrome.storage.local.set({ jobQueue: queue });
    } catch (error) {
      console.error('Tailoring failed:', error);
    }
  }
  
  // Store current job for content script
  await chrome.storage.local.set({ currentApplyJob: pendingJob });
  
  // Open job in new tab
  if (pendingJob.url) {
    chrome.tabs.create({ url: pendingJob.url, active: true });
  }
  
  // Update status
  pendingJob.status = 'applying';
  const idx = queue.findIndex(j => j.id === pendingJob.id);
  if (idx >= 0) {
    queue[idx] = pendingJob;
  }
  await chrome.storage.local.set({ jobQueue: queue });
}

// Mark job as applied
async function markJobAsApplied(jobId) {
  const storage = await chrome.storage.local.get(['jobQueue', 'stats']);
  const queue = storage.jobQueue || [];
  const stats = storage.stats || { searched: 0, queued: 0, tailored: 0, applied: 0 };
  
  const idx = queue.findIndex(j => j.id === jobId);
  if (idx >= 0) {
    queue[idx].status = 'applied';
    stats.applied++;
    await chrome.storage.local.set({ jobQueue: queue, stats });
    ExtState.sessionStats.applied++;
  }
}

// Broadcast state to all tabs
function broadcastState() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'STATE_UPDATE',
        state: ExtState
      }).catch(() => {});
    });
  });
}

// Handle LazyApply detection - intercept and enhance
async function handleLazyApplyDetection(jobData, tabId) {
  if (!ExtState.enabled || !ExtState.autoTailor) {
    console.log('⏸️ Auto-tailoring disabled');
    return;
  }
  
  console.log('🎯 LazyApply activity detected! Intercepting...', jobData);
  ExtState.sessionStats.applicationsIntercepted++;
  
  try {
    const tailoredData = await handleTailorRequest(jobData, tabId);
    
    // Send tailored data back to content script
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: 'INJECT_TAILORED_DATA',
        data: tailoredData
      });
    }
    
    ExtState.sessionStats.documentsGenerated++;
    updateAverageScore(tailoredData.matchScore || 0);
    
  } catch (error) {
    console.error('❌ Failed to tailor application:', error);
  }
}

// Handle Workday multi-page navigation
async function handleWorkdayPageChange(pageData, tabId) {
  if (!ExtState.workdayMultiPage) return;
  
  console.log('📄 Workday page change detected:', pageData.pageType);
  
  const storage = await chrome.storage.local.get(['currentApplyJob']);
  const currentJob = storage.currentApplyJob;
  
  if (!currentJob || !currentJob.tailoredData) {
    console.log('No tailored data available for Workday');
    return;
  }
  
  // Send data to content script based on page type
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      action: 'WORKDAY_FILL_PAGE',
      pageType: pageData.pageType,
      tailoredData: currentJob.tailoredData
    }).catch(() => {});
  }
}

// Tailor for queue job (without tab)
async function handleTailorForQueue(job) {
  console.log('🔧 Tailoring for queue:', job.title, 'at', job.company);
  
  const storage = await chrome.storage.local.get(['userProfile', 'accessToken']);
  const profile = storage.userProfile || ExtState.userProfile;
  const token = storage.accessToken || ExtState.accessToken;
  
  if (!profile) {
    throw new Error('No user profile configured. Please set up your profile first.');
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        jobTitle: job.title || 'Unknown Position',
        company: job.company || 'Unknown Company',
        jobDescription: job.description || '',
        location: job.location || '',
        requirements: job.requirements || [],
        userProfile: profile
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Queue tailoring complete! Match score:', result.matchScore);
    
    // Update stats
    const stats = (await chrome.storage.local.get(['stats'])).stats || {};
    stats.tailored = (stats.tailored || 0) + 1;
    await chrome.storage.local.set({ stats });
    
    return result;
    
  } catch (error) {
    console.error('❌ Queue tailoring failed:', error);
    throw error;
  }
}

// Main tailoring function
async function handleTailorRequest(jobData, tabId) {
  console.log('🔧 Tailoring application for:', jobData.title, 'at', jobData.company);
  
  const storage = await chrome.storage.local.get(['userProfile', 'accessToken']);
  const profile = storage.userProfile || ExtState.userProfile;
  const token = storage.accessToken || ExtState.accessToken;
  
  if (!profile) {
    throw new Error('No user profile configured. Please set up your profile first.');
  }
  
  // Notify content script that tailoring started
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      action: 'TAILORING_STATUS',
      status: 'started',
      message: 'Generating ATS-optimized documents...'
    }).catch(() => {});
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        jobTitle: jobData.title || 'Unknown Position',
        company: jobData.company || 'Unknown Company',
        jobDescription: jobData.description || '',
        location: jobData.location || '',
        requirements: jobData.requirements || [],
        userProfile: profile
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    console.log('✅ Tailoring complete! Match score:', result.matchScore);
    
    // Notify success
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: 'TAILORING_STATUS',
        status: 'complete',
        message: `ATS Score: ${result.matchScore}%`,
        data: result
      }).catch(() => {});
    }
    
    // Store result for later use
    await storeApplicationResult(jobData, result);
    
    return result;
    
  } catch (error) {
    console.error('❌ Tailoring failed:', error);
    
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: 'TAILORING_STATUS',
        status: 'error',
        message: error.message
      }).catch(() => {});
    }
    
    throw error;
  }
}

// Store application result for history
async function storeApplicationResult(jobData, tailoredData) {
  const history = (await chrome.storage.local.get('applicationHistory')).applicationHistory || [];
  
  history.unshift({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    job: {
      title: jobData.title,
      company: jobData.company,
      location: jobData.location,
      url: jobData.url
    },
    matchScore: tailoredData.matchScore,
    platform: detectPlatform(jobData.url || '').name
  });
  
  // Keep last 100 applications
  if (history.length > 100) {
    history.pop();
  }
  
  await chrome.storage.local.set({ applicationHistory: history });
}

// Update running average score
function updateAverageScore(newScore) {
  const count = ExtState.sessionStats.documentsGenerated;
  const currentAvg = ExtState.sessionStats.atsScoreAverage;
  if (count > 0) {
    ExtState.sessionStats.atsScoreAverage = ((currentAvg * (count - 1)) + newScore) / count;
  } else {
    ExtState.sessionStats.atsScoreAverage = newScore;
  }
}

// Load saved state on startup
chrome.storage.local.get([
  'enabled', 'autoTailor', 'workdayMultiPage', 
  'userProfile', 'accessToken', 'stats', 'jobQueue'
], (data) => {
  if (data.enabled !== undefined) ExtState.enabled = data.enabled;
  if (data.autoTailor !== undefined) ExtState.autoTailor = data.autoTailor;
  if (data.workdayMultiPage !== undefined) ExtState.workdayMultiPage = data.workdayMultiPage;
  if (data.userProfile) ExtState.userProfile = data.userProfile;
  if (data.accessToken) ExtState.accessToken = data.accessToken;
  if (data.jobQueue) ExtState.jobQueue = data.jobQueue;
  if (data.stats) {
    ExtState.sessionStats = { ...ExtState.sessionStats, ...data.stats };
  }
  console.log('📦 State loaded:', ExtState);
});
