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
  if (typeof value !== 'string') {
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
  return value.slice(0, maxItems).map((item, i) => 
    validateString(item, maxStringLength, `${fieldName}[${i}]`)
  );
}

interface TailorRequest {
  jobTitle: string;
  company: string;
  description: string;
  requirements: string[];
  location?: string;
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
    workExperience: any[];
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
}

async function verifyAuth(req: Request): Promise<{ userId: string; supabase: any }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Unauthorized: Invalid or expired token');
  }
  
  return { userId: user.id, supabase };
}

async function getUserOpenAIKey(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('openai_api_key')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data.openai_api_key;
}

async function logApiUsage(supabase: any, userId: string, functionName: string, tokensUsed: number): Promise<void> {
  try {
    await supabase
      .from('api_usage')
      .insert({
        user_id: userId,
        function_name: functionName,
        tokens_used: tokensUsed,
      });
  } catch (error) {
    console.error('Failed to log API usage:', error);
  }
}

function validateRequest(data: any): TailorRequest {
  const jobTitle = validateString(data.jobTitle, MAX_STRING_SHORT, 'jobTitle');
  const company = validateString(data.company, MAX_STRING_SHORT, 'company');
  const description = validateString(data.description || '', MAX_STRING_LONG, 'description');
  const requirements = validateStringArray(data.requirements || [], MAX_ARRAY_SIZE, MAX_STRING_MEDIUM, 'requirements');
  const location = data.location ? validateString(data.location, MAX_STRING_SHORT, 'location') : undefined;
  const jobId = data.jobId ? validateString(data.jobId, MAX_STRING_SHORT, 'jobId') : undefined;
  
  const profile = data.userProfile || {};
  const userProfile = {
    firstName: validateString(profile.firstName || '', MAX_STRING_SHORT, 'firstName'),
    lastName: validateString(profile.lastName || '', MAX_STRING_SHORT, 'lastName'),
    email: validateString(profile.email || '', MAX_STRING_SHORT, 'email'),
    phone: validateString(profile.phone || '', MAX_STRING_SHORT, 'phone'),
    linkedin: validateString(profile.linkedin || '', MAX_STRING_MEDIUM, 'linkedin'),
    github: validateString(profile.github || '', MAX_STRING_MEDIUM, 'github'),
    portfolio: validateString(profile.portfolio || '', MAX_STRING_MEDIUM, 'portfolio'),
    coverLetter: validateString(profile.coverLetter || '', MAX_STRING_LONG, 'coverLetter'),
    workExperience: Array.isArray(profile.workExperience) ? profile.workExperience.slice(0, 20) : [],
    education: Array.isArray(profile.education) ? profile.education.slice(0, 10) : [],
    skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 100) : [],
    certifications: validateStringArray(profile.certifications || [], MAX_ARRAY_SIZE, MAX_STRING_MEDIUM, 'certifications'),
    achievements: Array.isArray(profile.achievements) ? profile.achievements.slice(0, 20) : [],
    atsStrategy: validateString(profile.atsStrategy || '', MAX_STRING_LONG, 'atsStrategy'),
    city: profile.city ? validateString(profile.city, MAX_STRING_SHORT, 'city') : undefined,
    country: profile.country ? validateString(profile.country, MAX_STRING_SHORT, 'country') : undefined,
    address: profile.address ? validateString(profile.address, MAX_STRING_MEDIUM, 'address') : undefined,
    state: profile.state ? validateString(profile.state, MAX_STRING_SHORT, 'state') : undefined,
    zipCode: profile.zipCode ? validateString(profile.zipCode, MAX_STRING_SHORT, 'zipCode') : undefined,
  };

  return {
    jobTitle,
    company,
    description,
    requirements,
    location,
    jobId,
    userProfile,
    includeReferral: !!data.includeReferral,
  };
}

// Smart location logic - prioritize job listing location for ATS compliance
function getSmartLocation(jdLocation: string | undefined, jdDescription: string, profileCity?: string, profileCountry?: string): string {
  // Priority 1: If job listing has a specific location, use it directly for ATS matching
  // Examples: "Cardiff, London or Remote (UK)", "New York, NY", "Remote (US)"
  if (jdLocation && jdLocation.trim().length > 0) {
    const cleanLocation = jdLocation.trim();
    // If the job location contains remote, just use it as-is
    if (/remote|hybrid/i.test(cleanLocation)) {
      return cleanLocation;
    }
    // For specific locations, append "| Open to relocation" for flexibility
    return `${cleanLocation} | Open to relocation`;
  }
  
  const jdText = jdDescription.toLowerCase();
  
  // Priority 2: Extract location from job description if not in location field
  // US locations
  if (/\b(united states|usa|u\.s\.|us only|us-based|new york|san francisco|seattle|austin|boston|chicago|los angeles|denver)\b/i.test(jdText)) {
    return "Remote (Open to US relocation)";
  }
  
  // UK locations
  if (/\b(united kingdom|uk|london|manchester|birmingham|edinburgh|glasgow|bristol|cambridge|oxford|cardiff)\b/i.test(jdText)) {
    // Use profile location + UK relocation willingness
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} | Open to UK relocation`;
    }
    return "Dublin, Ireland | Open to UK relocation";
  }
  
  // Ireland/Dublin
  if (/\b(ireland|dublin|cork|galway|limerick)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry}`;
    }
    return "Dublin, Ireland";
  }
  
  // Europe/EU
  if (/\b(europe|eu|european union|germany|france|netherlands|spain|italy|switzerland|austria|belgium|portugal|sweden|norway|denmark|finland)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} (EU)`;
    }
    return "Dublin, Ireland (EU)";
  }
  
  // Canada
  if (/\b(canada|canadian|toronto|vancouver|montreal|ottawa|calgary)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} | Open to Canada relocation`;
    }
    return "Dublin, Ireland | Open to Canada relocation";
  }
  
  // Remote worldwide
  if (/\b(remote|worldwide|global|anywhere|distributed|work from home|wfh)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} | Remote`;
    }
    return "Remote | Open to relocation worldwide";
  }
  
  // APAC
  if (/\b(asia|apac|singapore|hong kong|tokyo|japan|australia|sydney|melbourne)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} | Open to APAC relocation`;
    }
    return "Remote | Open to APAC relocation";
  }
  
  // Priority 3: Fallback to profile location with "Open to relocation"
  if (profileCity && profileCountry) {
    return `${profileCity}, ${profileCountry} | Open to relocation`;
  }
  
  return "Remote | Open to relocation";
}

// Jobscan-style keyword extraction - enhanced for ATS ranking
function extractJobscanKeywords(description: string, requirements: string[]): { 
  hardSkills: string[], 
  softSkills: string[], 
  tools: string[], 
  titles: string[],
  certifications: string[],
  responsibilities: string[],
  allKeywords: string[]
} {
  const text = `${description} ${requirements.join(' ')}`.toLowerCase();
  
  // Hard skills (expanded tech stack - covers most ATS systems)
  const hardSkillPatterns = [
    // Programming languages
    'python', 'javascript', 'typescript', 'java', 'c\\+\\+', 'c#', 'go', 'golang', 'rust', 'ruby', 'php', 'scala', 'kotlin', 'swift', 'r', 'matlab', 'perl', 'bash', 'powershell', 'sql', 'plsql', 'tsql', 'vba', 'solidity', 'haskell', 'elixir', 'clojure', 'f#', 'dart', 'lua', 'groovy', 'objective-c',
    // Web frameworks
    'react', 'react\\.?js', 'angular', 'vue', 'vue\\.?js', 'svelte', 'next\\.?js', 'nuxt', 'gatsby', 'remix', 'ember', 'backbone', 'jquery', 'node\\.?js', 'express', 'express\\.?js', 'fastify', 'nest\\.?js', 'koa', 'hapi', 'django', 'flask', 'fastapi', 'pyramid', 'spring', 'spring boot', 'rails', 'ruby on rails', 'laravel', 'symfony', 'asp\\.?net', 'blazor', 'gin', 'echo', 'fiber', 'phoenix',
    // Databases
    'sql', 'nosql', 'postgresql', 'postgres', 'mysql', 'mariadb', 'mongodb', 'redis', 'elasticsearch', 'opensearch', 'cassandra', 'dynamodb', 'couchdb', 'couchbase', 'neo4j', 'graphdb', 'arangodb', 'firestore', 'firebase', 'supabase', 'sqlite', 'oracle', 'sql server', 'mssql', 'db2', 'teradata', 'redshift', 'bigquery', 'athena', 'presto', 'trino', 'clickhouse', 'timescaledb', 'influxdb',
    // Cloud & infrastructure
    'aws', 'amazon web services', 'azure', 'microsoft azure', 'gcp', 'google cloud', 'google cloud platform', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'puppet', 'chef', 'cloudformation', 'pulumi', 'helm', 'istio', 'linkerd', 'consul', 'vault', 'nomad', 'ecs', 'eks', 'aks', 'gke', 'fargate', 'lambda', 'step functions', 'cloud functions', 'azure functions', 'cloudflare', 'vercel', 'netlify', 'heroku', 'digitalocean', 'linode', 'vagrant', 'openstack', 'vmware', 'proxmox',
    // DevOps/CI-CD
    'jenkins', 'circleci', 'github actions', 'gitlab ci', 'travis ci', 'bamboo', 'teamcity', 'azure devops', 'argo cd', 'argocd', 'flux', 'spinnaker', 'tekton', 'buildkite', 'drone', 'concourse', 'ci/cd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery', 'devops', 'devsecops', 'sre', 'site reliability', 'infrastructure as code', 'iac', 'gitops',
    // Data & ML
    'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'sklearn', 'pandas', 'numpy', 'scipy', 'matplotlib', 'seaborn', 'plotly', 'spark', 'pyspark', 'hadoop', 'hive', 'pig', 'kafka', 'confluent', 'airflow', 'dagster', 'prefect', 'luigi', 'dbt', 'great expectations', 'mlflow', 'kubeflow', 'vertex ai', 'sagemaker', 'databricks', 'snowflake', 'fivetran', 'stitch', 'airbyte', 'meltano', 'looker', 'tableau', 'power bi', 'metabase', 'superset', 'quicksight', 'mode', 'amplitude', 'mixpanel', 'segment', 'heap', 'hugging face', 'transformers', 'langchain', 'llamaindex', 'openai', 'gpt', 'llm', 'large language model', 'nlp', 'natural language processing', 'computer vision', 'cv', 'opencv', 'yolo', 'bert', 'word2vec', 'xgboost', 'lightgbm', 'catboost', 'random forest', 'neural network', 'deep learning', 'machine learning', 'ml', 'ai', 'artificial intelligence', 'reinforcement learning', 'supervised learning', 'unsupervised learning', 'feature engineering', 'model training', 'model serving', 'mlops', 'data science', 'data engineering', 'data analytics', 'etl', 'elt', 'data warehouse', 'data lake', 'data lakehouse', 'data pipeline', 'streaming', 'real-time', 'batch processing',
    // API & Architecture
    'rest', 'rest api', 'restful', 'graphql', 'grpc', 'soap', 'websocket', 'webhook', 'api gateway', 'microservices', 'micro-services', 'serverless', 'event-driven', 'event driven', 'message queue', 'pub/sub', 'pubsub', 'rabbitmq', 'activemq', 'sqs', 'sns', 'kinesis', 'eventbridge', 'domain driven design', 'ddd', 'cqrs', 'saga pattern', 'circuit breaker', 'load balancer', 'reverse proxy', 'nginx', 'apache', 'haproxy', 'traefik', 'kong', 'envoy',
    // Security
    'oauth', 'oauth2', 'oidc', 'openid connect', 'jwt', 'saml', 'sso', 'single sign-on', 'mfa', 'multi-factor', '2fa', 'rbac', 'role based access', 'iam', 'identity management', 'encryption', 'tls', 'ssl', 'https', 'penetration testing', 'security audit', 'vulnerability', 'owasp', 'soc2', 'soc 2', 'gdpr', 'hipaa', 'pci dss', 'iso 27001', 'compliance', 'cybersecurity', 'infosec', 'devsecops',
    // Frontend
    'html', 'html5', 'css', 'css3', 'sass', 'scss', 'less', 'tailwind', 'tailwindcss', 'bootstrap', 'material ui', 'mui', 'chakra ui', 'ant design', 'styled components', 'emotion', 'webpack', 'vite', 'parcel', 'rollup', 'esbuild', 'swc', 'babel', 'eslint', 'prettier', 'responsive design', 'mobile-first', 'accessibility', 'a11y', 'wcag', 'aria', 'pwa', 'progressive web app', 'spa', 'single page application', 'ssr', 'server side rendering', 'ssg', 'static site generation', 'jamstack',
    // Mobile
    'ios', 'android', 'react native', 'flutter', 'xamarin', 'ionic', 'cordova', 'capacitor', 'expo', 'mobile development', 'cross-platform', 'native app',
    // Testing
    'unit testing', 'integration testing', 'e2e', 'end-to-end', 'test automation', 'tdd', 'test driven', 'bdd', 'behavior driven', 'jest', 'mocha', 'chai', 'jasmine', 'karma', 'cypress', 'playwright', 'selenium', 'webdriver', 'puppeteer', 'pytest', 'unittest', 'junit', 'testng', 'rspec', 'cucumber', 'postman', 'newman', 'load testing', 'performance testing', 'jmeter', 'locust', 'k6', 'gatling', 'qa', 'quality assurance',
    // Misc tech
    'git', 'github', 'gitlab', 'bitbucket', 'svn', 'linux', 'unix', 'windows server', 'macos', 'shell scripting', 'regex', 'regular expressions', 'json', 'xml', 'yaml', 'protobuf', 'avro', 'parquet', 'orc', 'csv', 'markdown', 'agile', 'scrum', 'kanban', 'lean', 'safe', 'waterfall', 'sdlc', 'software development lifecycle',
    // Blockchain & Web3
    'blockchain', 'web3', 'ethereum', 'solana', 'polygon', 'smart contracts', 'defi', 'nft', 'dapp', 'ipfs', 'hardhat', 'truffle', 'foundry'
  ];
  
  // Soft skills (critical for ATS)
  const softSkillPatterns = [
    'communication', 'communication skills', 'written communication', 'verbal communication', 'presentation skills',
    'leadership', 'team leadership', 'technical leadership', 'thought leadership', 'people management',
    'problem-solving', 'problem solving', 'critical thinking', 'analytical thinking', 'strategic thinking',
    'teamwork', 'collaboration', 'cross-functional', 'cross functional', 'interdisciplinary',
    'adaptability', 'flexibility', 'learning agility', 'growth mindset', 'self-motivated', 'proactive',
    'time management', 'prioritization', 'multitasking', 'deadline-driven', 'results-oriented',
    'attention to detail', 'detail-oriented', 'quality-focused', 'accuracy',
    'project management', 'program management', 'stakeholder management', 'client-facing', 'customer-focused',
    'mentoring', 'coaching', 'training', 'knowledge sharing', 'onboarding',
    'negotiation', 'conflict resolution', 'decision-making', 'decision making', 'consensus building',
    'innovation', 'creativity', 'design thinking', 'user-centric', 'empathy',
    'accountability', 'ownership', 'initiative', 'self-starter', 'independent'
  ];
  
  // Tools/platforms
  const toolPatterns = [
    'jira', 'confluence', 'slack', 'microsoft teams', 'teams', 'zoom', 'notion', 'asana', 'trello', 'monday', 'clickup', 'linear', 'shortcut', 'pivotal tracker',
    'figma', 'sketch', 'adobe xd', 'invision', 'zeplin', 'miro', 'lucidchart', 'draw\\.io', 'excalidraw',
    'postman', 'insomnia', 'swagger', 'openapi', 'graphiql', 'graphql playground',
    'datadog', 'splunk', 'grafana', 'prometheus', 'new relic', 'dynatrace', 'appdynamics', 'elastic apm', 'honeycomb', 'lightstep', 'jaeger', 'zipkin',
    'sentry', 'bugsnag', 'rollbar', 'logrocket', 'fullstory', 'hotjar',
    'pagerduty', 'opsgenie', 'victorops', 'statuspage', 'incident\\.io',
    'cloudwatch', 'stackdriver', 'azure monitor',
    'sonarqube', 'snyk', 'dependabot', 'renovate', 'whitesource', 'black duck', 'veracode', 'checkmarx',
    'salesforce', 'hubspot', 'zendesk', 'intercom', 'freshdesk',
    'stripe', 'plaid', 'twilio', 'sendgrid', 'mailchimp', 'brevo',
    '1password', 'lastpass', 'okta', 'auth0', 'onelogin', 'ping identity'
  ];
  
  // Job titles/roles
  const titlePatterns = [
    'software engineer', 'senior software engineer', 'staff engineer', 'principal engineer', 'distinguished engineer', 'fellow',
    'software developer', 'senior software developer', 'application developer', 'web developer', 'frontend developer', 'backend developer', 'full stack developer', 'fullstack developer',
    'data scientist', 'senior data scientist', 'lead data scientist', 'principal data scientist',
    'data engineer', 'senior data engineer', 'analytics engineer', 'bi engineer', 'business intelligence',
    'data analyst', 'business analyst', 'product analyst', 'marketing analyst', 'financial analyst',
    'ml engineer', 'machine learning engineer', 'ai engineer', 'applied scientist', 'research scientist', 'research engineer',
    'solution architect', 'solutions architect', 'cloud architect', 'enterprise architect', 'technical architect', 'software architect', 'system architect',
    'devops engineer', 'platform engineer', 'infrastructure engineer', 'reliability engineer', 'sre', 'site reliability engineer',
    'security engineer', 'security analyst', 'information security', 'application security', 'cloud security',
    'qa engineer', 'sdet', 'test engineer', 'quality engineer', 'automation engineer',
    'technical lead', 'tech lead', 'team lead', 'engineering manager', 'engineering director', 'vp of engineering', 'cto', 'chief technology officer',
    'product manager', 'product owner', 'program manager', 'project manager', 'scrum master', 'agile coach',
    'frontend', 'backend', 'full stack', 'fullstack', 'mobile developer', 'ios developer', 'android developer'
  ];
  
  // Certifications (highly valued by ATS)
  const certificationPatterns = [
    'aws certified', 'aws solutions architect', 'aws developer', 'aws sysops', 'aws devops', 'aws security', 'aws data analytics', 'aws machine learning',
    'azure certified', 'azure administrator', 'azure developer', 'azure solutions architect', 'azure data engineer', 'azure ai engineer',
    'gcp certified', 'google cloud certified', 'professional cloud architect', 'professional data engineer', 'professional cloud developer',
    'cka', 'ckad', 'cks', 'kubernetes certified', 'certified kubernetes',
    'terraform certified', 'hashicorp certified',
    'pmp', 'project management professional', 'prince2', 'capm', 'agile certified', 'csm', 'certified scrum master', 'psm', 'safe certified',
    'cissp', 'cism', 'cisa', 'comptia security\\+', 'ceh', 'certified ethical hacker', 'oscp',
    'comptia a\\+', 'comptia network\\+', 'ccna', 'ccnp', 'ccie',
    'ocjp', 'ocpjp', 'java certified', 'oracle certified',
    'mcsa', 'mcse', 'microsoft certified',
    'salesforce certified', 'servicenow certified', 'databricks certified', 'snowflake certified'
  ];
  
  // Key action verbs / responsibilities (ATS loves these)
  const responsibilityPatterns = [
    'designed', 'developed', 'implemented', 'built', 'created', 'architected',
    'led', 'managed', 'supervised', 'mentored', 'coached', 'trained',
    'optimized', 'improved', 'enhanced', 'streamlined', 'automated',
    'collaborated', 'partnered', 'coordinated', 'communicated',
    'analyzed', 'evaluated', 'assessed', 'reviewed', 'audited',
    'deployed', 'released', 'launched', 'shipped', 'delivered',
    'scaled', 'migrated', 'integrated', 'refactored', 'modernized',
    'reduced', 'increased', 'achieved', 'exceeded', 'accomplished',
    'documented', 'maintained', 'supported', 'troubleshot', 'debugged', 'resolved'
  ];
  
  const extractMatches = (patterns: string[]): string[] => {
    const matches: string[] = [];
    for (const pattern of patterns) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      if (regex.test(text)) {
        // Capitalize properly and clean up escaped characters
        const cleaned = pattern.replace(/\\\./g, '.').replace(/\\+/g, '+').replace(/\\?/g, '');
        if (!matches.some(m => m.toLowerCase() === cleaned.toLowerCase())) {
          // Smart capitalization
          const capitalized = cleaned.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ');
          matches.push(capitalized);
        }
      }
    }
    return matches;
  };
  
  // Extract with higher limits for better ATS coverage
  const hardSkills = extractMatches(hardSkillPatterns).slice(0, 25);
  const softSkills = extractMatches(softSkillPatterns).slice(0, 8);
  const tools = extractMatches(toolPatterns).slice(0, 10);
  const titles = extractMatches(titlePatterns).slice(0, 5);
  const certifications = extractMatches(certificationPatterns).slice(0, 5);
  const responsibilities = extractMatches(responsibilityPatterns).slice(0, 10);
  
  // Combined keywords prioritized for ATS scoring
  const allKeywords = [
    ...hardSkills,       // Primary skills - most important
    ...titles,           // Job title matches
    ...certifications,   // Certifications are high value
    ...tools,            // Tools/platforms
    ...softSkills        // Soft skills for culture fit
  ].slice(0, 35);
  
  return { hardSkills, softSkills, tools, titles, certifications, responsibilities, allKeywords };
}

// Calculate accurate match score
function calculateMatchScore(
  jdKeywords: string[], 
  profileSkills: any[], 
  profileExperience: any[]
): { score: number, matched: string[], missing: string[] } {
  const profileSkillsLower = profileSkills.map(s => 
    (typeof s === 'string' ? s : s.name || '').toLowerCase()
  );
  
  // Also extract skills from work experience
  const experienceText = profileExperience.map(exp => 
    `${exp.title || ''} ${exp.description || ''} ${(exp.bullets || []).join(' ')}`
  ).join(' ').toLowerCase();
  
  const matched: string[] = [];
  const missing: string[] = [];
  
  for (const keyword of jdKeywords) {
    const keywordLower = keyword.toLowerCase();
    const isMatched = profileSkillsLower.some(s => s.includes(keywordLower) || keywordLower.includes(s)) ||
                      experienceText.includes(keywordLower);
    
    if (isMatched) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }
  
  // Calculate score: 3 points for primary skills (first 15), 2 for secondary, 1 for soft skills
  let totalPoints = 0;
  let earnedPoints = 0;
  
  jdKeywords.forEach((kw, i) => {
    const points = i < 15 ? 3 : (i < 20 ? 2 : 1);
    totalPoints += points;
    if (matched.includes(kw)) {
      earnedPoints += points;
    }
  });
  
  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 50;
  
  return { score: Math.min(100, Math.max(0, score)), matched, missing };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabase } = await verifyAuth(req);
    
    const rawData = await req.json();
    const { jobTitle, company, description, requirements, location, jobId, userProfile, includeReferral } = validateRequest(rawData);
    
    // Get user's OpenAI API key from their profile
    const userOpenAIKey = await getUserOpenAIKey(supabase, userId);
    
    if (!userOpenAIKey) {
      return new Response(JSON.stringify({ 
        error: "OpenAI API key not configured. Please add your API key in Profile settings." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[User ${userId}] Tailoring application for ${jobTitle} at ${company}`);

    // Smart location logic
    const smartLocation = getSmartLocation(location, description, userProfile.city, userProfile.country);
    console.log(`Smart location determined: ${smartLocation}`);
    
    // Jobscan keyword extraction
    const jdKeywords = extractJobscanKeywords(description, requirements);
    console.log(`Extracted ${jdKeywords.allKeywords.length} keywords from JD`);
    
    // Calculate accurate match score
    const matchResult = calculateMatchScore(
      jdKeywords.allKeywords, 
      userProfile.skills, 
      userProfile.workExperience
    );
    console.log(`Match score calculated: ${matchResult.score}%, matched: ${matchResult.matched.length}, missing: ${matchResult.missing.length}`);

    const candidateName = `${userProfile.firstName} ${userProfile.lastName}`;
    const candidateNameForFile = `${userProfile.firstName} ${userProfile.lastName}`;

    const systemPrompt = `You are a SENIOR PROFESSIONAL RESUME WRITER with 10+ years expertise in ATS optimization, humanized writing, and recruiter-friendly document design.

CRITICAL MISSION: Create application materials that sound HUMAN, not robotic AI-generated text. Recruiters can spot AI-written content instantly.

ABSOLUTE RULES:
1. PRESERVE ALL COMPANY NAMES AND EXACT DATES - Only tailor the bullet points
2. Use Jobscan-style ATS keyword extraction - match 85%+ keyword density naturally
3. Location in CV header MUST be: "${smartLocation}"
4. NO typos, grammatical errors, or formatting issues - PROOFREAD CAREFULLY
5. File naming: ${candidateNameForFile}_CV.pdf and ${candidateNameForFile}_Cover_Letter.pdf

HUMANIZED TONE RULES (CRITICAL):
- Active voice only
- Vary sentence structure - no repetitive patterns like "I developed...", "I built...", "I created..."
- Use conversational connectors: "This enabled...", "Resulting in...", "To support...", "Which led to..."
- Sound confident but approachable
- BANNED PHRASES: "results-driven", "dynamic", "cutting-edge", "passionate", "leverage", "synergy", "proactive", "innovative"
- Read aloud test - must sound natural, like a real person wrote it
- Mix short and long sentences
- Include specific metrics and outcomes, not vague claims

JD KEYWORDS TO INTEGRATE (extracted via Jobscan method):
Hard Skills: ${jdKeywords.hardSkills.join(', ')}
Tools: ${jdKeywords.tools.join(', ')}
Titles: ${jdKeywords.titles.join(', ')}
Soft Skills: ${jdKeywords.softSkills.join(', ')}

CANDIDATE'S MATCHED KEYWORDS: ${matchResult.matched.join(', ')}
MISSING KEYWORDS TO ADD IF POSSIBLE: ${matchResult.missing.join(', ')}

Return ONLY valid JSON - no markdown code blocks, no extra text.`;

    const userPrompt = `TASK: Create an ATS-optimized, HUMANIZED application package.

=== TARGET JOB ===
Title: ${jobTitle}
Company: ${company}
Location: ${location || 'Not specified'} → SMART LOCATION FOR CV: ${smartLocation}
Job ID: ${jobId || 'N/A'}
Description: ${description}
Key Requirements: ${requirements.join(", ")}

=== CANDIDATE PROFILE ===
Name: ${candidateName}
Email: ${userProfile.email}
Phone: ${userProfile.phone}
LinkedIn: ${userProfile.linkedin}
GitHub: ${userProfile.github}
Portfolio: ${userProfile.portfolio}
Current Location: ${userProfile.city || ''}, ${userProfile.state || ''} ${userProfile.country || ''}

WORK EXPERIENCE (PRESERVE COMPANY NAMES AND DATES EXACTLY - ONLY REWRITE BULLETS):
${JSON.stringify(userProfile.workExperience, null, 2)}

EDUCATION:
${JSON.stringify(userProfile.education, null, 2)}

SKILLS:
${userProfile.skills?.map((s: any) => typeof s === 'string' ? s : `${s.name} (${s.years || s.level || 'proficient'})`).join(", ") || 'Not specified'}

CERTIFICATIONS:
${userProfile.certifications?.join(", ") || 'None listed'}

ACHIEVEMENTS:
${JSON.stringify(userProfile.achievements, null, 2)}

=== INSTRUCTIONS ===

1) CREATE RESUME with these exact sections:
   - Header: ${candidateName} | ${smartLocation} | ${userProfile.email} | ${userProfile.phone}
   - Links: LinkedIn, GitHub, Portfolio
   - Summary: 4-6 lines with ${jdKeywords.hardSkills.slice(0, 5).join(', ')} keywords
   - Work Experience: Keep company/dates, rewrite bullets with JD keywords + metrics
   - Education
   - Skills: Prioritize JD keywords
   - Certifications

2) CREATE COVER LETTER:
   ${candidateName}
   ${userProfile.email} | ${userProfile.phone}
   
   Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
   
   Re: Application for ${jobTitle}${jobId ? ` (Job ID: ${jobId})` : ''}
   
   Dear Hiring Committee,
   
   [4 paragraphs: Hook showing genuine interest, Proof with specific metrics and achievements, Skills alignment with job requirements, Close with availability and enthusiasm]
   
   Sincerely,
   ${candidateName}

${includeReferral ? `
3) CREATE REFERRAL EMAIL:
   Subject: Referral Request - ${jobTitle} at ${company}
   Body: Professional request mentioning specific role
` : ''}

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
      "linkedin": "${userProfile.linkedin}",
      "github": "${userProfile.github}",
      "portfolio": "${userProfile.portfolio}"
    },
    "summary": "[4-6 line professional summary]",
    "experience": [
      {
        "company": "[Company Name]",
        "title": "[Job Title]",
        "dates": "[Start - End]",
        "bullets": ["bullet1 with metrics", "bullet2", "bullet3"]
      }
    ],
    "education": [
      {
        "degree": "[Degree Name]",
        "school": "[School Name]",
        "dates": "[Dates]",
        "gpa": "[GPA if applicable]"
      }
    ],
    "skills": {
      "primary": ${JSON.stringify(jdKeywords.hardSkills.slice(0, 10))},
      "secondary": ${JSON.stringify(jdKeywords.tools)}
    },
    "certifications": ${JSON.stringify(userProfile.certifications || [])}
  },
  "coverLetterStructured": {
    "recipientCompany": "${company}",
    "jobTitle": "${jobTitle}",
    "jobId": "${jobId || ''}",
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
  "coverLetterFileName": "${candidateNameForFile}_Cover_Letter.pdf"${includeReferral ? `,
  "referralEmail": "[Subject + email body]"` : ''}
}`;

    // Retry logic with exponential backoff for rate limits
    const maxRetries = 3;
    let lastError: Error | null = null;
    let response: Response | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.log(`Rate limit hit, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userOpenAIKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            max_tokens: 4000,
            temperature: 0.7,
          }),
        });
        
        if (response.ok) {
          break; // Success, exit retry loop
        }
        
        if (response.status === 429) {
          // Rate limit - will retry
          const errorText = await response.text();
          console.warn(`OpenAI rate limit (attempt ${attempt + 1}):`, errorText);
          lastError = new Error("Rate limit exceeded");
          
          // Check for Retry-After header
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter && attempt < maxRetries - 1) {
            const waitTime = parseInt(retryAfter, 10) * 1000 || 2000;
            console.log(`Retry-After header suggests waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          continue;
        }
        
        // Non-retryable errors
        const errorText = await response.text();
        console.error("OpenAI API error:", response.status, errorText);
        
        if (response.status === 401) {
          return new Response(JSON.stringify({ error: "Invalid OpenAI API key. Please check your API key in Profile settings." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402 || response.status === 403) {
          return new Response(JSON.stringify({ error: "OpenAI API billing issue. Please check your OpenAI account." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        throw new Error(`OpenAI API error: ${response.status}`);
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
      return new Response(JSON.stringify({ 
        error: "OpenAI API temporarily unavailable. Your quota may be exceeded. Please check your OpenAI billing and try again later.",
        retryable: true
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const tokensUsed = data.usage?.total_tokens || 0;
    
    // Log API usage
    await logApiUsage(supabase, userId, 'tailor-application', tokensUsed);
    
    console.log(`AI response received (${tokensUsed} tokens), parsing...`);
    
    let result;
    try {
      let cleanContent = content;
      if (content.includes('```json')) {
        cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (content.includes('```')) {
        cleanContent = content.replace(/```\s*/g, '');
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
        coverLetterFileName: `${candidateNameForFile}_Cover_Letter.pdf`
      };
    }

    // Ensure all required fields with our pre-calculated values
    result.candidateName = result.candidateName || candidateNameForFile;
    result.cvFileName = result.cvFileName || `${candidateNameForFile}_CV.pdf`;
    result.coverLetterFileName = result.coverLetterFileName || `${candidateNameForFile}_Cover_Letter.pdf`;
    result.company = company;
    result.jobTitle = jobTitle;
    result.jobId = jobId;
    result.smartLocation = smartLocation;
    
    // Use our accurate match score
    result.matchScore = matchResult.score;
    result.keywordsMatched = result.keywordsMatched || matchResult.matched;
    result.keywordsMissing = result.keywordsMissing || matchResult.missing;
    result.matchedKeywords = result.keywordsMatched; // Alias for extension compatibility
    result.missingKeywords = result.keywordsMissing; // Alias for extension compatibility
    result.keywordAnalysis = result.keywordAnalysis || {
      hardSkills: jdKeywords.hardSkills,
      softSkills: jdKeywords.softSkills,
      tools: jdKeywords.tools,
      titles: jdKeywords.titles
    };
    
    // Validate resume and cover letter
    if (!result.tailoredResume || result.tailoredResume.length < 100) {
      console.error('Resume content missing or too short');
      result.resumeGenerationStatus = 'failed';
    } else {
      result.resumeGenerationStatus = 'success';
    }
    
    if (!result.tailoredCoverLetter || result.tailoredCoverLetter.length < 100) {
      console.error('Cover letter content missing or too short');
      result.coverLetterGenerationStatus = 'failed';
    } else {
      result.coverLetterGenerationStatus = 'success';
    }

    console.log(`Successfully tailored application. Match score: ${result.matchScore}, Resume: ${result.resumeGenerationStatus}, Cover Letter: ${result.coverLetterGenerationStatus}`);

    // --- Generate PDFs (server-side) so the extension only needs 1 backend call per job ---
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const authHeader = req.headers.get("authorization") || "";

      const candidateName = `${userProfile.firstName} ${userProfile.lastName}`.trim() || "Applicant";
      const candidateNameNoSpaces = (candidateName || "Applicant").replace(/\s+/g, "");

      const resumeFileName = `${candidateNameNoSpaces}_CV.pdf`;
      const coverFileName = `${candidateNameNoSpaces}_Cover_Letter.pdf`;

      const skills = Array.isArray(userProfile.skills) ? userProfile.skills : [];
      const primarySkills = Array.isArray(skills)
        ? skills.filter((s: any) => s?.category === "technical" || s?.proficiency === "expert" || s?.proficiency === "advanced")
        : [];
      const secondarySkills = Array.isArray(skills)
        ? skills.filter((s: any) => s?.category !== "technical" && s?.proficiency !== "expert" && s?.proficiency !== "advanced")
        : [];

      const resumePayload = {
        type: "resume",
        candidateName: candidateNameNoSpaces,
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
        summary: (result.tailoredResume || "").substring(0, 500),
        experience: (Array.isArray(userProfile.workExperience) ? userProfile.workExperience : []).map((exp: any) => ({
          company: exp?.company || "",
          title: exp?.title || "",
          dates: exp?.dates || `${exp?.startDate || exp?.start_date || ""} – ${exp?.endDate || exp?.end_date || "Present"}`,
          bullets: Array.isArray(exp?.description)
            ? exp.description
            : typeof exp?.description === "string"
              ? exp.description.split("\n").filter((b: string) => b.trim())
              : [],
        })),
        education: (Array.isArray(userProfile.education) ? userProfile.education : []).map((edu: any) => ({
          degree: edu?.degree || "",
          school: edu?.school || edu?.institution || "",
          dates: edu?.dates || `${edu?.startDate || ""} – ${edu?.endDate || ""}`,
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

      const coverText = result.tailoredCoverLetter || "";
      const paragraphs = coverText.split(/\n\n+/).map((p: string) => p.trim()).filter((p: string) => p.length > 20);

      const coverPayload = {
        type: "cover_letter",
        candidateName: candidateNameNoSpaces,
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
          recipientCompany: company || "Company",
          jobTitle: jobTitle || "Position",
          jobId: jobId || "",
          paragraphs: paragraphs.length ? paragraphs : [coverText.trim()],
        },
      };

      const generatePdf = async (payload: any) => {
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
          throw new Error(`generate-pdf failed: ${pdfRes.status} ${t}`);
        }

        return await pdfRes.json();
      };

      const [resumePdfResp, coverPdfResp] = await Promise.all([
        generatePdf(resumePayload),
        generatePdf(coverPayload),
      ]);

      result.resumePdf = resumePdfResp?.pdf || null;
      result.coverLetterPdf = coverPdfResp?.pdf || null;
      result.resumePdfFileName = resumePdfResp?.fileName || resumeFileName;
      result.coverLetterPdfFileName = coverPdfResp?.fileName || coverFileName;
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
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage === 'Unauthorized: Invalid or expired token') {
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
