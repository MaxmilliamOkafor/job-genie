// Rich Text Editor - Lightweight editor for education descriptions
// Supports bold/italic formatting with ATS-safe plain text export

(function(global) {
  'use strict';

  const RichTextEditor = {
    
    // ============ CREATE EDITOR INSTANCE ============
    createEditor(containerSelector, options = {}) {
      const container = typeof containerSelector === 'string' 
        ? document.querySelector(containerSelector) 
        : containerSelector;

      if (!container) {
        console.error('[RichTextEditor] Container not found:', containerSelector);
        return null;
      }

      const editorId = 'rte-' + Math.random().toString(36).substr(2, 9);
      
      // Create editor HTML structure
      container.innerHTML = this.getEditorHTML(editorId, options);
      
      // Initialize editor
      const editor = {
        id: editorId,
        container: container,
        toolbar: container.querySelector('.rte-toolbar'),
        editor: container.querySelector('.rte-editor'),
        textarea: container.querySelector('.rte-textarea'),
        options: options
      };

      // Bind events
      this.bindEditorEvents(editor);
      
      // Set initial content if provided
      if (options.initialContent) {
        this.setContent(editor, options.initialContent);
      }

      return editor;
    },

    getEditorHTML(editorId, options) {
      const placeholder = options.placeholder || 'Enter education description...';
      
      return `
        <div class="rich-text-editor" id="${editorId}">
          <div class="rte-toolbar">
            <button type="button" class="rte-btn rte-bold" title="Bold (Ctrl+B)" data-command="bold">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.21 13c2.106 0 3.412-1.087 3.412-2.823 0-1.306-.984-2.283-2.414-2.386v-.055a2.176 2.176 0 0 0 1.852-2.14c0-1.51-1.162-2.46-3.014-2.46H3v9h5.21zM5.686 5.21h1.75c.84 0 1.393.538 1.393 1.354 0 .77-.553 1.316-1.393 1.316H5.686V5.21zm0 5.79h1.969c.84 0 1.484.586 1.484 1.415 0 .84-.644 1.454-1.484 1.454H5.686v-2.869z"/>
              </svg>
            </button>
            <button type="button" class="rte-btn rte-italic" title="Italic (Ctrl+I)" data-command="italic">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.5 2.5h4l-4 9h4l-.5 2h-5l.5-2h3.5l4-9H10l.5-2h5l-.5 2H11l-4.5 9z"/>
              </svg>
            </button>
            <div class="rte-separator"></div>
            <button type="button" class="rte-btn rte-clean" title="Clear Formatting" data-command="removeFormat">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4zm4.5 3.5a.5.5 0 0 1 1 0v4a.5.5 0 0 1-1 0v-4z"/>
              </svg>
            </button>
          </div>
          <div class="rte-editor" contenteditable="true" placeholder="${placeholder}"></div>
          <textarea class="rte-textarea" placeholder="${placeholder}" style="display: none;"></textarea>
        </div>
      `;
    },

    bindEditorEvents(editor) {
      const { toolbar, editorEl, textarea } = editor;

      // Toolbar button clicks
      toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('.rte-btn');
        if (btn && btn.dataset.command) {
          this.execCommand(editor, btn.dataset.command);
          this.updateToolbarState(editor);
        }
      });

      // Editor input events
      editorEl.addEventListener('input', () => {
        this.syncToTextarea(editor);
        this.updateToolbarState(editor);
        
        // Trigger change callback if provided
        if (editor.options.onChange) {
          editor.options.onChange(this.getContent(editor));
        }
      });

      // Keyboard shortcuts
      editorEl.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
          switch (e.key) {
            case 'b':
              e.preventDefault();
              this.execCommand(editor, 'bold');
              break;
            case 'i':
              e.preventDefault();
              this.execCommand(editor, 'italic');
              break;
          }
        }
      });

      // Focus events
      editorEl.addEventListener('focus', () => {
        editor.container.classList.add('rte-focused');
      });

      editorEl.addEventListener('blur', () => {
        editor.container.classList.remove('rte-focused');
      });

      // Paste handling (clean formatting)
      editorEl.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        this.insertText(editor, text);
      });
    },

    execCommand(editor, command) {
      editor.editor.focus();
      
      switch (command) {
        case 'bold':
          document.execCommand('bold', false, null);
          break;
        case 'italic':
          document.execCommand('italic', false, null);
          break;
        case 'removeFormat':
          document.execCommand('removeFormat', false, null);
          break;
      }
    },

    updateToolbarState(editor) {
      const { toolbar } = editor;
      const selection = window.getSelection();
      
      if (selection.rangeCount === 0) return;

      // Update bold button state
      const isBold = document.queryCommandState('bold');
      const boldBtn = toolbar.querySelector('.rte-bold');
      boldBtn.classList.toggle('active', isBold);

      // Update italic button state
      const isItalic = document.queryCommandState('italic');
      const italicBtn = toolbar.querySelector('.rte-italic');
      italicBtn.classList.toggle('active', isItalic);
    },

    insertText(editor, text) {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Trigger input event
      this.syncToTextarea(editor);
    },

    syncToTextarea(editor) {
      const html = editor.editor.innerHTML;
      const plain = this.htmlToPlain(html);
      editor.textarea.value = plain;
    },

    htmlToPlain(html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return tmp.textContent || tmp.innerText || '';
    },

    // ============ CONTENT METHODS ============
    getContent(editor, format = 'html') {
      const html = editor.editor.innerHTML;
      
      switch (format) {
        case 'html':
          return html;
        case 'plain':
          return this.htmlToPlain(html);
        case 'markdown':
          return this.htmlToMarkdown(html);
        default:
          return html;
      }
    },

    setContent(editor, content) {
      // Detect content format and convert appropriately
      let html;
      
      if (this.isHTML(content)) {
        html = content;
      } else if (this.isMarkdown(content)) {
        html = this.markdownToHTML(content);
      } else {
        // Plain text - escape and wrap
        html = this.escapeHTML(content);
      }
      
      editor.editor.innerHTML = html;
      this.syncToTextarea(editor);
    },

    isHTML(str) {
      return /<[^>]+>/.test(str);
    },

    isMarkdown(str) {
      return /[*_]/.test(str);
    },

    escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    // ============ FORMAT CONVERSION ============
    htmlToMarkdown(html) {
      let md = html;
      
      // <strong> or <b> -> **bold**
      md = md.replace(/<strong[^>]*>(.+?)<\/strong>/gi, '**$1**');
      md = md.replace(/<b[^>]*>(.+?)<\/b>/gi, '**$1**');
      
      // <em> or <i> -> *italic*
      md = md.replace(/<em[^>]*>(.+?)<\/em>/gi, '*$1*');
      md = md.replace(/<i[^>]*>(.+?)<\/i>/gi, '*$1*');
      
      // Remove other HTML tags
      md = md.replace(/<[^>]+>/g, '');
      
      return md;
    },

    markdownToHTML(md) {
      let html = this.escapeHTML(md);
      
      // **bold** -> <strong>bold</strong>
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      
      // *italic* -> <em>italic</em>
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
      
      // __bold__ -> <strong>bold</strong>
      html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
      
      // _italic_ -> <em>italic</em>
      html = html.replace(/_(.+?)_/g, '<em>$1</em>');
      
      // Convert newlines to <br>
      html = html.replace(/\n/g, '<br>');
      
      return html;
    },

    // ============ ATS-SAFE EXPORT ============
    getATSSafeContent(editor) {
      const plain = this.getContent(editor, 'plain');
      
      // Additional ATS-safe processing
      return this.processForATS(plain);
    },

    processForATS(text) {
      // Remove any remaining HTML tags
      let clean = text.replace(/<[^>]+>/g, '');
      
      // Normalize whitespace
      clean = clean.replace(/\s+/g, ' ').trim();
      
      // Remove special characters that might break ATS
      clean = clean.replace(/[^\w\s.,;:!?()&'-]/g, '');
      
      return clean;
    },

    // ============ EDUCATION SECTION HANDLING ============
    createEducationEditor(container, educationData, options = {}) {
      const editor = this.createEditor(container, {
        placeholder: 'Describe your education, achievements, and relevant coursework...',
        initialContent: educationData.description || '',
        onChange: (content) => {
          if (options.onChange) {
            options.onChange({
              html: content,
              plain: this.getATSSafeContent(editor),
              markdown: this.getContent(editor, 'markdown')
            });
          }
        }
      });

      // Add education-specific methods
      editor.getEducationData = () => ({
        degree: educationData.degree || '',
        institution: educationData.institution || '',
        dates: educationData.dates || '',
        gpa: educationData.gpa || '',
        description: {
          html: this.getContent(editor, 'html'),
          plain: this.getATSSafeContent(editor),
          markdown: this.getContent(editor, 'markdown')
        }
      });

      return editor;
    }
  };

  // ============ STYLES ============
  const styles = `
    .rich-text-editor {
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      background: white;
    }

    .rte-toolbar {
      display: flex;
      align-items: center;
      padding: 8px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      border-radius: 4px 4px 0 0;
      gap: 4px;
    }

    .rte-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 1px solid transparent;
      border-radius: 3px;
      background: transparent;
      cursor: pointer;
      transition: all 0.2s;
    }

    .rte-btn:hover {
      background: #e0e0e0;
      border-color: #ccc;
    }

    .rte-btn.active {
      background: #007acc;
      color: white;
      border-color: #005a9e;
    }

    .rte-separator {
      width: 1px;
      height: 24px;
      background: #ddd;
      margin: 0 4px;
    }

    .rte-editor {
      min-height: 120px;
      padding: 12px;
      outline: none;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
    }

    .rte-editor:empty::before {
      content: attr(placeholder);
      color: #999;
      font-style: italic;
    }

    .rte-editor:focus {
      background: #fafafa;
    }

    .rte-editor strong {
      font-weight: bold;
    }

    .rte-editor em {
      font-style: italic;
    }

    .rte-textarea {
      width: 100%;
      min-height: 120px;
      padding: 12px;
      border: none;
      outline: none;
      font-family: Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      resize: vertical;
    }

    .rte-focused {
      border-color: #007acc;
      box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
    }
  `;

  // Inject styles if not already present
  if (!document.getElementById('rich-text-editor-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'rich-text-editor-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  // ============ EXPORT ============
  global.RichTextEditor = RichTextEditor;

})(typeof window !== 'undefined' ? window : this);
