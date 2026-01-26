const fs = require('fs');
const path = require('path');

class OpenResumeGenerator {
  constructor() {
    this.outputDir = path.join(process.cwd(), 'output');
    this.ensureOutputDirectory();
  }

  ensureOutputDirectory() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  // FIXED: Proper company name replacement with case-insensitive global replacement
  replaceCompanyName(content, companyName) {
    if (!companyName || companyName.trim() === '') {
      console.warn('⚠️  No company name provided, using placeholder');
      return content;
    }

    // Clean the company name
    const cleanCompanyName = companyName.trim();
    
    // Multiple replacement strategies to catch all variations
    const replacements = [
      // Direct placeholders (various formats)
      { pattern: /\[Company Name\]/gi, replacement: cleanCompanyName },
      { pattern: /\[company name\]/gi, replacement: cleanCompanyName },
      { pattern: /\[COMPANY NAME\]/gi, replacement: cleanCompanyName },
      
      // Without brackets (various formats)  
      { pattern: /Company Name/gi, replacement: cleanCompanyName },
      { pattern: /company name/gi, replacement: cleanCompanyName },
      
      // Handle possessive forms
      { pattern: new RegExp(`\\[${cleanCompanyName}\\]'s`, 'gi'), replacement: `${cleanCompanyName}'s` },
      { pattern: new RegExp(`${cleanCompanyName}'s`, 'gi'), replacement: `${cleanCompanyName}'s` },
      
      // Handle "the company" references
      { pattern: /the company/gi, replacement: cleanCompanyName },
      { pattern: /The company/gi, replacement: cleanCompanyName },
      { pattern: /The Company/gi, replacement: cleanCompanyName },
    ];

    let result = content;
    
    // Apply all replacements
    replacements.forEach(({ pattern, replacement }) => {
      result = result.replace(pattern, replacement);
    });

    // Log what was replaced for debugging
    if (result !== content) {
      console.log(`✅ Company name replaced with: "${cleanCompanyName}"`);
    } else {
      console.log(`ℹ️  No company name placeholders found to replace`);
    }

    return result;
  }

  // FIXED: Separate skills and certifications to prevent cross-contamination
  generateResume(userData) {
    console.log('📄 Generating professional resume...');

    // Separate skills and certifications properly
    const skills = userData.skills || [];
    const certifications = userData.certifications || [];
    
    // Ensure skills are NOT added to certifications section
    const cleanCertifications = certifications.filter(cert => {
      // Filter out any skill-like items that might have been mixed in
      const isSkillLike = typeof cert === 'string' && (
        cert.length < 10 || // Certifications usually have longer names
        !cert.includes(' ') || // Certifications usually have spaces
        skills.some(skill => skill.toLowerCase() === cert.toLowerCase())
      );
      return !isSkillLike;
    });

    // Build resume HTML with proper separation
    const resumeHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${userData.name || 'Professional Resume'} - Resume</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
        .resume { max-width: 850px; margin: 0 auto; background: white; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 40px; text-align: center; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { font-size: 1.1rem; opacity: 0.9; }
        .contact { display: flex; justify-content: center; gap: 20px; margin-top: 20px; flex-wrap: wrap; }
        .contact span { font-size: 0.9rem; }
        .section { padding: 30px 40px; border-bottom: 1px solid #eee; }
        .section:last-child { border-bottom: none; }
        .section h2 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px; }
        .job { margin-bottom: 25px; }
        .job-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; flex-wrap: wrap; }
        .job-title { font-weight: bold; color: #2c3e50; font-size: 1.1rem; }
        .job-company { font-style: italic; color: #7f8c8d; }
        .job-date { color: #7f8c8d; font-size: 0.9rem; }
        .job ul { margin: 10px 0 0 20px; }
        .job li { margin-bottom: 5px; }
        .education-item { margin-bottom: 15px; }
        .education-header { display: flex; justify-content: space-between; flex-wrap: wrap; }
        .education-degree { font-weight: bold; color: #2c3e50; }
        .education-school { font-style: italic; color: #7f8c8d; }
        .skills-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .skill-category h4 { color: #2c3e50; margin-bottom: 10px; }
        .skill-category ul { list-style: none; }
        .skill-category li { background: #ecf0f1; padding: 5px 10px; margin-bottom: 5px; border-radius: 3px; font-size: 0.9rem; }
        .cert-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; }
        .cert-item { background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #3498db; }
        .cert-name { font-weight: bold; color: #2c3e50; }
        .cert-issuer { font-size: 0.9rem; color: #7f8c8d; }
        .cert-date { font-size: 0.8rem; color: #95a5a6; }
        
        @media print {
            body { background: white; }
            .resume { box-shadow: none; }
            .section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="resume">
        <!-- Header -->
        <div class="header">
            <h1>${userData.name || 'Professional Candidate'}</h1>
            <p>${userData.title || 'Software Engineer'}</p>
            <div class="contact">
                ${userData.email ? `<span>📧 ${userData.email}</span>` : ''}
                ${userData.phone ? `<span>📞 ${userData.phone}</span>` : ''}
                ${userData.location ? `<span>📍 ${userData.location}</span>` : ''}
                ${userData.linkedin ? `<span>🔗 LinkedIn</span>` : ''}
            </div>
        </div>

        <!-- Professional Summary -->
        <div class="section">
            <h2>Professional Summary</h2>
            <p>${userData.summary || 'Results-driven software engineer with expertise in full-stack development, passionate about building scalable applications and solving complex problems.'}</p>
        </div>

        <!-- Experience -->
        <div class="section">
            <h2>Professional Experience</h2>
            ${(userData.experience || []).map(job => `
                <div class="job">
                    <div class="job-header">
                        <div>
                            <div class="job-title">${job.title || 'Software Engineer'}</div>
                            <div class="job-company">${job.company || 'Company Name'}</div>
                        </div>
                        <div class="job-date">${job.duration || 'Present'}</div>
                    </div>
                    <ul>
                        ${(job.achievements || job.responsibilities || ['Led development of key features', 'Collaborated with cross-functional teams', 'Improved application performance']).map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>

        <!-- Education -->
        <div class="section">
            <h2>Education</h2>
            ${(userData.education || []).map(edu => `
                <div class="education-item">
                    <div class="education-header">
                        <div>
                            <div class="education-degree">${edu.degree || 'Bachelor of Science in Computer Science'}</div>
                            <div class="education-school">${edu.school || 'University Name'}</div>
                        </div>
                        <div class="education-date">${edu.year || 'Graduated'}</div>
                    </div>
                </div>
            `).join('')}
        </div>

        <!-- Skills - FIXED: Properly separated from certifications -->
        <div class="section">
            <h2>Technical Skills</h2>
            <div class="skills-grid">
                ${Object.entries(this.categorizeSkills(skills)).map(([category, skillList]) => `
                    <div class="skill-category">
                        <h4>${category}</h4>
                        <ul>
                            ${skillList.map(skill => `<li>${skill}</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Certifications - FIXED: No skills contamination -->
        ${cleanCertifications.length > 0 ? `
        <div class="section">
            <h2>Certifications</h2>
            <div class="cert-list">
                ${cleanCertifications.map(cert => {
                  if (typeof cert === 'string') {
                    return `<div class="cert-item">
                                <div class="cert-name">${cert}</div>
                                <div class="cert-issuer">Professional Certification</div>
                            </div>`;
                  } else {
                    return `<div class="cert-item">
                                <div class="cert-name">${cert.name || 'Certification'}</div>
                                <div class="cert-issuer">${cert.issuer || 'Issuing Organization'}</div>
                                ${cert.date ? `<div class="cert-date">${cert.date}</div>` : ''}
                            </div>`;
                  }
                }).join('')}
            </div>
        </div>
        ` : ''}
    </div>
</body>
</html>`;

    // Save resume
    const resumePath = path.join(this.outputDir, 'resume.html');
    fs.writeFileSync(resumePath, resumeHTML);
    
    console.log('✅ Resume generated successfully');
    return resumeHTML;
  }

  // FIXED: Enhanced cover letter generation with proper company name handling
  generateCoverLetter(userData, companyName) {
    console.log(`📝 Generating cover letter for ${companyName || 'target company'}...`);

    // Professional cover letter template
    let coverHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cover Letter - ${companyName || 'Company Name'}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
        .cover-letter { max-width: 800px; margin: 0 auto; background: white; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { padding: 40px; background: #f8f9fa; border-bottom: 3px solid #3498db; }
        .header h1 { color: #2c3e50; margin-bottom: 10px; }
        .contact-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 20px; }
        .contact-item { font-size: 0.9rem; color: #7f8c8d; }
        .date { padding: 20px 40px 0; color: #7f8c8d; font-style: italic; }
        .recipient { padding: 20px 40px; }
        .recipient p { margin-bottom: 5px; }
        .body { padding: 0 40px 40px; }
        .body p { margin-bottom: 20px; text-align: justify; }
        .closing { padding: 0 40px 40px; }
        .closing p { margin-bottom: 10px; }
        .signature { margin-top: 40px; font-weight: bold; color: #2c3e50; }
        
        @media print {
            body { background: white; }
            .cover-letter { box-shadow: none; }
        }
    </style>
</head>
<body>
    <div class="cover-letter">
        <!-- Header with applicant info -->
        <div class="header">
            <h1>${userData.name || 'Professional Candidate'}</h1>
            <p>${userData.title || 'Software Engineer'}</p>
            <div class="contact-info">
                ${userData.email ? `<div class="contact-item">📧 ${userData.email}</div>` : ''}
                ${userData.phone ? `<div class="contact-item">📞 ${userData.phone}</div>` : ''}
                ${userData.location ? `<div class="contact-item">📍 ${userData.location}</div>` : ''}
                ${userData.linkedin ? `<div class="contact-item">🔗 LinkedIn</div>` : ''}
            </div>
        </div>

        <!-- Date -->
        <div class="date">
            ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>

        <!-- Recipient -->
        <div class="recipient">
            <p><strong>Hiring Manager</strong></p>
            <p>${companyName || 'Company Name'}</p>
            <p>${userData.location || 'Company Location'}</p>
        </div>

        <!-- Letter Body -->
        <div class="body">
            <p>Dear Hiring Manager,</p>
            
            <p>I am writing to express my strong interest in the Software Engineer position at ${companyName || 'your company'}. With my background in full-stack development and passion for building scalable applications, I am confident I would be a valuable addition to your engineering team.</p>
            
            <p>In my previous roles, I have successfully delivered complex projects using modern technologies including JavaScript, React, Node.js, and cloud platforms. I am particularly drawn to ${companyName || 'your company'}'s commitment to innovation and would be excited to contribute to your continued success.</p>
            
            <p>My technical expertise includes developing RESTful APIs, implementing responsive user interfaces, and collaborating with cross-functional teams to deliver high-quality software solutions. I am a strong believer in clean code practices, automated testing, and continuous improvement.</p>
            
            <p>I would welcome the opportunity to discuss how my skills and experience align with your team's needs. Thank you for considering my application, and I look forward to the possibility of contributing to ${companyName || 'your company'}'s continued growth.</p>
        </div>

        <!-- Closing -->
        <div class="closing">
            <p>Sincerely,</p>
            <div class="signature">
                ${userData.name || 'Professional Candidate'}
            </div>
        </div>
    </div>
</body>
</html>`;

    // FIXED: Apply company name replacement
    if (companyName) {
      coverHTML = this.replaceCompanyName(coverHTML, companyName);
    }

    // Save cover letter
    const coverLetterPath = path.join(this.outputDir, 'cover-letter.html');
    fs.writeFileSync(coverLetterPath, coverHTML);
    
    console.log('✅ Cover letter generated successfully');
    return coverHTML;
  }

  // Helper method to categorize skills
  categorizeSkills(skills) {
    const categories = {
      'Languages': [],
      'Frameworks': [],
      'Databases': [],
      'Tools': [],
      'Other': []
    };

    const skillCategories = {
      'Languages': ['javascript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'typescript', 'php', 'ruby', 'swift', 'kotlin'],
      'Frameworks': ['react', 'angular', 'vue', 'express', 'django', 'spring', 'laravel', 'rails', 'next.js', 'nuxt.js'],
      'Databases': ['mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'oracle', 'cassandra'],
      'Tools': ['git', 'docker', 'kubernetes', 'jenkins', 'aws', 'azure', 'gcp', 'terraform']
    };

    skills.forEach(skill => {
      const skillLower = skill.toLowerCase();
      let categorized = false;
      
      for (const [category, keywords] of Object.entries(skillCategories)) {
        if (keywords.some(keyword => skillLower.includes(keyword))) {
          categories[category].push(skill);
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        categories['Other'].push(skill);
      }
    });

    // Remove empty categories
    return Object.fromEntries(
      Object.entries(categories).filter(([_, items]) => items.length > 0)
    );
  }

  // Generate complete application package
  generateApplication(userData, companyName) {
    console.log(`🚀 Generating complete application package for ${companyName || 'target company'}...`);
    
    const results = {
      resume: this.generateResume(userData),
      coverLetter: this.generateCoverLetter(userData, companyName),
      timestamp: new Date().toISOString()
    };
    
    console.log('🎉 Application package generated successfully!');
    return results;
  }
}

module.exports = OpenResumeGenerator;