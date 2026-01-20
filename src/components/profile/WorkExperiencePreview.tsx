import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye } from 'lucide-react';

interface WorkExperience {
  id?: string;
  company?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  bullets?: string[];
  description?: string;
}

interface WorkExperiencePreviewProps {
  workExperience: WorkExperience[];
}

// Format dates to year-only (e.g., "2024" or "2020 – Present")
// Also handles messy inputs like "2023 Present | 2023 - Present".
const formatDateRange = (startDate?: string, endDate?: string): string => {
  const normaliseRaw = (raw?: string) => {
    if (!raw) return '';
    // If multiple segments are present (e.g. "foo | 2023 - Present"), take the last.
    const seg = raw.split('|').map(s => s.trim()).filter(Boolean).pop() ?? '';
    return seg;
  };

  const extractYear = (raw?: string) => {
    const date = normaliseRaw(raw);
    if (!date) return '';
    if (/present/i.test(date)) return 'Present';
    const yearMatch = date.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? yearMatch[0] : date;
  };

  const startRaw = normaliseRaw(startDate);
  const endRaw = normaliseRaw(endDate);

  // If start contains "Present" but end is empty, treat it as ongoing.
  const startHasPresent = /present/i.test(startRaw);

  const start = extractYear(startRaw);
  const end = endRaw ? extractYear(endRaw) : (startHasPresent ? 'Present' : '');

  if (!start && !end) return '';
  if (!end || start === end) return start;
  return `${start} – ${end}`;
};

export function WorkExperiencePreview({ workExperience }: WorkExperiencePreviewProps) {
  if (!workExperience || workExperience.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" />
            ATS PDF Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No work experience to preview. Add roles above to see how they'll appear in your ATS-optimized CV.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" />
          ATS PDF Preview
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          This shows exactly how your work experience will render in the final ATS PDF
        </p>
      </CardHeader>
      <CardContent>
        {/* ATS-style preview container */}
        <div 
          className="bg-white text-black p-6 rounded-lg border shadow-inner space-y-5"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          {workExperience.map((exp, index) => {
            const bullets = exp.bullets && exp.bullets.length > 0 
              ? exp.bullets 
              : (typeof exp.description === 'string' && exp.description.trim())
                ? exp.description.split(/\r?\n/).filter(Boolean)
                : [];

            const company = exp.company || 'Company';
            const title = exp.title || 'Job Title';
            const dateRange = formatDateRange(exp.startDate, exp.endDate);

            return (
              <div key={exp.id || index} className="space-y-1">
                {/* Line 1: Company (bold) */}
                <div className="font-bold text-sm" style={{ fontSize: '10.5pt' }}>
                  {company}
                </div>
                
                {/* Line 2: Job Title (italic) with Dates right-aligned */}
                <div className="flex justify-between items-baseline gap-4">
                  <div className="text-sm italic" style={{ fontSize: '10.5pt' }}>
                    {title}
                  </div>
                  {dateRange && (
                    <div className="text-gray-600 text-xs whitespace-nowrap" style={{ fontSize: '10pt' }}>
                      {dateRange}
                    </div>
                  )}
                </div>
                
                {/* Bullets with proper ATS bullet points */}
                {bullets.length > 0 && (
                  <ul className="list-disc list-inside text-xs mt-2 space-y-0.5 text-gray-800" style={{ fontSize: '10pt', marginLeft: '16px' }}>
                    {bullets.slice(0, 4).map((bullet, bIndex) => (
                      <li key={bIndex} className="leading-snug">
                        {bullet.replace(/^[-•▪*]+\s*/, '')}
                      </li>
                    ))}
                    {bullets.length > 4 && (
                      <li className="text-gray-500 italic">
                        +{bullets.length - 4} more bullets...
                      </li>
                    )}
                  </ul>
                )}
                
                {/* Spacing indicator */}
                {index < workExperience.length - 1 && (
                  <div className="h-3" aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>
        
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Format: <span className="font-semibold">Company</span> (bold, Line 1) + <span className="italic">Title</span> (italic, left) + <span>Dates</span> (right, Line 2)
        </p>
      </CardContent>
    </Card>
  );
}
