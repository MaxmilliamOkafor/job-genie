// location-db.js - Lightweight Location Knowledge Base (countries + capitals + aliases)
// Goal: make it possible to ALWAYS output "City, Country" even when input is partial.
// v7.0: Enhanced with relocation stripping and comprehensive alias coverage.
// Note: City-level global coverage extended via world-cities-raw.json (199k+ cities).

(function (global) {
  'use strict';

  /**
   * Country data shape:
   * - iso2: two-letter code (preferred for ATS/Jobscan consistency)
   * - name: canonical country name
   * - capital: best default city when only a country is known
   * - aliases: common spellings / variations / demonyms
   */
  const COUNTRIES = [
    { iso2: 'US', name: 'United States', capital: 'Washington', aliases: ['USA', 'U.S.', 'U.S.A.', 'America', 'United States of America'] },
    { iso2: 'GB', name: 'United Kingdom', capital: 'London', aliases: ['UK', 'U.K.', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'] },
    { iso2: 'IE', name: 'Ireland', capital: 'Dublin', aliases: ['Éire', 'Eire', 'Republic of Ireland'] },
    { iso2: 'CA', name: 'Canada', capital: 'Ottawa', aliases: [] },
    { iso2: 'AU', name: 'Australia', capital: 'Canberra', aliases: [] },
    { iso2: 'NZ', name: 'New Zealand', capital: 'Wellington', aliases: ['Aotearoa'] },
    { iso2: 'FR', name: 'France', capital: 'Paris', aliases: [] },
    { iso2: 'DE', name: 'Germany', capital: 'Berlin', aliases: ['Deutschland'] },
    { iso2: 'NL', name: 'Netherlands', capital: 'Amsterdam', aliases: ['Holland'] },
    { iso2: 'ES', name: 'Spain', capital: 'Madrid', aliases: ['España', 'Espana'] },
    { iso2: 'PT', name: 'Portugal', capital: 'Lisbon', aliases: [] },
    { iso2: 'IT', name: 'Italy', capital: 'Rome', aliases: ['Italia'] },
    { iso2: 'CH', name: 'Switzerland', capital: 'Bern', aliases: ['Schweiz', 'Suisse', 'Svizzera'] },
    { iso2: 'SE', name: 'Sweden', capital: 'Stockholm', aliases: ['Sverige'] },
    { iso2: 'NO', name: 'Norway', capital: 'Oslo', aliases: ['Norge', 'Noreg'] },
    { iso2: 'DK', name: 'Denmark', capital: 'Copenhagen', aliases: ['Danmark'] },
    { iso2: 'FI', name: 'Finland', capital: 'Helsinki', aliases: ['Suomi'] },
    { iso2: 'BE', name: 'Belgium', capital: 'Brussels', aliases: ['België', 'Belgique'] },
    { iso2: 'AT', name: 'Austria', capital: 'Vienna', aliases: ['Österreich', 'Osterreich'] },
    { iso2: 'PL', name: 'Poland', capital: 'Warsaw', aliases: ['Polska'] },
    { iso2: 'CZ', name: 'Czech Republic', capital: 'Prague', aliases: ['Czechia'] },
    { iso2: 'IN', name: 'India', capital: 'New Delhi', aliases: ['Bharat'] },
    { iso2: 'SG', name: 'Singapore', capital: 'Singapore', aliases: [] },
    { iso2: 'AE', name: 'United Arab Emirates', capital: 'Abu Dhabi', aliases: ['UAE'] },
    { iso2: 'IL', name: 'Israel', capital: 'Jerusalem', aliases: [] },
    { iso2: 'JP', name: 'Japan', capital: 'Tokyo', aliases: ['Nippon', 'Nihon'] },
    { iso2: 'KR', name: 'South Korea', capital: 'Seoul', aliases: ['Korea', 'Republic of Korea'] },
    { iso2: 'TW', name: 'Taiwan', capital: 'Taipei', aliases: ['Republic of China'] },
    { iso2: 'PH', name: 'Philippines', capital: 'Manila', aliases: ['Philippines (the)'] },
    { iso2: 'MY', name: 'Malaysia', capital: 'Kuala Lumpur', aliases: [] },
    { iso2: 'ID', name: 'Indonesia', capital: 'Jakarta', aliases: [] },
    { iso2: 'TH', name: 'Thailand', capital: 'Bangkok', aliases: [] },
    { iso2: 'CN', name: 'China', capital: 'Beijing', aliases: ['PRC', 'People\'s Republic of China'] },
    { iso2: 'MX', name: 'Mexico', capital: 'Mexico City', aliases: [] },
    { iso2: 'BR', name: 'Brazil', capital: 'Brasília', aliases: ['Brasil', 'Brasilia'] },
    { iso2: 'AR', name: 'Argentina', capital: 'Buenos Aires', aliases: [] },
    { iso2: 'CL', name: 'Chile', capital: 'Santiago', aliases: [] },
    { iso2: 'CO', name: 'Colombia', capital: 'Bogotá', aliases: ['Bogota'] },
    { iso2: 'PE', name: 'Peru', capital: 'Lima', aliases: [] },
    { iso2: 'ZA', name: 'South Africa', capital: 'Pretoria', aliases: [] },
    { iso2: 'EG', name: 'Egypt', capital: 'Cairo', aliases: [] },
    { iso2: 'KE', name: 'Kenya', capital: 'Nairobi', aliases: [] },
    { iso2: 'NG', name: 'Nigeria', capital: 'Abuja', aliases: [] },
    { iso2: 'TZ', name: 'Tanzania', capital: 'Dodoma', aliases: ['United Republic of Tanzania'] },
    { iso2: 'TR', name: 'Turkey', capital: 'Ankara', aliases: ['Türkiye', 'Turkiye'] },
  ];

  const COUNTRY_INDEX = new Map();

  function normalizeKey(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[\u2019']/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildIndex() {
    for (const c of COUNTRIES) {
      const keys = new Set([c.iso2, c.name, ...(c.aliases || [])].map(normalizeKey));
      for (const k of keys) {
        if (k) COUNTRY_INDEX.set(k, c);
      }
    }
  }
  buildIndex();

  // Small, safe Levenshtein with early-exit cutoff.
  function levenshtein(a, b, maxDistance) {
    if (a === b) return 0;
    if (!a || !b) return (a || b).length;
    if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

    const v0 = new Array(b.length + 1);
    const v1 = new Array(b.length + 1);

    for (let i = 0; i < v0.length; i++) v0[i] = i;

    for (let i = 0; i < a.length; i++) {
      v1[0] = i + 1;
      let minInRow = v1[0];

      for (let j = 0; j < b.length; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        if (v1[j + 1] < minInRow) minInRow = v1[j + 1];
      }

      if (minInRow > maxDistance) return maxDistance + 1;
      for (let j = 0; j < v0.length; j++) v0[j] = v1[j];
    }

    return v1[b.length];
  }

  function findCountry(input) {
    const key = normalizeKey(input);
    if (!key) return null;

    // Direct match (fast)
    const direct = COUNTRY_INDEX.get(key);
    if (direct) return direct;

    // Fuzzy match with conservative cutoff
    let best = null;
    let bestDist = Infinity;

    // For short keys, keep cutoff tight to avoid false positives
    const cutoff = key.length <= 5 ? 1 : key.length <= 10 ? 2 : 3;

    for (const [k, c] of COUNTRY_INDEX) {
      // only compare similar-length candidates
      if (Math.abs(k.length - key.length) > 4) continue;
      const d = levenshtein(key, k, cutoff);
      if (d <= cutoff && d < bestDist) {
        best = c;
        bestDist = d;
        if (d === 0) break;
      }
    }

    return best;
  }

  function toISO2(input) {
    const c = findCountry(input);
    return c?.iso2 || null;
  }

  function capitalFor(input) {
    const c = findCountry(input);
    return c?.capital || null;
  }

  // Optional: later we can inject a large city dataset.
  // Expected row format: { name: 'Watford', countryCode: 'GB', altNames?: string[] }
  let CITY_ROWS = [];
  let CITY_INDEX = new Map();

  function setCityDataset(rows) {
    CITY_ROWS = Array.isArray(rows) ? rows : [];
    CITY_INDEX = new Map();

    for (const r of CITY_ROWS) {
      const name = (r?.name || '').toString().trim();
      const cc = (r?.countryCode || r?.country_code || r?.country || '').toString().trim().toUpperCase();
      if (!name || !cc) continue;

      const keys = [name, ...(r.altNames || [])].map(normalizeKey);
      for (const k of keys) {
        if (!k) continue;
        if (!CITY_INDEX.has(k)) CITY_INDEX.set(k, { name, countryCode: cc });
      }
    }
  }

  function findCity(input) {
    const key = normalizeKey(input);
    if (!key) return null;

    const direct = CITY_INDEX.get(key);
    if (direct) return direct;

    // Very conservative fuzzy matching for cities to avoid bad pairings.
    // Only run if dataset is present.
    if (CITY_INDEX.size === 0) return null;

    let best = null;
    let bestDist = Infinity;
    const cutoff = key.length <= 6 ? 1 : key.length <= 12 ? 2 : 3;

    for (const [k, v] of CITY_INDEX) {
      if (Math.abs(k.length - key.length) > 3) continue;
      const d = levenshtein(key, k, cutoff);
      if (d <= cutoff && d < bestDist) {
        best = v;
        bestDist = d;
        if (d === 0) break;
      }
    }

    return best;
  }

  global.ATSLocationDB = {
    normalizeKey,
    findCountry,
    toISO2,
    capitalFor,
    setCityDataset,
    findCity,
    _COUNTRIES: COUNTRIES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
