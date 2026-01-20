import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye } from 'lucide-react';

interface RelevantProject {
  id?: string;
  name: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  bullets?: string[];
  skills?: string[];
}

interface RelevantProjectsPreviewProps {
  projects: RelevantProject[];
}

const formatDateRange = (startDate?: string, endDate?: string): string => {
  const normaliseRaw = (raw?: string) => {
    if (!raw) return '';
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
  const startHasPresent = /present/i.test(startRaw);

  const start = extractYear(startRaw);
  const end = endRaw ? extractYear(endRaw) : (startHasPresent ? 'Present' : '');

  if (!start && !end) return '';
  if (!end || start === end) return start;
  return `${start} – ${end}`;
};

export function RelevantProjectsPreview({ projects }: RelevantProjectsPreviewProps) {
  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" />
            Relevant Projects Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No projects to preview. Add projects above to see how they'll appear in your ATS-optimized CV.
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
          Relevant Projects Preview
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          This shows exactly how your projects will render in the final ATS PDF
        </p>
      </CardHeader>
      <CardContent>
        <div 
          className="bg-white text-black p-6 rounded-lg border shadow-inner space-y-5"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          {projects.map((project, index) => {
            const bullets = project.bullets && project.bullets.length > 0 
              ? project.bullets 
              : (typeof project.description === 'string' && project.description.trim())
                ? project.description.split(/\r?\n/).filter(Boolean)
                : [];

            const name = project.name || 'Project Name';
            const role = project.role || 'Role';
            const dateRange = formatDateRange(project.startDate, project.endDate);

            return (
              <div key={project.id || index} className="space-y-1">
                {/* Line 1: Project Name (bold) */}
                <div className="font-bold text-sm" style={{ fontSize: '10.5pt' }}>
                  {name}
                </div>
                
                {/* Line 2: Role (italic) with optional Dates right-aligned */}
                <div className="flex justify-between items-baseline gap-4">
                  <div className="text-sm italic" style={{ fontSize: '10.5pt' }}>
                    {role}
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
                
                {/* Spacing between projects */}
                {index < projects.length - 1 && <div className="h-2" />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
