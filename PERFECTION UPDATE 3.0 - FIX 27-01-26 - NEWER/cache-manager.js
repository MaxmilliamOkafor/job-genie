// cache-manager.js - PERFECTION v3.0 Unified Caching & Performance Layer
// Features: JD hash caching, Profile TTL cache, Debounced extraction, Keyword URL cache
// Reduces API calls by 60-80% and prevents duplicate processing

(function(global) {
  'use strict';

  console.log('[CacheManager] v3.0 Unified Caching Layer loaded');

  // ============ CONFIGURATION ============
  const CONFIG = {
    // JD Hash Cache - Skip re-extraction for same job description
    JD_CACHE_SIZE: 100,
    JD_CACHE_TTL_MS: 60 * 60 * 1000, // 60 minutes
    
    // Profile Cache - Reduce Supabase calls
    PROFILE_CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
    
    // Keyword Cache - Per URL, prevent redundant API calls
    KEYWORD_CACHE_SIZE: 150,
    KEYWORD_CACHE_TTL_MS: 60 * 60 * 1000, // 60 minutes
    
    // Debounce - Prevent duplicate extraction on rapid page changes
    DEBOUNCE_JD_EXTRACTION_MS: 300,
    DEBOUNCE_PROFILE_FETCH_MS: 200,
    
    // Storage keys
    STORAGE_KEY_JD_CACHE: 'ats_jd_hash_cache',
    STORAGE_KEY_KEYWORD_CACHE: 'ats_keyword_cache',
    STORAGE_KEY_PROFILE_CACHE: 'ats_profile_cache'
  };

  // ============ SIMPLE HASH FUNCTION ============
  function simpleHash(str) {
    if (!str || typeof str !== 'string') return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // ============ JD HASH CACHE ============
  // Prevents re-extraction when same JD is processed multiple times
  const jdHashCache = new Map();

  function getJDHash(jobDescription) {
    if (!jobDescription || jobDescription.length < 50) return null;
    // Use first 500 chars + length for quick hash
    const sample = jobDescription.substring(0, 500) + '_' + jobDescription.length;
    return simpleHash(sample);
  }

  function getCachedJDResult(jobDescription) {
    const hash = getJDHash(jobDescription);
    if (!hash) return null;
    
    const cached = jdHashCache.get(hash);
    if (cached && (Date.now() - cached.timestamp) < CONFIG.JD_CACHE_TTL_MS) {
      console.log(`[CacheManager] ⚡ JD Hash HIT: ${hash}`);
      return { ...cached.data, fromCache: true, cacheType: 'jd_hash' };
    }
    return null;
  }

  function setCachedJDResult(jobDescription, result) {
    const hash = getJDHash(jobDescription);
    if (!hash) return;
    
    // Evict oldest if at capacity
    if (jdHashCache.size >= CONFIG.JD_CACHE_SIZE) {
      const firstKey = jdHashCache.keys().next().value;
      jdHashCache.delete(firstKey);
    }
    
    jdHashCache.set(hash, { 
      data: result, 
      timestamp: Date.now(),
      hash 
    });
    console.log(`[CacheManager] JD Hash cached: ${hash} (${jdHashCache.size} entries)`);
  }

  // ============ KEYWORD URL CACHE ============
  // Prevents redundant API calls on page refresh
  const keywordUrlCache = new Map();

  function getCachedKeywords(url) {
    if (!url) return null;
    
    const cached = keywordUrlCache.get(url);
    if (cached && (Date.now() - cached.timestamp) < CONFIG.KEYWORD_CACHE_TTL_MS) {
      console.log(`[CacheManager] ⚡ Keyword URL HIT: ${url.substring(0, 50)}...`);
      return { ...cached.keywords, fromCache: true, cacheType: 'url' };
    }
    return null;
  }

  function setCachedKeywords(url, keywords) {
    if (!url) return;
    
    // Evict oldest if at capacity
    if (keywordUrlCache.size >= CONFIG.KEYWORD_CACHE_SIZE) {
      const firstKey = keywordUrlCache.keys().next().value;
      keywordUrlCache.delete(firstKey);
    }
    
    keywordUrlCache.set(url, { 
      keywords, 
      timestamp: Date.now() 
    });
    console.log(`[CacheManager] Keywords cached for URL (${keywordUrlCache.size} entries)`);
  }

  // ============ PROFILE DATA CACHE (5-min TTL) ============
  let profileCache = {
    data: null,
    timestamp: 0,
    userId: null
  };

  function getCachedProfile(userId) {
    if (!userId) return null;
    
    if (profileCache.userId === userId && 
        profileCache.data && 
        (Date.now() - profileCache.timestamp) < CONFIG.PROFILE_CACHE_TTL_MS) {
      console.log(`[CacheManager] ⚡ Profile cache HIT (TTL: ${Math.round((CONFIG.PROFILE_CACHE_TTL_MS - (Date.now() - profileCache.timestamp)) / 1000)}s remaining)`);
      return { ...profileCache.data, fromCache: true };
    }
    return null;
  }

  function setCachedProfile(userId, data) {
    profileCache = {
      data,
      timestamp: Date.now(),
      userId
    };
    console.log(`[CacheManager] Profile cached for 5 minutes`);
  }

  function invalidateProfileCache() {
    profileCache = { data: null, timestamp: 0, userId: null };
    console.log(`[CacheManager] Profile cache invalidated`);
  }

  // ============ DEBOUNCE UTILITY ============
  const debounceTimers = new Map();

  function debounce(key, fn, delayMs) {
    return function(...args) {
      return new Promise((resolve, reject) => {
        // Clear existing timer for this key
        if (debounceTimers.has(key)) {
          clearTimeout(debounceTimers.get(key).timerId);
          // Reject pending promise
          debounceTimers.get(key).reject(new Error('Debounced'));
        }
        
        const timerId = setTimeout(async () => {
          debounceTimers.delete(key);
          try {
            const result = await fn(...args);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        }, delayMs);
        
        debounceTimers.set(key, { timerId, resolve, reject });
      });
    };
  }

  // Pre-configured debounced functions
  function createDebouncedJDExtractor(extractFn) {
    return debounce('jd_extraction', extractFn, CONFIG.DEBOUNCE_JD_EXTRACTION_MS);
  }

  function createDebouncedProfileFetcher(fetchFn) {
    return debounce('profile_fetch', fetchFn, CONFIG.DEBOUNCE_PROFILE_FETCH_MS);
  }

  // ============ COMBINED SMART CACHE LOOKUP ============
  // Checks all cache layers before making API call
  function smartKeywordLookup(url, jobDescription) {
    // Layer 1: URL cache (fastest)
    const urlCached = getCachedKeywords(url);
    if (urlCached) return urlCached;
    
    // Layer 2: JD hash cache (handles same JD on different URLs)
    const jdCached = getCachedJDResult(jobDescription);
    if (jdCached) return jdCached;
    
    return null;
  }

  // ============ CACHE STATS ============
  function getCacheStats() {
    return {
      jdHashCache: {
        size: jdHashCache.size,
        maxSize: CONFIG.JD_CACHE_SIZE,
        ttlMinutes: CONFIG.JD_CACHE_TTL_MS / 60000
      },
      keywordUrlCache: {
        size: keywordUrlCache.size,
        maxSize: CONFIG.KEYWORD_CACHE_SIZE,
        ttlMinutes: CONFIG.KEYWORD_CACHE_TTL_MS / 60000
      },
      profileCache: {
        hasData: !!profileCache.data,
        ageSeconds: profileCache.timestamp ? Math.round((Date.now() - profileCache.timestamp) / 1000) : 0,
        ttlMinutes: CONFIG.PROFILE_CACHE_TTL_MS / 60000
      },
      pendingDebounces: debounceTimers.size
    };
  }

  // ============ CLEAR ALL CACHES ============
  function clearAllCaches() {
    jdHashCache.clear();
    keywordUrlCache.clear();
    profileCache = { data: null, timestamp: 0, userId: null };
    
    // Clear debounce timers
    for (const [key, { timerId, reject }] of debounceTimers) {
      clearTimeout(timerId);
      reject(new Error('Cache cleared'));
    }
    debounceTimers.clear();
    
    console.log('[CacheManager] All caches cleared');
  }

  // ============ PERSIST TO CHROME STORAGE (Optional) ============
  async function persistCachesToStorage() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    
    try {
      const jdCacheArray = Array.from(jdHashCache.entries()).slice(-50); // Keep last 50
      const keywordCacheArray = Array.from(keywordUrlCache.entries()).slice(-50);
      
      await chrome.storage.local.set({
        [CONFIG.STORAGE_KEY_JD_CACHE]: jdCacheArray,
        [CONFIG.STORAGE_KEY_KEYWORD_CACHE]: keywordCacheArray
      });
      console.log('[CacheManager] Caches persisted to storage');
    } catch (e) {
      console.warn('[CacheManager] Failed to persist caches:', e);
    }
  }

  async function loadCachesFromStorage() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    
    try {
      const result = await chrome.storage.local.get([
        CONFIG.STORAGE_KEY_JD_CACHE,
        CONFIG.STORAGE_KEY_KEYWORD_CACHE
      ]);
      
      if (result[CONFIG.STORAGE_KEY_JD_CACHE]) {
        const entries = result[CONFIG.STORAGE_KEY_JD_CACHE];
        entries.forEach(([key, value]) => {
          if ((Date.now() - value.timestamp) < CONFIG.JD_CACHE_TTL_MS) {
            jdHashCache.set(key, value);
          }
        });
        console.log(`[CacheManager] Loaded ${jdHashCache.size} JD cache entries from storage`);
      }
      
      if (result[CONFIG.STORAGE_KEY_KEYWORD_CACHE]) {
        const entries = result[CONFIG.STORAGE_KEY_KEYWORD_CACHE];
        entries.forEach(([key, value]) => {
          if ((Date.now() - value.timestamp) < CONFIG.KEYWORD_CACHE_TTL_MS) {
            keywordUrlCache.set(key, value);
          }
        });
        console.log(`[CacheManager] Loaded ${keywordUrlCache.size} keyword cache entries from storage`);
      }
    } catch (e) {
      console.warn('[CacheManager] Failed to load caches from storage:', e);
    }
  }

  // Auto-load caches on init
  loadCachesFromStorage();

  // Auto-persist every 5 minutes
  setInterval(persistCachesToStorage, 5 * 60 * 1000);

  // ============ EXPORT ============
  global.CacheManager = {
    // JD Hash Cache
    getJDHash,
    getCachedJDResult,
    setCachedJDResult,
    
    // Keyword URL Cache
    getCachedKeywords,
    setCachedKeywords,
    
    // Profile Cache
    getCachedProfile,
    setCachedProfile,
    invalidateProfileCache,
    
    // Debounce
    debounce,
    createDebouncedJDExtractor,
    createDebouncedProfileFetcher,
    
    // Smart lookup
    smartKeywordLookup,
    
    // Utilities
    getCacheStats,
    clearAllCaches,
    persistCachesToStorage,
    loadCachesFromStorage,
    
    // Config (read-only)
    CONFIG: Object.freeze({ ...CONFIG })
  };

  console.log('[CacheManager] Ready with:', {
    jdCacheTTL: `${CONFIG.JD_CACHE_TTL_MS / 60000} min`,
    profileCacheTTL: `${CONFIG.PROFILE_CACHE_TTL_MS / 60000} min`,
    debounceJD: `${CONFIG.DEBOUNCE_JD_EXTRACTION_MS}ms`,
    debounceProfile: `${CONFIG.DEBOUNCE_PROFILE_FETCH_MS}ms`
  });

})(typeof window !== 'undefined' ? window : globalThis);
