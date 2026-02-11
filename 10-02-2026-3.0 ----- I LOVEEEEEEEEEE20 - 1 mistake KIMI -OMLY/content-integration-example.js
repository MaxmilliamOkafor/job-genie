/**
 * Content.js Integration Example for ATS Location Extractor v3.0
 * ==============================================================
 * 
 * This file shows how to integrate the new ATS Location Extractor
 * into your existing content.js file for 100% ATS-compliant
 * location extraction.
 * 
 * Copy the relevant parts into your actual content.js file.
 */

// ============ INTEGRATION POINT 1: Replace Location Extraction ============

/**
 * NEW: Get formatted location for CV header using ATS Location Extractor
 * @param {string} jobLocation - Raw location from job posting
 * @param {string} profileLocation - User's default location (fallback)
 * @returns {Promise<string>} - Formatted location: "City, ISO2" or "City, STATE, US"
 */
async function getFormattedLocation(jobLocation, profileLocation = 'Dublin, IE') {
  // Ensure the ATS Location Extractor is available
  if (typeof ATSLocationExtractor === 'undefined') {
    console.warn('[ATS Location] Extractor not loaded, using fallback');
    return profileLocation;
  }
  
  // Ensure database is loaded
  if (!ATSLocationExtractor.isDatabaseLoaded()) {
    console.log('[ATS Location] Loading city database...');
    await ATSLocationExtractor.loadCityDatabase();
  }
  
  // Extract and format location
  const formattedLocation = await ATSLocationExtractor.extractLocation(
    jobLocation,
    profileLocation
  );
  
  console.log('[ATS Location] Extracted:', jobLocation, '→', formattedLocation);
  return formattedLocation;
}

// ============ INTEGRATION POINT 2: Update CV Generation ============

/**
 * NEW: Generate CV header with properly formatted location
 * @param {Object} profile - User profile data
 * @param {Object} jobInfo - Job information including location
 * @returns {Promise<string>} - Formatted CV header
 */
async function generateCVHeader(profile, jobInfo) {
  // Extract location using the new extractor
  const location = await getFormattedLocation(
    jobInfo.location,
    profile.location || 'Dublin, IE'
  );
  
  // Build CV header
  const parts = [
    profile.fullName,
    location,
    profile.title
  ].filter(Boolean);
  
  return parts.join(' | ');
}

// ============ INTEGRATION POINT 3: Update Job Info Extraction ============

/**
 * NEW: Extract job info with formatted location
 * @returns {Promise<Object>} - Job information with formatted location
 */
async function extractJobInfoWithLocation() {
  // Get raw job info (your existing function)
  const jobInfo = extractJobInfo(); // Your existing function
  
  // Format the location
  const formattedLocation = await getFormattedLocation(
    jobInfo.location,
    'Dublin, IE' // Default fallback
  );
  
  return {
    ...jobInfo,
    location: formattedLocation,
    rawLocation: jobInfo.location // Keep original for reference
  };
}

// ============ INTEGRATION POINT 4: Update Tailoring Flow ============

/**
 * NEW: Main tailoring flow with location extraction
 */
async function runTailoringFlow() {
  console.log('[ATS Tailor] Starting tailoring flow with location extraction...');
  
  try {
    // Extract job info with formatted location
    const jobInfo = await extractJobInfoWithLocation();
    console.log('[ATS Tailor] Job location:', jobInfo.location);
    
    // Get user profile
    const profile = await getUserProfile(); // Your existing function
    
    // Generate CV header
    const cvHeader = await generateCVHeader(profile, jobInfo);
    console.log('[ATS Tailor] CV Header:', cvHeader);
    
    // Continue with rest of tailoring...
    // ... your existing code ...
    
  } catch (error) {
    console.error('[ATS Tailor] Error in tailoring flow:', error);
  }
}

// ============ INTEGRATION POINT 5: Update Universal Location Strategy ============

/**
 * NEW: Enhanced location scraping with fallback to ATS Extractor
 */
async function scrapeLocationWithFallback() {
  // Try existing scraper first
  let location = scrapeUniversalLocation(); // Your existing function
  
  // If location found, format it
  if (location && location !== 'Remote') {
    const formatted = await getFormattedLocation(location, 'Dublin, IE');
    return formatted;
  }
  
  // If Remote or empty, use fallback
  return 'Dublin, IE';
}

// ============ INTEGRATION POINT 6: Update CV Formatter ============

/**
 * NEW: Format CV with proper location
 * @param {Object} profile - User profile
 * @param {Object} jobInfo - Job information
 * @returns {Promise<Object>} - Formatted CV data
 */
async function formatCVWithLocation(profile, jobInfo) {
  // Format location
  const location = await getFormattedLocation(
    jobInfo.location,
    profile.location || 'Dublin, IE'
  );
  
  return {
    header: {
      name: profile.fullName,
      location: location,
      title: profile.title,
      email: profile.email,
      phone: profile.phone,
      linkedin: profile.linkedin
    },
    summary: profile.summary,
    experience: profile.experience,
    education: profile.education,
    skills: profile.skills
  };
}

// ============ INTEGRATION POINT 7: Quick Test Function ============

/**
 * Test the location extraction with sample inputs
 */
async function testLocationExtraction() {
  const testCases = [
    { input: 'Watford', expected: 'Watford, GB' },
    { input: 'Secundrabad', expected: 'Secunderabad, IN' },
    { input: 'Remote - Dublin', expected: 'Dublin, IE' },
    { input: 'Rock Hill, SC', expected: 'Rock Hill, SC, US' },
    { input: 'Germany', expected: 'Berlin, DE' },
    { input: 'Remote', expected: 'Dublin, IE' }
  ];
  
  console.log('\n🧪 Testing Location Extraction:\n');
  
  for (const test of testCases) {
    const result = await getFormattedLocation(test.input, 'Dublin, IE');
    const status = result === test.expected ? '✅' : '❌';
    console.log(`${status} "${test.input}" → "${result}"`);
    if (result !== test.expected) {
      console.log(`   Expected: "${test.expected}"`);
    }
  }
}

// Run test on load (for debugging)
// testLocationExtraction();

// ============ EXPORT FOR USE IN OTHER FILES ============

if (typeof window !== 'undefined') {
  window.getFormattedLocation = getFormattedLocation;
  window.generateCVHeader = generateCVHeader;
  window.extractJobInfoWithLocation = extractJobInfoWithLocation;
  window.testLocationExtraction = testLocationExtraction;
}

// Console instructions
console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ATS Location Extractor v3.0 - Integration Loaded            ║
╠══════════════════════════════════════════════════════════════╣
║  Available functions:                                        ║
║    • getFormattedLocation(jobLocation, profileLocation)      ║
║    • generateCVHeader(profile, jobInfo)                      ║
║    • extractJobInfoWithLocation()                            ║
║    • testLocationExtraction()                                ║
╠══════════════════════════════════════════════════════════════╣
║  Test: testLocationExtraction()                              ║
╚══════════════════════════════════════════════════════════════╝
`);
