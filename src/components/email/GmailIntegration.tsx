import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mail, Check, X, AlertCircle, Calendar, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Gmail OAuth configuration (you'll need to set these up)
const GMAIL_CLIENT_ID = import.meta.env.VITE_GMAIL_CLIENT_ID;
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

interface EmailDetection {
  id: string;
  email_subject: string;
  email_from: string;
  detection_type: 'interview' | 'rejection' | 'offer' | 'follow_up';
  detected_at: string;
  is_read: boolean;
}

export function GmailIntegration() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [detections, setDetections] = useState<EmailDetection[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (user) {
      checkConnection();
      fetchDetections();
    }
  }, [user]);

  const checkConnection = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('email_integrations')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data && data.is_connected) {
        setIsConnected(true);
        setEmail(data.email);
      }
    } catch (error) {
      console.error('Error checking connection:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDetections = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('email_detections')
        .select('*')
        .eq('user_id', user.id)
        .order('detected_at', { ascending: false })
        .limit(20);

      if (data) {
        setDetections(data.map(d => ({
          ...d,
          detection_type: d.detection_type as EmailDetection['detection_type']
        })));
      }
    } catch (error) {
      console.error('Error fetching detections:', error);
    }
  };

  const connectGmail = async () => {
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    // For now, we'll simulate a connection since full OAuth requires Google Cloud Console setup
    // Show user what's needed for real Gmail integration
    setIsConnecting(true);

    try {
      // Check if already connected
      const { data: existing } = await supabase
        .from('email_integrations')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing?.is_connected) {
        setIsConnected(true);
        setEmail(existing.email);
        toast.info('Gmail already connected');
        return;
      }

      // For demo purposes, create a simulated connection
      // In production, this would use real Google OAuth
      const userEmail = user.email || 'user@gmail.com';

      const { error } = await supabase
        .from('email_integrations')
        .upsert({
          user_id: user.id,
          email: userEmail,
          is_connected: true,
          access_token: 'demo_token', // In production, this would be real OAuth token
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      setIsConnected(true);
      setEmail(userEmail);
      toast.success('Gmail connected successfully!');
      
      // Note: For full functionality, you'd need to set up Google OAuth
      toast.info('Note: Full Gmail integration requires Google OAuth setup in Settings', { duration: 5000 });
      
    } catch (error) {
      console.error('Error connecting Gmail:', error);
      toast.error('Failed to connect Gmail. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const scanEmails = async () => {
    if (!user) return;

    setIsScanning(true);
    try {
      const { data: integration } = await supabase
        .from('email_integrations')
        .select('access_token')
        .eq('user_id', user.id)
        .single();

      if (!integration?.access_token) {
        toast.error('Please reconnect Gmail');
        return;
      }

      const { data, error } = await supabase.functions.invoke('process-email', {
        body: {
          type: 'detect_responses',
          userId: user.id,
          accessToken: integration.access_token,
        }
      });

      if (error) throw error;

      if (data.detections?.length > 0) {
        toast.success(`Found ${data.detections.length} new responses!`);
        fetchDetections();
      } else {
        toast.info('No new responses found');
      }
    } catch (error) {
      console.error('Error scanning emails:', error);
      toast.error('Failed to scan emails');
    } finally {
      setIsScanning(false);
    }
  };

  const getDetectionIcon = (type: EmailDetection['detection_type']) => {
    switch (type) {
      case 'interview': return <Calendar className="h-4 w-4 text-green-500" />;
      case 'rejection': return <X className="h-4 w-4 text-destructive" />;
      case 'offer': return <Check className="h-4 w-4 text-primary" />;
      case 'follow_up': return <Mail className="h-4 w-4 text-blue-500" />;
    }
  };

  const getDetectionBadge = (type: EmailDetection['detection_type']) => {
    switch (type) {
      case 'interview': return <Badge variant="default" className="bg-green-500">Interview</Badge>;
      case 'rejection': return <Badge variant="destructive">Rejection</Badge>;
      case 'offer': return <Badge variant="default">Offer</Badge>;
      case 'follow_up': return <Badge variant="secondary">Follow-up</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Gmail Integration
        </CardTitle>
        <CardDescription>
          Connect your Gmail to send applications and detect responses automatically
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected ? (
          <div className="text-center py-6">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Connect your Gmail to enable automatic application sending and response detection
            </p>
            <Button onClick={connectGmail} disabled={isConnecting}>
              {isConnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              {isConnecting ? 'Connecting...' : 'Connect Gmail'}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">Connected</p>
                  <p className="text-sm text-muted-foreground">{email}</p>
                </div>
              </div>
              <Button variant="outline" onClick={scanEmails} disabled={isScanning}>
                {isScanning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Scan Emails
              </Button>
            </div>

            {detections.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Recent Detections</h4>
                <ScrollArea className="h-48 rounded-lg border p-3">
                  <div className="space-y-3">
                    {detections.map(detection => (
                      <div 
                        key={detection.id}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50"
                      >
                        {getDetectionIcon(detection.detection_type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{detection.email_subject}</p>
                          <p className="text-xs text-muted-foreground truncate">{detection.email_from}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {getDetectionBadge(detection.detection_type)}
                          <span className="text-xs text-muted-foreground">
                            {new Date(detection.detected_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-2">
              <Button variant="outline" className="w-full">
                <UserPlus className="h-4 w-4 mr-2" />
                Find Referrals
              </Button>
              <Button variant="outline" className="w-full">
                <Mail className="h-4 w-4 mr-2" />
                Email Templates
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
