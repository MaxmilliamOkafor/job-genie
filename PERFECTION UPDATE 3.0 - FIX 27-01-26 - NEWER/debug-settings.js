// PERFECTION - Debug Settings Page
// Full debugging and logging console with REAL-TIME updates

(function() {
  'use strict';

  console.log('[PERFECTION Debug] Debug settings page loaded');

  // State
  let allLogs = [];
  let currentFilter = 'all';
  let isAutoRefresh = true;
  let refreshInterval = null;
  let debugSettings = {
    verboseLogging: true,
    logApiResponses: true,
    logDomInteractions: true,
    perfMetrics: true,
    autoExportErrors: false
  };

  // DOM Elements
  const logViewer = document.getElementById('logViewer');
  const tailoringTimeline = document.getElementById('tailoringTimeline');
  const currentState = document.getElementById('currentState');

  // Stats elements
  const statElements = {
    totalEvents: document.getElementById('statTotalEvents'),
    successRate: document.getElementById('statSuccessRate'),
    avgTime: document.getElementById('statAvgTime'),
    errors: document.getElementById('statErrors'),
    jobsTailored: document.getElementById('statJobsTailored'),
    filesAttached: document.getElementById('statFilesAttached')
  };

  // Initialize
  async function init() {
    await loadDebugSettings();
    await loadLogs();
    bindEvents();
    startAutoRefresh();
    updateStats();
    loadCurrentState();
    setupStorageListener();
    console.log('[PERFECTION Debug] ✅ Debug console initialized with real-time updates');
  }

  // Setup real-time storage listener
  function setupStorageListener() {
    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      
      const relevantKeys = [
        'ats_auto_tailor_logs',
        'ats_debug_logs', 
        'ats_error_logs',
        'ats_tailoring_sessions'
      ];
      
      const hasRelevantChange = relevantKeys.some(key => key in changes);
      
      if (hasRelevantChange) {
        console.log('[PERFECTION Debug] Storage changed, refreshing logs...');
        loadLogs();
        loadCurrentState();
      }
    });

    // Listen for direct log notifications
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'DEBUG_LOG_ADDED') {
        console.log('[PERFECTION Debug] New log received:', message.log?.event);
        // Immediately add to display
        if (message.log) {
          allLogs.unshift(message.log);
          renderLogs();
          updateStats();
        }
        sendResponse({ received: true });
      }
      return true;
    });
  }

  // Load debug settings from storage
  async function loadDebugSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(['ats_debug_settings'], result => {
        if (result.ats_debug_settings) {
          debugSettings = { ...debugSettings, ...result.ats_debug_settings };
        }
        
        // Update toggles
        const verboseEl = document.getElementById('verboseLogging');
        const apiEl = document.getElementById('logApiResponses');
        const domEl = document.getElementById('logDomInteractions');
        const perfEl = document.getElementById('perfMetrics');
        const autoEl = document.getElementById('autoExportErrors');
        
        if (verboseEl) verboseEl.checked = debugSettings.verboseLogging;
        if (apiEl) apiEl.checked = debugSettings.logApiResponses;
        if (domEl) domEl.checked = debugSettings.logDomInteractions;
        if (perfEl) perfEl.checked = debugSettings.perfMetrics;
        if (autoEl) autoEl.checked = debugSettings.autoExportErrors;
        
        resolve();
      });
    });
  }

  // Save debug settings
  async function saveDebugSettings() {
    debugSettings = {
      verboseLogging: document.getElementById('verboseLogging')?.checked ?? true,
      logApiResponses: document.getElementById('logApiResponses')?.checked ?? true,
      logDomInteractions: document.getElementById('logDomInteractions')?.checked ?? true,
      perfMetrics: document.getElementById('perfMetrics')?.checked ?? true,
      autoExportErrors: document.getElementById('autoExportErrors')?.checked ?? false
    };
    
    await chrome.storage.local.set({ ats_debug_settings: debugSettings });
    console.log('[PERFECTION Debug] Settings saved:', debugSettings);
  }

  // Normalize log level - ensure consistent level names
  function normalizeLevel(level, event) {
    // Already valid level
    if (['debug', 'info', 'success', 'warn', 'error'].includes(level)) {
      return level;
    }
    // Infer from event name
    if (event) {
      if (event.includes('error') || event.includes('fail')) return 'error';
      if (event.includes('success') || event.includes('complete')) return 'success';
      if (event.includes('warn')) return 'warn';
    }
    return level || 'info';
  }

  // Load logs from storage
  async function loadLogs() {
    return new Promise(resolve => {
      chrome.storage.local.get([
        'ats_auto_tailor_logs',
        'ats_debug_logs',
        'ats_error_logs',
        'ats_tailoring_sessions'
      ], result => {
        // Combine all log sources
        const autoTailorLogs = result.ats_auto_tailor_logs || [];
        const debugLogs = result.ats_debug_logs || [];
        const errorLogs = result.ats_error_logs || [];
        
        // Normalize and combine - preserve original levels
        allLogs = [
          ...autoTailorLogs.map(log => ({
            ...log,
            level: normalizeLevel(log.level, log.event),
            source: 'auto_tailor'
          })),
          ...debugLogs.map(log => ({
            ...log,
            level: normalizeLevel(log.level, log.event),
            source: 'debug'
          })),
          ...errorLogs.map(log => ({
            ...log,
            level: 'error',
            source: 'error'
          }))
        ];
        
        // Dedupe by id
        const seen = new Set();
        allLogs = allLogs.filter(log => {
          const id = log.id || `${log.timestamp}-${log.event}`;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        
        // Sort by timestamp
        allLogs.sort((a, b) => {
          const tsA = new Date(b.timestamp || b.ts || 0).getTime();
          const tsB = new Date(a.timestamp || a.ts || 0).getTime();
          return tsA - tsB;
        });

        renderLogs();
        renderTimeline(result.ats_tailoring_sessions || []);
        updateStats();
        resolve();
      });
    });
  }

  // Render logs
  function renderLogs() {
    if (!logViewer) return;
    
    const filteredLogs = currentFilter === 'all' 
      ? allLogs 
      : allLogs.filter(log => log.level === currentFilter);

    if (filteredLogs.length === 0) {
      logViewer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <h3>No ${currentFilter === 'all' ? '' : currentFilter + ' '}events</h3>
          <p>Events will appear here as you use the extension</p>
          <p style="color: #666; font-size: 12px; margin-top: 10px;">Logs update in real-time</p>
        </div>
      `;
      return;
    }

    logViewer.innerHTML = filteredLogs.slice(0, 300).map(log => {
      const timestamp = formatTimestamp(log.timestamp || log.ts);
      const level = log.level || 'info';
      const event = log.event || log.action || 'unknown';
      const message = formatLogMessage(log);
      const details = log.data || log.details || log.payload;
      const url = log.url ? `<div class="log-url">${truncateUrl(log.url)}</div>` : '';

      return `
        <div class="log-entry ${level}">
          <div class="log-header">
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-level ${level}">${level.toUpperCase()}</span>
            <span class="log-event">${event}</span>
          </div>
          <div class="log-message">
            ${message}
            ${log.durationMs ? `<span class="log-duration">${log.durationMs}ms</span>` : ''}
          </div>
          ${url}
          ${details ? `<pre class="log-details">${JSON.stringify(details, null, 2).substring(0, 500)}${JSON.stringify(details).length > 500 ? '...' : ''}</pre>` : ''}
        </div>
      `;
    }).join('');
  }

  // Truncate URL for display
  function truncateUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      const path = u.pathname.length > 40 ? u.pathname.substring(0, 40) + '...' : u.pathname;
      return `${u.hostname}${path}`;
    } catch {
      return url.substring(0, 60);
    }
  }

  // Format timestamp
  function formatTimestamp(ts) {
    if (!ts) return '--:--:--';
    const date = new Date(ts);
    return date.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  }

  // Format log message
  function formatLogMessage(log) {
    if (log.message) return log.message;
    if (log.event) {
      switch (log.event) {
        case 'extension_loaded': return 'Extension initialized';
        case 'autotailor_start': return 'Auto-tailoring started';
        case 'autotailor_complete': return `Completed in ${log.durationMs || 0}ms`;
        case 'autotailor_error': return `Error: ${log.message || 'Unknown error'}`;
        case 'stage': return `Stage: ${log.stage || log.data?.stage || ''}`;
        case 'fetch_start': return `Fetching: ${log.data?.label || log.label || ''}`;
        case 'fetch_end': return `Fetched: ${log.data?.label || ''} (${log.data?.status || log.status || 'ok'}, ${log.durationMs || 0}ms)`;
        case 'fetch_error': return `Fetch failed: ${log.data?.label || log.label || ''}`;
        case 'job_detected': return `Job: ${log.title || log.data?.title || ''} at ${log.company || log.data?.company || ''}`;
        case 'tailor_success': return `Match: ${log.matchScore || log.data?.matchScore || 0}%`;
        case 'tailor_error': return `Tailoring failed: ${log.message || ''}`;
        case 'attach_complete': return `${log.data?.filesAttached || 'Files'} attached`;
        case 'attach_error': return `Attach failed: ${log.message || ''}`;
        case 'cache_hit': return `Using cached: ${log.data?.key || 'documents'}`;
        case 'cache_miss': return `Not in cache: ${log.data?.key || ''}`;
        case 'pdf_generated': return `PDF generated: ${log.data?.type || ''} (${log.durationMs || 0}ms)`;
        case 'keywords_extracted': return `${log.data?.count || 0} keywords extracted`;
        default: return log.event;
      }
    }
    return 'No message';
  }

  // Render timeline
  function renderTimeline(sessions) {
    if (!tailoringTimeline) return;
    
    if (!sessions || sessions.length === 0) {
      tailoringTimeline.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎯</div>
          <h3>No tailoring sessions</h3>
          <p>Complete a tailoring session to see the timeline</p>
        </div>
      `;
      return;
    }

    tailoringTimeline.innerHTML = sessions.slice(0, 15).map(session => {
      const status = session.error ? 'error' : (session.success ? 'success' : 'warning');
      const time = formatTimestamp(session.timestamp);
      
      return `
        <div class="timeline-item ${status}">
          <div class="timeline-header">
            <span class="timeline-event">${session.jobTitle || 'Unknown Job'}</span>
            <span class="timeline-time">${time}</span>
          </div>
          <div class="timeline-details">
            <strong>${session.company || 'Unknown Company'}</strong><br>
            ${session.matchScore ? `Match: ${session.matchScore}%` : ''} 
            ${session.duration ? `• Duration: ${session.duration}ms` : ''}
            ${session.error ? `<br><span style="color: var(--error)">Error: ${session.error}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Update stats
  function updateStats() {
    const successLogs = allLogs.filter(l => l.level === 'success' || l.event?.includes('complete') || l.event?.includes('success'));
    const errorLogs = allLogs.filter(l => l.level === 'error');
    const tailorLogs = allLogs.filter(l => l.event === 'tailor_success');
    const attachLogs = allLogs.filter(l => l.event === 'attach_complete');
    
    // Calculate avg time
    const timeLogs = allLogs.filter(l => l.durationMs && l.durationMs > 0);
    const avgTime = timeLogs.length > 0 
      ? Math.round(timeLogs.reduce((sum, l) => sum + l.durationMs, 0) / timeLogs.length)
      : 0;

    const totalOps = successLogs.length + errorLogs.length;
    const successRate = totalOps > 0 
      ? Math.round((successLogs.length / totalOps) * 100)
      : 100;

    if (statElements.totalEvents) statElements.totalEvents.textContent = allLogs.length;
    if (statElements.successRate) statElements.successRate.textContent = successRate + '%';
    if (statElements.avgTime) statElements.avgTime.textContent = avgTime + 'ms';
    if (statElements.errors) statElements.errors.textContent = errorLogs.length;
    if (statElements.jobsTailored) statElements.jobsTailored.textContent = tailorLogs.length;
    if (statElements.filesAttached) statElements.filesAttached.textContent = attachLogs.length;
  }

  // Load current state
  async function loadCurrentState() {
    if (!currentState) return;
    
    return new Promise(resolve => {
      chrome.storage.local.get(null, result => {
        // Filter out sensitive data and format
        const safeState = {};
        const sensitiveKeys = ['ats_session', 'workday_password', 'workday_verify_password'];
        
        for (const [key, value] of Object.entries(result)) {
          if (sensitiveKeys.includes(key)) {
            safeState[key] = '[REDACTED]';
          } else if (key.includes('pdf') || key.includes('PDF')) {
            safeState[key] = value ? `[BASE64 ${String(value).length} chars]` : null;
          } else if (typeof value === 'object' && value !== null) {
            const str = JSON.stringify(value);
            safeState[key] = str.length > 200 ? `[Object ${str.length} chars]` : value;
          } else {
            safeState[key] = value;
          }
        }
        
        currentState.textContent = JSON.stringify(safeState, null, 2);
        resolve();
      });
    });
  }

  // Export logs
  function exportLogs() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      extensionVersion: chrome.runtime.getManifest().version,
      settings: debugSettings,
      logs: allLogs,
      stats: {
        total: allLogs.length,
        errors: allLogs.filter(l => l.level === 'error').length,
        successes: allLogs.filter(l => l.level === 'success').length
      }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perfection-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('[PERFECTION Debug] Logs exported');
  }

  // Clear logs
  async function clearLogs() {
    if (!confirm('Are you sure you want to clear all debug logs?')) return;
    
    await chrome.storage.local.remove([
      'ats_auto_tailor_logs',
      'ats_debug_logs',
      'ats_error_logs',
      'ats_tailoring_sessions'
    ]);
    
    allLogs = [];
    renderLogs();
    renderTimeline([]);
    updateStats();
    
    console.log('[PERFECTION Debug] Logs cleared');
  }

  // Add test log (for debugging the debug console)
  function addTestLog() {
    const testLog = {
      id: `test-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ts: Date.now(),
      level: 'info',
      event: 'test_log',
      message: 'Test log entry from debug console',
      data: { test: true, timestamp: Date.now() },
      source: 'debug_console'
    };
    
    chrome.storage.local.get(['ats_debug_logs'], (result) => {
      const logs = result.ats_debug_logs || [];
      logs.unshift(testLog);
      chrome.storage.local.set({ ats_debug_logs: logs }, () => {
        console.log('[PERFECTION Debug] Test log added');
      });
    });
  }

  // Bind events
  function bindEvents() {
    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.dataset.filter;
        renderLogs();
      });
    });

    // Settings toggles
    ['verboseLogging', 'logApiResponses', 'logDomInteractions', 'perfMetrics', 'autoExportErrors'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', saveDebugSettings);
    });

    // Action buttons
    const refreshBtn = document.getElementById('refreshLogs');
    const exportBtn = document.getElementById('exportLogs');
    const clearBtn = document.getElementById('clearLogs');
    const refreshStateBtn = document.getElementById('refreshState');
    const testLogBtn = document.getElementById('addTestLog');
    
    if (refreshBtn) refreshBtn.addEventListener('click', loadLogs);
    if (exportBtn) exportBtn.addEventListener('click', exportLogs);
    if (clearBtn) clearBtn.addEventListener('click', clearLogs);
    if (refreshStateBtn) refreshStateBtn.addEventListener('click', loadCurrentState);
    if (testLogBtn) testLogBtn.addEventListener('click', addTestLog);
  }

  // Auto-refresh every 2 seconds (faster refresh)
  function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    
    refreshInterval = setInterval(() => {
      if (isAutoRefresh) {
        loadLogs();
        loadCurrentState();
        updateCacheStats();
      }
    }, 2000);
  }

  // Update cache stats display
  function updateCacheStats() {
    if (typeof CacheManager === 'undefined') {
      console.log('[PERFECTION Debug] CacheManager not available');
      return;
    }
    
    const stats = CacheManager.getCacheStats();
    
    const jdCacheEl = document.getElementById('statJDCacheSize');
    const keywordCacheEl = document.getElementById('statKeywordCacheSize');
    const profileCacheEl = document.getElementById('statProfileCacheStatus');
    const debounceEl = document.getElementById('statPendingDebounces');
    
    if (jdCacheEl) jdCacheEl.textContent = `${stats.jdHashCache.size}/${stats.jdHashCache.maxSize}`;
    if (keywordCacheEl) keywordCacheEl.textContent = `${stats.keywordUrlCache.size}/${stats.keywordUrlCache.maxSize}`;
    if (profileCacheEl) profileCacheEl.textContent = stats.profileCache.hasData ? `Yes (${stats.profileCache.ageSeconds}s)` : 'No';
    if (debounceEl) debounceEl.textContent = stats.pendingDebounces;
  }

  // Clear all caches
  function clearAllCaches() {
    if (typeof CacheManager === 'undefined') {
      console.log('[PERFECTION Debug] CacheManager not available');
      return;
    }
    
    CacheManager.clearAllCaches();
    updateCacheStats();
    console.log('[PERFECTION Debug] All caches cleared');
    
    // Show visual feedback
    const btn = document.getElementById('clearAllCaches');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = '✅ Cleared!';
      setTimeout(() => btn.textContent = originalText, 2000);
    }
  }

  // Bind cache button
  function bindCacheEvents() {
    const clearCachesBtn = document.getElementById('clearAllCaches');
    if (clearCachesBtn) {
      clearCachesBtn.addEventListener('click', clearAllCaches);
    }
  }

  // Initialize on load
  init();
  bindCacheEvents();
  updateCacheStats();
})();
