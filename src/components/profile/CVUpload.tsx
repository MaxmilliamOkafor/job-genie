import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Upload, FileText, Trash2, Loader2, Download, Sparkles } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ParsedCVData {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  total_experience?: string | null;
  highest_education?: string | null;
  current_salary?: string | null;
  expected_salary?: string | null;
  skills?: Array<{ name: string; years: number; category: string }>;
  certifications?: string[];
  work_experience?: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    description: string;
    bullets?: string[];
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
  }>;
  languages?: Array<{ language: string; proficiency: string }>;
  cover_letter?: string | null;
}

type ImportMode = 'work_experience_only' | 'all_fields';

interface CVUploadProps {
  cvFileName?: string | null;
  cvFilePath?: string | null;
  cvUploadedAt?: string | null;
  onUploadComplete: (path: string, fileName: string) => void;
  onDelete: () => void;
  onParsedData?: (data: ParsedCVData, mode: ImportMode) => void;
}

export function CVUpload({ cvFileName, cvFilePath, cvUploadedAt, onUploadComplete, onDelete, onParsedData }: CVUploadProps) {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [showParseConfirm, setShowParseConfirm] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [lastParseDebug, setLastParseDebug] = useState<{
    extractedTextLength: number;
    extractedTextSnippet: string;
    fileExtension: string;
    usedInputType: string;
    readableText: boolean;
  } | null>(null);
  const [pendingParsedData, setPendingParsedData] = useState<ParsedCVData | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedImportMode, setSelectedImportMode] = useState<ImportMode>('work_experience_only');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PDF or Word document');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);

    try {
      if (cvFilePath) {
        await supabase.storage.from('cvs').remove([cvFilePath]);
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('cvs')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      onUploadComplete(fileName, file.name);
      toast.success('CV uploaded successfully!');
      
      if (onParsedData) {
        setPendingFilePath(fileName);
        setShowParseConfirm(true);
      }
    } catch (error) {
      console.error('Error uploading CV:', error);
      toast.error('Failed to upload CV');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleParseCV = async (filePath: string, mode: ImportMode) => {
    if (!onParsedData) {
      toast.info('CV parsing is not available in this context');
      return;
    }

    setIsParsing(true);
    setShowParseConfirm(false);
    setSelectedImportMode(mode);

    try {
      setLastParseDebug(null);

      const { data, error } = await supabase.functions.invoke('parse-cv', {
        body: { cvFilePath: filePath, debug: true }
      });

      if (error) throw error;

      if (data.success && data.data) {
        // Check if text was readable
        const isReadable = data.debug?.extractedTextSnippet && 
          !/^[^\x20-\x7E\s]*$/.test(data.debug.extractedTextSnippet.substring(0, 100)) &&
          /[a-zA-Z]{3,}/.test(data.debug.extractedTextSnippet);
        
        if (data.debug) {
          setLastParseDebug({
            ...data.debug,
            readableText: isReadable
          });
        }
        
        // Store parsed data and show review modal
        setPendingParsedData(data.data);
        setShowReviewModal(true);
      } else {
        if (data?.debug) {
          setLastParseDebug({
            ...data.debug,
            readableText: false
          });
        }
        throw new Error(data.error || 'Failed to parse CV');
      }
    } catch (error: any) {
      console.error('Error parsing CV:', error);
      toast.error(error.message || 'Failed to parse CV. Please fill in your details manually.');
    } finally {
      setIsParsing(false);
      setPendingFilePath(null);
    }
  };

  const handleApplyParsedData = () => {
    if (pendingParsedData && onParsedData) {
      onParsedData(pendingParsedData, selectedImportMode);
      const message = selectedImportMode === 'work_experience_only' 
        ? 'Work experience imported successfully!' 
        : 'All profile fields imported successfully!';
      toast.success(message);
    }
    setShowReviewModal(false);
    setPendingParsedData(null);
  };

  const handleDelete = async () => {
    if (!cvFilePath || !user) return;

    setIsDeleting(true);

    try {
      const { error } = await supabase.storage
        .from('cvs')
        .remove([cvFilePath]);

      if (error) throw error;

      onDelete();
      toast.success('CV deleted');
    } catch (error) {
      console.error('Error deleting CV:', error);
      toast.error('Failed to delete CV');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async () => {
    if (!cvFilePath) return;

    try {
      const { data, error } = await supabase.storage
        .from('cvs')
        .download(cvFilePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = cvFileName || 'cv.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading CV:', error);
      toast.error('Failed to download CV');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Resume / CV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />

          {cvFilePath && cvFileName ? (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium">{cvFileName}</p>
                  {cvUploadedAt && (
                    <p className="text-xs text-muted-foreground">
                      Uploaded {new Date(cvUploadedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {onParsedData && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setPendingFilePath(cvFilePath);
                      setShowParseConfirm(true);
                    }}
                    disabled={isParsing}
                    title="Parse CV to auto-fill profile"
                  >
                    {isParsing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleDownload} title="Download CV">
                  <Download className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDelete}
                  disabled={isDeleting}
                  title="Delete CV"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg hover:border-primary/50 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-center mb-4">
                Upload your CV/Resume (PDF or Word, max 10MB)
              </p>
            </div>
          )}

          <Button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isParsing}
            className="w-full"
            variant={cvFilePath ? 'outline' : 'default'}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : isParsing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Parsing CV...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {cvFilePath ? 'Replace CV' : 'Upload CV'}
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Your CV is stored securely and can be parsed to auto-fill your profile
          </p>

          {lastParseDebug && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">Parse Status</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${lastParseDebug.readableText ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                  {lastParseDebug.readableText ? 'Text Readable' : 'Text Quality Issue'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground grid grid-cols-3 gap-2">
                <div className="p-2 rounded bg-background border">
                  <p className="text-muted-foreground">Format</p>
                  <p className="font-medium text-foreground">{lastParseDebug.fileExtension.toUpperCase()}</p>
                </div>
                <div className="p-2 rounded bg-background border">
                  <p className="text-muted-foreground">Characters</p>
                  <p className="font-medium text-foreground">{lastParseDebug.extractedTextLength.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded bg-background border">
                  <p className="text-muted-foreground">Method</p>
                  <p className="font-medium text-foreground">{lastParseDebug.usedInputType === 'focused_text' ? 'Focused' : 'Full'}</p>
                </div>
              </div>
              {!lastParseDebug.readableText && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ PDF text layer may be image-based. Try uploading a DOCX or a PDF with selectable text.
                </p>
              )}
            </div>
          )}

        </CardContent>
      </Card>

      <AlertDialog open={showParseConfirm} onOpenChange={setShowParseConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Import from CV
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Choose what to import from your CV:</p>
              <div className="space-y-2 text-sm">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="font-medium text-foreground">Work Experience Only (Recommended)</p>
                  <p className="text-muted-foreground">Only updates work experience. Your other profile fields remain unchanged.</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="font-medium text-foreground">Import All Fields</p>
                  <p className="text-muted-foreground">Overwrites name, contact, skills, education, and work experience.</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setPendingFilePath(null)} className="mt-0">
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => pendingFilePath && handleParseCV(pendingFilePath, 'all_fields')}
            >
              Import All Fields
            </Button>
            <AlertDialogAction 
              onClick={() => pendingFilePath && handleParseCV(pendingFilePath, 'work_experience_only')}
            >
              Work Experience Only
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review Parsed Data Modal */}
      <AlertDialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Review Parsed Data
            </AlertDialogTitle>
            <AlertDialogDescription>
              Review the extracted data before applying to your profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="flex-1 overflow-auto space-y-4 py-4">
            {pendingParsedData?.work_experience && pendingParsedData.work_experience.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Work Experience ({pendingParsedData.work_experience.length} roles found)</h4>
                {pendingParsedData.work_experience.map((exp, idx) => (
                  <div key={idx} className="p-3 rounded-lg border bg-muted/30 space-y-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-foreground">{exp.company || 'Unknown Company'}</p>
                        <p className="text-sm italic text-muted-foreground">{exp.title || 'Unknown Title'}</p>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {exp.startDate || '?'} – {exp.endDate || 'Present'}
                      </p>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 ? (
                      <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        {exp.bullets.slice(0, 3).map((bullet, bIdx) => (
                          <li key={bIdx}>{bullet}</li>
                        ))}
                        {exp.bullets.length > 3 && (
                          <li className="text-primary">+{exp.bullets.length - 3} more bullets...</li>
                        )}
                      </ul>
                    ) : exp.description ? (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{exp.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center border rounded-lg bg-muted/30">
                <p className="text-muted-foreground">No work experience was extracted.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  The PDF may have an image-based text layer. Try uploading a DOCX file instead.
                </p>
              </div>
            )}

            {selectedImportMode === 'all_fields' && (
              <>
                {pendingParsedData?.first_name && (
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium">{pendingParsedData.first_name} {pendingParsedData.last_name}</p>
                  </div>
                )}
                {pendingParsedData?.email && (
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium">{pendingParsedData.email}</p>
                  </div>
                )}
                {pendingParsedData?.skills && pendingParsedData.skills.length > 0 && (
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Skills ({pendingParsedData.skills.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {pendingParsedData.skills.slice(0, 10).map((skill, idx) => (
                        <span key={idx} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {skill.name}
                        </span>
                      ))}
                      {pendingParsedData.skills.length > 10 && (
                        <span className="text-xs text-muted-foreground">+{pendingParsedData.skills.length - 10} more</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <AlertDialogFooter className="border-t pt-4">
            <AlertDialogCancel onClick={() => {
              setShowReviewModal(false);
              setPendingParsedData(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleApplyParsedData}
              disabled={!pendingParsedData?.work_experience?.length && selectedImportMode === 'work_experience_only'}
            >
              Apply to Profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
