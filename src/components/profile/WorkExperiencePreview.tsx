import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye } from 'lucide-react';
import { extractDatesFromTitle, formatDateRange } from '@/lib/workExperienceNormalization';

interface WorkExperience {
  id?: string;
  company?: string;
  title?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets?: string[];
  description?: string;
}

interface WorkExperiencePreviewProps {
  workExperience: WorkExperience[];
}

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
            const rawTitle = exp.title || 'Job Title';
            
            // Extract dates from merged title field (e.g., "Senior Engineer - 2023 - Present")
            const extracted = extractDatesFromTitle(rawTitle);
            const title = extracted.cleanTitle || rawTitle;
            const dateRange = formatDateRange(
              exp.startDate || extracted.startDate, 
              exp.endDate || extracted.endDate,
              rawTitle
            );

            return (
              <div key={exp.id || index} className="space-y-1">
                {/* Line 1: Company (bold) */}
                <div className="font-bold text-sm" style={{ fontSize: '10.5pt' }}>
                  {company}
                </div>
                
                {/* Line 1b: Location */}
                {exp.location && (
                  <div className="text-sm text-gray-600" style={{ fontSize: '10pt' }}>
                    {exp.location}
                  </div>
                )}
                
                {/* Line 2: Job Title with Dates right-aligned (MM-YYYY format) */}
                <div className="flex justify-between text-sm" style={{ fontSize: '10.5pt' }}>
                  <span>{title}</span>
                  {dateRange && <span className="text-gray-600">{dateRange}</span>}
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
          Format: <span className="font-semibold">Company</span> (bold, Line 1) + Title with dates (Line 2)
        </p>
      </CardContent>
    </Card>
  );
}
