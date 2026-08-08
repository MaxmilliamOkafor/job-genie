import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import {
  Zap,
  FileText,
  Target,
  Shield,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Briefcase,
  BarChart3,
  Lock,
} from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: 'CV & Cover Letter Tailoring',
    description:
      'Upload your CV once. Our agent rewrites it for every role using the job description, your history, and ATS-safe formatting.',
  },
  {
    icon: Target,
    title: 'Keyword Matching Without Fabrication',
    description:
      'We weave relevant terms into your experience only where they truthfully fit. No invented employers, no fake metrics.',
  },
  {
    icon: Shield,
    title: 'Privacy-First Data Isolation',
    description:
      'Your profile, documents, and job history are isolated to your account. We never share or train on your data.',
  },
  {
    icon: BarChart3,
    title: 'Application Tracking',
    description:
      'Monitor every application, interview stage, and follow-up in one clean dashboard.',
  },
];

const steps = [
  { title: 'Paste a job URL', description: 'Drop in any job posting from supported boards.' },
  { title: 'Review the tailor', description: 'The agent extracts requirements and matches them to your profile.' },
  { title: 'Download & apply', description: 'Get a DOCX CV and cover letter ready to submit.' },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">AutoApply AI</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              How it works
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <Button asChild>
                <Link to="/">Open Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <Link to="/auth">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link to="/auth">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/50">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.12),_transparent_50%)]" />
          <div className="container relative px-4 py-24 md:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                <span>Now generating DOCX CVs & cover letters</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                Land more interviews with{' '}
                <span className="gradient-text">AI-tailored applications</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground md:text-xl">
                AutoApply AI reads the job description, matches your experience, and produces a
                recruiter-ready CV and cover letter — without inventing a single fact.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                {user ? (
                  <Button size="lg" asChild>
                    <Link to="/">
                      Open Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button size="lg" asChild>
                      <Link to="/auth">
                        Start Applying Smarter <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                      <Link to="/auth">Sign In</Link>
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> ATS-optimised output
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Anti-fabrication guardrails
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> One profile, every job
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20 md:py-28">
          <div className="container px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Everything you need to apply at scale
              </h2>
              <p className="mt-4 text-muted-foreground">
                Built for senior candidates who want premium documents and a system that keeps their story honest.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="group rounded-2xl border border-border/50 bg-card p-6 transition-colors hover:border-primary/30"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y border-border/50 bg-muted/30 py-20 md:py-28">
          <div className="container px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
              <p className="mt-4 text-muted-foreground">
                From job posting to submitted application in three steps.
              </p>
            </div>
            <div className="mt-14 grid gap-8 md:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step.title} className="relative text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                    {index + 1}
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28">
          <div className="container px-4">
            <div className="mx-auto max-w-3xl rounded-3xl border border-border/50 bg-card p-8 text-center md:p-12">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Briefcase className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to stop rewriting your CV by hand?
              </h2>
              <p className="mt-4 text-muted-foreground">
                Create your profile, add a job posting, and download your first tailored application in minutes.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                {user ? (
                  <Button size="lg" asChild>
                    <Link to="/">Open Dashboard</Link>
                  </Button>
                ) : (
                  <>
                    <Button size="lg" asChild>
                      <Link to="/auth">Get Started Free</Link>
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                      <Link to="/auth">Sign In</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 px-4 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">AutoApply AI</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} AutoApply AI. All rights reserved.
          </p>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            <span>Secure, isolated accounts</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
