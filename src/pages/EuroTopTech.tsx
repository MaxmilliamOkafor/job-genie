import { useJobPreferences } from '@/hooks/useJobPreferences';
import { EuroTopTechFeed } from '@/components/jobs/EuroTopTechFeed';

/** Its own tab: the whole Euro Top Tech board, or only what fits your saved preferences. */
export default function EuroTopTech() {
  const { preferences, isLoading } = useJobPreferences();
  return (
    <div className="container px-4 py-6 text-base">
      <div className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl">Euro Top Tech</h1>
        <p className="mt-1.5 text-base text-muted-foreground">
          Every job on your Euro Top Tech member board, newest first, 24 to a page. Only you see these.
        </p>
      </div>
      {!isLoading && <EuroTopTechFeed preferences={preferences} />}
    </div>
  );
}
