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
const formatDateRange = (startDate?: string, endDate?: string): string => {
  const extractYear = (date?: string) => {
    if (!date) return '';
    if (date.toLowerCase() === 'present') return 'Present';
    // Handle formats like "2024-01", "January 2024", "2024"
    const yearMatch = date.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? yearMatch[0] : date;
  };

  const start = extractYear(startDate);
  const end = extractYear(endDate);

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

            return (
              <div key={exp.id || index} className="space-y-1">
                {/* Line 1: Company Name (Bold) */}
                <div className="font-bold text-sm" style={{ fontSize: '10.5pt' }}>
                  {exp.company || 'Company Name'}
                </div>
                
                {/* Line 2: Job Title (Italic) + Dates */}
                <div 
                  className="flex justify-between items-baseline text-sm"
                  style={{ fontSize: '10.5pt' }}
                >
                  <span className="italic">
                    {exp.title || 'Job Title'}
                  </span>
                  <span className="text-gray-600 text-xs">
                    {formatDateRange(exp.startDate, exp.endDate)}
                  </span>
                </div>
                
                {/* Bullets */}
                {bullets.length > 0 && (
                  <ul className="list-disc list-inside text-xs mt-2 space-y-0.5 text-gray-800" style={{ fontSize: '10pt' }}>
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
          Format: <span className="font-semibold">Company Name</span> (bold) → <span className="italic">Job Title</span> (italic) + year-only dates
        </p>
      </CardContent>
    </Card>
  );
}
