// PERFECTION - Debug Logger Utility
// Centralized logging that persists to chrome.storage for debug console

(function() {
  'use strict';

  const MAX_LOGS = 500;
  const LOG_KEYS = {
    auto: 'ats_auto_tailor_logs',
    debug: 'ats_debug_logs',
    error: 'ats_error_logs',
    sessions: 'ats_tailoring_sessions'
  };

  // Log levels
  const LEVELS = {
    debug: { priority: 0, color: '#6b7280' },
    info: { priority: 1, color: '#3b82f6' },
    success: { priority: 2, color: '#22c55e' },
    warn: { priority: 3, color: '#f59e0b' },
    error: { priority: 4, color: '#ef4444' }
  };

  // Create log entry
  function createLogEntry(level, event, message, data = null) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ts: Date.now(),
      level,
      event,
      message,
      data,
      url: typeof window !== 'undefined' ? window.location?.href : null,
      source: 'perfection'
    };
  }

  // Save log to storage
  async function saveLog(entry, storageKey = LOG_KEYS.debug) {
    return new Promise((resolve) => {
      chrome.storage.local.get([storageKey], (result) => {
        const logs = result[storageKey] || [];
        logs.unshift(entry);
        
        // Trim to max size
        const trimmedLogs = logs.slice(0, MAX_LOGS);
        
        chrome.storage.local.set({ [storageKey]: trimmedLogs }, () => {
          // Notify debug console of new log
          chrome.runtime.sendMessage({ 
            action: 'DEBUG_LOG_ADDED', 
            log: entry,
            storageKey 
          }).catch(() => {});
          resolve();
        });
      });
    });
  }

  // Main logger object
  const DebugLogger = {
    // Basic logging methods
    debug(event, message, data) {
      const entry = createLogEntry('debug', event, message, data);
      console.log(`[PERFECTION Debug] ${event}:`, message, data || '');
      saveLog(entry, LOG_KEYS.debug);
      return entry;
    },

    info(event, message, data) {
      const entry = createLogEntry('info', event, message, data);
      console.log(`[PERFECTION] ${event}:`, message, data || '');
      saveLog(entry, LOG_KEYS.debug);
      return entry;
    },

    success(event, message, data) {
      const entry = createLogEntry('success', event, message, data);
      console.log(`[PERFECTION ✅] ${event}:`, message, data || '');
      saveLog(entry, LOG_KEYS.auto);
      return entry;
    },

    warn(event, message, data) {
      const entry = createLogEntry('warn', event, message, data);
      console.warn(`[PERFECTION ⚠️] ${event}:`, message, data || '');
      saveLog(entry, LOG_KEYS.debug);
      return entry;
    },

    error(event, message, data) {
      const entry = createLogEntry('error', event, message, data);
      console.error(`[PERFECTION ❌] ${event}:`, message, data || '');
      saveLog(entry, LOG_KEYS.error);
      return entry;
    },

    // Specialized logging for common events
    autoTailor(event, message, data) {
      const entry = createLogEntry('info', `autotailor_${event}`, message, data);
      console.log(`[PERFECTION AutoTailor] ${event}:`, message, data || '');
      saveLog(entry, LOG_KEYS.auto);
      return entry;
    },

    // Log fetch/API calls
    fetch(label, status, durationMs, data) {
      const level = status >= 400 ? 'error' : 'info';
      const event = status >= 400 ? 'fetch_error' : 'fetch_end';
      const entry = createLogEntry(level, event, `${label}: ${status}`, {
        label,
        status,
        durationMs,
        ...data
      });
      entry.durationMs = durationMs;
      console.log(`[PERFECTION Fetch] ${label}:`, status, `${durationMs}ms`);
      saveLog(entry, status >= 400 ? LOG_KEYS.error : LOG_KEYS.debug);
      return entry;
    },

    fetchStart(label) {
      const entry = createLogEntry('debug', 'fetch_start', `Starting: ${label}`, { label });
      console.log(`[PERFECTION Fetch] Starting:`, label);
      saveLog(entry, LOG_KEYS.debug);
      return { startTime: Date.now(), label };
    },

    fetchEnd(tracker, status, data) {
      const durationMs = Date.now() - tracker.startTime;
      return this.fetch(tracker.label, status, durationMs, data);
    },

    // Log job detection
    jobDetected(title, company, location, url) {
      const entry = createLogEntry('info', 'job_detected', `${title} at ${company}`, {
        title,
        company,
        location,
        url
      });
      entry.title = title;
      entry.company = company;
      console.log(`[PERFECTION Job] Detected:`, title, 'at', company);
      saveLog(entry, LOG_KEYS.auto);
      return entry;
    },

    // Log tailoring results
    tailorSuccess(matchScore, durationMs, data) {
      const entry = createLogEntry('success', 'tailor_success', `Match: ${matchScore}%`, {
        matchScore,
        durationMs,
        ...data
      });
      entry.matchScore = matchScore;
      entry.durationMs = durationMs;
      console.log(`[PERFECTION Tailor] ✅ Success! Match: ${matchScore}%`);
      saveLog(entry, LOG_KEYS.auto);
      return entry;
    },

    tailorError(error, data) {
      const entry = createLogEntry('error', 'tailor_error', error, data);
      console.error(`[PERFECTION Tailor] ❌ Error:`, error);
      saveLog(entry, LOG_KEYS.error);
      return entry;
    },

    // Log file attachment
    attachComplete(filesAttached, data) {
      const entry = createLogEntry('success', 'attach_complete', `${filesAttached} files attached`, {
        filesAttached,
        ...data
      });
      console.log(`[PERFECTION Attach] ✅ ${filesAttached} files attached`);
      saveLog(entry, LOG_KEYS.auto);
      return entry;
    },

    attachError(error, data) {
      const entry = createLogEntry('error', 'attach_error', error, data);
      console.error(`[PERFECTION Attach] ❌ Error:`, error);
      saveLog(entry, LOG_KEYS.error);
      return entry;
    },

    // Log stage transitions
    stage(stageName, data) {
      const entry = createLogEntry('info', 'stage', stageName, data);
      entry.stage = stageName;
      console.log(`[PERFECTION Stage]`, stageName);
      saveLog(entry, LOG_KEYS.auto);
      return entry;
    },

    // Log cache events
    cacheHit(key, data) {
      const entry = createLogEntry('debug', 'cache_hit', `Using cached: ${key}`, { key, ...data });
      console.log(`[PERFECTION Cache] Hit:`, key);
      saveLog(entry, LOG_KEYS.debug);
      return entry;
    },

    cacheMiss(key) {
      const entry = createLogEntry('debug', 'cache_miss', `Not cached: ${key}`, { key });
      console.log(`[PERFECTION Cache] Miss:`, key);
      saveLog(entry, LOG_KEYS.debug);
      return entry;
    },

    // Log PDF generation
    pdfGenerated(type, sizeBytes, durationMs) {
      const entry = createLogEntry('success', 'pdf_generated', `${type} PDF: ${Math.round(sizeBytes / 1024)}KB`, {
        type,
        sizeBytes,
        durationMs
      });
      entry.durationMs = durationMs;
      console.log(`[PERFECTION PDF] Generated ${type}:`, `${Math.round(sizeBytes / 1024)}KB`, `${durationMs}ms`);
      saveLog(entry, LOG_KEYS.auto);
      return entry;
    },

    // Log keyword extraction
    keywordsExtracted(count, keywords, durationMs) {
      const entry = createLogEntry('info', 'keywords_extracted', `${count} keywords extracted`, {
        count,
        keywords: keywords.slice(0, 15),
        durationMs
      });
      entry.durationMs = durationMs;
      console.log(`[PERFECTION Keywords] Extracted ${count}:`, keywords.slice(0, 5));
      saveLog(entry, LOG_KEYS.auto);
      return entry;
    },

    // Record a tailoring session (for timeline)
    recordSession(sessionData) {
      return new Promise((resolve) => {
        chrome.storage.local.get([LOG_KEYS.sessions], (result) => {
          const sessions = result[LOG_KEYS.sessions] || [];
          sessions.unshift({
            ...sessionData,
            timestamp: new Date().toISOString()
          });
          
          // Keep last 50 sessions
          const trimmedSessions = sessions.slice(0, 50);
          
          chrome.storage.local.set({ [LOG_KEYS.sessions]: trimmedSessions }, resolve);
        });
      });
    },

    // Clear all logs
    clearAll() {
      return new Promise((resolve) => {
        chrome.storage.local.remove([
          LOG_KEYS.auto,
          LOG_KEYS.debug,
          LOG_KEYS.error,
          LOG_KEYS.sessions
        ], resolve);
      });
    },

    // Get all logs
    async getAll() {
      return new Promise((resolve) => {
        chrome.storage.local.get([
          LOG_KEYS.auto,
          LOG_KEYS.debug,
          LOG_KEYS.error,
          LOG_KEYS.sessions
        ], resolve);
      });
    }
  };

  // Expose globally
  window.DebugLogger = DebugLogger;

  // Initial log
  DebugLogger.info('extension_loaded', 'PERFECTION Debug Logger initialized', {
    url: window.location?.href,
    timestamp: new Date().toISOString()
  });

})();
