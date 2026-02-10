import { useAuth } from "@/contexts/AuthContext";
import { useProcessingMonth } from "@/contexts/ProcessingMonthContext";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { DollarSign, Clock, Activity, FileText, CheckCircle, AlertTriangle, TrendingUp, Users, ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";

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

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ["/api/dashboard/calendar-stats"],
    queryFn: () => apiGet<CalendarStatsData>("/api/dashboard/calendar-stats"),
  });

  const years = useMemo(() => {
    if (!calendarData) return [];
    const yearSet = new Set<number>();
    Object.keys(calendarData).forEach((key) => {
      const parts = key.split(" ");
      const y = parseInt(parts[1]);
      if (!isNaN(y)) yearSet.add(y);
    });
    return Array.from(yearSet).sort((a, b) => a - b);
  }, [calendarData]);

  const currentParts = processingMonth.split(" ");
  const currentYear = parseInt(currentParts[1]) || 2026;

  const [selectedYear, setSelectedYear] = useState(currentYear);

  const maxLineCount = useMemo(() => {
    if (!calendarData) return 0;
    return Math.max(1, ...Object.values(calendarData).map((v) => v.lineCount));
  }, [calendarData]);

  const handleMonthClick = (monthStr: string) => {
    setProcessingMonth(monthStr);
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/period-based"] });
    queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
  };

  const getIntensityClass = (lineCount: number) => {
    if (lineCount === 0) return "bg-muted/30";
    const ratio = lineCount / maxLineCount;
    if (ratio > 0.75) return "bg-primary/20";
    if (ratio > 0.5) return "bg-primary/15";
    if (ratio > 0.25) return "bg-primary/10";
    return "bg-primary/5";
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const effectiveYears = years.length > 0 ? years : [currentYear];
  const canGoPrev = effectiveYears.indexOf(selectedYear) > 0;
  const canGoNext = effectiveYears.indexOf(selectedYear) < effectiveYears.length - 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <h3 className="text-sm font-semibold">Processing Month Calendar</h3>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={!canGoPrev}
            onClick={() => setSelectedYear((y) => y - 1)}
            data-testid="calendar-prev-year"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[3rem] text-center" data-testid="calendar-year-label">
            {selectedYear}
          </span>
          <Button
            size="icon"
            variant="ghost"
            disabled={!canGoNext}
            onClick={() => setSelectedYear((y) => y + 1)}
            data-testid="calendar-next-year"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid grid-cols-4 gap-2">
          {MONTH_NAMES.map((month) => {
            const monthStr = `${month} ${selectedYear}`;
            const stats = calendarData?.[monthStr];
            const isSelected = processingMonth === monthStr;
            const lineCount = stats?.lineCount || 0;

            return (
              <button
                key={monthStr}
                onClick={() => handleMonthClick(monthStr)}
                data-testid={`calendar-month-${monthStr}`}
                className={`
                  p-3 rounded-md text-left transition-colors cursor-pointer
                  ${getIntensityClass(lineCount)}
                  ${isSelected ? "ring-2 ring-primary bg-primary/10" : "hover-elevate"}
                `}
              >
                <p className="text-xs font-semibold">{month}</p>
                {stats ? (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-xs text-muted-foreground">{stats.lineCount} lines</p>
                    <p className="text-xs font-medium">{formatCurrency(stats.totalAmount)}</p>
                    <p className="text-xs text-muted-foreground">{stats.poCount} POs</p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">No data</p>
                )}
              </button>
            );
          })}
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
