# ATS Tailor v2.0 - QuantumHire AI with Kimi K2 Integration

## 🚀 Major New Features

### 1. **Kimi K2 API Integration**
- **Intelligent Screening Questions**: Uses Kimi K2 AI to automatically answer Workday screening questions that pass knockout filters
- **Fallback Pattern Matching**: When API unavailable, uses optimized pattern matching for common questions
- **Context-Aware Answers**: Leverages your profile data (experience, location, skills) for personalized responses

### 2. **Workday Multi-Page Autofill**
- **Complete Page Coverage**: Handles all Workday application pages:
  - Contact Information
  - Voluntary Disclosures
  - Self-Identification (EEO)
  - Application Questions
  - Review & Submit
- **Automatic Detection**: Detects page type and runs appropriate handler automatically
- **Manual Override**: "Run Manual Autofill" button for on-demand filling

### 3. **Saved Responses Memory**
- **Persistent Storage**: Remembers answers from previous applications
- **Smart Matching**: Normalizes questions to find similar ones
- **Usage Tracking**: Tracks how many times each response is used
- **Memory Management**: View, edit, and clear saved responses

### 4. **Enhanced AI Provider Toggle**
- **OpenAI ↔ Kimi K2 Switch**: Toggle between AI providers with visual feedback
- **Persistent Settings**: Remembers your last selection across sessions
- **Provider-Specific Features**: Kimi K2 optimized for faster screening question responses

### 5. **ATS-Tailored CV Generation**
- **Perfect Formatting**: Arial 11pt, 0.75" margins, 1.5 line spacing
- **Keyword Injection**: Automatically injects job description keywords into CV
- **Smart Categorization**: Organizes skills into categories (Languages, AI/ML, Cloud, etc.)
- **Location Handling**: Never includes "Remote" in location (recruiter red flag)

## 📋 CV Format Specifications

### Font Specifications
| Element | Font | Size | Style |
|---------|------|------|-------|
| Name/Title | Arial | 14pt | Bold |
| Section Headers | Arial | 12pt | Bold |
| Body Text & Bullets | Arial | 11pt | Regular |

### Spacing Specifications
- **Line Spacing**: 1.5 throughout entire document
- **Paragraph Spacing**: 6pt before, 6pt after sections
- **Margins**: 0.75" all sides (top, bottom, left, right)
- **Between Sections**: 1 blank line
- **Between Bullets**: 0 (tight, back-to-back)

### Emphasis Rules
- **Hard Skills**: Bold only (e.g., Python, AWS)
- **Soft Skills**: Bold Italic (e.g., *Problem-solving*)
- **Metrics**: Bold (e.g., **35%**, **$2M**)
- **Hyperlinks**: LinkedIn | GitHub | Portfolio (header only)

## 🔧 Installation & Setup

### 1. Load Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select the extension folder
4. The ATS Tailor icon should appear in your toolbar

### 2. Configure Kimi K2 API (Optional)
1. Get your Kimi API key from [Moonshot AI](https://platform.moonshot.cn/)
2. Click the extension icon and go to Settings
3. Enter your Kimi API key for enhanced screening question responses

### 3. Set Default Location
1. In the popup, set your default location (used for Remote jobs)
2. This ensures proper location formatting for ATS systems

## 🎯 Usage Instructions

### Automatic Mode
1. **Navigate to Job Posting**: Visit any supported ATS or company career site
2. **Extension Detects Job**: Automatically scans and extracts job details
3. **Click "Extract & Apply Keywords"**: Generates tailored CV and cover letter
4. **Files Auto-Attach**: Automatically attaches to application fields when detected

### Workday Multi-Page Flow
1. **Start Application**: Begin Workday application process
2. **Enable Autofill**: Toggle "Automatic Autofill" in the extension
3. **Navigate Pages**: Extension automatically fills each page as you progress
4. **Review & Submit**: Final review before submission

### Manual Controls
- **Manual Autofill**: Click "Run Manual Autofill" to fill current page
- **Force Apply**: Override automatic detection and force application
- **JD Snapshot**: Capture and save job description for later use

## 🏢 Supported Platforms

### ATS Systems
- Greenhouse
- Workday
- SmartRecruiters
- iCIMS
- Oracle Taleo
- And 20+ more

### Major Companies (70+)
- **FAANG**: Google, Meta, Amazon, Microsoft, Apple
- **Enterprise**: Salesforce, IBM, Oracle, Adobe, SAP
- **Fintech**: Stripe, PayPal, Visa, Mastercard
- **SaaS**: HubSpot, Slack, Atlassian, Datadog
- **Finance**: JPMorgan, Goldman Sachs, Morgan Stanley, BlackRock
- **Consulting**: McKinsey, BCG, Bain, Big 4

## 🔍 Keyword Extraction

### Automatic Extraction
- **Fast Local**: Quick keyword extraction using local algorithms
- **AI-Powered**: Enhanced extraction using Kimi K2 or OpenAI
- **Skill Gap Analysis**: Compares multiple job postings to identify trends

### Keyword Prioritization
- **High Priority**: Required skills mentioned multiple times
- **Medium Priority**: Important but not mandatory skills
- **Low Priority**: Nice-to-have or emerging technologies

## 💾 Data Privacy & Security

- **Local Storage**: All data stored locally in browser
- **No External Sharing**: No data sent to external servers except AI APIs
- **Encrypted Storage**: Sensitive data encrypted in browser storage
- **User Control**: Clear all data anytime with one click

## 🛠️ Technical Architecture

### Core Components
- **Content Scripts**: Page detection and interaction
- **Background Service**: File generation and caching
- **Popup UI**: User interface and settings
- **PDF Generation**: Client-side PDF creation
- **AI Integration**: Kimi K2 and OpenAI APIs

### Performance Optimizations
- **Caching**: Generated files cached per job URL
- **Lazy Loading**: Scripts loaded only when needed
- **Async Operations**: Non-blocking UI during processing
- **Memory Management**: Efficient data structures and cleanup

## 🐛 Troubleshooting

### Common Issues
1. **Files Not Attaching**: Check if file inputs are visible on page
2. **Autofill Not Working**: Ensure autofill is enabled in settings
3. **AI Responses Poor**: Verify Kimi API key is set correctly
4. **CV Format Wrong**: Check font and spacing settings

### Debug Mode
1. Open browser console (F12)
2. Look for `[ATS Tailor]` prefixed logs
3. Check for error messages and warnings

## 📞 Support

For issues and feature requests:
1. Check the troubleshooting section
2. Review browser console for errors
3. Contact support with logs and steps to reproduce

## 🔄 Version History

### v2.0.0 (Current)
- Kimi K2 API integration
- Workday multi-page autofill
- Saved responses memory
- Enhanced AI provider toggle
- Improved PDF generation
- Better keyword injection

### v1.7.0 (Previous)
- Initial multi-ATS support
- Basic autofill functionality
- PDF generation engine

---

**Built with ❤️ for job seekers everywhere**
