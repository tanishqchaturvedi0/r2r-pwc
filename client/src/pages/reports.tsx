import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useProcessingMonth } from "@/contexts/ProcessingMonthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { Download, AlertTriangle, BarChart3, FileCheck, Columns3 } from "lucide-react";
import { usePermissions } from "@/contexts/PermissionsContext";

const COLORS = [
  "hsl(217, 91%, 35%)", "hsl(173, 58%, 30%)", "hsl(43, 74%, 38%)",
  "hsl(27, 87%, 35%)", "hsl(197, 37%, 32%)",
];

const ALL_EXPORT_COLUMNS = [
  "PO Number", "Line Item", "Vendor", "Description", "Net Amount",
  "GL Account", "Cost Center", "Profit Center", "Plant",
  "Start Date", "End Date", "Total Days",
  "Prev Month Days", "Prev Month Provision", "Prev Month True-Up",
  "Prev Month GRN", "Carry Forward",
  "Current Month Days", "Suggested Provision", "Current Month GRN",
  "Current Month True-Up", "Remarks", "Final Provision", "Status", "Category",
];

const SAP_EXPORT_COLUMNS = [
  "PO Number", "Line Item", "Vendor", "Description", "Net Amount",
  "GL Account", "Cost Center", "Profit Center", "Plant",
  "Start Date", "End Date", "Total Days",
  "Carry Forward", "Suggested Provision", "Current Month GRN",
  "Current Month True-Up", "Remarks", "Final Provision",
];

function formatAmount(v: number) {
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toFixed(0);
}

function formatFullAmount(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v);
}

function ColumnPickerDialog({ open, onOpenChange, columns, selectedColumns, onColumnsChange, onExport, title }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: string[];
  selectedColumns: string[];
  onColumnsChange: (cols: string[]) => void;
  onExport: () => void;
  title: string;
}) {
  const toggleColumn = (col: string) => {
    if (selectedColumns.includes(col)) {
      onColumnsChange(selectedColumns.filter(c => c !== col));
    } else {
      onColumnsChange([...selectedColumns, col]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onColumnsChange([...columns])}
              data-testid="button-select-all"
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onColumnsChange([])}
              data-testid="button-deselect-all"
            >
              Deselect All
            </Button>
          </div>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-1">
              {columns.map(col => (
                <label
                  key={col}
                  className="flex items-center gap-2 p-1.5 rounded-md hover-elevate cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selectedColumns.includes(col)}
                    onCheckedChange={() => toggleColumn(col)}
                    data-testid={`checkbox-col-${col.toLowerCase().replace(/\s+/g, "-")}`}
                  />
                  {col}
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onExport}
            disabled={selectedColumns.length === 0}
            data-testid="button-confirm-export"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export ({selectedColumns.length} cols)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExceptionCard({ title, count, value, variant }: {
  title: string; count: number; value: number; variant: "destructive" | "secondary";
}) {
  return (
    <Card className="overflow-visible">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-xl font-bold">{count}</p>
            <p className="text-xs font-mono text-muted-foreground">{formatAmount(value)}</p>
          </div>
          <Badge variant={variant} className="text-[10px] shrink-0">
            {variant === "destructive" ? "Critical" : "Warning"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyticsTab() {
  const { processingMonth } = useProcessingMonth();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/reports/analytics", processingMonth],
    queryFn: () => apiGet<any>(`/api/reports/analytics?processingMonth=${encodeURIComponent(processingMonth)}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const d = data || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Avg Provision/PO</p>
            <p className="text-xl font-bold mt-1">{formatAmount(d.avgProvisionPerPo || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Avg Response Time</p>
            <p className="text-xl font-bold mt-1">{d.avgResponseDays || 0} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Completion Rate</p>
            <p className="text-xl font-bold mt-1">{d.completionRate || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total PO Lines</p>
            <p className="text-xl font-bold mt-1">{d.totalPoLines || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Top Vendors by Provision</h3>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(d.topVendors || []).slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={formatAmount} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => formatAmount(v)} />
                  <Bar dataKey="amount" fill={COLORS[0]} radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Status Distribution</h3>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={d.statusDistribution || []} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value" nameKey="name" paddingAngle={3} strokeWidth={0}>
                    {(d.statusDistribution || []).map((_: any, idx: number) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              {(d.statusDistribution || []).map((item: any, idx: number) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExceptionsTab() {
  const { processingMonth } = useProcessingMonth();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/reports/exceptions", processingMonth],
    queryFn: () => apiGet<any>(`/api/reports/exceptions?processingMonth=${encodeURIComponent(processingMonth)}`),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const d = data || {};

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <ExceptionCard title="Negative Provisions" count={d.negativeProvisions || 0} value={d.negativeValue || 0} variant="destructive" />
      <ExceptionCard title="Zero Provisions" count={d.zeroProvisions || 0} value={0} variant="secondary" />
      <ExceptionCard title="Unassigned Activity POs" count={d.unassigned || 0} value={d.unassignedValue || 0} variant="destructive" />
      <ExceptionCard title="Overdue Approvals" count={d.overdueApprovals || 0} value={d.overdueValue || 0} variant="destructive" />
      <ExceptionCard title="Large True-ups" count={d.largeTrueUps || 0} value={d.largeTrueUpValue || 0} variant="secondary" />
      <ExceptionCard title="GRN Exceeds Net" count={d.grnExceeds || 0} value={d.grnExceedsValue || 0} variant="secondary" />
      <ExceptionCard title="Missing Dates" count={d.missingDates || 0} value={d.missingDatesValue || 0} variant="destructive" />
      <ExceptionCard title="Missing Required Fields" count={d.missingFields || 0} value={0} variant="secondary" />
    </div>
  );
}

function SapPostReadyTab() {
  const { can } = usePermissions();
  const { processingMonth } = useProcessingMonth();
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [selectedCols, setSelectedCols] = useState<string[]>([...SAP_EXPORT_COLUMNS]);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/reports/sap-post-ready", processingMonth],
    queryFn: () => apiGet<any>(`/api/reports/sap-post-ready?processingMonth=${encodeURIComponent(processingMonth)}`),
  });

  const handleExport = async () => {
    const token = sessionStorage.getItem("auth_token");
    const columnsParam = selectedCols.join(",");
    const res = await fetch(`/api/reports/sap-post-ready/export?columns=${encodeURIComponent(columnsParam)}&processingMonth=${encodeURIComponent(processingMonth)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sap_post_ready_report.csv";
      a.click();
      URL.revokeObjectURL(url);
    }
    setColumnPickerOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const d = data || { totalLines: 0, totalProvision: 0, byGlAccount: {}, byCostCenter: {}, lines: [] };
  const glData = Object.entries(d.byGlAccount || {}).map(([name, v]: [string, any]) => ({ name, count: v.count, total: v.total }));
  const ccData = Object.entries(d.byCostCenter || {}).map(([name, v]: [string, any]) => ({ name, count: v.count, total: v.total }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Approved Lines</p>
            <p className="text-xl font-bold mt-1" data-testid="text-sap-total-lines">{d.totalLines}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total Provision</p>
            <p className="text-xl font-bold mt-1 font-mono" data-testid="text-sap-total-provision">{formatFullAmount(d.totalProvision)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">GL Accounts</p>
            <p className="text-xl font-bold mt-1">{glData.length}</p>
          </CardContent>
        </Card>
      </div>

      {d.totalLines === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileCheck className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-medium">No approved accruals</h3>
            <p className="text-xs text-muted-foreground mt-1">Approve period-based accruals to see them here</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <h3 className="text-sm font-semibold">By GL Account</h3>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GL Account</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead className="text-right">Total Provision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {glData.map(row => (
                      <TableRow key={row.name}>
                        <TableCell className="font-mono text-xs">{row.name}</TableCell>
                        <TableCell className="text-right text-xs">{row.count}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatFullAmount(row.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <h3 className="text-sm font-semibold">By Cost Center</h3>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cost Center</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead className="text-right">Total Provision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ccData.map(row => (
                      <TableRow key={row.name}>
                        <TableCell className="font-mono text-xs">{row.name}</TableCell>
                        <TableCell className="text-right text-xs">{row.count}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatFullAmount(row.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <h3 className="text-sm font-semibold">Approved Line Items</h3>
              {can("reports", "canDownload") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setColumnPickerOpen(true)}
                  data-testid="button-sap-export"
                >
                  <Columns3 className="mr-1.5 h-3.5 w-3.5" />
                  Export with Column Picker
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="w-full">
                <div className="min-w-[1200px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[100px]">PO Number</TableHead>
                        <TableHead className="min-w-[50px]">Line</TableHead>
                        <TableHead className="min-w-[130px]">Vendor</TableHead>
                        <TableHead className="min-w-[150px]">Description</TableHead>
                        <TableHead className="text-right min-w-[90px]">Net Amt</TableHead>
                        <TableHead className="min-w-[70px]">GL</TableHead>
                        <TableHead className="min-w-[70px]">CC</TableHead>
                        <TableHead className="text-right min-w-[90px]">Carry Fwd</TableHead>
                        <TableHead className="text-right min-w-[90px]">Cur Prov</TableHead>
                        <TableHead className="text-right min-w-[80px]">Cur GRN</TableHead>
                        <TableHead className="text-right min-w-[80px]">Cur T/U</TableHead>
                        <TableHead className="text-right font-bold min-w-[100px]">Final</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(d.lines || []).map((line: any) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono text-xs font-medium">{line.poNumber}</TableCell>
                          <TableCell className="text-xs">{line.poLineItem}</TableCell>
                          <TableCell className="text-xs truncate max-w-[130px]">{line.vendorName}</TableCell>
                          <TableCell className="text-xs truncate max-w-[150px]">{line.itemDescription}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{formatFullAmount(line.netAmount)}</TableCell>
                          <TableCell className="text-xs font-mono">{line.glAccount}</TableCell>
                          <TableCell className="text-xs font-mono">{line.costCenter}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{formatFullAmount(line.carryForward)}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{formatFullAmount(line.suggestedProvision)}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{formatFullAmount(line.currentMonthGrn)}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{formatFullAmount(line.currentMonthTrueUp)}</TableCell>
                          <TableCell className="text-right font-bold text-sm font-mono">
                            <span className={line.finalProvision < 0 ? "text-destructive" : ""}>
                              {formatFullAmount(line.finalProvision)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}

      <ColumnPickerDialog
        open={columnPickerOpen}
        onOpenChange={setColumnPickerOpen}
        columns={SAP_EXPORT_COLUMNS}
        selectedColumns={selectedCols}
        onColumnsChange={setSelectedCols}
        onExport={handleExport}
        title="SAP Post-Ready Export - Select Columns"
      />
    </div>
  );
}

export default function ReportsPage() {
  const { can } = usePermissions();
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [exportCols, setExportCols] = useState<string[]>([...ALL_EXPORT_COLUMNS]);

  const handleExport = async () => {
    const token = sessionStorage.getItem("auth_token");
    const columnsParam = exportCols.join(",");
    const res = await fetch(`/api/reports/export?columns=${encodeURIComponent(columnsParam)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "accruals_report.csv";
      a.click();
      URL.revokeObjectURL(url);
    }
    setExportPickerOpen(false);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Comprehensive reporting and exception tracking</p>
        </div>
        {can("reports", "canDownload") && (
          <Button onClick={() => setExportPickerOpen(true)} variant="outline" data-testid="button-export">
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      <Tabs defaultValue="analytics">
        <TabsList>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            Exceptions
          </TabsTrigger>
          <TabsTrigger value="sap-post" data-testid="tab-sap-post">
            <FileCheck className="h-3.5 w-3.5 mr-1.5" />
            SAP Post-Ready
          </TabsTrigger>
        </TabsList>
        <TabsContent value="analytics" className="mt-4">
          <AnalyticsTab />
        </TabsContent>
        <TabsContent value="exceptions" className="mt-4">
          <ExceptionsTab />
        </TabsContent>
        <TabsContent value="sap-post" className="mt-4">
          <SapPostReadyTab />
        </TabsContent>
      </Tabs>

      <ColumnPickerDialog
        open={exportPickerOpen}
        onOpenChange={setExportPickerOpen}
        columns={ALL_EXPORT_COLUMNS}
        selectedColumns={exportCols}
        onColumnsChange={setExportCols}
        onExport={handleExport}
        title="Export Report - Select Columns"
      />
    </div>
  );
}
