import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Dashboard from './Dashboard';
import Explore from './Explore';
import Jobs from './Jobs';
import JobQueue from './JobQueue';
import Applications from './Applications';

const TABS = [
  { value: 'overview', label: 'Overview', element: <Dashboard /> },
  { value: 'live', label: 'Live feed', element: <Explore /> },
  { value: 'jobs', label: 'Saved jobs', element: <Jobs /> },
  { value: 'queue', label: 'Queue', element: <JobQueue /> },
  { value: 'applications', label: 'Applications', element: <Applications /> },
];

export default function Apply() {
  const [params, setParams] = useSearchParams();
  const current = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'overview';

  return (
    <AppLayout>
      <Tabs
        value={current}
        onValueChange={(v) => setParams(v === 'overview' ? {} : { tab: v })}
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
