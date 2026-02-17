import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useProcessingMonth } from "@/contexts/ProcessingMonthContext";
import { useTheme } from "@/components/layout/ThemeProvider";
import { useLocation, Link } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from "@/components/ui/collapsible";
import {
  LayoutDashboard, Clock, Activity, FileText, Users, BarChart3,
  Settings, Sun, Moon, Bell, LogOut, User, ClipboardList, FileInput, ChevronDown, ChevronRight, Calendar, CheckSquare, Layers
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiGet } from "@/lib/api";
import type { ReactNode } from "react";

function NotificationBell() {
  const { data: notifs } = useQuery({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: () => apiGet<{ count: number }>("/api/notifications/unread-count"),
    refetchInterval: 30000,
  });
  const count = notifs?.count || 0;

  return (
    <div className="relative">
      <Button size="icon" variant="ghost" data-testid="button-notifications">
        <Bell className="h-4 w-4" />
      </Button>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-medium">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </div>
  );
}

function AppSidebar() {
  const { user, isBusinessUser, isFinance } = useAuth();
  const { canView } = usePermissions();
  const [location] = useLocation();

  const accrualPaths = ["/period-based", "/activity-based", "/non-po"];
  const isAccrualActive = accrualPaths.some(p => location.startsWith(p));
  const [accrualsOpen, setAccrualsOpen] = useState(isAccrualActive);

  const accrualSubItems = isFinance ? [
    { title: "Period-Based", url: "/period-based", icon: Clock, feature: "period_based" },
    { title: "Activity-Based", url: "/activity-based", icon: Activity, feature: "activity_based" },
    { title: "Non-PO", url: "/non-po", icon: FileText, feature: "non_po" },
  ].filter(item => canView(item.feature)) : [];

  const businessTaskItems = isBusinessUser ? [
    { title: "My Tasks", url: "/my-tasks", icon: ClipboardList, feature: "activity_based" },
    { title: "My Forms", url: "/my-forms", icon: FileInput, feature: "non_po" },
  ].filter(item => canView(item.feature)) : [];

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">Accruals Pro</span>
            <span className="text-[11px] text-muted-foreground">Financial Management</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/dashboard"}>
                  <Link href="/dashboard" data-testid="nav-dashboard">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {accrualSubItems.length > 0 && (
                <Collapsible open={accrualsOpen} onOpenChange={setAccrualsOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton isActive={isAccrualActive} data-testid="nav-accruals">
                        <Layers className="h-4 w-4" />
                        <span>Accruals</span>
                        <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-transform ${accrualsOpen ? "rotate-90" : ""}`} />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {accrualSubItems.map(item => (
                          <SidebarMenuSubItem key={item.url}>
                            <SidebarMenuSubButton asChild isActive={location === item.url}>
                              <Link href={item.url} data-testid={`nav-${item.url.slice(1)}`}>
                                <item.icon className="h-3.5 w-3.5" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {businessTaskItems.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`nav-${item.url.slice(1)}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {isFinance && canView("period_based") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/approval-tracker"}>
                    <Link href="/approval-tracker" data-testid="nav-approval-tracker">
                      <CheckSquare className="h-4 w-4" />
                      <span>Approval Tracker</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isFinance && canView("reports") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/reports"}>
                    <Link href="/reports" data-testid="nav-reports">
                      <BarChart3 className="h-4 w-4" />
                      <span>Reports</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isFinance && canView("users") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/users"}>
                    <Link href="/users" data-testid="nav-users">
                      <Users className="h-4 w-4" />
                      <span>User Management</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isFinance && canView("config") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/configuration"}>
                    <Link href="/configuration" data-testid="nav-configuration">
                      <Settings className="h-4 w-4" />
                      <span>Configuration</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-xs font-medium truncate">{user?.name}</span>
            <span className="text-[10px] text-muted-foreground truncate">{user?.roles.join(", ")}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function ProcessingMonthSelector() {
  const { processingMonth, setProcessingMonth, availableMonths } = useProcessingMonth();

  const handleChange = (value: string) => {
    setProcessingMonth(value);
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/period-based"] });
    queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Calendar className="h-4 w-4 text-muted-foreground hidden sm:block" />
      <Select value={processingMonth} onValueChange={handleChange}>
        <SelectTrigger className="w-[130px]" data-testid="select-processing-month">
          <SelectValue placeholder="Select month" />
        </SelectTrigger>
        <SelectContent>
          {availableMonths.map(m => (
            <SelectItem key={m} value={m} data-testid={`option-month-${m.replace(" ", "-")}`}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <ProcessingMonthSelector />
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm hidden sm:inline">{user?.name}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-testid="menu-profile">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
