// ATS Tailor - Debug Settings Page
// Full debugging and logging console

(function() {
  'use strict';

  console.log('[ATS Debug] Debug settings page loaded');

  // State
  let allLogs = [];
  let currentFilter = 'all';
  let debugSettings = {
    verboseLogging: true,
    logApiResponses: false,
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
  }

  // Load debug settings from storage
  async function loadDebugSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(['ats_debug_settings'], result => {
        if (result.ats_debug_settings) {
          debugSettings = { ...debugSettings, ...result.ats_debug_settings };
        }
        
        // Update toggles
        document.getElementById('verboseLogging').checked = debugSettings.verboseLogging;
        document.getElementById('logApiResponses').checked = debugSettings.logApiResponses;
        document.getElementById('logDomInteractions').checked = debugSettings.logDomInteractions;
        document.getElementById('perfMetrics').checked = debugSettings.perfMetrics;
        document.getElementById('autoExportErrors').checked = debugSettings.autoExportErrors;
        
        resolve();
      });
    });
  }

  // Save debug settings
  async function saveDebugSettings() {
    debugSettings = {
      verboseLogging: document.getElementById('verboseLogging').checked,
      logApiResponses: document.getElementById('logApiResponses').checked,
      logDomInteractions: document.getElementById('logDomInteractions').checked,
      perfMetrics: document.getElementById('perfMetrics').checked,
      autoExportErrors: document.getElementById('autoExportErrors').checked
    };
    
    await chrome.storage.local.set({ ats_debug_settings: debugSettings });
    console.log('[ATS Debug] Settings saved:', debugSettings);
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
        
        // Normalize and combine
        allLogs = [
          ...autoTailorLogs.map(log => ({
            ...log,
            level: log.level || (log.event?.includes('error') ? 'error' : 'info'),
            source: 'auto_tailor'
          })),
          ...debugLogs.map(log => ({
            ...log,
            level: log.level || 'debug',
            source: 'debug'
          })),
          ...errorLogs.map(log => ({
            ...log,
            level: 'error',
            source: 'error'
          }))
        ].sort((a, b) => new Date(b.timestamp || b.ts || 0) - new Date(a.timestamp || a.ts || 0));

        renderLogs();
        renderTimeline(result.ats_tailoring_sessions || []);
        resolve();
      });
    });
  }

  // Render logs
  function renderLogs() {
    const filteredLogs = currentFilter === 'all' 
      ? allLogs 
      : allLogs.filter(log => log.level === currentFilter);

    if (filteredLogs.length === 0) {
      logViewer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <h3>No ${currentFilter === 'all' ? '' : currentFilter + ' '}events</h3>
          <p>Events will appear here as you use the extension</p>
        </div>
      `;
      return;
    }

    logViewer.innerHTML = filteredLogs.slice(0, 200).map(log => {
      const timestamp = formatTimestamp(log.timestamp || log.ts);
      const level = log.level || 'info';
      const event = log.event || log.action || 'unknown';
      const message = formatLogMessage(log);
      const details = log.data || log.details || log.payload;

      return `
        <div class="log-entry">
          <span class="log-timestamp">${timestamp}</span>
          <span class="log-level ${level}">${level}</span>
          <span class="log-event">${event}</span>
          <div class="log-message">
            ${message}
            ${details ? `<div class="log-details">${JSON.stringify(details, null, 2).substring(0, 200)}...</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
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
        case 'autotailor_start': return 'Auto-tailoring started';
        case 'autotailor_complete': return `Completed in ${log.durationMs}ms`;
        case 'autotailor_error': return `Error: ${log.message || 'Unknown error'}`;
        case 'stage': return `Stage: ${log.stage}`;
        case 'fetch_start': return `Fetching: ${log.label}`;
        case 'fetch_end': return `Fetched: ${log.label} (${log.status}, ${log.durationMs}ms)`;
        case 'fetch_error': return `Fetch failed: ${log.label}`;
        case 'job_detected': return `Job: ${log.title} at ${log.company}`;
        case 'tailor_success': return `Match: ${log.matchScore}%`;
        case 'attach_complete': return 'Files attached';
        case 'cache_hit': return 'Using cached tailored documents';
        default: return log.event;
      }
    }
    return 'No message';
  }

  // Render timeline
  function renderTimeline(sessions) {
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

    tailoringTimeline.innerHTML = sessions.slice(0, 10).map(session => {
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
    const successLogs = allLogs.filter(l => l.level === 'success' || l.event?.includes('complete'));
    const errorLogs = allLogs.filter(l => l.level === 'error');
    const tailorLogs = allLogs.filter(l => l.event === 'tailor_success');
    const attachLogs = allLogs.filter(l => l.event === 'attach_complete');
    
    // Calculate avg time
    const timeLogs = allLogs.filter(l => l.durationMs);
    const avgTime = timeLogs.length > 0 
      ? Math.round(timeLogs.reduce((sum, l) => sum + l.durationMs, 0) / timeLogs.length)
      : 0;

    const successRate = allLogs.length > 0 
      ? Math.round((successLogs.length / allLogs.length) * 100)
      : 0;

    statElements.totalEvents.textContent = allLogs.length;
    statElements.successRate.textContent = successRate + '%';
    statElements.avgTime.textContent = avgTime + 'ms';
    statElements.errors.textContent = errorLogs.length;
    statElements.jobsTailored.textContent = tailorLogs.length;
    statElements.filesAttached.textContent = attachLogs.length;
  }

  // Load current state
  async function loadCurrentState() {
    return new Promise(resolve => {
      chrome.storage.local.get(null, result => {
        // Filter out sensitive data
        const safeState = {};
        const sensitiveKeys = ['ats_session', 'workday_password', 'workday_verify_password'];
        
        for (const [key, value] of Object.entries(result)) {
          if (sensitiveKeys.includes(key)) {
            safeState[key] = '[REDACTED]';
          } else if (key.includes('pdf') || key.includes('PDF')) {
            safeState[key] = value ? `[BASE64 ${String(value).length} chars]` : null;
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
      settings: debugSettings,
      logs: allLogs,
      stats: {
        total: allLogs.length,
        errors: allLogs.filter(l => l.level === 'error').length
      }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ats-tailor-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('[ATS Debug] Logs exported');
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
    
    console.log('[ATS Debug] Logs cleared');
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
      document.getElementById(id).addEventListener('change', saveDebugSettings);
    });

    // Action buttons
    document.getElementById('refreshLogs').addEventListener('click', loadLogs);
    document.getElementById('exportLogs').addEventListener('click', exportLogs);
    document.getElementById('clearLogs').addEventListener('click', clearLogs);
    document.getElementById('refreshState').addEventListener('click', loadCurrentState);
  }

  // Auto-refresh every 5 seconds
  function startAutoRefresh() {
    setInterval(() => {
      loadLogs();
      loadCurrentState();
    }, 5000);
  }

  // Initialize on load
  init();
})();
