import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useGlobalErrorHandler } from "./hooks/useGlobalErrorHandler";
import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import Explore from "./pages/Explore";
import Applications from "./pages/Applications";
import JobQueue from "./pages/JobQueue";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import LandingPage from "./pages/LandingPage";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
    mutations: {
      retry: 1,
      onError: (error) => {
        console.error('[QueryClient] Mutation error:', error);
      },
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

// Component that initializes global error handling
function GlobalErrorHandlerInit() {
  useGlobalErrorHandler();
  return null;
}

const AppRoutes = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/apply" replace /> : <Auth />} />
      <Route path="/" element={user ? <Navigate to="/apply" replace /> : <LandingPage />} />

      {/* Four top-level views */}
      <Route path="/apply" element={<ProtectedRoute><Apply /></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
      <Route path="/follow-up" element={<ProtectedRoute><FollowUp /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsHub /></ProtectedRoute>} />

      {/* Legacy links keep working */}
      <Route path="/dashboard" element={<Navigate to="/apply" replace />} />
      <Route path="/jobs" element={<Navigate to="/apply?tab=jobs" replace />} />
      <Route path="/explore" element={<Navigate to="/apply?tab=live" replace />} />
      <Route path="/applications" element={<Navigate to="/apply?tab=applications" replace />} />
      <Route path="/queue" element={<Navigate to="/apply?tab=queue" replace />} />
      <Route path="/profile" element={<Navigate to="/settings" replace />} />
      <Route path="/screening-answers" element={<Navigate to="/settings?tab=answers" replace />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <GlobalErrorHandlerInit />
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;