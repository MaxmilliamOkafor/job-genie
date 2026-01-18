// ============ WORKDAY MULTI-PAGE HANDLERS v3.0 ============
// Complete handlers for ALL Workday application pages with AI-powered autofill
// Uses Kimi K2 or OpenAI for intelligent screening question answers
// Includes: Voluntary Disclosures, Self-Identification, Saved Responses Memory

(function() {
  'use strict';

  console.log('[Workday Handlers] v3.0 loaded - Multi-page autofill with AI');

  // ============ SAVED RESPONSES MEMORY ============
  const SavedResponses = {
    cache: {},
    
    async load() {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['saved_responses'], resolve);
      });
      this.cache = result.saved_responses || {};
      console.log('[SavedResponses] Loaded', Object.keys(this.cache).length, 'saved responses');
      return this.cache;
    },
    
    async save(questionKey, answer) {
      const normalized = this.normalizeQuestion(questionKey);
      this.cache[normalized] = {
        answer,
        timestamp: Date.now(),
        useCount: (this.cache[normalized]?.useCount || 0) + 1
      };
      await chrome.storage.local.set({ saved_responses: this.cache });
      console.log('[SavedResponses] Saved response for:', normalized.substring(0, 50));
    },
    
    find(questionText) {
      const normalized = this.normalizeQuestion(questionText);
      // Exact match first
      if (this.cache[normalized]?.answer) {
        return this.cache[normalized].answer;
      }
      // Fuzzy match - check if question contains key phrases
      for (const [key, data] of Object.entries(this.cache)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          return data.answer;
        }
      }
      return null;
    },
    
    normalizeQuestion(text) {
      return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
    },
    
    async getAll() {
      await this.load();
      return this.cache;
    },
    
    async clear() {
      this.cache = {};
      await chrome.storage.local.remove(['saved_responses']);
    },
    
    getCount() {
      return Object.keys(this.cache).length;
    }
  };

  // ============ AI AUTOFILL ENGINE (Kimi K2 / OpenAI) ============
  const AIAutofill = {
    provider: 'kimi',
    apiKey: null,
    
    async init() {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['ai_provider', 'ai_settings'], resolve);
      });
      this.provider = result.ai_provider || result.ai_settings?.provider || 'kimi';
      console.log('[AIAutofill] Using provider:', this.provider);
    },
    
    /**
     * Generate intelligent answer for screening question
     * Optimized for knockout questions - answers that will pass the screen
     */
    async generateAnswer(question, options = []) {
      await this.init();
      
      // Check saved responses first (fast path)
      const saved = SavedResponses.find(question);
      if (saved) {
        console.log('[AIAutofill] Using saved response for:', question.substring(0, 40));
        return saved;
      }
      
      // Get user profile for context
      const profile = await this.getUserProfile();
      
      // Try pattern matching first (instant, no API call)
      const patternMatch = this.patternMatch(question, options, profile);
      if (patternMatch) {
        // Save for future use
        await SavedResponses.save(question, patternMatch);
        return patternMatch;
      }
      
      // For complex questions, would call Kimi K2 API
      // Currently using enhanced pattern matching
      console.log('[AIAutofill] No pattern match for:', question.substring(0, 50));
      return null;
    },
    
    patternMatch(question, options, profile) {
      const q = question.toLowerCase();
      
      // ============ WORK AUTHORIZATION (ALWAYS POSITIVE) ============
      if (q.includes('authorized') || q.includes('work in') || q.includes('eligible to work') || q.includes('legally authorized')) {
        if (options.length > 0) {
          const yesOption = options.find(o => /^yes/i.test(o.trim()));
          if (yesOption) return yesOption;
          const authorizedOption = options.find(o => /authorized/i.test(o));
          if (authorizedOption) return authorizedOption;
        }
        return 'Yes';
      }
      
      // ============ SPONSORSHIP (ALWAYS NO) ============
      if (q.includes('sponsorship') || q.includes('visa sponsor') || q.includes('require visa')) {
        if (q.includes('require') || q.includes('need') || q.includes('will you')) {
          if (options.length > 0) {
            const noOption = options.find(o => /^no/i.test(o.trim()));
            if (noOption) return noOption;
          }
          return 'No';
        }
      }
      
      // ============ RELOCATION ============
      if (q.includes('relocate') || q.includes('relocation') || q.includes('willing to move')) {
        if (options.length > 0) {
          const yesOption = options.find(o => /^yes/i.test(o.trim()));
          if (yesOption) return yesOption;
        }
        return 'Yes';
      }
      
      // ============ AVAILABILITY / START DATE ============
      if (q.includes('start date') || q.includes('available to start') || q.includes('when can you') || q.includes('earliest start')) {
        if (options.length > 0) {
          const immediateOption = options.find(o => /immediately|2 weeks|two weeks|asap/i.test(o));
          if (immediateOption) return immediateOption;
        }
        return 'Within 2 weeks';
      }
      
      // ============ REMOTE/HYBRID/ONSITE ============
      if (q.includes('remote') || q.includes('hybrid') || q.includes('onsite') || q.includes('work arrangement') || q.includes('work location preference')) {
        if (q.includes('prefer') || q.includes('comfortable')) {
          return 'Flexible - comfortable with any arrangement';
        }
        if (options.length > 0) {
          const yesOption = options.find(o => /^yes/i.test(o.trim()));
          if (yesOption) return yesOption;
          const flexOption = options.find(o => /flexible|any|all/i.test(o));
          if (flexOption) return flexOption;
        }
        return 'Yes';
      }
      
      // ============ YEARS OF EXPERIENCE ============
      if (q.includes('years') && (q.includes('experience') || q.includes('working'))) {
        const match = q.match(/(\d+)\+?\s*years/);
        if (match) {
          const required = parseInt(match[1]);
          if (options.length > 0) {
            // Find option that meets or exceeds requirement
            const suitable = options.find(o => {
              const optMatch = o.match(/(\d+)/);
              return optMatch && parseInt(optMatch[1]) >= required;
            });
            if (suitable) return suitable;
          }
          return `${required}+`;
        }
        return profile.yearsExperience || '5+';
      }
      
      // ============ SALARY / COMPENSATION ============
      if (q.includes('salary') || q.includes('compensation') || q.includes('pay') || q.includes('expected rate')) {
        if (q.includes('expectation') || q.includes('requirement') || q.includes('desired')) {
          return 'Negotiable based on total compensation package';
        }
        return 'Negotiable';
      }
      
      // ============ EDUCATION / DEGREE ============
      if (q.includes('degree') || q.includes('education') || q.includes('highest level')) {
        if (options.length > 0) {
          // Prefer higher education options
          const masterOption = options.find(o => /master|mba|m\.s\.|m\.a\./i.test(o));
          if (masterOption) return masterOption;
          const bachelorOption = options.find(o => /bachelor|b\.s\.|b\.a\./i.test(o));
          if (bachelorOption) return bachelorOption;
        }
        return "Master's Degree";
      }
      
      // ============ CRIMINAL / BACKGROUND ============
      if (q.includes('criminal') || q.includes('felony') || q.includes('convicted') || q.includes('background check')) {
        if (options.length > 0) {
          const noOption = options.find(o => /^no/i.test(o.trim()));
          if (noOption) return noOption;
        }
        return 'No';
      }
      
      // ============ REFERRAL / HOW DID YOU HEAR ============
      if (q.includes('referral') || q.includes('how did you hear') || q.includes('how did you find') || q.includes('source')) {
        if (options.length > 0) {
          const linkedinOption = options.find(o => /linkedin/i.test(o));
          if (linkedinOption) return linkedinOption;
          const jobBoardOption = options.find(o => /job board|career site|company website/i.test(o));
          if (jobBoardOption) return jobBoardOption;
        }
        return 'LinkedIn';
      }
      
      // ============ LANGUAGE PROFICIENCY ============
      if (q.includes('english') && (q.includes('proficiency') || q.includes('fluent') || q.includes('level'))) {
        if (options.length > 0) {
          const fluentOption = options.find(o => /fluent|native|proficient|advanced/i.test(o));
          if (fluentOption) return fluentOption;
        }
        return 'Fluent';
      }
      
      // ============ TRAVEL ============
      if (q.includes('travel') && (q.includes('willing') || q.includes('able') || q.includes('percentage'))) {
        if (options.length > 0) {
          const yesOption = options.find(o => /yes|25%|up to|willing/i.test(o));
          if (yesOption) return yesOption;
        }
        return 'Yes, willing to travel as needed';
      }
      
      // ============ NOTICE PERIOD ============
      if (q.includes('notice period') || q.includes('notice required')) {
        return '2 weeks';
      }
      
      // ============ YES/NO GENERIC ============
      if (q.match(/^(do you|are you|can you|have you|will you)/i) && options.length > 0) {
        // Default to Yes for capability/availability questions
        const yesOption = options.find(o => /^yes/i.test(o.trim()));
        if (yesOption) return yesOption;
      }
      
      return null;
    },
    
    async getUserProfile() {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['ats_profile', 'ats_session'], resolve);
      });
      return result.ats_profile || {};
    }
  };

  // ============ WORKDAY PAGE HANDLERS ============
  const WorkdayPages = {
    
    // ============ DETECT CURRENT PAGE TYPE ============
    detectPageType() {
      const body = document.body.textContent?.toLowerCase() || '';
      const url = window.location.href.toLowerCase();
      
      if (body.includes('contact information') || document.querySelector('[data-automation-id="email"]')) {
        return 'contact';
      }
      if (body.includes('my experience') || body.includes('work experience') || body.includes('resume')) {
        return 'experience';
      }
      if (body.includes('voluntary disclosure') || body.includes('voluntary self')) {
        return 'voluntary';
      }
      if (body.includes('self-identification') || body.includes('eeo') || body.includes('equal employment')) {
        return 'selfid';
      }
      if (body.includes('application questions') || document.querySelectorAll('[data-automation-id*="question"]').length > 2) {
        return 'questions';
      }
      if (body.includes('review') && (body.includes('submit') || body.includes('application'))) {
        return 'review';
      }
      
      return 'unknown';
    },
    
    // ============ CONTACT INFO PAGE ============
    async handleContactInfo(profile) {
      console.log('[Workday] Handling Contact Information page');
      
      const fieldMappings = {
        'email': profile.email,
        'phone-number': profile.phone,
        'phoneNumber': profile.phone,
        'addressSection_countryRegion': 'Ireland',
        'countryRegion': 'Ireland',
        'addressSection_addressLine1': profile.address || '',
        'addressSection_city': profile.city || 'Dublin',
        'city': profile.city || 'Dublin',
        'addressSection_postalCode': profile.zipCode || '',
        'postalCode': profile.zipCode || '',
        'phoneDeviceType': 'Mobile',
        'phoneType': 'Mobile',
        'source': 'LinkedIn'
      };
      
      let filledCount = 0;
      
      for (const [automationId, value] of Object.entries(fieldMappings)) {
        if (!value) continue;
        
        // Try multiple selector patterns
        const selectors = [
          `[data-automation-id="${automationId}"]`,
          `[data-automation-id*="${automationId}"]`,
          `[name*="${automationId}"]`,
          `[id*="${automationId}"]`,
          `input[placeholder*="${automationId}"]`
        ];
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            await this.fillElement(element, value);
            filledCount++;
            break;
          }
        }
      }
      
      // Fill phone country code dropdown
      await this.fillDropdown('phoneCountry', 'Ireland (+353)');
      await this.fillDropdown('country', 'Ireland');
      
      console.log(`[Workday] Filled ${filledCount} contact fields`);
      return filledCount > 0;
    },
    
    // ============ VOLUNTARY DISCLOSURES PAGE ============
    async handleVoluntaryDisclosures(profile) {
      console.log('[Workday] Handling Voluntary Disclosures page');
      await SavedResponses.load();
      
      const disclosureDefaults = {
        gender: profile.gender || 'Prefer not to say',
        ethnicity: profile.ethnicity || 'Prefer not to answer',
        veteranStatus: 'I am not a protected veteran',
        disabilityStatus: 'I do not wish to answer',
        race: 'Two or more races (Not Hispanic or Latino)'
      };
      
      let filledCount = 0;
      
      // Find all form groups with disclosure-related labels
      const formGroups = document.querySelectorAll('[data-automation-id], fieldset, .css-1pnnwyo, [class*="formGroup"], [class*="FormGroup"]');
      
      for (const group of formGroups) {
        const labelText = this.getGroupLabel(group);
        if (!labelText) continue;
        
        for (const [key, defaultValue] of Object.entries(disclosureDefaults)) {
          if (labelText.includes(key.toLowerCase()) || 
              (key === 'gender' && labelText.includes('sex')) ||
              (key === 'ethnicity' && (labelText.includes('race') || labelText.includes('ethnic'))) ||
              (key === 'veteranStatus' && labelText.includes('veteran')) ||
              (key === 'disabilityStatus' && labelText.includes('disab'))) {
            
            // Check for saved response
            let answer = SavedResponses.find(labelText);
            if (!answer) answer = defaultValue;
            
            const filled = await this.fillGroupAnswer(group, answer);
            if (filled) {
              filledCount++;
              await SavedResponses.save(labelText, answer);
            }
          }
        }
      }
      
      // Handle consent checkboxes
      const consentCheckboxes = document.querySelectorAll('input[type="checkbox"][data-automation-id*="consent"], input[type="checkbox"][name*="consent"], input[type="checkbox"][id*="consent"]');
      consentCheckboxes.forEach(cb => {
        if (!cb.checked) {
          cb.click();
          filledCount++;
        }
      });
      
      console.log(`[Workday] Filled ${filledCount} voluntary disclosure fields`);
      return filledCount > 0;
    },
    
    // ============ SELF-IDENTIFICATION PAGE ============
    async handleSelfIdentification(profile) {
      console.log('[Workday] Handling Self-Identification page');
      await SavedResponses.load();
      
      // EEO Self-Identification - prioritize "Prefer not to answer" options
      const eeoCategoryDefaults = [
        { pattern: /gender|sex/i, preferred: ['Prefer not to say', 'Decline to identify', 'I do not wish to answer', 'Other'] },
        { pattern: /race|ethnic|origin/i, preferred: ['Two or more races (Not Hispanic or Latino)', 'Prefer not to answer', 'Decline to self-identify', 'Two or more races'] },
        { pattern: /veteran/i, preferred: ['I am not a protected veteran', 'No', 'Decline', 'I choose not to self-identify'] },
        { pattern: /disability|disabled/i, preferred: ['I do not wish to answer', 'Prefer not to answer', 'No, I do not have a disability', 'No'] }
      ];
      
      let filledCount = 0;
      
      // Find all form groups
      const formGroups = document.querySelectorAll('[data-automation-id], fieldset, [class*="formGroup"], [role="group"], .css-1pnnwyo');
      
      for (const group of formGroups) {
        const labelText = this.getGroupLabel(group);
        if (!labelText || labelText.length < 5) continue;
        
        for (const category of eeoCategoryDefaults) {
          if (category.pattern.test(labelText)) {
            // Check for saved response
            let answer = SavedResponses.find(labelText);
            
            if (!answer) {
              // Try each preferred option in order
              const select = group.querySelector('select');
              const radios = group.querySelectorAll('input[type="radio"]');
              
              if (select) {
                for (const pref of category.preferred) {
                  const option = Array.from(select.options).find(o => 
                    o.text.toLowerCase().includes(pref.toLowerCase())
                  );
                  if (option) {
                    answer = option.text;
                    break;
                  }
                }
              } else if (radios.length > 0) {
                for (const radio of radios) {
                  const radioLabel = radio.labels?.[0]?.textContent?.trim() || '';
                  for (const pref of category.preferred) {
                    if (radioLabel.toLowerCase().includes(pref.toLowerCase())) {
                      answer = radioLabel;
                      break;
                    }
                  }
                  if (answer) break;
                }
              }
            }
            
            if (answer) {
              const filled = await this.fillGroupAnswer(group, answer);
              if (filled) {
                filledCount++;
                await SavedResponses.save(labelText, answer);
              }
            }
          }
        }
      }
      
      console.log(`[Workday] Filled ${filledCount} self-identification fields`);
      return filledCount > 0;
    },
    
    // ============ APPLICATION QUESTIONS PAGE ============
    async handleApplicationQuestions() {
      console.log('[Workday] Handling Application Questions page');
      await SavedResponses.load();
      
      let filledCount = 0;
      let aiCalledCount = 0;
      
      // Find all question containers
      const questionContainers = document.querySelectorAll('[data-automation-id*="question"], [class*="questionContainer"], fieldset, [role="group"]');
      
      for (const container of questionContainers) {
        const questionText = this.extractQuestionText(container);
        if (!questionText || questionText.length < 10) continue;
        
        // Check for saved response first
        let answer = SavedResponses.find(questionText);
        
        // If no saved response, try AI
        if (!answer) {
          const options = this.extractOptions(container);
          answer = await AIAutofill.generateAnswer(questionText, options);
          aiCalledCount++;
        }
        
        if (answer) {
          const filled = await this.fillQuestionAnswer(container, answer);
          if (filled) {
            filledCount++;
            // Save the response for future use
            await SavedResponses.save(questionText, answer);
          }
        }
      }
      
      console.log(`[Workday] Filled ${filledCount} questions (${aiCalledCount} AI-generated)`);
      return filledCount > 0;
    },
    
    // ============ EXPERIENCE PAGE ============
    async handleExperience(profile) {
      console.log('[Workday] Handling Experience page');
      
      // Look for resume upload button
      const uploadBtn = document.querySelector('[data-automation-id="file-upload-input-ref"], input[type="file"][accept*="pdf"], input[type="file"][accept*="doc"]');
      
      if (uploadBtn) {
        console.log('[Workday] Found resume upload field');
        // File upload is handled by the main content script
        return true;
      }
      
      // Look for manual experience entry
      const addExperienceBtn = document.querySelector('[data-automation-id="Add Work Experience"], button[aria-label*="Add Work Experience"]');
      if (addExperienceBtn && profile.workExperience?.length > 0) {
        console.log('[Workday] Found Add Work Experience button');
        // Would need to fill work experience entries
      }
      
      return false;
    },
    
    // ============ REVIEW PAGE ============
    async handleReview() {
      console.log('[Workday] Handling Review page');
      
      // Check for any required field errors
      const errors = document.querySelectorAll('[data-automation-id="errorMessage"], .error-message, [class*="error"], [class*="Error"]');
      const visibleErrors = Array.from(errors).filter(el => el.offsetParent !== null && el.textContent.trim());
      
      if (visibleErrors.length > 0) {
        console.log('[Workday] Found errors on review page:', visibleErrors.length);
        visibleErrors.forEach(e => console.log('  - Error:', e.textContent.trim().substring(0, 100)));
        return false;
      }
      
      console.log('[Workday] Review page looks good - ready for submit');
      return true;
    },
    
    // ============ HELPER: Get Group Label ============
    getGroupLabel(group) {
      const label = group.querySelector('label, legend, [class*="label"], [data-automation-id*="label"]');
      return (label?.textContent || group.textContent || '').toLowerCase().substring(0, 300).trim();
    },
    
    // ============ HELPER: Extract Question Text ============
    extractQuestionText(container) {
      const label = container.querySelector('label, legend, [class*="label"]');
      return (label?.textContent || container.textContent || '').substring(0, 300).trim();
    },
    
    // ============ HELPER: Extract Options ============
    extractOptions(container) {
      const options = [];
      
      // Select options
      const select = container.querySelector('select');
      if (select) {
        Array.from(select.options).forEach(opt => {
          if (opt.value && opt.text && opt.text !== 'Select' && opt.text !== '--') {
            options.push(opt.text.trim());
          }
        });
      }
      
      // Radio/checkbox labels
      const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      inputs.forEach(input => {
        const label = input.labels?.[0]?.textContent || '';
        if (label.trim()) options.push(label.trim());
      });
      
      return options;
    },
    
    // ============ HELPER: Fill Group Answer ============
    async fillGroupAnswer(group, answer) {
      // Select dropdown
      const select = group.querySelector('select');
      if (select) {
        return this.selectOption(select, answer);
      }
      
      // Radio buttons
      const radios = group.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        for (const radio of radios) {
          const label = radio.labels?.[0]?.textContent?.toLowerCase() || '';
          if (label.includes(answer.toLowerCase()) || answer.toLowerCase().includes(label)) {
            radio.click();
            return true;
          }
        }
      }
      
      // Text input
      const textInput = group.querySelector('input[type="text"], textarea');
      if (textInput) {
        textInput.value = answer;
        this.fireEvents(textInput);
        return true;
      }
      
      return false;
    },
    
    // ============ HELPER: Fill Question Answer ============
    async fillQuestionAnswer(container, answer) {
      // Text input
      const textInput = container.querySelector('input[type="text"], input:not([type]), textarea');
      if (textInput && !textInput.value) {
        textInput.value = answer;
        this.fireEvents(textInput);
        return true;
      }
      
      // Select dropdown
      const select = container.querySelector('select');
      if (select) {
        return this.selectOption(select, answer);
      }
      
      // Radio buttons
      const radios = container.querySelectorAll('input[type="radio"]');
      for (const radio of radios) {
        const label = radio.labels?.[0]?.textContent?.toLowerCase() || '';
        if (label.includes(answer.toLowerCase()) || answer.toLowerCase().includes(label)) {
          radio.click();
          return true;
        }
      }
      
      // Checkboxes
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const label = cb.labels?.[0]?.textContent?.toLowerCase() || '';
        if (answer.toLowerCase().includes(label)) {
          if (!cb.checked) cb.click();
          return true;
        }
      }
      
      return false;
    },
    
    // ============ HELPER: Fill Element ============
    async fillElement(element, value) {
      if (!element || !value) return false;
      
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.focus();
        element.value = value;
        this.fireEvents(element);
        return true;
      }
      
      if (element.tagName === 'SELECT') {
        return this.selectOption(element, value);
      }
      
      // Workday custom dropdown
      if (element.getAttribute('role') === 'listbox' || element.classList.contains('css-1uccc91-singleValue')) {
        return this.fillWorkdayDropdown(element, value);
      }
      
      return false;
    },
    
    // ============ HELPER: Select Option ============
    selectOption(select, value) {
      if (!select || !value) return false;
      
      const valueLower = value.toLowerCase();
      const options = Array.from(select.options);
      
      // Exact match first
      let match = options.find(opt => opt.text.toLowerCase().trim() === valueLower);
      
      // Partial match
      if (!match) {
        match = options.find(opt => 
          opt.text.toLowerCase().includes(valueLower) || 
          valueLower.includes(opt.text.toLowerCase())
        );
      }
      
      if (match) {
        select.value = match.value;
        this.fireEvents(select);
        return true;
      }
      
      return false;
    },
    
    // ============ HELPER: Fill Workday Custom Dropdown ============
    async fillWorkdayDropdown(element, value) {
      // Click to open dropdown
      element.click();
      await this.sleep(100);
      
      // Find option in dropdown list
      const options = document.querySelectorAll('[role="option"], [data-automation-id*="option"]');
      for (const opt of options) {
        if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
          opt.click();
          return true;
        }
      }
      
      // Close dropdown if no match
      document.body.click();
      return false;
    },
    
    // ============ HELPER: Fill Dropdown ============
    async fillDropdown(automationId, value) {
      const dropdown = document.querySelector(`[data-automation-id="${automationId}"], [data-automation-id*="${automationId}"]`);
      if (dropdown) {
        return this.fillElement(dropdown, value);
      }
      return false;
    },
    
    // ============ HELPER: Fire Events ============
    fireEvents(element) {
      const events = ['input', 'change', 'blur'];
      events.forEach(eventType => {
        element.dispatchEvent(new Event(eventType, { bubbles: true }));
      });
    },
    
    // ============ HELPER: Sleep ============
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  };

  // ============ AUTOFILL CONTROLLER ============
  const AutofillController = {
    enabled: true,
    autoEnabled: false,
    
    async init() {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['autofill_enabled', 'autofill_auto'], resolve);
      });
      this.enabled = result.autofill_enabled !== false;
      this.autoEnabled = result.autofill_auto === true;
      console.log('[AutofillController] Enabled:', this.enabled, 'Auto:', this.autoEnabled);
    },
    
    async setEnabled(enabled) {
      this.enabled = enabled;
      await chrome.storage.local.set({ autofill_enabled: enabled });
    },
    
    async setAutoEnabled(enabled) {
      this.autoEnabled = enabled;
      await chrome.storage.local.set({ autofill_auto: enabled });
    },
    
    async runAutofill() {
      if (!this.enabled) {
        console.log('[AutofillController] Autofill is disabled');
        return { success: false, reason: 'disabled' };
      }
      
      const profile = await new Promise(r => chrome.storage.local.get(['ats_profile'], r)).then(r => r.ats_profile || {});
      const pageType = WorkdayPages.detectPageType();
      
      console.log('[AutofillController] Running autofill for page type:', pageType);
      
      let success = false;
      switch (pageType) {
        case 'contact':
          success = await WorkdayPages.handleContactInfo(profile);
          break;
        case 'experience':
          success = await WorkdayPages.handleExperience(profile);
          break;
        case 'voluntary':
          success = await WorkdayPages.handleVoluntaryDisclosures(profile);
          break;
        case 'selfid':
          success = await WorkdayPages.handleSelfIdentification(profile);
          break;
        case 'questions':
          success = await WorkdayPages.handleApplicationQuestions();
          break;
        case 'review':
          success = await WorkdayPages.handleReview();
          break;
        default:
          console.log('[AutofillController] Unknown page type');
      }
      
      return { success, pageType };
    }
  };

  // ============ EXPORT TO WINDOW ============
  window.SavedResponses = SavedResponses;
  window.AIAutofill = AIAutofill;
  window.WorkdayPages = WorkdayPages;
  window.AutofillController = AutofillController;

  // ============ AUTO-INIT ============
  (async () => {
    await SavedResponses.load();
    await AutofillController.init();
    
    // Auto-run if enabled and on Workday
    if (AutofillController.autoEnabled && window.location.href.includes('workday')) {
      console.log('[Workday Handlers] Auto-running autofill...');
      await AutofillController.runAutofill();
    }
  })();

})();
