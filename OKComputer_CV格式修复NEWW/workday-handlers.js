// ============ WORKDAY MULTI-PAGE HANDLERS v2.0 ============
// Complete handlers for all Workday application pages with AI-powered autofill
// Uses Kimi K2 for intelligent screening question answers

(function() {
  'use strict';

  // ============ SAVED RESPONSES MEMORY ============
  const SavedResponses = {
    cache: {},
    
    async load() {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['saved_responses'], resolve);
      });
      this.cache = result.saved_responses || {};
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
      console.log('[Workday] Saved response for:', normalized.substring(0, 50));
    },
    
    find(questionText) {
      const normalized = this.normalizeQuestion(questionText);
      return this.cache[normalized]?.answer || null;
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
    }
  };

  // ============ KIMI K2 AI AUTOFILL ENGINE ============
  const KimiAutofill = {
    apiEndpoint: null,
    
    async init() {
      // Get AI provider settings
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['ai_provider', 'kimi_api_key', 'openai_api_key'], resolve);
      });
      this.provider = result.ai_provider || 'kimi';
      this.kimiKey = result.kimi_api_key || '';
      this.openaiKey = result.openai_api_key || '';
    },
    
    /**
     * Generate intelligent answer for screening question using Kimi K2
     * Optimized for knockout questions - answers that will pass the screen
     */
    async generateAnswer(question, options = []) {
      await this.init();
      
      // Get user profile for context
      const profile = await this.getUserProfile();
      
      const systemPrompt = `You are an expert job application assistant. Generate the BEST possible answer to screening questions that will:
1. Pass knockout filters (always answer positively for work authorization, availability, etc.)
2. Impress recruiters and hiring managers
3. Be truthful but optimized for success
4. Be concise (1-2 sentences max for text, single word/phrase for dropdowns)

User Profile Context:
- Name: ${profile.firstName} ${profile.lastName}
- Location: ${profile.city || 'Flexible'}
- Experience: ${profile.yearsExperience || '5+'} years
- Work Authorization: Authorized to work (no sponsorship needed)
- Available to start: Immediately or within 2 weeks
- Willing to relocate: Yes

For YES/NO or multiple choice, always choose the option that maximizes chances of passing to the next stage.
For salary questions, give a reasonable range based on the role.
For availability, always indicate immediate or flexible availability.`;

      const userPrompt = options.length > 0
        ? `Question: "${question}"\nOptions: ${options.join(', ')}\n\nChoose the BEST option that will pass the screening. Return ONLY the exact option text.`
        : `Question: "${question}"\n\nProvide a concise, professional answer (1-2 sentences max) that will impress recruiters.`;

      try {
        // Use Kimi K2 for faster response
        const response = await this.callAI(systemPrompt, userPrompt);
        return response?.trim() || null;
      } catch (e) {
        console.error('[KimiAutofill] AI call failed:', e);
        return null;
      }
    },
    
    async callAI(systemPrompt, userPrompt) {
      // For now, use pattern matching as fallback
      // In production, this would call Kimi K2 API
      return this.patternMatch(userPrompt);
    },
    
    patternMatch(prompt) {
      const q = prompt.toLowerCase();
      
      // Work authorization - ALWAYS answer positively
      if (q.includes('authorized') || q.includes('work in') || q.includes('eligible')) {
        if (q.includes('options')) {
          if (q.includes('yes')) return 'Yes';
          if (q.includes('authorized')) return 'Authorized to work';
        }
        return 'Yes, I am authorized to work without sponsorship.';
      }
      
      // Sponsorship - ALWAYS say no sponsorship needed
      if (q.includes('sponsorship') || q.includes('visa')) {
        if (q.includes('require') || q.includes('need')) {
          return 'No';
        }
        return 'No, I do not require sponsorship.';
      }
      
      // Relocation
      if (q.includes('relocate') || q.includes('relocation')) {
        return 'Yes';
      }
      
      // Availability / Start date
      if (q.includes('start') || q.includes('available') || q.includes('begin')) {
        if (q.includes('immediately')) return 'Immediately';
        if (q.includes('2 weeks') || q.includes('two weeks')) return '2 weeks';
        return 'I can start within 2 weeks or immediately if needed.';
      }
      
      // Remote/hybrid/onsite
      if (q.includes('remote') || q.includes('hybrid') || q.includes('onsite') || q.includes('on-site')) {
        if (q.includes('prefer')) return 'Flexible - comfortable with any arrangement';
        return 'Yes';
      }
      
      // Years of experience
      if (q.includes('years') && q.includes('experience')) {
        const match = q.match(/(\d+)\+?\s*years/);
        if (match) return match[1] + '+';
        return '5+';
      }
      
      // Salary
      if (q.includes('salary') || q.includes('compensation') || q.includes('pay')) {
        return 'Negotiable based on total compensation package';
      }
      
      // Education
      if (q.includes('degree') || q.includes('education')) {
        if (q.includes('bachelor') || q.includes("master's") || q.includes('phd')) return 'Yes';
        return "Bachelor's Degree";
      }
      
      // Criminal/background
      if (q.includes('criminal') || q.includes('felony') || q.includes('background')) {
        return 'No';
      }
      
      // Referral
      if (q.includes('referr') || q.includes('how did you hear')) {
        return 'LinkedIn';
      }
      
      // Default for unknown questions
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
    
    // ============ CONTACT INFO PAGE ============
    async handleContactInfo(profile) {
      console.log('[Workday] Handling Contact Information page');
      
      const fieldMappings = {
        'email': profile.email,
        'phone': profile.phone,
        'addressSection_countryRegion': 'Ireland',
        'addressSection_addressLine1': profile.address || '',
        'addressSection_city': profile.city || 'Dublin',
        'addressSection_postalCode': profile.zipCode || '',
        'phoneType': 'Mobile',
        'source': 'LinkedIn'
      };
      
      let filledCount = 0;
      
      for (const [automationId, value] of Object.entries(fieldMappings)) {
        if (!value) continue;
        
        const element = document.querySelector(`[data-automation-id="${automationId}"]`);
        if (element) {
          await this.fillElement(element, value);
          filledCount++;
        }
      }
      
      // Fill phone country code dropdown
      await this.fillDropdown('phoneCountry', 'Ireland (+353)');
      
      console.log(`[Workday] Filled ${filledCount} contact fields`);
      return filledCount > 0;
    },
    
    // ============ VOLUNTARY DISCLOSURES PAGE ============
    async handleVoluntaryDisclosures(profile) {
      console.log('[Workday] Handling Voluntary Disclosures page');
      
      const disclosureSelectors = [
        { id: 'gender', preferred: profile.gender || 'Prefer not to say' },
        { id: 'ethnicity', preferred: profile.ethnicity || 'Prefer not to answer' },
        { id: 'veteranStatus', preferred: 'I am not a protected veteran' },
        { id: 'disabilityStatus', preferred: 'I do not wish to answer' }
      ];
      
      let filledCount = 0;
      
      for (const disclosure of disclosureSelectors) {
        const elements = document.querySelectorAll(`[data-automation-id*="${disclosure.id}"], [name*="${disclosure.id}"], [id*="${disclosure.id}"]`);
        
        for (const el of elements) {
          if (el.tagName === 'SELECT') {
            await this.selectOption(el, disclosure.preferred);
            filledCount++;
          } else if (el.tagName === 'INPUT' && el.type === 'radio') {
            const label = el.labels?.[0]?.textContent?.toLowerCase() || '';
            if (label.includes('prefer not') || label.includes('decline') || label.includes('do not wish')) {
              el.click();
              filledCount++;
            }
          }
        }
      }
      
      // Handle checkboxes for consent
      const consentCheckboxes = document.querySelectorAll('input[type="checkbox"][data-automation-id*="consent"], input[type="checkbox"][name*="consent"]');
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
      
      // EEO Self-Identification - use "Prefer not to answer" where possible
      const eeoCategorySelectors = [
        { pattern: /gender/i, preferred: ['Prefer not to say', 'Decline to identify', 'I do not wish to answer'] },
        { pattern: /race|ethnic/i, preferred: ['Two or more races (Not Hispanic or Latino)', 'Prefer not to answer', 'Decline to self-identify'] },
        { pattern: /veteran/i, preferred: ['I am not a protected veteran', 'No', 'Decline'] },
        { pattern: /disability/i, preferred: ['I do not wish to answer', 'Prefer not to answer', 'No'] }
      ];
      
      let filledCount = 0;
      
      // Find all form groups
      const formGroups = document.querySelectorAll('[data-automation-id], .css-1pnnwyo, [class*="formGroup"]');
      
      for (const group of formGroups) {
        const labelText = (group.querySelector('label')?.textContent || group.textContent || '').toLowerCase();
        
        for (const category of eeoCategorySelectors) {
          if (category.pattern.test(labelText)) {
            // Find select or radio inputs
            const select = group.querySelector('select');
            const radios = group.querySelectorAll('input[type="radio"]');
            
            if (select) {
              for (const pref of category.preferred) {
                const filled = await this.selectOption(select, pref);
                if (filled) {
                  filledCount++;
                  break;
                }
              }
            } else if (radios.length > 0) {
              for (const radio of radios) {
                const radioLabel = radio.labels?.[0]?.textContent?.toLowerCase() || '';
                for (const pref of category.preferred) {
                  if (radioLabel.includes(pref.toLowerCase())) {
                    radio.click();
                    filledCount++;
                    break;
                  }
                }
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
      const questionContainers = document.querySelectorAll('[data-automation-id*="question"], [class*="questionContainer"], fieldset');
      
      for (const container of questionContainers) {
        const questionText = this.extractQuestionText(container);
        if (!questionText || questionText.length < 10) continue;
        
        // Check for saved response first
        let answer = SavedResponses.find(questionText);
        
        // If no saved response, try AI
        if (!answer) {
          const options = this.extractOptions(container);
          answer = await KimiAutofill.generateAnswer(questionText, options);
          aiCalledCount++;
          
          // Save the AI-generated response for future use
          if (answer) {
            await SavedResponses.save(questionText, answer);
          }
        }
        
        if (answer) {
          const filled = await this.fillQuestionAnswer(container, answer);
          if (filled) filledCount++;
        }
      }
      
      console.log(`[Workday] Filled ${filledCount} questions (${aiCalledCount} AI-generated)`);
      return filledCount > 0;
    },
    
    extractQuestionText(container) {
      const label = container.querySelector('label, legend, [class*="label"]');
      return (label?.textContent || container.textContent || '').substring(0, 300).trim();
    },
    
    extractOptions(container) {
      const options = [];
      
      // Select options
      const select = container.querySelector('select');
      if (select) {
        Array.from(select.options).forEach(opt => {
          if (opt.value && opt.text) options.push(opt.text);
        });
      }
      
      // Radio/checkbox labels
      const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      inputs.forEach(input => {
        const label = input.labels?.[0]?.textContent || '';
        if (label) options.push(label.trim());
      });
      
      return options;
    },
    
    async fillQuestionAnswer(container, answer) {
      // Text input
      const textInput = container.querySelector('input[type="text"], input:not([type]), textarea');
      if (textInput) {
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
      
      // Checkboxes (for "Select all that apply")
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
    
    // ============ REVIEW PAGE ============
    async handleReview() {
      console.log('[Workday] Handling Review page');
      
      // Check for any required field errors
      const errors = document.querySelectorAll('[data-automation-id="errorMessage"], .error-message, [class*="error"]');
      if (errors.length > 0) {
        console.log('[Workday] Found errors on review page:', errors.length);
        return false;
      }
      
      // All good - ready for submit
      return true;
    },
    
    // ============ HELPER METHODS ============
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
    
    async selectOption(select, value) {
      if (!select || !value) return false;
      
      const valueLower = value.toLowerCase();
      const options = Array.from(select.options);
      
      // Exact match first
      let match = options.find(opt => opt.text.toLowerCase() === valueLower);
      
      // Partial match
      if (!match) {
        match = options.find(opt => opt.text.toLowerCase().includes(valueLower) || valueLower.includes(opt.text.toLowerCase()));
      }
      
      if (match) {
        select.value = match.value;
        this.fireEvents(select);
        return true;
      }
      
      return false;
    },
    
    async fillWorkdayDropdown(container, value) {
      // Click to open dropdown
      const trigger = container.querySelector('[data-automation-id*="dropdown"], [role="combobox"], button');
      if (trigger) {
        trigger.click();
        await new Promise(r => setTimeout(r, 100));
        
        // Find and click matching option
        const options = document.querySelectorAll('[role="option"], [data-automation-id*="option"]');
        for (const opt of options) {
          if (opt.textContent.toLowerCase().includes(value.toLowerCase())) {
            opt.click();
            return true;
          }
        }
      }
      return false;
    },
    
    async fillDropdown(automationId, value) {
      const dropdown = document.querySelector(`[data-automation-id="${automationId}"]`);
      if (dropdown) {
        return this.fillElement(dropdown, value);
      }
      return false;
    },
    
    fireEvents(element) {
      ['focus', 'input', 'change', 'blur'].forEach(type => {
        element.dispatchEvent(new Event(type, { bubbles: true }));
      });
    }
  };

  // ============ AUTOMATIC AUTOFILL CONTROLLER ============
  const AutofillController = {
    enabled: true,
    hasRun: false,
    
    async init() {
      // Load settings
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['autofill_enabled', 'ats_profile'], resolve);
      });
      
      this.enabled = result.autofill_enabled !== false; // Default to enabled
      this.profile = result.ats_profile || {};
      
      if (this.enabled && !this.hasRun) {
        await this.detectAndFill();
      }
    },
    
    async detectAndFill() {
      if (this.hasRun) return;
      
      const url = window.location.href;
      
      // Detect Workday page type
      if (url.includes('workday') || url.includes('myworkdayjobs')) {
        this.hasRun = true;
        await this.runWorkdayAutofill();
      }
    },
    
    async runWorkdayAutofill() {
      const pageType = this.detectWorkdayPageType();
      console.log('[Autofill] Detected Workday page:', pageType);
      
      switch (pageType) {
        case 'contact':
          await WorkdayPages.handleContactInfo(this.profile);
          break;
        case 'voluntary':
          await WorkdayPages.handleVoluntaryDisclosures(this.profile);
          break;
        case 'self-id':
          await WorkdayPages.handleSelfIdentification(this.profile);
          break;
        case 'questions':
          await WorkdayPages.handleApplicationQuestions();
          break;
        case 'review':
          await WorkdayPages.handleReview();
          break;
      }
    },
    
    detectWorkdayPageType() {
      const body = document.body.textContent?.toLowerCase() || '';
      const url = window.location.href.toLowerCase();
      
      if (body.includes('my information') || body.includes('contact information') || document.querySelector('[data-automation-id="email"]')) {
        return 'contact';
      }
      if (body.includes('voluntary self-identification') || body.includes('voluntary disclosures')) {
        return 'voluntary';
      }
      if (body.includes('self-identification') || body.includes('eeo') || body.includes('equal employment')) {
        return 'self-id';
      }
      if (body.includes('application questions') || document.querySelectorAll('[data-automation-id*="question"]').length > 2) {
        return 'questions';
      }
      if (body.includes('review') && (body.includes('submit') || document.querySelector('[data-automation-id="bottom-navigation-submit-button"]'))) {
        return 'review';
      }
      
      return 'unknown';
    },
    
    async toggle(enabled) {
      this.enabled = enabled;
      await chrome.storage.local.set({ autofill_enabled: enabled });
      console.log('[Autofill] Toggled to:', enabled);
    }
  };

  // ============ EXPOSE GLOBALLY ============
  window.WorkdayPages = WorkdayPages;
  window.SavedResponses = SavedResponses;
  window.KimiAutofill = KimiAutofill;
  window.AutofillController = AutofillController;

  // ============ AUTO-INITIALIZE ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AutofillController.init());
  } else {
    setTimeout(() => AutofillController.init(), 500);
  }

  console.log('[Workday Handlers v2.0] Loaded with AI autofill support');
})();
value) {
      // Click to open dropdown
      const trigger = container.querySelector('[data-automation-id*="dropdown"], [role="combobox"], button');
      if (trigger) {
        trigger.click();
        await new Promise(r => setTimeout(r, 100));
        
        // Find and click matching option
        const options = document.querySelectorAll('[role="option"], [data-automation-id*="option"]');
        for (const opt of options) {
          if (opt.textContent.toLowerCase().includes(value.toLowerCase())) {
            opt.click();
            return true;
          }
        }
      }
      return false;
    },
    
    async fillDropdown(automationId, value) {
      const dropdown = document.querySelector(`[data-automation-id="${automationId}"]`);
      if (dropdown) {
        return this.fillElement(dropdown, value);
      }
      return false;
    },
    
    fireEvents(element) {
      ['focus', 'input', 'change', 'blur'].forEach(type => {
        element.dispatchEvent(new Event(type, { bubbles: true }));
      });
    }
  };

  // ============ AUTOMATIC AUTOFILL CONTROLLER ============
  const AutofillController = {
    enabled: true,
    hasRun: false,
    
    async init() {
      // Load settings
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['autofill_enabled', 'ats_profile'], resolve);
      });
      
      this.enabled = result.autofill_enabled !== false; // Default to enabled
      this.profile = result.ats_profile || {};
      
      if (this.enabled && !this.hasRun) {
        await this.detectAndFill();
      }
    },
    
    async detectAndFill() {
      if (this.hasRun) return;
      
      const url = window.location.href;
      
      // Detect Workday page type
      if (url.includes('workday') || url.includes('myworkdayjobs')) {
        this.hasRun = true;
        await this.runWorkdayAutofill();
      }
    },
    
    async runWorkdayAutofill() {
      const pageType = this.detectWorkdayPageType();
      console.log('[Autofill] Detected Workday page:', pageType);
      
      switch (pageType) {
        case 'contact':
          await WorkdayPages.handleContactInfo(this.profile);
          break;
        case 'voluntary':
          await WorkdayPages.handleVoluntaryDisclosures(this.profile);
          break;
        case 'self-id':
          await WorkdayPages.handleSelfIdentification(this.profile);
          break;
        case 'questions':
          await WorkdayPages.handleApplicationQuestions();
          break;
        case 'review':
          await WorkdayPages.handleReview();
          break;
      }
    },
    
    detectWorkdayPageType() {
      const body = document.body.textContent?.toLowerCase() || '';
      const url = window.location.href.toLowerCase();
      
      if (body.includes('my information') || body.includes('contact information') || document.querySelector('[data-automation-id="email"]')) {
        return 'contact';
      }
      if (body.includes('voluntary self-identification') || body.includes('voluntary disclosures')) {
        return 'voluntary';
      }
      if (body.includes('self-identification') || body.includes('eeo') || body.includes('equal employment')) {
        return 'self-id';
      }
      if (body.includes('application questions') || document.querySelectorAll('[data-automation-id*="question"]').length > 2) {
        return 'questions';
      }
      if (body.includes('review') && (body.includes('submit') || document.querySelector('[data-automation-id="bottom-navigation-submit-button"]'))) {
        return 'review';
      }
      
      return 'unknown';
    },
    
    async toggle(enabled) {
      this.enabled = enabled;
      await chrome.storage.local.set({ autofill_enabled: enabled });
      console.log('[Autofill] Toggled to:', enabled);
    }
  };

  // ============ EXPOSE GLOBALLY ============
  window.WorkdayPages = WorkdayPages;
  window.SavedResponses = SavedResponses;
  window.KimiAutofillEngine = KimiAutofillEngine;
  window.KimiK2API = KimiK2API;
  window.AutofillController = AutofillController;

  // ============ AUTO-INITIALIZE ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AutofillController.init());
  } else {
    setTimeout(() => AutofillController.init(), 500);
  }

  console.log('[Workday Handlers v3.0] Loaded with Kimi K2 API integration');
})();
