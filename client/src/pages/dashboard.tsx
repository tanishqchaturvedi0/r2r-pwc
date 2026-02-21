import { useAuth } from "@/contexts/AuthContext";
import { useProcessingMonth } from "@/contexts/ProcessingMonthContext";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { DollarSign, Clock, Activity, FileText, CheckCircle, AlertTriangle, TrendingUp, Users, ClipboardList, ChevronLeft, ChevronRight, Calendar, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";

interface DashboardData {
  totalPeriodBased: number;
  totalActivityBased: number;
  totalNonPo: number;
  totalProvision: number;
  pendingApprovals: number;
  overdueItems: number;
  completionRate: number;
  totalUsers: number;
  recentActivity: Array<{ action: string; entity: string; time: string }>;
  provisionByCategory: Array<{ name: string; value: number }>;
  statusDistribution: Array<{ name: string; value: number }>;
  topVendors: Array<{ name: string; amount: number }>;
}

const CHART_COLORS = [
  "hsl(217, 91%, 35%)",
  "hsl(173, 58%, 30%)",
  "hsl(43, 74%, 38%)",
  "hsl(27, 87%, 35%)",
  "hsl(197, 37%, 32%)",
];

function formatCurrency(value: number) {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
}

function StatCard({ title, value, icon: Icon, description, trend }: {
  title: string; value: string | number; icon: any; description?: string; trend?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
        {trend && (
          <div className="mt-2 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-600" />
            <span className="text-xs text-green-600">{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type CalendarStatsData = Record<string, { lineCount: number; totalAmount: number; poCount: number; grnTotal: number }>;

function CalendarView() {
  const { processingMonth, setProcessingMonth } = useProcessingMonth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasScrolledToSelected, setHasScrolledToSelected] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  // Defer this heavy query by 600ms so critical startup queries (permissions, config)
  // complete first and don't get blocked by the CPU-intensive server computation.
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCalendarEnabled(true), 600);
    return () => clearTimeout(t);
  }, []);

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ["/api/dashboard/calendar-stats"],
    queryFn: () => apiGet<CalendarStatsData>("/api/dashboard/calendar-stats"),
    enabled: calendarEnabled,
  });

  const { data: dateRange } = useQuery({
    queryKey: ["/api/data/date-range"],
    queryFn: () => apiGet<{ minYear: number; maxYear: number }>("/api/data/date-range"),
  });

  const allMonths = useMemo(() => {
    const currentYear = new Date().getFullYear();
    // Cap range — bad DB sentinel dates (e.g. 12/31/9999) must never produce thousands of months
    const rawMin = dateRange?.minYear ?? currentYear;
    const rawMax = dateRange?.maxYear ?? currentYear;
    const minYear = Math.max(rawMin, currentYear - 10) - 1;
    const maxYear = Math.min(rawMax, currentYear + 3) + 1;
    const months: string[] = [];
    for (let year = minYear; year <= maxYear; year++) {
      for (let m = 0; m < 12; m++) {
        months.push(`${MONTH_NAMES[m]} ${year}`);
      }
    }
    return months;
  }, [dateRange]);

  const displayMonths = useMemo(() => {
    if (!hideEmpty || !calendarData) return allMonths;
    return allMonths.filter(m => {
      if (m === processingMonth) return true;
      const stats = calendarData[m];
      return stats && stats.lineCount > 0;
    });
  }, [allMonths, hideEmpty, calendarData, processingMonth]);

  const selectedIndex = useMemo(() => {
    const idx = displayMonths.indexOf(processingMonth);
    return idx >= 0 ? idx : 0;
  }, [displayMonths, processingMonth]);

  const maxLineCount = useMemo(() => {
    if (!calendarData) return 0;
    return Math.max(1, ...Object.values(calendarData).map((v) => v.lineCount));
  }, [calendarData]);

  const scrollToIndex = useCallback((idx: number, smooth = true) => {
    const container = scrollRef.current;
    if (!container) return;
    const items = container.querySelectorAll("[data-month-item]");
    if (!items[idx]) return;
    const item = items[idx] as HTMLElement;
    const containerWidth = container.clientWidth;
    const itemLeft = item.offsetLeft;
    const itemWidth = item.offsetWidth;
    const scrollTarget = itemLeft - containerWidth / 2 + itemWidth / 2;
    container.scrollTo({ left: scrollTarget, behavior: smooth ? "smooth" : "instant" });
  }, []);

  useEffect(() => {
    if (!hasScrolledToSelected && calendarData) {
      const timer = setTimeout(() => {
        scrollToIndex(selectedIndex, false);
        setHasScrolledToSelected(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [calendarData, hasScrolledToSelected, selectedIndex, scrollToIndex]);

  useEffect(() => {
    if (calendarData && hasScrolledToSelected) {
      const timer = setTimeout(() => scrollToIndex(selectedIndex, true), 50);
      return () => clearTimeout(timer);
    }
  }, [hideEmpty]);

  const handleMonthClick = (monthStr: string) => {
    setProcessingMonth(monthStr);
    const idx = displayMonths.indexOf(monthStr);
    if (idx >= 0) scrollToIndex(idx);
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/period-based"] });
    queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
  };

  const handleNav = (dir: -1 | 1) => {
    const newIdx = Math.max(0, Math.min(displayMonths.length - 1, selectedIndex + dir));
    handleMonthClick(displayMonths[newIdx]);
  };

  const getBarWidth = (lineCount: number) => {
    if (lineCount === 0 || maxLineCount === 0) return 0;
    return Math.max(8, (lineCount / maxLineCount) * 100);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-[80px] w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid="calendar-card"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-1 pt-3 px-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Processing Month</h3>
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-md text-[10px] text-muted-foreground hover-elevate transition-colors"
            data-testid="toggle-hide-empty-months"
          >
            {hideEmpty ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            <span>{hideEmpty ? "Data only" : "All months"}</span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleNav(-1)}
            disabled={selectedIndex === 0}
            data-testid="calendar-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[5rem] text-center" data-testid="calendar-selected-label">
            {processingMonth}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleNav(1)}
            disabled={selectedIndex === displayMonths.length - 1}
            data-testid="calendar-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-3">
        <div className="relative">
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 z-10"
            style={{ background: "linear-gradient(to right, hsl(var(--card)), transparent)" }}
          />
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 z-10"
            style={{ background: "linear-gradient(to left, hsl(var(--card)), transparent)" }}
          />
          <div
            ref={scrollRef}
            className="flex gap-2 px-6 overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            data-testid="calendar-scroll-container"
          >
            {displayMonths.map((monthStr, idx) => {
              const stats = calendarData?.[monthStr];
              const isSelected = processingMonth === monthStr;
              const distance = Math.abs(idx - selectedIndex);
              const parts = monthStr.split(" ");
              const monthLabel = parts[0];
              const yearLabel = parts[1];
              const lineCount = stats?.lineCount || 0;
              const hasData = !!stats && stats.lineCount > 0;

              let opacity = 1;
              if (!isHovered) {
                if (distance >= 5) opacity = 0.2;
                else if (distance >= 4) opacity = 0.35;
                else if (distance >= 3) opacity = 0.5;
                else if (distance >= 2) opacity = 0.7;
                else if (distance >= 1) opacity = 0.85;
              } else {
                if (distance >= 8) opacity = 0.4;
                else if (distance >= 6) opacity = 0.55;
                else if (distance >= 4) opacity = 0.7;
                else if (distance >= 2) opacity = 0.85;
              }

              return (
                <button
                  key={monthStr}
                  data-month-item
                  onClick={() => handleMonthClick(monthStr)}
                  data-testid={`calendar-month-${monthStr}`}
                  className={`
                    shrink-0 rounded-md text-center cursor-pointer select-none
                    transition-all duration-300 ease-out
                    ${isSelected
                      ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-card"
                      : hasData ? "bg-primary/5 hover-elevate" : "hover-elevate"
                    }
                    ${isHovered ? "w-[96px] py-2.5 px-2" : "w-[80px] py-2 px-1.5"}
                  `}
                  style={{
                    opacity,
                    transform: isSelected ? "scale(1.05)" : "scale(1)",
                  }}
                >
                  <p className={`text-xs font-bold`}>
                    {monthLabel}
                  </p>
                  <p className={`text-[9px] ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {yearLabel}
                  </p>

                  {hasData ? (
                    <div className="mt-1.5 space-y-0.5">
                      <div className="mx-auto rounded-full overflow-hidden h-1" style={{ width: "80%", backgroundColor: isSelected ? "rgba(255,255,255,0.2)" : "hsl(var(--muted))" }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${getBarWidth(lineCount)}%`,
                            backgroundColor: isSelected ? "rgba(255,255,255,0.8)" : "hsl(var(--primary))",
                          }}
                        />
                      </div>
                      <p className={`text-[10px] font-semibold ${isSelected ? "text-primary-foreground" : ""}`}>
                        {formatCurrency(stats!.totalAmount)}
                      </p>
                      <p className={`text-[9px] ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {stats!.lineCount} lines · {stats!.poCount} POs
                      </p>
                    </div>
                  ) : (
                    <p className={`mt-1.5 text-[9px] ${isSelected ? "text-primary-foreground/50" : "text-muted-foreground/50"}`}>
                      --
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FinanceDashboard() {
  const { processingMonth } = useProcessingMonth();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/dashboard", processingMonth],
    queryFn: () => apiGet<DashboardData>(`/api/dashboard?processingMonth=${encodeURIComponent(processingMonth)}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const d = data || {} as DashboardData;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Provision" value={`${formatCurrency(d.totalProvision || 0)}`} icon={DollarSign} description="Current month accruals" />
        <StatCard title="Period-Based POs" value={d.totalPeriodBased || 0} icon={Clock} description="Active period accruals" />
        <StatCard title="Activity-Based POs" value={d.totalActivityBased || 0} icon={Activity} description="Pending assignments" />
        <StatCard title="Non-PO Items" value={d.totalNonPo || 0} icon={FileText} description="Active submissions" />
        <StatCard title="Pending Approvals" value={d.pendingApprovals || 0} icon={CheckCircle} description="Awaiting review" />
        <StatCard title="Overdue Items" value={d.overdueItems || 0} icon={AlertTriangle} description="Requires attention" />
        <StatCard title="Completion Rate" value={`${d.completionRate || 0}%`} icon={TrendingUp} description="Response completion" />
        <StatCard title="Active Users" value={d.totalUsers || 0} icon={Users} description="System users" />
      </div>

      <CalendarView />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <h3 className="text-sm font-semibold">Provision by Category</h3>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={d.provisionByCategory || []}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={90}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={4}
                    strokeWidth={0}
                  >
                    {(d.provisionByCategory || []).map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {(d.provisionByCategory || []).map((item, idx) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <h3 className="text-sm font-semibold">Top Vendors by Provision</h3>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(d.topVendors || []).slice(0, 6)} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="amount" fill="hsl(217, 91%, 35%)" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <h3 className="text-sm font-semibold">Status Distribution</h3>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(d.statusDistribution || []).map((item, idx) => (
              <div key={item.name} className="flex items-center gap-3 p-3 rounded-md bg-muted/40">
                <div className="h-8 w-8 rounded-md flex items-center justify-center" style={{ backgroundColor: `${CHART_COLORS[idx % CHART_COLORS.length]}20` }}>
                  <span className="text-sm font-bold" style={{ color: CHART_COLORS[idx % CHART_COLORS.length] }}>{item.value}</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{item.name}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BusinessDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/dashboard/business"],
    queryFn: () => apiGet<any>("/api/dashboard/business"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const d = data || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="My Pending Tasks" value={d.pendingTasks || 0} icon={ClipboardList} description="Activity-based assignments" />
        <StatCard title="My Pending Forms" value={d.pendingForms || 0} icon={FileText} description="Non-PO form submissions" />
        <StatCard title="Overdue Items" value={d.overdueItems || 0} icon={AlertTriangle} description="Requires immediate attention" />
      </div>

      {(d.recentTasks || []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Recent Tasks</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(d.recentTasks || []).map((task: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{task.poNumber} - {task.vendorName}</p>
                    <p className="text-xs text-muted-foreground truncate">{task.itemDescription}</p>
                  </div>
                  <Badge variant={task.status === "Overdue" ? "destructive" : "secondary"}>
                    {task.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { isFinance, isBusinessUser } = useAuth();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your accruals management</p>
      </div>
      {isFinance ? <FinanceDashboard /> : <BusinessDashboard />}
    </div>
  );
}
