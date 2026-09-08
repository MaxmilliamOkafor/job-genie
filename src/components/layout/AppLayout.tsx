import { cn } from '@/lib/utils';
import { Link, useLocation } from 'react-router-dom';
import { Send, FileText, MessageCircle, Settings, Menu, X } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { Button } from '@/components/ui/button';
import quantumHireIcon from '@/assets/quantumhire-icon.png';

/**
 * Nesting guard: pages keep their own <AppLayout> wrapper, but when they are
 * rendered inside a top-level view (Apply / Settings tabs) the inner layout
 * renders children only, so there is never duplicate navigation.
 */
const LayoutContext = createContext(false);

const navItems = [
  { path: '/apply', label: 'Apply', icon: Send },
  { path: '/documents', label: 'Documents', icon: FileText },
  { path: '/follow-up', label: 'Follow-up', icon: MessageCircle },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isNested = useContext(LayoutContext);
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isNested) return <>{children}</>;

  const isActivePath = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <LayoutContext.Provider value={true}>
      <div className="min-h-screen bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
            <Link to="/apply" className="flex items-center gap-2 shrink-0">
              <img src={quantumHireIcon} alt="Job Genie" className="h-9 w-9 rounded-lg" />
              <span className="text-lg font-bold sm:text-xl">Job Genie</span>
            </Link>

            <nav aria-label="Main" className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isActivePath(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isActive
                        ? 'bg-nav text-nav-foreground'
                        : 'text-nav/80 hover:bg-nav/10 hover:text-nav'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

          {mobileMenuOpen && (
            <nav aria-label="Main" className="animate-slide-up border-t border-border bg-card p-3 md:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isActivePath(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                      isActive ? 'bg-nav text-nav-foreground' : 'text-nav/80 hover:bg-nav/10'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </LayoutContext.Provider>
  );
}

/** Consistent page heading + optional action row for the four top-level views. */
export function ViewHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
