import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, apiPost } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Settings, Upload, Shield, Sliders, Save, Loader2, FileUp, Trash2, AlertTriangle } from "lucide-react";

function ProcessingConfig() {
  const { isFinanceAdmin } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["/api/config"],
    queryFn: () => apiGet<any>("/api/config"),
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
                {["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026",
                  "Jul 2026", "Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026", "Dec 2026"].map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
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

function CsvUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: uploads, isLoading } = useQuery({
    queryKey: ["/api/po/uploads"],
    queryFn: () => apiGet<any[]>("/api/po/uploads"),
  });

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      return toast({ title: "Error", description: "Please upload a CSV file", variant: "destructive" });
    }
    setUploading(true);
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
      queryClient.invalidateQueries({ queryKey: ["/api/period-based"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
      toast({ title: "Import successful", description: `Imported ${data.totalRows} rows (${data.periodBased} period, ${data.activityBased} activity)` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-sm font-semibold">Upload CSV Data</h3>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <FileUp className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">Drop CSV file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">CSV files only, max 50MB</p>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              id="csv-upload"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
              data-testid="input-csv-upload"
            />
            <Button variant="outline" className="mt-4" onClick={() => document.getElementById("csv-upload")?.click()} disabled={uploading} data-testid="button-browse-csv">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Browse Files
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-sm font-semibold">Upload History</h3>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><Skeleton className="h-20 w-full" /></div>
          ) : (uploads || []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No uploads yet</div>
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
                {(uploads || []).map((u: any) => (
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
      { key: "canCreate", label: "Upload PO" },
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

export default function ConfigurationPage() {
  const { isFinanceAdmin } = useAuth();

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">System settings and data management</p>
      </div>

      <Tabs defaultValue="processing">
        <TabsList>
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
      </Tabs>
    </div>
  );
}
