// city-dataset.js - Auto-generated from world-cities-raw.json
// ~200k cities compressed into a lightweight lookup map for ATS location matching
// Format: { "city_name_lowercase": "CC" } where CC = ISO-2 country code
// For duplicate city names, we prefer major countries (GB, US, IE, DE, etc.)

(function (global) {
  'use strict';

  // Priority order for resolving duplicate city names
  const COUNTRY_PRIORITY = [
    'US', 'GB', 'IE', 'CA', 'AU', 'NZ', 'DE', 'FR', 'NL', 'ES', 'IT', 'PT',
    'CH', 'SE', 'NO', 'DK', 'FI', 'BE', 'AT', 'PL', 'CZ', 'IN', 'SG', 'AE',
    'IL', 'JP', 'KR', 'TW', 'PH', 'MY', 'ID', 'TH', 'CN', 'MX', 'BR', 'AR',
    'CL', 'CO', 'PE', 'ZA', 'EG', 'KE', 'NG', 'TZ', 'TR', 'RU', 'UA', 'HK'
  ];

  const priorityIndex = new Map(COUNTRY_PRIORITY.map((c, i) => [c, i]));

  function getPriority(cc) {
    return priorityIndex.has(cc) ? priorityIndex.get(cc) : 999;
  }

  // Build compact city map at runtime from raw JSON (loaded separately)
  let CITY_MAP = null;
  let isLoaded = false;

  function buildCityMap(rawData) {
    const map = new Map();

    for (const row of rawData) {
      const name = (row.name || '').toString().trim();
      const cc = (row.country || '').toString().trim().toUpperCase();
      if (!name || !cc) continue;

      const key = name.toLowerCase();

      // If duplicate, prefer higher-priority country
      if (map.has(key)) {
        const existing = map.get(key);
        if (getPriority(cc) < getPriority(existing)) {
          map.set(key, cc);
        }
      } else {
        map.set(key, cc);
      }
    }

    return map;
  }

  // Async loader (fetches JSON, builds map, registers with ATSLocationDB)
  async function loadCityDataset() {
    if (isLoaded) return CITY_MAP;

    try {
      // Try to load from extension context
      const url = chrome?.runtime?.getURL
        ? chrome.runtime.getURL('world-cities-raw.json')
        : './world-cities-raw.json';

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const rawData = await resp.json();
      CITY_MAP = buildCityMap(rawData);
      isLoaded = true;

      console.log(`[CityDataset] Loaded ${CITY_MAP.size} unique cities`);

      // Register with ATSLocationDB if available
      if (global.ATSLocationDB?.setCityDataset) {
        const rows = [];
        for (const [name, cc] of CITY_MAP) {
          rows.push({ name, countryCode: cc });
        }
        global.ATSLocationDB.setCityDataset(rows);
        console.log('[CityDataset] Registered with ATSLocationDB');
      }

      return CITY_MAP;
    } catch (err) {
      console.warn('[CityDataset] Failed to load:', err.message);
      return null;
    }
  }

  // Sync lookup (returns null if not yet loaded)
  function lookupCity(cityName) {
    if (!CITY_MAP) return null;
    const key = (cityName || '').toString().trim().toLowerCase();
    return CITY_MAP.get(key) || null;
  }

  // Expose globally
  global.ATSCityDataset = {
    load: loadCityDataset,
    lookup: lookupCity,
    isLoaded: () => isLoaded,
    getMap: () => CITY_MAP,
  };

  // Auto-load when script runs (non-blocking)
  if (typeof window !== 'undefined') {
    loadCityDataset().catch(() => {});
  }
})(typeof window !== 'undefined' ? window : globalThis);
