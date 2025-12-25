import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { atsPlatforms } from '@/data/mockJobs';
import { Settings as SettingsIcon, Zap, Clock, Building2, Mail, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const Settings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(true);
  const [minMatchScore, setMinMatchScore] = useState([80]);
  const [applyWithinMinutes, setApplyWithinMinutes] = useState([2]);
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  const handleSendTestEmail = async () => {
    if (!testEmail || !user) {
      toast({
        title: "Email required",
        description: "Please enter an email address to send the test to.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email-resend', {
        body: {
          type: 'test',
          userId: user.id,
          recipient: testEmail,
          subject: 'Test Email from Job Application Assistant',
          body: `
            <h1>Test Email Successful!</h1>
            <p>If you're reading this, your Resend email integration is working correctly.</p>
            <p>You can now send application emails, referral requests, and follow-ups.</p>
            <p><em>Sent at: ${new Date().toLocaleString()}</em></p>
          `,
        },
      });

      if (error) throw error;

      toast({
        title: "Test email sent!",
        description: `Check ${testEmail} for the test message.`,
      });
    } catch (error: any) {
      console.error('Error sending test email:', error);
      toast({
        title: "Failed to send test email",
        description: error.message || "Please check your Resend configuration.",
        variant: "destructive",
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your auto-apply preferences</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Test your email setup by sending a test message. Make sure you've added the RESEND_API_KEY secret.
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter your email address"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleSendTestEmail} disabled={isSendingTest}>
                {isSendingTest ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Test Email
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Auto-Apply Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Enable Auto-Apply</Label>
                <p className="text-sm text-muted-foreground">Automatically apply to matching jobs</p>
              </div>
              <Switch checked={autoApplyEnabled} onCheckedChange={setAutoApplyEnabled} />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Minimum Match Score</Label>
                <span className="text-sm font-medium">{minMatchScore}%</span>
              </div>
              <Slider value={minMatchScore} onValueChange={setMinMatchScore} max={100} min={50} step={5} />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Apply Within
                </Label>
                <span className="text-sm font-medium">{applyWithinMinutes} minutes</span>
              </div>
              <Slider value={applyWithinMinutes} onValueChange={setApplyWithinMinutes} max={60} min={1} step={1} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Supported ATS Platforms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {atsPlatforms.map((platform) => (
                <Badge key={platform} variant="secondary">{platform}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-success/30 bg-success/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center">
                <Zap className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-semibold">Unlimited Applications</p>
                <p className="text-sm text-muted-foreground">No daily limits - apply to as many jobs as you want</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Settings;
