# JobRefer.ai Chrome Extension

Capture LinkedIn jobs and send AI-powered outreach emails with one click.

## Features

- **One-Click Job Capture** - Add jobs directly from LinkedIn job pages
- **Auto-Extract Job Data** - Automatically pulls job title, company, and description
- **Recruiter Detection** - Auto-captures job poster's name and LinkedIn profile
- **Manual Entry Option** - Add recruiter info manually if not auto-detected
- **Sync with Dashboard** - Jobs appear instantly in your JobRefer.ai dashboard
- **Send Outreach** - Send AI-generated emails directly from the extension
- **Floating Action Button** - Quick access on LinkedIn job pages

## Installation

### Method 1: Load as Unpacked Extension (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `/app/extension` folder
5. The extension will appear in your toolbar

### Method 2: Chrome Web Store (Coming Soon)

The extension will be published to the Chrome Web Store.

## Usage

### Getting Started

1. Click the JobRefer.ai extension icon in your toolbar
2. Log in with your JobRefer.ai account credentials
3. Navigate to any LinkedIn job page

### Capturing Jobs

**From Extension Popup:**
1. Go to a LinkedIn job page
2. Click the extension icon
3. Job details will be auto-extracted
4. Add recruiter LinkedIn URL if not detected
5. Click "Capture Job" or "Capture & Send"

**From Floating Button (on LinkedIn):**
1. Go to a LinkedIn job page
2. Click the floating "🚀 JobRefer" button (bottom-right)
3. Select "Capture Job" or "Capture & Send"
4. If recruiter not detected, enter the LinkedIn URL when prompted

### Sending Outreach

- **Capture & Send** - Captures the job AND sends AI-generated outreach immediately
- **Send from Dashboard** - Click "Send Outreach" for jobs already captured

## Technical Details

- **Manifest Version**: 3 (Chrome's latest extension standard)
- **Permissions Used**:
  - `storage` - Store authentication token
  - `activeTab` - Access current tab for job extraction
  - `scripting` - Inject content script into LinkedIn pages
- **Host Permissions**: `linkedin.com` only

## File Structure

```
extension/
├── manifest.json      # Extension configuration
├── icons/             # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── popup.html     # Extension popup UI
    ├── popup.css      # Popup styles
    ├── popup.js       # Popup logic
    ├── background.js  # Service worker for API calls
    ├── content.js     # Injected into LinkedIn pages
    └── content.css    # Styles for LinkedIn injection
```

## API Integration

The extension communicates with the JobRefer.ai backend:

- `POST /api/auth/login` - User authentication
- `GET /api/profile` - Verify auth status
- `POST /api/jobs/quick-add` - Capture new job
- `POST /api/jobs/{id}/send-outreach` - Send outreach email
- `GET /api/jobs` - List user's jobs
- `GET /api/stats` - Get dashboard stats

## Troubleshooting

**Extension not working?**
- Make sure you're logged in to JobRefer.ai
- Ensure you're on a LinkedIn job page (URL contains `linkedin.com/jobs/`)
- Check if the extension has permissions for linkedin.com

**Can't detect recruiter?**
- Not all job postings show the poster's profile
- Use the manual entry option to add the recruiter's LinkedIn URL
- You can find the recruiter by checking who posted the job or the company's hiring team

**Outreach not sending?**
- Make sure you've configured Gmail SMTP in your dashboard settings
- Check your profile is complete (required for AI email generation)
- Verify you have remaining emails in your subscription plan

## Privacy & Security

- Your credentials are stored locally in Chrome's secure storage
- The extension only activates on LinkedIn job pages
- No data is collected or shared with third parties
- All communication is encrypted via HTTPS

## Support

For issues or feature requests:
- Email: support@jobrefer.ai
- Dashboard: https://jobrefer.ai/contact
