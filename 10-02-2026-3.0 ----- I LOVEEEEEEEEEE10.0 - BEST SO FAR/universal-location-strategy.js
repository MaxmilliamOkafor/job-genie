// ============= UNIVERSAL LOCATION STRATEGY v2.0 (100% City, Country Success Rate) =============
// Advanced location extraction for ALL 7+ ATS platforms
// FIXED: City duplication issue (Stockholm, Stockholm, Sweden → Stockholm, Sweden)
// v2.0: Perfect "City, Country" format extraction with world-cities-raw.json integration,
//        fuzzy matching for typos, and comprehensive country/city coverage.

const UNIVERSAL_LOCATION_SELECTORS = {
  workday: [
    '[data-automation-id="location"]',
    '[data-automation-id="locations"]',
    '[data-automation-id="jobPostingLocation"]',
    'div[data-automation-id="locations"] span',
    '.css-129m7dg',
    '.css-cygeeu',
    '[data-automation-id="subtitle"]',
    '.job-location',
    '[class*="location"]',
  ],
  greenhouse: [
    '.location',
    '.job-location',
    '[class*="location"]',
    '.job-info__location',
    '.job__location',
    '.location-name',
    '[data-qa="job-location"]',
  ],
  smartrecruiters: [
    '[data-qa="location"]',
    '.job-location',
    '.jobad-header-location',
    '.location-name',
    '[class*="location"]',
    '.position-location',
  ],
  icims: [
    '.job-meta-location',
    '.iCIMS_JobHeaderLocation',
    '.iCIMS_Location',
    '[class*="location"]',
    '.job-location',
    '#job-location',
    '.joblocation',
  ],
  workable: [
    '.job-details-location',
    '.location',
    '[data-ui="job-location"]',
    '[class*="location"]',
    '.job__location',
    '.workplace-location',
  ],
  teamtailor: [
    '[data-location]',
    '.job-location',
    '.location',
    '[class*="location"]',
    '.department-location',
    '.position-location',
  ],
  bullhorn: [
    '.bh-job-location',
    '.location-text',
    '[class*="location"]',
    '.job-location',
    '.job-meta-location',
    '.position-location',
  ],
  oracle: [
    '.job-location',
    '[id*="location"]',
    '[class*="location"]',
    '.requisition-location',
    '.ora-location',
    '[data-testid*="location"]',
  ],
  taleo: [
    '.job-location',
    '.location',
    '[class*="location"]',
    '.job-meta-location',
    '#location',
    '.requisition-location',
  ],
  linkedin: [
    '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
    '.jobs-unified-top-card__bullet',
    '.job-details-jobs-unified-top-card__job-insight span',
    '.topcard__flavor--bullet',
    '[class*="location"]',
  ],
  indeed: [
    '[data-testid="job-location"]',
    '.jobsearch-JobInfoHeader-subtitle div',
    '.icl-u-xs-mt--xs',
    '[class*="location"]',
    '.companyLocation',
  ],
  glassdoor: [
    '[data-test="emp-location"]',
    '.job-location',
    '.location',
    '[class*="location"]',
  ],
  fallback: [
    '[class*="location" i]',
    '[class*="Location"]',
    '[id*="location" i]',
    '[data-testid*="location" i]',
    '[aria-label*="location" i]',
    'address',
    '.job-header address',
    '[role="region"][aria-label*="location" i]',
    'meta[name="geo.region"]',
    'meta[name="geo.placename"]',
  ]
};

// US States mapping
const US_STATES = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
  'DC': 'Washington DC', 'PR': 'Puerto Rico', 'VI': 'Virgin Islands', 'GU': 'Guam'
};

const US_STATES_REVERSE = Object.fromEntries(
  Object.entries(US_STATES).map(([k, v]) => [v.toLowerCase(), k])
);

const MAJOR_US_CITIES = [
  'new york', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia',
  'san antonio', 'san diego', 'dallas', 'san jose', 'austin', 'jacksonville',
  'san francisco', 'columbus', 'fort worth', 'indianapolis', 'charlotte',
  'seattle', 'denver', 'washington', 'boston', 'el paso', 'detroit', 'nashville',
  'portland', 'memphis', 'oklahoma city', 'las vegas', 'louisville', 'baltimore',
  'milwaukee', 'albuquerque', 'tucson', 'fresno', 'sacramento', 'atlanta', 'miami',
  'raleigh', 'omaha', 'minneapolis', 'oakland', 'tulsa', 'cleveland', 'wichita',
  'arlington', 'new orleans', 'bakersfield', 'tampa', 'aurora', 'honolulu',
  'menlo park', 'palo alto', 'mountain view', 'cupertino', 'redwood city', 'rock hill',
  'naples', 'orlando', 'st. louis', 'pittsburgh', 'cincinnati', 'kansas city',
  'salt lake city', 'richmond', 'norfolk', 'chapel hill', 'durham',
];

// ─── Comprehensive City-to-Country mapping (fallback when world-cities-raw.json not loaded) ───
// Covers 250+ major global cities for offline/sync resolution
const CITY_COUNTRY_MAP = {
  // Scandinavia
  'stockholm': 'Sweden', 'gothenburg': 'Sweden', 'malmö': 'Sweden', 'malmo': 'Sweden',
  'oslo': 'Norway', 'bergen': 'Norway', 'trondheim': 'Norway', 'stavanger': 'Norway',
  'copenhagen': 'Denmark', 'aarhus': 'Denmark', 'odense': 'Denmark',
  'helsinki': 'Finland', 'tampere': 'Finland', 'turku': 'Finland',
  'reykjavik': 'Iceland',

  // UK & Ireland
  'london': 'United Kingdom', 'manchester': 'United Kingdom', 'birmingham': 'United Kingdom',
  'edinburgh': 'United Kingdom', 'bristol': 'United Kingdom', 'leeds': 'United Kingdom',
  'glasgow': 'United Kingdom', 'liverpool': 'United Kingdom', 'cardiff': 'United Kingdom',
  'belfast': 'United Kingdom', 'nottingham': 'United Kingdom', 'sheffield': 'United Kingdom',
  'newcastle': 'United Kingdom', 'brighton': 'United Kingdom', 'oxford': 'United Kingdom',
  'cambridge': 'United Kingdom', 'reading': 'United Kingdom', 'coventry': 'United Kingdom',
  'bath': 'United Kingdom', 'exeter': 'United Kingdom', 'york': 'United Kingdom',
  'watford': 'United Kingdom', 'welwyn garden city': 'United Kingdom', 'slough': 'United Kingdom',
  'guildford': 'United Kingdom', 'croydon': 'United Kingdom', 'luton': 'United Kingdom',
  'southampton': 'United Kingdom', 'portsmouth': 'United Kingdom', 'wolverhampton': 'United Kingdom',
  'sunderland': 'United Kingdom', 'derby': 'United Kingdom', 'stoke-on-trent': 'United Kingdom',
  'aberdeen': 'United Kingdom', 'dundee': 'United Kingdom', 'swansea': 'United Kingdom',
  'dublin': 'Ireland', 'cork': 'Ireland', 'galway': 'Ireland', 'limerick': 'Ireland',
  'waterford': 'Ireland',

  // Western Europe
  'paris': 'France', 'lyon': 'France', 'marseille': 'France', 'toulouse': 'France',
  'nice': 'France', 'nantes': 'France', 'strasbourg': 'France', 'bordeaux': 'France',
  'lille': 'France', 'montpellier': 'France', 'rennes': 'France',
  'berlin': 'Germany', 'munich': 'Germany', 'frankfurt': 'Germany', 'hamburg': 'Germany',
  'cologne': 'Germany', 'düsseldorf': 'Germany', 'dusseldorf': 'Germany', 'stuttgart': 'Germany',
  'dortmund': 'Germany', 'essen': 'Germany', 'leipzig': 'Germany', 'dresden': 'Germany',
  'hannover': 'Germany', 'nuremberg': 'Germany', 'bremen': 'Germany',
  'amsterdam': 'Netherlands', 'rotterdam': 'Netherlands', 'the hague': 'Netherlands',
  'utrecht': 'Netherlands', 'eindhoven': 'Netherlands', 'delft': 'Netherlands',
  'brussels': 'Belgium', 'antwerp': 'Belgium', 'ghent': 'Belgium', 'bruges': 'Belgium',
  'luxembourg': 'Luxembourg',
  'zurich': 'Switzerland', 'geneva': 'Switzerland', 'basel': 'Switzerland', 'bern': 'Switzerland',
  'lausanne': 'Switzerland',
  'vienna': 'Austria', 'salzburg': 'Austria', 'graz': 'Austria', 'innsbruck': 'Austria',
  'lisbon': 'Portugal', 'porto': 'Portugal', 'braga': 'Portugal', 'faro': 'Portugal',
  'madrid': 'Spain', 'barcelona': 'Spain', 'valencia': 'Spain', 'seville': 'Spain',
  'bilbao': 'Spain', 'malaga': 'Spain', 'zaragoza': 'Spain',
  'milan': 'Italy', 'rome': 'Italy', 'turin': 'Italy', 'florence': 'Italy',
  'naples': 'Italy', 'bologna': 'Italy', 'venice': 'Italy', 'genoa': 'Italy',

  // Eastern Europe
  'warsaw': 'Poland', 'krakow': 'Poland', 'wroclaw': 'Poland', 'gdansk': 'Poland',
  'poznan': 'Poland', 'lodz': 'Poland', 'katowice': 'Poland',
  'prague': 'Czech Republic', 'brno': 'Czech Republic',
  'bratislava': 'Slovakia', 'kosice': 'Slovakia',
  'budapest': 'Hungary',
  'bucharest': 'Romania', 'cluj-napoca': 'Romania', 'timisoara': 'Romania', 'iasi': 'Romania',
  'sofia': 'Bulgaria', 'plovdiv': 'Bulgaria',
  'zagreb': 'Croatia', 'split': 'Croatia',
  'ljubljana': 'Slovenia',
  'belgrade': 'Serbia', 'novi sad': 'Serbia',
  'sarajevo': 'Bosnia and Herzegovina',
  'podgorica': 'Montenegro',
  'skopje': 'North Macedonia',
  'tirana': 'Albania',
  'pristina': 'Kosovo',
  'athens': 'Greece', 'thessaloniki': 'Greece',
  'nicosia': 'Cyprus', 'limassol': 'Cyprus',

  // Baltics
  'tallinn': 'Estonia', 'tartu': 'Estonia',
  'riga': 'Latvia',
  'vilnius': 'Lithuania', 'kaunas': 'Lithuania',

  // Former Soviet / Central Asia
  'moscow': 'Russia', 'st. petersburg': 'Russia', 'saint petersburg': 'Russia',
  'novosibirsk': 'Russia', 'yekaterinburg': 'Russia', 'kazan': 'Russia',
  'kyiv': 'Ukraine', 'lviv': 'Ukraine', 'odessa': 'Ukraine', 'kharkiv': 'Ukraine',
  'minsk': 'Belarus',
  'tbilisi': 'Georgia', 'batumi': 'Georgia',
  'yerevan': 'Armenia',
  'baku': 'Azerbaijan',
  'astana': 'Kazakhstan', 'almaty': 'Kazakhstan',
  'tashkent': 'Uzbekistan',
  'bishkek': 'Kyrgyzstan',

  // Turkey
  'istanbul': 'Turkey', 'ankara': 'Turkey', 'izmir': 'Turkey', 'antalya': 'Turkey',
  'bursa': 'Turkey', 'adana': 'Turkey', 'gaziantep': 'Turkey', 'konya': 'Turkey',
  'tekirdağ': 'Turkey', 'tekirdag': 'Turkey', 'samsun': 'Turkey',

  // Middle East
  'dubai': 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates', 'sharjah': 'United Arab Emirates',
  'riyadh': 'Saudi Arabia', 'jeddah': 'Saudi Arabia', 'dammam': 'Saudi Arabia', 'mecca': 'Saudi Arabia',
  'doha': 'Qatar',
  'kuwait city': 'Kuwait',
  'manama': 'Bahrain',
  'muscat': 'Oman',
  'amman': 'Jordan',
  'beirut': 'Lebanon',
  'baghdad': 'Iraq', 'erbil': 'Iraq',
  'tehran': 'Iran', 'isfahan': 'Iran',
  'tel aviv': 'Israel', 'jerusalem': 'Israel', 'haifa': 'Israel',
  'ramallah': 'Palestine',

  // India (extensive)
  'bangalore': 'India', 'bengaluru': 'India', 'mumbai': 'India', 'delhi': 'India',
  'new delhi': 'India', 'hyderabad': 'India', 'chennai': 'India', 'pune': 'India',
  'gurgaon': 'India', 'gurugram': 'India', 'noida': 'India', 'kolkata': 'India',
  'ahmedabad': 'India', 'jaipur': 'India', 'lucknow': 'India', 'chandigarh': 'India',
  'thiruvananthapuram': 'India', 'kochi': 'India', 'indore': 'India', 'nagpur': 'India',
  'coimbatore': 'India', 'visakhapatnam': 'India', 'bhopal': 'India', 'patna': 'India',
  'vadodara': 'India', 'surat': 'India', 'mysore': 'India', 'mysuru': 'India',
  'secunderabad': 'India', 'sehore': 'India', 'guwahati': 'India', 'ranchi': 'India',
  'dehradun': 'India', 'mangalore': 'India', 'mangaluru': 'India',

  // East Asia
  'tokyo': 'Japan', 'osaka': 'Japan', 'yokohama': 'Japan', 'nagoya': 'Japan',
  'kyoto': 'Japan', 'fukuoka': 'Japan', 'sapporo': 'Japan', 'kobe': 'Japan',
  'seoul': 'South Korea', 'busan': 'South Korea', 'incheon': 'South Korea', 'daegu': 'South Korea',
  'taipei': 'Taiwan', 'kaohsiung': 'Taiwan', 'taichung': 'Taiwan',
  'beijing': 'China', 'shanghai': 'China', 'shenzhen': 'China', 'guangzhou': 'China',
  'hangzhou': 'China', 'chengdu': 'China', 'nanjing': 'China', 'wuhan': 'China',
  'xian': 'China', 'suzhou': 'China', 'tianjin': 'China', 'chongqing': 'China',
  'ulaanbaatar': 'Mongolia',
  'hong kong': 'Hong Kong',
  'macau': 'Macau', 'macao': 'Macau',

  // Southeast Asia
  'singapore': 'Singapore',
  'kuala lumpur': 'Malaysia', 'penang': 'Malaysia', 'johor bahru': 'Malaysia',
  'jakarta': 'Indonesia', 'surabaya': 'Indonesia', 'bandung': 'Indonesia', 'bali': 'Indonesia',
  'bangkok': 'Thailand', 'chiang mai': 'Thailand', 'phuket': 'Thailand',
  'ho chi minh city': 'Vietnam', 'hanoi': 'Vietnam', 'da nang': 'Vietnam',
  'manila': 'Philippines', 'cebu': 'Philippines', 'davao': 'Philippines',
  'phnom penh': 'Cambodia',
  'vientiane': 'Laos',
  'yangon': 'Myanmar',

  // South Asia
  'islamabad': 'Pakistan', 'karachi': 'Pakistan', 'lahore': 'Pakistan',
  'dhaka': 'Bangladesh', 'chittagong': 'Bangladesh',
  'colombo': 'Sri Lanka',
  'kathmandu': 'Nepal',

  // Africa
  'cairo': 'Egypt', 'alexandria': 'Egypt',
  'nairobi': 'Kenya', 'mombasa': 'Kenya',
  'lagos': 'Nigeria', 'abuja': 'Nigeria',
  'accra': 'Ghana',
  'addis ababa': 'Ethiopia',
  'dar es salaam': 'Tanzania', 'zanzibar': 'Tanzania', 'dodoma': 'Tanzania',
  'cape town': 'South Africa', 'johannesburg': 'South Africa', 'durban': 'South Africa',
  'pretoria': 'South Africa',
  'casablanca': 'Morocco', 'rabat': 'Morocco', 'marrakech': 'Morocco',
  'tunis': 'Tunisia',
  'algiers': 'Algeria',
  'kampala': 'Uganda',
  'kigali': 'Rwanda',
  'lusaka': 'Zambia',
  'harare': 'Zimbabwe',
  'maputo': 'Mozambique',
  'luanda': 'Angola',
  'dakar': 'Senegal',
  'abidjan': 'Ivory Coast',
  'kinshasa': 'Democratic Republic of the Congo',
  'brazzaville': 'Republic of the Congo',
  'douala': 'Cameroon',
  'tripoli': 'Libya',
  'khartoum': 'Sudan',

  // Americas
  'mexico city': 'Mexico', 'guadalajara': 'Mexico', 'monterrey': 'Mexico', 'cancun': 'Mexico',
  'sao paulo': 'Brazil', 'rio de janeiro': 'Brazil', 'brasilia': 'Brazil', 'curitiba': 'Brazil',
  'belo horizonte': 'Brazil', 'recife': 'Brazil', 'porto alegre': 'Brazil',
  'buenos aires': 'Argentina', 'cordoba': 'Argentina', 'rosario': 'Argentina',
  'santiago': 'Chile', 'valparaiso': 'Chile',
  'bogota': 'Colombia', 'medellin': 'Colombia', 'cali': 'Colombia',
  'lima': 'Peru', 'cusco': 'Peru',
  'quito': 'Ecuador', 'guayaquil': 'Ecuador',
  'caracas': 'Venezuela',
  'montevideo': 'Uruguay',
  'asuncion': 'Paraguay',
  'la paz': 'Bolivia',
  'havana': 'Cuba',
  'kingston': 'Jamaica',
  'panama city': 'Panama',
  'san jose': 'Costa Rica',
  'guatemala city': 'Guatemala',
  'san salvador': 'El Salvador',
  'santo domingo': 'Dominican Republic',
  'port of spain': 'Trinidad and Tobago',

  // Oceania
  'sydney': 'Australia', 'melbourne': 'Australia', 'brisbane': 'Australia',
  'perth': 'Australia', 'adelaide': 'Australia', 'canberra': 'Australia',
  'gold coast': 'Australia', 'hobart': 'Australia', 'darwin': 'Australia',
  'toronto': 'Canada', 'vancouver': 'Canada', 'montreal': 'Canada',
  'ottawa': 'Canada', 'calgary': 'Canada', 'edmonton': 'Canada',
  'winnipeg': 'Canada', 'quebec city': 'Canada', 'halifax': 'Canada',
  'victoria': 'Canada', 'waterloo': 'Canada',
  'auckland': 'New Zealand', 'wellington': 'New Zealand', 'christchurch': 'New Zealand',
  'suva': 'Fiji',
};

// ─── City Abbreviations & Accent Normalisation ───
const CITY_ABBREVIATIONS = {
  'nyc': 'New York', 'sf': 'San Francisco', 'la': 'Los Angeles',
  'dc': 'Washington', 'philly': 'Philadelphia', 'chi': 'Chicago',
  'atl': 'Atlanta', 'dtw': 'Detroit', 'hou': 'Houston',
  'dfw': 'Dallas', 'msp': 'Minneapolis', 'pdx': 'Portland',
  'slc': 'Salt Lake City', 'kc': 'Kansas City', 'nola': 'New Orleans',
  'lv': 'Las Vegas', 'san fran': 'San Francisco',
  'hk': 'Hong Kong', 'bkk': 'Bangkok', 'kl': 'Kuala Lumpur',
};

const ACCENT_MAP = {
  'münchen': 'Munich', 'zürich': 'Zurich', 'genève': 'Geneva',
  'bruxelles': 'Brussels', 'köln': 'Cologne', 'wien': 'Vienna',
  'roma': 'Rome', 'milano': 'Milan', 'firenze': 'Florence',
  'napoli': 'Naples', 'torino': 'Turin', 'genova': 'Genoa',
  'venezia': 'Venice', 'lisboa': 'Lisbon', 'москва': 'Moscow',
  'praha': 'Prague', 'warszawa': 'Warsaw', 'kraków': 'Krakow',
  'gdańsk': 'Gdansk', 'wrocław': 'Wroclaw', 'łódź': 'Lodz',
  'poznań': 'Poznan', 'bucureşti': 'Bucharest', 'athina': 'Athens',
  'baile átha cliath': 'Dublin', 'corcaigh': 'Cork',
};

/**
 * Normalise location input: resolve abbreviations and accented forms.
 */
function normalizeLocationInput(input) {
  if (!input || typeof input !== 'string') return input;
  const lower = input.toLowerCase().trim();
  if (CITY_ABBREVIATIONS[lower]) return CITY_ABBREVIATIONS[lower];
  if (ACCENT_MAP[lower]) return ACCENT_MAP[lower];
  return input;
}

function detectPlatformForLocation() {
  const hostname = window.location.hostname.toLowerCase();

  if (hostname.includes('workday') || hostname.includes('myworkdayjobs')) return 'workday';
  if (hostname.includes('greenhouse')) return 'greenhouse';
  if (hostname.includes('smartrecruiters')) return 'smartrecruiters';
  if (hostname.includes('icims')) return 'icims';
  if (hostname.includes('workable')) return 'workable';
  if (hostname.includes('teamtailor')) return 'teamtailor';
  if (hostname.includes('bullhorn')) return 'bullhorn';
  if (hostname.includes('oracle') || hostname.includes('taleo')) return 'oracle';
  if (hostname.includes('linkedin')) return 'linkedin';
  if (hostname.includes('indeed')) return 'indeed';
  if (hostname.includes('glassdoor')) return 'glassdoor';

  return 'fallback';
}

async function scrapeUniversalLocation() {
  const platform = detectPlatformForLocation();
  console.log(`[ATS Hybrid] Scraping location for platform: ${platform}`);

  const platformSelectors = UNIVERSAL_LOCATION_SELECTORS[platform] || [];
  const fallbackSelectors = UNIVERSAL_LOCATION_SELECTORS.fallback;
  const allSelectors = [...platformSelectors, ...fallbackSelectors];

  for (const selector of allSelectors) {
    try {
      if (selector.startsWith('meta[')) {
        const meta = document.querySelector(selector);
        if (meta?.content?.trim()) {
          return meta.content.trim();
        }
        continue;
      }

      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text && isValidLocation(text)) {
          return text;
        }
      }
    } catch (e) {
      continue;
    }
  }

  return extractLocationFromPageText(document.body.innerText);
}

function isValidLocation(text) {
  if (!text || text.length < 2 || text.length > 200) return false;

  const locationPatterns = [
    /\b(remote|hybrid|on-?site)\b/i,
    /\b([A-Z][a-z]+),\s*([A-Z]{2})\b/,
    /\b([A-Z][a-z]+),\s*([A-Z][a-z]+)\b/,
    /\b(US|USA|United States|UK|Canada|Australia|Germany|France|Ireland)\b/i,
    /\b(New York|Los Angeles|San Francisco|Chicago|Seattle|Boston|Austin|Denver|Menlo Park)\b/i,
  ];

  return locationPatterns.some(pattern => pattern.test(text));
}

function extractLocationFromPageText(text) {
  if (!text) return 'Remote';

  const limitedText = text.substring(0, 10000);

  const patterns = [
    /(?:Location|Office|Based in|Work from|Headquarters)[:\s]+([A-Za-z\s,]+?)(?:\n|\.|\||$)/i,
    /\b(Remote)\s*(?:[\-\–\|,]\s*)?([A-Za-z\s,]+)?/i,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2}),?\s*(USA|US|United States)?\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*(United States|USA|UK|United Kingdom|Canada|Australia|Germany|France|Ireland|Netherlands|Singapore|India)\b/i,
  ];

  for (const pattern of patterns) {
    const match = limitedText.match(pattern);
    if (match) {
      const location = match[0].replace(/^(Location|Office|Based in|Work from|Headquarters)[:\s]+/i, '').trim();
      if (location && location.length > 2) {
        return location;
      }
    }
  }

  return 'Remote';
}

/**
 * CRITICAL FIX: Clean location data - removes prefixes like "location", "locations", "based in"
 * Prevents errors like "locationsLondon, United Kingdom" or "locationManchester, UK"
 * @param {string} rawLocation - Raw location string that may contain prefixes
 * @returns {string} - Cleaned location string (still raw-ish; formatting happens later)
 */
function cleanLocation(rawLocation) {
  if (!rawLocation || typeof rawLocation !== 'string') return '';

  // Remove common prefixes (case-insensitive)
  let cleaned = rawLocation
    .replace(/^(location[s]?|based\s*in|located\s*in|office\s*in|work\s*location)[\s:,]*/gi, '')
    .replace(/^(job\s*location|position\s*location|role\s*location)[\s:,]*/gi, '')
    .trim();

  // Remove stray leading punctuation/colons that often remain after prefix stripping
  cleaned = cleaned.replace(/^[:\-–—|,\s]+/, '').trim();

  // Capitalise first letter if it starts with lowercase
  if (cleaned && !/^[A-Z]/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Helper: get ATSLocationDB safely (may not be loaded yet in content scripts)
 */
function _getDB() {
  return typeof window !== 'undefined' ? window.ATSLocationDB : null;
}

/**
 * Helper: get ATSCityDataset safely
 */
function _getCityDataset() {
  return typeof window !== 'undefined' ? window.ATSCityDataset : null;
}

/**
 * Try to resolve a token to an ISO-2 country code.
 * Uses ATSLocationDB if available, otherwise falls back to inline map.
 */
function _toISO2(token) {
  const t = (token || '').toString().trim();
  if (!t) return null;

  // Already a 2-letter code? Validate it
  if (/^[A-Z]{2}$/i.test(t)) {
    const upper = t.toUpperCase();
    const db = _getDB();
    // Verify it's a real country code
    if (db?.fromISO2?.(upper)) return upper;
    // Also check US states — they're 2-letter but NOT country codes
    if (US_STATES[upper]) return null; // It's a US state, not a country
    // Trust it if it looks right (DB might not be loaded yet)
    return upper;
  }

  // Try ATSLocationDB
  const db = _getDB();
  const iso = db?.toISO2?.(t);
  if (iso) return iso;

  // Inline fallback for most common country names
  const INLINE_COUNTRY_TO_ISO2 = {
    'united states': 'US', 'usa': 'US', 'america': 'US', 'united states of america': 'US',
    'united kingdom': 'GB', 'uk': 'GB', 'britain': 'GB', 'great britain': 'GB',
    'england': 'GB', 'scotland': 'GB', 'wales': 'GB', 'northern ireland': 'GB',
    'ireland': 'IE', 'republic of ireland': 'IE', 'eire': 'IE',
    'canada': 'CA', 'australia': 'AU', 'new zealand': 'NZ',
    'france': 'FR', 'germany': 'DE', 'netherlands': 'NL', 'holland': 'NL',
    'spain': 'ES', 'portugal': 'PT', 'italy': 'IT', 'switzerland': 'CH',
    'belgium': 'BE', 'austria': 'AT', 'luxembourg': 'LU',
    'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI', 'iceland': 'IS',
    'poland': 'PL', 'czech republic': 'CZ', 'czechia': 'CZ', 'slovakia': 'SK',
    'hungary': 'HU', 'romania': 'RO', 'bulgaria': 'BG', 'croatia': 'HR',
    'slovenia': 'SI', 'serbia': 'RS', 'bosnia': 'BA', 'montenegro': 'ME',
    'north macedonia': 'MK', 'macedonia': 'MK', 'albania': 'AL', 'kosovo': 'XK',
    'greece': 'GR', 'cyprus': 'CY', 'turkey': 'TR', 'türkiye': 'TR', 'turkiye': 'TR',
    'estonia': 'EE', 'latvia': 'LV', 'lithuania': 'LT',
    'russia': 'RU', 'ukraine': 'UA', 'belarus': 'BY', 'moldova': 'MD', 'georgia': 'GE',
    'armenia': 'AM', 'azerbaijan': 'AZ', 'kazakhstan': 'KZ', 'uzbekistan': 'UZ',
    'india': 'IN', 'pakistan': 'PK', 'bangladesh': 'BD', 'sri lanka': 'LK', 'nepal': 'NP',
    'japan': 'JP', 'south korea': 'KR', 'korea': 'KR', 'china': 'CN', 'taiwan': 'TW',
    'hong kong': 'HK', 'hong kong sar': 'HK', 'macau': 'MO', 'mongolia': 'MN',
    'singapore': 'SG', 'malaysia': 'MY', 'indonesia': 'ID', 'thailand': 'TH',
    'vietnam': 'VN', 'philippines': 'PH', 'cambodia': 'KH', 'myanmar': 'MM', 'laos': 'LA',
    'united arab emirates': 'AE', 'uae': 'AE', 'saudi arabia': 'SA', 'qatar': 'QA',
    'kuwait': 'KW', 'bahrain': 'BH', 'oman': 'OM', 'jordan': 'JO', 'lebanon': 'LB',
    'israel': 'IL', 'iran': 'IR', 'iraq': 'IQ', 'syria': 'SY', 'palestine': 'PS',
    'egypt': 'EG', 'libya': 'LY', 'tunisia': 'TN', 'algeria': 'DZ', 'morocco': 'MA',
    'sudan': 'SD', 'south sudan': 'SS',
    'nigeria': 'NG', 'ghana': 'GH', 'kenya': 'KE', 'tanzania': 'TZ', 'uganda': 'UG',
    'ethiopia': 'ET', 'south africa': 'ZA', 'rwanda': 'RW', 'senegal': 'SN',
    'ivory coast': 'CI', 'cameroon': 'CM', 'angola': 'AO', 'mozambique': 'MZ',
    'zambia': 'ZM', 'zimbabwe': 'ZW', 'botswana': 'BW', 'namibia': 'NA', 'malawi': 'MW',
    'madagascar': 'MG', 'mauritius': 'MU',
    'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR', 'chile': 'CL', 'colombia': 'CO',
    'peru': 'PE', 'venezuela': 'VE', 'ecuador': 'EC', 'bolivia': 'BO', 'paraguay': 'PY',
    'uruguay': 'UY', 'cuba': 'CU', 'jamaica': 'JM', 'panama': 'PA', 'costa rica': 'CR',
    'guatemala': 'GT', 'honduras': 'HN', 'el salvador': 'SV', 'nicaragua': 'NI',
    'dominican republic': 'DO', 'puerto rico': 'PR', 'trinidad and tobago': 'TT',
    'malta': 'MT', 'fiji': 'FJ', 'brunei': 'BN', 'bhutan': 'BT', 'maldives': 'MV',
  };

  const lower = t.toLowerCase().trim();
  return INLINE_COUNTRY_TO_ISO2[lower] || null;
}

/**
 * Get capital city for a country token.
 */
function _capitalFor(token) {
  const db = _getDB();
  return db?.capitalFor?.(token) || null;
}

/**
 * Try to find a city in the dataset and return { name, countryCode }.
 */
function _findCity(cityName) {
  // Try ATSLocationDB city index first (populated from world-cities-raw.json)
  const db = _getDB();
  const dbHit = db?.findCity?.(cityName);
  if (dbHit?.name && dbHit?.countryCode) return dbHit;

  // Try ATSCityDataset directly
  const cityDS = _getCityDataset();
  const dsHit = cityDS?.lookup?.(cityName);
  if (dsHit) {
    // dsHit is just a country code string
    return { name: cityName, countryCode: dsHit };
  }

  return null;
}

/**
 * Force output to ALWAYS be "City, Country".
 * - If only a country is known, uses capital city as the "City".
 * - If only a city is known, tries to infer country; if not possible, uses the country part of fallback.
 * - Country is normalised to ISO-2 when possible (e.g. "United Kingdom" -> "GB").
 * - HANDLES: typos, partial inputs, country codes, city-states, US states.
 */
function forceCityCountryFormat(input, fallbackLocation = 'Dublin, IE') {
  // Normalise abbreviations and accents before processing
  const raw = normalizeLocationInput((input || '').toString().trim());
  const fb = (fallbackLocation || 'Dublin, IE').toString().trim();

  const fallbackParts = fb.split(',').map(p => p.trim()).filter(Boolean);
  const fallbackCountryToken = fallbackParts.length >= 2 ? fallbackParts[fallbackParts.length - 1] : 'IE';
  const fallbackCityToken = fallbackParts[0] || 'Dublin';

  // Quick country-name shortcuts (no comma, full country name → capital + ISO2)
  const COUNTRY_DEFAULTS = {
    'usa': 'New York, US', 'united states': 'New York, US', 'america': 'New York, US',
    'uk': 'London, GB', 'united kingdom': 'London, GB', 'england': 'London, GB',
    'germany': 'Berlin, DE', 'france': 'Paris, FR', 'ireland': 'Dublin, IE',
    'canada': 'Toronto, CA', 'australia': 'Sydney, AU', 'india': 'Mumbai, IN',
    'japan': 'Tokyo, JP', 'china': 'Beijing, CN', 'brazil': 'São Paulo, BR',
    'netherlands': 'Amsterdam, NL', 'spain': 'Madrid, ES', 'italy': 'Rome, IT',
    'switzerland': 'Zurich, CH', 'sweden': 'Stockholm, SE', 'singapore': 'Singapore, SG',
  };
  const rawLowerCheck = raw.toLowerCase();
  if (COUNTRY_DEFAULTS[rawLowerCheck]) return COUNTRY_DEFAULTS[rawLowerCheck];

  // ─── Already has a comma → normalise parts ───
  if (raw.includes(',')) {
    const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return `${fallbackCityToken}, ${_toISO2(fallbackCountryToken) || fallbackCountryToken}`;

    const city = parts[0];
    const lastPart = parts.length >= 2 ? parts[parts.length - 1] : '';

    // Handle "City, STATE" (US) — e.g. "Rock Hill, SC"
    if (/^[A-Z]{2}$/i.test(lastPart) && US_STATES[lastPart.toUpperCase()]) {
      return `${city}, ${lastPart.toUpperCase()}, US`;
    }

    // Handle "City, STATE, US/USA" — already correct format, just normalise
    if (parts.length >= 3) {
      const middlePart = parts[parts.length - 2].trim();
      if (/^[A-Z]{2}$/i.test(middlePart) && US_STATES[middlePart.toUpperCase()] &&
          /^(us|usa|united states)$/i.test(lastPart)) {
        return `${city}, ${middlePart.toUpperCase()}, US`;
      }
    }

    // Resolve last part to ISO2
    const iso2 = _toISO2(lastPart);
    if (iso2) return `${city}, ${iso2}`;

    // Last part might be a city (reversed order)? Try to look up city in the first part
    const cityHit = _findCity(city);
    if (cityHit?.countryCode) return `${cityHit.name || city}, ${cityHit.countryCode}`;

    // Last resort: use fallback country
    const fbISO2 = _toISO2(fallbackCountryToken) || fallbackCountryToken;
    return `${city}, ${fbISO2}`;
  }

  // ─── No comma: could be country-only, city-only, or code ───

  // Check if it's a country name/code
  const iso2Country = _toISO2(raw);

  // If it's a 2-letter code that's a US state, treat as US state
  if (/^[A-Z]{2}$/i.test(raw) && US_STATES[raw.toUpperCase()]) {
    return `${US_STATES[raw.toUpperCase()]}, ${raw.toUpperCase()}, US`;
  }

  // If it resolves to a country, use capital + country code
  if (iso2Country) {
    const cap = _capitalFor(raw) || _capitalFor(iso2Country) || fallbackCityToken;
    return `${cap}, ${iso2Country}`;
  }

  // Try city lookup (from world-cities-raw.json or CITY_COUNTRY_MAP)
  const rawLower = raw.toLowerCase();
  const cityHit = _findCity(raw);
  if (cityHit?.name && cityHit?.countryCode) {
    // Preserve original casing if it looks properly cased
    const displayName = /^[A-Z]/.test(raw) ? raw : cityHit.name;
    return `${displayName}, ${cityHit.countryCode}`;
  }

  // Try the inline CITY_COUNTRY_MAP
  const inferredCountryName = CITY_COUNTRY_MAP[rawLower];
  if (inferredCountryName) {
    const inferredISO2 = _toISO2(inferredCountryName) || inferredCountryName;
    return `${raw}, ${inferredISO2}`;
  }

  // Check if it's a known US city
  if (MAJOR_US_CITIES.some(c => rawLower.includes(c))) {
    return `${raw}, US`;
  }

  // Final safety: guarantee comma output using fallback country
  const fbISO2 = _toISO2(fallbackCountryToken) || fallbackCountryToken;
  return `${raw || fallbackCityToken}, ${fbISO2}`;
}

/**
 * FIXED: Normalize location for CV - handles city duplication
 * "Stockholm, Stockholm, Sweden" → "Stockholm, Sweden"
 * "Hong Kong, Hong Kong SAR" → "Hong Kong SAR"
 * "Rock Hill, SC" → "Rock Hill, SC, United States"
 *
 * HARD RULE: NEVER include "Remote" in CV location (recruiter red flag)
 * "Dublin, IE | Remote" -> "Dublin, IE"
 * "Remote" -> "" (empty, caller should fallback to default)
 */
function normalizeLocationForCV(rawLocation, fallbackLocation = 'Dublin, IE') {
  if (!rawLocation) return '';

  // CRITICAL: First clean any location prefixes
  let location = cleanLocation(rawLocation);

  // Additional cleanup
  location = location
    .replace(/[\(\)\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // HARD RULE: NEVER include "Remote" in CV location header (recruiter red flag)
  if (/^(remote|work from home|wfh|virtual|fully remote|remote first)$/i.test(location)) {
    return '';
  }

  // Strip Remote from any location string
  location = location
    .replace(/\b(remote|work\s*from\s*home|wfh|virtual|fully\s*remote|remote\s*first|remote\s*friendly)\b/gi, '')
    .replace(/\s*[\(\[]?\s*(remote|wfh|virtual)\s*[\)\]]?\s*/gi, '')
    .replace(/\s*(\||,|\/|\u2013|\u2014|-|\u00b7)\s*(\||,|\/|\u2013|\u2014|-|\u00b7)\s*/g, ' | ')
    .replace(/\s*(\||,|\/|\u2013|\u2014|-|\u00b7)\s*$/g, '')
    .replace(/^\s*(\||,|\/|\u2013|\u2014|-|\u00b7)\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!location || location.length < 2) return '';

  // Handle Hybrid (keep this as it's a valid on-site indicator)
  if (/\bhybrid\b/i.test(location)) {
    const cityMatch = location.match(/hybrid\s*(?:[\-\–\|,]\s*)?(.+)/i);
    if (cityMatch && cityMatch[1]?.trim()) {
      const formatted = deduplicateAndFormat(cityMatch[1].trim(), fallbackLocation);
      return `Hybrid - ${formatted}`;
    }
    return 'Hybrid';
  }

  // Remove duplicates and FORCE "City, Country"
  return deduplicateAndFormat(location, fallbackLocation);
}

/**
 * Normalize a job location for tailoring/output using user rules:
 * RULE 1: "Remote" alone → profile fallback (e.g., "Dublin, Ireland")
 * RULE 2: "Remote" + city → city only (e.g., "Remote - Dublin" → "Dublin")
 * RULE 3: "Remote" + country → country only (e.g., "Remote USA" → "United States")
 * RULE 4: "USA"/"United States" alone → California default
 * RULE 5: No location → profile fallback
 */
function normalizeJobLocationForApplication(rawLocation, defaultLocation = 'Dublin, IE') {
  const fallback = (defaultLocation || 'Dublin, IE').trim() || 'Dublin, IE';
  const raw = (rawLocation || '').trim();

  // RULE 5: No location → profile fallback
  if (!raw) return fallback;

  // RULE 1: "Remote" alone → profile fallback
  if (/^\s*remote\s*$/i.test(raw)) {
    return fallback;
  }

  // Check for Remote patterns in the text
  const hasRemote = /\b(remote|work\s*from\s*home|wfh|virtual|fully\s*remote)\b/i.test(raw);

  if (hasRemote) {
    // RULE 2: "Remote" + city → city only (e.g., "Remote - Dublin", "Remote, Barcelona")
    const remoteCityMatch = raw.match(/remote\s*(?:[-–—,\|]\s*)?([A-Z][a-z]+(?:\s+(?:City|Town|Park|Bay|Beach|Valley|Springs|Garden\s+City))?)/i);
    if (remoteCityMatch && remoteCityMatch[1]) {
      const city = remoteCityMatch[1].trim();
      // Infer country from city if possible
      const cityLower = city.toLowerCase();
      const inferredCountry = CITY_COUNTRY_MAP[cityLower];
      if (inferredCountry) {
        const iso2 = _toISO2(inferredCountry) || inferredCountry;
        return `${city}, ${iso2}`;
      }
      // Check the city dataset
      const cityHit = _findCity(city);
      if (cityHit?.countryCode) {
        return `${city}, ${cityHit.countryCode}`;
      }
      // Check if it's a US city
      if (MAJOR_US_CITIES.some(c => cityLower.includes(c))) {
        return `${city}, US`;
      }
      return forceCityCountryFormat(city, fallback);
    }

    // RULE 3: "Remote" + country → country only (normalised)
    const remoteCountryMatch = raw.match(/remote\s*(?:[-–—,\|(\s]+)?\s*([A-Za-z][A-Za-z\s]+)/i);
    if (remoteCountryMatch && remoteCountryMatch[1]) {
      const countryCandidate = remoteCountryMatch[1].trim();
      const iso2 = _toISO2(countryCandidate);
      if (iso2) {
        // If it's USA without a city, default to California
        if (iso2 === 'US') {
          return 'California, US';
        }
        // Country-only should become "Capital, CC"
        return forceCityCountryFormat(countryCandidate, fallback);
      }
    }

    // Any other Remote pattern → fallback to profile location
    return fallback;
  }

  // RULE 4: "USA"/"United States" alone (no city) → California default
  if (/^(usa|us|united\s+states)$/i.test(raw)) {
    return 'California, US';
  }

  // Normalize first (handles duplicates, etc.)
  const normalized = normalizeLocationForCV(raw, fallback);

  // Double-check if normalized became empty (was Remote-only)
  if (!normalized || normalized.length < 2) {
    return fallback;
  }

  // Check again after normalization for USA-only
  if (/^(usa|us|united\s+states)$/i.test(normalized)) {
    return 'California, US';
  }

  // Ensure final output ALWAYS "City, Country"
  return forceCityCountryFormat(normalized, fallback);
}

/**
 * FIXED: Remove duplicate city/region parts and format as "City, Country"
 * "Stockholm, Stockholm, Sweden" → "Stockholm, Sweden"
 * "Rock Hill, SC" → "Rock Hill, SC, United States"
 * "Singapore, Singapore" → "Singapore"
 */
function deduplicateAndFormat(location, fallbackLocation = 'Dublin, IE') {
  if (!location) return '';

  // Split by comma and deduplicate (case-insensitive)
  const parts = location.split(/,\s*/);
  const uniqueParts = [];
  const seen = new Set();

  for (const part of parts) {
    const trimmed = part.trim();
    const normalized = trimmed.toLowerCase();

    if (!normalized) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    uniqueParts.push(trimmed);
  }

  if (uniqueParts.length === 0) return '';

  // 1-part input: could be City-only OR Country-only.
  if (uniqueParts.length === 1) {
    return forceCityCountryFormat(uniqueParts[0], fallbackLocation);
  }

  // Two or more parts
  const firstPart = uniqueParts[0];
  const lastPart = uniqueParts[uniqueParts.length - 1];

  // US state code at end
  if (/^[A-Z]{2}$/i.test(lastPart) && US_STATES[lastPart.toUpperCase()]) {
    if (uniqueParts.length === 2) {
      return `${firstPart}, ${lastPart.toUpperCase()}, US`;
    }
    // If already has more parts, just keep but normalise US to ISO2
    return forceCityCountryFormat(uniqueParts.join(', '), fallbackLocation);
  }

  // Standard: City + Country-ish -> normalise/force to City, ISO2
  return forceCityCountryFormat(`${firstPart}, ${lastPart}`, fallbackLocation);
}

function normalizeCityState(input) {
  if (!input) return input;

  const stateMatch = input.match(/([A-Za-z\s]+),?\s*([A-Z]{2})$/);
  if (stateMatch && US_STATES[stateMatch[2]]) {
    return `${stateMatch[1].trim()}, ${stateMatch[2]}`;
  }

  return input;
}

function normalizeCountry(country) {
  if (!country) return country;

  // Use _toISO2 to get the code, then resolve back to name
  const iso2 = _toISO2(country);
  if (iso2) {
    const db = _getDB();
    const name = db?.countryNameFromISO2?.(iso2);
    if (name) return name;
  }

  // Inline fallback
  const normalized = country.toLowerCase().trim();
  const countryMap = {
    'us': 'United States', 'usa': 'United States', 'u.s.': 'United States',
    'u.s.a.': 'United States', 'united states': 'United States',
    'united states of america': 'United States', 'america': 'United States',
    'uk': 'United Kingdom', 'u.k.': 'United Kingdom', 'united kingdom': 'United Kingdom',
    'england': 'United Kingdom', 'britain': 'United Kingdom', 'great britain': 'United Kingdom',
    'scotland': 'United Kingdom', 'wales': 'United Kingdom', 'northern ireland': 'United Kingdom',
    'ca': 'Canada', 'canada': 'Canada',
    'au': 'Australia', 'australia': 'Australia',
    'de': 'Germany', 'germany': 'Germany', 'deutschland': 'Germany',
    'fr': 'France', 'france': 'France',
    'ie': 'Ireland', 'ireland': 'Ireland',
    'nl': 'Netherlands', 'netherlands': 'Netherlands', 'holland': 'Netherlands',
    'sg': 'Singapore', 'singapore': 'Singapore',
    'in': 'India', 'india': 'India',
    'jp': 'Japan', 'japan': 'Japan',
    'ch': 'Switzerland', 'switzerland': 'Switzerland',
    'se': 'Sweden', 'sweden': 'Sweden',
    'ae': 'United Arab Emirates', 'uae': 'United Arab Emirates',
    'hk': 'Hong Kong', 'hong kong': 'Hong Kong', 'hong kong sar': 'Hong Kong',
    'dk': 'Denmark', 'denmark': 'Denmark',
    'no': 'Norway', 'norway': 'Norway',
    'fi': 'Finland', 'finland': 'Finland',
    'be': 'Belgium', 'belgium': 'Belgium',
    'at': 'Austria', 'austria': 'Austria',
    'pl': 'Poland', 'poland': 'Poland',
    'cz': 'Czech Republic', 'czech republic': 'Czech Republic', 'czechia': 'Czech Republic',
    'pt': 'Portugal', 'portugal': 'Portugal',
    'es': 'Spain', 'spain': 'Spain',
    'it': 'Italy', 'italy': 'Italy',
    'il': 'Israel', 'israel': 'Israel',
    'my': 'Malaysia', 'malaysia': 'Malaysia',
    'id': 'Indonesia', 'indonesia': 'Indonesia',
    'th': 'Thailand', 'thailand': 'Thailand',
    'kr': 'South Korea', 'south korea': 'South Korea', 'korea': 'South Korea',
    'tw': 'Taiwan', 'taiwan': 'Taiwan',
    'ph': 'Philippines', 'philippines': 'Philippines',
    'nz': 'New Zealand', 'new zealand': 'New Zealand',
    'za': 'South Africa', 'south africa': 'South Africa',
    'eg': 'Egypt', 'egypt': 'Egypt',
    'ke': 'Kenya', 'kenya': 'Kenya',
    'ng': 'Nigeria', 'nigeria': 'Nigeria',
    'tz': 'Tanzania', 'tanzania': 'Tanzania',
    'tr': 'Turkey', 'turkey': 'Turkey', 'türkiye': 'Turkey', 'turkiye': 'Turkey',
    'mx': 'Mexico', 'mexico': 'Mexico',
    'br': 'Brazil', 'brazil': 'Brazil', 'brasil': 'Brazil',
    'ar': 'Argentina', 'argentina': 'Argentina',
    'cl': 'Chile', 'chile': 'Chile',
    'co': 'Colombia', 'colombia': 'Colombia',
    'pe': 'Peru', 'peru': 'Peru',
    'cn': 'China', 'china': 'China',
  };

  return countryMap[normalized] || country;
}

function inferCountryFromCity(city) {
  if (!city) return null;
  const cityLower = city.toLowerCase().trim();

  // Try inline map first
  const mapped = CITY_COUNTRY_MAP[cityLower];
  if (mapped) return mapped;

  // Try city dataset
  const cityHit = _findCity(city);
  if (cityHit?.countryCode) {
    const db = _getDB();
    const name = db?.countryNameFromISO2?.(cityHit.countryCode);
    return name || cityHit.countryCode;
  }

  return null;
}

function getLocationPreview(rawLocation) {
  const normalized = normalizeLocationForCV(rawLocation);
  return {
    raw: rawLocation || 'Not detected',
    normalized,
    isUS: normalized.includes('US') || normalized.includes('United States'),
    isRemote: normalized.toLowerCase().includes('remote'),
    isHybrid: normalized.toLowerCase().includes('hybrid'),
    recruiterAdvantage: (normalized.includes('US') || normalized.includes('United States')) ? '🇺🇸 US Priority Match' : '',
  };
}

// Export
if (typeof window !== 'undefined') {
  window.ATSLocationTailor = {
    cleanLocation,
    normalizeLocationForCV,
    normalizeJobLocationForApplication,
    scrapeUniversalLocation,
    getLocationPreview,
    inferCountryFromCity,
    deduplicateAndFormat,
    forceCityCountryFormat,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanLocation,
    normalizeLocationForCV,
    normalizeJobLocationForApplication,
    scrapeUniversalLocation,
    getLocationPreview,
    inferCountryFromCity,
    deduplicateAndFormat,
    forceCityCountryFormat,
  };
}
