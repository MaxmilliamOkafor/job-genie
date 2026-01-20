// openresume-generator.js - OpenResume-Style ATS PDF Generator v2.5
// PERFECT FORMAT: Arial 11pt, 0.75" margins, 1.5 line spacing, 100% ATS parsing
// Based on user specifications for CV and Cover Letter format

(function(global) {
  'use strict';

  // ============ ATS SPECIFICATIONS (USER DEFINED) ============
  const ATS_SPEC = {
    font: {
      family: 'helvetica', // jsPDF uses helvetica as Arial equivalent
      name: 14,            // Name/Title: 14pt Bold
      subtitle: 11,        // Subtitle/Tagline: 11pt Regular
      sectionTitle: 12,    // Section Headers: 12pt Bold
      body: 11,            // Body Text & Bullets: 11pt Regular
      contact: 11          // Contact Header: 11pt Regular
    },
    margins: {
      top: 54,    // 0.75 inch = 54pt
      bottom: 54,
      left: 54,
      right: 54
    },
    lineHeight: 1.5,       // 1.5 line spacing throughout
    paragraphSpacing: 6,   // 6pt before/after sections
    page: {
      width: 595.28,   // A4 width in points
      height: 841.89,  // A4 height in points
      maxPages: 2
    },
    bullets: {
      char: '•',       // Standard bullet (ATS safe)
      indent: 12
    }
  };

  // ============ MAIN GENERATOR CLASS ============
  const OpenResumeGenerator = {

    // ============ GENERATE COMPLETE ATS PACKAGE ============
    async generateATSPackage(baseCV, keywords, jobData, candidateData) {
      const startTime = performance.now();
      console.log('[OpenResume] Generating ATS Package v2.5...');

      // Parse and structure CV data
      const cvData = this.parseAndStructureCV(baseCV, candidateData);
      
      // Tailor CV with keywords
      const tailoredData = this.tailorCVData(cvData, keywords, jobData);
      
      // Generate CV PDF
      const cvResult = await this.generateCVPDF(tailoredData, candidateData);
      
      // Generate Cover Letter PDF
      const coverResult = await this.generateCoverLetterPDF(tailoredData, keywords, jobData, candidateData);
      
      // Calculate match score
      const matchScore = this.calculateMatchScore(tailoredData, keywords);
      
      const timing = performance.now() - startTime;
      console.log(`[OpenResume] Package generated in ${timing.toFixed(0)}ms`);

      return {
        cv: cvResult.blob,
        cvBase64: cvResult.base64,
        cvFilename: cvResult.filename,
        cover: coverResult.blob,
        coverBase64: coverResult.base64,
        coverFilename: coverResult.filename,
        matchScore,
        timing,
        tailoredData
      };
    },

    // ============ PARSE AND STRUCTURE CV ============
    parseAndStructureCV(cvText, candidateData) {
      const data = {
        contact: {
          name: '',
          tagline: '',
          phone: '',
          email: '',
          location: '',
          linkedin: '',
          github: '',
          portfolio: ''
        },
        summary: '',
        experience: [],
        skills: {
          languages: [],
          aiml: [],
          cloud: [],
          devops: [],
          databases: [],
          soft: []
        },
        education: [],
        certifications: []
      };

      // Extract from candidate data first
      if (candidateData) {
        data.contact.name = `${candidateData.firstName || candidateData.first_name || ''} ${candidateData.lastName || candidateData.last_name || ''}`.trim();
        data.contact.phone = candidateData.phone || '';
        data.contact.email = candidateData.email || '';
        const rawLocation = candidateData.city || candidateData.location || '';
        data.contact.location = this.normalizeLocation(rawLocation) || '';
        data.contact.linkedin = candidateData.linkedin || '';
        data.contact.github = candidateData.github || '';
        data.contact.portfolio = candidateData.portfolio || '';
        
        // Extract structured data if available
        if (candidateData.workExperience || candidateData.work_experience) {
          data.experience = (candidateData.workExperience || candidateData.work_experience).map(exp => ({
            company: exp.company || exp.organization || '',
            title: exp.title || exp.position || exp.role || '',
            dates: exp.dates || exp.duration || `${exp.startDate || ''} - ${exp.endDate || 'Present'}`,
            location: exp.location || '',
            bullets: this.normalizeBullets(exp.bullets || exp.achievements || exp.responsibilities || [])
          }));
        }
        
        if (candidateData.skills) {
          const skillsArr = Array.isArray(candidateData.skills) 
            ? candidateData.skills 
            : candidateData.skills.split(',').map(s => s.trim());
          data.skills = this.categorizeSkills(skillsArr);
        }
        
        if (candidateData.education) {
          data.education = candidateData.education.map(edu => ({
            institution: edu.institution || edu.school || edu.university || '',
            degree: edu.degree || '',
            dates: edu.dates || edu.graduationDate || '',
            gpa: edu.gpa || ''
          }));
        }
        
        if (candidateData.certifications) {
          data.certifications = Array.isArray(candidateData.certifications) 
            ? candidateData.certifications 
            : [candidateData.certifications];
        }
      }

      // Parse from CV text if structured data is missing
      if (cvText && data.experience.length === 0) {
        const parsed = this.parseCVText(cvText);
        Object.assign(data, parsed);
      }

      return data;
    },

    // ============ CATEGORIZE SKILLS ============
    categorizeSkills(skills) {
      const categories = {
        languages: [],
        aiml: [],
        cloud: [],
        devops: [],
        databases: [],
        soft: []
      };

      const patterns = {
        languages: /^(python|javascript|typescript|java|c\+\+|c#|go|rust|ruby|php|scala|kotlin|swift|sql|r|matlab|perl|bash|shell)$/i,
        aiml: /^(pytorch|tensorflow|scikit-learn|keras|xgboost|lightgbm|ml|ai|nlp|llm|transformer|bert|gpt|genai|hugging\s*face|opencv|spacy|langchain)$/i,
        cloud: /^(aws|azure|gcp|kubernetes|docker|k8s|ec2|s3|lambda|eks|ecs|sagemaker|cloudformation|terraform)$/i,
        devops: /^(github\s*actions|jenkins|prometheus|grafana|ci\/cd|cicd|ansible|helm|argo\s*cd|datadog|splunk|elk|new\s*relic)$/i,
        databases: /^(postgresql|postgres|mongodb|mysql|redis|snowflake|bigquery|redshift|cassandra|dynamodb|elasticsearch|neo4j|sqlite|oracle|sqlserver)$/i,
        soft: /^(leadership|collaboration|problem[\s-]*solving|communication|critical\s*thinking|agile|scrum|mentoring|teamwork|stakeholder|strategic)$/i
      };

      skills.forEach(skill => {
        const normalized = skill.trim();
        let matched = false;
        
        for (const [category, pattern] of Object.entries(patterns)) {
          if (pattern.test(normalized)) {
            categories[category].push(normalized);
            matched = true;
            break;
          }
        }
        
        if (!matched) {
          // Default to languages for technical skills
          if (/^[A-Z]/.test(normalized) || normalized.length <= 10) {
            categories.languages.push(normalized);
          } else {
            categories.soft.push(normalized);
          }
        }
      });

      return categories;
    },

    // ============ NORMALIZE BULLETS TO ARRAY ============
    normalizeBullets(bullets) {
      if (!bullets) return [];
      if (Array.isArray(bullets)) return bullets.map(b => b.replace(/^[-•*▪]\s*/, '').trim());
      return bullets.split('\n').filter(b => b.trim()).map(b => b.replace(/^[-•*▪]\s*/, '').trim());
    },

    // ============ PARSE CV TEXT ============
    parseCVText(cvText) {
      const result = {
        summary: '',
        experience: [],
        skills: { languages: [], aiml: [], cloud: [], devops: [], databases: [], soft: [] },
        education: [],
        certifications: []
      };

      const lines = cvText.split('\n');
      let currentSection = '';
      let currentContent = [];

      const sectionMap = {
        'PROFESSIONAL SUMMARY': 'summary',
        'SUMMARY': 'summary',
        'PROFILE': 'summary',
        'WORK EXPERIENCE': 'experience',
        'EXPERIENCE': 'experience',
        'EMPLOYMENT': 'experience',
        'SKILLS': 'skills',
        'TECHNICAL SKILLS': 'skills',
        'EDUCATION': 'education',
        'CERTIFICATIONS': 'certifications'
      };

      for (const line of lines) {
        const trimmed = line.trim();
        const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, '');

        if (sectionMap[upperTrimmed]) {
          this.saveSection(result, currentSection, currentContent);
          currentSection = sectionMap[upperTrimmed];
          currentContent = [];
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      this.saveSection(result, currentSection, currentContent);
      return result;
    },

    saveSection(result, section, content) {
      if (!section || content.length === 0) return;

      const text = content.join('\n').trim();

      switch (section) {
        case 'summary':
          result.summary = text;
          break;
        case 'skills':
          const skills = text.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 1);
          result.skills = this.categorizeSkills(skills);
          break;
        case 'experience':
          result.experience = this.parseExperienceText(text);
          break;
        case 'education':
          result.education = this.parseEducationText(text);
          break;
        case 'certifications':
          result.certifications = text.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 2);
          break;
      }
    },

    // ============ PARSE EXPERIENCE TEXT ============
    parseExperienceText(text) {
      const jobs = [];
      const lines = text.split('\n');
      let currentJob = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (/^[A-Z][A-Za-z\s&.,]+\s*\|/.test(trimmed) || 
            /^(Meta|Google|Amazon|Microsoft|Apple|Solim|Accenture|Citigroup)/i.test(trimmed)) {
          if (currentJob) jobs.push(currentJob);
          
          const parts = trimmed.split('|').map(p => p.trim());
          currentJob = {
            company: parts[0] || '',
            title: parts[1] || '',
            dates: parts[2] || '',
            location: parts[3] || '',
            bullets: []
          };
        } else if (currentJob && /^[-•*▪]/.test(trimmed)) {
          currentJob.bullets.push(trimmed.replace(/^[-•*▪]\s*/, ''));
        }
      }

      if (currentJob) jobs.push(currentJob);
      return jobs;
    },

    // ============ PARSE EDUCATION TEXT ============
    parseEducationText(text) {
      const entries = [];
      const lines = text.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 2) {
          entries.push({
            institution: parts[0],
            degree: parts[1],
            dates: parts[2] || '',
            gpa: parts[3] || ''
          });
        }
      }

      return entries;
    },

    // ============ TAILOR CV DATA WITH KEYWORDS ============
    tailorCVData(cvData, keywords, jobData) {
      const tailored = JSON.parse(JSON.stringify(cvData));
      
      const allKeywords = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      const highPriority = Array.isArray(keywords) ? allKeywords.slice(0, 15) : (keywords?.highPriority || allKeywords.slice(0, 15));
      const mediumPriority = Array.isArray(keywords) ? [] : (keywords?.mediumPriority || []);
      const lowPriority = Array.isArray(keywords) ? [] : (keywords?.lowPriority || []);

      // Update tagline based on job title
      if (jobData?.title) {
        tailored.contact.tagline = `Senior ${this.extractRoleType(jobData.title)} | AI/ML Engineer | Cloud Architect`;
      }

      // Update location
      if (jobData?.location) {
        tailored.contact.location = this.normalizeLocation(jobData.location);
      }

      // Enhance summary
      tailored.summary = this.enhanceSummary(cvData.summary, [...highPriority.slice(0, 5), ...mediumPriority.slice(0, 3)]);

      // Inject keywords into experience
      tailored.experience = this.injectKeywordsIntoExperience(cvData.experience, {
        high: highPriority,
        medium: mediumPriority,
        low: lowPriority,
        all: allKeywords
      });

      return tailored;
    },

    extractRoleType(title) {
      const lower = title.toLowerCase();
      if (lower.includes('data scientist') || lower.includes('ml') || lower.includes('ai')) return 'Data Scientist';
      if (lower.includes('engineer')) return 'Software Engineer';
      if (lower.includes('architect')) return 'Solutions Architect';
      if (lower.includes('manager')) return 'Product Manager';
      if (lower.includes('analyst')) return 'Data Analyst';
      return 'Software Engineer';
    },

    // ============ NORMALIZE LOCATION ============
    normalizeLocation(location) {
      if (!location) return '';
      
      let normalized = location
        .replace(/\b(remote|work\s*from\s*home|wfh|virtual|fully\s*remote)\b/gi, '')
        .replace(/\s*[\(\[]?\s*(remote|wfh|virtual)\s*[\)\]]?\s*/gi, '')
        .replace(/\s*(\||,|\/|-)\s*(\||,|\/|-)\s*/g, ', ')
        .replace(/\s*(\||,|\/|-)\s*$/g, '')
        .replace(/^\s*(\||,|\/|-)\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      
      if (!normalized || normalized.length < 3) return '';
      
      // US State abbreviations
      const stateAbbrev = {
        'california': 'CA', 'texas': 'TX', 'new york': 'NY', 'florida': 'FL',
        'illinois': 'IL', 'washington': 'WA', 'massachusetts': 'MA', 'colorado': 'CO'
      };
      
      for (const [full, abbrev] of Object.entries(stateAbbrev)) {
        const regex = new RegExp(`,\\s*${full}\\s*$`, 'i');
        if (regex.test(normalized)) {
          normalized = normalized.replace(regex, `, ${abbrev}`);
          break;
        }
      }
      
      normalized = normalized.replace(/,\s*(US|USA|United States)\s*$/i, '').trim();
      
      return normalized;
    },

    // ============ ENHANCE SUMMARY ============
    enhanceSummary(summary, keywords) {
      const keywordsArray = Array.isArray(keywords) ? keywords : [];
      
      if (!summary) {
        const topKeywords = keywordsArray.slice(0, 3);
        return topKeywords.length > 0
          ? `Results-driven professional with expertise in ${topKeywords.join(', ')}. Proven track record of delivering high-impact solutions and driving measurable business outcomes.`
          : `Results-driven professional with proven track record of delivering high-impact solutions and driving measurable business outcomes.`;
      }

      const summaryLower = summary.toLowerCase();
      const missing = keywordsArray.filter(kw => !summaryLower.includes(kw.toLowerCase()));

      if (missing.length > 0) {
        const injection = `. Expertise includes ${missing.slice(0, 3).join(', ')}`;
        if (summary.endsWith('.')) {
          return summary.slice(0, -1) + injection + '.';
        }
        return summary + injection + '.';
      }

      return summary;
    },

    // ============ INJECT KEYWORDS INTO EXPERIENCE ============
    injectKeywordsIntoExperience(experience, keywordsByPriority) {
      if (!experience || experience.length === 0) return experience;
      
      const { high = [], medium = [], low = [], all = [] } = keywordsByPriority;
      const allKeywords = all.length > 0 ? all : [...high, ...medium, ...low];

      const mentions = {};
      allKeywords.forEach(kw => { mentions[kw] = 0; });

      experience.forEach(job => {
        job.bullets.forEach(bullet => {
          allKeywords.forEach(kw => {
            if (bullet.toLowerCase().includes(kw.toLowerCase())) {
              mentions[kw]++;
            }
          });
        });
      });

      const phrases = ['leveraging', 'utilizing', 'implementing', 'applying', 'through', 'incorporating', 'via', 'using'];
      const getPhrase = () => phrases[Math.floor(Math.random() * phrases.length)];

      return experience.map(job => {
        const enhancedBullets = job.bullets.map(bullet => {
          let enhanced = bullet;
          const underRepresented = allKeywords.filter(kw => mentions[kw] < 2);

          underRepresented.slice(0, 2).forEach(kw => {
            if (!enhanced.toLowerCase().includes(kw.toLowerCase())) {
              const phrase = getPhrase();
              if (enhanced.endsWith('.')) {
                enhanced = `${enhanced.slice(0, -1)}, ${phrase} ${kw}.`;
              } else {
                enhanced = `${enhanced}, ${phrase} ${kw}`;
              }
              mentions[kw]++;
            }
          });

          return enhanced;
        });

        return { ...job, bullets: enhancedBullets };
      });
    },

    // ============ GENERATE CV PDF ============
    async generateCVPDF(tailoredData, candidateData) {
      const startTime = performance.now();

      const firstName = (candidateData?.firstName || candidateData?.first_name || 'Applicant')
        .trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Applicant';
      const lastName = (candidateData?.lastName || candidateData?.last_name || '')
        .trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const filename = lastName ? `${firstName}_${lastName}_CV.pdf` : `${firstName}_CV.pdf`;

      let pdfBlob = null;
      let pdfBase64 = null;

      if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const result = await this.renderCVWithJsPDF(tailoredData);
        pdfBlob = result.blob;
        pdfBase64 = result.base64;
      } else {
        const text = this.generateCVText(tailoredData);
        pdfBase64 = btoa(unescape(encodeURIComponent(text)));
      }

      console.log(`[OpenResume] CV PDF generated in ${(performance.now() - startTime).toFixed(0)}ms`);
      return { blob: pdfBlob, base64: pdfBase64, filename };
    },

    // ============ RENDER CV WITH JSPDF (Proper formatting) ============
    async renderCVWithJsPDF(data) {
      const { jsPDF } = jspdf;
      const { font, margins, lineHeight, page, paragraphSpacing } = ATS_SPEC;
      const contentWidth = page.width - margins.left - margins.right;

      const doc = new jsPDF({ format: 'a4', unit: 'pt', putOnlyUsedFonts: true });
      doc.setFont(font.family, 'normal');
      let y = margins.top;

      // Helper: Add text with word wrap
      const addText = (text, isBold = false, size = font.body, centered = false) => {
        doc.setFontSize(size);
        doc.setFont(font.family, isBold ? 'bold' : 'normal');
        
        const lines = doc.splitTextToSize(text, contentWidth);
        lines.forEach(line => {
          if (y > page.height - margins.bottom - 20) {
            doc.addPage();
            y = margins.top;
          }
          const x = centered ? page.width / 2 : margins.left;
          const align = centered ? { align: 'center' } : undefined;
          doc.text(line, x, y, align);
          y += size * lineHeight;
        });
      };

      // Helper: Add section header with underline
      const addSectionHeader = (title) => {
        if (y > page.height - margins.bottom - 50) {
          doc.addPage();
          y = margins.top;
        }
        y += paragraphSpacing;
        doc.setFontSize(font.sectionTitle);
        doc.setFont(font.family, 'bold');
        doc.text(title, margins.left, y);
        y += font.sectionTitle * 0.3;
        doc.setLineWidth(0.5);
        doc.line(margins.left, y, page.width - margins.right, y);
        y += paragraphSpacing + 2;
      };

      // === NAME (14pt Bold, Centered) ===
      addText(data.contact.name.toUpperCase(), true, font.name, true);
      
      // === TAGLINE (11pt Regular, Centered) ===
      if (data.contact.tagline) {
        addText(data.contact.tagline, false, font.subtitle, true);
      }
      y += 2;
      
      // === CONTACT LINE (Phone | Email | Location | Open to relocation) ===
      const contactParts = [data.contact.phone, data.contact.email, data.contact.location].filter(Boolean);
      if (contactParts.length > 0) {
        const contactLine = contactParts.join(' | ') + ' | open to relocation';
        addText(contactLine, false, font.contact, true);
      }

      // === LINKS LINE (LinkedIn | GitHub | Portfolio) as hyperlinks ===
      const linkNames = [];
      if (data.contact.linkedin) linkNames.push('LinkedIn');
      if (data.contact.github) linkNames.push('GitHub');
      if (data.contact.portfolio) linkNames.push('Portfolio');
      if (linkNames.length > 0) {
        addText(linkNames.join(' | '), false, font.contact, true);
      }

      y += 8;

      // === PROFESSIONAL SUMMARY ===
      if (data.summary) {
        addSectionHeader('PROFESSIONAL SUMMARY');
        addText(data.summary, false, font.body);
      }

      // === WORK EXPERIENCE ===
      if (data.experience && data.experience.length > 0) {
        addSectionHeader('WORK EXPERIENCE');
        
        data.experience.forEach((job, idx) => {
          // Company Name (Bold)
          doc.setFontSize(font.body);
          doc.setFont(font.family, 'bold');
          doc.text(job.company, margins.left, y);
          y += font.body * lineHeight;
          
          // Title | Dates | Location
          const jobLine = [job.title, job.dates, job.location].filter(Boolean).join(' | ');
          addText(jobLine, false, font.body);
          y += 2;

          // Bullets (tight, back-to-back)
          job.bullets.forEach(bullet => {
            const bulletText = `${ATS_SPEC.bullets.char} ${bullet}`;
            doc.setFont(font.family, 'normal');
            doc.setFontSize(font.body);
            
            const bulletLines = doc.splitTextToSize(bulletText, contentWidth - ATS_SPEC.bullets.indent);
            bulletLines.forEach((line, lineIdx) => {
              if (y > page.height - margins.bottom - 20) {
                doc.addPage();
                y = margins.top;
              }
              const indent = lineIdx === 0 ? 0 : ATS_SPEC.bullets.indent;
              doc.text(line, margins.left + indent, y);
              y += font.body * lineHeight;
            });
          });

          // 1 blank line between companies
          if (idx < data.experience.length - 1) y += font.body * lineHeight;
        });
      }

      // === TECHNICAL SKILLS ===
      if (data.skills) {
        addSectionHeader('TECHNICAL SKILLS');
        
        const skillLines = [];
        if (data.skills.languages?.length) skillLines.push(`Languages: ${data.skills.languages.join(', ')}`);
        if (data.skills.aiml?.length) skillLines.push(`AI/ML: ${data.skills.aiml.join(', ')}`);
        if (data.skills.cloud?.length) skillLines.push(`Cloud: ${data.skills.cloud.join(', ')}`);
        if (data.skills.devops?.length) skillLines.push(`DevOps: ${data.skills.devops.join(', ')}`);
        if (data.skills.databases?.length) skillLines.push(`Databases: ${data.skills.databases.join(', ')}`);
        if (data.skills.soft?.length) skillLines.push(`Soft Skills: ${data.skills.soft.join(' | ')}`);
        
        skillLines.forEach(line => addText(line, false, font.body));
      }

      // === EDUCATION ===
      if (data.education && data.education.length > 0) {
        addSectionHeader('EDUCATION');
        
        data.education.forEach(edu => {
          addText(edu.degree, true, font.body);
          const eduDetails = [edu.institution, edu.gpa ? `GPA: ${edu.gpa}` : ''].filter(Boolean).join(' | ');
          addText(eduDetails, false, font.body);
          y += 2;
        });
      }

      // === CERTIFICATIONS ===
      if (data.certifications && data.certifications.length > 0) {
        addSectionHeader('CERTIFICATIONS');
        data.certifications.forEach(cert => addText(cert, false, font.body));
      }

      // Generate output
      const base64 = doc.output('datauristring').split(',')[1];
      const blob = doc.output('blob');

      return { base64, blob };
    },

    // ============ GENERATE CV TEXT (Fallback) ============
    generateCVText(data) {
      const lines = [];
      
      lines.push(data.contact.name.toUpperCase());
      if (data.contact.tagline) lines.push(data.contact.tagline);
      lines.push([data.contact.phone, data.contact.email, data.contact.location].filter(Boolean).join(' | ') + ' | open to relocation');
      lines.push(['LinkedIn', 'GitHub', 'Portfolio'].filter((_, i) => [data.contact.linkedin, data.contact.github, data.contact.portfolio][i]).join(' | '));
      lines.push('');

      if (data.summary) {
        lines.push('PROFESSIONAL SUMMARY');
        lines.push(data.summary);
        lines.push('');
      }

      if (data.experience?.length > 0) {
        lines.push('WORK EXPERIENCE');
        data.experience.forEach(job => {
          lines.push(job.company);
          lines.push([job.title, job.dates, job.location].filter(Boolean).join(' | '));
          job.bullets.forEach(b => lines.push(`• ${b}`));
          lines.push('');
        });
      }

      if (data.skills) {
        lines.push('TECHNICAL SKILLS');
        if (data.skills.languages?.length) lines.push(`Languages: ${data.skills.languages.join(', ')}`);
        if (data.skills.aiml?.length) lines.push(`AI/ML: ${data.skills.aiml.join(', ')}`);
        if (data.skills.cloud?.length) lines.push(`Cloud: ${data.skills.cloud.join(', ')}`);
        if (data.skills.devops?.length) lines.push(`DevOps: ${data.skills.devops.join(', ')}`);
        if (data.skills.databases?.length) lines.push(`Databases: ${data.skills.databases.join(', ')}`);
        if (data.skills.soft?.length) lines.push(`Soft Skills: ${data.skills.soft.join(' | ')}`);
        lines.push('');
      }

      if (data.education?.length > 0) {
        lines.push('EDUCATION');
        data.education.forEach(edu => {
          lines.push(edu.degree);
          lines.push([edu.institution, edu.gpa ? `GPA: ${edu.gpa}` : ''].filter(Boolean).join(' | '));
        });
        lines.push('');
      }

      if (data.certifications?.length > 0) {
        lines.push('CERTIFICATIONS');
        data.certifications.forEach(cert => lines.push(cert));
      }

      return lines.join('\n');
    },

    // ============ GENERATE COVER LETTER PDF ============
    async generateCoverLetterPDF(tailoredData, keywords, jobData, candidateData) {
      const startTime = performance.now();

      const firstName = (candidateData?.firstName || candidateData?.first_name || 'Applicant')
        .trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Applicant';
      const lastName = (candidateData?.lastName || candidateData?.last_name || '')
        .trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const filename = lastName ? `${firstName}_${lastName}_Cover_Letter.pdf` : `${firstName}_Cover_Letter.pdf`;

      let pdfBlob = null;
      let pdfBase64 = null;

      if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const result = await this.renderCoverLetterWithJsPDF(tailoredData, keywords, jobData, candidateData);
        pdfBlob = result.blob;
        pdfBase64 = result.base64;
      } else {
        const text = this.generateCoverLetterText(tailoredData, keywords, jobData, candidateData);
        pdfBase64 = btoa(unescape(encodeURIComponent(text)));
      }

      console.log(`[OpenResume] Cover Letter PDF generated in ${(performance.now() - startTime).toFixed(0)}ms`);
      return { blob: pdfBlob, base64: pdfBase64, filename };
    },

    // ============ RENDER COVER LETTER WITH JSPDF ============
    // Format: NAME, Phone | Email, Date, Re: Title, Dear Hiring Manager (NO company name line)
    async renderCoverLetterWithJsPDF(data, keywords, jobData, candidateData) {
      const { jsPDF } = jspdf;
      const { font, margins, lineHeight, page } = ATS_SPEC;
      const contentWidth = page.width - margins.left - margins.right;

      const doc = new jsPDF({ format: 'a4', unit: 'pt', putOnlyUsedFonts: true });
      doc.setFont(font.family, 'normal');
      let y = margins.top;

      const addText = (text, isBold = false, size = font.body) => {
        doc.setFontSize(size);
        doc.setFont(font.family, isBold ? 'bold' : 'normal');
        
        const lines = doc.splitTextToSize(text, contentWidth);
        lines.forEach(line => {
          doc.text(line, margins.left, y);
          y += size * lineHeight;
        });
      };

      const addCenteredText = (text, isBold = false, size = font.body) => {
        doc.setFontSize(size);
        doc.setFont(font.family, isBold ? 'bold' : 'normal');
        doc.text(text, page.width / 2, y, { align: 'center' });
        y += size * lineHeight;
      };

      // Extract info
      const name = data.contact.name;
      const jobTitle = jobData?.title || 'the open position';
      let rawCompany = this.extractCompanyName(jobData);
      const company = rawCompany && rawCompany.trim() ? rawCompany : 'your organization';
      const keywordsArray = Array.isArray(keywords) ? keywords : (keywords?.all || keywords?.highPriority || []);
      const highPriority = Array.isArray(keywordsArray) ? keywordsArray.slice(0, 5) : [];
      const topExp = data.experience?.[0]?.company || 'my previous roles';

      // === HEADER (Centered) ===
      addCenteredText(name.toUpperCase(), true, font.name);
      
      // Phone | Email (NO location in cover letter header)
      const contactLine = [data.contact.phone, data.contact.email].filter(Boolean).join(' | ');
      addCenteredText(contactLine, false, font.body);
      y += 20;

      // === DATE (Left aligned) ===
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      addText(today, false, font.body);
      y += 12;

      // === SUBJECT LINE: Re: Job Title (NO "the company" line) ===
      addText(`Re: ${jobTitle}`, true, font.body);
      y += 10;

      // === SALUTATION ===
      addText('Dear Hiring Manager,', false, font.body);
      y += 12;

      // === PARAGRAPH 1 ===
      const kw1 = highPriority[0] || 'software development';
      const kw2 = highPriority[1] || 'technical solutions';
      const years = this.extractYearsExperience(data.summary) || '7+';
      
      const para1 = `I am excited to apply for the ${jobTitle} position at ${company}. With ${years} years of experience leading ${kw1} and ${kw2} initiatives, I consistently deliver measurable business impact through innovative technical solutions and cross-functional collaboration.`;
      addText(para1, false, font.body);
      y += 20;

      // === PARAGRAPH 2 ===
      const kw3 = highPriority[2] || 'project delivery';
      const kw4 = highPriority[3] || 'team leadership';
      const topBullet = data.experience?.[0]?.bullets?.[0] || 'driving efficiency improvements of 30%+';

      const para2 = `At ${topExp}, I led ${kw3} implementations that resulted in ${this.extractAchievement(topBullet)}. I have extensive experience mentoring cross-functional teams and applying ${kw4} methodologies to deliver complex projects on time and within budget.`;
      addText(para2, false, font.body);
      y += 20;

      // === PARAGRAPH 3 ===
      const kw5 = highPriority[4] || 'technical leadership';
      
      const para3 = `I would welcome the opportunity to discuss how my ${kw5} expertise can contribute to ${company}'s continued success. Thank you for considering my application. I look forward to the possibility of contributing to your team.`;
      addText(para3, false, font.body);
      y += 24;

      // === CLOSING ===
      addText('Sincerely,', false, font.body);
      y += 20;
      addText(name, true, font.body);

      const base64 = doc.output('datauristring').split(',')[1];
      const blob = doc.output('blob');

      return { base64, blob };
    },

    extractYearsExperience(summary) {
      if (!summary) return null;
      const match = summary.match(/(\d+)\+?\s*years?/i);
      return match ? match[1] : null;
    },

    extractAchievement(bullet) {
      if (!bullet) return 'significant performance improvements';
      const match = bullet.match(/(\d+%?\s*(?:improvement|increase|reduction|faster|efficiency|growth))/i);
      return match ? match[1] : bullet.slice(0, 50) + (bullet.length > 50 ? '...' : '');
    },

    // ============ GENERATE COVER LETTER TEXT (Fallback) ============
    generateCoverLetterText(data, keywords, jobData, candidateData) {
      const name = data.contact.name;
      const jobTitle = jobData?.title || 'the open position';
      let company = this.extractCompanyName(jobData);
      if (!company) company = 'your organization';
      const keywordsArray = Array.isArray(keywords) ? keywords : (keywords?.all || keywords?.highPriority || []);
      const highPriority = Array.isArray(keywordsArray) ? keywordsArray.slice(0, 5) : [];

      // Format: Name, Phone | Email, Date, Re: Title, Dear Hiring Manager (NO company name line)
      const lines = [
        name.toUpperCase(),
        [data.contact.phone, data.contact.email].filter(Boolean).join(' | '),
        '',
        new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        '',
        `Re: ${jobTitle}`,
        '',
        'Dear Hiring Manager,',
        '',
        `I am excited to apply for the ${jobTitle} position at ${company}. With experience in ${highPriority.slice(0, 2).join(' and ') || 'software development'}, I deliver measurable business impact through innovative solutions.`,
        '',
        `In my previous roles, I have successfully implemented ${highPriority[2] || 'technical'} solutions and led ${highPriority[3] || 'cross-functional'} initiatives resulting in significant improvements.`,
        '',
        `I would welcome the opportunity to discuss how my ${highPriority[4] || 'expertise'} can contribute to ${company}'s success. Thank you for your consideration.`,
        '',
        'Sincerely,',
        name
      ];

      return lines.join('\n');
    },

    // ============ CALCULATE MATCH SCORE ============
    calculateMatchScore(tailoredData, keywords) {
      const allKeywords = keywords.all || keywords;
      if (!allKeywords || allKeywords.length === 0) return 0;

      const text = [
        tailoredData.summary,
        Object.values(tailoredData.skills || {}).flat().join(' '),
        tailoredData.experience?.map(e => e.bullets?.join(' ')).join(' '),
        tailoredData.certifications?.join(' ')
      ].filter(Boolean).join(' ').toLowerCase();

      let matches = 0;
      allKeywords.forEach(kw => {
        if (text.includes(kw.toLowerCase())) matches++;
      });

      const score = Math.round((matches / allKeywords.length) * 100);
      return score;
    },

    // ============ EXTRACT COMPANY NAME ============
    extractCompanyName(jobData) {
      if (!jobData) return '';
      
      let company = jobData.company || '';
      
      const isInvalid = (val) => {
        if (!val || typeof val !== 'string') return true;
        const lower = val.toLowerCase().trim();
        return lower === 'company' || lower === 'the company' || lower === 'your company' || lower.length < 2;
      };
      
      if (isInvalid(company)) {
        const titleMatch = (jobData.title || '').match(/\bat\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:\s*[-|]|\s*$)/i);
        if (titleMatch) company = titleMatch[1].trim();
      }
      
      if (isInvalid(company)) {
        const url = jobData.url || '';
        const hostMatch = url.match(/https?:\/\/([^.\/]+)\./i);
        if (hostMatch && hostMatch[1]) {
          const subdomain = hostMatch[1].toLowerCase();
          const blacklist = ['www', 'apply', 'jobs', 'careers', 'boards', 'job-boards', 'hire'];
          if (!blacklist.includes(subdomain) && subdomain.length > 2) {
            company = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
          }
        }
      }
      
      if (company && typeof company === 'string') {
        company = company
          .replace(/\s*(careers|jobs|hiring|apply|work|join)\s*$/i, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      if (isInvalid(company)) company = '';
      
      return company;
    }
  };

  // ============ EXPORT ============
  global.OpenResumeGenerator = OpenResumeGenerator;

})(typeof window !== 'undefined' ? window : this);
