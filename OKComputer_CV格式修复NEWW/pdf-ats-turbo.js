// pdf-ats-turbo.js - 100% ATS-Parseable PDF Generator v2.1 (Fixed Formatting)
// PERFECT FORMAT: Arial 11pt, 0.75" margins, 1.5 line spacing, UTF-8 text-only
// FIXED: Proper formatting, no ALL CAPS, clean text, shortened hyperlinks

(function() {
  'use strict';

  const PDFATSTurbo = {
    // ============ PDF CONFIGURATION (ATS-PERFECT - RECRUITER APPROVED) ============
    CONFIG: {
      // Font: Arial 11pt (ATS Universal - recruiter scannable)
      font: 'helvetica', // jsPDF uses helvetica as Arial equivalent
      fontSize: {
        name: 14,
        sectionTitle: 12,  // Section headers: 12pt bold
        body: 11,          // Body text: 11pt (as specified)
        small: 9
      },
      // Margins: 0.75 inches all sides (54pt) - ATS standard
      margins: {
        top: 54,
        bottom: 54,
        left: 54,
        right: 54
      },
      // Line spacing: 1.5 - as specified
      lineHeight: 1.5,
      // A4 dimensions in points
      pageWidth: 595.28,
      pageHeight: 841.89,
      // Encoding: UTF-8 text-only
      encoding: 'UTF-8'
    },

    // ============ CORE TECHNICAL SKILLS (MAX 20, NO JOB KEYWORDS) ============
    CORE_SKILLS_LIMIT: 20,

    // ============ SOFT SKILLS TO EXCLUDE FROM DISPLAY ============
    EXCLUDED_SOFT_SKILLS: new Set([
      'good learning', 'communication skills', 'love for technology', 
      'able to withstand work pressure', 'system integration', 'collaboration',
      'problem-solving', 'teamwork', 'leadership', 'initiative', 'ownership',
      'passion', 'dedication', 'motivation', 'self-starter', 'communication',
      'interpersonal', 'proactive', 'detail-oriented', 'hard-working', 'team player',
      'immigration law', 'eoir', 'uscis', 'court representation', 'juris doctor',
      'advocacy skills', 'bilingual', 'case preparation', 'schedule management',
      '1+ year experience', 'active bar license', 'detained matters', 'reliability',
      'legal industry', 'client representation', 'case document preparation',
      'eoir proceedings familiarity', 'uscis interviews experience'
    ]),

    // ============ GENERATE ATS-PERFECT CV PDF (Fixed Formatting) ============
    async generateATSPerfectCV(candidateData, tailoredCV, jobData, workExperienceKeywords = []) {
      const startTime = performance.now();
      console.log('[PDFATSTurbo] Generating ATS-perfect CV (Fixed Formatting)...');

      // Parse and format CV content
      const formattedContent = this.formatCVForATS(tailoredCV, candidateData, workExperienceKeywords);
      
      // Build PDF text (UTF-8 text-only binary)
      const pdfText = this.buildPDFText(formattedContent);
      
      // Generate filename: {FirstName}_{LastName}_CV.pdf (EXACT FORMAT)
      const firstName = (candidateData?.firstName || candidateData?.first_name || 'Applicant').replace(/\s+/g, '_').replace(/[^a-zA-Z_]/g, '');
      const lastName = (candidateData?.lastName || candidateData?.last_name || '').replace(/\s+/g, '_').replace(/[^a-zA-Z_]/g, '');
      const fileName = lastName ? `${firstName}_${lastName}_CV.pdf` : `${firstName}_CV.pdf`;

      let pdfBase64 = null;
      let pdfBlob = null;

      if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const pdfResult = await this.generateWithJsPDF(formattedContent, candidateData);
        pdfBase64 = pdfResult.base64;
        pdfBlob = pdfResult.blob;
      } else {
        // Fallback: text-based PDF
        pdfBase64 = btoa(unescape(encodeURIComponent(pdfText)));
      }

      const timing = performance.now() - startTime;
      console.log(`[PDFATSTurbo] CV PDF generated in ${timing.toFixed(0)}ms`);

      return {
        pdf: pdfBase64,
        blob: pdfBlob,
        fileName,
        text: pdfText,
        formattedContent,
        timing,
        size: pdfBase64 ? Math.round(pdfBase64.length * 0.75 / 1024) : 0
      };
    },

    // ============ FORMAT CV FOR ATS ============
    formatCVForATS(cvText, candidateData, workExperienceKeywords = []) {
      const sections = {};
      
      // CONTACT INFORMATION
      sections.contact = this.buildContactSection(candidateData);
      
      // Parse existing CV sections
      const parsed = this.parseCVSections(cvText);
      
      // PROFESSIONAL SUMMARY
      sections.summary = parsed.summary || '';
      
      // EXPERIENCE - Already has keywords injected from tailorCV
      sections.experience = parsed.experience || '';
      
      // SKILLS - Proper formatting, no ALL CAPS, comma-separated
      sections.skills = this.formatCleanSkillsSection(parsed.skills, workExperienceKeywords);
      
      // EDUCATION - Compact single-line format
      sections.education = this.formatEducationSection(parsed.education);
      
      // CERTIFICATIONS - Comma-separated, no bullet spam
      sections.certifications = this.formatCertificationsSection(parsed.certifications);

      console.log('[PDFATSTurbo] formatCVForATS - sections formatted');

      return sections;
    },

    // ============ BUILD CONTACT SECTION ============
    // HARD RULE: NEVER include "Remote" in CV location header (recruiter red flag)
    buildContactSection(candidateData) {
      const firstName = candidateData?.firstName || candidateData?.first_name || 'Maxmilliam';
      const lastName = candidateData?.lastName || candidateData?.last_name || 'Okafor';
      const name = `${firstName} ${lastName}`.trim();
      const phone = candidateData?.phone || '+353: 0874261508';
      const email = candidateData?.email || 'maxokafordev@gmail.com';
      const linkedin = candidateData?.linkedin || 'https://linkedin.com/in/maxokafor';
      const github = candidateData?.github || 'https://github.com/MaxmilliamOkafor';
      const portfolio = candidateData?.portfolio || 'https://maxokafor.dev/';
      
      // Get raw location
      let location = candidateData?.city || candidateData?.location || 'Dublin, IE';
      
      // CRITICAL HARD RULE: ALWAYS strip Remote from location (recruiter red flag)
      location = this.stripRemoteFromLocation(location);
      
      // Normalize location to "City, State" format for US locations
      location = this.normalizeLocationFormat(location);
      
      // If location becomes empty after stripping, use default Dublin, IE
      if (!location || location.length < 3) {
        location = 'Dublin, IE';
      }

      // Format phone for ATS: "+CountryCode: Number"
      const formattedPhone = this.formatPhoneForATS(phone);

      // Build contact parts - only include non-empty values
      const contactParts = [formattedPhone, email, location].filter(Boolean);
      // Use display names for links to save space
      const linkParts = ['LinkedIn', 'GitHub', 'Portfolio'].filter(Boolean);

      return {
        name,
        contactLine: contactParts.join(' | ') + ' | open to relocation',
        linksLine: linkParts.join(' | '),
        // Store full URLs separately for actual links
        linkedinUrl: linkedin,
        githubUrl: github,
        portfolioUrl: portfolio
      };
    },
    
    // ============ FORMAT PHONE FOR ATS ============
    // Format: "+CountryCode: LocalNumber" (e.g., "+353: 0874261508")
    formatPhoneForATS(phone) {
      if (!phone) return '';
      
      let cleaned = phone.replace(/[^\d+]/g, '');
      
      if (cleaned.startsWith('+')) {
        const match = cleaned.match(/^\+(\d{1,3})(\d+)$/);
        if (match) {
          return `+${match[1]}: ${match[2]}`;
        }
      }
      
      return phone;
    },
    
    // ============ NORMALIZE LOCATION FORMAT ============
    // Output: "City, State" for US locations (e.g., "San Francisco, CA")
    normalizeLocationFormat(location) {
      if (!location) return '';
      
      const stateAbbrev = {
        'california': 'CA', 'texas': 'TX', 'new york': 'NY', 'florida': 'FL',
        'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH', 'georgia': 'GA',
        'north carolina': 'NC', 'michigan': 'MI', 'new jersey': 'NJ', 'virginia': 'VA',
        'washington': 'WA', 'arizona': 'AZ', 'massachusetts': 'MA', 'tennessee': 'TN',
        'indiana': 'IN', 'missouri': 'MO', 'maryland': 'MD', 'wisconsin': 'WI',
        'colorado': 'CO', 'minnesota': 'MN', 'south carolina': 'SC', 'alabama': 'AL',
        'louisiana': 'LA', 'kentucky': 'KY', 'oregon': 'OR', 'oklahoma': 'OK',
        'connecticut': 'CT', 'utah': 'UT', 'iowa': 'IA', 'nevada': 'NV',
        'arkansas': 'AR', 'mississippi': 'MS', 'kansas': 'KS', 'new mexico': 'NM',
        'nebraska': 'NE', 'west virginia': 'WV', 'idaho': 'ID', 'hawaii': 'HI',
        'new hampshire': 'NH', 'maine': 'ME', 'montana': 'MT', 'rhode island': 'RI',
        'delaware': 'DE', 'south dakota': 'SD', 'north dakota': 'ND', 'alaska': 'AK',
        'vermont': 'VT', 'wyoming': 'WY'
      };
      
      const parts = location.toLowerCase().split(',').map(p => p.trim());
      if (parts.length >= 2 && stateAbbrev[parts[1]]) {
        return `${parts[0].replace(/\b\w/g, l => l.toUpperCase())}, ${stateAbbrev[parts[1]]}`;
      }
      
      // For non-US locations, capitalize first letters
      return location.replace(/\b\w/g, l => l.toUpperCase());
    },
    
    // ============ STRIP "REMOTE" FROM LOCATION ============
    stripRemoteFromLocation(location) {
      if (!location) return '';
      return location
        .replace(/\bremote\b/gi, '')
        .replace(/\bwork from home\b/gi, '')
        .replace(/\bhybrid\b/gi, '')
        .replace(/[^\w,\s]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/,\s*,/, ',')
        .replace(/^,|,$/g, '')
        .trim();
    },

    // ============ PARSE CV SECTIONS ============
    parseCVSections(cvText) {
      const sections = {
        summary: '',
        experience: '',
        skills: '',
        education: '',
        certifications: '',
        technicalProficiencies: ''
      };

      // Split into lines and process
      const lines = cvText.split('\n').map(line => line.trim()).filter(Boolean);
      let currentSection = '';
      let currentContent = [];

      const sectionMap = {
        'PROFESSIONAL SUMMARY': 'summary',
        'SUMMARY': 'summary',
        'PROFILE': 'summary',
        'WORK EXPERIENCE': 'experience',
        'EXPERIENCE': 'experience',
        'EMPLOYMENT': 'experience',
        'PROFESSIONAL EXPERIENCE': 'experience',
        'SKILLS': 'skills',
        'TECHNICAL SKILLS': 'skills',
        'CORE COMPETENCIES': 'skills',
        'EDUCATION': 'education',
        'CERTIFICATIONS': 'certifications',
        'TECHNICAL PROFICIENCIES': 'technicalProficiencies'
      };

      for (const line of lines) {
        const upperLine = line.toUpperCase();
        
        // Check if this is a section header
        const sectionFound = Object.keys(sectionMap).find(key => upperLine.includes(key));
        
        if (sectionFound && line.length < 50) {
          // Save previous section
          if (currentSection && currentContent.length > 0) {
            sections[currentSection] = currentContent.join('\n').trim();
          }
          
          // Start new section
          currentSection = sectionMap[sectionFound];
          currentContent = [];
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      // Save last section
      if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }

      return sections;
    },

    // ============ FORMAT CLEAN SKILLS SECTION ============
    formatCleanSkillsSection(skillsText, workExperienceKeywords = []) {
      if (!skillsText) return '';
      
      // Parse skills from text
      const skills = [];
      const lines = skillsText.split('\n');
      
      for (const line of lines) {
        // Extract skills from comma-separated lists
        const matches = line.match(/[A-Za-z0-9+\s\-#.&\/]+/g);
        if (matches) {
          matches.forEach(match => {
            const skill = match.trim();
            if (skill && skill.length > 1 && !this.EXCLUDED_SOFT_SKILLS.has(skill.toLowerCase())) {
              skills.push(skill);
            }
          });
        }
      }
      
      // Add work experience keywords if provided
      if (workExperienceKeywords.length > 0) {
        skills.push(...workExperienceKeywords);
      }
      
      // Remove duplicates and limit
      const uniqueSkills = [...new Set(skills)].slice(0, this.CORE_SKILLS_LIMIT);
      
      // Categorize skills
      const categories = {
        'Languages': [],
        'AI/ML': [],
        'Cloud & Infrastructure': [],
        'Databases': [],
        'DevOps & Tools': []
      };
      
      const categoryMap = {
        'python': 'Languages', 'sql': 'Languages', 'javascript': 'Languages', 'typescript': 'Languages', 'java': 'Languages', 'c++': 'Languages',
        'pytorch': 'AI/ML', 'tensorflow': 'AI/ML', 'scikit-learn': 'AI/ML', 'pandas': 'AI/ML', 'jupyter': 'AI/ML', 'mlflow': 'AI/ML', 'airflow': 'AI/ML', 'kafka': 'AI/ML',
        'aws': 'Cloud & Infrastructure', 'azure': 'Cloud & Infrastructure', 'gcp': 'Cloud & Infrastructure', 'docker': 'Cloud & Infrastructure', 'kubernetes': 'Cloud & Infrastructure', 'terraform': 'Cloud & Infrastructure', 'ansible': 'Cloud & Infrastructure',
        'postgresql': 'Databases', 'mongodb': 'Databases', 'redis': 'Databases', 'snowflake': 'Databases', 'bigquery': 'Databases', 'neo4j': 'Databases',
        'github actions': 'DevOps & Tools', 'gitlab ci': 'DevOps & Tools', 'jenkins': 'DevOps & Tools', 'prometheus': 'DevOps & Tools', 'grafana': 'DevOps & Tools', 'elk stack': 'DevOps & Tools'
      };
      
      for (const skill of uniqueSkills) {
        const skillLower = skill.toLowerCase();
        let categorized = false;
        
        for (const [key, category] of Object.entries(categoryMap)) {
          if (skillLower.includes(key)) {
            categories[category].push(skill);
            categorized = true;
            break;
          }
        }
        
        if (!categorized) {
          categories['Languages'].push(skill);
        }
      }
      
      // Build formatted skills section
      let formattedSkills = '';
      for (const [category, items] of Object.entries(categories)) {
        if (items.length > 0) {
          formattedSkills += `${category}: ${items.join(', ')}\n`;
        }
      }
      
      return formattedSkills.trim();
    },

    // ============ FORMAT EDUCATION SECTION ============
    formatEducationSection(educationText) {
      if (!educationText) return '';
      
      const lines = educationText.split('\n').filter(line => line.trim());
      const formatted = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this is a degree line
        if (line.toLowerCase().includes('degree') || line.toLowerCase().includes('bachelor') || line.toLowerCase().includes('master')) {
          formatted.push(line);
        } else if (line.toLowerCase().includes('college') || line.toLowerCase().includes('university') || line.toLowerCase().includes('institute')) {
          // University line
          formatted.push(line);
        } else if (line.toLowerCase().includes('gpa') || line.toLowerCase().includes('distinction') || line.toLowerCase().includes('honours')) {
          // GPA/achievement line
          formatted.push(line);
        } else if (line.length > 10 && !line.includes('•') && !line.includes('-')) {
          // Other relevant content
          formatted.push(line);
        }
      }
      
      return formatted.join('\n');
    },

    // ============ FORMAT CERTIFICATIONS SECTION ============
    formatCertificationsSection(certsText) {
      if (!certsText) return '';
      
      // Extract certifications from text
      const certifications = [];
      const lines = certsText.split('\n');
      
      for (const line of lines) {
        // Look for certification patterns
        const certMatches = line.match(/[A-Za-z0-9\s\-#.&\/\(\)]+(?:Certified|Certificate|Certification|Administrator|Architect|Professional|Expert|Specialty)/gi);
        if (certMatches) {
          certMatches.forEach(cert => {
            const trimmed = cert.trim();
            if (trimmed && trimmed.length > 5) {
              certifications.push(trimmed);
            }
          });
        }
      }
      
      // Return comma-separated list
      return certifications.join(' | ');
    },

    // ============ EXTRACT MEANINGFUL PROFICIENCIES ============
    extractMeaningfulProficiencies(profText) {
      if (!profText) return '';
      
      const profs = [];
      const lines = profText.split('\n');
      
      for (const line of lines) {
        // Skip lines that are mostly soft skills
        const lowerLine = line.toLowerCase();
        let hasTechnical = false;
        
        const technicalKeywords = ['python', 'java', 'sql', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'react', 'node'];
        for (const keyword of technicalKeywords) {
          if (lowerLine.includes(keyword)) {
            hasTechnical = true;
            break;
          }
        }
        
        if (hasTechnical) {
          profs.push(line);
        }
      }
      
      return profs.join(', ');
    },

    // ============ BUILD PDF TEXT ============
    buildPDFText(sections) {
      let text = '';
      
      // NAME AND CONTACT
      text += `${sections.contact.name}\n`;
      text += `${sections.contact.contactLine}\n`;
      if (sections.contact.linksLine) {
        text += `${sections.contact.linksLine}\n`;
      }
      text += '\n';
      
      // PROFESSIONAL SUMMARY
      if (sections.summary) {
        text += 'PROFESSIONAL SUMMARY\n';
        text += `${sections.summary}\n\n`;
      }
      
      // WORK EXPERIENCE
      if (sections.experience) {
        text += 'WORK EXPERIENCE\n';
        text += `${sections.experience}\n\n`;
      }
      
      // TECHNICAL SKILLS
      if (sections.skills) {
        text += 'TECHNICAL SKILLS\n';
        text += `${sections.skills}\n\n`;
      }
      
      // EDUCATION
      if (sections.education) {
        text += 'EDUCATION\n';
        text += `${sections.education}\n\n`;
      }
      
      // CERTIFICATIONS
      if (sections.certifications) {
        text += 'CERTIFICATIONS\n';
        text += `${sections.certifications}\n`;
      }
      
      return text;
    },

    // ============ GENERATE WITH JSPDF ============
    async generateWithJsPDF(formattedContent, candidateData) {
      const { jsPDF } = jspdf;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
        putOnlyUsedFonts: true,
        floatPrecision: 16
      });

      const { margins, fontSize, lineHeight } = this.CONFIG;
      let currentY = margins.top;
      const pageWidth = this.CONFIG.pageWidth - margins.left - margins.right;

      // Helper function to add text with line wrapping
      const addText = (text, fontSize, isBold = false, maxWidth = pageWidth) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        
        const lines = doc.splitTextToSize(text, maxWidth);
        doc.text(lines, margins.left, currentY);
        currentY += fontSize * lineHeight * lines.length;
        
        return lines.length;
      };

      // NAME (14pt bold)
      addText(formattedContent.contact.name, fontSize.name, true);
      currentY += 6; // 6pt spacing
      
      // Contact line (11pt)
      addText(formattedContent.contact.contactLine, fontSize.body);
      currentY += 6;
      
      // Links line (11pt) - Display names only to save space
      if (formattedContent.contact.linksLine) {
        addText(formattedContent.contact.linksLine, fontSize.body);
      }
      currentY += 12; // 1 blank line

      // PROFESSIONAL SUMMARY
      if (formattedContent.summary) {
        addText('PROFESSIONAL SUMMARY', fontSize.sectionTitle, true);
        currentY += 6;
        addText(formattedContent.summary, fontSize.body);
        currentY += 12;
      }

      // WORK EXPERIENCE
      if (formattedContent.experience) {
        addText('WORK EXPERIENCE', fontSize.sectionTitle, true);
        currentY += 6;
        
        // Process experience lines
        const expLines = formattedContent.experience.split('\n');
        for (const line of expLines) {
          if (line.trim()) {
            // Check if this is a company/title line (usually has em dash or dates)
            if (line.includes('—') || /\d{4}\s*[-–]\s*(?:\d{4}|Present|Current)/i.test(line)) {
              addText(line, fontSize.body, true);
            } else if (line.startsWith('•') || line.startsWith('-')) {
              addText(line, fontSize.body);
            } else {
              addText(line, fontSize.body);
            }
            currentY += fontSize.body * 0.5; // Tighter spacing within sections
          }
        }
        currentY += 12;
      }

      // TECHNICAL SKILLS
      if (formattedContent.skills) {
        addText('TECHNICAL SKILLS', fontSize.sectionTitle, true);
        currentY += 6;
        
        const skillLines = formattedContent.skills.split('\n');
        for (const line of skillLines) {
          if (line.trim()) {
            addText(line, fontSize.body);
            currentY += fontSize.body * 0.5;
          }
        }
        currentY += 12;
      }

      // EDUCATION
      if (formattedContent.education) {
        addText('EDUCATION', fontSize.sectionTitle, true);
        currentY += 6;
        
        const eduLines = formattedContent.education.split('\n');
        for (const line of eduLines) {
          if (line.trim()) {
            addText(line, fontSize.body);
            currentY += fontSize.body * 0.5;
          }
        }
        currentY += 12;
      }

      // CERTIFICATIONS
      if (formattedContent.certifications) {
        addText('CERTIFICATIONS', fontSize.sectionTitle, true);
        currentY += 6;
        addText(formattedContent.certifications, fontSize.body);
      }

      // Generate blob and base64
      const pdfBlob = doc.output('blob');
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      return { blob: pdfBlob, base64: pdfBase64 };
    },

    // ============ GENERATE COVER LETTER PDF ============
    async generateCoverLetterPDF(content, jobData, candidateData) {
      if (typeof jspdf === 'undefined') return null;

      const { jsPDF } = jspdf;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      const { margins, font, lineHeight } = this.CONFIG;
      let currentY = margins.top;
      const pageWidth = this.CONFIG.pageWidth - margins.left - margins.right;

      // Helper function to add text with line wrapping
      const addText = (text, size, isBold = false, maxWidth = pageWidth) => {
        doc.setFontSize(size);
        doc.setFont(font.family, isBold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(text, maxWidth);
        doc.text(lines, margins.left, currentY);
        currentY += size * lineHeight * lines.length;
        return lines.length;
      };

      // Generate cover letter content
      const jobTitle = jobData?.title || 'Software Engineer';
      const company = jobData?.company || 'the Company';
      const firstName = candidateData?.firstName || 'Maxmilliam';
      const lastName = candidateData?.lastName || 'Okafor';
      const fullName = `${firstName} ${lastName}`;
      
      // Header
      addText(fullName, ATS_SPEC.font.name, true);
      currentY += 6;
      
      const contactParts = [
        candidateData?.phone || '+353: 0874261508',
        candidateData?.email || 'maxokafordev@gmail.com'
      ].filter(Boolean);
      addText(contactParts.join(' | '), ATS_SPEC.font.body);
      currentY += 18;

      // Date
      addText(new Date().toLocaleDateString(), ATS_SPEC.font.body);
      currentY += 18;

      // Recipient
      addText('Hiring Manager', ATS_SPEC.font.body);
      addText(company, ATS_SPEC.font.body);
      currentY += 18;

      // Salutation
      addText('Dear Hiring Manager,', ATS_SPEC.font.body);
      currentY += 12;

      // Body paragraphs
      const paragraphs = [
        `I am writing to express my strong interest in the ${jobTitle} position at ${company}. With over 8 years of experience in AI/ML engineering, cloud architecture, and data engineering across Fortune 500 companies and high-growth startups, I am confident I can contribute immediately to your team's success.`,
        
        `Throughout my career, I have designed and deployed ML systems serving millions of users, architected cloud-native solutions that reduced operational costs by 40%, and led cross-functional teams to deliver complex technical projects. My experience at Meta, Accenture, and Citi has given me deep expertise in building scalable, production-grade systems.`,
        
        `My technical expertise spans Python, PyTorch, TensorFlow, AWS, Kubernetes, and modern DevOps practices. I am particularly excited about the opportunity to apply my experience in MLOps and scalable system design to help drive innovation.`,
        
        `I would welcome the opportunity to discuss how my background and skills align with your team's needs. Thank you for your time and consideration.`
      ];

      paragraphs.forEach(para => {
        addText(para, ATS_SPEC.font.body);
        currentY += 12;
      });

      // Closing
      addText('Sincerely,', ATS_SPEC.font.body);
      currentY += 6;
      addText(fullName, ATS_SPEC.font.body, true);

      const pdfBlob = doc.output('blob');
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      
      const filename = lastName ? `${firstName}_${lastName}_Cover_Letter.pdf` : `${firstName}_Cover_Letter.pdf`;

      return {
        blob: pdfBlob,
        base64: pdfBase64,
        filename,
        text: `Maxmilliam Okafor\n\n${contactParts.join(' | ')}\n\n${new Date().toLocaleDateString()}\n\nHiring Manager\n${company}\n\nDear Hiring Manager,\n\n${paragraphs.join('\n\n')}\n\nSincerely,\nMaxmilliam Okafor`
      };
    }
  };

  // ============ EXPOSE GLOBALLY ============
  window.PDFATSTurbo = PDFATSTurbo;

  console.log('[PDFATSTurbo v2.1] Loaded with fixed formatting');
})();
