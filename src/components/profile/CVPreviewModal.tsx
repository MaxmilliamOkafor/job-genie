import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download, Loader2, Eye, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CVPreviewModalProps {
  profile: any;
}

export const CVPreviewModal = ({ profile }: CVPreviewModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    experienceCount: number;
    projectsCount: number;
    hasSkills: boolean;
    hasEducation: boolean;
  } | null>(null);

  const generatePreview = async () => {
    setIsLoading(true);
    setPdfUrl(null);
    
    try {
      // Build profile data for PDF generation
      const profileData = {
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        city: profile.city,
        country: profile.country,
        linkedin: profile.linkedin,
        github: profile.github,
        portfolio: profile.portfolio,
        professional_experience: profile.professional_experience || [],
        relevant_projects: profile.relevant_projects || [],
        education: profile.education || [],
        skills: profile.skills || { technical: [], soft: [] },
        certifications: profile.certifications || []
      };

      // Count sections for preview info
      setPreviewData({
        experienceCount: (profile.professional_experience || []).length,
        projectsCount: (profile.relevant_projects || []).length,
        hasSkills: !!(profile.skills?.technical?.length || profile.skills?.soft?.length),
        hasEducation: !!(profile.education?.length)
      });

      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: { profileData }
      });

      if (error) throw error;

      if (data?.pdfBase64) {
        // Convert base64 to blob URL for preview
        const byteCharacters = atob(data.pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        toast.success('CV preview generated successfully!');
      } else {
        throw new Error('No PDF data received');
      }
    } catch (error: any) {
      console.error('Error generating CV preview:', error);
      toast.error(error.message || 'Failed to generate CV preview');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadPdf = () => {
    if (!pdfUrl) return;
    
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `${profile.first_name || 'CV'}_${profile.last_name || ''}_Resume.pdf`.replace(/\s+/g, '_');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('PDF downloaded!');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
              <strong>ATS-Optimized Format:</strong> Company (Bold) on Line 1, Job Title (Italic) + Right-aligned Dates on Line 2. 
              All bullet points use standard characters for maximum parseability.
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
};
