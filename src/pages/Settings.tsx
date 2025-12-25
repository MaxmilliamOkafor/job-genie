import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { atsPlatforms } from '@/data/mockJobs';
import { Settings as SettingsIcon, Zap, Clock, Building2 } from 'lucide-react';
import { useState } from 'react';

const Settings = () => {
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(true);
  const [minMatchScore, setMinMatchScore] = useState([80]);
  const [applyWithinMinutes, setApplyWithinMinutes] = useState([2]);

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
