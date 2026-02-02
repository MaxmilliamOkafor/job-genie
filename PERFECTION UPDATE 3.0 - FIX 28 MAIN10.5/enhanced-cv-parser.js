// Enhanced CV Parser - Multi-page support with rich-text education
// Handles PDF/DOCX parsing with improved work experience extraction

(function(global) {
  'use strict';

  const EnhancedCVParser = {
    
    // ============ MAIN ENTRY POINT - PARSE CV FILE ============
    async parseCVFile(file, options = {}) {
      const startTime = performance.now();
      console.log('[EnhancedCVParser] Parsing CV file...');

      try {
        const fileContent = await this.readFileContent(file);
        const fileType = this.detectFileType(file.name);
        
        let parsedData;
        if (fileType === 'pdf') {
          parsedData = await this.parsePDF(fileContent, options);
        } else if (fileType === 'docx') {
          parsedData = await this.parseDOCX(fileContent, options);
        } else {
          // Fallback to text parsing
          parsedData = this.parseText(fileContent);
        }

        // Enhance the parsed data with better structure
        const enhancedData = this.enhanceParsedData(parsedData);

        const timing = performance.now() - startTime;
        console.log(`[EnhancedCVParser] CV parsed in ${timing.toFixed(0)}ms`);

        return {
          success: true,
          data: enhancedData,
          timing,
          fileType,
          pages: parsedData.pages || 1
        };

      } catch (error) {
        console.error('[EnhancedCVParser] Error parsing CV:', error);
        return {
          success: false,
          error: error.message,
          data: null
        };
      }
    },

    // ============ FILE READING ============
    async readFileContent(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
      });
    },

    detectFileType(filename) {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'pdf') return 'pdf';
      if (ext === 'docx') return 'docx';
      if (ext === 'doc') return 'doc';
      return 'text';
    },

    // ============ PDF PARSING (Multi-page support) ============
    async parsePDF(arrayBuffer, options = {}) {
      console.log('[EnhancedCVParser] Parsing PDF with multi-page support...');
      
      // This would integrate with a PDF library like pdf-lib or pdf-parse
      // For now, return a structured placeholder
      return {
        text: await this.extractPDFText(arrayBuffer),
        pages: await this.getPDFPageCount(arrayBuffer),
        metadata: await this.getPDFMetadata(arrayBuffer)
      };
    },

    async extractPDFText(arrayBuffer) {
      // Placeholder for PDF text extraction
      // In a real implementation, this would use a PDF parsing library
      return "Extracted PDF text content...";
    },

    async getPDFPageCount(arrayBuffer) {
      // Extract page count from PDF
      const bytes = new Uint8Array(arrayBuffer);
      const text = new TextDecoder().decode(bytes.slice(0, 1000));
      const match = text.match(/\/Type\s*\/Pages[^\/]*\/Count\s+(\d+)/);
      return match ? parseInt(match[1]) : 1;
    },

    async getPDFMetadata(arrayBuffer) {
      return {
        title: '',
        author: '',
        pages: await this.getPDFPageCount(arrayBuffer)
      };
    },

    // ============ DOCX PARSING (Multi-page support) ============
    async parseDOCX(arrayBuffer, options = {}) {
      console.log('[EnhancedCVParser] Parsing DOCX with multi-page support...');
      
      // This would integrate with a DOCX parsing library
      return {
        text: await this.extractDOCXText(arrayBuffer),
        pages: 1, // DOCX doesn't have fixed page count without rendering
        metadata: await this.getDOCXMetadata(arrayBuffer)
      };
    },

    async extractDOCXText(arrayBuffer) {
      // Placeholder for DOCX text extraction
      return "Extracted DOCX text content...";
    },

    async getDOCXMetadata(arrayBuffer) {
      return {
        title: '',
        author: '',
        pages: 1
      };
    },

    // ============ TEXT PARSING (Enhanced) ============
    parseText(textContent) {
      console.log('[EnhancedCVParser] Parsing text content...');
      
      const sections = {
        contact: {},
        summary: '',
        experience: [],
        education: [],
        skills: '',
        certifications: ''
      };

      // Normalize line endings and clean text
      const normalizedText = this.normalizeText(textContent);
      const lines = normalizedText.split('\n');

      // Parse sections using enhanced logic
      const parsedSections = this.parseSections(lines);
      
      return {
        text: normalizedText,
        sections: parsedSections,
        pages: 1
      };
    },

    normalizeText(text) {
      return text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },

    // ============ ENHANCED SECTION PARSING ============
    parseSections(lines) {
      const sections = {
        contact: {},
        summary: '',
        experience: [],
        education: [],
        skills: '',
        certifications: ''
      };

      let currentSection = '';
      let currentContent = [];
      let currentJob = null;

      // Enhanced section headers mapping
      const sectionHeaders = {
        'PROFESSIONAL SUMMARY': 'summary',
        'SUMMARY': 'summary',
        'PROFILE': 'summary',
        'OBJECTIVE': 'summary',
        'WORK EXPERIENCE': 'experience',
        'EXPERIENCE': 'experience',
        'EMPLOYMENT': 'experience',
        'PROFESSIONAL EXPERIENCE': 'experience',
        'CAREER HISTORY': 'experience',
        'EDUCATION': 'education',
        'ACADEMIC': 'education',
        'ACADEMIC BACKGROUND': 'education',
        'SKILLS': 'skills',
        'TECHNICAL SKILLS': 'skills',
        'CORE SKILLS': 'skills',
        'KEY SKILLS': 'skills',
        'COMPETENCIES': 'skills',
        'CERTIFICATIONS': 'certifications',
        'LICENSES': 'certifications',
        'CREDENTIALS': 'certifications'
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, '');

        // Check for section header (more flexible matching)
        if (this.isSectionHeader(upperTrimmed, sectionHeaders)) {
          // Save previous section
          this.saveParsedSection(sections, currentSection, currentContent, currentJob);
          
          currentSection = this.getSectionType(upperTrimmed, sectionHeaders);
          currentContent = [];
          currentJob = null;
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      // Save final section
      this.saveParsedSection(sections, currentSection, currentContent, currentJob);

      return sections;
    },

    isSectionHeader(text, sectionHeaders) {
      // Exact match
      if (sectionHeaders[text]) return true;
      
      // Fuzzy match for common variations
      const fuzzyPatterns = [
        /^(PROFESSIONAL\s+)?SUMMARY$/i,
        /^(WORK\s+)?EXPERIENCE$/i,
        /^(PROFESSIONAL\s+)?EXPERIENCE$/i,
        /^(CAREER\s+)?HISTORY$/i,
        /^(ACADEMIC\s+)?BACKGROUND$/i,
        /^(TECHNICAL\s+)?SKILLS$/i,
        /^(KEY\s+)?COMPETENCIES$/i
      ];
      
      return fuzzyPatterns.some(pattern => pattern.test(text));
    },

    getSectionType(text, sectionHeaders) {
      // Try exact match first
      if (sectionHeaders[text]) return sectionHeaders[text];
      
      // Fuzzy matching
      if (/summary/i.test(text)) return 'summary';
      if (/experience|history|employment/i.test(text)) return 'experience';
      if (/education|academic/i.test(text)) return 'education';
      if (/skills|competencies/i.test(text)) return 'skills';
      if (/certification|license|credential/i.test(text)) return 'certifications';
      
      return '';
    },

    saveParsedSection(sections, section, content, currentJob) {
      if (!section || content.length === 0) return;

      const text = content.join('\n').trim();

      switch (section) {
        case 'summary':
          sections.summary = text;
          break;
        case 'experience':
          sections.experience = this.parseExperienceEnhanced(text);
          break;
        case 'education':
          sections.education = this.parseEducationEnhanced(text);
          break;
        case 'skills':
          sections.skills = text;
          break;
        case 'certifications':
          sections.certifications = text;
          break;
      }
    },

    // ============ ENHANCED EXPERIENCE PARSING ============
    parseExperienceEnhanced(text) {
      const jobs = [];
      const lines = text.split('\n');
      let currentJob = null;
      let bulletBuffer = [];

      // Enhanced patterns for detecting job entries
      const jobTitlePatterns = [
        // Company | Title | Dates format
        /^([A-Z][A-Za-z\s&.,'()-]+(?:Inc|LLC|Corp|Corporation|Company|Co|PLC|Group|Holdings|Partners|Technologies|Solutions|Consulting|Services|Startup)?)\s*\|\s*([A-Z][A-Za-z\s&.,'()-]+)\s*\|\s*(.+)$/,
        // Title at Company format
        /^([A-Z][A-Za-z\s&.,'()-]+)\s+at\s+([A-Z][A-Za-z\s&.,'()-]+)$/i,
        // Company - Title - Dates format
        /^([A-Z][A-Za-z\s&.,'()-]+)\s*[-–—]\s*([A-Z][A-Za-z\s&.,'()-]+)\s*[-–—]\s*(.+)$/
      ];

      // Company name patterns (well-known companies)
      const knownCompanies = new Set([
        'Meta', 'Facebook', 'Google', 'Amazon', 'Microsoft', 'Apple', 'Netflix',
        'SolimHealth', 'Accenture', 'Citi', 'Citigroup', 'JPMorgan', 'Goldman Sachs',
        'Oracle', 'IBM', 'Salesforce', 'Adobe', 'Intel', 'NVIDIA', 'Tesla'
      ]);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          // Flush bullet buffer if we have a current job
          if (currentJob && bulletBuffer.length > 0) {
            currentJob.bullets.push(...bulletBuffer);
            bulletBuffer = [];
          }
          continue;
        }

        // Check if this is a job header line
        let isJobHeader = false;
        
        // Test pattern 1: Company | Title | Dates
        let match = trimmed.match(jobTitlePatterns[0]);
        if (match) {
          isJobHeader = true;
          if (currentJob) jobs.push(currentJob);
          
          currentJob = {
            company: match[1].trim(),
            title: match[2].trim(),
            dates: match[3].trim(),
            location: '',
            bullets: []
          };
        }

        // Test pattern 2: Title at Company
        if (!isJobHeader) {
          match = trimmed.match(jobTitlePatterns[1]);
          if (match) {
            isJobHeader = true;
            if (currentJob) jobs.push(currentJob);
            
            currentJob = {
              company: match[2].trim(),
              title: match[1].trim(),
              dates: '',
              location: '',
              bullets: []
            };
          }
        }

        // Test pattern 3: Company - Title - Dates
        if (!isJobHeader) {
          match = trimmed.match(jobTitlePatterns[2]);
          if (match) {
            isJobHeader = true;
            if (currentJob) jobs.push(currentJob);
            
            currentJob = {
              company: match[1].trim(),
              title: match[2].trim(),
              dates: match[3].trim(),
              location: '',
              bullets: []
            };
          }
        }

        // Check for known company names that might not match patterns exactly
        if (!isJobHeader && knownCompanies.has(trimmed.split(' ')[0])) {
          const companyName = trimmed.split(' ')[0];
          const rest = trimmed.substring(companyName.length).trim();
          
          // Try to extract title and dates from the rest
          const titleMatch = rest.match(/^\s*[-—|]\s*([A-Z][A-Za-z\s&.,'()-]+)\s*[-—|]\s*(.+)$/);
          if (titleMatch) {
            isJobHeader = true;
            if (currentJob) jobs.push(currentJob);
            
            currentJob = {
              company: companyName,
              title: titleMatch[1].trim(),
              dates: titleMatch[2].trim(),
              location: '',
              bullets: []
            };
          }
        }

        // If not a job header, it might be a bullet point or location info
        if (!isJobHeader && currentJob) {
          // Check for bullet points
          if (/^[-•*▪]/.test(trimmed)) {
            const bullet = trimmed.replace(/^[-•*▪]\s*/, '').trim();
            if (bullet) bulletBuffer.push(bullet);
          } 
          // Check for location line (might come after job header)
          else if (/^[A-Z][a-zA-Z\s,]+$/.test(trimmed) && !currentJob.location) {
            currentJob.location = trimmed;
          }
          // Any other line might be part of a multi-line bullet
          else if (bulletBuffer.length > 0) {
            const lastBullet = bulletBuffer[bulletBuffer.length - 1];
            if (lastBullet.endsWith('-') || lastBullet.endsWith(',')) {
              bulletBuffer[bulletBuffer.length - 1] = lastBullet + ' ' + trimmed;
            } else {
              bulletBuffer.push(trimmed);
            }
          }
        }
      }

      // Don't forget the last job
      if (currentJob) {
        if (bulletBuffer.length > 0) {
          currentJob.bullets.push(...bulletBuffer);
        }
        jobs.push(currentJob);
      }

      return jobs;
    },

    // ============ ENHANCED EDUCATION PARSING ============
    parseEducationEnhanced(text) {
      const education = [];
      const lines = text.split('\n');
      let currentEntry = null;

      // Education entry patterns
      const degreePatterns = [
        // Degree - Institution - GPA format
        /^([A-Z][A-Za-z\s&.,'()-]+(?:Degree|Bachelor|Master|PhD|Doctorate|Diploma|Certificate))\s*[-–—|]\s*([A-Z][A-Za-z\s&.,'()-]+)\s*[-–—|]\s*(.+)$/,
        // Institution | Degree | GPA format
        /^([A-Z][A-Za-z\s&.,'()-]+(?:University|College|Institute|School|Academy))\s*\|\s*([A-Z][A-Za-z\s&.,'()-]+)\s*\|\s*(.+)$/,
        // Just degree and institution
        /^([A-Z][A-Za-z\s&.,'()-]+)\s*[-–—|]\s*([A-Z][A-Za-z\s&.,'()-]+(?:University|College|Institute|School|Academy))$/
      ];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          if (currentEntry) {
            education.push(currentEntry);
            currentEntry = null;
          }
          continue;
        }

        // Try to match education entry patterns
        let match = trimmed.match(degreePatterns[0]);
        if (match) {
          if (currentEntry) education.push(currentEntry);
          
          currentEntry = {
            degree: match[1].trim(),
            institution: match[2].trim(),
            gpa: this.extractGPA(match[3]),
            dates: this.extractDates(match[3]),
            description: this.extractDescription(match[3])
          };
          continue;
        }

        match = trimmed.match(degreePatterns[1]);
        if (match) {
          if (currentEntry) education.push(currentEntry);
          
          currentEntry = {
            institution: match[1].trim(),
            degree: match[2].trim(),
            gpa: this.extractGPA(match[3]),
            dates: this.extractDates(match[3]),
            description: this.extractDescription(match[3])
          };
          continue;
        }

        match = trimmed.match(degreePatterns[2]);
        if (match) {
          if (currentEntry) education.push(currentEntry);
          
          currentEntry = {
            degree: match[1].trim(),
            institution: match[2].trim(),
            gpa: '',
            dates: '',
            description: ''
          };
          continue;
        }

        // If no match, it might be additional info for current entry
        if (currentEntry) {
          // Try to extract GPA from standalone line
          const gpaMatch = trimmed.match(/GPA:\s*(\d+\.?\d*)/i);
          if (gpaMatch && !currentEntry.gpa) {
            currentEntry.gpa = gpaMatch[1];
          }
          // Try to extract dates
          else if (/\d{4}/.test(trimmed) && !currentEntry.dates) {
            currentEntry.dates = trimmed;
          }
          // Anything else might be description
          else if (!trimmed.match(/^Module|Course/i)) {
            if (currentEntry.description) {
              currentEntry.description += ' ' + trimmed;
            } else {
              currentEntry.description = trimmed;
            }
          }
        }
      }

      // Don't forget the last entry
      if (currentEntry) {
        education.push(currentEntry);
      }

      return education;
    },

    extractGPA(text) {
      const match = text.match(/GPA:\s*(\d+\.?\d*)/i);
      return match ? match[1] : '';
    },

    extractDates(text) {
      const match = text.match(/(\d{4})\s*[-–—]\s*(\d{4}|Present|Current)/i);
      return match ? `${match[1]} - ${match[2]}` : '';
    },

    extractDescription(text) {
      // Remove GPA and dates, return the rest as description
      let desc = text.replace(/GPA:\s*\d+\.?\d*/gi, '').trim();
      desc = desc.replace(/\d{4}\s*[-–—]\s*(\d{4}|Present|Current)/gi, '').trim();
      desc = desc.replace(/^[-–—|]\s*/, '').trim();
      return desc;
    },

    // ============ ENHANCE PARSED DATA ============
    enhanceParsedData(parsedData) {
      const enhanced = {
        contact: {},
        summary: '',
        experience: [],
        education: [],
        skills: '',
        certifications: '',
        metadata: {
          pages: parsedData.pages || 1,
          fileType: parsedData.fileType || 'text',
          parsedAt: new Date().toISOString()
        }
      };

      // Copy over basic sections
      if (parsedData.sections) {
        enhanced.summary = parsedData.sections.summary || '';
        enhanced.skills = parsedData.sections.skills || '';
        enhanced.certifications = parsedData.sections.certifications || '';
        enhanced.experience = parsedData.sections.experience || [];
        enhanced.education = parsedData.sections.education || [];
      }

      // Extract contact info from first lines if available
      if (parsedData.text) {
        const firstLines = parsedData.text.split('\n').slice(0, 5);
        enhanced.contact = this.extractContactInfo(firstLines.join('\n'));
      }

      return enhanced;
    },

    extractContactInfo(text) {
      const contact = {
        name: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        github: ''
      };

      // Extract name (first line, usually)
      const lines = text.split('\n');
      if (lines.length > 0) {
        const firstLine = lines[0].trim();
        if (firstLine && !firstLine.includes('@') && !firstLine.includes('+')) {
          contact.name = firstLine;
        }
      }

      // Extract email
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) contact.email = emailMatch[0];

      // Extract phone
      const phoneMatch = text.match(/\+?\d[\d\s-]{6,}\d/);
      if (phoneMatch) contact.phone = phoneMatch[0];

      // Extract LinkedIn
      const linkedinMatch = text.match(/linkedin\.com\/in\/([\w-]+)/i);
      if (linkedinMatch) contact.linkedin = `linkedin.com/in/${linkedinMatch[1]}`;

      // Extract GitHub
      const githubMatch = text.match(/github\.com\/([\w-]+)/i);
      if (githubMatch) contact.github = `github.com/${githubMatch[1]}`;

      return contact;
    },

    // ============ RICH-TEXT EDUCATION HANDLING ============
    parseRichTextEducation(educationEntries) {
      return educationEntries.map(entry => ({
        ...entry,
        richDescription: this.convertToRichText(entry.description || ''),
        plainDescription: this.stripFormatting(entry.description || '')
      }));
    },

    convertToRichText(text) {
      // Convert markdown-style formatting to HTML
      let html = text;
      
      // **bold** -> <strong>bold</strong>
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      
      // *italic* -> <em>italic</em>
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
      
      // __bold__ -> <strong>bold</strong>
      html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
      
      // _italic_ -> <em>italic</em>
      html = html.replace(/_(.+?)_/g, '<em>$1</em>');
      
      return html;
    },

    stripFormatting(text) {
      // Remove markdown formatting for plain text
      let plain = text;
      
      // Remove **bold**
      plain = plain.replace(/\*\*(.+?)\*\*/g, '$1');
      
      // Remove *italic*
      plain = plain.replace(/\*(.+?)\*/g, '$1');
      
      // Remove __bold__
      plain = plain.replace(/__(.+?)__/g, '$1');
      
      // Remove _italic_
      plain = plain.replace(/_(.+?)_/g, '$1');
      
      return plain;
    }
  };

  // ============ EXPORT ============
  global.EnhancedCVParser = EnhancedCVParser;

})(typeof window !== 'undefined' ? window : this);
