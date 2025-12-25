import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Upload, FileText, Trash2, Loader2, Download } from 'lucide-react';

interface CVUploadProps {
  cvFileName?: string | null;
  cvFilePath?: string | null;
  cvUploadedAt?: string | null;
  onUploadComplete: (path: string, fileName: string) => void;
  onDelete: () => void;
}

export function CVUpload({ cvFileName, cvFilePath, cvUploadedAt, onUploadComplete, onDelete }: CVUploadProps) {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PDF or Word document');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);

    try {
      // Delete existing file if present
      if (cvFilePath) {
        await supabase.storage.from('cvs').remove([cvFilePath]);
      }

      // Upload new file
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

      // Create download link
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
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDelete}
                disabled={isDeleting}
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
          disabled={isUploading}
          className="w-full"
          variant={cvFilePath ? 'outline' : 'default'}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              {cvFilePath ? 'Replace CV' : 'Upload CV'}
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Your CV is stored securely and used to auto-fill applications
        </p>
      </CardContent>
    </Card>
  );
}