// LazyApply 2.0 EXTREME - Background Service Worker
// Supercharges LazyApply with AI-powered ATS tailoring

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';

// Extension state
const ExtState = {
  enabled: true,
  autoTailor: true,
  tailoredCount: 0,
  sessionStats: {
    applicationsIntercepted: 0,
    documentsGenerated: 0,
    atsScoreAverage: 0
  },
  userProfile: null,
  accessToken: null
};

// Platform detection patterns
const PLATFORM_PATTERNS = {
  linkedin: { pattern: /linkedin\.com/i, name: 'LinkedIn' },
  indeed: { pattern: /indeed\.com/i, name: 'Indeed' },
  glassdoor: { pattern: /glassdoor\.com/i, name: 'Glassdoor' },
  greenhouse: { pattern: /greenhouse\.io/i, name: 'Greenhouse' },
  lever: { pattern: /lever\.co/i, name: 'Lever' },
  workday: { pattern: /(workday|myworkdayjobs)\.com/i, name: 'Workday' },
  ashby: { pattern: /ashbyhq\.com/i, name: 'Ashby' },
  smartrecruiters: { pattern: /smartrecruiters\.com/i, name: 'SmartRecruiters' },
  icims: { pattern: /icims\.com/i, name: 'iCIMS' },
  jobvite: { pattern: /jobvite\.com/i, name: 'Jobvite' },
  bamboohr: { pattern: /bamboohr\.com/i, name: 'BambooHR' },
  breezy: { pattern: /breezy\.hr/i, name: 'Breezy HR' },
  jazz: { pattern: /jazz\.co/i, name: 'JazzHR' },
  taleo: { pattern: /taleo\.net/i, name: 'Taleo' },
  dice: { pattern: /dice\.com/i, name: 'Dice' },
  monster: { pattern: /monster\.com/i, name: 'Monster' },
  ziprecruiter: { pattern: /ziprecruiter\.com/i, name: 'ZipRecruiter' },
  wellfound: { pattern: /(wellfound|angel)\.co/i, name: 'Wellfound' },
  builtin: { pattern: /builtin\.com/i, name: 'BuiltIn' },
  usajobs: { pattern: /usajobs\.gov/i, name: 'USAJobs' },
  otta: { pattern: /otta\.com/i, name: 'Otta' },
  rippling: { pattern: /rippling\.com/i, name: 'Rippling' },
  workable: { pattern: /workable\.com/i, name: 'Workable' },
  personio: { pattern: /personio\.com/i, name: 'Personio' },
  teamtailor: { pattern: /teamtailor\.com/i, name: 'Teamtailor' }
};

function detectPlatform(url) {
  for (const [key, config] of Object.entries(PLATFORM_PATTERNS)) {
    if (config.pattern.test(url)) {
      return { id: key, name: config.name };
    }
  }
  return { id: 'unknown', name: 'Unknown ATS' };
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 LazyApply 2.0 EXTREME installed!');
  
  chrome.storage.local.set({
    enabled: true,
    autoTailor: true,
    interceptLazyApply: true,
    userProfile: null,
    accessToken: null,
    stats: {
      totalIntercepted: 0,
      totalTailored: 0,
      averageScore: 0
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
      return true; // Keep channel open for async response
      
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
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});

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

// Main tailoring function
async function handleTailorRequest(jobData, tabId) {
  console.log('🔧 Tailoring application for:', jobData.title, 'at', jobData.company);
  
  // Get stored profile and token
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
  ExtState.sessionStats.atsScoreAverage = 
    ((currentAvg * (count - 1)) + newScore) / count;
}

// Load saved state on startup
chrome.storage.local.get(['enabled', 'autoTailor', 'userProfile', 'accessToken', 'stats'], (data) => {
  if (data.enabled !== undefined) ExtState.enabled = data.enabled;
  if (data.autoTailor !== undefined) ExtState.autoTailor = data.autoTailor;
  if (data.userProfile) ExtState.userProfile = data.userProfile;
  if (data.accessToken) ExtState.accessToken = data.accessToken;
  if (data.stats) {
    ExtState.sessionStats = { ...ExtState.sessionStats, ...data.stats };
  }
  console.log('📦 State loaded:', ExtState);
});
