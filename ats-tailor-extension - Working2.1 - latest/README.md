# Enhanced CV Parser System

A comprehensive CV parsing and formatting system with multi-page document support, rich-text editing capabilities, and ATS-safe export functionality.

## ✨ New Features

### 📄 Multi-Page Document Parsing
- **Full document scanning**: Parse entire CVs from multi-page PDF and DOCX files
- **Enhanced section detection**: Intelligent algorithms identify work experience, education, skills, and other sections
- **Multiple role extraction**: Reliably extracts all work experiences from companies like Meta, SolimHealth, Accenture, and Citi
- **Date pattern recognition**: Supports various date formats (2020-2022, Jan 2020 - Dec 2022, Present, etc.)

### 📝 Rich-Text Education Editor
- **Bold and italic controls**: Format education descriptions with visual toolbar or keyboard shortcuts
- **Markdown-style support**: Type `**text**` for bold and `*text*` for italic
- **ATS-safe export**: Rich-text preserved in HTML/PDF, plain text for ATS systems
- **Lightweight implementation**: No external dependencies, works in any modern browser

### 🎯 ATS-Safe Export
- **100% ATS compatibility**: Plain text export removes all formatting for Applicant Tracking Systems
- **Dual format support**: Keep rich-text for human readers, plain text for ATS
- **Automatic conversion**: Handles HTML to plain text conversion seamlessly
- **Industry standard formatting**: Follows ATS best practices (no tables, standard fonts, proper spacing)

### 🔍 Enhanced Work Experience Extraction
- **Multiple pattern matching**: Uses various regex patterns to detect job titles, companies, and dates
- **Company/title swap detection**: Intelligently corrects when company and title are reversed
- **Date extraction**: Isolates dates from company and title fields
- **Bullet point parsing**: Extracts achievements and responsibilities from bullet lists

## 📁 Files Included

### Core Components
- **`enhanced-cv-parser.js`** - Advanced CV parser with multi-page support
- **`rich-text-editor.js`** - Lightweight rich-text editor with formatting controls
- **`cv-formatter-perfect-enhanced.js`** - Enhanced CV formatter with rich-text support

### Demo & Documentation
- **`cv-preview-enhanced.html`** - Interactive demo with all features
- **`integration-example.html`** - Comprehensive integration guide and examples
- **`README.md`** - This documentation file

## 🚀 Quick Start

### 1. Include the Enhanced Components

```html
<!-- Include all enhanced components -->
<script src="enhanced-cv-parser.js"></script>
<script src="rich-text-editor.js"></script>
<script src="cv-formatter-perfect-enhanced.js"></script>
```

### 2. Initialize the Rich-Text Editor

```javascript
// Create a rich-text editor for education descriptions
const editor = CVFormatterPerfectEnhanced.createRichTextEditor(
    'education-description-container',
    'Initial **bold** and *italic* content'
);

// Get content in different formats
const htmlContent = editor.getHTML();
const plainText = editor.getPlainText();
const markdownContent = editor.getMarkdown();
```

### 3. Parse Multi-Page Documents

```javascript
// Parse CV from uploaded file
const parser = new EnhancedCVParser();
const cvData = parser.parseFromFile(fileContent, fileName);

// Access parsed data
const experiences = cvData.experience;  // Array of all jobs found
const education = cvData.education;     // Array with rich-text support
```

### 4. Generate ATS-Safe CV

```javascript
// Generate CV with all features
const result = await CVFormatterPerfectEnhanced.generateCV(
    candidateData,
    tailoredContent,
    jobData
);

// Export ATS-safe plain text
const plainTextVersion = result.text;
CVFormatterPerfectEnhanced.downloadText(plainTextVersion, 'CV_ATS_Safe.txt');
```

## 📖 Detailed Usage

### Multi-Page PDF/DOCX Parsing

The enhanced parser can handle complex CV formats across multiple pages:

```javascript
const parser = new EnhancedCVParser({
    extractAllPages: true,
    enhancedDateDetection: true,
    richTextEducation: true,
    companyNamePatterns: [
        /\b(Meta|Google|Amazon|Microsoft)\b/gi,
        /\b(SolimHealth|Accenture|Citi)\b/gi
    ]
});

// Parse from file content
const cvData = parser.parseFromFile(fileContent, fileName);

// Access all work experiences
console.log(`Found ${cvData.experience.length} work experiences:`);
cvData.experience.forEach((job, index) => {
    console.log(`${index + 1}. ${job.title} at ${job.company} (${job.dates})`);
});
```

### Rich-Text Editor Integration

Create and manage rich-text editors for education descriptions:

```javascript
// Create editor with initial content
const editor = CVFormatterPerfectEnhanced.createRichTextEditor(
    'education-editor-container',
    '**Relevant Coursework:** *Data Structures, Algorithms*\n\n**Honors:** Dean\'s List'
);

// Get formatted content
const html = editor.getHTML();           // <strong>Relevant Coursework:</strong> <em>Data Structures...</em>
const plain = editor.getPlainText();     // Relevant Coursework: Data Structures...
const markdown = editor.getMarkdown();   // **Relevant Coursework:** *Data Structures...*

// Set new content
editor.setContent('New **bold** content');

// Toggle preview mode
editor.previewMode(true);  // Show formatted preview
editor.previewMode(false); // Return to edit mode
```

### ATS-Safe Export

Generate CVs that work with any Applicant Tracking System:

```javascript
// Generate CV with rich-text education
const result = await CVFormatterPerfectEnhanced.generateCV(
    candidateData,
    parsedCVData,
    jobRequirements
);

// Export formats available:
// - result.html (rich-text HTML version)
// - result.text (ATS-safe plain text)
// - result.pdf (formatted PDF)

// Download ATS-safe version
CVFormatterPerfectEnhanced.downloadText(result.text, 'CV_ATS_Safe.txt');

// Download HTML with rich-text
CVFormatterPerfectEnhanced.downloadHTML(result.html, 'CV_RichText.html');
```

## 🔧 Configuration Options

### Enhanced CV Parser Configuration

```javascript
const parserConfig = {
    // Multi-page support
    extractAllPages: true,
    
    // Date detection
    enhancedDateDetection: true,
    datePatterns: [
        /\d{4}[-\/]\d{1,2}\s*[-–—]\s*(Present|\d{4}[-\/]\d{1,2}|\d{4})/gi,
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*\d{4}\s*[-–—]\s*(Present|\w+\.?\s*\d{4})/gi,
        /\b\d{4}\s*[-–—]\s*(Present|\d{4})\b/gi
    ],
    
    // Rich-text support
    richTextEducation: true,
    
    // Company name patterns for better detection
    companyNamePatterns: [
        /\b(inc|llc|ltd|corp|corporation|company|co|plc|group)\b/i,
        /\b(google|meta|amazon|microsoft|netflix|ibm|oracle)\b/i,
        /\b(accenture|deloitte|pwc|kpmg|ey|mckinsey)\b/i,
        /\b(citi|jpmorgan|goldman|morgan stanley|barclays)\b/i
    ],
    
    // Job title patterns
    jobTitlePatterns: [
        /\b(engineer|developer|architect|analyst|manager|director|scientist)\b/i,
        /\b(senior|junior|principal|staff|associate|lead)\b/i
    ]
};

const parser = new EnhancedCVParser(parserConfig);
```

### Rich-Text Editor Configuration

```javascript
const editorConfig = {
    // Toolbar options
    toolbar: ['bold', 'italic', 'underline'],
    
    // Placeholder text
    placeholder: 'Enter education description...',
    
    // Auto-convert markdown-style formatting
    autoConvertMarkdown: true,
    
    // Character limit
    maxLength: 500,
    
    // ATS-safe export mode
    atsSafeExport: true,
    
    // Custom styles
    styles: {
        editor: {
            minHeight: '120px',
            padding: '15px',
            border: '2px solid #e1e5e9',
            borderRadius: '6px'
        },
        toolbar: {
            background: '#f8f9fa',
            padding: '10px',
            borderBottom: '1px solid #e1e5e9'
        }
    }
};

const editor = new RichTextEditor(editorConfig);
```

## 🎮 Interactive Demo

Open `cv-preview-enhanced.html` in your browser to see all features in action:

- **CV Parser Tab**: Upload PDF/DOCX files and see multi-page parsing
- **Rich-Text Editor Tab**: Test bold/italic formatting with live preview
- **Parser Tab**: See extracted work experiences and education

## 📋 Best Practices

### For CV Parsing
1. **Test with real CV files** from your target audience
2. **Handle parsing errors gracefully** with fallback to manual entry
3. **Cache parsed results** for better performance
4. **Validate extracted data** before using in CV generation

### For Rich-Text Editor
1. **Sanitize HTML content** before saving to database
2. **Test across browsers** for compatibility
3. **Provide clear instructions** for keyboard shortcuts (Ctrl+B, Ctrl+I)
4. **Limit character count** to prevent overly long descriptions

### For ATS Export
1. **Always test with actual ATS systems** when possible
2. **Keep formatting simple** in plain text version
3. **Maintain consistent section ordering** across formats
4. **Use standard section headers** (Experience, Education, Skills)

## 🔍 Troubleshooting

### Common Issues

**Parser not finding all experiences:**
- Ensure CV uses standard section headers
- Check that dates are in recognizable formats
- Verify company names match known patterns

**Rich-text editor not working:**
- Check browser compatibility (modern browsers only)
- Ensure container element exists before initialization
- Verify no CSS conflicts with editor styles

**ATS export formatting issues:**
- Test with multiple ATS systems
- Verify plain text uses consistent spacing
- Check for special characters that may cause issues

### Debug Mode

Enable debug logging to see detailed parsing information:

```javascript
// Enable debug mode
CVFormatterPerfectEnhanced.debug = true;
EnhancedCVParser.debug = true;

// Check console for parsing details
console.log('CV Parsing Results:', cvData);
```

## 🔄 Migration Guide

### From Original CVFormatterPerfect

1. **Replace the main formatter file** with `cv-formatter-perfect-enhanced.js`
2. **Update import statements** to use the new class name
3. **Add rich-text editor** for education fields
4. **Integrate multi-page parser** for file uploads

```javascript
// Old way
const result = CVFormatterPerfect.generateCV(candidateData, tailoredContent);

// New way (with rich-text support)
const result = CVFormatterPerfectEnhanced.generateCV(candidateData, tailoredContent, jobData);
```

### Backward Compatibility

The enhanced version maintains full backward compatibility:
- All existing API methods work unchanged
- Plain text export remains the same
- HTML generation follows same patterns
- Additional features are opt-in

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the integration examples in `integration-example.html`
3. Test with the interactive demo in `cv-preview-enhanced.html`

## 📄 License

This enhanced CV parser system is designed for integration with existing HR and recruitment platforms. All components are provided as-is for implementation in your applications.

---

**Ready to enhance your CV parsing system?** Start with the interactive demo and integration examples to see all features in action!
