import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Bell, Check, X, Clock, CheckCircle, XCircle, AlertTriangle, Send } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface ApprovalTrackerItem {
  id: number;
  poLineId: number;
  poNumber: string;
  poLineItem: string;
  vendorName: string;
  itemDescription: string;
  netAmount: number;
  costCenter: string;
  glAccount: string;
  submittedByName: string;
  submittedAt: string;
  status: string;
  approverNames: string[];
  approverIds: number[];
  approvedByName: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  nudgeCount: number;
  lastNudgeAt: string | null;
  processingMonth: string | null;
  lineStatus: string;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "Pending" ? "secondary" : status === "Approved" ? "default" : "destructive";
  const Icon = status === "Pending" ? Clock : status === "Approved" ? CheckCircle : XCircle;
  return (
    <Badge variant={variant} data-testid={`badge-status-${status.toLowerCase()}`}>
      <Icon className="h-3 w-3 mr-1" />
      {status}
    </Badge>
  );
}

export default function ApprovalTrackerPage() {
  const { isFinanceAdmin, isFinanceApprover } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canApprove = isFinanceAdmin || isFinanceApprover;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["/api/approvals/tracker"],
    queryFn: () => apiGet<ApprovalTrackerItem[]>("/api/approvals/tracker"),
  });

  const nudgeMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/api/approvals/${id}/nudge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/tracker"] });
      toast({ title: "Nudge sent", description: "Approver has been notified." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to nudge", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiPut(`/api/approvals/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/tracker"] });
      toast({ title: "Approved", description: "Approval has been recorded." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to approve", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiPut(`/api/approvals/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/tracker"] });
      setRejectDialogOpen(false);
      setRejectingId(null);
      setRejectionReason("");
      toast({ title: "Rejected", description: "Rejection has been recorded." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to reject", description: err.message, variant: "destructive" });
    },
  });

  const filtered = items.filter((item) => {
    if (statusFilter !== "all" && item.status.toLowerCase() !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!item.poNumber.toLowerCase().includes(q) && !item.vendorName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalCount = items.length;
  const pendingCount = items.filter((i) => i.status === "Pending").length;
  const approvedCount = items.filter((i) => i.status === "Approved").length;
  const rejectedCount = items.filter((i) => i.status === "Rejected").length;

  const handleReject = (id: number) => {
    setRejectingId(id);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (rejectingId !== null) {
      rejectMutation.mutate({ id: rejectingId, reason: rejectionReason });
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Approval Tracker</h1>
        <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
          Track and manage approval submissions
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Total Submissions</span>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-count">{totalCount}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-pending">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Pending</span>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-approved">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Approved</span>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-approved-count">{approvedCount}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-rejected">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Rejected</span>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-rejected-count">{rejectedCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by PO number or vendor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="option-filter-all">All</SelectItem>
            <SelectItem value="pending" data-testid="option-filter-pending">Pending</SelectItem>
            <SelectItem value="approved" data-testid="option-filter-approved">Approved</SelectItem>
            <SelectItem value="rejected" data-testid="option-filter-rejected">Rejected</SelectItem>
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
                      <p className="text-sm" data-testid="text-no-results">No approval submissions found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => (
                  <TableRow key={item.id} data-testid={`row-approval-${item.id}`}>
                    <TableCell className="font-medium" data-testid={`text-po-number-${item.id}`}>
                      {item.poNumber}
                    </TableCell>
                    <TableCell data-testid={`text-line-item-${item.id}`}>{item.poLineItem}</TableCell>
                    <TableCell data-testid={`text-vendor-${item.id}`}>{item.vendorName}</TableCell>
                    <TableCell className="text-right" data-testid={`text-amount-${item.id}`}>
                      {formatCurrency(item.netAmount)}
                    </TableCell>
                    <TableCell data-testid={`text-cost-center-${item.id}`}>{item.costCenter}</TableCell>
                    <TableCell data-testid={`text-approvers-${item.id}`}>
                      {item.approverNames.length > 0 ? item.approverNames.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell data-testid={`text-submitted-at-${item.id}`}>
                      {formatDate(item.submittedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {item.status === "Pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => nudgeMutation.mutate(item.id)}
                              disabled={nudgeMutation.isPending}
                              data-testid={`button-nudge-${item.id}`}
                            >
                              <Bell className="h-3 w-3 mr-1" />
                              Nudge
                              {item.nudgeCount > 0 && (
                                <Badge variant="secondary" className="ml-1 no-default-active-elevate" data-testid={`badge-nudge-count-${item.id}`}>
                                  {item.nudgeCount}
                                </Badge>
                              )}
                            </Button>
                            {canApprove && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-green-600 dark:text-green-400"
                                  onClick={() => approveMutation.mutate(item.id)}
                                  disabled={approveMutation.isPending}
                                  data-testid={`button-approve-${item.id}`}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => handleReject(item.id)}
                                  disabled={rejectMutation.isPending}
                                  data-testid={`button-reject-${item.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </>
                        )}
                        {item.status === "Rejected" && item.rejectionReason && (
                          <span className="text-xs text-muted-foreground italic truncate max-w-[120px]" title={item.rejectionReason} data-testid={`text-rejection-reason-${item.id}`}>
                            {item.rejectionReason}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
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
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            data-testid="textarea-rejection-reason"
          />
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={rejectMutation.isPending || !rejectionReason.trim()}
              data-testid="button-confirm-reject"
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}