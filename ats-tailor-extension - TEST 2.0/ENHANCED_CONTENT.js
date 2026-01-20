// Enhanced Content Script for ATS Tailor v3.0
// Ultra-fast CV generation with profile-only approach
// NO FALLBACKS - uses only profile data

(function() {
  'use strict';

  console.log('[EnhancedATS] v3.0 Content Script Loaded');

  // ============ CONFIGURATION ============
  const CONFIG = {
    SUPABASE_URL: 'https://wntpldomgjutwufphnpg.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM',
    DEFAULT_LOCATION: 'Dublin, IE'
  };

  // ============ STATE ============
  let html2pdfLoaded = false;
  let currentProfile = null;
  let currentJobInfo = null;
  let currentCVData = null;
  let currentJobKeywords = [];
  let isGenerating = false;

  // ============ INITIALIZATION ============
  async function init() {
    try {
      await loadHtml2Pdf();
      html2pdfLoaded = true;
      console.log('[EnhancedATS] html2pdf.js loaded');
      
      // Auto-detect job description on supported ATS platforms
      setTimeout(autoDetectJobDescription, 1000);
      
      console.log('[EnhancedATS] Initialization complete');
    } catch (error) {
      console.error('[EnhancedATS] Initialization failed:', error);
    }
  }

  function loadHtml2Pdf() {
    return new Promise((resolve, reject) => {
      if (window.html2pdf) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ============ JOB DESCRIPTION AUTO-DETECTION ============
  function autoDetectJobDescription() {
    const selectors = [
      '[data-automation-id="jobPostingDescription"]', // Workday
      '.job-description', '.job__description', // Generic
      '[class*="job-description"]', '[id*="job-description"]',
      '.description', '.posting-description',
      'article[class*="job"]', 'section[class*="description"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 100) {
        currentJobInfo = {
          description: element.textContent.trim(),
          title: extractJobTitle(),
          company: extractCompanyName(),
          location: extractJobLocation()
        };
        console.log('[EnhancedATS] Job description detected:', currentJobInfo.title);
        return;
      }
    }
  }

  function extractJobTitle() {
    const selectors = ['h1', '[data-automation-id="jobPostingHeader"]', '.job-title', '.posting-title'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return document.title.split('|')[0].trim();
  }

  function extractCompanyName() {
    const selectors = ['[data-automation-id="companyName"]', '.company-name', '.employer-name'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  }

  function extractJobLocation() {
    const selectors = ['[data-automation-id="locations"]', '.job-location', '.location'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return CONFIG.DEFAULT_LOCATION;
  }

  // ============ MESSAGE HANDLING ============
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true;
  });

  async function handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'GENERATE_ENHANCED_CV':
          await handleGenerateCV(message, sender, sendResponse);
          break;
          
        case 'DOWNLOAD_CV_PDF':
          await handleDownloadCVPDF(message, sender, sendResponse);
          break;
          
        case 'PREVIEW_CV':
          await handlePreviewCV(message, sender, sendResponse);
          break;
          
        case 'GET_JOB_INFO':
          sendResponse({ success: true, jobInfo: currentJobInfo });
          break;
          
        case 'ATTACH_CV_FILE':
          await handleAttachCVFile(message, sender, sendResponse);
          break;
          
        default:
          // Forward to background script
          chrome.runtime.sendMessage(message, sendResponse);
      }
    } catch (error) {
      console.error('[EnhancedContent] Error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // ============ CV GENERATION ============
  async function handleGenerateCV(message, sender, sendResponse) {
    if (isGenerating) {
      sendResponse({ success: false, error: 'Generation already in progress' });
      return;
    }

    isGenerating = true;
    const startTime = performance.now();
    
    try {
      const { profileData, jobInfo } = message;
      
      // Validate profile data - NO FALLBACKS
      if (!profileData || (!profileData.work_experience?.length && !profileData.relevant_projects?.length)) {
        throw new Error('Profile is empty. Please add your work experience or projects on the Profile page.');
      }
      
      currentProfile = profileData;
      currentJobInfo = jobInfo || currentJobInfo;
      
      // Parse profile into CV structure
      currentCVData = parseProfile(profileData);
      
      // Extract job keywords
      currentJobKeywords = [];
      if (currentJobInfo?.description) {
        currentJobKeywords = extractKeywords(currentJobInfo.description, 25);
      }
      
      // Calculate match score
      const matchScore = currentJobKeywords.length > 0 ? 
        calculateMatchScore(cvToText(currentCVData), currentJobKeywords) : 0;
      
      // Generate HTML
      const htmlContent = generateCVHTML(currentCVData, currentJobInfo);
      
      // Store for later use
      await chrome.storage.local.set({
        'enhanced_cv_html': htmlContent,
        'enhanced_cv_data': currentCVData,
        'enhanced_job_keywords': currentJobKeywords,
        'enhanced_match_score': matchScore
      });
      
      const parseTime = performance.now() - startTime;
      console.log(`[EnhancedContent] CV generated in ${parseTime.toFixed(2)}ms`);
      
      sendResponse({
        success: true,
        cvData: currentCVData,
        jobKeywords: currentJobKeywords,
        matchScore,
        parseTime: parseTime.toFixed(2),
        status: matchScore >= 80 ? 'excellent' : matchScore >= 60 ? 'good' : matchScore >= 40 ? 'fair' : 'poor'
      });
      
    } catch (error) {
      console.error('[EnhancedContent] Generate CV failed:', error);
      sendResponse({ success: false, error: error.message });
    } finally {
      isGenerating = false;
    }
  }

  // ============ ULTRA-FAST PROFILE PARSING (<50ms) ============
  function parseProfile(profileData) {
    const startTime = performance.now();
    
    const cvStructure = {
      header: {
        name: `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim(),
        email: profileData.email || '',
        phone: profileData.phone || '',
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

    console.log(`[EnhancedContent] Profile parsed in ${(performance.now() - startTime).toFixed(2)}ms`);
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
      graduationDate: formatDate(edu.year || edu.graduationYear || ''),
      gpa: edu.gpa || ''
    })).filter(edu => edu.degree || edu.school);
  }

  function parseSkills(skills) {
    const categories = { technical: [], tools: [], soft: [] };
    const skillArray = Array.isArray(skills) ? skills : [];
    
    skillArray.forEach(skill => {
      const s = String(skill).toLowerCase();
      if (isTechnicalSkill(s)) categories.technical.push(skill);
      else if (isTool(s)) categories.tools.push(skill);
      else categories.soft.push(skill);
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
    
    const patterns = [
      /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Go|Rust|Ruby|PHP|Swift|Kotlin|SQL)\b/gi,
      /\b(React|Angular|Vue|Next\.js|Node\.js|Express|Django|Flask|Spring|Rails)\b/gi,
      /\b(MySQL|PostgreSQL|MongoDB|Redis|DynamoDB|Elasticsearch)\b/gi,
      /\b(AWS|Azure|GCP|Docker|Kubernetes|Terraform|Jenkins|GitHub Actions)\b/gi,
      /\b(TensorFlow|PyTorch|Machine Learning|Deep Learning|AI|ML|NLP)\b/gi,
      /\b(Git|Webpack|Jest|Cypress|Selenium|CI\/CD|DevOps|Agile|Scrum)\b/gi,
      /\b(Power BI|Tableau|Excel|Financial Analysis|Data Analysis)\b/gi
    ];

    const keywords = new Set();
    patterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(m => keywords.add(m.toLowerCase()));
    });

    console.log(`[EnhancedContent] Extracted ${keywords.size} keywords in ${(performance.now() - startTime).toFixed(2)}ms`);
    return Array.from(keywords).slice(0, maxKeywords);
  }

  // ============ MATCH SCORE ============
  function calculateMatchScore(cvText, jobKeywords) {
    if (!cvText || !jobKeywords?.length) return 0;
    const cvLower = cvText.toLowerCase();
    const matched = jobKeywords.filter(k => cvLower.includes(k.toLowerCase())).length;
    return Math.round((matched / jobKeywords.length) * 100);
  }

  // ============ HTML GENERATION ============
  function generateCVHTML(cvData, jobInfo = null) {
    const styles = `
      @page { size: A4; margin: 0.5in 0.6in; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Calibri, Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.15; color: #1a1a1a; background: white; }
      .cv-container { max-width: 210mm; margin: 0 auto; }
      .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #2c5aa0; margin-bottom: 12px; }
      .name { font-size: 24px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
      .contact-info { font-size: 10px; color: #4a4a4a; }
      .section { margin-bottom: 12px; }
      .section-title { font-size: 14px; font-weight: bold; color: #2c5aa0; text-transform: uppercase; border-bottom: 1px solid #2c5aa0; padding-bottom: 4px; margin-bottom: 8px; }
      .job { margin-bottom: 8px; page-break-inside: avoid; }
      .job-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
      .job-title { font-size: 12px; font-weight: bold; }
      .job-company { font-weight: bold; color: #4a4a4a; }
      .job-date { font-size: 10px; color: #666; font-style: italic; }
      .job-responsibilities { margin-left: 16px; margin-top: 4px; }
      .job-responsibilities li { margin-bottom: 2px; }
      .education-item { margin-bottom: 8px; }
      .skills-list { font-size: 10px; }
      @media print { body { -webkit-print-color-adjust: exact; } }
    `;

    const contact = [cvData.header.location, cvData.header.phone, cvData.header.email].filter(Boolean);
    const links = [];
    if (cvData.header.linkedin) links.push(`LinkedIn: ${cvData.header.linkedin}`);
    if (cvData.header.github) links.push(`GitHub: ${cvData.header.github}`);
    if (cvData.header.portfolio) links.push(`Portfolio: ${cvData.header.portfolio}`);

    let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${cvData.header.name} - CV</title><style>${styles}</style></head><body><div class="cv-container">
      <div class="header">
        <div class="name">${cvData.header.name}</div>
        <div class="contact-info">${contact.join(' | ')}${links.length ? '<br>' + links.join(' | ') : ''}</div>
      </div>`;

    // Summary
    if (cvData.summary) {
      html += `<div class="section"><div class="section-title">Professional Summary</div><div>${cvData.summary}</div></div>`;
    }

    // Professional Experience
    if (cvData.experience.length > 0) {
      html += `<div class="section"><div class="section-title">Professional Experience</div>`;
      cvData.experience.forEach(job => {
        html += `<div class="job">
          <div class="job-header"><span class="job-title">${job.title}</span><span class="job-date">${job.startDate} – ${job.endDate}</span></div>
          <div class="job-company">${job.company}</div>
          <ul class="job-responsibilities">${job.responsibilities.map(r => `<li>${r}</li>`).join('')}</ul>
        </div>`;
      });
      html += `</div>`;
    }

    // Technical Projects
    if (cvData.projects?.length > 0) {
      html += `<div class="section"><div class="section-title">Technical Projects</div>`;
      cvData.projects.forEach(project => {
        const dateStr = project.startDate || project.endDate ? `${project.startDate}${project.endDate ? ' – ' + project.endDate : ''}` : '';
        html += `<div class="job">
          <div class="job-header"><span class="job-title">${project.role || project.name}</span>${dateStr ? `<span class="job-date">${dateStr}</span>` : ''}</div>
          <div class="job-company">${project.name}</div>
          <ul class="job-responsibilities">${project.responsibilities.map(r => `<li>${r}</li>`).join('')}</ul>
        </div>`;
      });
      html += `</div>`;
    }

    // Education
    if (cvData.education.length > 0) {
      html += `<div class="section"><div class="section-title">Education</div>`;
      cvData.education.forEach(edu => {
        html += `<div class="education-item"><div><strong>${edu.degree}</strong></div><div>${edu.school}${edu.gpa ? ' | GPA: ' + edu.gpa : ''}</div></div>`;
      });
      html += `</div>`;
    }

    // Skills
    const allSkills = [...cvData.skills.technical, ...cvData.skills.tools, ...cvData.skills.soft];
    if (allSkills.length > 0) {
      html += `<div class="section"><div class="section-title">Skills</div><div class="skills-list">${allSkills.join(', ')}</div></div>`;
    }

    // Certifications
    if (cvData.certifications.length > 0) {
      html += `<div class="section"><div class="section-title">Certifications</div>`;
      cvData.certifications.forEach(cert => {
        html += `<div>${cert.name}${cert.issuer ? ' - ' + cert.issuer : ''}</div>`;
      });
      html += `</div>`;
    }

    html += `</div></body></html>`;
    return html;
  }

  // ============ PDF DOWNLOAD ============
  async function handleDownloadCVPDF(message, sender, sendResponse) {
    if (!html2pdfLoaded) {
      sendResponse({ success: false, error: 'PDF library not loaded' });
      return;
    }

    try {
      const { cvData, filename } = message;
      const data = cvData || currentCVData;
      
      if (!data) {
        throw new Error('No CV data available. Generate CV first.');
      }
      
      const htmlContent = generateCVHTML(data, currentJobInfo);
      
      const opt = {
        margin: 0.5,
        filename: filename || `${data.header.name.replace(/\s+/g, '_')}_CV.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, width: 794 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };

      // Create temporary container
      const container = document.createElement('div');
      container.innerHTML = htmlContent;
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      document.body.appendChild(container);

      const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
      document.body.removeChild(container);
      
      // Download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = opt.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      sendResponse({ success: true, filename: opt.filename, size: pdfBlob.size });
      
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  // ============ CV PREVIEW ============
  async function handlePreviewCV(message, sender, sendResponse) {
    try {
      const { cvData, jobInfo } = message;
      const data = cvData || currentCVData;
      
      if (!data) {
        throw new Error('No CV data available. Generate CV first.');
      }
      
      const htmlContent = generateCVHTML(data, jobInfo || currentJobInfo);
      
      const previewWindow = window.open('', '_blank', 'width=850,height=1100');
      previewWindow.document.write(htmlContent);
      previewWindow.document.close();
      
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  // ============ FILE ATTACHMENT ============
  async function handleAttachCVFile(message, sender, sendResponse) {
    try {
      const { pdfBlob, filename } = message;
      
      // Find file input on page
      const fileInputs = document.querySelectorAll('input[type="file"]');
      if (fileInputs.length === 0) {
        throw new Error('No file input found on page');
      }
      
      // Create file from blob
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });
      
      // Attach to first file input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputs[0].files = dataTransfer.files;
      
      // Dispatch change event
      fileInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      
      sendResponse({ success: true, message: 'File attached successfully' });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  // ============ HELPERS ============
  function formatDate(date) {
    if (!date || date === 'Present') return 'Present';
    const yearMatch = String(date).match(/\d{4}/);
    return yearMatch ? yearMatch[0] : String(date);
  }

  function isTechnicalSkill(s) {
    return ['javascript', 'python', 'java', 'react', 'node', 'sql', 'typescript', 'c++'].some(k => s.includes(k));
  }

  function isTool(s) {
    return ['aws', 'azure', 'docker', 'kubernetes', 'jenkins', 'github', 'terraform'].some(k => s.includes(k));
  }

  function cvToText(cvData) {
    const parts = [cvData.header.name, cvData.summary];
    cvData.experience.forEach(job => { parts.push(job.title, job.company, ...job.responsibilities); });
    if (cvData.projects) cvData.projects.forEach(p => { parts.push(p.role, p.name, ...p.responsibilities); });
    cvData.education.forEach(edu => { parts.push(edu.degree, edu.school); });
    parts.push(...cvData.skills.technical, ...cvData.skills.tools, ...cvData.skills.soft);
    return parts.join(' ').toLowerCase();
  }

  // ============ INIT ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
