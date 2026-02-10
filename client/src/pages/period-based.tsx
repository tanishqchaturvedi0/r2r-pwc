import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, apiPost } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useProcessingMonth } from "@/contexts/ProcessingMonthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Download, Filter, Upload, Search, MessageSquare, Calculator, Pencil, Send, Info, ArrowRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface PeriodLine {
  id: number;
  poNumber: string;
  poLineItem: string;
  vendorName: string;
  itemDescription: string;
  netAmount: number;
  glAccount: string;
  costCenter: string;
  profitCenter: string;
  plant: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  prevMonthDays: number;
  prevMonthProvision: number;
  prevMonthTrueUp: number;
  prevMonthGrn: number;
  carryForward: number;
  currentMonthDays: number;
  suggestedProvision: number;
  currentMonthGrn: number;
  currentMonthTrueUp: number;
  remarks: string;
  finalProvision: number;
  totalGrnToDate: number;
  status: string;
  category: string;
  prevMonthLabel: string;
  currentMonthLabel: string;
}

interface Approver {
  id: number;
  name: string;
  email: string;
}

function formatAmount(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v);
}

function getRowColor(line: PeriodLine) {
  if (line.status === "Rejected") return "bg-red-50/60 dark:bg-red-950/30";
  if (line.status === "Submitted") return "bg-blue-50/50 dark:bg-blue-950/20";
  if (line.finalProvision < 0) return "bg-red-50/50 dark:bg-red-950/20";
  if (line.finalProvision === 0) return "bg-muted/30";
  if (line.prevMonthTrueUp !== 0 || line.currentMonthTrueUp !== 0) return "bg-yellow-50/50 dark:bg-yellow-950/20";
  return "";
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "Approved": return "default";
    case "Under Review": return "secondary";
    case "Submitted": return "secondary";
    case "Posted": return "outline";
    case "Rejected": return "destructive";
    default: return "secondary";
  }
}

function isSelectable(line: PeriodLine) {
  return line.status === "Draft" || line.status === "Rejected";
}

export default function PeriodBasedPage() {
  const { isFinanceAdmin } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { processingMonth, prevMonthLabel, monthLabel } = useProcessingMonth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [remarksLine, setRemarksLine] = useState<PeriodLine | null>(null);
  const [remarksText, setRemarksText] = useState("");
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalLine, setEditModalLine] = useState<PeriodLine | null>(null);
  const [modalPrevTrueUp, setModalPrevTrueUp] = useState("");
  const [modalCurTrueUp, setModalCurTrueUp] = useState("");
  const [modalRemarks, setModalRemarks] = useState("");
  const [modalCategory, setModalCategory] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [approverModalOpen, setApproverModalOpen] = useState(false);
  const [approverModalLineIds, setApproverModalLineIds] = useState<number[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<Set<number>>(new Set());
  const [approverModalLabel, setApproverModalLabel] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/period-based", processingMonth],
    queryFn: () => apiGet<PeriodLine[]>(`/api/period-based?processingMonth=${encodeURIComponent(processingMonth)}`),
  });

  const { data: approvers = [] } = useQuery({
    queryKey: ["/api/approvers"],
    queryFn: () => apiGet<Approver[]>("/api/approvers"),
  });

  const updateTrueUp = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: string; value: number }) =>
      apiPut(`/api/period-based/${id}/true-up`, { field, value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/period-based", processingMonth] });
      toast({ title: "Saved", description: "True-up updated successfully." });
    },
  });

  const updateRemarks = useMutation({
    mutationFn: ({ id, remarks }: { id: number; remarks: string }) =>
      apiPut(`/api/period-based/${id}/remarks`, { remarks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/period-based", processingMonth] });
      setRemarksOpen(false);
      toast({ title: "Saved", description: "Remarks updated." });
    },
  });

  const submitForApproval = useMutation({
    mutationFn: ({ poLineIds, approverIds }: { poLineIds: number[]; approverIds: number[] }) =>
      apiPost("/api/period-based/submit", { poLineIds, approverIds, processingMonth }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/period-based", processingMonth] });
      setApproverModalOpen(false);
      setSelectedIds(new Set());
      toast({ title: "Submitted for approval" });
    },
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, category }: { id: number; category: string }) =>
      apiPut(`/api/po-lines/${id}/category`, { category }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/period-based", processingMonth] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
    },
  });

  const openEditModal = (line: PeriodLine) => {
    setEditModalLine(line);
    setModalPrevTrueUp(String(line.prevMonthTrueUp || 0));
    setModalCurTrueUp(String(line.currentMonthTrueUp || 0));
    setModalRemarks(line.remarks || "");
    setModalCategory(line.category || "Period");
    setEditModalOpen(true);
  };

  const computeModalFinal = () => {
    if (!editModalLine) return 0;
    const prevTU = parseFloat(modalPrevTrueUp) || 0;
    const curTU = parseFloat(modalCurTrueUp) || 0;
    const carryFwd = (editModalLine.prevMonthProvision || 0) + prevTU - (editModalLine.prevMonthGrn || 0);
    return carryFwd + (editModalLine.suggestedProvision || 0) - (editModalLine.currentMonthGrn || 0) + curTU;
  };

  const saveEditModal = async () => {
    if (!editModalLine) return;
    const prevTU = parseFloat(modalPrevTrueUp) || 0;
    const curTU = parseFloat(modalCurTrueUp) || 0;
    try {
      if (prevTU !== (editModalLine.prevMonthTrueUp || 0)) {
        await apiPut(`/api/period-based/${editModalLine.id}/true-up`, { field: "prevMonthTrueUp", value: prevTU });
      }
      if (curTU !== (editModalLine.currentMonthTrueUp || 0)) {
        await apiPut(`/api/period-based/${editModalLine.id}/true-up`, { field: "currentMonthTrueUp", value: curTU });
      }
      if (modalRemarks !== (editModalLine.remarks || "")) {
        await apiPut(`/api/period-based/${editModalLine.id}/remarks`, { remarks: modalRemarks });
      }
      if (modalCategory !== (editModalLine.category || "Period")) {
        await apiPut(`/api/po-lines/${editModalLine.id}/category`, { category: modalCategory });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/period-based"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
      setEditModalOpen(false);
      toast({ title: "Saved", description: "All changes saved successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    }
  };

  const handleCellEdit = (line: PeriodLine, field: string) => {
    setEditingCell({ id: line.id, field });
    setEditValue(field === "prevMonthTrueUp" ? String(line.prevMonthTrueUp || 0) : String(line.currentMonthTrueUp || 0));
  };

  const handleCellBlur = () => {
    if (!editingCell) return;
    const val = parseFloat(editValue) || 0;
    updateTrueUp.mutate({ id: editingCell.id, field: editingCell.field, value: val });
    setEditingCell(null);
  };

  const openApproverModal = (lineIds: number[], label: string) => {
    setApproverModalLineIds(lineIds);
    setApproverModalLabel(label);
    setSelectedApprovers(new Set(approvers.map(a => a.id)));
    setApproverModalOpen(true);
  };

  const toggleApprover = (id: number) => {
    setSelectedApprovers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSendApproval = () => {
    submitForApproval.mutate({
      poLineIds: approverModalLineIds,
      approverIds: Array.from(selectedApprovers),
    });
  };

  const toggleRowSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const lines = (data || []).filter(l => {
    if (statusFilter !== "All" && l.status !== statusFilter) return false;
    if (!search) return true;
    return l.poNumber?.toLowerCase().includes(search.toLowerCase()) ||
      l.vendorName?.toLowerCase().includes(search.toLowerCase()) ||
      l.costCenter?.toLowerCase().includes(search.toLowerCase());
  });

  const selectableLines = lines.filter(isSelectable);
  const allSelectableSelected = selectableLines.length > 0 && selectableLines.every(l => selectedIds.has(l.id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableLines.map(l => l.id)));
    }
  };

  const firstLine = lines[0];
  const prevLabel = firstLine?.prevMonthLabel || prevMonthLabel;
  const curLabel = firstLine?.currentMonthLabel || monthLabel;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Period-Based Accruals</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">Monthly provision calculations</p>
            <Badge variant="outline">{processingMonth}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search PO, vendor, CC..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-56"
              data-testid="input-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Submitted">Submitted</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          {can("period_based", "canDownload") && (
            <Button variant="outline" size="sm" data-testid="button-download">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
          )}
          {can("period_based", "canEdit") && selectedIds.size > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                const ids = Array.from(selectedIds);
                const count = ids.length;
                openApproverModal(ids, `${count} selected line${count > 1 ? "s" : ""}`);
              }}
              data-testid="button-send-selected"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send Selected ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calculator className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <h3 className="text-sm font-medium">No period-based accruals</h3>
              <p className="text-xs text-muted-foreground mt-1">Upload PO data to get started</p>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-[1800px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {can("period_based", "canEdit") && (
                        <TableHead className="w-10 text-center">
                          <Checkbox
                            checked={allSelectableSelected}
                            onCheckedChange={toggleSelectAll}
                            data-testid="checkbox-select-all"
                          />
                        </TableHead>
                      )}
                      <TableHead className="sticky left-0 bg-card z-10 min-w-[120px]">PO Number</TableHead>
                      <TableHead className="min-w-[60px]">Line</TableHead>
                      <TableHead className="min-w-[140px]">Vendor</TableHead>
                      <TableHead className="min-w-[160px]">Description</TableHead>
                      <TableHead className="text-right min-w-[100px]">Net Amt</TableHead>
                      <TableHead className="min-w-[80px]">GL</TableHead>
                      <TableHead className="min-w-[80px]">CC</TableHead>
                      <TableHead className="min-w-[70px]">Start</TableHead>
                      <TableHead className="min-w-[70px]">End</TableHead>
                      <TableHead className="text-right min-w-[50px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 italic cursor-help">
                              <Calculator className="h-3 w-3" />
                              Days
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Total contract days between start and end date</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right bg-muted/30 min-w-[70px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 italic cursor-help">
                              <Calculator className="h-3 w-3" />
                              {prevLabel} Prov
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{prevLabel} calculated provision</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right bg-muted/30 min-w-[80px] border-b-2 border-primary/50">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              <Pencil className="h-3 w-3" />
                              {prevLabel} T/U
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{prevLabel} true-up adjustment (editable)</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right bg-muted/30 min-w-[70px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">{prevLabel} GRN</span>
                          </TooltipTrigger>
                          <TooltipContent>Goods Receipt Note value from {prevLabel}</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right bg-muted/30 min-w-[80px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 italic cursor-help">
                              <Calculator className="h-3 w-3" />
                              Carry Fwd
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Remaining provision carried forward from {prevLabel}</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right bg-accent/30 min-w-[80px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 italic cursor-help">
                              <Calculator className="h-3 w-3" />
                              {curLabel} Prov
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>System-suggested provision for {curLabel}</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right bg-accent/30 min-w-[70px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">{curLabel} GRN</span>
                          </TooltipTrigger>
                          <TooltipContent>Goods Receipt Note value for {curLabel}</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right bg-accent/30 min-w-[80px] border-b-2 border-primary/50">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              <Pencil className="h-3 w-3" />
                              {curLabel} T/U
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{curLabel} true-up adjustment (editable)</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="bg-accent/30 min-w-[60px] border-b-2 border-primary/50">
                        <span className="inline-flex items-center gap-1">
                          <Pencil className="h-3 w-3" />
                          Remarks
                        </span>
                      </TableHead>
                      <TableHead className="text-right font-bold min-w-[100px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 italic cursor-help">
                              <Calculator className="h-3 w-3" />
                              Final
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Final provision = Carry Forward + Current Provision - Current GRN + Current True-Up</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="min-w-[80px]">Status</TableHead>
                      <TableHead className="min-w-[100px]">Category</TableHead>
                      {can("period_based", "canEdit") && (
                        <TableHead className="min-w-[50px] text-center">Edit</TableHead>
                      )}
                      {can("period_based", "canEdit") && (
                        <TableHead className="min-w-[50px] text-center">Send</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map(line => (
                      <TableRow key={line.id} className={getRowColor(line)} data-testid={`row-line-${line.id}`}>
                        {can("period_based", "canEdit") && (
                          <TableCell className="text-center">
                            {isSelectable(line) ? (
                              <Checkbox
                                checked={selectedIds.has(line.id)}
                                onCheckedChange={() => toggleRowSelection(line.id)}
                                data-testid={`checkbox-row-${line.id}`}
                              />
                            ) : null}
                          </TableCell>
                        )}
                        <TableCell className="sticky left-0 bg-inherit z-10 font-mono text-xs font-medium">{line.poNumber}</TableCell>
                        <TableCell className="text-xs">{line.poLineItem}</TableCell>
                        <TableCell className="text-xs truncate max-w-[140px]">{line.vendorName}</TableCell>
                        <TableCell className="text-xs truncate max-w-[160px]">{line.itemDescription}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{formatAmount(line.netAmount)}</TableCell>
                        <TableCell className="text-xs font-mono">{line.glAccount}</TableCell>
                        <TableCell className="text-xs font-mono">{line.costCenter}</TableCell>
                        <TableCell className="text-xs">{line.startDate}</TableCell>
                        <TableCell className="text-xs">{line.endDate}</TableCell>
                        <TableCell className="text-right text-xs">{line.totalDays}</TableCell>
                        <TableCell className="text-right text-xs bg-muted/10 font-mono">{formatAmount(line.prevMonthProvision)}</TableCell>
                        <TableCell className="text-right text-xs bg-muted/10">
                          {editingCell?.id === line.id && editingCell?.field === "prevMonthTrueUp" ? (
                            <Input
                              type="number"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={handleCellBlur}
                              onKeyDown={e => e.key === "Enter" && handleCellBlur()}
                              className="h-6 text-xs w-20 text-right"
                              autoFocus
                              data-testid="input-prev-true-up"
                            />
                          ) : (
                            <span
                              className={`cursor-pointer font-mono border-b border-dashed border-muted-foreground/40 ${line.prevMonthTrueUp ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}
                              onClick={() => can("period_based", "canEdit") && handleCellEdit(line, "prevMonthTrueUp")}
                            >
                              {formatAmount(line.prevMonthTrueUp)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs bg-muted/10 font-mono">{formatAmount(line.prevMonthGrn)}</TableCell>
                        <TableCell className="text-right text-xs bg-muted/10 font-mono font-medium">{formatAmount(line.carryForward)}</TableCell>
                        <TableCell className="text-right text-xs bg-accent/10 font-mono">{formatAmount(line.suggestedProvision)}</TableCell>
                        <TableCell className="text-right text-xs bg-accent/10 font-mono">{formatAmount(line.currentMonthGrn)}</TableCell>
                        <TableCell className="text-right text-xs bg-accent/10">
                          {editingCell?.id === line.id && editingCell?.field === "currentMonthTrueUp" ? (
                            <Input
                              type="number"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={handleCellBlur}
                              onKeyDown={e => e.key === "Enter" && handleCellBlur()}
                              className="h-6 text-xs w-20 text-right"
                              autoFocus
                              data-testid="input-current-true-up"
                            />
                          ) : (
                            <span
                              className={`cursor-pointer font-mono border-b border-dashed border-muted-foreground/40 ${line.currentMonthTrueUp ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}
                              onClick={() => can("period_based", "canEdit") && handleCellEdit(line, "currentMonthTrueUp")}
                            >
                              {formatAmount(line.currentMonthTrueUp)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="bg-accent/10">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => { setRemarksLine(line); setRemarksText(line.remarks || ""); setRemarksOpen(true); }}
                            data-testid={`button-remarks-${line.id}`}
                          >
                            <MessageSquare className={`h-3.5 w-3.5 ${line.remarks ? "text-primary" : "text-muted-foreground"}`} />
                          </Button>
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm font-mono">
                          <span className={line.finalProvision < 0 ? "text-destructive" : ""}>
                            {formatAmount(line.finalProvision)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant={statusVariant(line.status)} className="text-[10px]" data-testid={`badge-status-${line.id}`}>
                              {line.status}
                            </Badge>
                            {line.status === "Rejected" && (
                              <Badge variant="outline" className="text-[9px] border-destructive text-destructive" data-testid={`badge-resubmit-${line.id}`}>
                                Resubmit
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {can("period_based", "canEdit") ? (
                            <Select
                              value={line.category || "Period"}
                              onValueChange={(val) => updateCategory.mutate({ id: line.id, category: val })}
                            >
                              <SelectTrigger className="h-7 text-xs w-24" data-testid={`select-category-${line.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Period">Period</SelectItem>
                                <SelectItem value="Activity">Activity</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">{line.category || "Period"}</span>
                          )}
                        </TableCell>
                        {can("period_based", "canEdit") && (
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditModal(line)}
                              data-testid={`button-edit-row-${line.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                        {can("period_based", "canEdit") && (
                          <TableCell className="text-center">
                            {isSelectable(line) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openApproverModal([line.id], `PO ${line.poNumber} / ${line.poLineItem}`)}
                                data-testid={`button-send-row-${line.id}`}
                              >
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={remarksOpen} onOpenChange={setRemarksOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remarks - PO {remarksLine?.poNumber}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={remarksText}
            onChange={e => setRemarksText(e.target.value)}
            placeholder="Add remarks..."
            rows={4}
            data-testid="input-remarks"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemarksOpen(false)}>Cancel</Button>
            <Button
              onClick={() => remarksLine && updateRemarks.mutate({ id: remarksLine.id, remarks: remarksText })}
              disabled={updateRemarks.isPending}
              data-testid="button-save-remarks"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-row">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Line - PO {editModalLine?.poNumber} / {editModalLine?.poLineItem}
            </DialogTitle>
            <DialogDescription>
              {editModalLine?.vendorName} - {editModalLine?.itemDescription}
            </DialogDescription>
          </DialogHeader>

          {editModalLine && (
            <div className="space-y-5">
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    Line Summary (read-only)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm">
                    <div><span className="text-muted-foreground">Net Amount:</span> <span className="font-mono font-medium">{formatAmount(editModalLine.netAmount)}</span></div>
                    <div><span className="text-muted-foreground">GL Account:</span> <span className="font-mono">{editModalLine.glAccount}</span></div>
                    <div><span className="text-muted-foreground">Cost Center:</span> <span className="font-mono">{editModalLine.costCenter}</span></div>
                    <div><span className="text-muted-foreground">Period:</span> {editModalLine.startDate} <ArrowRight className="inline h-3 w-3" /> {editModalLine.endDate}</div>
                    <div><span className="text-muted-foreground">Total Days:</span> {editModalLine.totalDays}</div>
                    <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusVariant(editModalLine.status)} className="text-[10px] ml-1">{editModalLine.status}</Badge></div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Pencil className="h-3.5 w-3.5" />
                  Editable Fields
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="modal-prev-trueup" className="text-xs font-medium">{prevLabel} True-Up</Label>
                    <Input
                      id="modal-prev-trueup"
                      type="number"
                      value={modalPrevTrueUp}
                      onChange={e => setModalPrevTrueUp(e.target.value)}
                      data-testid="input-modal-prev-trueup"
                    />
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Manual adjustment to {prevLabel}'s provision. Use this when the calculated provision didn't match the actual expense. A positive value increases the carry-forward; negative reduces it.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="modal-cur-trueup" className="text-xs font-medium">{curLabel} True-Up</Label>
                    <Input
                      id="modal-cur-trueup"
                      type="number"
                      value={modalCurTrueUp}
                      onChange={e => setModalCurTrueUp(e.target.value)}
                      data-testid="input-modal-cur-trueup"
                    />
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Manual adjustment to {curLabel}'s provision. Use when the system-suggested provision needs correction due to partial deliveries, price changes, or scope adjustments.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="modal-category" className="text-xs font-medium">Accrual Category</Label>
                  <Select value={modalCategory} onValueChange={setModalCategory}>
                    <SelectTrigger data-testid="select-modal-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Period">Period-Based</SelectItem>
                      <SelectItem value="Activity">Activity-Based</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    <strong>Period-Based:</strong> Provision is calculated proportionally over the contract duration based on elapsed days.
                    <strong> Activity-Based:</strong> Provision is determined by actual work completion reported by the assigned business user.
                    Changing category moves this line to the other module.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="modal-remarks" className="text-xs font-medium">Remarks</Label>
                  <Textarea
                    id="modal-remarks"
                    value={modalRemarks}
                    onChange={e => setModalRemarks(e.target.value)}
                    placeholder="Add notes or justifications for adjustments..."
                    rows={3}
                    data-testid="input-modal-remarks"
                  />
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Provide context for any adjustments made. Remarks are visible to approvers and auditors, and are included in exported reports.
                  </p>
                </div>
              </div>

              <Card className="border-dashed">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Calculator className="h-3.5 w-3.5" />
                    Provision Calculation Preview
                  </div>
                  <div className="space-y-1 text-sm font-mono">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">{prevLabel} Provision</span>
                      <span>{formatAmount(editModalLine.prevMonthProvision)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">+ {prevLabel} True-Up</span>
                      <span className={parseFloat(modalPrevTrueUp) !== (editModalLine.prevMonthTrueUp || 0) ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>{formatAmount(parseFloat(modalPrevTrueUp) || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">- {prevLabel} GRN</span>
                      <span>{formatAmount(editModalLine.prevMonthGrn)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t pt-1">
                      <span className="text-muted-foreground font-medium">= Carry Forward</span>
                      <span className="font-medium">{formatAmount((editModalLine.prevMonthProvision || 0) + (parseFloat(modalPrevTrueUp) || 0) - (editModalLine.prevMonthGrn || 0))}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">+ {curLabel} Provision</span>
                      <span>{formatAmount(editModalLine.suggestedProvision)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">- {curLabel} GRN</span>
                      <span>{formatAmount(editModalLine.currentMonthGrn)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">+ {curLabel} True-Up</span>
                      <span className={parseFloat(modalCurTrueUp) !== (editModalLine.currentMonthTrueUp || 0) ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>{formatAmount(parseFloat(modalCurTrueUp) || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t pt-1 text-base">
                      <span className="font-bold">= Final Provision</span>
                      <span className={`font-bold ${computeModalFinal() < 0 ? "text-destructive" : ""}`}>{formatAmount(computeModalFinal())}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditModalOpen(false)} data-testid="button-cancel-edit-modal">Cancel</Button>
            <Button onClick={saveEditModal} data-testid="button-save-edit-modal">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approverModalOpen} onOpenChange={setApproverModalOpen}>
        <DialogContent data-testid="dialog-approver-selection">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send for Approval
            </DialogTitle>
            <DialogDescription>
              {approverModalLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Approvers</Label>
            {approvers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approvers available.</p>
            ) : (
              <div className="space-y-2">
                {approvers.map(approver => (
                  <div
                    key={approver.id}
                    className="flex items-center gap-3 p-2 rounded-md border"
                    data-testid={`approver-item-${approver.id}`}
                  >
                    <Checkbox
                      checked={selectedApprovers.has(approver.id)}
                      onCheckedChange={() => toggleApprover(approver.id)}
                      data-testid={`checkbox-approver-${approver.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{approver.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{approver.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproverModalOpen(false)} data-testid="button-cancel-approver">
              Cancel
            </Button>
            <Button
              onClick={handleSendApproval}
              disabled={selectedApprovers.size === 0 || submitForApproval.isPending}
              data-testid="button-confirm-send-approval"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
