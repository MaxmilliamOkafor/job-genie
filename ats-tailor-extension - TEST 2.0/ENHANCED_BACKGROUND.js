// Enhanced Background Script for ATS Tailor v3.0
// Service worker for PDF generation and profile management
// Profile-only approach - NO fallbacks

'use strict';

console.log('[EnhancedBackground] v3.0 Service Worker Loaded');

// ============ STATE MANAGEMENT ============
const pdfGenerationQueue = new Map();
const sessionCache = new Map();

// ============ CONFIGURATION ============
const CONFIG = {
  SUPABASE_URL: 'https://wntpldomgjutwufphnpg.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM',
  DEFAULT_LOCATION: 'Dublin, IE'
};

// ============ MESSAGE HANDLING ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep message channel open for async response
});

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {
      case 'GENERATE_ENHANCED_CV':
        await handleGenerateCV(message, sender, sendResponse);
        break;
        
      case 'PARSE_JOB_DESCRIPTION':
        await handleParseJobDescription(message, sender, sendResponse);
        break;
        
      case 'CALCULATE_MATCH_SCORE':
        await handleCalculateMatchScore(message, sender, sendResponse);
        break;
        
      case 'TAILOR_CV':
        await handleTailorCV(message, sender, sendResponse);
        break;
        
      case 'GET_PDF_STATUS':
        await handleGetPDFStatus(message, sender, sendResponse);
        break;
        
      case 'CANCEL_PDF_GENERATION':
        await handleCancelPDFGeneration(message, sender, sendResponse);
        break;
        
      case 'CACHE_PROFILE_DATA':
        await handleCacheProfileData(message, sender, sendResponse);
        break;
        
      case 'GET_CACHED_DATA':
        await handleGetCachedData(message, sender, sendResponse);
        break;
        
      case 'FETCH_PROFILE':
        await handleFetchProfile(message, sender, sendResponse);
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('[EnhancedBackground] Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ============ PROFILE FETCHING ============
async function handleFetchProfile(message, sender, sendResponse) {
  try {
    const { accessToken, userId } = message;
    
    if (!accessToken || !userId) {
      sendResponse({ success: false, error: 'Missing authentication' });
      return;
    }
    
    const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=*`, {
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch profile: ${response.status}`);
    }
    
    const profiles = await response.json();
    const profile = profiles[0] || null;
    
    if (!profile) {
      sendResponse({ success: false, error: 'Profile not found' });
      return;
    }
    
    // Normalize profile data
    const normalizedProfile = {
      firstName: profile.first_name || '',
      lastName: profile.last_name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      city: profile.city || CONFIG.DEFAULT_LOCATION,
      country: profile.country || '',
      linkedin: profile.linkedin || '',
      github: profile.github || '',
      portfolio: profile.portfolio || '',
      summary: profile.ats_strategy || profile.cover_letter || '',
      work_experience: Array.isArray(profile.work_experience) ? profile.work_experience : [],
      relevant_projects: Array.isArray(profile.relevant_projects) ? profile.relevant_projects : [],
      education: Array.isArray(profile.education) ? profile.education : [],
      skills: extractSkillsArray(profile.skills),
      certifications: Array.isArray(profile.certifications) ? profile.certifications : []
    };
    
    sendResponse({ success: true, profile: normalizedProfile });
    
  } catch (error) {
    console.error('[EnhancedBackground] Fetch profile failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function extractSkillsArray(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  if (typeof skills === 'object') {
    // Handle grouped skills format
    const allSkills = [];
    Object.values(skills).forEach(group => {
      if (Array.isArray(group)) {
        allSkills.push(...group);
      } else if (typeof group === 'string') {
        allSkills.push(group);
      }
    });
    return allSkills;
  }
  return [];
}

// ============ CV GENERATION ============
async function handleGenerateCV(message, sender, sendResponse) {
  const { profileData, jobInfo, options = {} } = message;
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  try {
    // Add to queue
    pdfGenerationQueue.set(requestId, {
      status: 'processing',
      startTime: Date.now(),
      profileData,
      jobInfo
    });

    // Parse profile data into CV structure
    const cvData = parseProfile(profileData);
    
    // Extract job keywords if jobInfo provided
    let jobKeywords = [];
    if (jobInfo && jobInfo.description) {
      jobKeywords = extractKeywords(jobInfo.description, 25);
    }

    // Tailor CV if keywords available
    let finalCVData = cvData;
    if (jobKeywords.length > 0) {
      finalCVData = tailorCV(cvData, jobKeywords, jobInfo);
    }

    // Generate HTML
    const htmlContent = generateCVHTML(finalCVData, jobInfo);
    
    // Calculate match score
    const matchScore = jobKeywords.length > 0 ? 
      calculateMatchScore(cvToText(finalCVData), jobKeywords) : 0;
    
    // Store for content script to retrieve
    await chrome.storage.local.set({
      [`cv_html_${requestId}`]: htmlContent,
      [`cv_data_${requestId}`]: finalCVData,
      [`job_keywords_${requestId}`]: jobKeywords
    });

    const parseTime = performance.now() - startTime;
    console.log(`[EnhancedBackground] CV generated in ${parseTime.toFixed(2)}ms`);

    // Update queue status
    pdfGenerationQueue.set(requestId, {
      status: 'html_ready',
      htmlContent,
      cvData: finalCVData,
      jobKeywords,
      parseTime
    });

    sendResponse({
      success: true,
      requestId,
      status: 'html_ready',
      cvData: finalCVData,
      jobKeywords,
      matchScore,
      parseTime: parseTime.toFixed(2)
    });

  } catch (error) {
    pdfGenerationQueue.set(requestId, { status: 'error', error: error.message });
    sendResponse({ success: false, error: error.message });
  }
}

// ============ ULTRA-FAST PROFILE PARSING (<50ms) ============
function parseProfile(profileData) {
  const startTime = performance.now();
  
  const cvStructure = {
    header: {
      name: `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim(),
      email: profileData.email || '',
      phone: formatPhone(profileData.phone || ''),
      location: profileData.city || CONFIG.DEFAULT_LOCATION,
      linkedin: profileData.linkedin || '',
      github: profileData.github || '',
      portfolio: profileData.portfolio || ''
    },
    summary: profileData.summary || profileData.ats_strategy || '',
    experience: parseExperience(profileData.work_experience || []),
    projects: parseProjects(profileData.relevant_projects || []),
    education: parseEducation(profileData.education || []),
    skills: parseSkills(profileData.skills || []),
    certifications: parseCertifications(profileData.certifications || [])
  };

  const parseTime = performance.now() - startTime;
  console.log(`[EnhancedBackground] Profile parsed in ${parseTime.toFixed(2)}ms`);
  
  return cvStructure;
}

function parseExperience(workExperience) {
  return workExperience.map(job => ({
    title: job.title || job.jobTitle || '',
    company: job.company || job.companyName || '',
    location: job.location || '',
    startDate: formatDate(job.startDate || job.start_date || ''),
    endDate: formatDate(job.endDate || job.end_date || 'Present'),
    responsibilities: extractBullets(job)
  })).filter(job => job.company || job.title);
}

function parseProjects(projects) {
  return projects.map(project => ({
    name: project.name || project.company || '',
    role: project.role || project.title || '',
    startDate: formatDate(project.startDate || project.start_date || ''),
    endDate: formatDate(project.endDate || project.end_date || ''),
    responsibilities: extractBullets(project)
  })).filter(p => p.name || p.role);
}

function extractBullets(item) {
  if (Array.isArray(item.bullets) && item.bullets.length > 0) {
    return item.bullets.filter(b => b && b.trim());
  }
  if (Array.isArray(item.responsibilities) && item.responsibilities.length > 0) {
    return item.responsibilities.filter(r => r && r.trim());
  }
  if (typeof item.description === 'string' && item.description.trim()) {
    return item.description.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  }
  return [];
}

function parseEducation(education) {
  return education.map(edu => ({
    degree: edu.degree || '',
    school: edu.school || edu.institution || '',
    location: edu.location || '',
    graduationDate: formatDate(edu.year || edu.graduationYear || ''),
    gpa: edu.gpa || ''
  })).filter(edu => edu.degree || edu.school);
}

function parseSkills(skills) {
  const categories = { technical: [], tools: [], soft: [] };
  
  const skillArray = Array.isArray(skills) ? skills : [];
  
  skillArray.forEach(skill => {
    const s = String(skill).toLowerCase();
    if (isTechnicalSkill(s)) {
      categories.technical.push(skill);
    } else if (isTool(s)) {
      categories.tools.push(skill);
    } else {
      categories.soft.push(skill);
    }
  });
  
  return categories;
}

function parseCertifications(certifications) {
  return certifications.map(cert => ({
    name: typeof cert === 'string' ? cert : (cert.name || ''),
    issuer: cert.issuer || '',
    date: formatDate(cert.date || cert.year || '')
  })).filter(cert => cert.name);
}

// ============ KEYWORD EXTRACTION (<20ms) ============
function extractKeywords(text, maxKeywords = 25) {
  const startTime = performance.now();
  
  const skillPatterns = [
    /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Go|Rust|Ruby|PHP|Swift|Kotlin|Scala|R|SQL)\b/gi,
    /\b(React|Angular|Vue\.js|Vue|Next\.js|Node\.js|Express|Django|Flask|Spring|Rails|Laravel)\b/gi,
    /\b(MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|DynamoDB|SQLite|Oracle)\b/gi,
    /\b(AWS|Azure|GCP|Google Cloud|Docker|Kubernetes|Terraform|Jenkins|GitHub Actions|GitLab CI)\b/gi,
    /\b(TensorFlow|PyTorch|Keras|Scikit-learn|Pandas|NumPy|Machine Learning|Deep Learning|NLP|AI|ML)\b/gi,
    /\b(Git|GitHub|GitLab|Webpack|Babel|Vite|NPM|Yarn|Jest|Cypress|Selenium)\b/gi,
    /\b(Agile|Scrum|Kanban|DevOps|CI\/CD|TDD|Microservices|REST|GraphQL|API)\b/gi,
    /\b(Leadership|Management|Communication|Collaboration|Problem-solving|Mentoring)\b/gi,
    /\b(Power BI|Tableau|Excel|Financial Analysis|Forecasting|Data Analysis|Business Intelligence)\b/gi
  ];

  const foundKeywords = new Set();
  
  skillPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => foundKeywords.add(match.toLowerCase()));
  });

  const keywords = Array.from(foundKeywords).slice(0, maxKeywords);
  const extractTime = performance.now() - startTime;
  
  console.log(`[EnhancedBackground] Extracted ${keywords.length} keywords in ${extractTime.toFixed(2)}ms`);
  
  return keywords;
}

// ============ MATCH SCORE CALCULATION ============
function calculateMatchScore(cvText, jobKeywords) {
  if (!cvText || !jobKeywords || jobKeywords.length === 0) return 0;
  
  const cvLower = cvText.toLowerCase();
  let matched = 0;
  
  jobKeywords.forEach(keyword => {
    if (cvLower.includes(keyword.toLowerCase())) {
      matched++;
    }
  });
  
  return Math.round((matched / jobKeywords.length) * 100);
}

// ============ CV TAILORING ============
function tailorCV(cvData, jobKeywords, jobInfo) {
  const tailoredCV = JSON.parse(JSON.stringify(cvData));
  
  // Enhance summary with job-specific keywords
  if (jobKeywords.length > 0) {
    const topKeywords = jobKeywords.slice(0, 5).join(', ');
    tailoredCV.summary = `Results-driven professional with expertise in ${topKeywords}. ${tailoredCV.summary}`;
  }
  
  // Reorder experience by relevance
  tailoredCV.experience.sort((a, b) => {
    const aScore = calculateJobRelevance(a, jobKeywords);
    const bScore = calculateJobRelevance(b, jobKeywords);
    return bScore - aScore;
  });
  
  return tailoredCV;
}

function calculateJobRelevance(job, keywords) {
  const jobText = `${job.title} ${job.company} ${job.responsibilities.join(' ')}`.toLowerCase();
  return keywords.filter(k => jobText.includes(k.toLowerCase())).length;
}

// ============ HTML GENERATION ============
function generateCVHTML(cvData, jobInfo = null) {
  const styles = `
    @page { size: A4; margin: 0.5in 0.6in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Calibri, Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.15; color: #1a1a1a; background: white; }
    .cv-container { max-width: 210mm; margin: 0 auto; padding: 0; }
    .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #2c5aa0; margin-bottom: 12px; }
    .name { font-size: 24px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .contact-info { font-size: 10px; color: #4a4a4a; line-height: 1.4; }
    .section { margin-bottom: 12px; }
    .section-title { font-size: 14px; font-weight: bold; color: #2c5aa0; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #2c5aa0; padding-bottom: 4px; margin-bottom: 8px; }
    .job { margin-bottom: 8px; page-break-inside: avoid; }
    .job-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
    .job-title { font-size: 12px; font-weight: bold; }
    .job-company { font-weight: bold; color: #4a4a4a; }
    .job-date { font-size: 10px; color: #666; font-style: italic; }
    .job-responsibilities { margin-left: 16px; margin-top: 4px; }
    .job-responsibilities li { margin-bottom: 2px; list-style-type: disc; }
    .education-item { margin-bottom: 8px; }
    .education-degree { font-weight: bold; }
    .education-school { color: #4a4a4a; }
    .skills-list { font-size: 10px; line-height: 1.3; }
    .cert-item { margin-bottom: 4px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;

  const contactParts = [cvData.header.location, cvData.header.phone, cvData.header.email].filter(Boolean);
  const onlineParts = [];
  if (cvData.header.linkedin) onlineParts.push(`LinkedIn: ${cvData.header.linkedin}`);
  if (cvData.header.github) onlineParts.push(`GitHub: ${cvData.header.github}`);
  if (cvData.header.portfolio) onlineParts.push(`Portfolio: ${cvData.header.portfolio}`);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${cvData.header.name} - CV</title>
    <style>${styles}</style>
</head>
<body>
    <div class="cv-container">
        <div class="header">
            <div class="name">${cvData.header.name}</div>
            <div class="contact-info">
                ${contactParts.join(' | ')}
                ${onlineParts.length > 0 ? '<br>' + onlineParts.join(' | ') : ''}
            </div>
        </div>`;

  // Summary
  if (cvData.summary) {
    html += `
        <div class="section">
            <div class="section-title">Professional Summary</div>
            <div class="summary">${cvData.summary}</div>
        </div>`;
  }

  // Professional Experience
  if (cvData.experience.length > 0) {
    html += `
        <div class="section">
            <div class="section-title">Professional Experience</div>`;
    cvData.experience.forEach(job => {
      html += `
            <div class="job">
                <div class="job-header">
                    <span class="job-title">${job.title}</span>
                    <span class="job-date">${job.startDate} – ${job.endDate}</span>
                </div>
                <div class="job-company">${job.company}${job.location ? ` | ${job.location}` : ''}</div>
                <ul class="job-responsibilities">
                    ${job.responsibilities.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>`;
    });
    html += `</div>`;
  }

  // Technical Projects
  if (cvData.projects && cvData.projects.length > 0) {
    html += `
        <div class="section">
            <div class="section-title">Technical Projects</div>`;
    cvData.projects.forEach(project => {
      const dateStr = project.startDate || project.endDate ? 
        `${project.startDate}${project.endDate ? ` – ${project.endDate}` : ''}` : '';
      html += `
            <div class="job">
                <div class="job-header">
                    <span class="job-title">${project.role || project.name}</span>
                    ${dateStr ? `<span class="job-date">${dateStr}</span>` : ''}
                </div>
                <div class="job-company">${project.name}</div>
                <ul class="job-responsibilities">
                    ${project.responsibilities.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>`;
    });
    html += `</div>`;
  }

  // Education
  if (cvData.education.length > 0) {
    html += `
        <div class="section">
            <div class="section-title">Education</div>`;
    cvData.education.forEach(edu => {
      html += `
            <div class="education-item">
                <div><span class="education-degree">${edu.degree}</span></div>
                <div class="education-school">${edu.school}${edu.gpa ? ` | GPA: ${edu.gpa}` : ''}</div>
            </div>`;
    });
    html += `</div>`;
  }

  // Skills
  const allSkills = [...cvData.skills.technical, ...cvData.skills.tools, ...cvData.skills.soft];
  if (allSkills.length > 0) {
    html += `
        <div class="section">
            <div class="section-title">Skills</div>
            <div class="skills-list">${allSkills.join(', ')}</div>
        </div>`;
  }

  // Certifications
  if (cvData.certifications.length > 0) {
    html += `
        <div class="section">
            <div class="section-title">Certifications</div>`;
    cvData.certifications.forEach(cert => {
      html += `<div class="cert-item">${cert.name}${cert.issuer ? ` - ${cert.issuer}` : ''}</div>`;
    });
    html += `</div>`;
  }

  html += `
    </div>
</body>
</html>`;

  return html;
}

// ============ HELPER FUNCTIONS ============
function formatPhone(phone) {
  if (!phone) return '';
  return phone.trim();
}

function formatDate(date) {
  if (!date || date === 'Present') return 'Present';
  
  // Try to extract year only for consistency
  const yearMatch = String(date).match(/\d{4}/);
  if (yearMatch) return yearMatch[0];
  
  return String(date);
}

function isTechnicalSkill(skill) {
  const techKeywords = ['javascript', 'python', 'java', 'react', 'node', 'sql', 'typescript', 'c++', 'go', 'rust'];
  return techKeywords.some(k => skill.includes(k));
}

function isTool(skill) {
  const toolKeywords = ['aws', 'azure', 'docker', 'kubernetes', 'jenkins', 'github', 'figma', 'jira', 'terraform'];
  return toolKeywords.some(k => skill.includes(k));
}

function cvToText(cvData) {
  const parts = [cvData.header.name, cvData.summary];
  
  cvData.experience.forEach(job => {
    parts.push(`${job.title} at ${job.company}`);
    parts.push(...job.responsibilities);
  });
  
  if (cvData.projects) {
    cvData.projects.forEach(project => {
      parts.push(`${project.role} at ${project.name}`);
      parts.push(...project.responsibilities);
    });
  }
  
  cvData.education.forEach(edu => {
    parts.push(`${edu.degree} from ${edu.school}`);
  });
  
  parts.push(...cvData.skills.technical, ...cvData.skills.tools, ...cvData.skills.soft);
  
  return parts.join(' ').toLowerCase();
}

function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============ OTHER MESSAGE HANDLERS ============
async function handleParseJobDescription(message, sender, sendResponse) {
  try {
    const { jobDescription, maxKeywords = 25 } = message;
    const keywords = extractKeywords(jobDescription, maxKeywords);
    
    sendResponse({ success: true, keywords, total: keywords.length });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCalculateMatchScore(message, sender, sendResponse) {
  try {
    const { cvText, jobKeywords } = message;
    const matchScore = calculateMatchScore(cvText, jobKeywords);
    
    sendResponse({
      success: true,
      matchScore,
      status: matchScore >= 80 ? 'excellent' : matchScore >= 60 ? 'good' : matchScore >= 40 ? 'fair' : 'poor'
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleTailorCV(message, sender, sendResponse) {
  try {
    const { cvData, jobKeywords, jobInfo } = message;
    const tailoredCV = tailorCV(cvData, jobKeywords, jobInfo);
    
    sendResponse({
      success: true,
      tailoredCV,
      originalScore: calculateMatchScore(cvToText(cvData), jobKeywords),
      tailoredScore: calculateMatchScore(cvToText(tailoredCV), jobKeywords)
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetPDFStatus(message, sender, sendResponse) {
  try {
    const { requestId } = message;
    const status = pdfGenerationQueue.get(requestId);
    
    if (!status) {
      sendResponse({ success: false, error: 'Request not found' });
      return;
    }
    
    sendResponse({
      success: true,
      status: status.status,
      progress: status.progress || 0,
      error: status.error || null
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCancelPDFGeneration(message, sender, sendResponse) {
  try {
    const { requestId } = message;
    pdfGenerationQueue.delete(requestId);
    
    await chrome.storage.local.remove([
      `cv_html_${requestId}`,
      `cv_data_${requestId}`,
      `job_keywords_${requestId}`
    ]);
    
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCacheProfileData(message, sender, sendResponse) {
  try {
    const { profileData, ttl = 3600000 } = message;
    const cacheKey = `profile_${Date.now()}`;
    
    sessionCache.set(cacheKey, {
      data: profileData,
      timestamp: Date.now(),
      ttl
    });
    
    sendResponse({ success: true, cacheKey });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetCachedData(message, sender, sendResponse) {
  try {
    const { cacheKey } = message;
    const cached = sessionCache.get(cacheKey);
    
    if (!cached) {
      sendResponse({ success: false, error: 'Cache miss' });
      return;
    }
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      sessionCache.delete(cacheKey);
      sendResponse({ success: false, error: 'Cache expired' });
      return;
    }
    
    sendResponse({ success: true, data: cached.data });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// ============ PERIODIC CLEANUP ============
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes
  
  for (const [requestId, entry] of pdfGenerationQueue.entries()) {
    if (now - entry.startTime > maxAge) {
      pdfGenerationQueue.delete(requestId);
    }
  }
  
  for (const [key, entry] of sessionCache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      sessionCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

console.log('[EnhancedBackground] Service worker initialized');
