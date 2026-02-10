// ATS PERFECTION v3.0 - Ultimate CV Tailor Popup Script
// Features: Professional PDF Engine, Smart CV Parser, Cover Letter Generator
// Location Strategy, Enterprise CV Parser with Immutable Field Protection
// Auto-trigger on ATS detection, 100% keyword match

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

// ============ GLOBAL ERROR HANDLER: Prevent extension crashes ============
// Catches unhandled promise rejections that would otherwise crash the extension
window.addEventListener('unhandledrejection', (event) => {
  console.error('[ATS Tailor] Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent the error from crashing the extension
  
  // Show user-friendly error message
  const errorMessage = event.reason?.message || 'An unexpected error occurred';
  if (window.atsTailor?.showToast) {
    window.atsTailor.showToast(`Error: ${errorMessage.substring(0, 100)}`, 'error');
  }
});

// Global error handler for synchronous errors
window.addEventListener('error', (event) => {
  console.error('[ATS Tailor] Unhandled error:', event.error);
  // Don't prevent default for these - let them be logged
});

// ============ PERFECTION v3.0: IMMUTABILITY VALIDATION ============
// Ensures company names, job titles, and dates are NEVER modified by AI
function validateWorkExperienceImmutability(originalExperience, tailoredExperience) {
  if (!Array.isArray(originalExperience) || !Array.isArray(tailoredExperience)) {
    console.warn('[PERFECTION] Cannot validate: invalid experience arrays');
    return tailoredExperience;
  }

  return tailoredExperience.map((tailoredExp, index) => {
    const originalExp = originalExperience[index];
    if (!originalExp) return tailoredExp;

    // Force original values for IMMUTABLE fields
    const origCompany = originalExp.company || originalExp.companyName || '';
    const origTitle = originalExp.title || originalExp.jobTitle || originalExp.position || '';
    const origDates = originalExp.dates || originalExp.date || 
                      `${originalExp.startDate || ''} – ${originalExp.endDate || 'Present'}`;

    const result = {
      ...tailoredExp,
      company: origCompany,     // ← LOCKED FROM ORIGINAL PROFILE
      companyName: origCompany, // ← LOCKED FROM ORIGINAL PROFILE
      title: origTitle,         // ← LOCKED FROM ORIGINAL PROFILE
      jobTitle: origTitle,      // ← LOCKED FROM ORIGINAL PROFILE
      position: origTitle,      // ← LOCKED FROM ORIGINAL PROFILE
      dates: origDates,         // ← LOCKED FROM ORIGINAL PROFILE
      date: origDates,          // ← LOCKED FROM ORIGINAL PROFILE
      startDate: originalExp.startDate || tailoredExp.startDate,
      endDate: originalExp.endDate || tailoredExp.endDate,
      // Keep tailored bullets/achievements
      bullets: tailoredExp.bullets || tailoredExp.achievements || tailoredExp.description || originalExp.bullets || [],
      achievements: tailoredExp.achievements || tailoredExp.bullets || originalExp.achievements || []
    };

    // Log any detected changes for debugging
    if (tailoredExp.company !== origCompany || tailoredExp.title !== origTitle) {
      console.warn(`[PERFECTION] ⚠️ Immutable field override at index ${index}:`, {
        originalCompany: origCompany,
        attemptedCompany: tailoredExp.company,
        originalTitle: origTitle,
        attemptedTitle: tailoredExp.title
      });
    }

    return result;
  });
}

console.log('[ATS PERFECTION] v3.0 loaded with immutable field protection');