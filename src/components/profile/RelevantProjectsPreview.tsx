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
  techStack?: string;
  liveUrl?: string;
  codeUrl?: string;
}

interface RelevantProjectsPreviewProps {
  projects: RelevantProject[];
}

export function RelevantProjectsPreview({ projects }: RelevantProjectsPreviewProps) {
  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" />
            Selected Projects Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No projects to preview. Add projects above to see how they'll appear.
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
          Selected Projects Preview
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Recruiter-facing format with tech stack and links
        </p>
      </CardHeader>
      <CardContent>
        <div
          className="bg-[#0f1115] text-gray-200 p-8 rounded-lg border border-gray-800"
          style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
        >
          <div className="text-xs font-semibold tracking-[0.25em] text-gray-400 uppercase mb-3">
            Selected Projects
          </div>
          <div className="border-t border-gray-700 mb-6" />

          <div className="space-y-6">
            {projects.map((project, index) => {
              const description =
                (project.description && project.description.trim()) ||
                (project.bullets && project.bullets[0]) ||
                '';
              const extraBullets =
                project.description && project.bullets ? project.bullets : (project.bullets || []).slice(1);

              return (
                <div key={project.id || index} className="text-[15px] leading-relaxed">
                  <div>
                    <span className="font-bold text-white">{project.name || 'Project Name'}</span>
                    {project.techStack && (
                      <span className="text-gray-400"> — {project.techStack}</span>
                    )}
                  </div>
                  {description && (
                    <div className="mt-1 text-gray-300">
                      {description}
                      {(project.liveUrl || project.codeUrl) && <span> </span>}
                      {project.liveUrl && (
                        <a
                          href={project.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:underline whitespace-nowrap"
                        >
                          Live demo ↗
                        </a>
                      )}
                      {project.liveUrl && project.codeUrl && (
                        <span className="text-gray-500"> · </span>
                      )}
                      {project.codeUrl && (
                        <a
                          href={project.codeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:underline whitespace-nowrap"
                        >
                          Code ↗
                        </a>
                      )}
                    </div>
                  )}
                  {extraBullets && extraBullets.length > 0 && (
                    <ul className="mt-2 space-y-1 text-gray-300 text-sm list-disc pl-5">
                      {extraBullets.map((b, i) => (
                        <li key={i}>{b.replace(/^[-•▪*]+\s*/, '')}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
