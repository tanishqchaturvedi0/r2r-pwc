import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Settings, Upload, Shield, Sliders, Save, Loader2, FileUp, Trash2, AlertTriangle, Plus, Wand2, CheckCircle, Gavel, Eye, Filter, ArrowRight, Users, Zap, Tag, ToggleLeft, ToggleRight, Info, X, Sparkles, ChevronRight } from "lucide-react";
import { useProcessingMonth } from "@/contexts/ProcessingMonthContext";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ProcessingConfig() {
  const { isFinanceAdmin } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setProcessingMonth: setContextMonth } = useProcessingMonth();

  const { data: config, isLoading } = useQuery({
    queryKey: ["/api/config"],
    queryFn: () => apiGet<any>("/api/config"),
  });

  const { data: dateRange } = useQuery({
    queryKey: ["/api/data/date-range"],
    queryFn: () => apiGet<{ minYear: number; maxYear: number }>("/api/data/date-range"),
  });

  const [processingMonth, setProcessingMonth] = useState("");
  const [threshold, setThreshold] = useState("");
  const [creditGl, setCreditGl] = useState("");

  useEffect(() => {
    if (config) {
      setProcessingMonth(config.processing_month || "Feb 2026");
      setThreshold(config.threshold_amount || "0");
      setCreditGl(config.default_credit_gl || "");
    }
  }, [config]);

  const updateConfig = useMutation({
    mutationFn: (entries: Record<string, string>) =>
      Promise.all(Object.entries(entries).map(([key, value]) => apiPut(`/api/config/${key}`, { value }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/period-based"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
      setContextMonth(processingMonth);
      toast({ title: "Saved", description: "Configuration updated." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSave = () => {
    updateConfig.mutate({
      processing_month: processingMonth,
      threshold_amount: threshold,
      default_credit_gl: creditGl,
    });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <h3 className="text-sm font-semibold">Processing Configuration</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Processing Month</Label>
            <Select value={processingMonth} onValueChange={setProcessingMonth} disabled={!can("config", "canEdit")}>
              <SelectTrigger data-testid="select-processing-month"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(() => {
                  const currentYear = new Date().getFullYear();
                  const minY = Math.min(dateRange?.minYear ?? currentYear, currentYear) - 1;
                  const maxY = Math.max(dateRange?.maxYear ?? currentYear, currentYear) + 1;
                  const months: string[] = [];
                  for (let y = minY; y <= maxY; y++) {
                    for (let m = 0; m < 12; m++) {
                      months.push(`${MONTH_NAMES[m]} ${y}`);
                    }
                  }
                  return months.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Threshold Amount</Label>
            <Input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} disabled={!can("config", "canEdit")} data-testid="input-threshold" />
          </div>
          <div className="space-y-2">
            <Label>Default Credit GL</Label>
            <Input value={creditGl} onChange={e => setCreditGl(e.target.value)} placeholder="e.g., 50010011" disabled={!can("config", "canEdit")} data-testid="input-credit-gl" />
          </div>
        </div>
        <Button onClick={handleSave} disabled={!can("config", "canEdit") || updateConfig.isPending} data-testid="button-save-config">
          {updateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
}

function UploadDropZone({
  id,
  uploading,
  onFile,
  label,
  hint,
}: {
  id: string;
  uploading: boolean;
  onFile: (file: File) => void;
  label: string;
  hint: string;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <FileUp className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      <input
        type="file"
        accept=".csv"
        className="hidden"
        id={id}
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
        data-testid={`input-${id}`}
      />
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => document.getElementById(id)?.click()}
        disabled={uploading}
        data-testid={`button-browse-${id}`}
      >
        {uploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
        Browse
      </Button>
    </div>
  );
}

function CsvUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadingPo, setUploadingPo] = useState(false);
  const [uploadingGrn, setUploadingGrn] = useState(false);

  const { data: poUploadsData, isLoading: poUploadsLoading } = useQuery({
    queryKey: ["/api/po/uploads"],
    queryFn: () => apiGet<any[]>("/api/po/uploads"),
  });

  const { data: grnUploadsData, isLoading: grnUploadsLoading } = useQuery({
    queryKey: ["/api/grn/uploads"],
    queryFn: () => apiGet<any[]>("/api/grn/uploads"),
  });

  const handlePoUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      return toast({ title: "Error", description: "Please upload a CSV file", variant: "destructive" });
    }
    setUploadingPo(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = sessionStorage.getItem("auth_token");
      const res = await fetch("/api/po/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/po"] });
      queryClient.invalidateQueries({ queryKey: ["/api/po/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/period-based"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
      toast({
        title: "PO import successful",
        description: `Imported ${data.totalRows} rows (${data.periodBased} period-based, ${data.activityBased} activity-based)`,
      });
    } catch (err: any) {
      toast({ title: "PO upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPo(false);
    }
  };

  const handleGrnUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      return toast({ title: "Error", description: "Please upload a CSV file", variant: "destructive" });
    }
    setUploadingGrn(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = sessionStorage.getItem("auth_token");
      const res = await fetch("/api/grn/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/grn/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/period-based"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
      const unmatchedNote = data.unmatchedRows > 0 ? ` (${data.unmatchedRows} rows had no matching PO line)` : "";
      toast({
        title: "GRN import successful",
        description: `Processed ${data.totalRows} rows, ${data.matchedRows} matched${unmatchedNote}. GRN values are cumulative totals to date.`,
      });
    } catch (err: any) {
      toast({ title: "GRN upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingGrn(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PO Line Items Upload */}
        <Card>
          <CardHeader className="pb-3">
            <div>
              <h3 className="text-sm font-semibold">PO Line Item Details</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload the PO &amp; line items file. Required columns: Unique ID, PO Number, PO Line Item, Vendor Name, Net Amount, GL Account, Cost Center, etc.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <UploadDropZone
              id="po-csv-upload"
              uploading={uploadingPo}
              onFile={handlePoUpload}
              label="Drop PO Line Items CSV here"
              hint="Columns: PO Number, PO Line Item, Vendor Name, Net Amount, ..."
            />
          </CardContent>
        </Card>

        {/* GRN Upload */}
        <Card>
          <CardHeader className="pb-3">
            <div>
              <h3 className="text-sm font-semibold">GRN Data</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload the GRN file. GRN Value is the <strong>cumulative total to date</strong>, not the monthly amount. Columns: PO Number, PO Line Item, GRN Date, GRN Doc, GRN Value.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <UploadDropZone
              id="grn-csv-upload"
              uploading={uploadingGrn}
              onFile={handleGrnUpload}
              label="Drop GRN CSV here"
              hint="Columns: PO Number, PO Line Item, GRN Date, GRN Doc, GRN Value (cumulative)"
            />
          </CardContent>
        </Card>
      </div>

      {/* PO Upload History */}
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-sm font-semibold">PO Upload History</h3>
        </CardHeader>
        <CardContent className="p-0">
          {poUploadsLoading ? (
            <div className="p-6"><Skeleton className="h-20 w-full" /></div>
          ) : (poUploadsData || []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No PO uploads yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Period</TableHead>
                  <TableHead className="text-right">Activity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(poUploadsData || []).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm">{u.filename}</TableCell>
                    <TableCell className="text-xs">{new Date(u.uploadDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs">{u.processingMonth}</TableCell>
                    <TableCell className="text-right text-xs">{u.totalRows}</TableCell>
                    <TableCell className="text-right text-xs">{u.periodBasedCount}</TableCell>
                    <TableCell className="text-right text-xs">{u.activityBasedCount}</TableCell>
                    <TableCell><Badge variant="default" className="text-[10px]">{u.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* GRN Upload History */}
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-sm font-semibold">GRN Upload History</h3>
        </CardHeader>
        <CardContent className="p-0">
          {grnUploadsLoading ? (
            <div className="p-6"><Skeleton className="h-20 w-full" /></div>
          ) : (grnUploadsData || []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No GRN uploads yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Total Rows</TableHead>
                  <TableHead className="text-right">Matched</TableHead>
                  <TableHead className="text-right">Unmatched</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(grnUploadsData || []).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm">{u.filename}</TableCell>
                    <TableCell className="text-xs">{new Date(u.uploadDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs">{u.processingMonth}</TableCell>
                    <TableCell className="text-right text-xs">{u.totalRows}</TableCell>
                    <TableCell className="text-right text-xs">{u.matchedRows}</TableCell>
                    <TableCell className="text-right text-xs">
                      {u.unmatchedRows > 0
                        ? <span className="text-amber-600 font-medium">{u.unmatchedRows}</span>
                        : u.unmatchedRows}
                    </TableCell>
                    <TableCell><Badge variant="default" className="text-[10px]">{u.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RolePermissionsConfig() {
  const { isFinanceAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/config/permissions"],
    queryFn: () => apiGet<any[]>("/api/config/permissions"),
  });

  const togglePermission = useMutation({
    mutationFn: (params: { role: string; permission: string; field: string; value: boolean }) =>
      apiPut("/api/config/permissions", params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/config/permissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/permissions/me"] });
      toast({
        title: "Permission updated",
        description: `${variables.field.replace("can", "")} permission ${variables.value ? "enabled" : "disabled"} for ${variables.role}`,
      });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const roles = ["Finance Admin", "Finance Approver", "Business User"];
  const features = ["period_based", "activity_based", "non_po", "reports", "users", "config"];
  const featureLabels: Record<string, string> = {
    period_based: "Period-Based Accruals",
    activity_based: "Activity-Based Accruals",
    non_po: "Non-PO Accruals",
    reports: "Reports",
    users: "User Management",
    config: "Configuration",
  };

  const featureActions: Record<string, { key: string; label: string }[]> = {
    period_based: [
      { key: "canView", label: "View" },
      { key: "canCreate", label: "Upload PO" },
      { key: "canEdit", label: "Edit" },
      { key: "canApprove", label: "Approve" },
    ],
    activity_based: [
      { key: "canView", label: "View" },
      { key: "canCreate", label: "Upload PO" },
      { key: "canEdit", label: "Edit" },
      { key: "canApprove", label: "Approve" },
    ],
    non_po: [
      { key: "canView", label: "View" },
      { key: "canCreate", label: "Create" },
      { key: "canEdit", label: "Edit" },
      { key: "canApprove", label: "Approve" },
    ],
    reports: [
      { key: "canView", label: "View" },
      { key: "canDownload", label: "Download" },
    ],
    users: [
      { key: "canView", label: "View" },
      { key: "canInvite", label: "Invite User" },
      { key: "canEdit", label: "Edit" },
    ],
    config: [
      { key: "canView", label: "View" },
      { key: "canEdit", label: "Edit" },
    ],
  };

  const getPermission = (role: string, perm: string) => {
    return (data || []).find((p: any) => p.role === role && p.permission === perm);
  };

  const handleToggle = (role: string, permission: string, field: string, currentValue: boolean) => {
    if (!isFinanceAdmin) return;
    togglePermission.mutate({ role, permission, field, value: !currentValue });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <h3 className="text-sm font-semibold" data-testid="text-permissions-title">Role Permissions Matrix</h3>
        {!isFinanceAdmin && (
          <Badge variant="outline" className="text-[10px]">Read Only</Badge>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="w-full">
          <div className="min-w-[700px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px] sticky left-0 bg-background z-10" data-testid="col-feature">Feature / Module</TableHead>
                  {roles.map(role => (
                    <TableHead key={role} className="text-center min-w-[180px]" data-testid={`col-role-${role.replace(/\s+/g, '-').toLowerCase()}`}>
                      <span className="text-xs font-semibold">{role}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {features.map(feature => {
                  const actions = featureActions[feature];
                  return (
                    <TableRow key={feature} data-testid={`row-feature-${feature}`}>
                      <TableCell className="font-medium text-sm sticky left-0 bg-background z-10" data-testid={`text-feature-${feature}`}>
                        {featureLabels[feature]}
                      </TableCell>
                      {roles.map(role => {
                        const p = getPermission(role, feature);
                        return (
                          <TableCell key={role} className="text-center py-3">
                            <div className="flex flex-wrap gap-1.5 justify-center">
                              {actions.map(action => {
                                const isActive = !!(p as any)?.[action.key];
                                return (
                                  <Button
                                    key={action.key}
                                    size="sm"
                                    variant={isActive ? "default" : "outline"}
                                    disabled={!isFinanceAdmin}
                                    onClick={() => handleToggle(role, feature, action.key, isActive)}
                                    className="text-[10px] font-medium rounded-full"
                                    data-testid={`chip-${feature}-${role.replace(/\s+/g, '-').toLowerCase()}-${action.key}`}
                                  >
                                    {action.label}
                                  </Button>
                                );
                              })}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ClearDataSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (!passkey) return;
    setClearing(true);
    try {
      const result = await apiPost<{ message: string }>("/api/data/clear-all", { passkey });
      toast({ title: "Data Cleared", description: result.message });
      queryClient.invalidateQueries();
      setDialogOpen(false);
      setPasskey("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to clear data", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Danger Zone
          </h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Clear all PO data, GRN transactions, accrual calculations, approvals, non-PO submissions, and related records. This action cannot be undone. User accounts and system configuration will be preserved.
          </p>
          <Button
            variant="destructive"
            onClick={() => { setPasskey(""); setDialogOpen(true); }}
            data-testid="button-clear-all-data"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All Data
          </Button>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="dialog-clear-data">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Data Deletion
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all PO lines, GRN transactions, accrual calculations, approval submissions, activity assignments, non-PO forms and submissions, approval rules, and notifications. User accounts and configuration settings will not be affected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="passkey-input" className="text-sm font-medium">Enter Passkey to Confirm</Label>
            <Input
              id="passkey-input"
              type="password"
              value={passkey}
              onChange={e => setPasskey(e.target.value)}
              placeholder="Enter passkey..."
              onKeyDown={e => { if (e.key === "Enter" && passkey) handleClear(); }}
              data-testid="input-clear-passkey"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-clear">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClear}
              disabled={!passkey || clearing}
              data-testid="button-confirm-clear"
            >
              {clearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Clear All Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const FIELD_LABELS: Record<string, string> = {
  costCenter: "Cost Center", vendorName: "Vendor Name", netAmount: "Net Amount",
  glAccount: "GL Account", plant: "Plant", profitCenter: "Profit Center",
  itemDescription: "Item Description", poNumber: "PO Number",
  currentMonthTrueUp: "Cur Month True-Up", prevMonthTrueUp: "Prev Month True-Up",
  finalProvision: "Final Provision", suggestedProvision: "Suggested Provision",
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: "=", notEquals: "≠", contains: "contains", greaterThan: ">",
  lessThan: "<", between: "between", startsWith: "starts with",
};

const OPERATOR_HUMAN: Record<string, string> = {
  equals: "equals", notEquals: "does not equal", contains: "contains",
  greaterThan: "is greater than", lessThan: "is less than",
  between: "is between", startsWith: "starts with",
};

const FIELD_COLORS: Record<string, string> = {
  costCenter: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400",
  vendorName: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400",
  netAmount: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400",
  glAccount: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400",
  plant: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400",
  profitCenter: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400",
  itemDescription: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/30 dark:text-pink-400",
  poNumber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400",
  currentMonthTrueUp: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400",
  prevMonthTrueUp: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400",
  finalProvision: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400",
  suggestedProvision: "bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-950/30 dark:text-lime-400",
};

function formatConditionValue(field: string, value: any): string {
  const numericFields = ["netAmount", "currentMonthTrueUp", "prevMonthTrueUp", "finalProvision", "suggestedProvision"];
  if (numericFields.includes(field) && !isNaN(Number(value))) {
    return `₹${Number(value).toLocaleString("en-IN")}`;
  }
  return String(value);
}

function RuleInterpretModal({ rule, open, onClose }: { rule: any; open: boolean; onClose: () => void }) {
  const conditions = (rule?.parsedConditions as any[]) || [];
  const actions = (rule?.parsedActions as any[]) || [];
  const fields = Array.from(new Set(conditions.map((c: any) => c.field)));

  const getApproverDescription = () => {
    const descs: string[] = [];
    for (const a of actions) {
      if (a.type === "autoAssign") descs.push("All Finance Approvers");
      else if (a.type === "assignTo" && (a.userName || a.approverName)) descs.push(a.userName || a.approverName);
      else if (a.type === "requireApproval" && (a.approverName || a.userName)) descs.push(a.approverName || a.userName);
      else if (a.type === "flagForReview") descs.push("Flag for review");
      else if (a.type === "setStatus" && a.status) descs.push(`Set status to: ${a.status}`);
    }
    return descs.length > 0 ? descs : ["All Finance Approvers"];
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Gavel className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{rule?.ruleName}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Approval rule interpretation</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {rule?.naturalLanguageText && (
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                <Info className="h-3 w-3" /> Natural Language Rule
              </p>
              <p className="text-sm italic text-foreground/80">"{rule.naturalLanguageText}"</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Filter className="h-3 w-3" /> Applicable Columns
            </p>
            <div className="flex flex-wrap gap-1.5">
              {fields.length === 0 ? (
                <span className="text-xs text-muted-foreground">All columns</span>
              ) : fields.map((f: string) => (
                <span key={f} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${FIELD_COLORS[f] || "bg-muted text-muted-foreground border-border"}`}>
                  <Tag className="h-2.5 w-2.5" />
                  {FIELD_LABELS[f] || f}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Zap className="h-3 w-3" /> Conditions
            </p>
            {conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Applies to all PO lines (no conditions)</p>
            ) : (
              <div className="space-y-1.5">
                {conditions.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30">
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">IF</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${FIELD_COLORS[c.field] || "bg-muted text-foreground border-border"}`}>
                      {FIELD_LABELS[c.field] || c.field}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{OPERATOR_LABELS[c.operator] || c.operator}</span>
                    <span className="text-xs font-semibold font-mono bg-background border rounded px-1.5 py-0.5">{String(c.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Suggested Approvers
            </p>
            <div className="space-y-1.5">
              {getApproverDescription().map((desc, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
                  <ArrowRight className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-300">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">Applies to:</span>
              <Badge variant="secondary" className="text-[10px]">{rule?.appliesTo || "Both"}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">Status:</span>
              <Badge variant={rule?.isActive ? "default" : "outline"} className="text-[10px]">
                {rule?.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalRulesConfig() {
  const { isFinanceAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [ruleText, setRuleText] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [appliesTo, setAppliesTo] = useState("Both");
  const [parsed, setParsed] = useState<any>(null);
  const [interpretRule, setInterpretRule] = useState<any>(null);
  const [approverChips, setApproverChips] = useState<Set<number>>(new Set());

  const { data: rules, isLoading } = useQuery({
    queryKey: ["/api/rules"],
    queryFn: () => apiGet<any[]>("/api/rules"),
  });

  const { data: approvers = [] } = useQuery({
    queryKey: ["/api/approvers"],
    queryFn: () => apiGet<Array<{ id: number; name: string; email: string }>>("/api/approvers"),
  });

  const parseMutation = useMutation({
    mutationFn: (text: string) => apiPost<any>("/api/rules/parse", { text }),
    onSuccess: (data) => setParsed(data),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createRule = useMutation({
    mutationFn: (data: any) => apiPost("/api/rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
      setRuleText("");
      setRuleName("");
      setParsed(null);
      toast({ title: "Rule saved", description: "Approval rule has been created." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
      toast({ title: "Deleted", description: "Rule has been removed." });
    },
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiPatch(`/api/rules/${id}/toggle`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleInterpret = () => {
    if (!ruleText.trim()) return;
    parseMutation.mutate(ruleText);
  };

  // When parse result arrives, initialise approver chips from the actions
  useEffect(() => {
    if (!parsed || !approvers.length) return;
    const chips = new Set<number>();
    for (const action of (parsed.actions || [])) {
      if (action.type === "autoAssign") {
        for (const a of approvers) chips.add(a.id);
      } else if (action.type === "assignTo" || action.type === "requireApproval") {
        const name = (action.userName || action.approverName || "").toLowerCase().trim();
        if (name) {
          const found = (approvers as any[]).find((a: any) =>
            a.name.toLowerCase() === name ||
            a.name.toLowerCase().includes(name) ||
            name.includes(a.name.toLowerCase())
          );
          if (found) chips.add(found.id);
        }
      }
    }
    setApproverChips(chips);
  }, [parsed, approvers]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeChip = (id: number) => {
    setApproverChips(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handleSave = () => {
    if (!ruleName || !parsed) return;
    const hasAutoAssign = (parsed.actions || []).some((a: any) => a.type === "autoAssign");
    let finalActions = parsed.actions;

    // If user removed chips from an autoAssign, persist the specific set of users
    if (hasAutoAssign && approverChips.size < (approvers as any[]).length) {
      finalActions = Array.from(approverChips).map(id => {
        const user = (approvers as any[]).find((a: any) => a.id === id);
        return { type: "assignTo", userName: user?.name || "", userId: id };
      });
    }

    createRule.mutate({
      ruleName,
      naturalLanguageText: ruleText,
      parsedConditions: parsed.conditions,
      parsedActions: finalActions,
      appliesTo,
    });
  };

  return (
    <div className="space-y-4">
      {isFinanceAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Describe your approval rule</h3>
              </div>
              <p className="text-xs text-muted-foreground">Write a rule in plain English — the system will interpret it automatically.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={ruleText}
                onChange={e => setRuleText(e.target.value)}
                placeholder="e.g., All POs for Cost Center 40030403 should go to Jane Smith"
                rows={4}
                data-testid="input-rule-text"
              />
              <Button onClick={handleInterpret} disabled={parseMutation.isPending || !ruleText.trim()} data-testid="button-interpret">
                {parseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Interpret Rule
              </Button>
            </CardContent>
          </Card>

          {parsed && (
            <Card className="border-green-200 dark:border-green-900">
              <CardHeader className="pb-2 border-b">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-sm font-semibold">Rule Interpreted</h3>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">

                {/* Rewritten rule */}
                {(parsed.rewrittenRule || parsed.interpretedText) && (
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <p className="text-[10px] font-semibold text-primary uppercase tracking-wide">Interpreted as</p>
                    </div>
                    <p className="text-sm font-medium text-foreground leading-relaxed" data-testid="text-ai-summary">
                      {parsed.rewrittenRule || parsed.interpretedText}
                    </p>
                  </div>
                )}

                {/* IF block — Conditions */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900">
                    <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded-full">IF</span>
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">When this condition is true</p>
                  </div>
                  <div className="p-3 space-y-2 bg-blue-50/30 dark:bg-blue-950/10">
                    {(parsed.conditions || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No conditions — applies to all PO lines</p>
                    ) : (parsed.conditions || []).map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 flex-wrap">
                        {i > 0 && <span className="text-[10px] font-semibold text-muted-foreground px-1">AND</span>}
                        {/* Column chip */}
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${FIELD_COLORS[c.field] || "bg-muted text-foreground border-border"}`}>
                          <Tag className="h-2.5 w-2.5" />
                          {FIELD_LABELS[c.field] || c.field}
                        </span>
                        {/* Operator */}
                        <span className="text-xs text-muted-foreground font-medium">
                          {OPERATOR_HUMAN[c.operator] || c.operator}
                        </span>
                        {/* Value */}
                        <span className="text-sm font-bold font-mono text-foreground bg-background border rounded-lg px-2.5 py-1 shadow-sm">
                          {formatConditionValue(c.field, c.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* THEN block — Approver chips */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-950/30 border-b border-green-100 dark:border-green-900">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/60 px-2 py-0.5 rounded-full">THEN</span>
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400">Suggest these approvers</p>
                    </div>
                    <span className="text-[10px] text-green-600 dark:text-green-500">
                      {approverChips.size} selected · click × to remove
                    </span>
                  </div>
                  <div className="p-3 bg-green-50/30 dark:bg-green-950/10">
                    {approverChips.size === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No approvers selected — all approvers will be shown</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {Array.from(approverChips).map(id => {
                          const a = (approvers as any[]).find((u: any) => u.id === id);
                          if (!a) return null;
                          return (
                            <div key={id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full border border-green-200 bg-green-100 dark:bg-green-900/40 dark:border-green-800 text-green-800 dark:text-green-300">
                              <div className="h-4 w-4 rounded-full bg-green-600 dark:bg-green-500 flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                                {a.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs font-medium">{a.name}</span>
                              <button
                                onClick={() => removeChip(id)}
                                className="ml-0.5 h-4 w-4 rounded-full hover:bg-green-200 dark:hover:bg-green-800 flex items-center justify-center transition-colors"
                                title={`Remove ${a.name}`}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {parsed.approverNote && (
                      <p className="text-[11px] text-green-700 dark:text-green-500 mt-2 flex items-start gap-1">
                        <Info className="h-3 w-3 shrink-0 mt-0.5" />
                        {parsed.approverNote}
                      </p>
                    )}
                  </div>
                </div>

                {/* Scope */}
                {parsed.applierScope && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/40 border text-xs text-muted-foreground">
                    <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span><span className="font-semibold text-foreground">Scope: </span>{parsed.applierScope}</span>
                  </div>
                )}

                {/* Save form */}
                <div className="pt-3 border-t space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Rule Name</Label>
                    <Input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="e.g. High True-Up → All Finance Approvers" data-testid="input-rule-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Applies To</Label>
                    <Select value={appliesTo} onValueChange={setAppliesTo}>
                      <SelectTrigger data-testid="select-applies-to"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Activity">Activity-based POs</SelectItem>
                        <SelectItem value="NonPO">Non-PO Forms</SelectItem>
                        <SelectItem value="Both">Both (Period + Activity)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={!ruleName || createRule.isPending || approverChips.size === 0}
                    className="w-full"
                    data-testid="button-save-rule"
                  >
                    {createRule.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Save Rule
                  </Button>
                  {approverChips.size === 0 && (
                    <p className="text-[11px] text-destructive text-center">Add at least one approver chip before saving</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Gavel className="h-4 w-4 text-primary" />
                Approval Rules
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Active rules auto-suggest approvers when submitting for approval</p>
            </div>
            {(rules || []).length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {(rules || []).filter((r: any) => r.isActive).length} active
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : (rules || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Gavel className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-sm font-medium">No approval rules yet</h3>
              <p className="text-xs text-muted-foreground mt-1">Create rules above to auto-suggest approvers during submission</p>
            </div>
          ) : (
            <div className="divide-y">
              {(rules || []).map((rule: any, idx: number) => {
                const conditions = (rule.parsedConditions as any[]) || [];
                const actions = (rule.parsedActions as any[]) || [];
                const fields = Array.from(new Set(conditions.map((c: any) => c.field)));
                return (
                  <div key={rule.id} className={`p-4 flex items-start gap-4 group transition-colors hover:bg-muted/30 ${!rule.isActive ? "opacity-60" : ""}`}>
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center mt-0.5">
                      <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{rule.ruleName}</p>
                          {rule.naturalLanguageText && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{rule.naturalLanguageText}</p>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{rule.appliesTo}</Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {conditions.slice(0, 3).map((c: any, i: number) => (
                          <span key={i} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${FIELD_COLORS[c.field] || "bg-muted text-foreground border-border"}`}>
                            {FIELD_LABELS[c.field] || c.field} {OPERATOR_LABELS[c.operator] || c.operator} {String(c.value)}
                          </span>
                        ))}
                        {conditions.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{conditions.length - 3} more</span>
                        )}
                        {actions.map((a: any, i: number) => (
                          <span key={`a-${i}`} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700 font-medium dark:bg-green-950/20 dark:text-green-400 dark:border-green-900">
                            <ArrowRight className="h-2.5 w-2.5" />
                            {a.type === "autoAssign" ? "All Finance Approvers" : (a.userName || a.approverName || a.type)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setInterpretRule(rule)}
                        data-testid={`button-interpret-rule-${rule.id}`}
                      >
                        <Eye className="h-3 w-3" />
                        Interpret
                      </Button>
                      {isFinanceAdmin && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => toggleRule.mutate({ id: rule.id, isActive: !rule.isActive })}
                            title={rule.isActive ? "Deactivate rule" : "Activate rule"}
                            data-testid={`button-toggle-rule-${rule.id}`}
                          >
                            {rule.isActive
                              ? <ToggleRight className="h-4 w-4 text-primary" />
                              : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-delete-rule-${rule.id}`}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Rule</AlertDialogTitle>
                                <AlertDialogDescription>Are you sure you want to delete "{rule.ruleName}"? This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteRule.mutate(rule.id)} data-testid="button-confirm-delete">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <RuleInterpretModal rule={interpretRule} open={!!interpretRule} onClose={() => setInterpretRule(null)} />
    </div>
  );
}

export default function ConfigurationPage() {
  const { isFinanceAdmin } = useAuth();

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">System settings and data management</p>
      </div>

      <Tabs defaultValue="processing">
        <TabsList className="flex-wrap">
          <TabsTrigger value="processing" data-testid="tab-processing">
            <Sliders className="h-3.5 w-3.5 mr-1.5" />
            Processing
          </TabsTrigger>
          {isFinanceAdmin && (
            <TabsTrigger value="upload" data-testid="tab-upload">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              CSV Upload
            </TabsTrigger>
          )}
          <TabsTrigger value="permissions" data-testid="tab-permissions">
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Permissions
          </TabsTrigger>
          <TabsTrigger value="approval-rules" data-testid="tab-approval-rules">
            <Gavel className="h-3.5 w-3.5 mr-1.5" />
            Approval Rules
          </TabsTrigger>
        </TabsList>
        <TabsContent value="processing" className="mt-4 space-y-4">
          <ProcessingConfig />
          {isFinanceAdmin && <ClearDataSection />}
        </TabsContent>
        {isFinanceAdmin && (
          <TabsContent value="upload" className="mt-4">
            <CsvUpload />
          </TabsContent>
        )}
        <TabsContent value="permissions" className="mt-4">
          <RolePermissionsConfig />
        </TabsContent>
        <TabsContent value="approval-rules" className="mt-4">
          <ApprovalRulesConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
