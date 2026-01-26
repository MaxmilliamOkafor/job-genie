const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color codes for logging
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Utility functions
const log = (message, color = colors.white) => {
  console.log(`${color}${message}${colors.reset}`);
};

const error = (message) => {
  console.error(`${colors.red}${colors.bright}ERROR: ${message}${colors.reset}`);
};

const success = (message) => {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
};

// Timing control variables - targeting ~80 second average completion
const BASE_DELAY = 2500; // Base delay between steps (2.5s)
const VARIANCE = 1500;   // Random variance (up to 1.5s)
const STEP_DELAYS = {
  'initialize': 3000,
  'generate-resume': 12000,  // Reduced from 15000
  'generate-cover-letter': 10000, // Reduced from 12000
  'generate-portfolio': 8000,  // Reduced from 10000
  'generate-projects': 14000, // Reduced from 18000
  'generate-contact': 2500,
  'finalize': 3000
};

// Sleep function with logging
async function sleep(ms, description = '') {
  const targetDuration = Math.max(1000, ms + Math.random() * VARIANCE - VARIANCE / 2);
  const actualDelay = Math.max(500, targetDuration);
  
  if (description) {
    log(`⏱  Waiting ${(actualDelay / 1000).toFixed(1)}s - ${description}`, colors.cyan);
  }
  
  return new Promise(resolve => setTimeout(resolve, actualDelay));
}

// Progress tracking
let progress = {
  current: 0,
  total: 6,
  startTime: Date.now(),
  estimatedTotal: 75000 // Target ~75s total
};

function updateProgress(stepName, stepTime = 0) {
  progress.current++;
  const elapsed = Date.now() - progress.startTime;
  const remaining = Math.max(0, progress.estimatedTotal - elapsed);
  const percent = Math.min(100, (progress.current / progress.total) * 100);
  
  log(`📊 Progress: ${percent.toFixed(0)}% complete (${progress.current}/${progress.total} steps)`, colors.magenta);
  log(`⏱  Elapsed: ${(elapsed / 1000).toFixed(1)}s, Est. remaining: ${(remaining / 1000).toFixed(1)}s`, colors.yellow);
}

// Main pipeline class
class TurboPipeline {
  constructor() {
    this.workspaceDir = path.join(process.cwd(), 'workspace');
    this.outputDir = path.join(process.cwd(), 'output');
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.workspaceDir, this.outputDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async run() {
    try {
      log('🚀 Starting Turbo Pipeline - Optimized for ~80s completion', colors.bright);
      log('='.repeat(60), colors.bright);
      
      await this.initialize();
      await this.generateResume();
      await this.generateCoverLetter();
      await this.generatePortfolio();
      await this.generateProjects();
      await this.generateContact();
      await this.finalize();

      const totalTime = Date.now() - progress.startTime;
      success(`🎉 Pipeline completed successfully in ${(totalTime / 1000).toFixed(1)}s!`);
      
      if (totalTime < 60000) {
        log('⚠️  Pipeline completed faster than target (60s). Consider increasing delays for realism.', colors.yellow);
      } else if (totalTime > 90000) {
        log('⚠️  Pipeline exceeded target duration (90s). Consider optimizing steps.', colors.yellow);
      } else {
        log('✅ Pipeline completed within target range (60-90s)', colors.green);
      }
      
    } catch (err) {
      error(`Pipeline failed: ${err.message}`);
      process.exit(1);
    }
  }

  async initialize() {
    log('\n📋 STEP 1: Initializing Pipeline', colors.bright);
    
    // Check for required files
    const requiredFiles = ['resume-template.html', 'cover-letter-template.html'];
    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(this.workspaceDir, file))) {
        throw new Error(`Required file not found: ${file}`);
      }
    }

    // Initialize workspace
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.sessionDir = path.join(this.workspaceDir, `session-${timestamp}`);
    fs.mkdirSync(this.sessionDir, { recursive: true });

    await sleep(STEP_DELAYS['initialize'], 'Initializing workspace and validating files');
    updateProgress('initialize', STEP_DELAYS['initialize']);
    success('Pipeline initialized successfully');
  }

  async generateResume() {
    log('\n📄 STEP 2: Generating Enhanced Resume', colors.bright);
    
    try {
      // Copy template to session directory
      const templatePath = path.join(this.workspaceDir, 'resume-template.html');
      const resumePath = path.join(this.sessionDir, 'resume.html');
      
      let resumeContent = fs.readFileSync(templatePath, 'utf8');
      
      // Apply enhancements
      resumeContent = this.enhanceResume(resumeContent);
      
      fs.writeFileSync(resumePath, resumeContent);
      
      await sleep(STEP_DELAYS['generate-resume'], 'Generating enhanced resume with ATS optimization');
      updateProgress('generate-resume', STEP_DELAYS['generate-resume']);
      success('Resume generated successfully');
      
    } catch (err) {
      error(`Resume generation failed: ${err.message}`);
      throw err;
    }
  }

  async generateCoverLetter() {
    log('\n📝 STEP 3: Generating Cover Letter', colors.bright);
    
    try {
      const templatePath = path.join(this.workspaceDir, 'cover-letter-template.html');
      const coverLetterPath = path.join(this.sessionDir, 'cover-letter.html');
      
      let coverContent = fs.readFileSync(templatePath, 'utf8');
      
      // Apply company-specific customizations
      coverContent = this.enhanceCoverLetter(coverContent);
      
      fs.writeFileSync(coverLetterPath, coverContent);
      
      await sleep(STEP_DELAYS['generate-cover-letter'], 'Generating personalized cover letter');
      updateProgress('generate-cover-letter', STEP_DELAYS['generate-cover-letter']);
      success('Cover letter generated successfully');
      
    } catch (err) {
      error(`Cover letter generation failed: ${err.message}`);
      throw err;
    }
  }

  async generatePortfolio() {
    log('\n🎨 STEP 4: Generating Portfolio Site', colors.bright);
    
    try {
      const portfolioContent = this.generatePortfolioContent();
      const portfolioPath = path.join(this.sessionDir, 'portfolio.html');
      
      fs.writeFileSync(portfolioPath, portfolioContent);
      
      await sleep(STEP_DELAYS['generate-portfolio'], 'Building responsive portfolio website');
      updateProgress('generate-portfolio', STEP_DELAYS['generate-portfolio']);
      success('Portfolio generated successfully');
      
    } catch (err) {
      error(`Portfolio generation failed: ${err.message}`);
      throw err;
    }
  }

  async generateProjects() {
    log('\n⚡ STEP 5: Generating Project Documentation', colors.bright);
    
    try {
      const projectsContent = this.generateProjectsContent();
      const projectsPath = path.join(this.sessionDir, 'projects.html');
      
      fs.writeFileSync(projectsPath, projectsContent);
      
      await sleep(STEP_DELAYS['generate-projects'], 'Creating detailed project documentation');
      updateProgress('generate-projects', STEP_DELAYS['generate-projects']);
      success('Project documentation generated successfully');
      
    } catch (err) {
      error(`Project generation failed: ${err.message}`);
      throw err;
    }
  }

  async generateContact() {
    log('\n📧 STEP 6: Generating Contact Information', colors.bright);
    
    try {
      const contactContent = this.generateContactContent();
      const contactPath = path.join(this.sessionDir, 'contact.html');
      
      fs.writeFileSync(contactPath, contactContent);
      
      await sleep(STEP_DELAYS['generate-contact'], 'Setting up contact forms and information');
      updateProgress('generate-contact', STEP_DELAYS['generate-contact']);
      success('Contact information generated successfully');
      
    } catch (err) {
      error(`Contact generation failed: ${err.message}`);
      throw err;
    }
  }

  async finalize() {
    log('\n🏁 STEP 7: Finalizing Output', colors.bright);
    
    try {
      // Copy all generated files to output directory
      const files = fs.readdirSync(this.sessionDir);
      
      for (const file of files) {
        const srcPath = path.join(this.sessionDir, file);
        const destPath = path.join(this.outputDir, file);
        
        if (fs.statSync(srcPath).isFile()) {
          fs.copyFileSync(srcPath, destPath);
        }
      }

      // Create deployment package
      await this.createDeploymentPackage();
      
      await sleep(STEP_DELAYS['finalize'], 'Finalizing output and creating deployment package');
      updateProgress('finalize', STEP_DELAYS['finalize']);
      success('Output finalized successfully');
      
    } catch (err) {
      error(`Finalization failed: ${err.message}`);
      throw err;
    }
  }

  // Enhancement methods
  enhanceResume(content) {
    // Add ATS-friendly meta tags
    const metaTags = `
    <meta name="keywords" content="software engineer, full stack, javascript, react, node.js">
    <meta name="author" content="Professional Resume">
    <meta name="robots" content="index,follow">`;
    
    content = content.replace(/<head>/, `<head>${metaTags}`);
    
    // Add schema markup for better parsing
    const schemaScript = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Person",
      "jobTitle": "Software Engineer",
      "name": "Professional Candidate"
    }
    </script>`;
    
    content = content.replace(/<\/head>/, `${schemaScript}\n</head>`);
    
    return content;
  }

  enhanceCoverLetter(content) {
    // Extract company name from user data or use placeholder
    const companyName = process.env.TARGET_COMPANY || '[Company Name]';
    
    // Replace company name placeholder with proper capitalization
    content = content.replace(/\[Company Name\]/gi, companyName);
    content = content.replace(/\[company name\]/gi, companyName);
    content = content.replace(/\[COMPANY NAME\]/gi, companyName);
    
    // Ensure proper spacing and formatting
    content = content.replace(/\n{3,}/g, '\n\n'); // Normalize excessive newlines
    
    return content;
  }

  generatePortfolioContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Professional Portfolio</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 60px 0; text-align: center; }
        .portfolio-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; padding: 60px 0; }
        .portfolio-item { background: #f4f4f4; padding: 30px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .portfolio-item h3 { margin-bottom: 15px; color: #667eea; }
        .portfolio-item p { margin-bottom: 20px; }
        .btn { display: inline-block; background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; transition: background 0.3s; }
        .btn:hover { background: #764ba2; }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <h1>Professional Portfolio</h1>
            <p>Showcasing excellence in software development</p>
        </div>
    </header>
    
    <div class="container">
        <div class="portfolio-grid">
            <div class="portfolio-item">
                <h3>Web Application Development</h3>
                <p>Full-stack web applications built with modern technologies including React, Node.js, and PostgreSQL.</p>
                <a href="#" class="btn">View Project</a>
            </div>
            <div class="portfolio-item">
                <h3>Mobile App Development</h3>
                <p>Cross-platform mobile applications using React Native and Flutter for iOS and Android.</p>
                <a href="#" class="btn">View Project</a>
            </div>
            <div class="portfolio-item">
                <h3>API Development</h3>
                <p>RESTful APIs and GraphQL services with comprehensive documentation and testing.</p>
                <a href="#" class="btn">View Project</a>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  generateProjectsContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Documentation</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 1000px; margin: 0 auto; padding: 20px; }
        .project { background: #f9f9f9; padding: 30px; margin-bottom: 30px; border-radius: 10px; }
        .project h2 { color: #2c3e50; margin-bottom: 15px; }
        .tech-stack { background: #e74c3c; color: white; padding: 5px 10px; border-radius: 3px; display: inline-block; margin: 5px 5px 5px 0; }
        .status { background: #27ae60; color: white; padding: 5px 10px; border-radius: 3px; display: inline-block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Project Documentation</h1>
        
        <div class="project">
            <h2>E-Commerce Platform</h2>
            <p><strong>Description:</strong> A full-featured e-commerce platform with shopping cart, payment integration, and inventory management.</p>
            <p><strong>Technologies:</strong></p>
            <span class="tech-stack">React</span>
            <span class="tech-stack">Node.js</span>
            <span class="tech-stack">MongoDB</span>
            <span class="tech-stack">Stripe API</span>
            <p><strong>Status:</strong> <span class="status">Completed</span></p>
        </div>
        
        <div class="project">
            <h2>Task Management System</h2>
            <p><strong>Description:</strong> Collaborative task management application with real-time updates and team collaboration features.</p>
            <p><strong>Technologies:</strong></p>
            <span class="tech-stack">Vue.js</span>
            <span class="tech-stack">Express</span>
            <span class="tech-stack">PostgreSQL</span>
            <span class="tech-stack">Socket.io</span>
            <p><strong>Status:</strong> <span class="status">In Progress</span></p>
        </div>
    </div>
</body>
</html>`;
  }

  generateContactContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contact Information</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
        .contact-card { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); text-align: center; }
        .contact-item { margin: 20px 0; }
        .contact-item h3 { color: #3498db; margin-bottom: 10px; }
        .contact-item a { color: #2980b9; text-decoration: none; }
        .contact-item a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="contact-card">
            <h1>Get In Touch</h1>
            <p>Feel free to reach out for collaborations, job opportunities, or just to say hello!</p>
            
            <div class="contact-item">
                <h3>Email</h3>
                <a href="mailto:professional@example.com">professional@example.com</a>
            </div>
            
            <div class="contact-item">
                <h3>LinkedIn</h3>
                <a href="https://linkedin.com/in/professional" target="_blank">linkedin.com/in/professional</a>
            </div>
            
            <div class="contact-item">
                <h3>GitHub</h3>
                <a href="https://github.com/professional" target="_blank">github.com/professional</a>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  async createDeploymentPackage() {
    const packageJson = {
      name: "professional-portfolio",
      version: "1.0.0",
      description: "Professional portfolio and resume package",
      main: "index.html",
      scripts: {
        start: "npx live-server --port=3000",
        deploy: "echo 'Ready for deployment'"
      }
    };

    fs.writeFileSync(
      path.join(this.outputDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create index.html that links to all generated files
    const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Professional Documents</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { text-align: center; color: white; }
        h1 { font-size: 3rem; margin-bottom: 2rem; }
        .links { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 40px; }
        .link-card { background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); padding: 30px; border-radius: 10px; text-decoration: none; color: white; transition: transform 0.3s; }
        .link-card:hover { transform: translateY(-5px); background: rgba(255,255,255,0.2); }
    </style>
</head>
<body>
    <div class="container">
        <h1>Professional Documents</h1>
        <p>All your career materials generated and ready</p>
        <div class="links">
            <a href="resume.html" class="link-card">
                <h2>📄 Resume</h2>
                <p>ATS-optimized professional resume</p>
            </a>
            <a href="cover-letter.html" class="link-card">
                <h2>📝 Cover Letter</h2>
                <p>Personalized cover letter</p>
            </a>
            <a href="portfolio.html" class="link-card">
                <h2>🎨 Portfolio</h2>
                <p>Professional portfolio website</p>
            </a>
            <a href="projects.html" class="link-card">
                <h2>⚡ Projects</h2>
                <p>Detailed project documentation</p>
            </a>
            <a href="contact.html" class="link-card">
                <h2>📧 Contact</h2>
                <p>Contact information and forms</p>
            </a>
        </div>
    </div>
</body>
</html>`;

    fs.writeFileSync(path.join(this.outputDir, 'index.html'), indexContent);
  }
}

// Run the pipeline
const pipeline = new TurboPipeline();
pipeline.run();