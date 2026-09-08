import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Profile from './Profile';
import Settings from './Settings';
import { ScreeningAnswersEditor } from '@/components/profile/ScreeningAnswersEditor';

const TABS = [
  { value: 'profile', label: 'Profile', element: <Profile /> },
  { value: 'answers', label: 'Screening answers', element: <ScreeningAnswersEditor /> },
  { value: 'preferences', label: 'Preferences', element: <Settings /> },
];

export default function SettingsHub() {
  const [params, setParams] = useSearchParams();
  const current = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'profile';

  return (
    <AppLayout>
      <Tabs
        value={current}
        onValueChange={(v) => setParams(v === 'profile' ? {} : { tab: v })}
        className="space-y-6"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-card p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="px-4 text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-0 focus-visible:outline-none">
            {t.element}
          </TabsContent>
        ))}
      </Tabs>
    </AppLayout>
  );
}
