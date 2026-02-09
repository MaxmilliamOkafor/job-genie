import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download, Loader2, Eye, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface CVPreviewModalProps {
  profile: any;
}

// Internal component wrapped with error boundary
const CVPreviewModalContent = ({ profile }: CVPreviewModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    experienceCount: number;
    projectsCount: number;
    hasSkills: boolean;
    hasEducation: boolean;
  } | null>(null);

  // Prevent late async responses from updating state after close/unmount
  const requestSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const revokePdfUrl = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
  };

  const base64PdfToBlobUrl = async (pdfBase64: string): Promise<string> => {
    // Use a data URL + fetch to avoid atob() on huge strings (can crash the tab)
    const res = await fetch(`data:application/pdf;base64,${pdfBase64}`);
    const blob = await res.blob();

    if (!blob || blob.size < 512) {
      throw new Error('Generated PDF looks corrupted (file too small)');
    }

    return URL.createObjectURL(blob);
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    let timeoutId: number | undefined;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };

  const generatePreview = async () => {
    const currentRequest = ++requestSeqRef.current;

    setIsLoading(true);
    setError(null);

    // Clean up any previous URL before generating a new one
    revokePdfUrl();
    setPdfUrl(null);

    try {
      if (!profile) {
        throw new Error('Profile data is missing');
      }

      // Build profile data for PDF generation with safe defaults
      const profileData = {
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        city: profile.city || '',
        country: profile.country || '',
        linkedin: profile.linkedin || '',
        github: profile.github || '',
        portfolio: profile.portfolio || '',
        professional_experience: Array.isArray(profile.professional_experience) ? profile.professional_experience : [],
        relevant_projects: Array.isArray(profile.relevant_projects) ? profile.relevant_projects : [],
        education: Array.isArray(profile.education) ? profile.education : [],
        skills: profile.skills || { technical: [], soft: [] },
        certifications: Array.isArray(profile.certifications) ? profile.certifications : [],
      };

      // Count sections for preview info
      setPreviewData({
        experienceCount: profileData.professional_experience.length,
        projectsCount: profileData.relevant_projects.length,
        hasSkills: !!(profileData.skills?.technical?.length || profileData.skills?.soft?.length),
        hasEducation: profileData.education.length > 0,
      });

      const invokePromise = supabase.functions.invoke('generate-pdf', {
        body: { profileData },
      });

      const { data, error: apiError } = await withTimeout(
        invokePromise,
        65000,
        'PDF generation timed out - please try again',
      );

      // Ignore late responses after a newer request started or modal closed
      if (!isMountedRef.current || requestSeqRef.current !== currentRequest) return;

      if (apiError) {
        throw new Error(apiError.message || 'Failed to generate PDF');
      }

      if (!data) {
        throw new Error('No response received from PDF generator');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (typeof data?.pdfBase64 !== 'string' || data.pdfBase64.length < 1000) {
        throw new Error('Invalid PDF data received');
      }

      // Guard against unusually large payloads that could crash the tab
      if (data.pdfBase64.length > 25_000_000) {
        throw new Error('PDF is too large to preview safely. Please download instead.');
      }

      const url = await base64PdfToBlobUrl(data.pdfBase64);

      if (!isMountedRef.current || requestSeqRef.current !== currentRequest) {
        URL.revokeObjectURL(url);
        return;
      }

      setPdfUrl(url);
      toast.success('CV preview generated successfully!');
    } catch (err: any) {
      console.error('Error generating CV preview:', err);
      const errorMessage = err?.message || 'Failed to generate CV preview';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      // Only clear loading if this is still the latest request
      if (requestSeqRef.current === currentRequest) {
        setIsLoading(false);
      }
    }
  };

  const downloadPdf = () => {
    if (!pdfUrl) return;
    
    try {
      const firstName = profile?.first_name || 'CV';
      const lastName = profile?.last_name || '';
      const safeName = `${firstName}_${lastName}_Resume.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = safeName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('PDF downloaded!');
    } catch (downloadError) {
      console.error('Download failed:', downloadError);
      toast.error('Failed to download PDF');
    }
  };

  // Cleanup blob URL on unmount
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setError(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Eye className="h-4 w-4" />
          Preview Complete CV PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Complete CV Preview
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button 
              onClick={generatePreview} 
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Generate Preview
                </>
              )}
            </Button>
            
            {pdfUrl && (
              <Button 
                variant="secondary" 
                onClick={downloadPdf}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            )}
          </div>

          {/* Error display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={generatePreview}
                  className="ml-2 gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Section summary */}
          {previewData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className={`p-2 rounded border text-center text-sm ${previewData.experienceCount > 0 ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'}`}>
                <div className="flex items-center justify-center gap-1">
                  {previewData.experienceCount > 0 ? <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" /> : <AlertTriangle className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />}
                  <span className="font-medium">{previewData.experienceCount}</span>
                </div>
                <p className="text-xs text-muted-foreground">Experience</p>
              </div>
              
              <div className={`p-2 rounded border text-center text-sm ${previewData.projectsCount > 0 ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : 'bg-muted border-muted'}`}>
                <div className="flex items-center justify-center gap-1">
                  {previewData.projectsCount > 0 ? <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" /> : <span className="h-3 w-3" />}
                  <span className="font-medium">{previewData.projectsCount}</span>
                </div>
                <p className="text-xs text-muted-foreground">Projects</p>
              </div>
              
              <div className={`p-2 rounded border text-center text-sm ${previewData.hasSkills ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'}`}>
                <div className="flex items-center justify-center gap-1">
                  {previewData.hasSkills ? <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" /> : <AlertTriangle className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />}
                </div>
                <p className="text-xs text-muted-foreground">Skills</p>
              </div>
              
              <div className={`p-2 rounded border text-center text-sm ${previewData.hasEducation ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : 'bg-muted border-muted'}`}>
                <div className="flex items-center justify-center gap-1">
                  {previewData.hasEducation ? <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" /> : <span className="h-3 w-3" />}
                </div>
                <p className="text-xs text-muted-foreground">Education</p>
              </div>
            </div>
          )}

          {/* PDF Preview */}
          <div className="flex-1 border rounded-lg overflow-hidden bg-muted/50">
            {pdfUrl ? (
              <iframe 
                src={pdfUrl} 
                className="w-full h-full"
                title="CV Preview"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 p-8">
                <FileText className="h-16 w-16 opacity-30" />
                <div className="text-center">
                  <p className="font-medium">No Preview Generated</p>
                  <p className="text-sm">Click "Generate Preview" to see your complete CV PDF</p>
                  <p className="text-xs mt-2">
                    Includes: Professional Experience, Technical Projects, Skills, Education
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Format info */}
          <Alert className="border-primary/30">
            <FileText className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>ATS-Optimised Format:</strong> Company (Bold) on Line 1, Job Title (Italic) + Right-aligned Dates on Line 2. 
              All bullet points use standard characters for maximum parseability.
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Export wrapped with ErrorBoundary
export const CVPreviewModal = ({ profile }: CVPreviewModalProps) => (
  <ErrorBoundary
    fallback={
      <Button variant="outline" className="gap-2" disabled>
        <AlertTriangle className="h-4 w-4 text-destructive" />
        Preview Unavailable
      </Button>
    }
  >
    <CVPreviewModalContent profile={profile} />
  </ErrorBoundary>
);