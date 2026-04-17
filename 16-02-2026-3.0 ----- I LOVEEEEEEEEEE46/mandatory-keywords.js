// mandatory-keywords.js - Comprehensive Pre-Pass Mandatory Keywords
// MUST be checked BEFORE any extraction from JD if they appear in the job description

(function(global) {
  'use strict';

  // ============ MANDATORY KEYWORD LISTS ============
  // These are scanned FIRST as a pre-pass before TF-IDF/AI extraction
  
  const MANDATORY_KEYWORDS = {
    // Programming Languages and Frameworks
    programmingLanguages: new Set([
      'java', 'python', 'javascript', 'typescript', 'c#', 'c++', 'c', 'go', 'golang',
      'rust', 'swift', 'kotlin', 'dart', 'ruby', 'php', 'perl', 'scala', 'r', 'matlab',
      'lua', 'elixir', 'haskell', 'fortran', 'assembly', 'solidity', 'sql', 'pl/sql',
      't-sql', 'nosql', 'cypher', 'gremlin', 'html5', 'xml', 'xhtml', 'css3', 'scss',
      'sass', 'less', 'stylus', 'postcss', 'yaml', 'json', 'bash', 'powershell'
    ]),
    
    frontendFrameworks: new Set([
      'bootstrap', 'foundation', 'bulma', 'tailwind css', 'tailwindcss', 'tailwind',
      'material-ui', 'material ui', 'mui', 'chakra ui', 'chakra-ui', 'ant design', 
      'antd', 'react', 'react native', 'redux', 'mobx', 'zustand', 'angular', 
      'angularjs', 'vue.js', 'vue', 'vuejs', 'nuxt.js', 'nuxt', 'nuxtjs', 'svelte', 
      'sveltekit', 'ember.js', 'ember', 'backbone.js', 'backbone', 'jquery', 'alpine.js'
    ]),
    
    backendFrameworks: new Set([
      'node.js', 'nodejs', 'node', 'express.js', 'express', 'expressjs', 'nestjs', 
      'nest.js', 'koa.js', 'koa', 'fastify', 'deno', 'bun', 'django', 'flask', 
      'fastapi', 'pyramid', 'tornado', 'spring', 'spring boot', 'springboot', 
      'spring cloud', 'quarkus', 'micronaut', '.net', '.net core', 'dotnet', 
      'asp.net', 'blazor', 'entity framework', 'laravel', 'symfony', 'codeigniter', 
      'cakephp', 'rails', 'ruby on rails', 'sinatra', 'hanami'
    ]),
    
    // Cloud, DevOps, and Infrastructure
    cloudPlatforms: new Set([
      'aws', 'amazon web services', 'ec2', 'ecs', 'eks', 'lambda', 's3', 'glacier',
      'rds', 'dynamodb', 'elasticache', 'redshift', 'emr', 'sagemaker', 'step functions',
      'api gateway', 'cloudformation', 'cloudwatch', 'aws cloudwatch', 'x-ray', 'guardduty', 'macie',
      'aws cdk', 'aws cloudtrail', 'aws security hub', 'aws codepipeline', 'aws codedeploy',
      'aws codebuild', 'aws config', 'aws ai/ml services', 'aws certified solutions architect',
      'cloud security', 'cloud architecture', 'disaster recovery', 'serverless',
      'serverless architectures', 'container orchestration', 'cloud cost optimization',
      'performance tuning',
      'azure', 'azure ad', 'app service', 'azure functions', 'aks',
      'cosmos db', 'cosmosdb', 'blob storage', 'key vault', 'logic apps', 'service bus',
      'azure devops', 'gcp', 'google cloud platform', 'google cloud', 'gce', 'gke',
      'cloud run', 'cloud sql', 'firestore', 'pub/sub', 'pubsub', 'dataflow',
      'composer', 'artifact registry', 'secret manager', 'cloud build'
    ]),
    
    containerization: new Set([
      'kubernetes', 'k8s', 'openshift', 'docker', 'podman', 'containerd', 'cri-o', 
      'helm', 'kustomize', 'argocd', 'argo cd', 'flux', 'crossplane'
    ]),
    
    iac: new Set([
      'terraform', 'pulumi', 'aws cdk', 'ansible', 'ansible galaxy', 'awx', 'tower', 
      'puppet', 'chef', 'saltstack', 'packer', 'vagrant', 'infrastructure as code', 'iac'
    ]),
    
    cicd: new Set([
      'jenkins', 'github actions', 'gitlab ci/cd', 'gitlab ci', 'circleci', 'travis ci',
      'concourse', 'tekton', 'buildkite', 'spinnaker', 'argo workflows', 'ci/cd',
      'ci/cd pipeline', 'continuous integration', 'continuous deployment', 'gitops',
      'blue-green deployment', 'canary releases', 'feature flags', 'launchdarkly',
      'split.io', 'chaos engineering', 'gremlin', 'litmus', 'devops', 'automation'
    ]),
    
    versionControl: new Set([
      'git', 'github', 'gitlab', 'bitbucket', 'azure repos', 'gitea', 'gerrit', 
      'svn', 'perforce', 'mercurial', 'artifactory', 'nexus', 'sonatype'
    ]),
    
    monitoring: new Set([
      'prometheus', 'thanos', 'cortex', 'victoriametrics', 'grafana', 'loki', 
      'tempo', 'jaeger', 'zipkin', 'elk stack', 'efk stack', 'fluentd', 'vector', 
      'logstash', 'kibana', 'opensearch', 'splunk', 'datadog', 'new relic', 
      'appdynamics', 'dynatrace', 'sentry'
    ]),
    
    linux: new Set([
      'linux', 'linux kernel', 'ubuntu', 'centos', 'rhel', 'debian', 'fedora', 
      'alpine', 'coreos', 'flatcar', 'bash', 'bash scripting', 'zsh', 'fish', 
      'powershell', 'awk', 'sed', 'grep', 'systemd', 'selinux', 'apparmor', 
      'iptables', 'nftables', 'ebpf'
    ]),
    
    webServers: new Set([
      'nginx', 'apache', 'apache httpd', 'haproxy', 'envoy', 'traefik', 'caddy', 
      'consul', 'vault', 'nomad', 'boundary'
    ]),
    
    // Data, AI/ML, Analytics, and Big Data
    dataScience: new Set([
      'pandas', 'numpy', 'scipy', 'polars', 'dask', 'modin', 'cudf', 'arrow', 
      'matplotlib', 'seaborn', 'plotly', 'bokeh', 'altair', 'scikit-learn', 
      'sklearn', 'xgboost', 'lightgbm', 'catboost', 'optuna', 'ray tune', 
      'mlflow', 'dvc', 'weights & biases', 'wandb', 'comet ml'
    ]),
    
    deepLearning: new Set([
      'tensorflow', 'tensorflow extended', 'tfx', 'keras', 'pytorch', 'torchserve', 
      'torchvision', 'hugging face', 'huggingface', 'transformers', 'diffusers', 
      'accelerate', 'datasets', 'llamaindex', 'langchain', 'haystack', 'tensorrt', 
      'onnx', 'openvino', 'tvm', 'jax', 'flax', 'haiku', 'mxnet', 'apache mxnet', 
      'deepspeed', 'horovod', 'ray', 'dask-ml', 'kubeflow', 'kserve', 'seldon core', 
      'cortex', 'bentoml', 'streamlit', 'gradio', 'dash', 'panel'
    ]),
    
    computerVision: new Set([
      'opencv', 'pillow', 'tesseract', 'computer vision', 'image recognition', 
      'object detection', 'image segmentation'
    ]),
    
    nlp: new Set([
      'spacy', 'nltk', 'gensim', 'allennlp', 'fairseq', 'sentence transformers', 
      'bert', 'gpt', 'llama', 'mistral', 'gemma', 'phi', 'stable diffusion', 
      'whisper', 'clip', 'dall-e', 'midjourney', 'nlp', 'natural language processing',
      'large language models', 'llm', 'llms', 'genai', 'generative ai'
    ]),
    
    bigData: new Set([
      'apache spark', 'spark', 'pyspark', 'spark sql', 'delta lake', 'iceberg', 
      'hudi', 'kafka', 'kafka streams', 'ksqldb', 'flink', 'flink ml', 'beam', 
      'samza', 'pulsar', 'redis streams', 'nats', 'rabbitmq', 'activemq', 'mosquitto'
    ]),
    
    dataOrchestration: new Set([
      'airflow', 'dagster', 'prefect', 'flyte', 'luigi', 'argo workflows', 'dbt', 
      'great expectations', 'soda', 'datahub', 'amundsen', 'marquez'
    ]),
    
    databases: new Set([
      'sqlalchemy', 'sqlmodel', 'alembic', 'mysql', 'mariadb', 'postgresql', 
      'postgres', 'cockroachdb', 'tidb', 'vitess', 'oracle', 'sql server', 
      'sqlite', 'bigquery', 'snowflake', 'redshift', 'synapse', 'athena', 
      'trino', 'presto', 'druid', 'pinot', 'clickhouse', 'timescaledb', 
      'influxdb', 'prometheus tsdb', 'mongodb', 'atlas', 'cassandra', 
      'scylladb', 'janusgraph', 'arangodb', 'couchbase', 'aerospike', 
      'data lakehouse', 'lake formation', 'delta sharing'
    ]),
    
    featureStore: new Set([
      'feature store', 'feast', 'tecton', 'hopsworks', 'sagemaker feature store'
    ]),
    
    // B2B, SaaS, and Business Keywords
    businessSales: new Set([
      'b2b', 'b2b sales', 'business development', 'enterprise sales', 
      'account-based marketing', 'abm', 'customer success', 'csm', 
      'customer success management', 'onboarding specialist', 'expansion revenue', 
      'land and expand', 'multi-tenant', 'single-tenant', 'hybrid cloud', 
      'vertical saas', 'horizontal saas', 'low-code', 'no-code', 'low-code/no-code'
    ]),
    
    automation: new Set([
      'bubble', 'adalo', 'airtable', 'zapier', 'make.com', 'n8n', 'integromat', 
      'api-first', 'headless cms', 'strapi', 'directus', 'sanity', 'contentful', 
      'commerce layer'
    ]),
    
    payments: new Set([
      'stripe', 'stripe connect', 'braintree', 'adyen', 'paypal', 'zuora', 
      'chargebee', 'recurly', 'paddle', 'fastspring', 'usage-based pricing', 
      'metered billing', 'hybrid pricing', 'tiered pricing'
    ]),
    
    metrics: new Set([
      'mrr', 'arr', 'nrr', 'net revenue retention', 'gross retention', 
      'expansion revenue', 'churn reduction', 'customer health score', 
      'nps', 'csat', 'ces', 'product-led growth', 'plg', 'freemium', 
      'trial conversion', 'self-serve'
    ]),
    
    salesRoles: new Set([
      'inside sales', 'sdr', 'sales development representative', 'ae', 
      'account executive', 'bdr', 'business development rep', 'cro', 
      'chief revenue officer', 'vp sales', 'partnerships', 'channel partners', 
      'msp', 'managed service provider', 'var', 'value-added reseller', 
      'isv', 'independent software vendor', 'alliance manager', 'co-sell', 
      'go-to-market', 'gtm'
    ]),
    
    crmMarketing: new Set([
      'hubspot', 'salesforce', 'salesforce crm', 'pipedrive', 'close.io', 
      'outreach', 'salesloft', 'apollo.io', 'zoominfo', 'linkedin sales navigator', 
      'marketo', 'marketo engage', 'pardot', 'activecampaign', 'klaviyo', 
      'intercom', 'drift', 'qualified', '6sense', 'demandbase', 'segment', 
      'twilio segment', 'customer.io', 'braze', 'iterable', 'postmark', 
      'sendgrid', 'mailchimp'
    ]),
    
    compliance: new Set([
      'soc 2', 'soc 2 type ii', 'iso 27001', 'pci dss', 'hipaa', 'fedramp',
      'csa star', 'gdpr', 'ccpa', 'lgpd', 'pipeda', 'compliance frameworks', 'compliance'
    ]),
    
    // Frontend, Mobile, and UI/UX
    buildTools: new Set([
      'webpack', 'vite', 'esbuild', 'rollup', 'parcel', 'babel', 
      'typescript compiler', 'tsc', 'eslint', 'prettier', 'stylelint'
    ]),
    
    pwa: new Set([
      'pwa', 'progressive web app', 'service workers', 'amp', 'webassembly', 
      'wasm', 'webgl', 'canvas api', 'three.js', 'threejs', 'babylon.js'
    ]),
    
    animation: new Set([
      'framer motion', 'gsap', 'lottie', 'css animations', 'motion design'
    ]),
    
    design: new Set([
      'figma', 'sketch', 'adobe xd', 'invision', 'zeplin', 'storybook', 
      'chromatic', 'percy'
    ]),
    
    testing: new Set([
      'cypress', 'playwright', 'puppeteer', 'detox', 'appium', 'xcuitest', 
      'espresso', 'ios simulator', 'android emulator', 'xcode', 'android studio'
    ]),
    
    mobile: new Set([
      'flutter', 'xamarin', 'ionic', 'capacitor', 'cordova', 'pwabuilder', 
      'react native', 'swift', 'kotlin', 'ios', 'android'
    ]),
    
    webVitals: new Set([
      'lighthouse', 'core web vitals', 'lcp', 'fid', 'cls', 'accessibility', 
      'wcag', 'aria', 'semantic html', 'a11y'
    ]),
    
    // Security, Testing, and Quality
    security: new Set([
      'owasp', 'owasp top 10', 'sast', 'dast', 'sca', 'iast', 'rasp', 'waf', 
      'modsecurity', 'imperva', 'akamai', 'cloudflare waf', 'cloudflare', 
      'auth0', 'okta', 'ping identity', 'keycloak', 'cognito', 'encryption', 
      'aes-256', 'tls 1.3', 'pki', 'certificate management', 'let\'s encrypt', 
      'zero trust', 'ztna', 'sase', 'mfa', '2fa', 'sso', 'scim', 'rbac', 
      'abac', 'pbac', 'jwt', 'csrf', 'xss', 'sql injection', 
      'broken access control', 'cybersecurity', 'infosec', 'information security'
    ]),
    
    securityTools: new Set([
      'sonarqube', 'veracode', 'snyk', 'checkmarx', 'black duck', 'trivy', 
      'clair', 'bandit', 'semgrep'
    ]),
    
    testingFrameworks: new Set([
      'junit', 'testng', 'nunit', 'pytest', 'unittest', 'mocha', 'jest', 
      'vitest', 'cucumber', 'specflow', 'karate', 'postman', 'newman', 
      'insomnia', 'rest assured', 'wiremock', 'pact', 'contract testing', 
      'chaos monkey', 'simian army', 'load testing', 'jmeter', 'gatling', 
      'locust', 'artillery', 'k6'
    ]),
    
    // Methodologies, Management, and Soft Skills
    methodologies: new Set([
      'agile', 'agile manifesto', 'scrum', 'scrum guide', 'safe', 'safe framework', 
      'less', 'nexus', 'spotify model', 'kanban', 'kanban board', 'daily standup', 
      'sprint planning', 'retrospective', 'backlog grooming', 'definition of done', 
      'velocity', 'burn-down chart', 'okrs', 'okr', 'kpis', 'kpi', 'slos', 'slis', 
      'error budgets', 'incident management', 'post-mortem', 'blameless culture'
    ]),
    
    leadership: new Set([
      'cross-functional', 'cross functional', 'cross-functional team',
      'servant leadership', 'coaching', 'mentoring', 'mentorship', 'stakeholder alignment',
      'requirements engineering', 'user stories', 'acceptance criteria', 
      'bdd', 'given-when-then', 'technical debt', 'refactoring', 'legacy code', 
      'innovation', 'hackathons', 'design thinking', 'lean startup', 'mvp', 
      'pivot', 'growth hacking', 'aarrr framework'
    ]),
    
    remoteWork: new Set([
      'remote first', 'remote-first', 'asynchronous communication', 'async', 
      'timezone management', 'inclusive culture', 'diversity', 'equity', 
      'inclusion', 'dei', 'd&i'
    ]),
    
    // Additional Critical Terms
    dataAnalysis: new Set([
      'data analysis', 'data visualization', 'etl', 'reporting', 
      'requirements gathering', 'stakeholder management', 'project management', 
      'process improvement', 'a/b testing', 'ab testing', 'experimentation',
      'data-driven', 'data driven', 'analytics', 'business intelligence', 'bi'
    ]),
    
    customerSuccess: new Set([
      'account management', 'customer success', 'partner success', 'renewals', 
      'expansion', 'negotiation', 'onboarding', 'enablement', 'qbr', 
      'quarterly business review', 'client relationship', 'retention'
    ]),
    
    softSkills: new Set([
      'communication', 'relationship-building', 'relationship building', 
      'results-oriented', 'results oriented', 'organized', 'multi-tasker', 
      'multitasker', 'comfort working independently', 'independent', 
      'problem-solving', 'problem solving', 'attention to detail', 
      'leadership', 'teamwork', 'adaptability', 'time management', 
      'critical thinking', 'analytical', 'creative', 'proactive', 
      'strategic thinking', 'collaboration', 'presentation skills'
    ]),
    
    // WFM & Contact Center specific
    wfm: new Set([
      'workforce management', 'wfm', 'wfm tools', 'nice', 'verint', 'calabrio',
      'real-time analysis', 'real time analysis', 'capacity planning',
      'scheduling', 'forecasting', 'contact center', 'call center',
      'inbound', 'outbound', 'bpo', 'service level', 'sla', 'aht',
      'average handle time', 'shrinkage', 'occupancy', 'adherence'
    ]),

    // v3.3: Modern GenAI / LLM / Agentic AI stack (2024-2026)
    generativeAI: new Set([
      'generative ai', 'genai', 'gen ai', 'large language model', 'llm', 'llms',
      'foundation model', 'frontier model', 'multimodal', 'multi-modal',
      'gpt-4', 'gpt-4o', 'gpt-4 turbo', 'gpt-5', 'claude', 'claude 3', 'claude 3.5',
      'claude opus', 'claude sonnet', 'claude haiku', 'claude 4',
      'gemini', 'gemini pro', 'gemini ultra', 'llama', 'llama 2', 'llama 3',
      'mistral', 'mixtral', 'deepseek', 'qwen', 'grok',
      'openai', 'anthropic', 'google deepmind', 'meta ai', 'mistral ai', 'cohere',
      'prompt engineering', 'prompt design', 'few-shot learning', 'zero-shot learning',
      'chain of thought', 'chain-of-thought', 'cot', 'react prompting', 'tree of thought',
      'fine-tuning', 'lora', 'qlora', 'peft', 'rlhf', 'dpo', 'rag',
      'retrieval augmented generation', 'retrieval-augmented generation',
      'vector database', 'vector search', 'embedding model', 'semantic search',
      'pinecone', 'weaviate', 'chroma', 'qdrant', 'milvus', 'faiss', 'elasticsearch',
      'langchain', 'llamaindex', 'haystack', 'semantic kernel', 'autogen',
      'crewai', 'langgraph', 'ai agent', 'ai agents', 'agentic ai', 'agent orchestration',
      'tool use', 'function calling', 'structured output', 'constrained decoding',
      'guardrails', 'content moderation', 'ai safety', 'alignment', 'responsible ai',
      'ai ethics', 'model evaluation', 'evals', 'benchmarks', 'hallucination',
      'token', 'tokenization', 'context window', 'embeddings', 'cosine similarity',
      'copilot', 'github copilot', 'cursor', 'claude code', 'v0', 'bolt.new',
      'perplexity', 'chatgpt', 'chat completions', 'completions api', 'messages api',
      'anthropic api', 'openai api', 'bedrock', 'vertex ai', 'azure openai',
      'model context protocol', 'mcp'
    ]),

    // v3.3: Modern Data / Analytics Engineering (2024-2026)
    modernDataStack: new Set([
      'modern data stack', 'dbt', 'dbt cloud', 'dbt core', 'dagster', 'prefect',
      'airflow', 'astronomer', 'snowflake', 'databricks', 'bigquery', 'redshift',
      'duckdb', 'clickhouse', 'starburst', 'trino', 'presto', 'athena',
      'iceberg', 'delta lake', 'hudi', 'parquet', 'avro', 'orc',
      'fivetran', 'airbyte', 'stitch', 'hevo', 'meltano', 'rivery',
      'data mesh', 'data fabric', 'data lakehouse', 'lakehouse', 'medallion architecture',
      'bronze silver gold', 'data contract', 'data quality', 'great expectations',
      'soda', 'monte carlo', 'acceldata', 'bigeye', 'metaplane',
      'reverse etl', 'hightouch', 'census', 'activation', 'operational analytics',
      'semantic layer', 'cube', 'lookml', 'metric store', 'transform', 'feature store',
      'tecton', 'feast', 'hopsworks', 'data catalog', 'atlan', 'collibra', 'alation',
      'data observability', 'lineage', 'openlineage', 'datahub', 'amundsen'
    ]),

    // v3.3: Modern Web/Frontend (2024-2026)
    modernFrontend: new Set([
      'next.js 14', 'next.js 15', 'next.js app router', 'server components', 'rsc',
      'server actions', 'turbopack', 'remix', 'astro', 'qwik', 'solidjs', 'solid',
      'svelte 5', 'svelte', 'sveltekit', 'vue 3', 'nuxt 3', 'tanstack', 'tanstack query',
      'tanstack router', 'react query', 'swr', 'zustand', 'jotai', 'valtio',
      'react 18', 'react 19', 'concurrent rendering', 'suspense', 'streaming ssr',
      'edge runtime', 'edge functions', 'cloudflare workers', 'deno deploy', 'bun',
      'vite', 'vitest', 'playwright', 'storybook 8', 'chromatic',
      'shadcn', 'shadcn/ui', 'radix ui', 'radix', 'tailwind css', 'tailwindcss',
      'tailwind v4', 'unocss', 'framer motion', 'motion one',
      'typescript 5', 'typescript strict', 'zod', 'trpc', 'trpc v11'
    ]),

    // v3.3: Modern DevOps / Platform Engineering (2024-2026)
    platformEngineering: new Set([
      'platform engineering', 'internal developer platform', 'idp',
      'backstage', 'port', 'cortex', 'humanitec', 'coder', 'gitpod',
      'devex', 'developer experience', 'dora metrics', 'spacex metrics',
      'gitops', 'flux', 'argo cd', 'argocd', 'terragrunt', 'atlantis',
      'opa', 'open policy agent', 'gatekeeper', 'kyverno', 'sentinel',
      'chaos engineering', 'chaos mesh', 'litmus', 'gremlin',
      'service mesh', 'istio', 'linkerd', 'cilium', 'ebpf',
      'opentelemetry', 'otel', 'observability', 'slo', 'sli', 'slo burn rate',
      'error budget', 'distributed tracing', 'structured logging', 'metrics',
      'finops', 'cost optimization', 'kubecost', 'infracost', 'cloud zero',
      'supply chain security', 'sbom', 'sigstore', 'cosign', 'slsa', 'in-toto'
    ]),

    // v3.3: Modern Security (2024-2026)
    modernSecurity: new Set([
      'zero trust', 'zero-trust', 'zero trust architecture', 'zta', 'ztna',
      'sase', 'sse', 'casb', 'swg', 'ztaa',
      'identity-first security', 'passwordless', 'passkeys', 'webauthn', 'fido2',
      'privileged access management', 'pam', 'cyberark', 'beyondtrust',
      'cloud security posture management', 'cspm', 'cwpp', 'cnapp',
      'cloud workload protection', 'wiz', 'orca', 'lacework', 'prisma cloud',
      'shift left security', 'shift-left', 'devsecops', 'sast', 'dast', 'iast',
      'sca', 'software composition analysis', 'snyk', 'checkmarx', 'veracode',
      'secrets scanning', 'gitguardian', 'truffle hog',
      'ai security', 'ai red teaming', 'llm security', 'prompt injection',
      'owasp top 10 for llm', 'jailbreak', 'data exfiltration', 'model poisoning',
      'supply chain attack', 'solarwinds', 'log4shell', 'mitre att&ck', 'kill chain'
    ])
  };

  // Flatten all mandatory keywords into a single searchable Set
  const ALL_MANDATORY = new Set();
  Object.values(MANDATORY_KEYWORDS).forEach(categorySet => {
    categorySet.forEach(kw => ALL_MANDATORY.add(kw.toLowerCase()));
  });

  /**
   * Pre-pass extraction: Find all mandatory keywords that appear in the JD
   * This runs BEFORE TF-IDF extraction and guarantees these are included
   */
  function extractMandatoryFromJD(jdText) {
    if (!jdText || typeof jdText !== 'string') return [];
    
    const jdLower = jdText.toLowerCase();
    const found = new Set();
    
    // Check each mandatory keyword
    ALL_MANDATORY.forEach(keyword => {
      // Create word boundary regex for accurate matching
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      
      if (regex.test(jdLower)) {
        found.add(keyword);
      }
    });
    
    return [...found];
  }

  /**
   * Get category for a mandatory keyword
   */
  function getCategoryForKeyword(keyword) {
    const lower = keyword.toLowerCase();
    
    for (const [categoryName, categorySet] of Object.entries(MANDATORY_KEYWORDS)) {
      if (categorySet.has(lower)) {
        return categoryName;
      }
    }
    
    return 'other';
  }

  /**
   * Merge mandatory keywords with extracted keywords
   * Mandatory keywords from JD get HIGH priority
   */
  function mergeWithMandatory(extractedKeywords, mandatoryFromJD) {
    if (!mandatoryFromJD || mandatoryFromJD.length === 0) {
      return extractedKeywords;
    }
    
    const extractedSet = new Set((extractedKeywords.all || []).map(k => k.toLowerCase()));
    const mandatorySet = new Set(mandatoryFromJD.map(k => k.toLowerCase()));
    
    // Find mandatory keywords not already in extracted
    const newMandatory = mandatoryFromJD.filter(kw => !extractedSet.has(kw.toLowerCase()));
    
    // Prepend mandatory keywords to high priority
    const highPriority = [
      ...newMandatory.slice(0, 20), // Up to 20 mandatory keywords
      ...(extractedKeywords.highPriority || [])
    ];
    
    // Build new all list with mandatory first
    const all = [
      ...mandatoryFromJD,
      ...(extractedKeywords.all || []).filter(kw => !mandatorySet.has(kw.toLowerCase()))
    ].slice(0, 50); // Keep max 50 - ensure ALL extracted keywords can be included
    
    return {
      ...extractedKeywords,
      all,
      highPriority: highPriority.slice(0, 25),
      mediumPriority: extractedKeywords.mediumPriority || [],
      lowPriority: extractedKeywords.lowPriority || [],
      mandatoryFound: mandatoryFromJD.length,
      mandatoryKeywords: mandatoryFromJD
    };
  }

  // Export
  global.MandatoryKeywords = {
    MANDATORY_KEYWORDS,
    ALL_MANDATORY,
    extractMandatoryFromJD,
    getCategoryForKeyword,
    mergeWithMandatory
  };

})(typeof window !== 'undefined' ? window : global);
