import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mail, Check, X, Calendar, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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

  const checkConnection = useCallback(async () => {
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
  }, [user]);

  const fetchDetections = useCallback(async () => {
    if (!user) return;

    try {
      const { data } = await supabase
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
  }, [user]);

  // Handle OAuth callback
  const handleOAuthCallback = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state && user && state === user.id) {
      setIsConnecting(true);
      
      try {
        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);

        const redirectUri = `${window.location.origin}${window.location.pathname}`;

        const { data, error } = await supabase.functions.invoke('gmail-oauth', {
          body: {
            type: 'exchange_code',
            userId: user.id,
            code,
            redirectUri,
          }
        });

        if (error) throw error;

        if (data.success) {
          setIsConnected(true);
          setEmail(data.email);
          toast.success('Gmail connected successfully!');
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        toast.error('Failed to complete Gmail connection');
      } finally {
        setIsConnecting(false);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      checkConnection();
      fetchDetections();
      handleOAuthCallback();
    }
  }, [user, checkConnection, fetchDetections, handleOAuthCallback]);

  const connectGmail = async () => {
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    setIsConnecting(true);

    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;

      const { data, error } = await supabase.functions.invoke('gmail-oauth', {
        body: {
          type: 'get_auth_url',
          userId: user.id,
          redirectUri,
        }
      });

      if (error) throw error;

      if (data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error starting OAuth:', error);
      toast.error('Failed to start Gmail connection. Make sure Google OAuth is configured.');
      setIsConnecting(false);
    }
  };

  const disconnectGmail = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('email_integrations')
        .update({ is_connected: false, access_token: null, refresh_token: null })
        .eq('user_id', user.id);

      if (error) throw error;

      setIsConnected(false);
      setEmail(null);
      toast.success('Gmail disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Failed to disconnect Gmail');
    }
  };

  const scanEmails = async () => {
    if (!user) return;

    setIsScanning(true);
    try {
      // First check if token needs refresh
      const { data: integration } = await supabase
        .from('email_integrations')
        .select('access_token, token_expiry')
        .eq('user_id', user.id)
        .single();

      if (!integration?.access_token) {
        toast.error('Please reconnect Gmail');
        return;
      }

      // Check if token is expired
      let accessToken = integration.access_token;
      if (integration.token_expiry && new Date(integration.token_expiry) < new Date()) {
        // Refresh the token
        const { data: refreshData, error: refreshError } = await supabase.functions.invoke('gmail-oauth', {
          body: { type: 'refresh_token', userId: user.id }
        });

        if (refreshError || !refreshData.access_token) {
          toast.error('Session expired. Please reconnect Gmail.');
          setIsConnected(false);
          return;
        }
        accessToken = refreshData.access_token;
      }

      const { data, error } = await supabase.functions.invoke('process-email', {
        body: {
          type: 'detect_responses',
          userId: user.id,
          accessToken,
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
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={disconnectGmail}>
                  Disconnect
                </Button>
                <Button variant="outline" onClick={scanEmails} disabled={isScanning}>
                  {isScanning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Scan Emails
                </Button>
              </div>
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
