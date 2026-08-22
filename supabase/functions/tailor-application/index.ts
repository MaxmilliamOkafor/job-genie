import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// We reuse the existing generate-pdf backend function to keep a single client call per job.
// This function calls generate-pdf server-side and returns base64 PDFs alongside the tailored text.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation limits
const MAX_STRING_SHORT = 200;
const MAX_STRING_MEDIUM = 500;
const MAX_STRING_LONG = 50000;
const MAX_ARRAY_SIZE = 50;

function validateString(value: any, maxLength: number, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
  return trimmed;
}

function validateStringArray(value: any, maxItems: number, maxStringLength: number, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  if (value.length > maxItems) {
    throw new Error(`${fieldName} exceeds maximum of ${maxItems} items`);
  }
  return value.slice(0, maxItems).map((item, i) => validateString(item, maxStringLength, `${fieldName}[${i}]`));
}

interface TailorRequest {
  jobTitle: string;
  company: string;
  description: string;
  requirements: string[];
  location?: string;
  extractedCity?: string; // City extracted by extension for "[CITY] | open to relocation" CV format
  jobId?: string;
  userProfile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    linkedin: string;
    github: string;
    portfolio: string;
    coverLetter: string;
    // Canonical field: professional_experience (with fallback to workExperience for backward compatibility)
    professionalExperience: any[];
    education: any[];
    skills: any[];
    certifications: string[];
    achievements: any[];
    atsStrategy: string;
    city?: string;
    country?: string;
    address?: string;
    state?: string;
    zipCode?: string;
  };
  includeReferral?: boolean;
  coverLetterTone?: "professional" | "enthusiastic" | "concise";
}

async function verifyAuth(req: Request): Promise<{ userId: string; supabase: any }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("Unauthorized: Invalid or expired token");
  }

  return { userId: user.id, supabase };
}

interface AIProviderConfig {
  provider: "openai" | "kimi";
  apiKey: string;
  openaiEnabled: boolean;
  kimiEnabled: boolean;
}

async function getUserAIConfig(supabase: any, userId: string): Promise<AIProviderConfig | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("openai_api_key, kimi_api_key, preferred_ai_provider, openai_enabled, kimi_enabled")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  const preferredProvider = data.preferred_ai_provider || "openai";
  const openaiEnabled = data.openai_enabled ?? true;
  const kimiEnabled = data.kimi_enabled ?? true;

  // Determine which provider to use based on preference and availability
  let activeProvider: "openai" | "kimi" = "openai";
  let activeKey: string | null = null;

  if (preferredProvider === "kimi" && kimiEnabled && data.kimi_api_key) {
    activeProvider = "kimi";
    activeKey = data.kimi_api_key;
  } else if (preferredProvider === "openai" && openaiEnabled && data.openai_api_key) {
    activeProvider = "openai";
    activeKey = data.openai_api_key;
  } else if (kimiEnabled && data.kimi_api_key) {
    // Fallback to Kimi if OpenAI not available
    activeProvider = "kimi";
    activeKey = data.kimi_api_key;
  } else if (openaiEnabled && data.openai_api_key) {
    // Fallback to OpenAI if Kimi not available
    activeProvider = "openai";
    activeKey = data.openai_api_key;
  }

  if (!activeKey) {
    return null;
  }

  return {
    provider: activeProvider,
    apiKey: activeKey,
    openaiEnabled,
    kimiEnabled,
  };
}

// Legacy function for backward compatibility
async function getUserOpenAIKey(supabase: any, userId: string): Promise<string | null> {
  const config = await getUserAIConfig(supabase, userId);
  return config?.provider === "openai" ? config.apiKey : null;
}

async function logApiUsage(supabase: any, userId: string, functionName: string, tokensUsed: number): Promise<void> {
  try {
    await supabase.from("api_usage").insert({
      user_id: userId,
      function_name: functionName,
      tokens_used: tokensUsed,
    });
  } catch (error) {
    console.error("Failed to log API usage:", error);
  }
}

/**
 * Strip job-posting noise (requisition numbers, JR-/REQ-/R- codes,
 * employment-type / location suffixes) from a JD title, while keeping
 * legitimate digits like "Dynamics 365" or "SAP S/4HANA".
 */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Format a stored date token (2023-01, 01/2023, 2023) as "January 2023"; passes through "Present".
function formatMonthYear(raw?: string): string {
  const t = (raw || "").toString().trim();
  if (!t) return "";
  if (/present|current/i.test(t)) return "Present";
  let y = "", m = "";
  const iso = t.match(/^((?:19|20)\d{2})[-\/](\d{1,2})/);
  const my = t.match(/^(\d{1,2})[-\/]((?:19|20)\d{2})/);
  if (iso) { y = iso[1]; m = iso[2]; }
  else if (my) { y = my[2]; m = my[1]; }
  else return t;
  const idx = parseInt(m, 10) - 1;
  return MONTH_NAMES[idx] ? `${MONTH_NAMES[idx]} ${y}` : y;
}
// Build an ATS-safe range: "January 2023 - Present" (full month names, plain hyphen).
function formatDateRangeATS(start?: string, end?: string, fallbackEnd = ""): string {
  const s = formatMonthYear(start);
  const e = formatMonthYear(end) || fallbackEnd;
  if (!s && !e) return "";
  if (!e) return s;
  if (!s) return e;
  return `${s} - ${e}`;
}

function normaliseJobTitle(raw: string): string {
  let t = String(raw || "").trim();

  // Leading "(1526) ", "[1526] ", "1526 - ", "#88213 " style prefixes
  t = t.replace(/^\s*[\(\[\{]\s*#?\d{3,}\s*[\)\]\}]\s*[-–—:|]?\s*/, "");
  t = t.replace(/^\s*#?\d{4,}\s*[-–—:|]\s*/, "");

  // Requisition codes anywhere: JR-104882, REQ 88213, R-1234, Req #88213, Job ID: 1234
  t = t.replace(/\b(?:job\s*id|requisition(?:\s*(?:id|no\.?|number))?|req(?:uisition)?|jr|jobreq)\b\s*[#:\-–—]?\s*\d{2,}[A-Za-z]?\b/gi, " ");
  t = t.replace(/\b(?:JR|REQ|R)[-_]\d{2,}[A-Za-z]?\b/gi, " ");
  t = t.replace(/\s*[#(\[]\s*\d{3,}\s*[)\]]?\s*/g, " ");

  // Parenthetical employment-type / location / seniority noise
  const noise = /(remote|hybrid|on[-\s]?site|onsite|full[-\s]?time|part[-\s]?time|contract(?:or)?|permanent|perm|temporary|temp|fixed[-\s]?term|internship|intern|w2|c2c|ftc|maternity cover|\d+\s*months?|m\/f\/d|m\/w\/d|f\/m\/d|d\/f\/m|all genders|any gender)/i;
  t = t.replace(/[\(\[]([^)\]]*)[\)\]]/g, (m, inner: string) =>
    noise.test(String(inner)) ? " " : m,
  );

  // Trailing employment-type / noise suffixes after a separator
  t = t.replace(
    /\s*[-–—|,\/]\s*(remote|hybrid|on[-\s]?site|onsite|full[-\s]?time|part[-\s]?time|contract(?:or)?|permanent|temporary|fixed[-\s]?term|internship|intern|m\/f\/d|m\/w\/d|f\/m\/d|all genders)\s*$/gi,
    "",
  );

  // Trailing bare requisition-ish number ("Senior Engineer 104882")
  t = t.replace(/\s+\d{4,}$/g, "");

  // Tidy separators / whitespace
  t = t.replace(/\s{2,}/g, " ").replace(/\s*[-–—|,\/:]+\s*$/g, "").replace(/^\s*[-–—|,\/:]+\s*/g, "").trim();

  return t || String(raw || "").trim();
}

function validateRequest(data: any): TailorRequest {
  const jobTitle = normaliseJobTitle(validateString(data.jobTitle, MAX_STRING_SHORT, "jobTitle"));
  const company = validateString(data.company, MAX_STRING_SHORT, "company");
  const description = validateString(data.description || "", MAX_STRING_LONG, "description");
  const requirements = validateStringArray(data.requirements || [], MAX_ARRAY_SIZE, MAX_STRING_MEDIUM, "requirements");
  const location = data.location ? validateString(data.location, MAX_STRING_SHORT, "location") : undefined;
  const extractedCity = data.extractedCity
    ? validateString(data.extractedCity, MAX_STRING_SHORT, "extractedCity")
    : undefined;
  const jobId = data.jobId ? validateString(data.jobId, MAX_STRING_SHORT, "jobId") : undefined;

  const profile = data.userProfile || {};
  
  // Canonical mapping: prefer professionalExperience/professional_experience, fallback to workExperience/work_experience
  const experienceArray = Array.isArray(profile.professionalExperience) ? profile.professionalExperience :
                          Array.isArray(profile.professional_experience) ? profile.professional_experience :
                          Array.isArray(profile.workExperience) ? profile.workExperience :
                          Array.isArray(profile.work_experience) ? profile.work_experience : [];
  
  const userProfile = {
    firstName: validateString(profile.firstName || "", MAX_STRING_SHORT, "firstName"),
    lastName: validateString(profile.lastName || "", MAX_STRING_SHORT, "lastName"),
    email: validateString(profile.email || "", MAX_STRING_SHORT, "email"),
    phone: validateString(profile.phone || "", MAX_STRING_SHORT, "phone"),
    linkedin: validateString(profile.linkedin || "", MAX_STRING_MEDIUM, "linkedin"),
    github: validateString(profile.github || "", MAX_STRING_MEDIUM, "github"),
    portfolio: validateString(profile.portfolio || "", MAX_STRING_MEDIUM, "portfolio"),
    coverLetter: validateString(profile.coverLetter || "", MAX_STRING_LONG, "coverLetter"),
    // Use canonical experience array (professionalExperience preferred)
    professionalExperience: experienceArray.slice(0, 20),
    education: Array.isArray(profile.education) ? profile.education.slice(0, 10) : [],
    skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 100) : [],
    certifications: validateStringArray(
      (profile.certifications || []).slice(0, 6),
      MAX_ARRAY_SIZE,
      MAX_STRING_MEDIUM,
      "certifications",
    ),
    achievements: Array.isArray(profile.achievements) ? profile.achievements.slice(0, 20) : [],
    atsStrategy: validateString(profile.atsStrategy || "", MAX_STRING_LONG, "atsStrategy"),
    city: profile.city ? validateString(profile.city, MAX_STRING_SHORT, "city") : undefined,
    country: profile.country ? validateString(profile.country, MAX_STRING_SHORT, "country") : undefined,
    address: profile.address ? validateString(profile.address, MAX_STRING_MEDIUM, "address") : undefined,
    state: profile.state ? validateString(profile.state, MAX_STRING_SHORT, "state") : undefined,
    zipCode: profile.zipCode ? validateString(profile.zipCode, MAX_STRING_SHORT, "zipCode") : undefined,
    relevantProjects: Array.isArray(profile.relevantProjects) ? profile.relevantProjects.slice(0, 10) :
                      Array.isArray(profile.relevant_projects) ? profile.relevant_projects.slice(0, 10) : [],
  };

  // Cover letter tone selection
  const validTones = ["professional", "enthusiastic", "concise"];
  const coverLetterTone = validTones.includes(data.coverLetterTone) ? data.coverLetterTone : "professional";

  return {
    jobTitle,
    company,
    description,
    requirements,
    location,
    extractedCity,
    jobId,
    userProfile,
    includeReferral: !!data.includeReferral,
    coverLetterTone: coverLetterTone as "professional" | "enthusiastic" | "concise",
  };
}

// Extract city from job location/description/URL for ATS optimization
function extractJobCity(jdLocation: string | undefined, jdDescription: string, jobUrl?: string): string | null {
  // Common city patterns to extract
  const cityPatterns = [
    // Major US cities
    "New York",
    "San Francisco",
    "Los Angeles",
    "Chicago",
    "Seattle",
    "Austin",
    "Boston",
    "Denver",
    "Atlanta",
    "Dallas",
    "Houston",
    "Miami",
    "Phoenix",
    "Philadelphia",
    "San Diego",
    "San Jose",
    "Portland",
    "Minneapolis",
    "Detroit",
    "Washington DC",
    "D.C.",
    // Major UK cities
    "London",
    "Manchester",
    "Birmingham",
    "Edinburgh",
    "Glasgow",
    "Bristol",
    "Cambridge",
    "Oxford",
    "Cardiff",
    "Leeds",
    "Liverpool",
    "Newcastle",
    "Belfast",
    "Southampton",
    "Nottingham",
    "Sheffield",
    // Major EU cities
    "Dublin",
    "Paris",
    "Berlin",
    "Amsterdam",
    "Munich",
    "Frankfurt",
    "Vienna",
    "Zurich",
    "Barcelona",
    "Madrid",
    "Milan",
    "Rome",
    "Stockholm",
    "Copenhagen",
    "Oslo",
    "Helsinki",
    "Brussels",
    "Lisbon",
    "Prague",
    "Warsaw",
    // Major Canadian cities
    "Toronto",
    "Vancouver",
    "Montreal",
    "Ottawa",
    "Calgary",
    "Edmonton",
    // Major APAC cities
    "Singapore",
    "Hong Kong",
    "Tokyo",
    "Sydney",
    "Melbourne",
    "Auckland",
    "Bangalore",
    "Mumbai",
    "Delhi",
    "Hyderabad",
    "Seoul",
    "Shanghai",
    "Beijing",
    // Ireland cities
    "Cork",
    "Galway",
    "Limerick",
    "Waterford",
  ];

  // Priority 1: Extract from job location field
  if (jdLocation && jdLocation.trim().length > 0) {
    const locationText = jdLocation.trim();

    // Check for direct city match in location
    for (const city of cityPatterns) {
      if (new RegExp(`\\b${city}\\b`, "i").test(locationText)) {
        return city;
      }
    }

    // If location is simple (no "or", no "Remote" as primary), use first part
    if (!/\bremote\b/i.test(locationText) && !locationText.includes(",") && locationText.length < 50) {
      return locationText;
    }

    // Extract first city from "City, State" or "City or Remote" patterns
    const firstCityMatch = locationText.match(/^([A-Za-z\s]+?)(?:,|\s+or\s+|\s*\|)/i);
    if (firstCityMatch && firstCityMatch[1].length > 2) {
      return firstCityMatch[1].trim();
    }
  }

  // Priority 2: Extract from URL params (e.g., ?city=London)
  if (jobUrl) {
    try {
      const url = new URL(jobUrl);
      const cityParam = url.searchParams.get("city") || url.searchParams.get("location");
      if (cityParam) {
        for (const city of cityPatterns) {
          if (new RegExp(`\\b${city}\\b`, "i").test(cityParam)) {
            return city;
          }
        }
        return cityParam;
      }
    } catch (e) {
      // URL parsing failed, continue
    }
  }

  // Priority 3: Extract from job description
  const descLower = jdDescription.toLowerCase();

  // Look for "Based in [City]" or "[City] Role" patterns
  const basedInMatch = jdDescription.match(/based in\s+([A-Za-z\s]+?)(?:\.|,|\s+and|\s+or|$)/i);
  if (basedInMatch && basedInMatch[1].length > 2) {
    const potentialCity = basedInMatch[1].trim();
    for (const city of cityPatterns) {
      if (new RegExp(`\\b${city}\\b`, "i").test(potentialCity)) {
        return city;
      }
    }
  }

  // Check for any city mention in description
  for (const city of cityPatterns) {
    if (new RegExp(`\\b${city}\\b`, "i").test(jdDescription)) {
      return city;
    }
  }

  return null;
}

// Smart location logic - formats as "[CITY]" for CV header (no relocation suffix)
function getSmartLocation(
  jdLocation: string | undefined,
  jdDescription: string,
  profileCity?: string,
  profileCountry?: string,
  jobUrl?: string,
  preExtractedCity?: string,
): string {
  // Priority 1: Use city pre-extracted by extension if provided
  if (preExtractedCity && preExtractedCity.trim().length > 0) {
    console.log(`Using pre-extracted city from extension: ${preExtractedCity}`);
    return preExtractedCity.replace(/\s*\|?\s*open\s+to\s+relocation\s*/gi, '').trim();
  }

  // Priority 2: Extract city from job listing
  const extractedCity = extractJobCity(jdLocation, jdDescription, jobUrl);

  if (extractedCity) {
    return extractedCity;
  }

  // Check if job is remote
  const jdText = `${jdLocation || ""} ${jdDescription}`.toLowerCase();
  if (/\b(remote|worldwide|global|anywhere|distributed|work from home|wfh)\b/.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity} | Remote`;
    }
    return "Remote";
  }

  // Fallback to profile location
  if (profileCity) {
    return profileCity;
  }

  return "Remote";
}

// PART 3A: Comprehensive location extraction from job data
interface ExtractedJobLocation {
  explicit: {
    cities: string[];
    countries: string[];
    regions: string[];
  };
  remote: {
    isRemote: boolean;
    remoteType: "fully_remote" | "hybrid" | "on_site" | "flexible" | "unknown";
    requiredTimezone?: string[];
  };
  relocation: {
    relocationRequired: boolean;
    relocationCoverage: boolean;
  };
  visa: {
    sponsorshipAvailable: boolean;
    citizenshipRequired?: string[];
    workAuthAccepted?: string[];
  };
}

function extractLocationFromJobData(
  jobTitle: string,
  jobDescription: string,
  jobMetadata?: { location?: string }
): ExtractedJobLocation {
  const fullText = `${jobTitle} ${jobDescription}`.toLowerCase();
  const jdLocation = jobMetadata?.location || "";

  // Country mapping
  const countryMap: { [key: string]: string } = {
    uk: "United Kingdom", london: "United Kingdom", manchester: "United Kingdom",
    us: "United States", usa: "United States", "new york": "United States",
    "san francisco": "United States", california: "United States",
    ireland: "Ireland", dublin: "Ireland",
    eu: "European Union", europe: "European Union",
    germany: "Germany", france: "France", netherlands: "Netherlands",
    canada: "Canada", australia: "Australia", singapore: "Singapore",
  };

  // Extract cities and countries
  const extractedCountries = new Set<string>();
  const extractedCities = new Set<string>();
  const allLocationsText = `${jdLocation} ${fullText}`;

  Object.entries(countryMap).forEach(([key, country]) => {
    if (allLocationsText.includes(key)) {
      if (key.length > 3) {
        extractedCities.add(key.charAt(0).toUpperCase() + key.slice(1));
      }
      extractedCountries.add(country);
    }
  });

  // Detect remote work type
  const remotePatterns = {
    fully_remote: /fully remote|100% remote|completely remote|work from anywhere/i,
    hybrid: /hybrid|flexible|mix of|days (?:in|at) office/i,
    on_site: /on-?site|in office|office based|must be in|required to be in/i,
  };

  let remoteType: "fully_remote" | "hybrid" | "on_site" | "flexible" | "unknown" = "unknown";
  if (remotePatterns.fully_remote.test(fullText)) remoteType = "fully_remote";
  else if (remotePatterns.hybrid.test(fullText)) remoteType = "hybrid";
  else if (remotePatterns.on_site.test(fullText)) remoteType = "on_site";
  else if (/flexible|arrangement/i.test(fullText)) remoteType = "flexible";

  const isRemote = remoteType === "fully_remote" || remoteType === "hybrid" || remoteType === "flexible";

  // Detect timezone requirements
  const timezoneMatch = fullText.match(
    /(?:timezone|gmt|utc|est|pst|cet|ist)[:\s]*([A-Z]{2,3}(?:\s*[-to]\s*[A-Z]{2,3})?)/gi
  );
  const requiredTimezone = timezoneMatch ? timezoneMatch.map((tz) => tz.toUpperCase()) : undefined;

  // Detect relocation/visa
  const relocationRequired = /must relocate|requires relocation|willing to relocate/i.test(fullText);
  const relocationCoverage = /relocation (?:assistance|package|covered|support)/i.test(fullText);
  const sponsorshipAvailable = /visa sponsorship|sponsorship available|sponsor work visa/i.test(fullText);

  // Extract regions
  const regionPatterns = /(?:across|in|within)\s+(europe|asia|north america|apac|latam)/gi;
  const regions: string[] = [];
  let regionMatch;
  while ((regionMatch = regionPatterns.exec(fullText)) !== null) {
    regions.push(regionMatch[1]);
  }

  return {
    explicit: {
      cities: Array.from(extractedCities),
      countries: Array.from(extractedCountries),
      regions,
    },
    remote: {
      isRemote,
      remoteType,
      requiredTimezone,
    },
    relocation: {
      relocationRequired,
      relocationCoverage,
    },
    visa: {
      sponsorshipAvailable,
      citizenshipRequired: undefined,
      workAuthAccepted: undefined,
    },
  };
}

// PART 3B: Match user locations to job requirements
interface LocationMatch {
  matchScore: number;
  isViableLocation: boolean;
  reason: string;
  userLocationsMatched: string[];
  jobRequirementsMatched: string[];
  flags: {
    sponsorshipNeeded: boolean;
    relocationRequired: boolean;
    timezoneCompatible: boolean;
  };
}

function matchUserLocationsToJob(
  userProfile: { city?: string; country?: string; authorizedCountries?: string[] },
  extractedJobLocation: ExtractedJobLocation
): LocationMatch {
  let matchScore = 0;
  let reason = "";
  const userLocationsMatched: string[] = [];
  const jobRequirementsMatched: string[] = [];

  const flags = {
    sponsorshipNeeded: false,
    relocationRequired: false,
    timezoneCompatible: true,
  };

  // User's available locations
  const userCountries = [
    userProfile.country,
    ...(userProfile.authorizedCountries || []),
  ].filter(Boolean) as string[];

  // Check 1: REMOTE MATCH
  if (extractedJobLocation.remote.isRemote) {
    matchScore += 40;
    userLocationsMatched.push("Remote capable");
    jobRequirementsMatched.push(extractedJobLocation.remote.remoteType);
    reason = "Job is remote and user can work remotely";
  }

  // Check 2: EXPLICIT LOCATION MATCH
  if (extractedJobLocation.explicit.countries.length > 0) {
    const matchedCountries = extractedJobLocation.explicit.countries.filter((c) =>
      userCountries.some(
        (uc) =>
          uc.toLowerCase().includes(c.toLowerCase()) ||
          c.toLowerCase().includes(uc.toLowerCase())
      )
    );

    if (matchedCountries.length > 0) {
      matchScore += 35;
      userLocationsMatched.push(...matchedCountries);
      jobRequirementsMatched.push(...matchedCountries);
      reason = `User authorized in ${matchedCountries.join(", ")}`;
    }
  }

  // Check 3: RELOCATION
  if (extractedJobLocation.relocation.relocationRequired) {
    flags.relocationRequired = true;
    matchScore -= 5;
    reason += " [Relocation required]";
  }

  // Check 4: VISA SPONSORSHIP
  if (extractedJobLocation.visa.sponsorshipAvailable) {
    flags.sponsorshipNeeded = true;
    // This is positive - sponsorship is available
    matchScore += 5;
  }

  const isViableLocation = matchScore >= 35;

  return {
    matchScore,
    isViableLocation,
    reason: reason || "Location match evaluation completed",
    userLocationsMatched,
    jobRequirementsMatched,
    flags,
  };
}

// PART 2B: Extract job keywords for project matching
function extractTechKeywords(jobDescription: string, jobTitle: string): string[] {
  const keywords: Set<string> = new Set();

  const techPatterns = [
    /(?:python|javascript|typescript|java|c\+\+|rust|go|kotlin)/gi,
    /(?:react|vue|angular|svelte|next\.?js)/gi,
    /(?:node\.?js|express|django|flask|fastapi)/gi,
    /(?:aws|azure|gcp|kubernetes|docker)/gi,
    /(?:postgresql|mongodb|redis|elasticsearch)/gi,
    /(?:machine learning|deep learning|nlp|computer vision|llm|ai)/gi,
    /(?:api|rest|graphql|grpc)/gi,
    /(?:agile|scrum|kanban)/gi,
  ];

  const fullText = `${jobTitle} ${jobDescription}`.toLowerCase();

  for (const pattern of techPatterns) {
    const matches = fullText.match(pattern);
    if (matches) {
      matches.forEach((m) => keywords.add(m.toLowerCase()));
    }
  }

  return Array.from(keywords);
}

// Jobscan-style keyword extraction - enhanced for ATS ranking
function extractJobscanKeywords(
  description: string,
  requirements: string[],
): {
  hardSkills: string[];
  softSkills: string[];
  tools: string[];
  titles: string[];
  certifications: string[];
  responsibilities: string[];
  allKeywords: string[];
} {
  const text = `${description} ${requirements.join(" ")}`.toLowerCase();

  // Hard skills (expanded tech stack - covers most ATS systems)
  const hardSkillPatterns = [
    // Programming languages
    "python",
    "javascript",
    "typescript",
    "java",
    "c\\+\\+",
    "c#",
    "go",
    "golang",
    "rust",
    "ruby",
    "php",
    "scala",
    "kotlin",
    "swift",
    "r",
    "matlab",
    "perl",
    "bash",
    "powershell",
    "sql",
    "plsql",
    "tsql",
    "vba",
    "solidity",
    "haskell",
    "elixir",
    "clojure",
    "f#",
    "dart",
    "lua",
    "groovy",
    "objective-c",
    // Web frameworks
    "react",
    "react\\.?js",
    "angular",
    "vue",
    "vue\\.?js",
    "svelte",
    "next\\.?js",
    "nuxt",
    "gatsby",
    "remix",
    "ember",
    "backbone",
    "jquery",
    "node\\.?js",
    "express",
    "express\\.?js",
    "fastify",
    "nest\\.?js",
    "koa",
    "hapi",
    "django",
    "flask",
    "fastapi",
    "pyramid",
    "spring",
    "spring boot",
    "rails",
    "ruby on rails",
    "laravel",
    "symfony",
    "asp\\.?net",
    "blazor",
    "gin",
    "echo",
    "fiber",
    "phoenix",
    // Databases
    "sql",
    "nosql",
    "postgresql",
    "postgres",
    "mysql",
    "mariadb",
    "mongodb",
    "redis",
    "elasticsearch",
    "opensearch",
    "cassandra",
    "dynamodb",
    "couchdb",
    "couchbase",
    "neo4j",
    "graphdb",
    "arangodb",
    "firestore",
    "firebase",
    "supabase",
    "sqlite",
    "oracle",
    "sql server",
    "mssql",
    "db2",
    "teradata",
    "redshift",
    "bigquery",
    "athena",
    "presto",
    "trino",
    "clickhouse",
    "timescaledb",
    "influxdb",
    // Cloud & infrastructure
    "aws",
    "amazon web services",
    "azure",
    "microsoft azure",
    "gcp",
    "google cloud",
    "google cloud platform",
    "docker",
    "kubernetes",
    "k8s",
    "terraform",
    "ansible",
    "puppet",
    "chef",
    "cloudformation",
    "pulumi",
    "helm",
    "istio",
    "linkerd",
    "consul",
    "vault",
    "nomad",
    "ecs",
    "eks",
    "aks",
    "gke",
    "fargate",
    "lambda",
    "step functions",
    "cloud functions",
    "azure functions",
    "cloudflare",
    "vercel",
    "netlify",
    "heroku",
    "digitalocean",
    "linode",
    "vagrant",
    "openstack",
    "vmware",
    "proxmox",
    // DevOps/CI-CD
    "jenkins",
    "circleci",
    "github actions",
    "gitlab ci",
    "travis ci",
    "bamboo",
    "teamcity",
    "azure devops",
    "argo cd",
    "argocd",
    "flux",
    "spinnaker",
    "tekton",
    "buildkite",
    "drone",
    "concourse",
    "ci/cd",
    "ci cd",
    "continuous integration",
    "continuous deployment",
    "continuous delivery",
    "devops",
    "devsecops",
    "sre",
    "site reliability",
    "infrastructure as code",
    "iac",
    "gitops",
    // Data & ML
    "tensorflow",
    "pytorch",
    "keras",
    "scikit-learn",
    "sklearn",
    "pandas",
    "numpy",
    "scipy",
    "matplotlib",
    "seaborn",
    "plotly",
    "spark",
    "pyspark",
    "hadoop",
    "hive",
    "pig",
    "kafka",
    "confluent",
    "airflow",
    "dagster",
    "prefect",
    "luigi",
    "dbt",
    "great expectations",
    "mlflow",
    "kubeflow",
    "vertex ai",
    "sagemaker",
    "databricks",
    "snowflake",
    "fivetran",
    "stitch",
    "airbyte",
    "meltano",
    "looker",
    "tableau",
    "power bi",
    "metabase",
    "superset",
    "quicksight",
    "mode",
    "amplitude",
    "mixpanel",
    "segment",
    "heap",
    "hugging face",
    "transformers",
    "langchain",
    "llamaindex",
    "openai",
    "gpt",
    "llm",
    "large language model",
    "nlp",
    "natural language processing",
    "computer vision",
    "cv",
    "opencv",
    "yolo",
    "bert",
    "word2vec",
    "xgboost",
    "lightgbm",
    "catboost",
    "random forest",
    "neural network",
    "deep learning",
    "machine learning",
    "ml",
    "ai",
    "artificial intelligence",
    "reinforcement learning",
    "supervised learning",
    "unsupervised learning",
    "feature engineering",
    "model training",
    "model serving",
    "mlops",
    "data science",
    "data engineering",
    "data analytics",
    "etl",
    "elt",
    "data warehouse",
    "data lake",
    "data lakehouse",
    "data pipeline",
    "streaming",
    "real-time",
    "batch processing",
    // API & Architecture
    "rest",
    "rest api",
    "restful",
    "graphql",
    "grpc",
    "soap",
    "websocket",
    "webhook",
    "api gateway",
    "microservices",
    "micro-services",
    "serverless",
    "event-driven",
    "event driven",
    "message queue",
    "pub/sub",
    "pubsub",
    "rabbitmq",
    "activemq",
    "sqs",
    "sns",
    "kinesis",
    "eventbridge",
    "domain driven design",
    "ddd",
    "cqrs",
    "saga pattern",
    "circuit breaker",
    "load balancer",
    "reverse proxy",
    "nginx",
    "apache",
    "haproxy",
    "traefik",
    "kong",
    "envoy",
    // Security
    "oauth",
    "oauth2",
    "oidc",
    "openid connect",
    "jwt",
    "saml",
    "sso",
    "single sign-on",
    "mfa",
    "multi-factor",
    "2fa",
    "rbac",
    "role based access",
    "iam",
    "identity management",
    "encryption",
    "tls",
    "ssl",
    "https",
    "penetration testing",
    "security audit",
    "vulnerability",
    "owasp",
    "soc2",
    "soc 2",
    "gdpr",
    "hipaa",
    "pci dss",
    "iso 27001",
    "compliance",
    "cybersecurity",
    "infosec",
    "devsecops",
    // Frontend
    "html",
    "html5",
    "css",
    "css3",
    "sass",
    "scss",
    "less",
    "tailwind",
    "tailwindcss",
    "bootstrap",
    "material ui",
    "mui",
    "chakra ui",
    "ant design",
    "styled components",
    "emotion",
    "webpack",
    "vite",
    "parcel",
    "rollup",
    "esbuild",
    "swc",
    "babel",
    "eslint",
    "prettier",
    "responsive design",
    "mobile-first",
    "accessibility",
    "a11y",
    "wcag",
    "aria",
    "pwa",
    "progressive web app",
    "spa",
    "single page application",
    "ssr",
    "server side rendering",
    "ssg",
    "static site generation",
    "jamstack",
    // Mobile
    "ios",
    "android",
    "react native",
    "flutter",
    "xamarin",
    "ionic",
    "cordova",
    "capacitor",
    "expo",
    "mobile development",
    "cross-platform",
    "native app",
    // Testing
    "unit testing",
    "integration testing",
    "e2e",
    "end-to-end",
    "test automation",
    "tdd",
    "test driven",
    "bdd",
    "behavior driven",
    "jest",
    "mocha",
    "chai",
    "jasmine",
    "karma",
    "cypress",
    "playwright",
    "selenium",
    "webdriver",
    "puppeteer",
    "pytest",
    "unittest",
    "junit",
    "testng",
    "rspec",
    "cucumber",
    "postman",
    "newman",
    "load testing",
    "performance testing",
    "jmeter",
    "locust",
    "k6",
    "gatling",
    "qa",
    "quality assurance",
    // Misc tech
    "git",
    "github",
    "gitlab",
    "bitbucket",
    "svn",
    "linux",
    "unix",
    "windows server",
    "macos",
    "shell scripting",
    "regex",
    "regular expressions",
    "json",
    "xml",
    "yaml",
    "protobuf",
    "avro",
    "parquet",
    "orc",
    "csv",
    "markdown",
    "agile",
    "scrum",
    "kanban",
    "lean",
    "safe",
    "waterfall",
    "sdlc",
    "software development lifecycle",
    // Blockchain & Web3
    "blockchain",
    "web3",
    "ethereum",
    "solana",
    "polygon",
    "smart contracts",
    "defi",
    "nft",
    "dapp",
    "ipfs",
    "hardhat",
    "truffle",
    "foundry",
  ];

  // Soft skills (critical for ATS)
  const softSkillPatterns = [
    "communication",
    "communication skills",
    "written communication",
    "verbal communication",
    "presentation skills",
    "leadership",
    "team leadership",
    "technical leadership",
    "thought leadership",
    "people management",
    "problem-solving",
    "problem solving",
    "critical thinking",
    "analytical thinking",
    "strategic thinking",
    "teamwork",
    "collaboration",
    "cross-functional",
    "cross functional",
    "interdisciplinary",
    "adaptability",
    "flexibility",
    "learning agility",
    "growth mindset",
    "self-motivated",
    "proactive",
    "time management",
    "prioritization",
    "multitasking",
    "deadline-driven",
    "results-oriented",
    "attention to detail",
    "detail-oriented",
    "quality-focused",
    "accuracy",
    "project management",
    "program management",
    "stakeholder management",
    "client-facing",
    "customer-focused",
    "mentoring",
    "coaching",
    "training",
    "knowledge sharing",
    "onboarding",
    "negotiation",
    "conflict resolution",
    "decision-making",
    "decision making",
    "consensus building",
    "innovation",
    "creativity",
    "design thinking",
    "user-centric",
    "empathy",
    "accountability",
    "ownership",
    "initiative",
    "self-starter",
    "independent",
  ];

  // Tools/platforms
  const toolPatterns = [
    "jira",
    "confluence",
    "slack",
    "microsoft teams",
    "teams",
    "zoom",
    "notion",
    "asana",
    "trello",
    "monday",
    "clickup",
    "linear",
    "shortcut",
    "pivotal tracker",
    "figma",
    "sketch",
    "adobe xd",
    "invision",
    "zeplin",
    "miro",
    "lucidchart",
    "draw\\.io",
    "excalidraw",
    "postman",
    "insomnia",
    "swagger",
    "openapi",
    "graphiql",
    "graphql playground",
    "datadog",
    "splunk",
    "grafana",
    "prometheus",
    "new relic",
    "dynatrace",
    "appdynamics",
    "elastic apm",
    "honeycomb",
    "lightstep",
    "jaeger",
    "zipkin",
    "sentry",
    "bugsnag",
    "rollbar",
    "logrocket",
    "fullstory",
    "hotjar",
    "pagerduty",
    "opsgenie",
    "victorops",
    "statuspage",
    "incident\\.io",
    "cloudwatch",
    "stackdriver",
    "azure monitor",
    "sonarqube",
    "snyk",
    "dependabot",
    "renovate",
    "whitesource",
    "black duck",
    "veracode",
    "checkmarx",
    "salesforce",
    "hubspot",
    "zendesk",
    "intercom",
    "freshdesk",
    "stripe",
    "plaid",
    "twilio",
    "sendgrid",
    "mailchimp",
    "brevo",
    "1password",
    "lastpass",
    "okta",
    "auth0",
    "onelogin",
    "ping identity",
  ];

  // Job titles/roles
  const titlePatterns = [
    "software engineer",
    "senior software engineer",
    "staff engineer",
    "principal engineer",
    "distinguished engineer",
    "fellow",
    "software developer",
    "senior software developer",
    "application developer",
    "web developer",
    "frontend developer",
    "backend developer",
    "full stack developer",
    "fullstack developer",
    "data scientist",
    "senior data scientist",
    "lead data scientist",
    "principal data scientist",
    "data engineer",
    "senior data engineer",
    "analytics engineer",
    "bi engineer",
    "business intelligence",
    "data analyst",
    "business analyst",
    "product analyst",
    "marketing analyst",
    "financial analyst",
    "ml engineer",
    "machine learning engineer",
    "ai engineer",
    "applied scientist",
    "research scientist",
    "research engineer",
    "solution architect",
    "solutions architect",
    "cloud architect",
    "enterprise architect",
    "technical architect",
    "software architect",
    "system architect",
    "devops engineer",
    "platform engineer",
    "infrastructure engineer",
    "reliability engineer",
    "sre",
    "site reliability engineer",
    "security engineer",
    "security analyst",
    "information security",
    "application security",
    "cloud security",
    "qa engineer",
    "sdet",
    "test engineer",
    "quality engineer",
    "automation engineer",
    "technical lead",
    "tech lead",
    "team lead",
    "engineering manager",
    "engineering director",
    "vp of engineering",
    "cto",
    "chief technology officer",
    "product manager",
    "product owner",
    "program manager",
    "project manager",
    "scrum master",
    "agile coach",
    "frontend",
    "backend",
    "full stack",
    "fullstack",
    "mobile developer",
    "ios developer",
    "android developer",
  ];

  // Certifications (highly valued by ATS)
  const certificationPatterns = [
    "aws certified",
    "aws solutions architect",
    "aws developer",
    "aws sysops",
    "aws devops",
    "aws security",
    "aws data analytics",
    "aws machine learning",
    "azure certified",
    "azure administrator",
    "azure developer",
    "azure solutions architect",
    "azure data engineer",
    "azure ai engineer",
    "gcp certified",
    "google cloud certified",
    "professional cloud architect",
    "professional data engineer",
    "professional cloud developer",
    "cka",
    "ckad",
    "cks",
    "kubernetes certified",
    "certified kubernetes",
    "terraform certified",
    "hashicorp certified",
    "pmp",
    "project management professional",
    "prince2",
    "capm",
    "agile certified",
    "csm",
    "certified scrum master",
    "psm",
    "safe certified",
    "cissp",
    "cism",
    "cisa",
    "comptia security\\+",
    "ceh",
    "certified ethical hacker",
    "oscp",
    "comptia a\\+",
    "comptia network\\+",
    "ccna",
    "ccnp",
    "ccie",
    "ocjp",
    "ocpjp",
    "java certified",
    "oracle certified",
    "mcsa",
    "mcse",
    "microsoft certified",
    "salesforce certified",
    "servicenow certified",
    "databricks certified",
    "snowflake certified",
  ];

  // Key action verbs / responsibilities (ATS loves these)
  const responsibilityPatterns = [
    "designed",
    "developed",
    "implemented",
    "built",
    "created",
    "architected",
    "led",
    "managed",
    "supervised",
    "mentored",
    "coached",
    "trained",
    "optimized",
    "improved",
    "enhanced",
    "streamlined",
    "automated",
    "collaborated",
    "partnered",
    "coordinated",
    "communicated",
    "analyzed",
    "evaluated",
    "assessed",
    "reviewed",
    "audited",
    "deployed",
    "released",
    "launched",
    "shipped",
    "delivered",
    "scaled",
    "migrated",
    "integrated",
    "refactored",
    "modernized",
    "reduced",
    "increased",
    "achieved",
    "exceeded",
    "accomplished",
    "documented",
    "maintained",
    "supported",
    "troubleshot",
    "debugged",
    "resolved",
  ];

  const extractMatches = (patterns: string[]): string[] => {
    const matches: string[] = [];
    for (const pattern of patterns) {
      const regex = new RegExp(`\\b${pattern}\\b`, "gi");
      if (regex.test(text)) {
        // Capitalize properly and clean up escaped characters
        const cleaned = pattern.replace(/\\\./g, ".").replace(/\\+/g, "+").replace(/\\?/g, "");
        if (!matches.some((m) => m.toLowerCase() === cleaned.toLowerCase())) {
          // Smart capitalization
          const capitalized = cleaned
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          matches.push(capitalized);
        }
      }
    }
    return matches;
  };

  // Extract with higher limits for better ATS coverage
  const hardSkills = extractMatches(hardSkillPatterns).slice(0, 30);
  const softSkills = extractMatches(softSkillPatterns).slice(0, 10);
  const tools = extractMatches(toolPatterns).slice(0, 15);
  const titles = extractMatches(titlePatterns).slice(0, 5);
  const certifications = extractMatches(certificationPatterns).slice(0, 5);
  const responsibilities = extractMatches(responsibilityPatterns).slice(0, 10);

  // BLACKLIST: Meta/URL/nonsensical terms that should NEVER appear as skills
  const SKILL_BLACKLIST = new Set([
    "cv", "https", "http", "www", "html", "url", "pdf", "doc", "docx",
    "com", "org", "net", "io", "co", "uk", "de", "fr", "ie",
    "gmail", "email", "mailto", "tel", "fax",
    "linkedin", "github", "website", "portfolio", "blog",
    "click", "apply", "submit", "download", "upload", "login", "signin",
    "job", "jobs", "career", "careers", "vacancy", "vacancies",
    "description", "requirements", "qualifications", "responsibilities",
    "about", "company", "team", "role", "position", "candidate",
    "salary", "benefits", "perks", "compensation",
    "true", "false", "null", "undefined", "nan",
    "the", "and", "for", "with", "this", "that", "from", "are", "was",
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
  ]);

  const filterBlacklisted = (keywords: string[]): string[] =>
    keywords.filter(k => !SKILL_BLACKLIST.has(k.toLowerCase().trim()));

  const cleanHardSkills = filterBlacklisted(hardSkills);
  const cleanSoftSkills = filterBlacklisted(softSkills);
  const cleanTools = filterBlacklisted(tools);
  const cleanTitles = filterBlacklisted(titles);
  const cleanCertifications = filterBlacklisted(certifications);

  // Combined keywords prioritised for ATS scoring - increased cap for full coverage
  const allKeywords = [
    ...cleanHardSkills,
    ...cleanTitles,
    ...cleanCertifications,
    ...cleanTools,
    ...cleanSoftSkills,
  ].slice(0, 50);

  return { hardSkills: cleanHardSkills, softSkills: cleanSoftSkills, tools: cleanTools, titles: cleanTitles, certifications: cleanCertifications, responsibilities, allKeywords };
}

// Calculate accurate match score with fuzzy matching and synonym detection
function calculateMatchScore(
  jdKeywords: string[],
  profileSkills: any[],
  profileExperience: any[],
  profileEducation: any[] = [],
  profileCertifications: string[] = [],
): { score: number; matched: string[]; missing: string[]; partialMatches: string[] } {
  // Synonym mapping for common tech terms (helps with ATS variations)
  const synonyms: Record<string, string[]> = {
    javascript: ["js", "ecmascript", "es6", "es2015"],
    typescript: ["ts"],
    python: ["py"],
    kubernetes: ["k8s"],
    postgresql: ["postgres", "psql"],
    mongodb: ["mongo"],
    "amazon web services": ["aws"],
    "google cloud": ["gcp", "google cloud platform"],
    "microsoft azure": ["azure"],
    "node.js": ["nodejs", "node"],
    "react.js": ["reactjs", "react"],
    "vue.js": ["vuejs", "vue"],
    "next.js": ["nextjs", "next"],
    "machine learning": ["ml"],
    "artificial intelligence": ["ai"],
    "natural language processing": ["nlp"],
    "continuous integration": ["ci"],
    "continuous deployment": ["cd"],
    "ci/cd": ["cicd", "ci cd", "continuous integration", "continuous deployment"],
    "rest api": ["restful", "rest"],
    graphql: ["gql"],
    sql: ["structured query language"],
    nosql: ["no-sql", "non-relational"],
    agile: ["scrum", "kanban"],
    "full stack": ["fullstack", "full-stack"],
    frontend: ["front-end", "front end"],
    backend: ["back-end", "back end"],
    devops: ["dev ops", "dev-ops"],
  };

  // Build comprehensive profile text for matching
  const profileSkillsLower = profileSkills.map((s) => (typeof s === "string" ? s : s.name || "").toLowerCase());

  const experienceText = profileExperience
    .map((exp) => `${exp.title || ""} ${exp.company || ""} ${exp.description || ""} ${(exp.bullets || []).join(" ")}`)
    .join(" ")
    .toLowerCase();

  const educationText = profileEducation
    .map((edu) => `${edu.degree || ""} ${edu.field || ""} ${edu.school || ""} ${edu.description || ""}`)
    .join(" ")
    .toLowerCase();

  const certText = profileCertifications.join(" ").toLowerCase();

  const fullProfileText = `${profileSkillsLower.join(" ")} ${experienceText} ${educationText} ${certText}`;

  const matched: string[] = [];
  const missing: string[] = [];
  const partialMatches: string[] = [];

  for (const keyword of jdKeywords) {
    const keywordLower = keyword.toLowerCase();

    // Direct match
    let isMatched = fullProfileText.includes(keywordLower);

    // Check synonyms if no direct match
    if (!isMatched) {
      const keywordSynonyms = synonyms[keywordLower] || [];
      for (const syn of keywordSynonyms) {
        if (fullProfileText.includes(syn)) {
          isMatched = true;
          partialMatches.push(`${keyword} (via ${syn})`);
          break;
        }
      }

      // Check reverse synonyms (if profile has synonym, match the keyword)
      if (!isMatched) {
        for (const [mainTerm, syns] of Object.entries(synonyms)) {
          if (syns.includes(keywordLower) && fullProfileText.includes(mainTerm)) {
            isMatched = true;
            partialMatches.push(`${keyword} (via ${mainTerm})`);
            break;
          }
        }
      }
    }

    // Fuzzy match: check if keyword is substring or has high overlap
    if (!isMatched) {
      const words = keywordLower.split(/[\s\-\/]+/);
      const matchedWords = words.filter((w) => w.length > 2 && fullProfileText.includes(w));
      if (matchedWords.length >= Math.ceil(words.length * 0.6)) {
        isMatched = true;
        partialMatches.push(`${keyword} (partial: ${matchedWords.join(", ")})`);
      }
    }

    if (isMatched) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  // Calculate score with weighted importance
  // Hard skills (first 15) = 4 points, Tools/Certs (15-25) = 3 points, Soft skills = 2 points
  let totalPoints = 0;
  let earnedPoints = 0;

  jdKeywords.forEach((kw, i) => {
    const points = i < 15 ? 4 : i < 25 ? 3 : 2;
    totalPoints += points;
    if (matched.includes(kw)) {
      earnedPoints += points;
    }
  });

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 50;

  return {
    score: Math.min(100, Math.max(0, score)),
    matched,
    missing,
    partialMatches,
  };
}

// ==========================================
// CONTENT QUALITY ENGINE (inspired by JobOwl)
// ==========================================

// Banned buzzwords that AI tends to overuse - makes resumes sound generic
const BANNED_WORDS_MAP: Record<string, string> = {
  "orchestrated": "directed",
  "championed": "led",
  "pioneered": "introduced",
  "spearheaded": "led",
  "helmed": "managed",
  "leveraging": "using",
  "leveraged": "used",
  "leverage": "use",
  "utilising": "using",
  "utilised": "used",
  "utilise": "use",
  "utilizing": "using",
  "utilized": "used",
  "utilize": "use",
  "synergy": "collaboration",
  "synergies": "efficiencies",
  "comprehensive": "thorough",
  "dynamic": "adaptable",
  "robust": "reliable",
  "seamless": "smooth",
  "holistic": "complete",
  "cutting-edge": "modern",
  "best-in-class": "leading",
  "world-class": "top-tier",
  "results-driven": "effective",
  "detail-oriented": "precise",
  "passionate": "committed",
  "showcasing": "showing",
  "demonstrating": "showing",
  "meticulous": "thorough",
  "highly motivated": "motivated",
  "go-getter": "proactive",
};

// Phrase-level replacements for more natural language
const BANNED_PHRASES_MAP: Record<string, string> = {
  "proven ability": "ability",
  "proven track record": "experience",
  "proven record": "experience",
  "proven expertise": "expertise",
  "the intersection of": "across",
  "drive impactful outcomes": "deliver results",
  "strategic initiatives": "projects",
  "stakeholder environments": "teams",
  "think outside the box": "solve problems creatively",
  "resulting in": "achieving",
  "in order to": "to",
  "as well as": "and",
  "a wide range of": "various",
  "state-of-the-art": "modern",
  "paradigm shift": "change",
};

function applyContentQuality(text: string): string {
  if (!text) return text;
  let cleaned = text;

  // Phase 1: Replace banned phrases (longer phrases first to avoid partial matches)
  const sortedPhrases = Object.entries(BANNED_PHRASES_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, replacement] of sortedPhrases) {
    const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    cleaned = cleaned.replace(regex, replacement);
  }

  // Phase 2: Replace banned words
  for (const [word, replacement] of Object.entries(BANNED_WORDS_MAP)) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    cleaned = cleaned.replace(regex, (match) => {
      // Preserve capitalisation
      if (match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Phase 3: Remove em dashes (AI detection signal) - replace with regular hyphens
  cleaned = cleaned.replace(/[\u2013\u2014\u2015]/g, "-");

  return cleaned;
}

// ==========================================
// COVER LETTER TONE TEMPLATES (inspired by JobOwl)
// ==========================================

type CoverLetterTone = "professional" | "enthusiastic" | "concise";

function getCoverLetterToneInstructions(tone: CoverLetterTone): string {
  switch (tone) {
    case "enthusiastic":
      return `COVER LETTER TONE: ENTHUSIASTIC
- Open with genuine excitement about the company's mission or recent achievements
- Use energetic but professional language ("thrilled", "excited", "eager")
- Show personality while maintaining professionalism
- Emphasise cultural fit and passion for the industry
- Close with strong forward-looking enthusiasm about contributing`;

    case "concise":
      return `COVER LETTER TONE: CONCISE
- Maximum 3 short paragraphs (no more than 250 words total)
- Lead with your strongest qualification match immediately
- No filler phrases or unnecessary context
- Every sentence must add value - cut anything redundant
- Close with a single clear call to action`;

    case "professional":
    default:
      return `COVER LETTER TONE: PROFESSIONAL
- Formal but approachable tone throughout
- Open with a clear statement of interest and top qualification
- Structured body: qualification match, specific achievements, cultural alignment
- Use measured, confident language without being boastful
- Close with professional availability and next steps`;
  }
}


// ==========================================
// KEYWORD PRIORITY WEIGHTING (inspired by JobOwl)
// ==========================================

interface WeightedKeywords {
  high: string[];    // 40% - most important, need 3-5 mentions each
  medium: string[];  // 35% - important, need 2-4 mentions each
  low: string[];     // 25% - nice to have, need 1-2 mentions each
}

function categoriseKeywordsByPriority(
  hardSkills: string[],
  tools: string[],
  softSkills: string[],
  titles: string[],
  certifications: string[],
  description: string,
): WeightedKeywords {
  const descLower = description.toLowerCase();

  // Count frequency of each keyword in the JD - higher frequency = higher priority
  const allKeywords = [...hardSkills, ...tools, ...softSkills, ...titles, ...certifications];
  const frequencyMap = new Map<string, number>();

  for (const kw of allKeywords) {
    const kwLower = kw.toLowerCase();
    const regex = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = descLower.match(regex);
    frequencyMap.set(kw, matches ? matches.length : 0);
  }

  // Sort by frequency descending
  const sorted = [...frequencyMap.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.length;

  const highCount = Math.ceil(total * 0.40);
  const medCount = Math.ceil(total * 0.35);

  return {
    high: sorted.slice(0, highCount).map(([kw]) => kw),
    medium: sorted.slice(highCount, highCount + medCount).map(([kw]) => kw),
    low: sorted.slice(highCount + medCount).map(([kw]) => kw),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabase } = await verifyAuth(req);

    const rawData = await req.json();

    // Support both 'description' and 'jobDescription' for extension compatibility
    if (rawData.jobDescription && !rawData.description) {
      rawData.description = rawData.jobDescription;
    }

    // Support 'jobUrl' as 'jobId' if no jobId provided
    if (rawData.jobUrl && !rawData.jobId) {
      rawData.jobId = rawData.jobUrl;
    }

    // If userProfile not provided, fetch from database
    if (!rawData.userProfile || Object.keys(rawData.userProfile).length === 0) {
      console.log(`[User ${userId}] Fetching profile from database...`);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (profileError || !profileData) {
        console.error("Failed to fetch user profile:", profileError);
        return new Response(
          JSON.stringify({
            error: "Profile not found. Please complete your profile in settings.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Map database profile to expected userProfile format
      // Canonical: use professional_experience (DB column), fallback to work_experience for legacy
      const dbExperience = Array.isArray(profileData.professional_experience) ? profileData.professional_experience :
                           Array.isArray(profileData.work_experience) ? profileData.work_experience : [];
      
      rawData.userProfile = {
        firstName: profileData.first_name || "",
        lastName: profileData.last_name || "",
        email: profileData.email || "",
        phone: profileData.phone || "",
        linkedin: profileData.linkedin || "",
        github: profileData.github || "",
        portfolio: profileData.portfolio || "",
        coverLetter: profileData.cover_letter || "",
        professionalExperience: dbExperience,
        education: profileData.education || [],
        skills: profileData.skills || [],
        certifications: profileData.certifications || [],
        achievements: profileData.achievements || [],
        atsStrategy: profileData.ats_strategy || "",
        city: profileData.city || "",
        country: profileData.country || "",
        address: profileData.address || "",
        state: profileData.state || "",
        zipCode: profileData.zip_code || "",
        relevantProjects: Array.isArray(profileData.relevant_projects) ? profileData.relevant_projects : [],
      };

      console.log(`[User ${userId}] Profile loaded: ${rawData.userProfile.firstName} ${rawData.userProfile.lastName}`);
    }

    const {
      jobTitle,
      company,
      description,
      requirements,
      location,
      extractedCity,
      jobId,
      userProfile,
      includeReferral,
      coverLetterTone,
    } = validateRequest(rawData);

    // Validate that profile has required info
    if (!userProfile.firstName || !userProfile.lastName) {
      return new Response(
        JSON.stringify({
          error: "Profile incomplete. Please add your first and last name in Profile settings.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get user's AI provider configuration
    const aiConfig = await getUserAIConfig(supabase, userId);

    if (!aiConfig) {
      return new Response(
        JSON.stringify({
          error: "No AI provider configured. Please add an API key (OpenAI or Kimi K2) in Profile settings.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { provider: aiProvider, apiKey: userApiKey } = aiConfig;
    console.log(`[User ${userId}] Using AI provider: ${aiProvider}`);

    console.log(`[User ${userId}] Tailoring application for ${jobTitle} at ${company}`);

    // Smart location logic - extract job city and format as "[CITY] | open to relocation"
    // Priority: 1) extractedCity from extension, 2) extract from location/description, 3) profile city
    const smartLocation = getSmartLocation(
      location,
      description,
      userProfile.city,
      userProfile.country,
      jobId,
      extractedCity,
    );
    console.log(
      `Smart location determined: ${smartLocation}${extractedCity ? ` (from extension: ${extractedCity})` : ""}`,
    );

    // Jobscan keyword extraction
    const jdKeywords = extractJobscanKeywords(description, requirements);
    console.log(`Extracted ${jdKeywords.allKeywords.length} keywords from JD`);

    // Calculate accurate match score with enhanced matching
    const matchResult = calculateMatchScore(
      jdKeywords.allKeywords,
      userProfile.skills,
      userProfile.professionalExperience,
      userProfile.education,
      userProfile.certifications,
    );
    console.log(
      `Match score calculated: ${matchResult.score}%, matched: ${matchResult.matched.length}, missing: ${matchResult.missing.length}, partial: ${matchResult.partialMatches?.length || 0}`,
    );

    // Categorise keywords by priority (JobOwl-inspired weighted system)
    const weightedKeywords = categoriseKeywordsByPriority(
      jdKeywords.hardSkills,
      jdKeywords.tools,
      jdKeywords.softSkills,
      jdKeywords.titles,
      jdKeywords.certifications,
      description,
    );
    console.log(`Keyword priorities - High: ${weightedKeywords.high.length}, Medium: ${weightedKeywords.medium.length}, Low: ${weightedKeywords.low.length}`);

    const candidateName = `${userProfile.firstName} ${userProfile.lastName}`.trim();
    // File naming: FirstName_LastName format with underscores
    const candidateNameForFile = `${userProfile.firstName}_${userProfile.lastName}`.replace(/\s+/g, "_").trim();

    // Calculate target score - we want 95-100% after AI integration
    const currentMatchPercent = (matchResult.matched.length / jdKeywords.allKeywords.length) * 100;
    const keywordsNeededFor95 = Math.ceil(jdKeywords.allKeywords.length * 0.95) - matchResult.matched.length;

    // Get cover letter tone instructions
    const toneInstructions = getCoverLetterToneInstructions(coverLetterTone || "professional");
    console.log(`Cover letter tone: ${coverLetterTone}`);

const systemPrompt = `You are an elite ATS (Applicant Tracking System) optimisation specialist with deep expertise in how Jobscan, Greenhouse, Workday, and Lever score resumes. Your ONLY goal is to rewrite the provided CV to score 95% or higher on a Jobscan match report against the provided job description, while keeping every claim 100% truthful and grounded in the candidate's actual experience.

CRITICAL LANGUAGE RULE - BRITISH ENGLISH ONLY:
ALL output MUST use British English spelling. This is NON-NEGOTIABLE and applies to every word.
Examples of REQUIRED British spellings:
- "optimised" NOT "optimized", "organised" NOT "organized", "analysed" NOT "analyzed"
- "realised" NOT "realized", "specialised" NOT "specialized", "recognised" NOT "recognized"
- "utilised" NOT "utilized", "minimised" NOT "minimized", "prioritised" NOT "prioritized"
- "customised" NOT "customized", "colour" NOT "color", "behaviour" NOT "behavior"
- "favour" NOT "favor", "centre" NOT "center", "defence" NOT "defense"
- "travelling" NOT "traveling", "modelling" NOT "modeling", "cancelled" NOT "canceled"
- "focussed" NOT "focused", "labelled" NOT "labeled"
Any American English spelling is an INSTANT FAILURE.

THE ONE EXEMPTION: PROPER NOUNS ARE REPRODUCED VERBATIM.
Certification names, product names, company names, and official job titles
are names, not prose. They are spelled the way their owner spells them,
even when that is American English, and even when it looks wrong.
- "AWS Certified Machine Learning - Specialty" NEVER becomes "Speciality"
- "Program Manager" as an employer's actual job title stays "Program
  Manager", never "Programme Manager"
- "Center of Excellence", "Labor Relations", "Defense Systems" stay as the
  organisation spells them
An ATS matches certifications and titles as EXACT STRINGS. Anglicising one
character makes the credential invisible to the scan, which is the
opposite of the goal. This exemption outranks the rule above.

---
PHASE 1: EXTRACTION (Do this first, output nothing yet)
Read the job description carefully and extract:
A. HARD SKILLS - Extract EVERY specific technical term: programming languages, tools, frameworks, platforms, services, methodologies, and concepts. The EXACT job title as written.
B. SOFT SKILLS - Extract every behavioural phrase (e.g. "growth mindset", "seeks feedback", "continuously improve", "collaborate", "explain technical concepts")
C. WEIGHTED TERMS - Note which terms appear MORE THAN ONCE in the JD, as these carry the most ATS weight. You MUST include all of them.
D. COMPANY CONTEXT - Identify key company-specific language (e.g. "gaming communities", "petabytes", "user privacy", "lovable products")

---
PHASE 2: GAP ANALYSIS (Internal reasoning, output nothing yet)
Compare extracted terms from Phase 1 against the candidate's CV:
- List every hard skill keyword MISSING from the CV
- List every soft skill keyword MISSING from the CV
- Identify which candidate experiences can legitimately support each missing keyword
- Note which JD keywords have NO basis in the candidate's background (these must NOT be added - truthfulness is non-negotiable)

Pre-extracted gap analysis:
- Current match: ${matchResult.matched.length}/${jdKeywords.allKeywords.length} keywords (${Math.round(currentMatchPercent)}%)
- Target: 95-100% match (need to add ${keywordsNeededFor95} more keywords)
- MISSING KEYWORDS THAT MUST BE ADDED: ${matchResult.missing.join(", ")}
- ALREADY MATCHED: ${matchResult.matched.join(", ")}

---
PHASE 3: REWRITE - EXECUTE ALL 7 RULES

RULE -1 - IMMUTABLE FACTS (HIGHEST PRIORITY, OVERRIDES ALL OTHER RULES)
The following fields from the candidate's original CV are facts. You may
reword surrounding prose, reorder bullets, and mirror JD vocabulary, but
you MUST NOT alter, invent, or omit any of these values:
- Name and contact details (email, phone, links)
- EMPLOYER NAMES - never replace with a different company
- JOB TITLES at each employer - never upgrade or change
- EMPLOYMENT DATES - never shift; never write a range that overlaps
  another listed role. Dates must EXACTLY match the original CV.
- DEGREE NAMES, institutions, and classifications (Distinction, First
  Class Honours, etc.) - never invent a degree or alter a class.
- CERTIFICATIONS - list ONLY those present in the original CV. Never
  fabricate (no "AWS Certified..." unless the original CV lists it).
- AWARDS - list ONLY awards present in the original CV. NEVER invent an
  award. If the JD mentions a "data analytics excellence" focus and the
  candidate has no such award, do not write one.
- METRICS in bullets - keep the SOURCE numbers from the original CV.
  You may reword the sentence around the metric; you may NOT change the
  number itself.

NOTE: The candidate's STATED LOCATION on the CV header is a separate
case - it is intentionally job-adaptive (handled outside the prompt by
the extension). Do NOT change the location yourself; the extension sets it.

If a JD demands an award/cert/employer/date/title the candidate does not
have, the response is: omit it. Never write a fact the candidate cannot
defend in interview.

Pre-flight check before returning JSON: every employer, title, date,
degree, certification, award, and metric in your output MUST exist in
the original CV. If it doesn't, remove it before responding.

RULE 0 - ANTI-FABRICATION (HARDEST RULE, OVERRIDES ALL OTHERS)
This rule is non-negotiable. It is more important than match score, more
important than keyword density, more important than Rule 10's verbatim-
phrase requirement. Violations look like obvious lies to a recruiter and
get the application instantly rejected, often blacklisting the candidate.

NEVER do any of the following - even when injecting "missing keywords":

1. Do NOT name the hiring company (or its products / brand / hardware /
   software / acronyms) in a bullet about a DIFFERENT employer's role.
   Example of what NEVER to write, given a JD for AMD applied to a Meta role:
     ❌ "Provided technical support for AMD's commercial products..."
     ❌ "...optimising workloads on AMD-based solutions..."
     ❌ "...delivered technical presentations enhancing confidence in AMD technology..."
     ❌ "...managing escalations of issues related to AMD hardware..."
     BAD: "Provided technical support for AMD's commercial products..."
     BAD: "...optimising workloads on AMD-based solutions..."
     BAD: "...delivered technical presentations enhancing confidence in AMD technology..."
     BAD: "...managing escalations of issues related to AMD hardware..."
   The candidate worked at META during that period, not for AMD.
   Writing AMD into a Meta bullet is a fabrication and a red flag.

2. Do NOT claim job-content the candidate didn't perform. The role's
   actual duties live in the ORIGINAL CV; you may reword and reorder
   them, but you may not invent new responsibilities, products
   supported, platforms used, customers served, sales activities, or
   technical surfaces.

3. Do NOT inject a JD phrase into a bullet where it has no truthful
   anchor in the original bullet. If the JD says "managed mainframe
   migrations" and no role in the CV touched mainframes, that phrase
   does NOT appear anywhere. Rule 10's verbatim-phrase requirement
   applies ONLY where the candidate genuinely has the experience.

4. Do NOT add tools / certifications / domain experience the candidate
   does not already have somewhere in the original CV.

5. The hiring company's NAME may appear in: the cover letter (where it
   addresses them), and the summary's "Target role" / opener line. It
   must NEVER appear inside a work-experience bullet describing past
   employment.

TEST before writing each bullet: "Could the candidate defend this
sentence in an interview when asked 'tell me about that?'" If the answer
is no, the bullet is fabricated - rewrite it using only what is in the
original CV, even if that means missing a keyword.

If a Rule 3 / Rule 9 / Rule 10 instruction conflicts with Rule 0,
Rule 0 wins. Lose the keyword, save the candidate's credibility.

RULE 1 - JOB TITLE IN SUMMARY (evidence-capped)
The summary must never assert a job title the rest of the CV cannot support.
- If the candidate's own work history contains the SAME or a CLOSELY
  EQUIVALENT title, the summary MAY use the JD's wording for it.
- If it does NOT (a genuine career pivot), the summary MUST NOT claim that
  title. Instead, mirror the JD's vocabulary through skills and domain
  language that the CV genuinely evidences, and open with what the
  candidate actually is (e.g. "Software engineer with data analytics and
  delivery experience across ...").
- NEVER open the summary with a bare title claim as its first words.
- The job title may never appear in a requisition-number form; posting
  noise (req numbers, JR-/REQ- codes, "(Remote)") must never appear in
  the CV or cover letter.

RULE 1b - THE PIVOT BRIDGE (how to be interesting without being false)

Rule 1 says do not claim a title the history cannot support. It does NOT
say write a CV that ignores the target role. A candidate moving into a
field they can genuinely do deserves a CV that makes a recruiter in that
field want to talk to them. That is the job here, and it is done with
real material, not invented material.

There is a hard line, and it is not about how ambitious the framing is:

  ALWAYS ALLOWED - reframing work the candidate really did:
    - describing real work in the target role's vocabulary, where the
      description stays true ("mentored junior engineers" for a role
      asking about developing a team; "presented root-cause findings to
      VP-level stakeholders" for one asking about stakeholder engagement)
    - leading with the parts of the history closest to this role, even
      when they sit in an older position
    - naming a domain the candidate has genuinely worked in, at the level
      they worked in it ("healthcare platforms", "regulated financial
      data", "HIPAA-compliant systems")
    - using the JD's exact words for skills the candidate has

  NEVER ALLOWED - things a check would catch:
    - a licence, registration, board certification or degree they do not
      hold (PharmD, RN, MD, CPA, PE, bar admission, a named degree)
    - a job title they have never held, asserted as what they are
    - years in a field they have not worked in
    - a responsibility they have never carried

The difference is that the first list survives an interview and a
reference call. The second ends the application, and can end worse than
that when a licence is involved.

THE PIVOT OPENER. When the target title is not in the history, do not
open with it and do not open with a bare claim about the target field.
Open with what the candidate IS, then the bridge to what the role NEEDS,
using only evidenced material:

  "<real current discipline> with <the most relevant evidenced domain or
   capability for this posting>, <a concrete evidenced achievement that
   maps onto the posting's core need>."

  Worked example. Software engineer applying to a healthcare operations
  role, whose history includes a healthcare platform:

    WRONG - "Experienced Manager of Clinical Services with a strong
    background in clinical pharmacy leadership."
    Nothing in the history supports the title OR the background. This is
    the failure this rule exists to prevent.

    RIGHT - "Software engineer with healthcare platform experience,
    including HIPAA-compliant data governance and clinical model
    validation against held-out test sets, and four years leading
    delivery and mentoring engineers."
    Every clause is in the CV. A recruiter reads a real overlap rather
    than a claim they will discard on sight.

WHERE THE PIVOT CASE IS ACTUALLY MADE. The summary shows the overlap in
one sentence. The COVER LETTER is where the pivot is argued: state the
move plainly, name the transferable evidence, and say what is being
brought that the field does not usually get. A candidate who explains a
pivot honestly is far more interesting than one who pretends there is
nothing to explain.

WHEN THE ROLE IS GATED ON A CREDENTIAL. If the posting requires a
licence, registration or named degree the candidate does not hold, no
amount of framing makes them eligible, and a summary implying otherwise
wastes the application. Tailor honestly around what they do have, list
the unmet requirement under KEYWORDS OMITTED, and let the human decide
whether to apply. Do not quietly manufacture the credential to raise a
score.

RULE 2 - SKILLS SECTION: COMPLETE REWRITE (worth ~20 points)

READ THIS BEFORE THE KEYWORD COUNTS BELOW. Every keyword target in this
prompt -- the minimum counts here, the "MUST ADD THESE" list at the end,
the 95% score -- is capped by RULE 0. A keyword goes in ONLY if the
candidate's own history evidences it. Where the two conflict, the score
loses. Always.

A quota with no evidence gate produces a fabricated professional identity,
which is worse than a low score because it survives the ATS and then fails
the interview. A real example this rule exists to prevent: a candidate
whose entire history is Meta software engineering, an AI product contract,
Accenture cloud architecture and Citigroup data analysis was given a
summary reading "Experienced Sales Engineer with over 5 years of expertise
in electrical systems", and skills listing transformers, industrial
batteries, protection relays and substations. Not one of those appeared
anywhere in the source CV. Every one came from the job description.
- If the JD asks for a skill the candidate has never used, it does NOT go
  in the CV. Not in Skills, not in Core Competencies, not in the summary.
- The summary describes the person the CV EVIDENCES, in their real
  discipline, using the JD's vocabulary only where it honestly overlaps.
- A genuine pivot is stated as a pivot. The cover letter is where
  transferable experience is argued (RULE 13), not the CV.
- Missing keywords that cannot be honestly claimed are reported in
  KEYWORDS OMITTED. That is the correct outcome, not a failure.

Rewrite the skills section as:
  Technical Skills: [list ALL hard skill keywords from the JD that the candidate can legitimately claim, comma-separated, exact spelling]
  Platforms & Tools: [all platforms, cloud services, devtools]
  Methodologies: [ETL, CI/CD, distributed systems, data modelling, etc.]
  Soft Skills: [all soft skill keywords from the JD, exact phrasing]
This section alone can close 15-20 points of the gap. THERE IS NO UPPER LIMIT: list EVERY JD skill, tool and technology the candidate's history evidences, however many that is. There is no lower limit either. A floor is what causes padding -- it is satisfied by adding terms nobody can be proficient in ("b2b", "enterprise", "fast-paced"), which a recruiter reads instantly as machine-assembled and which the candidate cannot defend if asked. Maximum coverage means maximum EVIDENCED coverage: leave out only what the history does not support at all.

RULE 3 - EXPERIENCE BULLETS: INJECT WEIGHTED TERMS (subject to Rule 0)
For each role in work history:
- Scan which Phase 1 keywords are THEMATICALLY relevant to that role
  based on the ORIGINAL CV bullet content (not the JD's wishlist).
- Rewrite 1-2 bullets per role to naturally incorporate missing keywords
  ONLY when the underlying work in that role genuinely involved that
  concept. "Genuinely involved" means the original bullet describes
  the activity; you are renaming it with the JD's vocabulary, not
  inventing the activity.
- Use the exact term as it appears in the JD, not a synonym.
- NEVER fabricate metrics, achievements, products supported, customer
  segments, or technical surfaces not in the original CV.
- NEVER mention the HIRING company / its products / its hardware / its
  brand inside a bullet for a DIFFERENT employer. See Rule 0.
- If a keyword has no truthful anchor in any role, leave it for the
  Skills section instead of forcing it into a bullet.
- Prioritise injecting the terms that appeared most often in the JD,
  subject to all of the above.

RULE 4 - MATCH SCALE LANGUAGE TO JD
If the JD uses "petabytes" and the CV says "10TB", rewrite to contextualise relative to enterprise/petabyte-scale systems.
If the JD says "millions of users", reference the candidate's production scale in that language.

RULE 5 - SOFT SKILLS: WEAVE INTO BULLETS (worth ~5 points)
Do not just list soft skills. Weave them into experience bullets:
- "growth mindset" → "...continuously improved pipeline performance through iterative feedback loops..."
- "seeks feedback" → "...actively sought peer code reviews to..."
- "explain technical concepts" → "...presented findings to VP-level stakeholders..."

RULE 6 - SEARCHABILITY FIXES (worth ~10 points)
- Location in CV header MUST be: "${smartLocation} | ${userProfile.phone} | ${userProfile.email}" - the candidate location adapts to the job's city (smartLocation) so geo-filters do not reject the application.
- Location in CV header MUST be: "${smartLocation} | ${userProfile.phone} | ${userProfile.email}" - use the job-derived location, NOT a hardcoded address.
- Job title from JD appears in summary (Rule 1)
- Section headings use standard ATS-readable labels: "Work Experience", "Education", "Skills", "Certifications"
- Do NOT use tables, columns, graphics, or text boxes

RULE 7 - SUMMARY REWRITE (worth ~8 points)
Rewrite the professional summary to:
1. Open with what the candidate demonstrably IS, per RULE 1. Use the JD's
   title wording only if an equivalent title exists in their work history;
   on a pivot, use their real discipline plus JD domain vocabulary. Never
   lead with a bare title claim as the opening words.
2. Reference 2-3 of the most-repeated hard skill keywords from the JD
3. Mirror the company's value language (e.g. "gaming communities", "data-driven decisions", "petabyte-scale systems")
4. Keep to 3-4 sentences maximum
5. WRITE IT SO PASSING WOULD FEEL LIKE A MISTAKE.
   The hiring manager is reading 200 CVs looking for reasons to say no.
   A summary that lists attributes ("motivated professional with strong
   communication skills") gives them one, because it describes a category
   of person rather than this person.
   - Lead with the single most specific, verifiable thing in the whole CV
     -- the biggest number, the largest scale, the most relevant employer,
     the outcome closest to what this JD is asking for. Concrete beats
     enthusiastic every time.
   - Name what only this candidate can claim: the exact combination of
     domain, tools and scale that would be expensive for the employer to
     find elsewhere.
   - Every sentence must survive the question "could an average applicant
     for this role write this same sentence?" If yes, it is filler --
     replace it with something from the CV that they could not write.
   - The global BANNED WORDS list at the end of this prompt already covers
     most filler. Add "team player" and "hard-working" to it: both
     describe a temperament every applicant claims, so neither
     distinguishes anyone.
   - No hedging. "Contributed to", "involved in", "exposure to" and
     "familiar with" all read as an admission of thin experience.
   SUBJECT TO RULES -1 AND 0: every claim here is drawn from the CV. The
   goal is a sharper reading of true facts, never a louder one. An
   inflated summary is the fastest way into the "no" pile, because the
   interview exposes it.
6. CRITICAL - YEARS OF EXPERIENCE ARE CAPPED BY EVIDENCE, NOT BY THE JD:
   - DERIVE the number of years from the candidate's ACTUAL employment
     dates in the CV.
   - NEVER state a number higher than that, even if the JD asks for more.
   - If the evidenced number is LOWER than the JD's requirement, state the
     real number or omit years entirely. NEVER inflate to match the JD.
   - If neither the JD nor the CV supports a clear number, omit years.

RULE 8 - CORE COMPETENCIES GRID (worth ~8 points, "6-second recruiter scan")
Generate a "Core Competencies" section with 6-9 keyword phrases drawn from the JD's most critical requirements.
These go between Professional Summary and Work Experience for maximum ATS + recruiter impact.
Format: short 2-4 word phrases (e.g. "Cloud Architecture", "CI/CD Pipelines", "Stakeholder Management").
Pick ONLY terms the candidate can legitimately claim. Prioritise JD terms that appear more than once.
EXCEPTION: Do NOT place soft-skill phrases containing the word "skills" in Core Competencies (e.g. "collaboration skills", "communication skills", "problem-solving skills"). These MUST go in the TECHNICAL SKILLS section instead, as recruiters find them off-putting at the top of a CV.

RULE 9 - VOCABULARY REFORMULATION (worth ~5 points)
Do NOT just insert keywords - REFORMULATE existing experience using the JD's exact vocabulary:
- If JD says "RAG pipelines" and CV says "LLM workflows with retrieval" → rewrite to "RAG pipeline design and LLM orchestration workflows"
- If JD says "MLOps" and CV says "observability, evals, error handling" → rewrite to "MLOps and observability: evals, error handling, cost monitoring"
- If JD says "stakeholder management" and CV says "collaborated with team" → rewrite to "stakeholder management across engineering, operations, and business"
NEVER add skills the candidate does not have. Only reformulate real experience with the JD's exact vocabulary.

REFORMULATION IS NOT OPTIONAL, AND IT DOES NOT CONFLICT WITH RULE 0.
This is the rule most often ignored, and the reason is a misread conflict.
Rule 0 and the preservation rules below say never invent, preserve every
metric, change nothing you cannot justify. Faced with those, the safe-looking
move is to return each bullet exactly as it arrived. That is the WRONG
reading, and it produces the failure this rule exists to prevent: the same CV
sent to an Applied AI Engineer posting and a Senior Technical Business Analyst
posting came back with all twenty experience bullets byte-identical. Only the
summary and the skills list had changed. The posting's keywords were DECLARED
at the top and never PROVEN underneath, which is what a reviewer is checking
for.

The two rules do not conflict because they govern different things:

  IMMUTABLE - never change, never add, never drop:
    employers, job titles, dates, technologies actually used, every number,
    every percentage, every outcome, and the fact of what was done.

  FREE - must change to match the posting:
    which fact leads the sentence, and the vocabulary used to describe it.

Reordering a sentence you did not write the facts of is not fabrication.
Leading with the outcome instead of the technology is not fabrication.
Calling the same work "data modelling" for a data role and "backend
architecture" for a backend role is not fabrication, PROVIDED both are
honest descriptions of what was actually done.

WORKED EXAMPLE - one real bullet, two postings:

  source:   "Re-architected the Business Suite data-ingestion layer in Python
             and SQL on an Apache Kafka stream, partitioning and caching hot
             paths to halve p95 query latency and cut compute spend."

  backend:  unchanged - it already speaks that dialect.

  data/BA:  "Re-modelled the Business Suite data-ingestion layer in Python and
             SQL over an Apache Kafka stream, partitioning and caching hot
             paths to halve p95 query latency and cut compute spend."

One verb and one preposition. Every number, technology and outcome identical.
That is the whole move.

  source:   "Designed, fine-tuned and shipped a Llama-based content-moderation
             system in Python and PyTorch... and cut the manual review queue by
             40% with no loss of precision across millions of daily users."

  outcome-led: "Cut the manual review queue by 40% with no loss of precision
             across millions of daily users by designing and shipping a
             Llama-based content-moderation service in Python and PyTorch..."

Same sentence, reordered so the result reads first.

WHAT WOULD BE FABRICATION, for the avoidance of doubt: adding "gathered
requirements from stakeholders", "facilitated workshops", "owned the
roadmap" or any other activity the source does not record. If the posting
asks for something the candidate's history does not evidence, it goes in
TECHNICAL SKILLS if they genuinely have the skill, and nowhere at all if
they do not. It NEVER gets invented into a bullet.

APPLY THIS TO EVERY ROLE, not only the most recent. An older role is often
the most relevant one: a Data Analyst position from years ago can evidence a
Business Analyst posting far better than a current engineering role does.

RULE 10 - EXACT JD PHRASE PRESERVATION (worth ~15 points, CRITICAL for Jobscan)
ATS scanners like Jobscan check for EXACT multi-word phrases from the JD, not just individual words.
You MUST use these phrases VERBATIM (not paraphrased) in experience bullets or the summary:
- If JD says "troubleshoot issues" → use "troubleshoot issues" exactly, not "troubleshot problems" or "resolved issues"
- If JD says "implement tools" → use "implement tools" exactly, not "built tooling" or "created utilities"
- If JD says "programming skills" → use "programming skills" exactly, not "coding abilities"
- If JD says "improve efficiency" → use "improve efficiency" exactly, not "enhanced performance"
- If JD says "collaboration skills" → use "collaboration skills" exactly, not "teamwork abilities"
- If JD says "resolve issues" → use "resolve issues" exactly, not "fixed problems"
- If JD says "game development" → use "game development" exactly
- If JD says "mobile games" → use "mobile games" exactly

TECHNIQUE: Scan the JD for every 2-3 word verb phrase (e.g., "troubleshoot issues", "implement tools", "improve efficiency", "resolve issues", "monitor build pipelines") and embed each one verbatim into at least one experience bullet. Reformulate the candidate's existing achievements to naturally contain these exact phrases.

Example: 
- Original: "Fixed pipeline failures and improved CI reliability"
- JD phrase needed: "troubleshoot issues", "resolve issues", "improve efficiency"
- Rewritten: "Troubleshoot issues in CI pipelines and resolve issues to improve efficiency, reducing build failures by 70%"

This rule is subject to Rule 0. A JD phrase appears verbatim ONLY in
a bullet where the original CV already describes that activity. If no
role honestly maps to the phrase, the phrase does NOT appear in
experience -- it may appear in Skills (if it is a tool/skill the
candidate genuinely has) or be omitted entirely. NEVER invent a
responsibility to host a phrase. Match score is meaningless if the
recruiter spots a lie.

ABSOLUTELY FORBIDDEN: writing the HIRING company's name, products,
brand, hardware, or technology stack into a bullet for a DIFFERENT
employer. Example: applying to AMD, a Meta bullet must never say "AMD"
or "AMD's commercial products" or "AMD-based solutions". The candidate
worked at Meta, not AMD.

RULE 14 - NO KEYWORD TAILS ON BULLETS (hard ban)
NEVER append a trailing keyword clause to a bullet purely to place a
keyword. Banned patterns include ", using stakeholder management.",
", with time-management.", ", showing collaboration skills." - any
", using X" / ", with X" / ", showing X" / ", demonstrating X" tail
grafted onto an otherwise complete sentence.
Keywords belong in the summary and the skills sections, OR inside a
bullet where they describe what was actually done, integrated into the
sentence's grammar. If a keyword cannot be integrated grammatically and
truthfully, leave it out of the bullet.

RULE 15b - NO HEDGED OR APPROXIMATED NUMBERS (hard ban)
A number that is hedged reads as a number that was guessed, which is worse
than no number at all. Taken from a real generated CV: "cut the manual
review queue by ~40%".
- NEVER write "~", "circa", "c.", "approx", "approximately", "roughly",
  "about", "around", "an estimated", "in the region of" before a figure.
- If the source states the figure, state it exactly and plainly: "cut the
  review queue by 40%".
- If the source does NOT state it, do not gesture at one. Write the plain
  fact with no number, and report the gap in metricsWorthAdding.

AND NO WEASEL QUANTIFIERS IN PLACE OF A NUMBER. These are what a model
reaches for when it has been told to sound quantified but forbidden to
invent, and they are an obvious tell because they promise a measurement
and deliver none. All taken from real output:
  "surfacing significant exposure"        -> say what was surfaced
  "absorbing several-fold traffic growth" -> say the system scaled with load
  "measurably higher uptime"              -> either give the figure or say
                                             "with no service disruption"
Banned before a noun: significant, substantial, considerable, several-fold,
measurably, markedly, dramatically, drastically, materially, notably,
meaningfully. Plain description beats a vague intensifier every time.

RULE 15c - CORE COMPETENCIES AND SKILLS DO NOT OVERLAP
A term appears in ONE section. Real output listed "Communication Skills"
and "Presentation Skills" in Core Competencies AND again in Technical
Proficiencies, which reads as padding to a human and doubles nothing for
the ATS.
- Any phrase containing the word "skills" belongs in the Skills section,
  never in Core Competencies. This rule already exists in RULE 8 and was
  ignored; it is repeated here because the duplication is what a recruiter
  notices first.
- Before output, compare the two lists and remove from Skills anything
  already in Core Competencies.

RULE 15a - NO EM DASHES OR EN DASHES IN ANY OUTPUT (hard ban)
An em dash is one of the strongest machine-written tells a recruiter
reads, alongside round percentages. Never emit "—" or "–" in the CV or
the cover letter, in any position.
- For a parenthetical, use a comma, or split into two proper sentences.
- For a date or number range, use a plain hyphen: "January 2023 - Present",
  "2019 - 2022".
- Do not substitute a semicolon or a colon for the same effect; rewrite
  the sentence so it does not need one.
The em dashes appearing in THESE INSTRUCTIONS are not a style to imitate.
Only the CV and cover letter you produce are subject to this rule.

RULE 15 - CLEAN SENTENCE CASING AND GRAMMAR
Every sentence - in the summary, bullets, and cover letter - MUST begin
with a capital letter and be a grammatically complete sentence. Never
emit fragments like "...and data analytics. ability to lead
cross-functional teams..." (lowercase sentence start mid-paragraph).
When a JD phrase is spliced into prose, re-case and re-word it so the
sentence reads naturally.

RULE 15d - WHICH KIND OF NUMBER COUNTS AS EVIDENCE

Scanners ask for "measurable results" and the lazy way to satisfy that is
a percentage. Percentages are also the single most common tell of a
generated CV, because they are the easiest thing to invent and the
hardest thing for a reader to check. "Reduced manual effort by 40%"
raises the question 40% of what, measured how, against what baseline --
and a reader who cannot answer that discounts the whole bullet, and
often the whole CV with it.

Concrete magnitudes do not have that problem. They are checkable, they
carry scale on their face, and nobody reads them as machine-written.

PREFER, IN THIS ORDER:
  1. A count of real things:      50+ legacy applications, 12 analysts,
                                  40 reports, three trading desks
  2. A before and after:          a full day to under two hours,
                                  two weeks to three days,
                                  nine days to three
  3. A scale or volume:           millions of daily users, the daily
                                  transaction feed, petabyte-scale
  4. A duration or frequency:     nightly, month-end, within the first
                                  quarter of going live

PERCENTAGES ARE NOT USED AT ALL. Not as a last resort, not even when the
source CV states one. This is a deliberate decision by the candidate
whose CV this is, and it is absolute:

- Never write a percentage. No "by 40%", no "a 25% reduction", no "90%
  faster", no "30 per cent". Not in the CV, not in the cover letter, not
  in the summary.
- When the SOURCE bullet contains a percentage, express the underlying
  fact instead and drop the figure. "Cut the manual review queue by 40%
  with no loss of precision across millions of daily users" becomes "cut
  the manual review queue with no loss of precision across millions of
  daily users" -- which is the stronger sentence anyway, because the
  reader can check every part of it.
- NEVER convert a count or a duration INTO a percentage. "Cut processing
  from a full day to under two hours" must not become "cut processing
  time by 90%". The first is evidence; the second is arithmetic on
  evidence, and reads worse.
- Every OTHER figure is kept exactly as the source states it: counts,
  durations, volumes, versions, ranges, "50+", "two hours", "millions",
  "9 days to 3". Those are the evidence. Only the percentage goes.

The renderer strips any percentage that reaches it, so one emitted here
is deleted before the document is written. Emitting one wastes the
sentence it was built around: write the sentence without it.

MEASURABLE RESULTS ARE NOT ONLY NUMBERS. A bullet is measurable when a
reader can tell what changed and by how much. Scope counts: how many
systems, how many people, how many sites, over what period, to what
standard, replacing what. "Migrated 50+ client applications to
Kubernetes with zero service disruption" is fully measurable and
contains no percentage at all.

AND WHEN THE SOURCE HAS NO NUMBER, do not manufacture one. RULE 18 keeps
that rule: report the missing measure, never invent it. A bullet stating
what was built, for whom, and what it replaced is stronger than the same
bullet with a fabricated figure bolted on.

RULE 16 - XYZ ACHIEVEMENT FORMULA (subject to Rule 0)
Most bullets describe duties. A duty tells a reader what the candidate was
given; an achievement tells them what changed because the candidate was
there. Recruiters hire for the second.
Shape every bullet as: accomplished [X], as measured by [Y], by doing [Z].
The three parts do NOT have to appear in that order and the phrase "as
measured by" must NOT appear literally - it is a thinking tool, not
wording. The bullet must read as natural English.
- Duty:        "Managed a team of 5 engineers."
- Achievement: "Cut deployment time 40% across weekly releases by
                restructuring the team into cross-functional pods."
SUBJECT TO RULE 0: X, Y and Z must all come from the source CV. If the
source bullet records no outcome, do NOT invent one - keep the bullet
factual and let RULE 18 handle the missing measure. A fabricated outcome
is worse than an unquantified duty.

ROUND NUMBERS ARE THE TELL. Recruiters read "improved efficiency by 30%",
"reduced costs by 40%", "increased revenue by 25%" as machine-written,
because real measurement almost never lands on a multiple of five. A
number suspected of being invented costs more credibility than having no
number at all, and it casts doubt on the true numbers beside it.
- Reproduce the source figure EXACTLY. Never round 37% to 40%, never
  smooth 11,842 to 12,000, never turn "just under a fifth" into "20%".
- Never write a bare percentage that is a multiple of 5 or 10 unless the
  source states that exact figure.
- Where the source gives a scale rather than a percentage, prefer the
  concrete noun: "across four regions", "for 11,842 users", "a 12-person
  team". Counts read as observed; round percentages read as estimated.
- A bullet with no number is a normal, credible bullet. Leave it.

RULE 17 - EVERY BULLET OPENS ON A STRONG VERB (hard ban)
The first word of every bullet is a past-tense action verb describing what
the candidate DID.
BANNED OPENERS, no exceptions: "Responsible for", "Helped with", "Helped
to", "Assisted with", "Worked on", "Tasked with", "Duties included",
"Involved in", "Participated in", "Supported the". These describe
proximity to work rather than ownership of it, and a recruiter reads them
as someone who was present while other people delivered.
Prefer verbs that carry a result: Cut, Reduced, Delivered, Shipped, Grew,
Recovered, Automated, Consolidated, Negotiated, Rebuilt, Migrated,
Eliminated, Accelerated, Secured. Avoid opening more than two bullets in
the whole CV with the same verb.

RULE 18 - MISSING METRICS ARE REPORTED, NEVER INVENTED, NEVER PLACEHOLDERED
Rule 0 forbids inventing numbers, so a bullet whose source records no
outcome stays unquantified. That is correct, but the candidate usually
KNOWS the number and simply did not write it down, so the gap is worth
surfacing.

NEVER write a placeholder into any VALUE you output - no "[FILL IN]",
"[X]%", "[NUMBER]", "[Company Name]", "[GPA if applicable]", "TBD" or
similar. (The bracketed labels in the JSON schema below describe what to
put there; they are never themselves an answer. If you have no value for
an optional field, omit the field or use an empty string.) This tool
attaches the generated document to real applications and can email it
directly, so a placeholder gets no human proof-read the way it would in a
chat window; it reaches a recruiter and reads as carelessness.

Report the gaps instead, in the "metricsWorthAdding" array of the JSON
response - but ONLY where the number would change a hiring decision for
THIS job. A generic prompt to quantify something the JD never asks about
is noise, and noise trains the candidate to ignore the list.

Include an entry ONLY if ALL of these hold:
  1. the bullet describes something the JD explicitly asks for -- it maps
     to a named requirement, responsibility or keyword in the posting;
  2. the bullet currently carries NO number at all; and
  3. you can name the SPECIFIC measure that belongs there (users, revenue,
     time saved, volume, headcount, uptime), not merely "add a metric".

At most 3 entries, most decision-changing first. Prefer an empty array
over a weak entry: an empty list is a clean result, not a failure.
Format each as: <role> - <the exact bullet> → <the specific number>
Example, for a JD that asks for large-scale rollout experience:
  Northbound, Senior PM - Delivered the D365 rollout across four regions.
  → how many users, and over what period
This array is shown to the candidate; it is never part of the CV.

RULE 11 - BULLET ORDER IS THE CANDIDATE'S, NOT YOURS (hard ban on reordering)
The order of bullets within each role is a deliberate authoring decision made
by the candidate. PRESERVE IT EXACTLY. Bullet 1 of a role in the source stays
bullet 1 in the output, bullet 2 stays bullet 2, and so on to the end.
- Do NOT sort, promote, demote, shuffle or "front-load" bullets by JD relevance.
- Do NOT move a keyword-rich bullet to the top of a role.
- JD alignment is achieved by REWORDING each bullet in place (Rules 3, 9, 12),
  never by changing its position.

RULE 11b: EVERY BULLET IS KEPT (no trimming, no caps)
Return the SAME NUMBER of bullets for every role as the source CV provides.
- If the source gives a role seven bullets, the output has seven bullets.
- Do NOT drop, merge, compress or omit a bullet for length, relevance,
  page-count or attention reasons. There is no ceiling.
- Do NOT pad a role UP by inventing bullets. If the source gives a role four
  bullets, the output has exactly four.
The bullet count per role and the bullet order per role are both IMMUTABLE.


RULE 19: SCOPE AND SCALE, WHERE THE SOURCE GIVES IT
"Built dashboards" and "built dashboards used by 40 people across three desks"
describe the same work at very different levels of seniority. Where the SOURCE
CV states scope, carry it into the rewritten bullet instead of dropping it:
team size, user or customer counts, data volume, transaction volume, number of
systems, geographies, budget, or how many stakeholders the work served.
SUBJECT TO RULE 0, WITHOUT EXCEPTION. If the source does not state the scope,
you do not state the scope. Do not write "large-scale", "enterprise-wide",
"high-volume", "cross-functional" or "multi-million" as a substitute for a
number you were not given -- those are the words a reader discounts on sight,
and RULE 15b already bans hedged figures. A bullet with no scope is complete
and acceptable. An invented scope is a fabrication and fails the whole output.

RULE 20: NO CONTENT WORD TWICE IN THE SAME BULLET
"surfacing fraud and risk exposure for the risk team" reads as a draft nobody
re-read. Before emitting each bullet, check whether any noun or verb of four or
more letters appears twice in it. If one does, rewrite so it appears once.
Resolve it by DELETING the redundant occurrence or by using the word the source
CV itself uses elsewhere. Do NOT resolve it by inventing a name, a team, or a
department that the source does not contain -- that is a Rule 0 violation and a
reference check can contradict it. If you cannot remove the repetition without
inventing something, leave the bullet as it is: a repeated word is a small flaw,
an invented employer detail is a disqualifying one.

RULE 21: SPELLING FOLLOWS THE POSTING'S COUNTRY
A great deal of ATS keyword scoring is literal substring matching. A posting
asking for "optimization" scores nothing against a CV that says "optimisation".
Same word, missed keyword.
- Posting in the United States, Canada, Mexico or Latin America: American
  spelling throughout (optimize, analyze, behavior, center, modeling, program).
- Posting anywhere else -- UK, Ireland, the EU, Africa, India, Australia, New
  Zealand, Singapore: British spelling throughout (optimise, analyse, behaviour,
  centre, modelling, programme for a scheme but program for software).
Two things this rule does NOT touch. Proper nouns keep their owner's spelling
in every country: "World Health Organisation" and "Defence Forces Ireland" are
names, not words, and RULE 15 already requires this. And these are spelt -ise in
American English too, so never "correct" them: advise, supervise, expertise,
enterprise, advertise, comprise, revise, devise, promise, precise, franchise.

RULE 12 - WHERE EACH KEYWORD GOES (worth ~10 points)

Placement matters as much as coverage. A scanner and a human both read
the top of each section hardest, and a keyword sitting only in a skills
list is DECLARED but not PROVEN -- which is what a reviewer is checking
for. Subject to RULE 0 throughout: a keyword goes where the work
actually happened, never where it would score best.

FIRST, RANK THE KEYWORDS. Three tiers, in this order:
  TIER 1  stated as required, or repeated three or more times in the JD
  TIER 2  repeated twice, or listed under responsibilities
  TIER 3  mentioned once, or listed as preferred/nice-to-have
Tier 1 is what the CV must prove. Tier 3 is what the skills line catches.

THEN PLACE THEM.

  Professional Summary  the top 5 Tier 1 terms, worked into prose.
  Core Competencies     6-9 Tier 1 and Tier 2 phrases, JD wording.
  Experience bullets    where the proving happens. See the scaling below.
  Skills section        everything evidenced and not yet placed, which is
                        most of Tier 3.

SCALING ACROSS THE EXPERIENCE SECTION. "Two in the first bullet" is a
floor that wastes the rest of the section when a posting carries thirty
terms, and pads it when a posting carries six. Spread them instead:

  - Count the Tier 1 and Tier 2 terms the history can honestly carry.
    Call it N. Count the experience bullets. Call it B.
  - Aim for roughly N/B terms per bullet, weighted to the front: the most
    recent role and the first bullet of each role take the largest share.
  - NEVER more than two JD terms in one sentence, whatever N/B says. A
    third makes the sentence read as assembled rather than written, and
    RULE 14 already bans the ", using X and Y" tail that results.
  - Every bullet should carry at least one JD term where the underlying
    work honestly supports it. A bullet with none is not a failure -- it
    is a bullet describing work this posting does not ask about, and it
    may be the one RULE 11b trims.

WHICH ROLE GETS WHICH TERM. The role where that work actually happened,
always. Where two roles both support a term, put it in the more recent
one and let the older role carry a different term: spreading coverage
beats repeating it. A term the candidate used most recently is also the
most credible in the most recent role.

HOW OFTEN. Once is enough for most terms. Two or three appearances for a
Tier 1 term -- typically summary plus one bullet, or competencies plus
one bullet -- is the useful maximum. Beyond that a human reads padding
and the scanner gains nothing, because presence is what is scored.

THE TEST FOR A TERM IN THE TOP HALF: does a bullet underneath prove it?
If a Tier 1 term appears in the summary or competencies and nowhere in
the experience, either move it down into the role that evidences it, or
accept that the history does not support it and let it go to KEYWORDS
OMITTED. A declared skill with nothing underneath is the specific thing
that makes a CV read as tailored-by-machine.

RULE 13 - GAP MITIGATION IN COVER LETTER (worth ~5 points)
For each JD requirement the candidate does NOT directly have:
1. Identify if it's a hard blocker or nice-to-have
2. Find adjacent/transferable experience from the candidate's background
3. Write a specific cover letter sentence that bridges the gap
Example: JD requires "Unity" but candidate has no Unity → "While my primary experience is in web-based CI/CD systems, I have a strong foundation in game development workflows and am actively building Unity proficiency through personal projects."
NEVER claim to have skills the candidate lacks. Instead, demonstrate transferability and learning agility.

---
PHASE 4: VERIFICATION (Critical - do this before outputting)
After rewriting, run this internal checklist:
[ ] Does the summary open with something the CV evidences (no unsupported title claim, no bare title opener)?
[ ] Are stated years of experience <= what the employment dates prove?
[ ] Are there zero ", using X" / ", with X" keyword tails on bullets?
[ ] Does every sentence start with a capital letter and read grammatically?
[ ] Are there ZERO em dashes or en dashes in the CV and cover letter?
[ ] Is every claim in the summary and skills evidenced by the work history? Delete any that is not.
[ ] Are certification and job-title proper nouns spelled as their owner spells them (Specialty, not Speciality)?
[ ] Is there a "~", "approx" or "roughly" before any figure? Remove it.
[ ] Is there a weasel quantifier ("significant", "several-fold", "measurably") standing in for a number?
[ ] Does any term appear in BOTH Core Competencies and Skills?
[ ] Is the job title free of requisition numbers / posting noise?
[ ] Are ALL Phase 1 hard skill keywords present at least once?
[ ] Are ALL soft skill keywords present (in bullets or skills section)?
[ ] Are ALL multi-word JD phrases (verb phrases from responsibilities/requirements) present VERBATIM?
[ ] Are the top 5 keywords in the Professional Summary?
[ ] Are the JD terms SPREAD across the experience bullets rather than crammed into the first one, with no sentence carrying more than two, and the most recent role carrying the largest share?
[ ] Does every Tier 1 term in the summary or Core Competencies have a bullet underneath that proves it? If not, move it down or omit it - a declared skill with nothing beneath it is what reads as machine-assembled.
[ ] Is any single term repeated more than three times across the CV? Presence is what is scored; the rest is padding a human notices.
[ ] Are the bullets in each role still in the SOURCE order, with none moved to the front for relevance?
[ ] Does the cover letter address skill gaps with transferable experience?
[ ] Is "${smartLocation}" present in the header as the candidate's location?
[ ] Is the job-derived location "${smartLocation}" used in the header (NOT a hardcoded address)?
[ ] Are section headings ATS-standard?
[ ] Are all metrics and achievements from the original CV (nothing fabricated)?
[ ] Is every number reproduced EXACTLY as the source states it (nothing rounded)?
[ ] Is there any bare percentage that is a multiple of 5 or 10 and NOT in the source? If so, remove it - that is the tell recruiters read as machine-written.
[ ] REFORMULATION CHECK - go through the experience bullets one at a time and compare each against the source bullet it came from. How many did you actually change the wording of? If the answer is "none" or "only the most recent role", you have not applied Rule 9: returning the source bullets verbatim is the specific failure that rule exists to prevent, and it is what happens when Rule 0 is misread as "change nothing". Every number, technology, employer and date must be identical to the source; the LEAD FACT and the VOCABULARY must reflect this posting. Fix any bullet that is still in the source's dialect rather than the posting's.
[ ] Does each posting keyword you placed in TECHNICAL SKILLS or CORE COMPETENCIES also appear, where the history honestly supports it, in an experience bullet? A keyword declared at the top and never evidenced underneath is what a reviewer is scanning for.
[ ] Does every role have EXACTLY as many bullets as the source CV gave it, in EXACTLY the source order? Count them role by role. Any dropped, merged or moved bullet is a Rule 11 / 11b failure - restore it.
[ ] Did you drop a scope figure (team size, volume, user count, number of systems) that the SOURCE bullet stated? Put it back. Did you add one the source did not state? Remove it.
[ ] Does any bullet use the same four-letter-or-longer noun or verb twice ("risk ... risk team")? Rewrite it, but never by inventing a team or department name.
[ ] Is the spelling consistent with the POSTING's country throughout (American for US/Canada/Latin America, British everywhere else), with proper nouns left in their owner's spelling?
[ ] PIVOT CHECK - if the target title is not in the employment history: does the summary open with what the candidate actually IS rather than the target title, and is every clause of the bridge traceable to something in the CV? A pivot is argued with real overlap, never with a borrowed title.
[ ] Does the CV claim any licence, registration, board certification or named degree the candidate does not hold? Remove it and list the requirement under KEYWORDS OMITTED - this is the one class of claim that is checked before an interview.
[ ] Is there a percentage anywhere in the CV or cover letter? Remove it, including one the source states, and express the underlying fact instead. Every other figure - counts, durations, volumes, versions - stays exactly as the source has it.
[ ] Did you turn a count or a duration into a percentage? Put the original figures back: they are the evidence, the percentage is arithmetic on it.
[ ] Does every bullet open on a strong action verb (no "Responsible for", "Helped with", "Worked on")?
[ ] Does each bullet state an OUTCOME rather than a duty, wherever the source supports one?
[ ] Are there ZERO placeholder tokens ("[FILL IN]", "[X]%", "TBD") anywhere in the CV or cover letter?
[ ] Is "metricsWorthAdding" populated (or empty because every bullet is quantified)?
[ ] Could an average applicant for this role have written the summary? If yes, rewrite it.
[ ] Do weighted/repeated JD terms appear more than once in the CV?
[ ] Does the years of experience in the summary match the JD requirement?
If any box is unchecked, fix it before outputting.

---
PHASE 5: OUTPUT
Output the complete tailored CV in clean plain text, preserving the exact structure.
Then output a KEYWORD COVERAGE REPORT:
"KEYWORDS INJECTED: [list every JD keyword now present in the CV]"
"KEYWORDS OMITTED (no candidate basis): [list any you could not add]"
"ESTIMATED JOBSCAN SCORE: [your estimate]"

---
=== CRITICAL: PROFESSIONAL SUMMARY MUST NOT DUPLICATE HEADER ===
The resume header already contains: Name, Phone, Email, Location, LinkedIn, GitHub, Portfolio URLs.
The PROFESSIONAL SUMMARY section MUST:
- Start DIRECTLY with a qualifier like "Accomplished...", "Senior...", "Experienced..."
- NEVER repeat the candidate name "${candidateName}"
- NEVER repeat email "${userProfile.email}"
- NEVER repeat phone "${userProfile.phone}"
- NEVER repeat any URLs (linkedin, github, portfolio)
- NEVER repeat location information
VIOLATION = INSTANT REJECTION. The summary describes qualifications ONLY.
=== END CRITICAL RULE ===

ABSOLUTE RULES:
1. PRESERVE ALL COMPANY NAMES AND EXACT DATES (full month name + year format) - Only tailor the bullet points
2. Location in CV header MUST be: "${smartLocation}" as the candidate location (NO "open to relocation" suffix, NO second location)
2. Location in CV header MUST be the job-derived location: "${smartLocation}" (NO "open to relocation" suffix, NO hardcoded Dublin)
3. NO typos, grammatical errors, or formatting issues
4. File naming: ${candidateNameForFile}_CV.pdf and ${candidateNameForFile}_Cover_Letter.pdf
5. 100% of ALL keywords from the JD MUST appear at least once in the tailored resume - CHECK EVERY KEYWORD
6. The TECHNICAL SKILLS section must list ALL JD keywords not already covered in experience bullets
7. Dates MUST use full month names with a plain hyphen separator, e.g. "January 2023 - Present", "April 2021 - July 2022" (never MM/YYYY, never an en dash)

HUMANIZED TONE RULES:
- Active voice only
- Vary sentence structure - avoid repetitive patterns
- Use connectors: "This enabled...", "Resulting in...", "Which led to..."
- BANNED WORDS (NEVER USE): "track record", "proven track record", "strong track record", "results-driven", "dynamic", "cutting-edge", "passionate", "leverage", "leveraging", "synergy", "proven track record", "proven ability", "proven record", "proven expertise", "orchestrated", "championed", "pioneered", "spearheaded", "helmed", "meticulous", "comprehensive", "showcasing", "demonstrating", "highly motivated", "best-in-class", "world-class", "detail-oriented", "think outside the box", "go-getter", "various", "assisted", "realm", "approximately", "the intersection of", "drive impactful outcomes", "strategic initiatives", "stakeholder environments", "robust", "seamless", "holistic"
- APPROVED ALTERNATIVES: "led" (not championed/spearheaded), "directed" (not orchestrated), "thorough" (not comprehensive), "ability" (not proven ability), "experience" (never "track record", in any form), "field" (not realm), "using" (not leveraging), "detailed" (not meticulous), use actual numbers with "+" (not approximately)
- Include specific metrics (%, $, time saved, users impacted) ONLY where the source CV provides them. An absent number is left absent.

ATS KEYWORD DENSITY TARGETS:
- Hard Skills: Each must appear 2-3 times across resume
- Job Title Keywords: Must appear in summary and at least one role
- Tools/Platforms: Mention in skills section AND in relevant experience bullets
- Soft Skills: Demonstrate through specific examples, not just list them

KEYWORD PRIORITY WEIGHTING (frequency-based from JD analysis):
HIGH PRIORITY (must appear 3-5 times each): ${weightedKeywords.high.join(", ")}
MEDIUM PRIORITY (must appear 2-4 times each): ${weightedKeywords.medium.join(", ")}
LOW PRIORITY (must appear 1-2 times each): ${weightedKeywords.low.join(", ")}

JD KEYWORDS TO INTEGRATE:
Hard Skills (PRIORITY 1): ${jdKeywords.hardSkills.join(", ")}
Tools (PRIORITY 2): ${jdKeywords.tools.join(", ")}
Titles (PRIORITY 3): ${jdKeywords.titles.join(", ")}
Soft Skills (PRIORITY 4 - WEAVE INTO EXPERIENCE BULLETS, NOT SKILLS SECTION): ${jdKeywords.softSkills.join(", ")}
Certifications: ${jdKeywords.certifications.join(", ")}

ADD THESE WHERE THE CANDIDATE'S HISTORY EVIDENCES THEM (${matchResult.missing.length} keywords): ${matchResult.missing.join(", ")}
Any of these the candidate has genuinely never done is OMITTED and listed under KEYWORDS OMITTED. See RULE 0 and RULE 2. Do not invent a background to host a keyword.

Return ONLY valid JSON - no markdown code blocks, no extra text.`;

    const userPrompt = `TASK: Create an ATS-optimized, HUMANIZED application package.

=== TARGET JOB ===
Title: ${jobTitle}
Company: ${company}
Location: ${location || "Not specified"} → SMART LOCATION FOR CV: ${smartLocation}
Job ID: ${jobId || "N/A"}
Description: ${description}
Key Requirements: ${requirements.join(", ")}

=== CANDIDATE PROFILE ===
Name: ${candidateName}
Email: ${userProfile.email}
Phone: ${userProfile.phone}
LinkedIn: ${userProfile.linkedin}
GitHub: ${userProfile.github}
Portfolio: ${userProfile.portfolio}
Current Location: ${userProfile.city || ""}, ${userProfile.state || ""} ${userProfile.country || ""}

WORK EXPERIENCE (PRESERVE COMPANY NAMES AND DATES EXACTLY - ONLY REWRITE BULLETS):
${JSON.stringify(userProfile.professionalExperience, null, 2)}

EDUCATION:
${JSON.stringify(userProfile.education, null, 2)}

SKILLS:
${userProfile.skills?.map((s: any) => (typeof s === "string" ? s : s.name)).join(", ") || "Not specified"}

CERTIFICATIONS:
${userProfile.certifications?.join(", ") || "None listed"}

ACHIEVEMENTS:
${JSON.stringify(userProfile.achievements, null, 2)}

SELECTED PROJECTS (Do NOT output a SELECTED PROJECTS section - it is added programmatically after generation. Never render the projects data anywhere in the resume text):
${JSON.stringify(userProfile.relevantProjects || [], null, 2)}


=== INSTRUCTIONS ===

1) CREATE RESUME with these exact sections:
   - Header: ${candidateName}
   - Contact Line: ${smartLocation} | ${userProfile.phone} | ${userProfile.email}
   - Links Line: ${userProfile.linkedin} | ${userProfile.github || ""} | ${userProfile.portfolio || ""}
   - PROFESSIONAL SUMMARY: 4-6 lines of PURE QUALIFICATIONS ONLY.
      
      ███ CRITICAL DUPLICATION BAN ███
      The header ALREADY contains name/email/phone/links.
      The PROFESSIONAL SUMMARY text must contain ZERO of these:
      • Name: "${candidateName}" → FORBIDDEN in summary
      • Email: "${userProfile.email}" → FORBIDDEN in summary  
      • Phone: "${userProfile.phone}" → FORBIDDEN in summary
      • LinkedIn URL → FORBIDDEN in summary
      • GitHub URL → FORBIDDEN in summary
      • Portfolio URL → FORBIDDEN in summary
      • Location/city → FORBIDDEN in summary
      
      CORRECT FIRST WORDS: "Experienced", "Senior", "Accomplished", "Strategic", "Innovative"
      WRONG FIRST WORD: "${candidateName.split(" ")[0]}" (this is the name - BANNED)
      
      EXAMPLE OF CORRECT SUMMARY:
      "Experienced Principal Cloud Architect with 8+ years of expertise in cloud computing, data analytics, and machine learning. Designs scalable solutions that reduced infrastructure costs by 40% and improved system uptime to 99.9%."
      
      EXAMPLE OF WRONG SUMMARY (DO NOT DO THIS):
      "${candidateName} ${userProfile.phone} | ${userProfile.email}..." ← THIS IS WRONG
    ███ END DUPLICATION BAN ███
       TITLE REDUNDANCY: If the job title contains a parenthetical qualifier - e.g. 'Sr. Software Engineer (Data Science/Data Engineering)' - do not restate the qualifier's words verbatim in the first sentence; vary the phrasing instead.
    - COVER LETTER FIGURES ARE QUOTED, NOT PARAPHRASED: any number that appears in the cover letter MUST be copied from the CV with the SAME noun attached. A real pair went out with the CV saying "cut the manual review QUEUE by 40%" and the letter saying "reducing manual review TIME by 40%" -- a queue and a time are different claims, and a reviewer holding both documents sees an applicant whose own numbers do not agree. If the exact phrasing does not fit the sentence, drop the figure from the letter rather than restate it loosely; the CV already carries it.
    - THE COVER LETTER MUST SAY WHY THIS EMPLOYER: name something specific to THIS company from the posting -- the team, the product, the stated problem, the market -- and connect it to the candidate's own work. "the projects at [Company]" and "your innovative culture" are filler and count for nothing: they read identically for every employer, which is exactly what a reviewer is scanning for. If the posting genuinely says nothing specific, write about the WORK described in it rather than inventing a reason to admire the company.
    - TARGET TITLE LINE: The line immediately after the candidate's name is the job title being applied for, on its own, e.g. "Senior Backend Engineer". No pipes, no skills, no company. This is the first thing a reviewer checks against the req they are filling, and a CV that opens with a name and a phone number makes them do that mapping themselves. It is positioning, not a claim of current employment, so the titles inside WORK EXPERIENCE stay exactly as the candidate held them and nothing here may contradict them. If the posting's title does not truthfully describe the candidate's work, use their real target title instead. The extension also sets this line, so never emit it twice.
    - CORE COMPETENCIES: 6-9 keyword phrases from the JD, written as a single comma-separated line under this heading (placed between Summary and Work Experience). THESE PHRASES AND THE TECHNICAL SKILLS LIST PRINT AS ONE SECTION. The renderer merges the two under the heading TECHNICAL SKILLS, competencies first, each term once. It does this because a parser finds the skills section by searching headings for the word "skill" and takes the FIRST one that matches: a live parse of a real generated CV returned the competencies EMPTY, and two skills-named sections would have lost the other one instead. Keep writing both lists -- the competencies are the tailored, job-matched phrases and they lead the section a recruiter scans first -- but write them as two lists that read correctly when joined, and never repeat a term across them.
    - WORK EXPERIENCE: Keep company/dates (full month name + year, plain hyphen, e.g. "January 2023 - Present"), rewrite bullets with JD keywords + metrics. YEARS OF EXPERIENCE - THE DATES ON THE PAGE ARE THE ANSWER: any years figure in the summary MUST be consistent with the employment dates in this same CV. Add up the candidate's actual history and state that, or state no figure at all. NEVER set the figure to the JD's requirement: a CV whose summary says "over 4 years" above a work history running from 2017 to Present contradicts itself in the two places a reader looks first, and many ATS compute total tenure from the dates and compare it to the stated number. Exceeding a stated minimum is not a problem to solve - "5+ years" required and 9 years held is a strong application, whereas understating it filters the candidate out of the senior roles they actually qualify for and reads as junior. If the true total is genuinely below the JD's minimum, say the true total; do not inflate it either. Use VOCABULARY REFORMULATION (Rule 9) - reformulate existing bullets using the JD's exact vocabulary, not just insert keywords. Weave JD keywords into bullets ONLY where they fit naturally and truthfully - at most one added keyword per bullet, and never a credential/qualification noun (e.g. 'texas licensure', 'high school diploma') bolted onto a sentence. Any keyword that does not fit a bullet naturally goes into the TECHNICAL SKILLS section instead. A bullet must always read as plain English written by a human; never append a keyword with connectors like 'via X' or 'built with X' where the result is not a grammatical, truthful sentence. PRESERVE every number, percentage, and metric from the source bullets when rewriting - never drop a quantified outcome. Keep EVERY quantified result the source bullet already has. There is no target number of metrics per role: a role whose source records one number gets one, and a role that records none stays unquantified. Never manufacture a figure to reach a count. If a source bullet has a metric, the rewritten bullet MUST keep that exact metric. Never invent numbers that are not in the source data.
    - SELECTED PROJECTS: Do NOT output a SELECTED PROJECTS section - it is added programmatically after generation. Never render the projects data anywhere in the resume text.
    - TECHNICAL SKILLS: A single comma-separated list. Include EVERY JD hard skill, tool and technology the candidate's history evidences -- as many as qualify, with no cap. Classify each JD keyword before writing it: PROVEN (used professionally -> list it), TRANSFERABLE (related experience, different tool -> describe the transferable skill honestly, never rename it as the tool they asked for), UNSUPPORTED (never used, could not explain it in an interview -> leave it out entirely). Never add a keyword merely because it is absent. Where a term has an acronym and a full form the JD uses both, give both ONCE ("Continuous Integration and Continuous Delivery (CI/CD)"); never list variants of the same product ("Azure, Microsoft Azure, Azure Cloud"). Format: "Python, AWS, Terraform, Kubernetes, Docker, CI/CD, Cloud Security, Cloud Architecture".
    - CERTIFICATIONS
    - EDUCATION (LAST). Skills and certifications sit ABOVE education:
      a recruiter scanning top-down should reach what proves the candidate
      can do THIS job before reaching their degrees. Education first is the
      graduate convention and reads as early-career on a CV with years of
      history behind it. It also keeps the skills together rather than split
      by education: Core Competencies at the top for the scan, Technical
      Proficiencies and Certifications lower down as the detail block.

2) CREATE COVER LETTER:
   ${candidateName}
   ${smartLocation} | ${userProfile.email} | ${userProfile.phone}
   ${userProfile.portfolio || ""}

   Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

   Re: Application for ${jobTitle}

   Dear Hiring Manager,

   [4 paragraphs: Hook showing genuine interest, Proof with specific metrics and achievements, Skills alignment with job requirements, Close with availability and enthusiasm]

   Sincerely,
   ${candidateName}

   ${toneInstructions}

   COVER LETTER KEYWORD RULES:
   - Use 8-10 keywords naturally woven into the text (lighter than the CV)
   - NEVER use banned words: "leveraging", "utilising", "utilizing", "synergy", "passionate"
   - Use natural connectors: "with expertise in", "applying", "through", "incorporating"
   - The company name MUST be "${company}" - never use generic placeholders like "your company" or "the company"
   - COMPANY-FIRST BALANCE: Address the company directly - use 'you/your/${company}' at least as often as 'I/my'. Every paragraph must contain at least one sentence about the company's needs or mission, not the candidate.

   GAP MITIGATION (CRITICAL - from Rule 13):
   - In paragraph 3, address ANY JD requirements the candidate does NOT directly have
   - For each gap, demonstrate transferable experience or adjacent skills
   - Example: If JD requires "Unity" but candidate lacks it → "My deep experience with CI/CD pipelines for mobile application builds, combined with my understanding of game development workflows, positions me to quickly contribute to Unity-based build processes."
   - Frame gaps as "transferable strength + learning velocity", never as weaknesses
   - Maximum 1-2 gap mitigations - do not over-apologise

${
  includeReferral
    ? `
3) CREATE REFERRAL EMAIL:
   Subject: Referral Request - ${jobTitle} at ${company}
   Body: Professional request mentioning specific role
`
    : ""
}

=== REQUIRED JSON OUTPUT (NO MARKDOWN) ===
{
  "tailoredResume": "[COMPLETE RESUME TEXT - clean formatted text, no markdown]",
  "tailoredCoverLetter": "[COMPLETE COVER LETTER TEXT]",
  "matchScore": ${matchResult.score},
  "keywordsMatched": ${JSON.stringify(matchResult.matched)},
  "keywordsMissing": ${JSON.stringify(matchResult.missing)},
  "keywordAnalysis": {
    "hardSkills": ${JSON.stringify(jdKeywords.hardSkills)},
    "softSkills": ${JSON.stringify(jdKeywords.softSkills)},
    "tools": ${JSON.stringify(jdKeywords.tools)},
    "titles": ${JSON.stringify(jdKeywords.titles)}
  },
  "smartLocation": "${smartLocation}",
  "resumeStructured": {
    "personalInfo": {
      "name": "${candidateName}",
      "email": "${userProfile.email}",
      "phone": "${userProfile.phone}",
      "location": "${smartLocation}",
      "jobLocation": "${smartLocation}",
      "linkedin": "${userProfile.linkedin}",
      "github": "${userProfile.github}",
      "portfolio": "${userProfile.portfolio}"
    },
    "summary": "[PURE QUALIFICATIONS ONLY - Start with 'Experienced/Senior/Accomplished...' - ZERO contact info, names, emails, phones, or URLs - those are ALREADY in header above]",
    "coreCompetencies": ["Keyword Phrase 1", "Keyword Phrase 2", "Keyword Phrase 3", "Keyword Phrase 4", "Keyword Phrase 5", "Keyword Phrase 6"],
    "experience": [
      {
        "company": "[Company Name]",
        "title": "[Job Title]",
        "location": "[City, Country exactly as supplied in the profile]",
        "dates": "[Month YYYY - Month YYYY or Month YYYY - Present]",
        "bullets": ["bullet1 with metrics", "bullet2", "bullet3"]
      }
    ],
    "skills": {
      "primary": ${JSON.stringify([...jdKeywords.hardSkills, ...jdKeywords.tools])},
      "secondary": ${JSON.stringify(jdKeywords.softSkills)}
    },
    "certifications": ${JSON.stringify(userProfile.certifications || [])},
    "education": [
      {
        "degree": "[Degree Name]",
        "school": "[School Name]",
        "dates": "[Dates]",
        "gpa": "[GPA if applicable]"
      }
    ]
  },
  "metricsWorthAdding": ["<role> - <the exact bullet> → <the number that would strengthen it>"],
  "coverLetterStructured": {
    "recipientCompany": "${userProfile.portfolio || company}",
    "jobTitle": "${jobTitle}",
    "jobId": "${jobId || ""}",
    "paragraphs": ["para1", "para2", "para3", "para4"]
  },
  "suggestedImprovements": ["actionable suggestions"],
  "atsCompliance": {
    "formatValid": true,
    "keywordDensity": "${Math.round((matchResult.matched.length / jdKeywords.allKeywords.length) * 100)}%",
    "locationIncluded": true
  },
  "candidateName": "${candidateNameForFile}",
  "cvFileName": "${candidateNameForFile}_CV.pdf",
  "coverLetterFileName": "${candidateNameForFile}_Cover_Letter.pdf"${
    includeReferral
      ? `,
  "referralEmail": "[Subject + email body]"`
      : ""
  }
}`;

    // Retry logic with exponential backoff for rate limits
    const maxRetries = 3;
    let lastError: Error | null = null;
    let response: Response | null = null;

    // Determine API endpoint and model based on provider
    const getApiConfig = () => {
      if (aiProvider === "kimi") {
        return {
          endpoint: "https://api.moonshot.ai/v1/chat/completions",
          model: "kimi-k2-0711-preview",
          providerName: "Kimi K2",
          // SPEED: Optimized settings - restored maxTokens to prevent JSON truncation
          temperature: 0.4,    // Slightly higher for better output quality
          maxTokens: 3500,     // Restored - 2500 caused JSON truncation errors
          streamChunks: false,
        };
      }
      return {
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
        providerName: "OpenAI",
        temperature: 0.4,
        maxTokens: 3500,
        streamChunks: false,
      };
    };

    const apiConfig = getApiConfig();
    console.log(`Using ${apiConfig.providerName} with model ${apiConfig.model} (temp: ${apiConfig.temperature})`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.log(`Rate limit hit, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // Build request body with provider-specific optimizations
        const requestBody: any = {
          model: apiConfig.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: apiConfig.maxTokens,
          temperature: apiConfig.temperature,
        };

        // Kimi K2 HYPER SPEED optimizations
        if (aiProvider === "kimi") {
          // Aggressive penalties for faster completion
          requestBody.presence_penalty = 0.2;
          requestBody.frequency_penalty = 0.1;
          // Multiple stop tokens for faster termination
          requestBody.stop = ["\n\n\n", "---END---", "```\n\n", "}\n\n\n"];
        }

        response = await fetch(apiConfig.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          break; // Success, exit retry loop
        }

        if (response.status === 429) {
          // Rate limit - will retry
          const errorText = await response.text();
          console.warn(`${apiConfig.providerName} rate limit (attempt ${attempt + 1}):`, errorText);
          lastError = new Error("Rate limit exceeded");

          // Check for Retry-After header
          const retryAfter = response.headers.get("Retry-After");
          if (retryAfter && attempt < maxRetries - 1) {
            const waitTime = parseInt(retryAfter, 10) * 1000 || 2000;
            console.log(`Retry-After header suggests waiting ${waitTime}ms`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
          continue;
        }

        // Non-retryable errors
        const errorText = await response.text();
        console.error(`${apiConfig.providerName} API error:`, response.status, errorText);

        if (response.status === 401) {
          return new Response(
            JSON.stringify({
              error: `Invalid ${apiConfig.providerName} API key. Please check your API key in Profile settings.`,
            }),
            {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        if (response.status === 402 || response.status === 403) {
          return new Response(
            JSON.stringify({ error: `${apiConfig.providerName} API billing issue. Please check your account.` }),
            {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        throw new Error(`${apiConfig.providerName} API error: ${response.status}`);
      } catch (fetchError) {
        console.error(`Fetch error (attempt ${attempt + 1}):`, fetchError);
        lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
        if (attempt === maxRetries - 1) {
          throw lastError;
        }
      }
    }

    // If all retries exhausted due to rate limit
    if (!response || !response.ok) {
      return new Response(
        JSON.stringify({
          error: `${apiConfig.providerName} API temporarily unavailable. Your quota may be exceeded. Please check your billing and try again later.`,
          retryable: true,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const tokensUsed = data.usage?.total_tokens || 0;

    // Log API usage with provider suffix
    const usageFunctionName = aiProvider === "kimi" ? "tailor-application-kimi" : "tailor-application";
    await logApiUsage(supabase, userId, usageFunctionName, tokensUsed);

    console.log(`AI response received (${tokensUsed} tokens), parsing...`);

    let result;
    try {
      let cleanContent = content;
      if (content.includes("```json")) {
        cleanContent = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (content.includes("```")) {
        cleanContent = content.replace(/```\s*/g, "");
      }

      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(cleanContent);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw content:", content?.substring(0, 1000));

      // Fallback with pre-calculated values
      result = {
        tailoredResume: content || "Unable to generate tailored resume. Please try again.",
        tailoredCoverLetter: userProfile.coverLetter || "Unable to generate cover letter. Please try again.",
        matchScore: matchResult.score,
        keywordsMatched: matchResult.matched,
        keywordsMissing: matchResult.missing,
        smartLocation: smartLocation,
        suggestedImprovements: ["Please retry for better results"],
        candidateName: candidateNameForFile,
        cvFileName: `${candidateNameForFile}_CV.pdf`,
        coverLetterFileName: `${candidateNameForFile}_Cover_Letter.pdf`,
      };
    }

    // Apply content quality engine - remove banned buzzwords and improve natural language
    if (result.tailoredResume) {
      result.tailoredResume = applyContentQuality(result.tailoredResume);
    }
    if (result.tailoredCoverLetter) {
      result.tailoredCoverLetter = applyContentQuality(result.tailoredCoverLetter);
    }
    console.log("Content quality engine applied - banned words replaced");

    // Deterministic SELECTED PROJECTS injection - rebuild from structured profile data
    // so project names, tech stack, and URLs are preserved verbatim (anti-fabrication).
    if (result.tailoredResume && Array.isArray(userProfile.relevantProjects) && userProfile.relevantProjects.length > 0) {
      const buildProjectsSection = (projects: any[]): string => {
        const lines: string[] = ["PROJECTS", ""];
        for (const p of projects) {
          if (!p || typeof p !== "object") continue;
          const name = (p.name || "").toString().trim();
          if (!name) continue;
          lines.push(name);
          const techStack = Array.isArray(p.techStack)
            ? p.techStack.filter(Boolean).join(", ")
            : (p.techStack || "").toString().trim();
          if (techStack) lines.push(techStack);
          const bullets = Array.isArray(p.bullets) ? p.bullets : [];
          for (const b of bullets) {
            const t = (b || "").toString().trim();
            if (t) lines.push(`• ${t}`);
          }
          const live = (p.liveUrl || "").toString().trim();
          const code = (p.codeUrl || "").toString().trim();
          if (live || code) {
            const parts: string[] = [];
            if (live) parts.push(`Live demo: ${live}`);
            if (code) parts.push(`Code: ${code}`);
            lines.push(parts.join(" | "));
          }
          lines.push("");
        }
        return lines.join("\n").trimEnd();
      };

      const projectsBlock = buildProjectsSection(userProfile.relevantProjects);
      if (projectsBlock) {
        let resume = result.tailoredResume;
        // Strip ALL existing projects sections - case-insensitive and global, looping until no match remains.
        const sectionRegex = /^(SELECTED PROJECTS|RELEVANT PROJECTS|KEY PROJECTS|PROJECTS)\b[^\n]*\n[\s\S]*?(?=\n[A-Z][A-Z0-9 &\/\-]{2,}\n|$)/gim;
        while (sectionRegex.test(resume)) {
          resume = resume.replace(sectionRegex, "");
          // Reset lastIndex so the next global search starts from the top of the updated text
          sectionRegex.lastIndex = 0;
        }
        resume = resume.replace(/\n{3,}/g, "\n\n").trim();

        // Insert canonical block before EDUCATION, or append if EDUCATION is missing.
        const eduRegex = /^EDUCATION\b/m;
        if (eduRegex.test(resume)) {
          result.tailoredResume = resume.replace(eduRegex, projectsBlock + "\n\nEDUCATION");
        } else {
          result.tailoredResume = resume.trimEnd() + "\n\n" + projectsBlock + "\n";
        }
        console.log(`Injected PROJECTS section (${userProfile.relevantProjects.length} projects)`);
      }
    }


    // Ensure all required fields with our pre-calculated values
    result.candidateName = result.candidateName || candidateNameForFile;
    result.cvFileName = result.cvFileName || `${candidateNameForFile}_CV.pdf`;
    result.coverLetterFileName = result.coverLetterFileName || `${candidateNameForFile}_Cover_Letter.pdf`;
    result.company = company;
    result.jobTitle = jobTitle;
    result.jobId = jobId;
    result.smartLocation = smartLocation;

    // Recalculate ACTUAL match score based on generated resume content
    const generatedResumeText = (result.tailoredResume || "").toLowerCase();
    const generatedCoverText = (result.tailoredCoverLetter || "").toLowerCase();
    const combinedGeneratedText = `${generatedResumeText} ${generatedCoverText}`;

    // Count how many JD keywords appear in the generated content
    const actualMatched: string[] = [];
    const actualMissing: string[] = [];

    for (const keyword of jdKeywords.allKeywords) {
      const keywordLower = keyword.toLowerCase();
      // Check for exact or partial match
      if (
        combinedGeneratedText.includes(keywordLower) ||
        combinedGeneratedText.includes(keywordLower.replace(/[.\-\/]/g, " ")) ||
        combinedGeneratedText.includes(keywordLower.replace(/\s+/g, ""))
      ) {
        actualMatched.push(keyword);
      } else {
        actualMissing.push(keyword);
      }
    }

    // Calculate actual score from generated content
    const actualScore =
      jdKeywords.allKeywords.length > 0
        ? Math.round((actualMatched.length / jdKeywords.allKeywords.length) * 100)
        : matchResult.score;

    console.log(
      `ACTUAL match score from generated content: ${actualScore}% (${actualMatched.length}/${jdKeywords.allKeywords.length} keywords)`,
    );
    if (actualMissing.length > 0) {
      console.log(
        `Still missing keywords: ${actualMissing.slice(0, 10).join(", ")}${actualMissing.length > 10 ? "..." : ""}`,
      );
    }

    // ==========================================
    // POST-GENERATION KEYWORD FORCE-INJECTION
    // If keywords are still missing after AI generation, programmatically inject them
    // Separate strategy for single-word vs multi-word phrases
    // ==========================================
    if (actualMissing.length > 0 && result.tailoredResume) {
      console.log(`[FORCE-INJECT] ${actualMissing.length} keywords still missing after AI generation. Injecting...`);

      let resume = result.tailoredResume;

      // A KEYWORD THAT FITS NOWHERE TRUTHFULLY GOES IN THE SKILLS LIST,
      // NOT INTO A MANUFACTURED ACHIEVEMENT.
      //
      // STRATEGY A used to append a whole new bullet to the most recent
      // role whenever a multi-word phrase had no home, reading:
      //
      //   "- Leveraged programming skills to implement tools and scripts
      //    that troubleshoot issues, resolve issues, and improve
      //    efficiency across development workflows, demonstrating strong
      //    collaboration skills in cross-functional team settings."
      //
      // That is a fabricated accomplishment. It claims work the
      // candidate never described, in the exact register a reviewer
      // reads as machine-written, and it lands under the most recent
      // role -- among the first three bullets, the part that actually
      // gets read. It cannot survive an interview either, because there
      // is no story behind it.
      //
      // Both the extension and this function did the same thing, so a
      // single CV could collect two of them. Every unplaceable keyword
      // now routes to the skills list, which captures the same terms
      // honestly, and RULE 2's evidence gate governs what may be woven
      // into a real bullet.
      const singleWordMissing = actualMissing.slice();

      // STRATEGY B: Inject single-word keywords into existing TECHNICAL PROFICIENCIES / SKILLS section
      const toInjectSingles = singleWordMissing;
      if (toInjectSingles.length > 0) {
        // The trailing section is optional. These used to require the
        // skills section to be FOLLOWED by CERTIFICATIONS/EDUCATION/etc,
        // so a CV whose skills list was the last thing on the page did
        // not match, and Strategy 2 below then appended a SECOND
        // TECHNICAL PROFICIENCIES heading to a document that already had
        // one.
        const TAIL = "(\\n\\s*(?:CERTIFICATIONS|EDUCATION|ACHIEVEMENTS|PROJECTS|REFERENCES)\\b|$)";
        const skillsSectionPatterns = [
          new RegExp("(TECHNICAL\\s+PROFICIENCIES\\s*[:\\n])([\\s\\S]*?)" + TAIL, "i"),
          new RegExp("(TECHNICAL\\s+SKILLS\\s*[:\\n])([\\s\\S]*?)" + TAIL, "i"),
          new RegExp("(SKILLS\\s*[:\\n])([\\s\\S]*?)" + TAIL, "i"),
        ];

        // "Did we add anything" and "does a section already exist" are
        // two different questions. Conflating them meant that when the
        // section was found but already contained every missing keyword,
        // this fell through to Strategy 2 and created a duplicate
        // heading for a section that was sitting right there.
        let injected = false;
        let sectionFound = false;
        for (const pattern of skillsSectionPatterns) {
          const match = resume.match(pattern);
          if (match) {
            sectionFound = true;
            const sectionHeader = match[1];
            const sectionContent = match[2];
            const nextSection = match[3];

            const sectionLower = sectionContent.toLowerCase();
            const toInject = toInjectSingles.filter(kw => !sectionLower.includes(kw.toLowerCase()));

            if (toInject.length > 0) {
              const existingTrimmed = sectionContent.trimEnd();
              const separator = existingTrimmed.endsWith(",") ? " " : ", ";
              const injectedContent = `${existingTrimmed}${separator}${toInject.join(", ")}`;
              resume = resume.replace(match[0], `${sectionHeader}${injectedContent}${nextSection}`);
              console.log(`[FORCE-INJECT] Injected ${toInject.length} single keywords into skills section`);
              injected = true;
            }
            break;
          }
        }

        // Strategy 2: If no skills section found, append one before Certifications/Education
        if (!sectionFound && !injected && toInjectSingles.length > 0) {
          const insertBeforePatterns = [
            /(\n\s*CERTIFICATIONS\b)/i,
            /(\n\s*EDUCATION\b)/i,
            /(\n\s*ACHIEVEMENTS\b)/i,
          ];

          for (const pattern of insertBeforePatterns) {
            const match = resume.match(pattern);
            if (match && match.index !== undefined) {
              const newSection = `\n\nTECHNICAL SKILLS\n${toInjectSingles.join(", ")}\n`;
              resume = resume.substring(0, match.index) + newSection + resume.substring(match.index);
              console.log(`[FORCE-INJECT] Created new Technical Proficiencies section with ${toInjectSingles.length} keywords`);
              injected = true;
              break;
            }
          }

          if (!injected) {
            resume += `\n\nTECHNICAL SKILLS\n${toInjectSingles.join(", ")}\n`;
            console.log(`[FORCE-INJECT] Appended Technical Proficiencies section at end`);
          }
        }
      }

      result.tailoredResume = resume;

      // Also inject into structured skills if available
      if (result.resumeStructured?.skills) {
        const existingPrimary = Array.isArray(result.resumeStructured.skills.primary) ? result.resumeStructured.skills.primary : [];
        const existingPrimaryLower = existingPrimary.map((s: string) => s.toLowerCase());
        const newSkills = actualMissing.filter(kw => !existingPrimaryLower.includes(kw.toLowerCase()));
        result.resumeStructured.skills.primary = [...existingPrimary, ...newSkills];
        console.log(`[FORCE-INJECT] Added ${newSkills.length} keywords to structured skills`);
      }

      // Recalculate match score after injection
      const postInjectText = `${result.tailoredResume.toLowerCase()} ${(result.tailoredCoverLetter || "").toLowerCase()}`;
      const finalMatched: string[] = [];
      const finalMissing: string[] = [];

      for (const keyword of jdKeywords.allKeywords) {
        const keywordLower = keyword.toLowerCase();
        if (
          postInjectText.includes(keywordLower) ||
          postInjectText.includes(keywordLower.replace(/[.\-\/]/g, " ")) ||
          postInjectText.includes(keywordLower.replace(/\s+/g, ""))
        ) {
          finalMatched.push(keyword);
        } else {
          finalMissing.push(keyword);
        }
      }

      const finalScore = jdKeywords.allKeywords.length > 0
        ? Math.round((finalMatched.length / jdKeywords.allKeywords.length) * 100)
        : actualScore;

      console.log(`[FORCE-INJECT] Final match score: ${finalScore}% (${finalMatched.length}/${jdKeywords.allKeywords.length}) - was ${actualScore}%`);
      if (finalMissing.length > 0) {
        console.log(`[FORCE-INJECT] Remaining unmatched (${finalMissing.length}): ${finalMissing.join(", ")}`);
      }

      actualMatched.length = 0;
      actualMatched.push(...finalMatched);
      actualMissing.length = 0;
      actualMissing.push(...finalMissing);
      result.matchScore = finalScore;
      result.forceInjectedCount = finalMatched.length - (jdKeywords.allKeywords.length - actualMissing.length - finalMissing.length);
    }

    // Use actual calculated score
    result.matchScore = result.matchScore || actualScore;
    result.keywordsMatched = actualMatched;
    result.keywordsMissing = actualMissing;
    result.matchedKeywords = actualMatched; // Alias for extension compatibility
    result.missingKeywords = actualMissing; // Alias for extension compatibility
    result.keywordAnalysis = result.keywordAnalysis || {
      hardSkills: jdKeywords.hardSkills,
      softSkills: jdKeywords.softSkills,
      tools: jdKeywords.tools,
      titles: jdKeywords.titles,
    };
    result.keywordPriorities = weightedKeywords;
    result.coverLetterTone = coverLetterTone;

    // Validate resume and cover letter
    if (!result.tailoredResume || result.tailoredResume.length < 100) {
      console.error("Resume content missing or too short");
      result.resumeGenerationStatus = "failed";
    } else {
      result.resumeGenerationStatus = "success";
    }

    if (!result.tailoredCoverLetter || result.tailoredCoverLetter.length < 100) {
      console.error("Cover letter content missing or too short");
      result.coverLetterGenerationStatus = "failed";
    } else {
      result.coverLetterGenerationStatus = "success";
    }

    console.log(
      `Successfully tailored application. Match score: ${result.matchScore}, Resume: ${result.resumeGenerationStatus}, Cover Letter: ${result.coverLetterGenerationStatus}`,
    );

    // --- Generate PDFs (server-side) so the extension only needs 1 backend call per job ---
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const authHeader = req.headers.get("authorization") || "";

      const candidateName = `${userProfile.firstName} ${userProfile.lastName}`.trim() || "Applicant";
      // File naming: [FirstName]_[LastName]_CV.pdf and [FirstName]_[LastName]_Cover_Letter.pdf
      const candidateNameForFile =
        `${userProfile.firstName.trim()}_${userProfile.lastName.trim()}`
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9_]/g, "") || "Applicant";

      const resumeFileName = `${candidateNameForFile}_CV.pdf`;
      const coverFileName = `${candidateNameForFile}_Cover_Letter.pdf`;

      const extractProfessionalSummary = (raw: string, structuredSummary?: string): string => {
        // PRIORITY 1: Use structured summary from AI response if available (most reliable)
        if (structuredSummary && structuredSummary.trim().length > 30) {
          console.log(`[extractProfessionalSummary] Using structured summary (${structuredSummary.length} chars)`);
          return structuredSummary.substring(0, 700).trim();
        }
        
        const text = String(raw || "");
        if (!text || text.length < 50) {
          console.log("[extractProfessionalSummary] No raw text available, no summary extracted");
          return "";
        }

        // PRIORITY 2: Try to extract from raw resume text
        // Try multiple patterns to find the Professional Summary section
        const summaryPatterns = [
          /\bPROFESSIONAL\s+SUMMARY\b\s*:?\s*([\s\S]*?)(?=\n\s*(?:WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|ACHIEVEMENTS|TECHNICAL\s+SKILLS)\b)/i,
          /\bSUMMARY\b\s*:?\s*([\s\S]*?)(?=\n\s*(?:WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|ACHIEVEMENTS)\b)/i,
          /\bPROFILE\b\s*:?\s*([\s\S]*?)(?=\n\s*(?:WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|ACHIEVEMENTS)\b)/i,
          /\bABOUT\b\s*:?\s*([\s\S]*?)(?=\n\s*(?:WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|ACHIEVEMENTS)\b)/i,
        ];

        let summary = "";
        for (const pattern of summaryPatterns) {
          const match = text.match(pattern);
          if (match?.[1] && match[1].trim().length > 30) {
            summary = match[1].trim();
            console.log(`[extractProfessionalSummary] Found via pattern, length: ${summary.length}`);
            break;
          }
        }

        // If no section found, summary remains empty (don't use full resume text)
        if (!summary || summary.length < 30) {
          console.log("[extractProfessionalSummary] No summary section found in raw text");
          return "";
        }

        // Remove common header duplication lines (pipes, contact info, urls)
        const removeParts = [
          candidateName,
          userProfile.email,
          userProfile.phone,
          userProfile.linkedin,
          userProfile.github,
          userProfile.portfolio,
          smartLocation,
          userProfile.city,
          userProfile.country,
        ]
          .filter(Boolean)
          .map((s) => String(s));

        const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const removeRegex = removeParts.length ? new RegExp(removeParts.map(escaped).join("|"), "gi") : null;

        summary = summary
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .filter((l) => {
            if (/\|/.test(l) && (l.includes("http") || l.includes("@") || /\+?\d{6,}/.test(l))) return false;
            if (removeRegex && removeRegex.test(l)) {
              // Keep lines that still have substantive content after removing personal info
              const cleaned = l.replace(removeRegex, "").replace(/\s+/g, " ").trim();
              return cleaned.length >= 20;
            }
            return true;
          })
          .join(" ")
          .replace(/\s+/g, " ")
          .replace(/^PROFESSIONAL\s+SUMMARY\s*:?\s*/i, "")
          .replace(/^SUMMARY\s*:?\s*/i, "")
          .replace(/^PROFILE\s*:?\s*/i, "")
          .trim();

        // Hard cap for PDF wrapping
        const finalSummary = summary.substring(0, 700).trim();
        console.log(`[extractProfessionalSummary] Final summary length: ${finalSummary.length}`);
        return finalSummary;
      };

      const skills = Array.isArray(userProfile.skills) ? userProfile.skills : [];
      const primarySkills = Array.isArray(skills)
        ? skills.filter(
            (s: any) => s?.category === "technical" || s?.proficiency === "expert" || s?.proficiency === "advanced",
          )
        : [];
      const secondarySkills = Array.isArray(skills)
        ? skills.filter(
            (s: any) => s?.category !== "technical" && s?.proficiency !== "expert" && s?.proficiency !== "advanced",
          )
        : [];

      const resumePayload = {
        type: "resume",
        candidateName: candidateNameForFile,
        customFileName: resumeFileName,
        personalInfo: {
          name: candidateName,
          email: userProfile.email,
          phone: userProfile.phone,
          location: smartLocation,
          linkedin: userProfile.linkedin,
          github: userProfile.github,
          portfolio: userProfile.portfolio,
        },
        summary: extractProfessionalSummary(result.tailoredResume || "", result.resumeStructured?.summary),
        coreCompetencies: Array.isArray(result.resumeStructured?.coreCompetencies) ? result.resumeStructured.coreCompetencies : [],
        experience: (Array.isArray(userProfile.professionalExperience) ? userProfile.professionalExperience : []).map((exp: any) => ({
          company: exp?.company || "",
          title: exp?.title || "",
          location:
            exp?.location || exp?.role_location || exp?.city || exp?.job_location || exp?.work_location || exp?.based_in || "",
          dates:
            exp?.dates || formatDateRangeATS(exp?.startDate || exp?.start_date, exp?.endDate || exp?.end_date, "Present"),
          // PRIORITY: Use 'bullets' array first (clean structured data), fallback to 'description'
          bullets:
            Array.isArray(exp?.bullets) && exp.bullets.length > 0
              ? exp.bullets
              : Array.isArray(exp?.description)
                ? exp.description
                : typeof exp?.description === "string"
                  ? exp.description
                      .split("\n")
                      .map((b: string) => b.replace(/^[▪•\-*]\s*/, "").trim())
                      .filter((b: string) => b)
                  : [],
        })),
        education: (Array.isArray(userProfile.education) ? userProfile.education : []).map((edu: any) => ({
          degree: edu?.degree || "",
          school: edu?.school || edu?.institution || "",
          dates: edu?.dates || formatDateRangeATS(edu?.startDate, edu?.endDate),
          gpa: edu?.gpa || "",
        })),
        skills: {
          primary: primarySkills.map((s: any) => s?.name || s).filter(Boolean),
          secondary: secondarySkills.map((s: any) => s?.name || s).filter(Boolean),
        },
        certifications: Array.isArray(userProfile.certifications) ? userProfile.certifications : [],
        achievements: (Array.isArray(userProfile.achievements) ? userProfile.achievements : []).map((a: any) => ({
          title: a?.title || "",
          date: a?.date || "",
          description: a?.description || "",
        })),
      };

      // Clean the cover letter text - remove AI-generated headers/footers that duplicate our PDF formatting
      let coverText = result.tailoredCoverLetter || "";

      // Remove common AI-generated letter headers that we add ourselves in the PDF
      const cleanPatterns = [
        // Remove name/email/phone/date headers at the start
        /^[\s\S]*?Dear\s+(Hiring|Recruitment|HR|Team|Manager|Manager)/i,
        // Keep "Dear..." but remove everything before it
        /^[^\n]*\n[^\n]*\n[^\n]*\nDear/i,
      ];

      // Find where the actual letter body starts (after "Dear...")
      const dearMatch = coverText.match(/Dear\s+(?:Hiring|Recruitment|HR|Team|Manager|Manager)[^,]*,?\s*\n/i);
      if (dearMatch && dearMatch.index !== undefined) {
        // Extract only the body after the salutation
        coverText = coverText.substring(dearMatch.index + dearMatch[0].length);
      }

      // Remove closing signatures - we add these ourselves
      coverText = coverText
        .replace(
          /\n\s*(Sincerely|Best regards|Kind regards|Regards|Warmly|Respectfully|Thank you)[,]?\s*\n[\s\S]*$/i,
          "",
        )
        .replace(/\n\s*(Sincerely|Best regards|Kind regards|Regards|Warmly|Respectfully|Thank you)[,]?\s*$/i, "")
        .trim();

      // Split into paragraphs, filtering out very short ones and duplicate-looking content
      const rawParagraphs = coverText.split(/\n\n+/).map((p: string) => p.trim());
      const paragraphs = rawParagraphs.filter((p: string) => {
        // Skip very short paragraphs
        if (p.length < 30) return false;
        // Skip paragraphs that look like headers/signatures
        if (/^(sincerely|regards|thank you|dear|date:|re:|subject:)/i.test(p)) return false;
        // Skip lines that are just a name or contact info
        if (p.split(/\s+/).length <= 3 && !p.includes(".")) return false;
        return true;
      });

      const coverPayload = {
        type: "cover_letter",
        candidateName: candidateNameForFile,
        customFileName: coverFileName,
        personalInfo: {
          name: candidateName,
          email: userProfile.email,
          phone: userProfile.phone,
          location: smartLocation,
          linkedin: userProfile.linkedin,
          github: userProfile.github,
          portfolio: userProfile.portfolio,
        },
        coverLetter: {
          recipientCompany: company || "",
          jobTitle: jobTitle || "Position",
          jobId: jobId || "",
          paragraphs: paragraphs.length ? paragraphs : [coverText.trim()],
        },
      };

      const generatePdf = async (payload: any): Promise<{ pdf: string | null; fileName: string }> => {
        const pdfRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseAnonKey,
            authorization: authHeader,
          },
          body: JSON.stringify(payload),
        });

        if (!pdfRes.ok) {
          const t = await pdfRes.text();
          console.error(`generate-pdf failed: ${pdfRes.status} ${t}`);
          return { pdf: null, fileName: payload.customFileName || "document.pdf" };
        }

        // The generate-pdf function returns binary PDF data, not JSON
        // We need to convert the binary response to base64
        const contentType = pdfRes.headers.get("content-type") || "";
        const contentDisposition = pdfRes.headers.get("content-disposition") || "";

        // Extract filename from Content-Disposition header
        let fileName = payload.customFileName || "document.pdf";
        const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
        if (filenameMatch) {
          fileName = filenameMatch[1];
        }

        if (contentType.includes("application/pdf")) {
          // Binary PDF response - convert to base64
          const arrayBuffer = await pdfRes.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // Convert to base64
          let binary = "";
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);

          console.log(`PDF generated successfully: ${fileName}, size: ${uint8Array.length} bytes`);
          return { pdf: base64, fileName };
        } else {
          // Unexpected response type
          console.error(`Unexpected response type from generate-pdf: ${contentType}`);
          return { pdf: null, fileName };
        }
      };

      const [resumePdfResult, coverPdfResult] = await Promise.all([
        generatePdf(resumePayload),
        generatePdf(coverPayload),
      ]);

      result.resumePdf = resumePdfResult.pdf;
      result.coverLetterPdf = coverPdfResult.pdf;
      result.resumePdfFileName = resumePdfResult.fileName;
      result.coverLetterPdfFileName = coverPdfResult.fileName;
      
      // CRITICAL: Include the extracted summary in the result for extension fallback
      // This ensures the extension can pass it to generate-pdf if downloading separately
      result.professionalSummary = resumePayload.summary;
      result.extractedSummary = resumePayload.summary; // Alias for backward compatibility

      console.log(
        `PDFs generated - Resume: ${result.resumePdf ? "success" : "failed"}, Cover: ${result.coverLetterPdf ? "success" : "failed"}, Summary: ${resumePayload.summary ? resumePayload.summary.length + " chars" : "missing"}`,
      );
    } catch (pdfErr) {
      console.error("PDF generation (inline) failed:", pdfErr);
      result.resumePdf = null;
      result.coverLetterPdf = null;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Tailor application error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage === "Unauthorized: Invalid or expired token") {
      return new Response(JSON.stringify({ error: "Please log in to continue" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
