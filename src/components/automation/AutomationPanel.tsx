import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Play, 
  Pause, 
  Eye, 
  EyeOff, 
  Zap, 
  CheckCircle, 
  XCircle, 
  Loader2,
  CloudOff,
  Mail
} from 'lucide-react';
import { Job } from '@/hooks/useJobs';
import { Profile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface AutomationPanelProps {
  jobs: Job[];
  profile: Profile | null;
  onJobApplied: (jobId: string) => void;
}

interface AutomationLog {
  id: string;
  timestamp: Date;
  jobTitle: string;
  company: string;
  status: 'pending' | 'tailoring' | 'applied' | 'failed';
  message: string;
}

export function AutomationPanel({ jobs, profile, onJobApplied }: AutomationPanelProps) {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [backgroundMode, setBackgroundMode] = useState(false);
  const [backgroundCount, setBackgroundCount] = useState(10);
  const [sendReferrals, setSendReferrals] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [currentJobIndex, setCurrentJobIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check if email is connected
  useEffect(() => {
    const checkEmailConnection = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('email_integrations')
        .select('is_connected')
        .eq('user_id', user.id)
        .single();
      setEmailConnected(data?.is_connected || false);
    };
    checkEmailConnection();
  }, [user]);

  // All pending jobs are eligible (no match score filter)
  const eligibleJobs = jobs.filter(job => job.status === 'pending');

  const addLog = useCallback((log: Omit<AutomationLog, 'id' | 'timestamp'>) => {
    setLogs(prev => [{
      ...log,
      id: crypto.randomUUID(),
      timestamp: new Date()
    }, ...prev.slice(0, 49)]);
  }, []);

  const applyToJob = async (job: Job): Promise<boolean> => {
    if (!profile) return false;

    addLog({
      jobTitle: job.title,
      company: job.company,
      status: 'tailoring',
      message: 'AI is tailoring your resume and cover letter...'
    });

    try {
      const { data, error } = await supabase.functions.invoke('tailor-application', {
        body: {
          jobTitle: job.title,
          company: job.company,
          description: job.description || '',
          requirements: job.requirements || [],
          userProfile: {
            firstName: profile.first_name,
            lastName: profile.last_name,
            email: profile.email,
            phone: profile.phone,
            linkedin: profile.linkedin,
            github: profile.github,
            portfolio: profile.portfolio,
            coverLetter: profile.cover_letter,
            workExperience: profile.work_experience,
            education: profile.education,
            skills: profile.skills,
            certifications: profile.certifications,
            achievements: profile.achievements,
            atsStrategy: profile.ats_strategy,
          },
          includeReferral: sendReferrals,
        }
      });

      if (error) throw error;

      // Create application record
      await supabase.from('applications').insert({
        user_id: profile.user_id,
        job_id: job.id,
        tailored_resume: data.tailoredResume,
        tailored_cover_letter: data.tailoredCoverLetter,
        referral_email: data.referralEmail,
        status: 'applied',
        applied_at: new Date().toISOString(),
      });

      // Update job status
      await supabase.from('jobs').update({
        status: 'applied',
        applied_at: new Date().toISOString(),
        match_score: data.matchScore,
      }).eq('id', job.id);

      onJobApplied(job.id);

      addLog({
        jobTitle: job.title,
        company: job.company,
        status: 'applied',
        message: `Application ready! Match score: ${data.matchScore}%`
      });

      return true;
    } catch (error) {
      console.error('Error applying to job:', error);
      addLog({
        jobTitle: job.title,
        company: job.company,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Failed to apply'
      });
      return false;
    }
  };

  const startAutomation = async () => {
    if (!profile) {
      toast.error('Please complete your profile first');
      return;
    }

    if (eligibleJobs.length === 0) {
      toast.error('No eligible jobs to apply to');
      return;
    }

    setIsRunning(true);
    setCurrentJobIndex(0);
    setProgress(0);
    abortControllerRef.current = new AbortController();

    const jobsToProcess = eligibleJobs.slice(0, backgroundMode ? backgroundCount : eligibleJobs.length);

    if (backgroundMode) {
      // Background mode - send to edge function
      toast.info(`Starting background processing of ${jobsToProcess.length} jobs...`);
      
      try {
        const { data, error } = await supabase.functions.invoke('background-apply', {
          body: {
            userId: profile.user_id,
            jobIds: jobsToProcess.map(j => j.id),
            userProfile: {
              firstName: profile.first_name,
              lastName: profile.last_name,
              email: profile.email,
              phone: profile.phone,
              linkedin: profile.linkedin,
              github: profile.github,
              portfolio: profile.portfolio,
              coverLetter: profile.cover_letter,
              workExperience: profile.work_experience,
              education: profile.education,
              skills: profile.skills,
              certifications: profile.certifications,
              achievements: profile.achievements,
              atsStrategy: profile.ats_strategy,
            },
            sendConfirmationEmail: true,
            userEmail: profile.email,
          }
        });

        if (error) throw error;

        toast.success(`Background processing started! You'll receive an email when complete.`);
        addLog({
          jobTitle: 'Background Processing',
          company: '',
          status: 'applied',
          message: `Processing ${jobsToProcess.length} jobs in background. Email confirmation will be sent to ${profile.email}`
        });
      } catch (error) {
        console.error('Background apply error:', error);
        toast.error('Failed to start background processing');
      }

      setIsRunning(false);
      return;
    }

    // Visible mode - process one by one with UI updates
    for (let i = 0; i < jobsToProcess.length; i++) {
      if (abortControllerRef.current?.signal.aborted) break;

      const job = jobsToProcess[i];
      setCurrentJobIndex(i);
      setProgress(((i + 1) / jobsToProcess.length) * 100);

      await applyToJob(job);

      // Small delay between applications
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    setIsRunning(false);
    toast.success('Automation complete!');
  };

  const stopAutomation = () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
    toast.info('Automation stopped');
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            AI Automation Agent
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsVisible(!isVisible)}
          >
            {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {isVisible && (
        <CardContent className="space-y-4">
          {/* Controls */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Email connection / Referral toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="send-referrals">Send Referral Emails</Label>
              </div>
              {emailConnected ? (
                <Switch
                  id="send-referrals"
                  checked={sendReferrals}
                  onCheckedChange={setSendReferrals}
                  disabled={isRunning}
                />
              ) : (
                <Button size="sm" variant="outline" asChild>
                  <a href="/settings">Connect Email</a>
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CloudOff className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="background-mode">Background Mode</Label>
              </div>
              <Switch
                id="background-mode"
                checked={backgroundMode}
                onCheckedChange={setBackgroundMode}
                disabled={isRunning}
              />
            </div>

            {backgroundMode && (
              <div className="space-y-2">
                <Label>Jobs to Process: {backgroundCount}</Label>
                <Slider
                  value={[backgroundCount]}
                  onValueChange={([v]) => setBackgroundCount(v)}
                  min={5}
                  max={100}
                  step={5}
                  disabled={isRunning}
                />
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm font-medium">
                {jobs.length} jobs loaded • {eligibleJobs.length} ready to apply
              </p>
              {isRunning && !backgroundMode && (
                <p className="text-xs text-muted-foreground">
                  Processing job {currentJobIndex + 1} of {eligibleJobs.length}
                </p>
              )}
            </div>
            
            {isRunning ? (
              <Button variant="destructive" onClick={stopAutomation}>
                <Pause className="h-4 w-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button onClick={startAutomation} disabled={eligibleJobs.length === 0}>
                <Play className="h-4 w-4 mr-2" />
                {backgroundMode ? 'Start Background' : 'Start Automation'}
              </Button>
            )}
          </div>

          {isRunning && !backgroundMode && (
            <Progress value={progress} className="h-2" />
          )}

          {/* Live Logs */}
          {logs.length > 0 && (
            <div className="space-y-2">
              <Label>Activity Log</Label>
              <ScrollArea className="h-48 rounded-lg border bg-muted/30 p-3">
                <div className="space-y-2">
                  {logs.map(log => (
                    <div 
                      key={log.id} 
                      className="flex items-start gap-2 text-sm animate-fade-in"
                    >
                      {log.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      {log.status === 'tailoring' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {log.status === 'applied' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {log.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {log.jobTitle} {log.company && `at ${log.company}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.message}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
