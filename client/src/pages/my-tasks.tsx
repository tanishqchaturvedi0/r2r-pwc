import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Send, Clock, CheckCircle2, AlertTriangle, Loader2, MessageSquare,
  DollarSign, CalendarDays, CornerUpLeft
} from "lucide-react";

function formatAmount(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v);
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "Responded" || s === "Approved") return "default";
  if (s === "Overdue") return "destructive";
  if (s === "Returned") return "destructive";
  if (s === "Assigned") return "secondary";
  return "outline";
}

function completionVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "Completed") return "default";
  if (s === "In Progress") return "secondary";
  if (s === "Discontinue") return "destructive";
  return "outline";
}

function DetailField({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""} ${value == null || value === "" || value === "-" ? "text-muted-foreground italic" : ""}`}>
        {value != null && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function TaskDetailSheet({ task, open, onClose, onRespond, onReturn }: {
  task: any;
  open: boolean;
  onClose: () => void;
  onRespond?: (task: any) => void;
  onReturn?: (task: any) => void;
}) {
  if (!task) return null;
  const isResponded = task.assignmentStatus === "Responded" || task.assignmentStatus === "Approved";
  const isReturned = task.assignmentStatus === "Returned";
  const isPending = !isResponded && !isReturned;
  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;
  const fmtDateTime = (d: any) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="font-mono text-base">
            {task.poNumber} / Line {task.poLineItem}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <span>{task.vendorName}</span>
            <Badge variant={statusVariant(task.assignmentStatus)} className="text-[10px]">
              {task.assignmentStatus}
            </Badge>
            {task.isPrimary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-3">
          {/* PO Info */}
          <div>
            <SectionHeader icon={DollarSign} label="PO Details" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="PO Number" value={task.poNumber} mono />
              <DetailField label="Line Item" value={task.poLineItem} mono />
              <DetailField label="Net Amount" value={formatAmount(task.netAmount)} mono />
              <DetailField label="Doc Type" value={task.docType} mono />
              <DetailField label="GL Account" value={task.glAccount} mono />
              <DetailField label="Cost Center" value={task.costCenter} mono />
              <DetailField label="Profit Center" value={task.profitCenter} mono />
              <DetailField label="Plant" value={task.plant} mono />
              <DetailField label="WBS Element" value={task.wbsElement} mono />
              <DetailField label="Project Name" value={task.projectName} />
              <DetailField label="PR Number" value={task.prNumber} mono />
              <DetailField label="PR Owner ID" value={task.prOwnerId} mono />
              <DetailField label="CC Owner ID" value={task.costCenterOwnerId} mono />
              <DetailField label="Document Date" value={task.documentDate} />
              <DetailField label="Start Date" value={task.startDate} />
              <DetailField label="End Date" value={task.endDate} />
              <div className="col-span-2">
                <DetailField label="Item Description" value={task.itemDescription} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Assignment Info */}
          <div>
            <SectionHeader icon={CalendarDays} label="Assignment" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="Status" value={task.assignmentStatus} />
              <DetailField label="Assigned On" value={fmtDate(task.assignedDate)} />
              <DetailField label="Is Primary" value={task.isPrimary ? "Yes" : "No"} />
            </div>
          </div>

          <Separator />

          {/* Returned-to-Finance banner */}
          {isReturned && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5 mb-1">
                <CornerUpLeft className="h-3.5 w-3.5" />
                Returned to Finance
              </p>
              {task.returnedAt && (
                <p className="text-xs text-red-600 dark:text-red-400/80">
                  On {fmtDateTime(task.returnedAt)}
                </p>
              )}
              {task.returnComments && (
                <p className="text-xs mt-1 text-red-700 dark:text-red-300 italic">"{task.returnComments}"</p>
              )}
            </div>
          )}

          {/* Response Info */}
          <div>
            <SectionHeader icon={isResponded ? CheckCircle2 : MessageSquare} label="Response" />
            {isResponded ? (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailField label="Completion Status" value={task.responseStatus} />
                  <DetailField label="Provision Amount" value={formatAmount(task.provisionAmount)} mono />
                  <DetailField label="Provision %" value={task.provisionPercent != null ? `${task.provisionPercent}%` : null} />
                  <DetailField label="Response Date" value={fmtDateTime(task.responseDate)} />
                  <div className="col-span-2">
                    <DetailField label="Comments" value={task.comments} />
                  </div>
                </div>
                {(task.financeTrueUp != null || task.financeRemarks) && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Finance Adjustments</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <DetailField label="Finance True-Up" value={task.financeTrueUp != null ? formatAmount(task.financeTrueUp) : null} mono />
                      <div className="col-span-2">
                        <DetailField label="Finance Remarks" value={task.financeRemarks} />
                      </div>
                    </div>
                  </>
                )}
                <div className="mt-4 p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <p className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Response submitted — awaiting Finance review
                  </p>
                </div>
              </>
            ) : !isReturned ? (
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Awaiting your response
                </p>
              </div>
            ) : null}
          </div>

          {isPending && (
            <div className="flex gap-2">
              {onRespond && (
                <Button className="flex-1" onClick={() => { onClose(); onRespond(task); }}>
                  <Send className="h-4 w-4 mr-2" />
                  Respond
                </Button>
              )}
              {onReturn && (
                <Button variant="outline" className="flex-1 border-red-300 text-red-600 hover:bg-red-50" onClick={() => { onClose(); onReturn(task); }}>
                  <CornerUpLeft className="h-4 w-4 mr-2" />
                  Return to Finance
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RespondModal({
  task,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  task: any;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  submitting: boolean;
}) {
  const [status, setStatus] = useState("Not Started");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [comments, setComments] = useState("");
  const [amountError, setAmountError] = useState("");
  const [percentError, setPercentError] = useState("");

  // Reset all fields when opening for a new task
  useEffect(() => {
    if (open && task) {
      setStatus("Not Started");
      setAmount("");
      setPercent("");
      setComments("");
      setAmountError("");
      setPercentError("");
    }
  }, [open, task?.assignmentId]);

  // "Completed" = full PO value, no percent. "In Progress" = partial, with percent option.
  const isCompleted = status === "Completed";
  const isInProgress = status === "In Progress";
  const needsAmount = isCompleted || isInProgress;
  const showPercent = isInProgress;

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setAmountError("");
    setPercentError("");
    if (newStatus === "Completed") {
      // Default to the full net amount; user may adjust
      setAmount(task?.netAmount != null ? String(task.netAmount) : "");
      setPercent("");
    } else if (newStatus === "In Progress") {
      // Keep existing values so switching back doesn't lose work
    } else {
      setAmount("");
      setPercent("");
    }
  };

  const validateAmount = (val: string): string => {
    if (!val) return "Provision amount is required";
    const n = parseFloat(val);
    if (isNaN(n)) return "Enter a valid number";
    if (n < 0) return "Amount cannot be negative";
    if (task?.netAmount != null && n > task.netAmount)
      return `Amount exceeds PO net amount (${formatAmount(task.netAmount)})`;
    return "";
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    setAmountError(val ? validateAmount(val) : "");
    // Keep percent in sync for In Progress
    if (isInProgress && val && task?.netAmount) {
      const n = parseFloat(val);
      if (!isNaN(n) && task.netAmount > 0) {
        setPercent(((n / task.netAmount) * 100).toFixed(1));
        setPercentError("");
      }
    }
  };

  const handlePercentChange = (val: string) => {
    setPercent(val);
    if (!val) { setPercentError(""); return; }
    const p = parseFloat(val);
    if (isNaN(p)) { setPercentError("Enter a valid number"); return; }
    if (p < 0) { setPercentError("Percentage cannot be negative"); return; }
    if (p > 100) { setPercentError("Percentage cannot exceed 100%"); return; }
    setPercentError("");
    if (task?.netAmount) {
      const computed = Math.round(task.netAmount * p / 100);
      setAmount(String(computed));
      setAmountError(validateAmount(String(computed)));
    }
  };

  const isFormValid = () => {
    if (!needsAmount) return true;
    const n = parseFloat(amount);
    if (!amount || isNaN(n) || n < 0) return false;
    if (task?.netAmount != null && n > task.netAmount) return false;
    if (showPercent && percent) {
      const p = parseFloat(percent);
      if (!isNaN(p) && (p < 0 || p > 100)) return false;
    }
    return true;
  };

  const handleSubmit = () => {
    if (needsAmount) {
      const err = validateAmount(amount);
      if (err) { setAmountError(err); return; }
    }
    onSubmit({
      assignmentId: task.assignmentId,
      completionStatus: status,
      provisionAmount: needsAmount ? (parseFloat(amount) || 0) : 0,
      provisionPercent: isCompleted ? 100 : (showPercent && percent ? parseFloat(percent) : null),
      comments,
    });
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Respond — PO {task.poNumber} / {task.poLineItem}
          </DialogTitle>
          <DialogDescription>
            {task.vendorName} · {task.itemDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* PO summary */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm bg-muted/30 rounded-md px-3 py-2">
            <div><span className="text-muted-foreground">Net Amount:</span> <span className="font-mono font-medium">{formatAmount(task.netAmount)}</span></div>
            <div><span className="text-muted-foreground">Cost Center:</span> <span className="font-mono">{task.costCenter || "-"}</span></div>
            <div><span className="text-muted-foreground">GL Account:</span> <span className="font-mono">{task.glAccount || "-"}</span></div>
            <div><span className="text-muted-foreground">Assigned:</span> <span>{task.assignedDate ? new Date(task.assignedDate).toLocaleDateString() : "-"}</span></div>
          </div>

          {/* Status selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Completion Status <span className="text-destructive">*</span></Label>
            <RadioGroup value={status} onValueChange={handleStatusChange} className="grid grid-cols-2 gap-2">
              {["Not Started", "In Progress", "Completed", "Discontinue"].map(s => (
                <div key={s} className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-accent/40 has-[:checked]:bg-accent/60 has-[:checked]:border-primary">
                  <RadioGroupItem value={s} id={`modal-${task.assignmentId}-${s}`} data-testid={`radio-status-${s.toLowerCase().replace(/\s/g, "-")}`} />
                  <Label htmlFor={`modal-${task.assignmentId}-${s}`} className="text-xs cursor-pointer">{s}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Completed: amount only (defaults to net amount, no percent) */}
          {isCompleted && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Provision Amount <span className="text-destructive">*</span></Label>
                <span className="text-[11px] text-muted-foreground">Defaults to full PO value — adjust if needed</span>
              </div>
              <Input
                type="number"
                min="0"
                max={task.netAmount ?? undefined}
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                placeholder={String(task.netAmount ?? "")}
                data-testid="input-provision-amount"
                className={amountError ? "border-destructive" : ""}
              />
              {amountError
                ? <p className="text-[11px] text-destructive">{amountError}</p>
                : amount && parseFloat(amount) < (task.netAmount ?? 0)
                  ? <p className="text-[11px] text-amber-600">Adjusted below net amount ({formatAmount(task.netAmount)})</p>
                  : <p className="text-[11px] text-muted-foreground">Full net amount: {formatAmount(task.netAmount)}</p>
              }
            </div>
          )}

          {/* In Progress: amount + optional percentage */}
          {isInProgress && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Provision Amount <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min="0"
                    value={amount}
                    onChange={e => handleAmountChange(e.target.value)}
                    placeholder="Enter amount"
                    data-testid="input-provision-amount"
                    className={amountError ? "border-destructive" : ""}
                  />
                  {amountError && <p className="text-[11px] text-destructive">{amountError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">% of Net Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={percent}
                    onChange={e => handlePercentChange(e.target.value)}
                    placeholder="0 – 100"
                    data-testid="input-provision-percent"
                    className={percentError ? "border-destructive" : ""}
                  />
                  {percentError
                    ? <p className="text-[11px] text-destructive">{percentError}</p>
                    : percent && !isNaN(parseFloat(percent)) && !percentError
                      ? <p className="text-[11px] text-muted-foreground">{parseFloat(percent)}% = {formatAmount(Math.round(task.netAmount * parseFloat(percent) / 100))}</p>
                      : null
                  }
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Enter the amount accrued so far, or enter a percentage and the amount will be calculated automatically. Maximum is the PO net amount ({formatAmount(task.netAmount)}).
              </p>
            </div>
          )}

          {/* Comments */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Comments</Label>
            <Textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Add your comments or notes..."
              rows={3}
              data-testid="input-comments"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !isFormValid()}
            data-testid={`button-submit-${task.assignmentId}`}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Submit Response
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnToFinanceDialog({ task, open, onClose, onConfirm, submitting }: {
  task: any;
  open: boolean;
  onClose: () => void;
  onConfirm: (comments: string) => void;
  submitting: boolean;
}) {
  const [comments, setComments] = useState("");
  useEffect(() => { if (open) setComments(""); }, [open]);
  if (!task) return null;
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CornerUpLeft className="h-4 w-4 text-red-500" />
            Return to Finance
          </DialogTitle>
          <DialogDescription>
            This will notify the Finance team that you need clarification or cannot process this task as-is.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="text-sm space-y-1">
            <p><span className="text-muted-foreground">PO:</span> <span className="font-mono font-medium">{task.poNumber} / {task.poLineItem}</span></p>
            <p><span className="text-muted-foreground">Vendor:</span> {task.vendorName}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="return-comments">Reason / Comments <span className="text-destructive">*</span></Label>
            <Textarea
              id="return-comments"
              placeholder="Explain why you are returning this task to Finance..."
              value={comments}
              onChange={e => setComments(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">This comment will be visible to Finance Admins in the Finance Approval Tracker.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(comments)}
            disabled={submitting || !comments.trim()}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CornerUpLeft className="mr-2 h-4 w-4" />}
            Return to Finance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MyTasksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [respondingTask, setRespondingTask] = useState<any>(null);
  const [detailTask, setDetailTask] = useState<any>(null);
  const [returningTask, setReturningTask] = useState<any>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["/api/activity-based/my-tasks"],
    queryFn: () => apiGet<any[]>("/api/activity-based/my-tasks"),
    // Always fetch fresh — staleTime:Infinity (global default) would cause the page to
    // show a cached empty list even after the user was just assigned new tasks.
    staleTime: 0,
  });

  const submitMutation = useMutation({
    mutationFn: (data: any) => apiPost("/api/activity-based/respond", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/responses"] });
      setRespondingTask(null);
      toast({ title: "Response submitted", description: "Your response has been recorded." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const returnMutation = useMutation({
    mutationFn: ({ assignmentId, comments }: { assignmentId: number; comments: string }) =>
      apiPost(`/api/activity-based/${assignmentId}/return`, { comments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/responses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
      setReturningTask(null);
      toast({ title: "Returned to Finance", description: "Finance has been notified." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const pending = tasks.filter((t: any) => t.assignmentStatus !== "Responded" && t.assignmentStatus !== "Approved" && t.assignmentStatus !== "Returned");
  const submitted = tasks.filter((t: any) => t.assignmentStatus === "Responded" || t.assignmentStatus === "Approved");
  const returned = tasks.filter((t: any) => t.assignmentStatus === "Returned");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">Activity-based PO assignments requiring your response</p>
      </div>

      {/* Stats */}
      {!isLoading && tasks.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <Clock className="h-8 w-8 text-amber-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{pending.length}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{submitted.length}</p>
                <p className="text-xs text-muted-foreground">Responded</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <CornerUpLeft className="h-8 w-8 text-red-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{returned.length}</p>
                <p className="text-xs text-muted-foreground">Returned</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive shrink-0" />
              <div>
                <p className="text-2xl font-bold">{tasks.filter((t: any) => t.assignmentStatus === "Overdue").length}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <ClipboardList className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">No tasks assigned</h3>
          <p className="text-sm text-muted-foreground mt-1">You're all caught up!</p>
        </div>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending
              {pending.length > 0 && (
                <Badge variant="secondary" className="ml-1.5">{pending.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="submitted" data-testid="tab-submitted">
              Submitted
              {submitted.length > 0 && (
                <Badge variant="secondary" className="ml-1.5">{submitted.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="returned" data-testid="tab-returned">
              Returned
              {returned.length > 0 && (
                <Badge variant="destructive" className="ml-1.5">{returned.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Pending Tasks */}
          <TabsContent value="pending" className="mt-3">
            {pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500/40 mb-3" />
                <h3 className="text-sm font-medium">All tasks responded</h3>
                <p className="text-xs text-muted-foreground mt-1">No pending tasks remaining.</p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">PO Number</TableHead>
                      <TableHead className="min-w-[140px]">Vendor</TableHead>
                      <TableHead className="min-w-[160px]">Description</TableHead>
                      <TableHead className="text-right min-w-[100px]">Net Amount</TableHead>
                      <TableHead className="min-w-[80px]">Cost Center</TableHead>
                      <TableHead className="min-w-[80px]">GL Account</TableHead>
                      <TableHead className="min-w-[90px]">Assigned On</TableHead>
                      <TableHead className="min-w-[90px]">Status</TableHead>
                      <TableHead className="text-center min-w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((task: any) => (
                      <TableRow
                        key={task.assignmentId}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => setDetailTask(task)}
                        data-testid={`row-pending-${task.assignmentId}`}
                      >
                        <TableCell className="font-mono text-xs font-medium">{task.poNumber}</TableCell>
                        <TableCell className="text-xs truncate max-w-[140px]">{task.vendorName}</TableCell>
                        <TableCell className="text-xs truncate max-w-[160px]">{task.itemDescription || "-"}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatAmount(task.netAmount)}</TableCell>
                        <TableCell className="text-xs font-mono">{task.costCenter || "-"}</TableCell>
                        <TableCell className="text-xs font-mono">{task.glAccount || "-"}</TableCell>
                        <TableCell className="text-xs">{task.assignedDate ? new Date(task.assignedDate).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(task.assignmentStatus)} className="text-[10px]">
                            {task.assignmentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-center">
                            <Button
                              size="sm"
                              onClick={() => setRespondingTask(task)}
                              data-testid={`button-respond-${task.assignmentId}`}
                            >
                              <Send className="h-3 w-3 mr-1" />
                              Respond
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => setReturningTask(task)}
                              title="Return to Finance"
                              data-testid={`button-return-${task.assignmentId}`}
                            >
                              <CornerUpLeft className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Submitted Tasks */}
          <TabsContent value="submitted" className="mt-3">
            {submitted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-medium">No submitted responses yet</h3>
                <p className="text-xs text-muted-foreground mt-1">Responded tasks will appear here.</p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">PO Number</TableHead>
                      <TableHead className="min-w-[140px]">Vendor</TableHead>
                      <TableHead className="text-right min-w-[100px]">Net Amount</TableHead>
                      <TableHead className="min-w-[80px]">Cost Center</TableHead>
                      <TableHead className="min-w-[110px]">Completion</TableHead>
                      <TableHead className="text-right min-w-[110px]">Provision Amt</TableHead>
                      <TableHead className="min-w-[180px]">Comments</TableHead>
                      <TableHead className="min-w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submitted.map((task: any) => (
                      <TableRow
                        key={task.assignmentId}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => setDetailTask(task)}
                        data-testid={`row-submitted-${task.assignmentId}`}
                      >
                        <TableCell className="font-mono text-xs font-medium">{task.poNumber}</TableCell>
                        <TableCell className="text-xs truncate max-w-[140px]">{task.vendorName}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatAmount(task.netAmount)}</TableCell>
                        <TableCell className="text-xs font-mono">{task.costCenter || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={completionVariant(task.responseStatus)} className="text-[10px]">
                            {task.responseStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono font-medium">
                          {task.provisionAmount != null ? formatAmount(task.provisionAmount) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                          {task.comments ? (
                            <span className="flex items-start gap-1">
                              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                              <span className="truncate">{task.comments}</span>
                            </span>
                          ) : <span className="italic">No comments</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="default" className="text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Responded
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Returned Tasks */}
          <TabsContent value="returned" className="mt-3">
            {returned.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CornerUpLeft className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-medium">No returned tasks</h3>
                <p className="text-xs text-muted-foreground mt-1">Tasks you return to Finance will appear here.</p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">PO Number</TableHead>
                      <TableHead className="min-w-[140px]">Vendor</TableHead>
                      <TableHead className="text-right min-w-[100px]">Net Amount</TableHead>
                      <TableHead className="min-w-[80px]">Cost Center</TableHead>
                      <TableHead className="min-w-[90px]">Returned On</TableHead>
                      <TableHead className="min-w-[220px]">Your Comments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returned.map((task: any) => (
                      <TableRow
                        key={task.assignmentId}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => setDetailTask(task)}
                      >
                        <TableCell className="font-mono text-xs font-medium">{task.poNumber}</TableCell>
                        <TableCell className="text-xs truncate max-w-[140px]">{task.vendorName}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatAmount(task.netAmount)}</TableCell>
                        <TableCell className="text-xs font-mono">{task.costCenter || "-"}</TableCell>
                        <TableCell className="text-xs">{task.returnedAt ? new Date(task.returnedAt).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                          {task.returnComments ? (
                            <span className="flex items-start gap-1">
                              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-red-500" />
                              <span className="truncate italic">"{task.returnComments}"</span>
                            </span>
                          ) : <span className="italic">No comments</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      <TaskDetailSheet
        task={detailTask}
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
        onRespond={(t) => setRespondingTask(t)}
        onReturn={(t) => setReturningTask(t)}
      />

      <RespondModal
        task={respondingTask}
        open={!!respondingTask}
        onClose={() => setRespondingTask(null)}
        onSubmit={submitMutation.mutate}
        submitting={submitMutation.isPending}
      />

      <ReturnToFinanceDialog
        task={returningTask}
        open={!!returningTask}
        onClose={() => setReturningTask(null)}
        onConfirm={(comments) => returnMutation.mutate({ assignmentId: returningTask.assignmentId, comments })}
        submitting={returnMutation.isPending}
      />
    </div>
  );
}
