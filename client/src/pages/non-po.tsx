import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, Loader2, FileCheck, Search, CheckCircle, CornerUpLeft, UserPlus } from "lucide-react";

function formatAmount(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v);
}

function FormBuilder() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formName, setFormName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);

  const defaultFields = [
    { key: "vendorName", label: "Vendor Name", visible: true, required: true },
    { key: "serviceDescription", label: "Service Description", visible: true, required: false },
    { key: "provisionAmount", label: "Provision Amount", visible: true, required: true },
    { key: "glAccount", label: "GL Account", visible: true, required: false },
    { key: "costCenter", label: "Cost Center", visible: true, required: false },
    { key: "profitCenter", label: "Profit Center", visible: false, required: false },
    { key: "plant", label: "Plant", visible: false, required: false },
  ];

  const [fields, setFields] = useState(defaultFields);

  const { data: users } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiGet<any[]>("/api/users"),
  });

  const createForm = useMutation({
    mutationFn: (data: any) => apiPost("/api/non-po/forms", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/forms"] });
      toast({ title: "Form created", description: "Non-PO form created and sent to users." });
      setFormName("");
      setDescription("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const businessUsers = (users || []).filter((u: any) => u.roles?.includes("Business User"));

  const handleSubmit = () => {
    if (!formName) return toast({ title: "Error", description: "Form name is required", variant: "destructive" });
    const fieldConfig = {
      defaultFields: Object.fromEntries(fields.map(f => [f.key, { visible: f.visible, required: f.required }])),
      customFields: [],
    };
    createForm.mutate({
      formName,
      description,
      dueDate: dueDate || null,
      priority,
      fieldConfiguration: fieldConfig,
      assignedUserIds: selectedUsers,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-sm font-semibold">Form Configuration</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Form Name</Label>
            <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g., Monthly Consulting Accrual" data-testid="input-form-name" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Form description..." rows={2} data-testid="input-form-desc" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} data-testid="input-due-date" />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fields</Label>
            <div className="space-y-2 border rounded-md p-3">
              {fields.map((f, idx) => (
                <div key={f.key} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={f.visible}
                      onCheckedChange={(v) => {
                        const copy = [...fields];
                        copy[idx] = { ...copy[idx], visible: !!v };
                        setFields(copy);
                      }}
                    />
                    <span className="text-sm">{f.label}</span>
                  </div>
                  {f.visible && (
                    <Badge
                      variant={f.required ? "default" : "secondary"}
                      className="text-[10px] cursor-pointer"
                      onClick={() => {
                        const copy = [...fields];
                        copy[idx] = { ...copy[idx], required: !copy[idx].required };
                        setFields(copy);
                      }}
                    >
                      {f.required ? "Required" : "Optional"}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign to Users</Label>
            <div className="space-y-1.5 border rounded-md p-3 max-h-32 overflow-y-auto">
              {businessUsers.map((u: any) => (
                <div key={u.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedUsers.includes(u.id)}
                    onCheckedChange={(v) => {
                      setSelectedUsers(prev => v ? [...prev, u.id] : prev.filter(id => id !== u.id));
                    }}
                  />
                  <span className="text-sm">{u.name}</span>
                  <span className="text-xs text-muted-foreground">({u.email})</span>
                </div>
              ))}
            </div>
          </div>

          {can("non_po", "canCreate") && (
            <Button className="w-full" onClick={handleSubmit} disabled={createForm.isPending} data-testid="button-create-form">
              {createForm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Create & Send Form
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-sm font-semibold">Form Preview</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 p-4 border rounded-md bg-muted/20">
            <h4 className="font-semibold">{formName || "Untitled Form"}</h4>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
            <div className="space-y-3 pt-2">
              {fields.filter(f => f.visible).map(f => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">
                    {f.label} {f.required && <span className="text-destructive">*</span>}
                  </Label>
                  <Input disabled placeholder={`Enter ${f.label.toLowerCase()}...`} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AssignedTab() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["/api/non-po/submissions"],
    queryFn: () => apiGet<any[]>("/api/non-po/submissions"),
    staleTime: 0,
  });

  const nudgeMutation = useMutation({
    mutationFn: (assignmentId: number) => apiPost(`/api/non-po/assignments/${assignmentId}/nudge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/submissions"] });
      toast({ title: "Nudge sent", description: "Business user has been notified." });
    },
    onError: (err: any) => toast({ title: "Failed to nudge", description: err.message, variant: "destructive" }),
  });

  // Assigned but not yet submitted by business user
  const pending = (submissions as any[]).filter((s: any) =>
    !s.hasSubmission && s.assignmentStatus !== "Returned" && s.assignmentStatus !== "Submitted"
  );

  const filtered = pending.filter((s: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.formName?.toLowerCase().includes(q) ||
      s.submittedByName?.toLowerCase().includes(q) ||
      s.formDescription?.toLowerCase().includes(q)
    );
  });

  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  if (isLoading) return (
    <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search form or user..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} awaiting submission</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle className="h-10 w-10 text-green-400/60 mb-3" />
          <p className="text-sm font-medium">All assigned forms have been submitted</p>
          <p className="text-xs text-muted-foreground mt-1">Check the Responses tab for submitted forms</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 text-xs">
                  <TableHead className="text-xs">Form Name</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Assigned To</TableHead>
                  <TableHead className="text-xs">Due Date</TableHead>
                  <TableHead className="text-xs text-center">Priority</TableHead>
                  <TableHead className="text-xs text-center">Nudges</TableHead>
                  {can("non_po", "canEdit") && <TableHead className="text-xs text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s: any) => (
                  <TableRow key={s.assignmentId} className="hover:bg-muted/30">
                    <TableCell className="text-xs font-medium">{s.formName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{s.formDescription || "—"}</TableCell>
                    <TableCell className="text-xs font-medium">{s.submittedByName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(s.dueDate)}
                      {s.dueDate && new Date(s.dueDate) < new Date() && (
                        <span className="ml-1.5 text-destructive font-semibold">Overdue</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={s.priority === "High" ? "destructive" : s.priority === "Medium" ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {s.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <span className={`font-mono font-medium ${(s.nudgeCount ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {s.nudgeCount ?? 0}
                      </span>
                    </TableCell>
                    {can("non_po", "canEdit") && (
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => nudgeMutation.mutate(s.assignmentId)}
                          disabled={nudgeMutation.isPending}
                        >
                          <Send className="h-3 w-3 mr-1" />Nudge
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function nonPoStatusBadge(status: string) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    "Responded":  { variant: "secondary", className: "text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700" },
    "Returned":   { variant: "destructive", className: "text-[10px]" },
    "Submitted":  { variant: "secondary", className: "text-[10px] bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-700" },
    "Approved":   { variant: "default", className: "text-[10px] bg-green-600 dark:bg-green-700 text-white border-0" },
    "Assigned":   { variant: "secondary", className: "text-[10px]" },
  };
  const c = config[status] || { variant: "secondary" as const, className: "text-[10px]" };
  return <Badge variant={c.variant} className={c.className}>{status}</Badge>;
}

function ResponsesTab() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Submit for approval
  const [submitModalItem, setSubmitModalItem] = useState<any>(null);
  const [selectedApprovers, setSelectedApprovers] = useState<Set<number>>(new Set());

  // Re-assign (for Returned items)
  const [reassignItem, setReassignItem] = useState<any>(null);
  const [reassignUsers, setReassignUsers] = useState<Set<number>>(new Set());

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["/api/non-po/submissions"],
    queryFn: () => apiGet<any[]>("/api/non-po/submissions"),
    staleTime: 0,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiGet<any[]>("/api/users"),
  });

  const businessUsers = (users as any[]).filter((u: any) => u.roles?.includes("Business User"));
  const financeApprovers = (users as any[]).filter((u: any) =>
    u.roles?.includes("Finance Approver") || u.roles?.includes("Finance Admin")
  );

  const submitForApprovalMutation = useMutation({
    mutationFn: ({ assignmentId, approverIds }: { assignmentId: number; approverIds: number[] }) =>
      apiPost(`/api/non-po/assignments/${assignmentId}/submit-for-approval`, { approverIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/approval-tracker"] });
      setSubmitModalItem(null);
      setSelectedApprovers(new Set());
      toast({ title: "Submitted for Approval", description: "Form sent to Finance Approver." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reassignMutation = useMutation({
    mutationFn: ({ formId, userIds }: { formId: number; userIds: number[] }) =>
      apiPost(`/api/non-po/forms/${formId}/reassign`, { assignedUserIds: userIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/submissions"] });
      setReassignItem(null);
      setReassignUsers(new Set());
      toast({ title: "Re-assigned", description: "Form re-assigned to selected user(s)." });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err?.message || "Failed to re-assign.", variant: "destructive" }),
  });

  const fmtDate = (d: any) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const deriveStatus = (s: any): string => {
    if (s.assignmentStatus === "Returned" || s.returnComments) return "Returned";
    if (s.hasSubmission) return "Responded";
    return s.assignmentStatus || "Assigned";
  };

  // Only show items NOT yet submitted for approval — once submitted they live in Finance Approval Tracker
  const visibleItems = (submissions as any[])
    .filter(s => s.assignmentStatus !== "Submitted" && s.assignmentStatus !== "Approved")
    .map(s => ({ ...s, _status: deriveStatus(s) }));

  const respondedCount = visibleItems.filter(s => s._status === "Responded").length;
  const returnedCount  = visibleItems.filter(s => s._status === "Returned").length;

  const filtered = visibleItems.filter((s: any) => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      s.formName?.toLowerCase().includes(q) ||
      s.submittedByName?.toLowerCase().includes(q) ||
      s.standardFields?.vendorName?.toLowerCase().includes(q) ||
      s.standardFields?.costCenter?.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "responded" && s._status === "Responded") ||
      (statusFilter === "returned"  && s._status === "Returned");
    return matchSearch && matchStatus;
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Submit for Approval dialog ── */}
      <Dialog open={!!submitModalItem} onOpenChange={open => { if (!open) { setSubmitModalItem(null); setSelectedApprovers(new Set()); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              Submit for Approval
            </DialogTitle>
            <DialogDescription>
              Review the submission details and select who should approve it.
            </DialogDescription>
          </DialogHeader>
          {submitModalItem && (
            <div className="space-y-4 py-2">
              {/* Submission summary */}
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Form:</span> <span className="font-medium">{submitModalItem.formName}</span></p>
                <p><span className="text-muted-foreground">Submitted by:</span> {submitModalItem.submittedByName}</p>
                <p><span className="text-muted-foreground">Submitted on:</span> {fmtDate(submitModalItem.submissionDate)}</p>
                {submitModalItem.standardFields?.provisionAmount && (
                  <p><span className="text-muted-foreground">Provision Amount:</span> <span className="font-mono font-semibold">₹{formatAmount(submitModalItem.standardFields.provisionAmount)}</span></p>
                )}
                {submitModalItem.standardFields?.vendorName && (
                  <p><span className="text-muted-foreground">Vendor:</span> {submitModalItem.standardFields.vendorName}</p>
                )}
              </div>

              {/* Approver selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select Approver(s) <span className="text-destructive">*</span></Label>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1.5">
                  {financeApprovers.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-1">No finance approvers available.</p>
                  ) : financeApprovers.map((u: any) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-muted/50">
                      <Checkbox
                        checked={selectedApprovers.has(u.id)}
                        onCheckedChange={(v: boolean | "indeterminate") => {
                          setSelectedApprovers(prev => {
                            const next = new Set(prev);
                            if (v === true) next.add(u.id); else next.delete(u.id);
                            return next;
                          });
                        }}
                      />
                      <span>{u.name}</span>
                      <span className="text-muted-foreground text-xs">({u.roles?.join(", ")})</span>
                    </label>
                  ))}
                </div>
                {selectedApprovers.size > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedApprovers.size} approver(s) selected</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSubmitModalItem(null); setSelectedApprovers(new Set()); }}>Cancel</Button>
            <Button
              onClick={() => submitForApprovalMutation.mutate({
                assignmentId: submitModalItem.assignmentId,
                approverIds: Array.from(selectedApprovers),
              })}
              disabled={selectedApprovers.size === 0 || submitForApprovalMutation.isPending}
            >
              <FileCheck className="h-4 w-4 mr-2" />
              Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Re-assign dialog (for Returned items) ── */}
      <Dialog open={!!reassignItem} onOpenChange={open => { if (!open) { setReassignItem(null); setReassignUsers(new Set()); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-amber-600" />
              Re-assign Form
            </DialogTitle>
            <DialogDescription>
              This form was returned. Re-assign it to the same or a different business user.
            </DialogDescription>
          </DialogHeader>
          {reassignItem?.returnComments && (
            <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-xs">
              <span className="font-semibold text-red-700 dark:text-red-400">Return reason: </span>
              <span className="italic">"{reassignItem.returnComments}"</span>
            </div>
          )}
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Form:</span> <span className="font-medium">{reassignItem?.formName}</span></p>
              {reassignItem?.standardFields?.provisionAmount && (
                <p><span className="text-muted-foreground">Provision Amount:</span> <span className="font-mono font-medium">₹{formatAmount(reassignItem.standardFields.provisionAmount)}</span></p>
              )}
              <p><span className="text-muted-foreground">Previously assigned to:</span> <span className="font-medium">{reassignItem?.submittedByName || reassignItem?.assignedToName}</span></p>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Select New Assignee(s) <span className="text-destructive">*</span></Label>
              {businessUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No business users available.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
                  {businessUsers.map((u: any) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-1 hover:bg-muted/50">
                      <Checkbox
                        checked={reassignUsers.has(u.id)}
                        onCheckedChange={(checked: boolean | "indeterminate") => {
                          setReassignUsers(prev => {
                            const next = new Set(prev);
                            if (checked === true) next.add(u.id); else next.delete(u.id);
                            return next;
                          });
                        }}
                      />
                      <span>{u.name}</span>
                      <span className="text-muted-foreground text-xs">({u.email})</span>
                    </label>
                  ))}
                </div>
              )}
              {reassignUsers.size > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{reassignUsers.size} user(s) selected</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReassignItem(null); setReassignUsers(new Set()); }}>Cancel</Button>
            <Button
              onClick={() => reassignItem && reassignUsers.size > 0 && reassignMutation.mutate({
                formId: reassignItem.formId ?? reassignItem.id,
                userIds: Array.from(reassignUsers),
              })}
              disabled={reassignUsers.size === 0 || reassignMutation.isPending}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Re-assign ({reassignUsers.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search form, vendor, user..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { v: "all",       label: `All (${visibleItems.length})` },
            { v: "responded", label: `Responded (${respondedCount})` },
            { v: "returned",  label: `Returned (${returnedCount})` },
          ].map(({ v, label }) => (
            <Button
              key={v}
              size="sm"
              variant={statusFilter === v ? "default" : "outline"}
              className="text-xs"
              onClick={() => setStatusFilter(v)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">No responses yet</p>
              <p className="text-xs text-muted-foreground mt-1">Business user submissions will appear here</p>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-[1100px]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead className="min-w-[160px] sticky left-0 z-20 bg-background border-r">Form Name</TableHead>
                      <TableHead className="min-w-[140px]">Vendor</TableHead>
                      <TableHead className="min-w-[130px]">Service Description</TableHead>
                      <TableHead className="text-right min-w-[110px] bg-primary/10">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="italic cursor-help font-semibold">Provision Amt</span>
                          </TooltipTrigger>
                          <TooltipContent>Provision amount submitted by the business user</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="min-w-[72px]">
                        <Tooltip>
                          <TooltipTrigger asChild><span className="cursor-help">GL Acct</span></TooltipTrigger>
                          <TooltipContent>GL Account code</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="min-w-[72px]">
                        <Tooltip>
                          <TooltipTrigger asChild><span className="cursor-help">Cost Ctr</span></TooltipTrigger>
                          <TooltipContent>Cost Center code</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="min-w-[72px]">Priority</TableHead>
                      <TableHead className="min-w-[88px]">Due Date</TableHead>
                      <TableHead className="min-w-[110px]">Assigned To</TableHead>
                      <TableHead className="min-w-[90px]">Response Date</TableHead>
                      <TableHead className="min-w-[88px]">Status</TableHead>
                      <TableHead className="min-w-[200px]">Comments / Return Reason</TableHead>
                      <TableHead className="min-w-[160px] text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((s: any) => {
                      const isReturned  = s._status === "Returned";
                      const isResponded = s._status === "Responded";
                      return (
                        <TableRow
                          key={s.id || s.assignmentId}
                          className={`hover:bg-muted/40 ${isReturned ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}
                        >
                          <TableCell className="text-xs font-semibold sticky left-0 z-10 bg-background border-r max-w-[160px] truncate">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default">{s.formName}</span>
                              </TooltipTrigger>
                              {s.formDescription && (
                                <TooltipContent className="max-w-xs whitespace-pre-wrap">{s.formDescription}</TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate">
                            {s.standardFields?.vendorName || <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell className="text-xs max-w-[130px] truncate">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default">
                                  {s.standardFields?.serviceDescription || <span className="text-muted-foreground/50">—</span>}
                                </span>
                              </TooltipTrigger>
                              {s.standardFields?.serviceDescription && (
                                <TooltipContent className="max-w-xs whitespace-pre-wrap">{s.standardFields.serviceDescription}</TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-semibold bg-primary/5">
                            {s.standardFields?.provisionAmount != null
                              ? formatAmount(s.standardFields.provisionAmount)
                              : <span className="text-muted-foreground/50 italic text-[11px]">—</span>}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {s.standardFields?.glAccount || <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {s.standardFields?.costCenter || <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={s.priority === "High" ? "destructive" : s.priority === "Medium" ? "secondary" : "outline"}
                              className="text-[10px]"
                            >
                              {s.priority || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {s.dueDate ? fmtDate(s.dueDate) : <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell className="text-xs max-w-[110px] truncate">
                            {s.submittedByName || s.assignedToName || <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {s.submissionDate ? fmtDate(s.submissionDate) : <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell>{nonPoStatusBadge(s._status)}</TableCell>
                          <TableCell className="text-xs max-w-[200px]">
                            {isReturned && s.returnComments ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-start gap-1 cursor-help">
                                    <CornerUpLeft className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                                    <span className="truncate italic text-destructive/80">{s.returnComments}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs whitespace-pre-wrap">{s.returnComments}</TooltipContent>
                              </Tooltip>
                            ) : s.submissionComments || s.comments ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="truncate italic text-muted-foreground cursor-help">
                                    {s.submissionComments || s.comments}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs whitespace-pre-wrap">
                                  {s.submissionComments || s.comments}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isReturned ? (
                              can("non_po", "canCreate") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                  onClick={() => { setReassignItem(s); setReassignUsers(new Set()); }}
                                >
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Re-assign
                                </Button>
                              )
                            ) : isResponded ? (
                              can("non_po", "canEdit") && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setSubmitModalItem(s)}
                                >
                                  <FileCheck className="h-3 w-3 mr-1" />
                                  Send for Approval
                                </Button>
                              )
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function NonPoPage() {
  const { data: submissions = [] } = useQuery({
    queryKey: ["/api/non-po/submissions"],
    queryFn: () => apiGet<any[]>("/api/non-po/submissions"),
    staleTime: 30_000,
  });

  const assignedCount = (submissions as any[]).filter((s: any) =>
    !s.hasSubmission && s.assignmentStatus !== "Returned" && s.assignmentStatus !== "Submitted"
  ).length;

  const respondedCount = (submissions as any[]).filter((s: any) =>
    s.hasSubmission &&
    s.assignmentStatus !== "Submitted" &&
    s.assignmentStatus !== "Approved"
  ).length;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Non-PO Accruals</h1>
        <p className="text-sm text-muted-foreground mt-1">Create and send ad-hoc accrual forms to business users</p>
      </div>

      <Tabs defaultValue="create">
        <TabsList className="h-9 inline-flex items-center gap-0.5 rounded-lg bg-muted p-1">
          <TabsTrigger value="create" className="rounded-md px-4 text-sm data-[state=active]:shadow-sm">
            Create Form
          </TabsTrigger>
          <TabsTrigger value="assigned" className="rounded-md px-4 text-sm data-[state=active]:shadow-sm">
            Assigned
            {assignedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[11px] font-medium leading-none">
                {assignedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="responses" className="rounded-md px-4 text-sm data-[state=active]:shadow-sm">
            Responses
            {respondedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-green-500/20 text-green-700 dark:text-green-400 px-1.5 py-0.5 text-[11px] font-medium leading-none">
                {respondedCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="create" className="mt-4">
          <FormBuilder />
        </TabsContent>
        <TabsContent value="assigned" className="mt-4">
          <AssignedTab />
        </TabsContent>
        <TabsContent value="responses" className="mt-4">
          <ResponsesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
