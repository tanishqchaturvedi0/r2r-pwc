import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Search, Bell, Check, X, Clock, CheckCircle, XCircle, AlertTriangle, Send, Activity, FileText, Undo2, CornerUpLeft } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

function formatAmount(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    "Pending": "secondary",
    "Approved": "default",
    "Rejected": "destructive",
    "Submitted": "secondary",
    "Assigned": "secondary",
    "Responded": "default",
    "Reviewed": "default",
    "Not Assigned": "outline",
    "Recalled": "outline",
    "Returned": "destructive",
  };
  const variant = map[status] || "secondary";
  const Icon = status === "Pending" || status === "Submitted" || status === "Assigned" ? Clock
    : status === "Approved" || status === "Responded" || status === "Reviewed" ? CheckCircle
    : status === "Rejected" ? XCircle
    : status === "Recalled" ? Undo2
    : status === "Returned" ? CornerUpLeft : Clock;
  return (
    <Badge variant={variant} data-testid={`badge-status-${status.toLowerCase().replace(/\s+/g, "-")}`}>
      <Icon className="h-3 w-3 mr-1" />
      {status}
    </Badge>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""} ${!value && value !== 0 ? "text-muted-foreground italic" : ""}`}>
        {value != null && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{label}</p>;
}

function PeriodDetailSheet({ item, open, onClose }: { item: any; open: boolean; onClose: () => void }) {
  if (!item) return null;
  const fmtDT = (d: any) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const fmt = (n: any) => n != null ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n) : null;
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="font-mono text-base">{item.poNumber} / Line {item.poLineItem}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <span>{item.vendorName}</span>
            <StatusBadge status={item.status} />
            {item.lineStatus && item.lineStatus !== item.status && (
              <span className="text-[10px] text-muted-foreground">Line: {item.lineStatus}</span>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 mt-3">
          {/* PO Line */}
          <div>
            <SectionTitle label="PO Line Details" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="PO Number" value={item.poNumber} mono />
              <DetailField label="Line Item" value={item.poLineItem} mono />
              <DetailField label="Net Amount" value={fmt(item.netAmount)} mono />
              <DetailField label="Doc Type" value={item.docType} mono />
              <DetailField label="GL Account" value={item.glAccount} mono />
              <DetailField label="Cost Center" value={item.costCenter} mono />
              <DetailField label="Profit Center" value={item.profitCenter} mono />
              <DetailField label="Plant" value={item.plant} mono />
              <DetailField label="WBS Element" value={item.wbsElement} mono />
              <DetailField label="Project Name" value={item.projectName} />
              <DetailField label="PR Number" value={item.prNumber} mono />
              <DetailField label="PR Owner ID" value={item.prOwnerId} mono />
              <DetailField label="CC Owner ID" value={item.costCenterOwnerId} mono />
              <DetailField label="Document Date" value={item.documentDate} />
              <DetailField label="Start Date" value={item.startDate} />
              <DetailField label="End Date" value={item.endDate} />
              <DetailField label="Category" value={item.category} />
              <DetailField label="Processing Month" value={item.processingMonth} />
              <div className="col-span-2"><DetailField label="Description" value={item.itemDescription} /></div>
            </div>
          </div>
          <Separator />
          {/* Submission */}
          <div>
            <SectionTitle label="Submission" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="Submitted By" value={item.submittedByName} />
              <DetailField label="Email" value={item.submittedByEmail} />
              <DetailField label="Submitted At" value={fmtDT(item.submittedAt)} />
              <DetailField label="Nudge Count" value={item.nudgeCount ?? 0} />
              {item.lastNudgeAt && <DetailField label="Last Nudge At" value={fmtDT(item.lastNudgeAt)} />}
              <div className="col-span-2">
                <DetailField label="Approvers" value={item.approverNames?.join(", ") || "—"} />
              </div>
            </div>
          </div>
          {(item.status === "Approved" || item.status === "Rejected") && (
            <>
              <Separator />
              <div>
                <SectionTitle label="Decision" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailField label="Decision" value={item.status} />
                  <DetailField label="Decided By" value={item.approvedByName} />
                  <DetailField label="Decided At" value={fmtDT(item.decidedAt)} />
                  {item.rejectionReason && (
                    <div className="col-span-2">
                      <DetailField label="Rejection Reason" value={item.rejectionReason} />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActivityDetailSheet({ item, open, onClose }: { item: any; open: boolean; onClose: () => void }) {
  if (!item) return null;
  const fmtDT = (d: any) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const fmtD = (d: any) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;
  const fmt = (n: any) => n != null ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n) : null;
  const completionColor = item.completionStatus === "Completed" ? "text-green-600 dark:text-green-400"
    : item.completionStatus === "In Progress" ? "text-blue-600 dark:text-blue-400"
    : item.completionStatus === "Discontinue" ? "text-red-600 dark:text-red-400"
    : "text-muted-foreground";
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="font-mono text-base">{item.poNumber} / Line {item.poLineItem}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">{item.vendorName}</span>
            <StatusBadge status={item.status || (item.hasResponse ? "Responded" : "Assigned")} />
            {item.isPrimary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
            {item.category && <Badge variant="outline" className="text-[10px]">{item.category}</Badge>}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-3">
          {/* Business User Response — shown at the TOP so Finance Approver sees it immediately */}
          {item.hasResponse && (
            <>
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Business User Response
                </p>
                {/* Primary response metrics */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-white dark:bg-background rounded-md p-2.5 border border-blue-100 dark:border-blue-900 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Completion</p>
                    <p className={`text-sm font-bold ${completionColor}`}>{item.completionStatus || "—"}</p>
                  </div>
                  <div className="bg-white dark:bg-background rounded-md p-2.5 border border-blue-100 dark:border-blue-900 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Provision Amt</p>
                    <p className="text-sm font-bold font-mono">₹{fmt(item.provisionAmount) ?? "—"}</p>
                  </div>
                  <div className="bg-white dark:bg-background rounded-md p-2.5 border border-blue-100 dark:border-blue-900 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">% of PO</p>
                    <p className="text-sm font-bold">{item.provisionPercent != null ? `${item.provisionPercent}%` : "—"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <DetailField label="Response Date" value={fmtDT(item.responseDate)} />
                  <DetailField label="Nudge Count" value={item.nudgeCount ?? 0} />
                  {item.comments && (
                    <div className="col-span-2 pt-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Comments from Business User</p>
                      <p className="text-sm bg-white dark:bg-background rounded p-2 border border-blue-100 dark:border-blue-900 italic">"{item.comments}"</p>
                    </div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Returned-to-Finance banner */}
          {item.status === "Returned" && (
            <>
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5 mb-1">
                  <CornerUpLeft className="h-3.5 w-3.5" />
                  Returned to Finance by Business User
                </p>
                {item.returnedAt && (
                  <p className="text-xs text-red-600 dark:text-red-400/80">On {fmtDT(item.returnedAt)}</p>
                )}
                {item.returnComments && (
                  <p className="text-xs mt-2 italic text-red-700 dark:text-red-300">"{item.returnComments}"</p>
                )}
              </div>
              <Separator />
            </>
          )}

          {/* Awaiting response state */}
          {!item.hasResponse && item.status !== "Returned" && (
            <>
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">Awaiting Business User Response</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                  <DetailField label="Nudge Count" value={item.nudgeCount ?? 0} />
                  <DetailField label="Last Nudge" value={item.lastNudgeAt ? fmtDT(item.lastNudgeAt) : "Not nudged yet"} />
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* PO Line — all fields */}
          <div>
            <SectionTitle label="PO Line Details" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="PO Number" value={item.poNumber} mono />
              <DetailField label="Line Item" value={item.poLineItem} mono />
              <DetailField label="Net Amount" value={fmt(item.netAmount)} mono />
              <DetailField label="Doc Type" value={item.docType} mono />
              <DetailField label="Document Date" value={item.documentDate} />
              <DetailField label="GL Account" value={item.glAccount} mono />
              <DetailField label="Cost Center" value={item.costCenter} mono />
              <DetailField label="Cost Center Owner" value={item.costCenterOwnerId} mono />
              <DetailField label="Profit Center" value={item.profitCenter} mono />
              <DetailField label="Plant" value={item.plant} mono />
              <DetailField label="WBS Element" value={item.wbsElement} mono />
              <DetailField label="Project Name" value={item.projectName} />
              <DetailField label="PR Number" value={item.prNumber} mono />
              <DetailField label="PR Owner" value={item.prOwnerId} mono />
              <DetailField label="Start Date" value={item.startDate} />
              <DetailField label="End Date" value={item.endDate} />
              <div className="col-span-2"><DetailField label="Item Description" value={item.itemDescription} /></div>
            </div>
          </div>
          <Separator />

          {/* Assignment */}
          <div>
            <SectionTitle label="Assignment Details" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="Assigned To" value={item.assignedToName} />
              <DetailField label="Email" value={item.assignedToEmail} />
              <DetailField label="Assigned Date" value={fmtD(item.assignedDate)} />
              <DetailField label="Is Primary" value={item.isPrimary ? "Yes" : "No"} />
            </div>
          </div>
          <Separator />

          {/* Finance Review */}
          <div>
            <SectionTitle label="Finance Review" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="Review Status" value={item.status || (item.hasResponse ? "Responded" : "Assigned")} />
              <DetailField label="Finance True-Up" value={item.financeTrueUp != null ? fmt(item.financeTrueUp) : null} mono />
              <div className="col-span-2"><DetailField label="Finance Remarks" value={item.financeRemarks} /></div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NonPoDetailSheet({ item, open, onClose }: { item: any; open: boolean; onClose: () => void }) {
  if (!item) return null;
  const standardFields = item.standardFields || {};
  const customFields = item.customFields || {};
  const fmtDT = (d: any) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const fmtD = (d: any) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;
  const fieldLabels: Record<string, string> = {
    vendorName: "Vendor Name", serviceDescription: "Service Description",
    provisionAmount: "Provision Amount", glAccount: "GL Account",
    costCenter: "Cost Center", profitCenter: "Profit Center", plant: "Plant",
    description: "Description", itemDescription: "Item Description",
    amount: "Amount", wbsElement: "WBS Element", projectName: "Project Name",
    prNumber: "PR Number", currency: "Currency", paymentTerms: "Payment Terms",
  };
  const monoFields = new Set(["glAccount","costCenter","profitCenter","plant","provisionAmount","amount","wbsElement","prNumber","currency"]);
  const wideFields = new Set(["serviceDescription","description","itemDescription","comments","remark","remarks"]);
  const hasCustom = Object.keys(customFields).length > 0;
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">{item.formName}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <span>by {item.submittedByName}</span>
            <StatusBadge status={item.status || "Submitted"} />
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 mt-3">
          {/* Form Info */}
          <div>
            <SectionTitle label="Form Details" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="Form Name" value={item.formName} />
              <DetailField label="Priority" value={item.priority} />
              <DetailField label="Due Date" value={item.dueDate ? fmtD(item.dueDate) : item.dueDate} />
              <div className="col-span-2"><DetailField label="Description" value={item.formDescription} /></div>
            </div>
          </div>
          <Separator />
          {/* Submission */}
          <div>
            <SectionTitle label="Submission" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="Submitted By" value={item.submittedByName} />
              <DetailField label="Email" value={item.submittedByEmail} />
              <DetailField label="Submission Date" value={fmtDT(item.submissionDate)} />
              <DetailField label="Status" value={item.status || "Submitted"} />
            </div>
          </div>
          <Separator />
          {/* Standard Fields */}
          <div>
            <SectionTitle label="Form Fields" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {Object.entries(standardFields).map(([key, val]) => (
                <div key={key} className={wideFields.has(key) ? "col-span-2" : ""}>
                  <DetailField
                    label={fieldLabels[key] || key.replace(/([A-Z])/g, " $1").trim()}
                    value={val != null ? String(val) : null}
                    mono={monoFields.has(key)}
                  />
                </div>
              ))}
            </div>
          </div>
          {hasCustom && (
            <>
              <Separator />
              <div>
                <SectionTitle label="Custom Fields" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {Object.entries(customFields).map(([key, val]) => (
                    <div key={key} className="col-span-2">
                      <DetailField label={key.replace(/([A-Z])/g, " $1").trim()} value={val != null ? String(val) : null} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {/* Returned-to-Finance banner */}
          {item.assignmentStatus === "Returned" && (
            <>
              <Separator />
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5 mb-1">
                  <CornerUpLeft className="h-3.5 w-3.5" />
                  Returned to Finance by Business User
                </p>
                {item.returnedAt && (
                  <p className="text-xs text-red-600 dark:text-red-400/80">On {fmtDT(item.returnedAt)}</p>
                )}
                {item.returnComments && (
                  <p className="text-xs mt-2 italic text-red-700 dark:text-red-300">"{item.returnComments}"</p>
                )}
              </div>
            </>
          )}
          {/* Nudge info for unsubmitted and not returned */}
          {!item.hasSubmission && item.assignmentStatus !== "Returned" && (
            <>
              <Separator />
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">Awaiting Business User Submission</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                  <DetailField label="Nudge Count" value={item.nudgeCount ?? 0} />
                  <DetailField label="Last Nudge" value={item.lastNudgeAt ? fmtDT(item.lastNudgeAt) : "Not nudged yet"} />
                </div>
              </div>
            </>
          )}
          {/* Finance Review */}
          {item.hasSubmission && (
            <>
              <Separator />
              <div>
                <SectionTitle label="Finance Review" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailField label="Review Status" value={item.status || "Submitted"} />
                  <DetailField label="Reviewed By" value={item.reviewedByName} />
                  <DetailField label="Reviewed At" value={fmtDT(item.reviewedAt)} />
                  <DetailField label="Nudge Count" value={item.nudgeCount ?? 0} />
                  <DetailField label="Last Nudge" value={item.lastNudgeAt ? fmtDT(item.lastNudgeAt) : null} />
                  <DetailField label="Finance True-Up" value={item.financeTrueUp != null ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(item.financeTrueUp) : null} mono />
                  <div className="col-span-2"><DetailField label="Finance Remarks" value={item.financeRemarks} /></div>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PeriodApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { can } = usePermissions();
  const canApprove = can("period_based", "canApprove");
  const [searchQuery, setSearchQuery] = useState("");
  // Default to "pending" so recalled items auto-disappear from view after recall
  const [statusFilter, setStatusFilter] = useState("pending");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [recallDialogItem, setRecallDialogItem] = useState<any>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["/api/approvals/tracker"],
    queryFn: () => apiGet<any[]>("/api/approvals/tracker"),
  });

  const nudgeMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/api/approvals/${id}/nudge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/tracker"] });
      toast({ title: "Nudge sent", description: "Approver has been notified." });
    },
    onError: (err: Error) => toast({ title: "Failed to nudge", description: err.message, variant: "destructive" }),
  });

  const recallMutation = useMutation({
    mutationFn: (id: number) => apiPost<{ success: boolean; poLineId: number }>(`/api/approvals/${id}/recall`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/tracker"] });
      queryClient.invalidateQueries({ queryKey: ["/api/period-based"] });
      toast({ title: "Recalled", description: "Submission recalled and returned to Period-Based list." });
      setRecallDialogItem(null);
    },
    onError: (err: Error) => toast({ title: "Failed to recall", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiPut(`/api/approvals/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/tracker"] });
      toast({ title: "Approved", description: "Approval has been recorded." });
    },
    onError: (err: Error) => toast({ title: "Failed to approve", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => apiPut(`/api/approvals/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/tracker"] });
      setRejectDialogOpen(false);
      setRejectingId(null);
      setRejectionReason("");
      toast({ title: "Rejected", description: "Rejection has been recorded." });
    },
    onError: (err: Error) => toast({ title: "Failed to reject", description: err.message, variant: "destructive" }),
  });

  const filtered = items.filter((item: any) => {
    // When searching, expand beyond the status filter so search works across all statuses
    const effectiveStatusFilter = searchQuery ? "all" : statusFilter;
    if (effectiveStatusFilter !== "all" && (item.status || "").toLowerCase() !== effectiveStatusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !item.poNumber?.toLowerCase().includes(q) &&
        !item.vendorName?.toLowerCase().includes(q) &&
        !item.submittedByName?.toLowerCase().includes(q) &&
        !item.costCenter?.toLowerCase().includes(q) &&
        !item.glAccount?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by PO, vendor, user, CC..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-period-approvals" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter-period">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="recalled">Recalled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Line Item</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Cost Center</TableHead>
                <TableHead>Approvers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8" />
                      <p className="text-sm" data-testid="text-no-period-approvals">No period-based approval submissions found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.map((item: any) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() => setSelectedItem(item)}
                  data-testid={`row-period-approval-${item.id}`}
                >
                  <TableCell className="font-mono text-xs font-medium">{item.poNumber}</TableCell>
                  <TableCell className="text-xs">{item.poLineItem}</TableCell>
                  <TableCell className="text-xs">{item.vendorName}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatAmount(item.netAmount)}</TableCell>
                  <TableCell className="text-xs font-mono">{item.costCenter}</TableCell>
                  <TableCell className="text-xs">{item.approverNames?.length > 0 ? item.approverNames.join(", ") : "-"}</TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell className="text-xs">{formatDate(item.submittedAt)}</TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 flex-wrap">
                      {item.status === "Pending" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => nudgeMutation.mutate(item.id)} disabled={nudgeMutation.isPending} data-testid={`button-nudge-${item.id}`}>
                            <Bell className="h-3 w-3 mr-1" />
                            Nudge
                            {item.nudgeCount > 0 && <Badge variant="secondary" className="ml-1 no-default-active-elevate">{item.nudgeCount}</Badge>}
                          </Button>
                          {canApprove && (
                            <>
                              <Button size="icon" variant="ghost" className="text-green-600 dark:text-green-400" onClick={() => approveMutation.mutate(item.id)} disabled={approveMutation.isPending} data-testid={`button-approve-${item.id}`}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { setRejectingId(item.id); setRejectionReason(""); setRejectDialogOpen(true); }} disabled={rejectMutation.isPending} data-testid={`button-reject-${item.id}`}>
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button size="icon" variant="ghost" className="text-orange-500 dark:text-orange-400" title="Recall submission" onClick={() => setRecallDialogItem(item)} disabled={recallMutation.isPending} data-testid={`button-recall-${item.id}`}>
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {item.status === "Rejected" && item.rejectionReason && (
                        <span className="text-xs text-muted-foreground italic truncate max-w-[120px]" title={item.rejectionReason}>{item.rejectionReason}</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Card>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Approval</DialogTitle>
          </DialogHeader>
          <Textarea placeholder="Enter rejection reason..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} data-testid="textarea-rejection-reason" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)} data-testid="button-cancel-reject">Cancel</Button>
            <Button variant="destructive" onClick={() => rejectingId !== null && rejectMutation.mutate({ id: rejectingId, reason: rejectionReason })} disabled={rejectMutation.isPending || !rejectionReason.trim()} data-testid="button-confirm-reject">Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PeriodDetailSheet item={selectedItem} open={!!selectedItem} onClose={() => setSelectedItem(null)} />

      {/* Recall dialog */}
      <Dialog open={!!recallDialogItem} onOpenChange={open => { if (!open) setRecallDialogItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recall Submission</DialogTitle>
            <DialogDescription>
              Recalling will remove this item from the approval queue and return it to the Period-Based accrual list. An edit will be required before resubmitting.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-1 py-2">
            <p><span className="text-muted-foreground">PO Number:</span> <strong>{recallDialogItem?.poNumber}</strong></p>
            <p><span className="text-muted-foreground">Vendor:</span> {recallDialogItem?.vendorName}</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setRecallDialogItem(null)}>Cancel</Button>
            <Button
              variant="outline"
              className="border-orange-400 text-orange-600 hover:bg-orange-50"
              disabled={recallMutation.isPending}
              onClick={() => recallMutation.mutate(recallDialogItem.id)}
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Recall — Edit Later
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              disabled={recallMutation.isPending}
              onClick={async () => {
                // Capture values before async (recallDialogItem cleared by onSuccess)
                const id = recallDialogItem?.id;
                const poLineId = recallDialogItem?.poLineId;
                if (!id) return;
                await recallMutation.mutateAsync(id);
                // Navigate with poLineId so period-based can highlight the item
                navigate(`/period-based?recalled=${poLineId}`);
              }}
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Recall — Edit Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActivityApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { can } = usePermissions();
  const canApprove = can("activity_based", "canApprove");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [recallDialogItem, setRecallDialogItem] = useState<any>(null);

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ["/api/activity-based/approval-tracker"],
    queryFn: () => apiGet<any[]>("/api/activity-based/approval-tracker"),
    staleTime: 0,
  });

  const nudgeMutation = useMutation({
    mutationFn: (assignmentId: number) => apiPost(`/api/activity-based/${assignmentId}/nudge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/approval-tracker"] });
      toast({ title: "Nudge sent", description: "Business user has been notified." });
    },
    onError: (err: Error) => toast({ title: "Failed to nudge", description: err.message, variant: "destructive" }),
  });

  const recallMutation = useMutation({
    mutationFn: (assignmentId: number) => apiPost<{ success: boolean; poLineId: number; fullyRecalled: boolean }>(`/api/activity-based/${assignmentId}/recall`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/approval-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
      const desc = data.fullyRecalled
        ? "Assignment recalled. PO line returned to Activity-Based list."
        : "Assignment recalled. PO line has other active assignees and remains in the tracker.";
      toast({ title: "Recalled", description: desc });
      setRecallDialogItem(null);
    },
    onError: (err: Error) => toast({ title: "Failed to recall", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (assignmentId: number) => apiPut(`/api/activity-based/${assignmentId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/approval-tracker"] });
      toast({ title: "Approved", description: "Response approved successfully." });
    },
    onError: (err: Error) => toast({ title: "Failed to approve", description: err.message, variant: "destructive" }),
  });

  const filtered = responses.filter((r: any) => {
    const matchesSearch = !searchQuery || (() => {
      const q = searchQuery.toLowerCase();
      return (
        r.poNumber?.toLowerCase().includes(q) ||
        r.vendorName?.toLowerCase().includes(q) ||
        r.assignedToName?.toLowerCase().includes(q) ||
        r.costCenter?.toLowerCase().includes(q) ||
        r.glAccount?.toLowerCase().includes(q) ||
        r.poLineItem?.toString().toLowerCase().includes(q)
      );
    })();
    const effectiveStatusFilter = searchQuery ? "all" : statusFilter;
    const matchesStatus = effectiveStatusFilter === "all" ||
      (effectiveStatusFilter === "pending" && r.status === "Pending") ||
      (effectiveStatusFilter === "responded" && r.hasResponse && r.status !== "Approved") ||
      (effectiveStatusFilter === "approved" && r.status === "Approved");
    return matchesSearch && matchesStatus;
  });

  const pendingCount = responses.filter((r: any) => r.status === "Pending" && !r.hasResponse).length;
  const respondedCount = responses.filter((r: any) => r.hasResponse && r.status !== "Approved").length;
  const approvedCount = responses.filter((r: any) => r.status === "Approved").length;
  const returnedCount = 0;

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {responses.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pending Review</p>
            <p className="text-2xl font-bold text-amber-600">{respondedCount}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Approved</p>
            <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Submitted</p>
            <p className="text-2xl font-bold">{responses.length}</p>
          </Card>
        </div>
      )}
      {responses.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground italic">No items submitted for approval yet. Finance Admin submits responded items from the Activity-Based accruals page.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by PO, vendor, user, CC..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-activity-approvals" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="responded">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Net Amount</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Assigned Date</TableHead>
                <TableHead>Completion / Return</TableHead>
                <TableHead className="text-right">Provision Amt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Activity className="h-8 w-8" />
                      <p className="text-sm" data-testid="text-no-activity-approvals">No activity-based assignments found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.map((r: any) => (
                <TableRow
                  key={r.assignmentId}
                  className={`cursor-pointer hover:bg-accent/40 ${r.status === "Returned" ? "bg-red-50/40 dark:bg-red-950/10" : !r.hasResponse ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
                  onClick={() => setSelectedItem(r)}
                  data-testid={`row-activity-approval-${r.assignmentId}`}
                >
                  <TableCell className="font-mono text-xs font-medium">{r.poNumber}</TableCell>
                  <TableCell className="text-xs">{r.vendorName}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatAmount(r.netAmount)}</TableCell>
                  <TableCell className="text-xs">{r.assignedToName || "-"}</TableCell>
                  <TableCell className="text-xs">{r.assignedDate ? new Date(r.assignedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"}</TableCell>
                  <TableCell className="text-xs max-w-[160px]">
                    {r.status === "Returned" ? (
                      <span className="flex items-start gap-1 text-red-600">
                        <CornerUpLeft className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="truncate italic">{r.returnComments || "Returned"}</span>
                      </span>
                    ) : r.hasResponse ? r.completionStatus : <span className="text-amber-600 font-medium text-[11px]">Awaiting</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">{r.provisionAmount != null ? formatAmount(r.provisionAmount) : "-"}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status === "Returned" ? "Returned" : r.hasResponse ? (r.status || "Responded") : "Assigned"} />
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 flex-wrap">
                      {/* Nudge: only for not-yet-responded */}
                      {canApprove && !r.hasResponse && (
                        <Button size="sm" variant="outline" onClick={() => nudgeMutation.mutate(r.assignmentId)} disabled={nudgeMutation.isPending} data-testid={`button-nudge-activity-${r.assignmentId}`}>
                          <Bell className="h-3 w-3 mr-1" />
                          Nudge
                          {r.nudgeCount > 0 && <Badge variant="secondary" className="ml-1">{r.nudgeCount}</Badge>}
                        </Button>
                      )}
                      {/* Recall: for any non-approved item */}
                      {canApprove && r.status !== "Approved" && (
                        <Button size="icon" variant="ghost" className="text-orange-500 dark:text-orange-400" title="Recall assignment" onClick={() => setRecallDialogItem(r)} disabled={recallMutation.isPending} data-testid={`button-recall-activity-${r.assignmentId}`}>
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Approve: only for responded-but-not-approved */}
                      {canApprove && r.hasResponse && r.status !== "Approved" && (
                        <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(r.assignmentId)} disabled={approveMutation.isPending} data-testid={`button-approve-activity-${r.assignmentId}`}>
                          <Check className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                      )}
                      {r.status === "Approved" && (
                        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />Approved
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Card>

      <ActivityDetailSheet item={selectedItem} open={!!selectedItem} onClose={() => setSelectedItem(null)} />

      {/* Activity Recall dialog */}
      <Dialog open={!!recallDialogItem} onOpenChange={open => { if (!open) setRecallDialogItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recall Assignment</DialogTitle>
            <DialogDescription>
              Recalling will remove this assignment and return the PO line to the Activity-Based list. A new assignment or edit will be required before it can be reassigned.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-1 py-2">
            <p><span className="text-muted-foreground">PO Number:</span> <strong>{recallDialogItem?.poNumber}</strong></p>
            <p><span className="text-muted-foreground">Assigned to:</span> {recallDialogItem?.assignedToName || "-"}</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setRecallDialogItem(null)}>Cancel</Button>
            <Button
              variant="outline"
              className="border-orange-400 text-orange-600 hover:bg-orange-50"
              disabled={recallMutation.isPending}
              onClick={() => {
                const assignmentId = recallDialogItem?.assignmentId;
                if (assignmentId) recallMutation.mutate(assignmentId);
              }}
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Recall — Edit Later
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              disabled={recallMutation.isPending}
              onClick={async () => {
                // Capture before async (recallDialogItem cleared by onSuccess)
                const assignmentId = recallDialogItem?.assignmentId;
                const poLineId = recallDialogItem?.poLineId;
                if (!assignmentId) return;
                const result = await recallMutation.mutateAsync(assignmentId);
                // Only navigate to the activity-based list if the PO line was fully recalled
                // (i.e., no other active assignees remain). Otherwise it stays in the tracker.
                if (result?.fullyRecalled) {
                  navigate(`/activity-based?recalled=${poLineId}`);
                }
              }}
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Recall — Edit Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NonPoApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canReview = can("non_po", "canApprove");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Only show items Finance Admin has explicitly submitted for approval
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["/api/non-po/approval-tracker"],
    queryFn: () => apiGet<any[]>("/api/non-po/approval-tracker"),
    staleTime: 0,
  });

  const nudgeMutation = useMutation({
    mutationFn: (assignmentId: number) => apiPost(`/api/non-po/assignments/${assignmentId}/nudge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/approval-tracker"] });
      toast({ title: "Nudge sent", description: "Business user has been notified." });
    },
    onError: (err: Error) => toast({ title: "Failed to nudge", description: err.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiPut(`/api/non-po/submissions/${id}/review`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/approval-tracker"] });
      toast({ title: "Reviewed", description: "Submission reviewed successfully." });
    },
    onError: (err: Error) => toast({ title: "Failed to review", description: err.message, variant: "destructive" }),
  });

  const filtered = submissions.filter((s: any) => {
    const matchesSearch = !searchQuery || (() => {
      const q = searchQuery.toLowerCase();
      return (
        s.formName?.toLowerCase().includes(q) ||
        s.submittedByName?.toLowerCase().includes(q) ||
        s.formDescription?.toLowerCase().includes(q) ||
        s.priority?.toLowerCase().includes(q)
      );
    })();
    const effectiveStatusFilter = searchQuery ? "all" : statusFilter;
    const matchesStatus = effectiveStatusFilter === "all" ||
      (effectiveStatusFilter === "submitted" && s.status === "Submitted") ||
      (effectiveStatusFilter === "approved" && s.status === "Approved") ||
      (effectiveStatusFilter === "rejected" && s.status === "Rejected");
    return matchesSearch && matchesStatus;
  });

  const pendingCount = 0;
  const submittedCount = submissions.filter((s: any) => s.status === "Submitted").length;
  const approvedCount = submissions.filter((s: any) => s.status === "Approved").length;
  const returnedCount = 0;

  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {submissions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pending Review</p>
            <p className="text-2xl font-bold text-blue-600">{submittedCount}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Approved</p>
            <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Submitted</p>
            <p className="text-2xl font-bold">{submissions.length}</p>
          </Card>
        </div>
      )}
      {submissions.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground italic">No items submitted for approval yet. Finance Admin submits responded forms from the Non-PO accruals page.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by form name or user..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-nonpo-approvals" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="submitted">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form Name</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Submission Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p className="text-sm" data-testid="text-no-nonpo-approvals">No Non-PO forms found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.map((s: any) => {
                const fields = s.standardFields || {};
                const rowKey = s.id ?? `assign-${s.assignmentId}`;
                return (
                  <TableRow
                    key={rowKey}
                    className={`cursor-pointer hover:bg-accent/40 ${s.assignmentStatus === "Returned" ? "bg-red-50/40 dark:bg-red-950/10" : !s.hasSubmission ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
                    onClick={() => setSelectedItem(s)}
                    data-testid={`row-nonpo-approval-${rowKey}`}
                  >
                    <TableCell className="text-xs font-medium">{s.formName}</TableCell>
                    <TableCell className="text-xs">{s.submittedByName}</TableCell>
                    <TableCell className="text-xs">{s.dueDate ? fmtDate(s.dueDate) : "-"}</TableCell>
                    <TableCell>
                      {s.priority && (
                        <Badge variant={s.priority === "High" ? "destructive" : s.priority === "Medium" ? "secondary" : "outline"} className="text-[10px]">
                          {s.priority}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-[140px]">
                      {s.assignmentStatus === "Returned" ? (
                        <span className="flex items-start gap-1 text-red-600">
                          <CornerUpLeft className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="truncate italic">{s.returnComments || "Returned"}</span>
                        </span>
                      ) : s.hasSubmission ? fmtDate(s.submissionDate) : <span className="text-amber-600 font-medium text-[11px]">Awaiting</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {s.hasSubmission ? formatAmount(fields.provisionAmount || fields.amount) : "-"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.assignmentStatus === "Returned" ? "Returned" : s.status} />
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {/* Nudge: only for not-yet-submitted and not returned */}
                        {canReview && !s.hasSubmission && s.assignmentId && s.assignmentStatus !== "Returned" && (
                          <Button size="sm" variant="outline" onClick={() => nudgeMutation.mutate(s.assignmentId)} disabled={nudgeMutation.isPending} data-testid={`button-nudge-nonpo-${s.assignmentId}`}>
                            <Bell className="h-3 w-3 mr-1" />
                            Nudge
                            {s.nudgeCount > 0 && <Badge variant="secondary" className="ml-1">{s.nudgeCount}</Badge>}
                          </Button>
                        )}
                        {/* Approve/Reject: only for submitted */}
                        {canReview && s.hasSubmission && s.status === "Submitted" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => reviewMutation.mutate({ id: s.id, status: "Approved" })} disabled={reviewMutation.isPending} data-testid={`button-approve-nonpo-${s.id}`}>
                              <Check className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive" onClick={() => reviewMutation.mutate({ id: s.id, status: "Rejected" })} disabled={reviewMutation.isPending} data-testid={`button-reject-nonpo-${s.id}`}>
                              <X className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        {s.assignmentStatus === "Returned" && (
                          <span className="text-xs font-medium flex items-center gap-1 text-red-600">
                            <CornerUpLeft className="h-3 w-3" />
                            Returned
                          </span>
                        )}
                        {s.hasSubmission && s.status !== "Submitted" && (
                          <span className={`text-xs font-medium flex items-center gap-1 ${s.status === "Approved" ? "text-green-600" : "text-destructive"}`}>
                            {s.status === "Approved" ? <CheckCircle className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            {s.status}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Card>

      <NonPoDetailSheet item={selectedItem} open={!!selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

export default function ApprovalTrackerPage() {
  const [activeTab, setActiveTab] = useState("period");

  const { data: periodItems = [] } = useQuery({
    queryKey: ["/api/approvals/tracker"],
    queryFn: () => apiGet<any[]>("/api/approvals/tracker"),
  });
  const { data: activityItems = [] } = useQuery({
    queryKey: ["/api/activity-based/approval-tracker"],
    queryFn: () => apiGet<any[]>("/api/activity-based/approval-tracker"),
    staleTime: 0,
  });
  const { data: nonpoItems = [] } = useQuery({
    queryKey: ["/api/non-po/approval-tracker"],
    queryFn: () => apiGet<any[]>("/api/non-po/approval-tracker"),
    staleTime: 0,
  });

  const periodPending = periodItems.filter((i: any) => i.status === "Pending").length;
  const activityPending = activityItems.filter((i: any) => i.status !== "Approved").length;
  const nonpoPending = nonpoItems.filter((i: any) => i.status === "Submitted").length;
  const totalPending = periodPending + activityPending + nonpoPending;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Finance Approval Tracker</h1>
        <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
          Track and manage all approval submissions across Period-Based, Activity-Based, and Non-PO accruals
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-all">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Total Items</span>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-all">{periodItems.length + activityItems.length + nonpoItems.length}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-pending-all">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Pending Review</span>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-all">{totalPending}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-period-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Period-Based</span>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-period-count">{periodItems.length}</div>
            {periodPending > 0 && <p className="text-xs text-muted-foreground">{periodPending} pending</p>}
          </CardContent>
        </Card>
        <Card data-testid="card-activity-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Activity + Non-PO</span>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-activity-nonpo-count">{activityItems.length + nonpoItems.length}</div>
            {(activityPending + nonpoPending) > 0 && <p className="text-xs text-muted-foreground">{activityPending + nonpoPending} pending</p>}
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-approval-type">
          <TabsTrigger value="period" data-testid="tab-period">
            Period-Based
            {periodPending > 0 && <Badge variant="secondary" className="ml-1.5 no-default-active-elevate">{periodPending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            Activity-Based
            {activityPending > 0 && <Badge variant="secondary" className="ml-1.5 no-default-active-elevate">{activityPending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="nonpo" data-testid="tab-nonpo">
            Non-PO
            {nonpoPending > 0 && <Badge variant="secondary" className="ml-1.5 no-default-active-elevate">{nonpoPending}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="period" className="mt-4">
          <PeriodApprovals />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityApprovals />
        </TabsContent>
        <TabsContent value="nonpo" className="mt-4">
          <NonPoApprovals />
        </TabsContent>
      </Tabs>
    </div>
  );
}
