import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Copy, Database } from 'lucide-react';
import { toast } from 'sonner';
import { CERTIFICATIONS_MAX, printedCertifications } from '@/lib/profileValidation';
import { workAuthCountryNames } from '@/lib/workAuthCountries';

interface DataPreviewPanelProps {
  profile: Record<string, any>;
}

/**
 * Shows the exact saved JSON payload the extension reads, so a silent key mismatch
 * (e.g. a missing `location` on a role) is a five-second check.
 */
export function DataPreviewPanel({ profile }: DataPreviewPanelProps) {
  const [open, setOpen] = useState(false);

  const payload = {
    professional_experience: profile?.professional_experience || [],
    relevant_projects: profile?.relevant_projects || [],
    education: profile?.education || [],
    skills: profile?.skills || [],
    certifications: printedCertifications(
      profile?.certifications || [],
      profile?.certifications_excluded || [],
    ),
    work_authorized_countries: profile?.work_authorized_countries || [],
    // Full names too: some ATS forms reject a bare ISO code such as "IE".
    work_authorized_country_names: workAuthCountryNames(profile?.work_authorized_countries),
    languages: profile?.languages || [],
    citizenship: profile?.citizenship || '',
  };

  const json = JSON.stringify(payload, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast.success('JSON copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
            aria-expanded={open}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Database className="h-5 w-5" />
            Data preview
          </button>
          {open && (
            <Button variant="outline" size="sm" onClick={copy} className="gap-2">
              <Copy className="h-4 w-4" />
              Copy JSON
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Exact saved data read by the extension. Certifications are capped at the top {CERTIFICATIONS_MAX} in this
            payload; the full list stays stored.
          </p>
          <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
            {json}
          </pre>
        </CardContent>
      )}
    </Card>
  );
}
