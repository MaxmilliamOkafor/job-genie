import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Global error handler hook that catches unhandled errors and promise rejections
 * This prevents the entire app from crashing due to uncaught async errors
 */
export function useGlobalErrorHandler() {
  useEffect(() => {
    // Handle unhandled promise rejections (async errors)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[GlobalErrorHandler] Unhandled Promise Rejection:', event.reason);
      
      // Prevent the default browser error logging (we handle it ourselves)
      event.preventDefault();
      
      // Extract error message safely
      let errorMessage = 'An unexpected error occurred';
      
      if (event.reason) {
        if (typeof event.reason === 'string') {
          errorMessage = event.reason;
        } else if (event.reason instanceof Error) {
          errorMessage = event.reason.message;
        } else if (typeof event.reason === 'object' && event.reason.message) {
          errorMessage = String(event.reason.message);
        }
      }
      
      // Truncate long error messages
      if (errorMessage.length > 100) {
        errorMessage = errorMessage.substring(0, 100) + '...';
      }
      
      // Show user-friendly toast
      toast.error('Something went wrong', {
        description: errorMessage,
        duration: 5000,
      });
    };

    // Handle uncaught errors (sync errors that bubble up)
    const handleError = (event: ErrorEvent) => {
      console.error('[GlobalErrorHandler] Uncaught Error:', event.error);
      
      // Don't show toast for script errors from external sources
      if (event.message === 'Script error.' || event.filename?.includes('chrome-extension')) {
        return;
      }
      
      // Prevent default browser error handling
      event.preventDefault();
      
      const errorMessage = event.error?.message || event.message || 'An unexpected error occurred';
      
      toast.error('Something went wrong', {
        description: errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage,
        duration: 5000,
      });
    };

    // Add event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);
}

/**
 * Safe JSON parsing that handles malformed responses from APIs
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    // Clean up common issues with LLM responses
    let cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    
    // Find JSON boundaries
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1) {
      console.warn('[safeJsonParse] No JSON object found');
      return fallback;
    }
    
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    
    try {
      return JSON.parse(cleaned);
    } catch {
      // Try to repair common JSON issues
      cleaned = cleaned
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .replace(/\\n/g, ' ')
        .replace(/\n/g, ' ');
      
      return JSON.parse(cleaned);
    }
  } catch (error) {
    console.error('[safeJsonParse] Failed to parse JSON:', error);
    return fallback;
  }
}

/**
 * Safe string renderer that handles unexpected data types
 * React cannot render objects directly, this ensures safe rendering
 */
export function safeRenderValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (Array.isArray(value)) {
    return value.map(safeRenderValue).join(', ');
  }
  
  if (typeof value === 'object') {
    // Try to extract a meaningful string from common patterns
    const obj = value as Record<string, unknown>;
    if (obj.text) return safeRenderValue(obj.text);
    if (obj.message) return safeRenderValue(obj.message);
    if (obj.content) return safeRenderValue(obj.content);
    if (obj.value) return safeRenderValue(obj.value);
    if (obj.name) return safeRenderValue(obj.name);
    
    // Last resort: stringify
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }
  
  return String(value);
}