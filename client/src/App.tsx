import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PermissionsProvider, usePermissions } from "@/contexts/PermissionsContext";
import { ProcessingMonthProvider } from "@/contexts/ProcessingMonthContext";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import PeriodBasedPage from "@/pages/period-based";
import ActivityBasedPage from "@/pages/activity-based";
import MyTasksPage from "@/pages/my-tasks";
import NonPoPage from "@/pages/non-po";
import MyFormsPage from "@/pages/my-forms";
import UsersPage from "@/pages/users";
import ReportsPage from "@/pages/reports";
import ConfigurationPage from "@/pages/configuration";
import ApprovalTrackerPage from "@/pages/approval-tracker";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component, feature, requireFinance, requireBusiness }: { component: React.ComponentType; feature?: string; requireFinance?: boolean; requireBusiness?: boolean }) {
  const { user, isFinance, isBusinessUser } = useAuth();
  const { canView, isLoading } = usePermissions();
  if (!user) return <Redirect to="/" />;
  if (isLoading) return null;
  if (requireFinance && !isFinance) return <Redirect to="/dashboard" />;
  if (requireBusiness && !isBusinessUser) return <Redirect to="/dashboard" />;
  if (feature && !canView(feature)) return <Redirect to="/dashboard" />;
  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route path="/period-based">
        <ProtectedRoute component={PeriodBasedPage} feature="period_based" requireFinance />
      </Route>
      <Route path="/approval-tracker">
        <ProtectedRoute component={ApprovalTrackerPage} feature="period_based" requireFinance />
      </Route>
      <Route path="/activity-based">
        <ProtectedRoute component={ActivityBasedPage} feature="activity_based" requireFinance />
      </Route>
      <Route path="/my-tasks">
        <ProtectedRoute component={MyTasksPage} feature="activity_based" requireBusiness />
      </Route>
      <Route path="/non-po">
        <ProtectedRoute component={NonPoPage} feature="non_po" requireFinance />
      </Route>
      <Route path="/my-forms">
        <ProtectedRoute component={MyFormsPage} feature="non_po" requireBusiness />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={UsersPage} feature="users" requireFinance />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={ReportsPage} feature="reports" requireFinance />
      </Route>
      <Route path="/configuration">
        <ProtectedRoute component={ConfigurationPage} feature="config" requireFinance />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <PermissionsProvider>
              <ProcessingMonthProvider>
                <Toaster />
                <AppRoutes />
              </ProcessingMonthProvider>
            </PermissionsProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
