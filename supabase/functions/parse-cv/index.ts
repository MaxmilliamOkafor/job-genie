import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract text from DOCX by unzipping and parsing word/document.xml
async function extractTextFromDOCX(data: Uint8Array): Promise<string> {
  try {
    const zip = new JSZip();
    await zip.loadAsync(data);
    
    // The main document content is in word/document.xml
    const documentXml = await zip.file("word/document.xml")?.async("string");
    
    if (!documentXml) {
      console.log('No document.xml found in DOCX');
      return '';
    }
    
    // Parse XML and extract text content
    // DOCX stores text in <w:t> tags
    const textMatches = documentXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    const textParts: string[] = [];
    
    for (const match of textMatches) {
      if (match[1]) {
        textParts.push(match[1]);
      }
    }
    
    // Also detect paragraph breaks for better structure
    let result = documentXml;
    
    // Replace paragraph endings with newlines for structure
    result = result.replace(/<\/w:p>/g, '\n');
    
    // Extract all text between <w:t> tags
    const allText: string[] = [];
    const tagRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let match;
    
    while ((match = tagRegex.exec(documentXml)) !== null) {
      allText.push(match[1]);
    }
    
    // Join with awareness of paragraph structure
    let fullText = '';
    let lastWasParagraph = false;
    
    // Re-process with paragraph awareness
    const paragraphs = documentXml.split('</w:p>');
    for (const para of paragraphs) {
      const paraTexts: string[] = [];
      const paraTagRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let paraMatch;
      while ((paraMatch = paraTagRegex.exec(para)) !== null) {
        if (paraMatch[1]) paraTexts.push(paraMatch[1]);
      }
      if (paraTexts.length > 0) {
        fullText += paraTexts.join('') + '\n';
      }
    }
    
    console.log('DOCX extracted text length:', fullText.length);
    return fullText.trim();
  } catch (e) {
    console.error('DOCX extraction error:', e);
    return '';
  }
}

// Simple PDF text extractor that works in Deno without workers
// Extracts text from PDF by parsing the raw PDF structure
function extractTextFromPDF(data: Uint8Array): string {
  try {
    // Convert to string for parsing
    const text = new TextDecoder('latin1').decode(data);
    const extractedText: string[] = [];
    
    // Find all text streams in the PDF
    // PDF text is typically in BT...ET blocks (Begin Text / End Text)
    const textBlockRegex = /BT\s*([\s\S]*?)\s*ET/g;
    let match;
    
    while ((match = textBlockRegex.exec(text)) !== null) {
      const block = match[1];
      
      // Extract text from Tj and TJ operators
      // Tj: (text) Tj - show text string
      // TJ: [(text) num (text)] TJ - show text with positioning
      
      // Handle Tj operator
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        const decoded = decodePDFString(tjMatch[1]);
        if (decoded.trim()) extractedText.push(decoded);
      }
      
      // Handle TJ operator (array of strings with positioning)
      const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/gi;
      let tjArrayMatch;
      while ((tjArrayMatch = tjArrayRegex.exec(block)) !== null) {
        const arrayContent = tjArrayMatch[1];
        const stringRegex = /\(([^)]*)\)/g;
        let stringMatch;
        const lineText: string[] = [];
        while ((stringMatch = stringRegex.exec(arrayContent)) !== null) {
          const decoded = decodePDFString(stringMatch[1]);
          if (decoded) lineText.push(decoded);
        }
        if (lineText.length > 0) {
          extractedText.push(lineText.join(''));
        }
      }
    }
    
    // Also try to extract text from stream objects (for compressed content)
    // This is a fallback for PDFs with different structures
    const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
    while ((match = streamRegex.exec(text)) !== null) {
      const streamContent = match[1];
      // Look for readable text patterns in streams
      const readableText = streamContent.replace(/[^\x20-\x7E\n\r]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (readableText.length > 50) {
        // Filter out obviously non-text content
        const words = readableText.split(' ').filter(w => 
          w.length >= 2 && /[a-zA-Z]/.test(w) && !/^[0-9.]+$/.test(w)
        );
        if (words.length > 5) {
          extractedText.push(words.join(' '));
        }
      }
    }
    
    // Join and clean up
    let result = extractedText.join(' ')
      .replace(/\s+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
      .trim();
    
    // If we got very little text, try a more aggressive extraction
    if (result.length < 200) {
      // Extract any readable ASCII text sequences
      const asciiText = text.replace(/[^\x20-\x7E\n\r]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Filter to only meaningful word sequences
      const meaningfulParts = asciiText.split(/\s+/)
        .filter(word => word.length >= 3 && /[a-zA-Z]{2,}/.test(word))
        .join(' ');
      
      if (meaningfulParts.length > result.length) {
        result = meaningfulParts;
      }
    }
    
    return result;
  } catch (e) {
    console.error('PDF extraction error:', e);
    return '';
  }
}

// Decode PDF string escapes
function decodePDFString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function getWorkExperienceFocusedText(fullText: string) {
  const text = String(fullText ?? '');
  const upper = text.toUpperCase();

  // Common section headers
  const startMarkers = [
    'WORK EXPERIENCE',
    'PROFESSIONAL EXPERIENCE',
    'EXPERIENCE',
    'EMPLOYMENT HISTORY',
  ];

  const endMarkers = [
    'EDUCATION',
    'CERTIFICATIONS',
    'SKILLS',
    'PROJECTS',
    'LANGUAGES',
    'ACHIEVEMENTS',
    'INTERESTS',
  ];

  let start = -1;
  for (const m of startMarkers) {
    const idx = upper.indexOf(m);
    if (idx !== -1) {
      start = idx;
      break;
    }
  }

  if (start === -1) {
    // Fallback: return the first chunk, which usually contains experience on most CVs
    return text.slice(0, 20000);
  }

  let end = upper.length;
  for (const m of endMarkers) {
    const idx = upper.indexOf(m, start + 20);
    if (idx !== -1 && idx < end) end = idx;
  }

  const section = text.slice(start, end);

  // Keep prompts bounded but generous
  return section.length > 25000 ? section.slice(0, 25000) : section;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { cvFilePath, debug } = await req.json();

    if (!cvFilePath) {
      throw new Error('CV file path is required');
    }

    console.log('Parsing CV:', cvFilePath);

    // Download the CV file from storage
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('cvs')
      .download(cvFilePath);

    if (downloadError || !fileData) {
      throw new Error('Failed to download CV file: ' + downloadError?.message);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Determine file type
    const fileExtension = cvFilePath.split('.').pop()?.toLowerCase() || 'pdf';
    const mimeType = fileExtension === 'pdf' ? 'application/pdf'
      : fileExtension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/msword';

    console.log('File type:', fileExtension, 'Size:', uint8Array.length);

    // Extract text content based on file type
    let textContent = '';
    if (fileExtension === 'pdf') {
      textContent = extractTextFromPDF(uint8Array);
      console.log('PDF extracted text length:', textContent.length);
    } else if (fileExtension === 'docx') {
      textContent = await extractTextFromDOCX(uint8Array);
      console.log('DOCX extracted text length:', textContent.length);
    } else if (fileExtension === 'doc') {
      // Legacy .doc format - try basic text extraction
      const rawText = new TextDecoder('latin1').decode(uint8Array);
      textContent = rawText.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
      console.log('DOC extracted text length:', textContent.length);
    }

    // Check if extracted text is actually readable (not binary garbage)
    const isTextReadable = (text: string): boolean => {
      if (!text || text.length < 100) return false;
      // Check if at least 50% of characters are readable ASCII letters/numbers/spaces
      const readable = text.replace(/[^a-zA-Z0-9\s.,;:!?@#$%&*()\-]/g, '');
      const ratio = readable.length / text.length;
      // Also check for presence of common CV words
      const hasCommonWords = /\b(experience|education|skills|work|company|university|degree|manager|developer|engineer|analyst)\b/i.test(text);
      return ratio > 0.4 && hasCommonWords;
    };

    const textIsReadable = isTextReadable(textContent);
    console.log('Text readable check:', textIsReadable, 'ratio check passed');

    // Fallback: if we couldn't extract readable text, warn user
    const base64Content = btoa(String.fromCharCode(...uint8Array.slice(0, 50000)));

    // Focus the model on the most important part (work experience) to avoid empty results.
    const focusedWorkExpText = textContent && textIsReadable ? getWorkExperienceFocusedText(textContent) : '';

    const usedInputType = focusedWorkExpText && focusedWorkExpText.trim().length > 200
      ? 'focused_text'
      : textContent && textIsReadable && textContent.trim().length > 200
        ? 'extracted_text'
        : 'base64_snippet';

    const inputForModel = usedInputType === 'focused_text'
      ? `CV_TEXT (focused on WORK EXPERIENCE):\n${focusedWorkExpText}`
      : usedInputType === 'extracted_text'
        ? `CV_TEXT (extracted):\n${textContent.substring(0, 30000)}`
        : `CV_BASE64_SNIPPET (${mimeType}):\n${base64Content.substring(0, 40000)}`;

    // Create a readable snippet for debug (sanitize binary garbage)
    const createReadableSnippet = (text: string): string => {
      if (!text) return '[No text extracted - PDF may be image-based]';
      if (!isTextReadable(text)) {
        return '[Text extraction failed - PDF appears to be image-based. Please upload a DOCX file or a PDF with selectable text.]';
      }
      return text.substring(0, 500);
    };

    const debugPayload = debug ? {
      extractedTextLength: textContent.length,
      extractedTextSnippet: createReadableSnippet(textContent),
      fileExtension,
      usedInputType,
    } : null;

    console.log('Using extracted text:', textIsReadable && textContent.length > 200);
    console.log('Focused text length:', focusedWorkExpText.length);
    console.log('Used input type:', usedInputType);
    // Get user's API keys - prefer Kimi K2, fallback to OpenAI
    const { data: profileData } = await supabaseClient
      .from('profiles')
      .select('openai_api_key, kimi_api_key, preferred_ai_provider, openai_enabled, kimi_enabled')
      .eq('user_id', user.id)
      .single();

    const kimiKey = profileData?.kimi_api_key;
    const openaiKey = profileData?.openai_api_key || Deno.env.get('OPENAI_API_KEY');
    const preferKimi = profileData?.preferred_ai_provider === 'kimi' && profileData?.kimi_enabled && kimiKey;
    const useOpenAI = profileData?.preferred_ai_provider === 'openai' && profileData?.openai_enabled && openaiKey;

    // Determine which API to use
    let apiKey: string;
    let apiUrl: string;
    let model: string;

    if (preferKimi && kimiKey) {
      apiKey = kimiKey;
      apiUrl = 'https://api.moonshot.ai/v1/chat/completions';
      model = 'kimi-k2-0711-preview';
      console.log('Using Kimi K2 for parsing');
    } else if (openaiKey) {
      apiKey = openaiKey;
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      model = 'gpt-4o-mini';
      console.log('Using OpenAI for parsing');
    } else {
      throw new Error('No AI API key configured. Please add your API key in the profile settings.');
    }

    // Use AI to extract structured data from CV text
    const extractionResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: `You are an expert CV/Resume parser. Extract structured information from the provided CV content and return it as a JSON object.

Important rules:
- Preserve company names and job titles exactly as written in the CV.
- Do NOT swap company/title.
- If the CV uses headings (e.g. starting with "#"), treat them as section markers, not part of the values.

Extract the following fields (use null if not found):
- first_name: string
- last_name: string
- email: string
- phone: string
- city: string
- country: string
- linkedin: string (full URL if possible)
- github: string (full URL if possible)
- portfolio: string (full URL if possible)
- total_experience: string (e.g., "5+ years")
- highest_education: string (e.g., "Master's in Computer Science")
- current_salary: string (if mentioned)
- expected_salary: string (if mentioned)
- skills: array of objects with {name: string, years: number, category: "technical" | "soft"}
- certifications: array of strings
- work_experience: array of objects with {company: string, title: string, startDate: string, endDate: string, description: string, bullets: string[]}
  - bullets should be an array of individual achievement/responsibility strings
  - description should be a brief role summary
- education: array of objects with {institution: string, degree: string, field: string, startDate: string, endDate: string}
- languages: array of objects with {language: string, proficiency: "native" | "fluent" | "conversational" | "basic"}
- cover_letter: string (a brief professional summary if available)

Return ONLY valid JSON, no markdown or explanation.`
          },
          {
            role: 'user',
            content: `Parse this CV content and extract structured data:\n\n${inputForModel}`
          }
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      console.error('AI extraction error:', errorText);
      throw new Error('Failed to parse CV with AI');
    }

    const extractionData = await extractionResponse.json();
    const extractedText = extractionData.choices?.[0]?.message?.content || '';
    
    // Parse the JSON response
    let parsedData: any;
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanedText = extractedText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      parsedData = JSON.parse(cleanedText);
      console.log('Successfully parsed CV data');
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Raw text:', extractedText.substring(0, 500));
      throw new Error('Failed to parse extracted CV data');
    }

    // If the model returned no work experience, do a second focused pass (most common failure mode)
    if (!Array.isArray(parsedData?.work_experience) || parsedData.work_experience.length === 0) {
      console.log('No work_experience extracted in first pass; running focused work-experience pass');

      const focusedPrompt = {
        model,
        messages: [
          {
            role: 'system',
            content: `You extract ONLY work experience entries from CV text.

Rules:
- Output ONLY valid JSON.
- Return an object with exactly: {"work_experience": [...]}
- Each item: {"company": string, "title": string, "startDate": string|null, "endDate": string|null, "description": string, "bullets": string[]}
- bullets must be an array of individual achievement/responsibility strings (one per bullet point).
- description should be a brief role summary or empty string.
- Preserve company names exactly (including "formerly" notes).
- Do not invent roles. If unsure, include the closest matching text from the CV.`
          },
          {
            role: 'user',
            content: `Extract work experience from this CV section:\n\n${inputForModel}`
          }
        ],
        temperature: 0,
        max_tokens: 3000,
      };

      const focusedRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(focusedPrompt),
      });

      if (focusedRes.ok) {
        const focusedJson = await focusedRes.json();
        const focusedText = focusedJson.choices?.[0]?.message?.content || '';
        try {
          let cleaned = String(focusedText).trim();
          if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
          if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
          const focusedParsed = JSON.parse(cleaned);
          if (Array.isArray(focusedParsed?.work_experience) && focusedParsed.work_experience.length > 0) {
            parsedData.work_experience = focusedParsed.work_experience;
            console.log('Focused pass extracted work_experience:', focusedParsed.work_experience.length);
          } else {
            console.log('Focused pass still returned empty work_experience');
          }
        } catch (e) {
          console.error('Focused pass JSON parse error:', e, 'Raw text:', String(focusedText).substring(0, 500));
        }
      } else {
        const errorText = await focusedRes.text();
        console.error('Focused pass AI extraction error:', errorText);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: parsedData,
        ...(debugPayload ? { debug: debugPayload } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Parse CV error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
