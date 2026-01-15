# ATS Tailor v2.0 - Package Instructions

## 📦 How to Package Your Enhanced Extension

### Method 1: Chrome Web Store (Recommended)

1. **Prepare Your Files**
   ```bash
   # Ensure all files are in the output directory
   ls -la /mnt/okcomputer/output/
   
   # Create a clean package directory
   mkdir -p /mnt/okcomputer/extension-package
   
   # Copy all necessary files
   cp /mnt/okcomputer/output/*.js /mnt/okcomputer/extension-package/
   cp /mnt/okcomputer/output/*.css /mnt/okcomputer/extension-package/
   cp /mnt/okcomputer/output/*.html /mnt/okcomputer/extension-package/
   cp /mnt/okcomputer/output/manifest.json /mnt/okcomputer/extension-package/
   
   # Create icons directory (you'll need to add icons)
   mkdir -p /mnt/okcomputer/extension-package/icons
   ```

2. **Add Required Icons**
   - Create icons in the following sizes: 16x16, 48x48, 128x128
   - Save as PNG format
   - Place in `/mnt/okcomputer/extension-package/icons/`

3. **Create ZIP Package**
   ```bash
   cd /mnt/okcomputer/extension-package
   zip -r ats-tailor-v2.0.zip . -x "*.DS_Store" "*/.git/*"
   ```

4. **Upload to Chrome Web Store**
   - Visit [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
   - Click "Add new item"
   - Upload your ZIP file
   - Fill in store listing details
   - Submit for review

### Method 2: Manual Installation (Development)

1. **Load Extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select `/mnt/okcomputer/output/` directory

2. **Verify Installation**
   - ATS Tailor icon should appear in toolbar
   - Click icon to open popup
   - Check that all features are working

## 🔧 Pre-Installation Checklist

### Files Required
- [x] `manifest.json` - Extension configuration
- [x] `popup.html` - User interface
- [x] `popup.js` - Popup logic with AI provider toggle
- [x] `content.js` - Page detection and autofill
- [x] `workday-handlers.js` - Workday multi-page support
- [x] `pdf-ats-turbo.js` - PDF generation engine
- [x] `openresume-generator.js` - ATS CV formatting
- [x] `popup.css` - Styling
- [x] `content.css` - Content script styling
- [x] `background.js` - Service worker
- [ ] `icons/` directory with 16x16, 48x48, 128x128 PNG icons

### Optional Files (for full functionality)
- Other supporting JS files (mandatory-keywords.js, etc.)
- bulk-apply.html for bulk automation features

## 🚀 Post-Installation Setup

### 1. Initial Configuration
1. **Click Extension Icon**
2. **Set AI Provider**: Toggle between Kimi K2 and OpenAI
3. **Configure Location**: Set default location for Remote jobs
4. **Test Features**: Try on a supported job site

### 2. Kimi K2 API Setup (Optional but Recommended)
1. Get API key from [Moonshot AI Platform](https://platform.moonshot.cn/)
2. Click extension icon → Settings
3. Enter Kimi API key for enhanced screening question responses

### 3. Workday Autofill Setup
1. Navigate to any Workday application
2. Enable "Automatic Autofill" in extension settings
3. Fill in credentials if prompted
4. Navigate through application pages

## 🧪 Testing Your Extension

### Test Scenarios

#### 1. Job Detection
- Visit: https://boards.greenhouse.io/
- Navigate to any job posting
- Check if job details appear in popup

#### 2. CV Generation
- Click "Extract & Apply Keywords"
- Verify progress indicators
- Check generated CV format
- Download and review PDF

#### 3. Workday Autofill
- Find a Workday application (e.g., https://wd5.myworkday.com/)
- Start application process
- Verify autofill works on each page
- Check saved responses are stored

#### 4. AI Provider Toggle
- Switch between Kimi K2 and OpenAI
- Verify settings persist after restart
- Test AI extract functionality

### Debug Mode
1. Open browser console (F12)
2. Look for `[ATS Tailor]` logs
3. Check for error messages
4. Report issues with console logs

## 📋 Troubleshooting Common Issues

### Extension Won't Load
- Check `manifest.json` syntax
- Verify all required files exist
- Check Chrome version compatibility

### Popup Not Working
- Check browser console for errors
- Verify `popup.js` loaded correctly
- Check for missing dependencies

### Autofill Not Working
- Ensure autofill enabled in settings
- Check if on supported ATS platform
- Verify page fully loaded before triggering

### PDF Generation Failing
- Check for jsPDF library inclusion
- Verify font and styling resources
- Check browser console for errors

## 🔄 Updating Your Extension

### Version Management
1. Update version in `manifest.json`
2. Create changelog entry
3. Test all features
4. Package and redistribute

### Data Migration
- User settings stored in Chrome storage
- No manual migration needed between versions
- Cache cleared automatically on update

## 📞 Support & Documentation

### Resources
- `README.md` - Complete feature documentation
- `KEYWORD_ANALYSIS.md` - CV optimization guide
- Browser console logs for debugging
- This package instructions file

### Getting Help
1. Check troubleshooting section above
2. Review documentation files
3. Check browser console for errors
4. Contact support with detailed information

## 🎯 Success Metrics

After installation, verify:
- [ ] Extension loads without errors
- [ ] Popup opens and shows UI
- [ ] Job detection works on supported sites
- [ ] CV generation produces PDF
- [ ] Workday autofill functions
- [ ] AI provider toggle persists
- [ ] Settings save correctly
- [ ] No console errors during normal use

---

**Your enhanced ATS Tailor extension is ready for deployment! 🚀**
