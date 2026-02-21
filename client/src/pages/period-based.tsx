import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Download, Filter, Upload, Search, MessageSquare, Calculator, Pencil, Send, Info, ArrowRight, Sparkles, Users, CheckCircle2, UserCheck, Shield, Gavel } from "lucide-react";
import { DataTable, ColDef } from "@/components/ui/data-table";
import { Label } from "@/components/ui/label";
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
  totalGrnDateLabel: string;
  pendingPoValue: number;
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

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "Approved": return "default";
    case "Under Review": return "secondary";
    case "Submitted": return "secondary";
    case "Posted": return "outline";
    case "Rejected": return "destructive";
    case "Recalled": return "outline";
    default: return "secondary";
  }
}

function isSelectable(line: PeriodLine) {
  return line.status === "Draft" || line.status === "Rejected";
}

function getRowColor(line: PeriodLine) {
  if (line.status === "Rejected") return "bg-red-50/60 dark:bg-red-950/30";
  if (line.status === "Recalled") return "bg-orange-50/60 dark:bg-orange-950/20";
  if (line.status === "Submitted") return "bg-blue-50/50 dark:bg-blue-950/20";
  if (line.finalProvision < 0) return "bg-red-50/50 dark:bg-red-950/20";
  if (line.finalProvision === 0) return "bg-muted/30";
  if (line.currentMonthTrueUp !== 0) return "bg-yellow-50/50 dark:bg-yellow-950/20";
  return "";
}

const PAGE_SIZE = 100;

export default function PeriodBasedPage() {
  const { isFinanceAdmin } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { processingMonth, prevMonthLabel, monthLabel } = useProcessingMonth();
  const [search, setSearch] = useState("");
  // Default: hide Submitted/Approved items (they live in Finance Approval Tracker)
  const [statusFilter, setStatusFilter] = useState("Active");
  const [page, setPage] = useState(0);
  const [recalledHighlight, setRecalledHighlight] = useState<number | null>(null);
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
  const [ruleMatchResult, setRuleMatchResult] = useState<any>(null);
  const [ruleMatchLoading, setRuleMatchLoading] = useState(false);

  // Debounce search to avoid a server request on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Detect ?recalled=<poLineId> param from approval tracker "Edit Now" recall
  const [location] = useLocation();
  const recalledHandled = useRef(false);
  useEffect(() => {
    if (recalledHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("recalled");
    if (id) {
      recalledHandled.current = true;
      setRecalledHighlight(Number(id));
      // Strip the param from URL without re-rendering
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location]);

  // Reset to page 0 whenever filters change
  useEffect(() => { setPage(0); }, [debouncedSearch, statusFilter, processingMonth]);

  const { data: pagedResponse, isLoading } = useQuery({
    queryKey: ["/api/period-based", processingMonth, page, PAGE_SIZE, debouncedSearch, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        processingMonth,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      // "Active" = Draft + Rejected + Recalled (not Submitted/Approved)
      if (statusFilter === "Active") {
        params.set("status", "Active");
      } else if (statusFilter !== "All") {
        params.set("status", statusFilter);
      }
      return apiGet<{ data: PeriodLine[]; total: number; page: number; limit: number }>(
        `/api/period-based?${params}`
      );
    },
  });

  const { data: approvers = [] } = useQuery({
    queryKey: ["/api/approvers"],
    queryFn: () => apiGet<Approver[]>("/api/approvers"),
  });

  // Auto-open edit modal for a recalled item when navigated from "Edit Now"
  const lines = pagedResponse?.data || [];
  useEffect(() => {
    if (!recalledHighlight || isLoading || lines.length === 0) return;
    const recalled = lines.find((l: PeriodLine) => l.id === recalledHighlight);
    if (recalled) {
      openEditModal(recalled);
      setRecalledHighlight(null);
    }
  }, [recalledHighlight, lines, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTrueUp = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: string; value: number }) =>
      apiPut(`/api/period-based/${id}/true-up`, { field, value, processingMonth }),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/period-based"], type: "active" });
      toast({ title: "Saved", description: "True-up updated successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to save true-up.", variant: "destructive" });
    },
  });

  const updateRemarks = useMutation({
    mutationFn: ({ id, remarks }: { id: number; remarks: string }) =>
      apiPut(`/api/period-based/${id}/remarks`, { remarks, processingMonth }),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/period-based"], type: "active" });
      setRemarksOpen(false);
      toast({ title: "Saved", description: "Remarks updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to save remarks.", variant: "destructive" });
    },
  });

  const submitForApproval = useMutation({
    mutationFn: ({ poLineIds, approverIds }: { poLineIds: number[]; approverIds: number[] }) =>
      apiPost<{ success: boolean; count: number }>("/api/period-based/submit", { poLineIds, approverIds, processingMonth }),
    onSuccess: (result) => {
      queryClient.refetchQueries({ queryKey: ["/api/period-based"], type: "active" });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/tracker"] });
      setApproverModalOpen(false);
      setSelectedIds(new Set());
      if (result.count === 0) {
        toast({
          title: "Already submitted",
          description: "All selected lines already have a pending approval request.",
          variant: "default",
        });
      } else {
        toast({
          title: "Submitted for approval",
          description: `${result.count} line${result.count !== 1 ? "s" : ""} sent for approval.`,
        });
      }
    },
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, category, startDate, endDate }: { id: number; category: string; startDate?: string; endDate?: string }) =>
      apiPut(`/api/po-lines/${id}/category`, { category, startDate, endDate }),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/period-based"], type: "active" });
      queryClient.refetchQueries({ queryKey: ["/api/activity-based"], type: "active" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to update category.", variant: "destructive" });
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
    const curTU = parseFloat(modalCurTrueUp) || 0;
    return Math.round((editModalLine.suggestedProvision || 0) - (editModalLine.totalGrnToDate || 0) + curTU);
  };

  const saveEditModal = async () => {
    if (!editModalLine) return;
    const curTU = parseFloat(modalCurTrueUp) || 0;
    if (curTU < 0) {
      toast({ title: "Invalid value", description: "True-up cannot be negative.", variant: "destructive" });
      return;
    }
    const finalProvision = computeModalFinal();
    if (finalProvision < 0) {
      toast({ title: "Invalid value", description: "Final provision cannot be negative.", variant: "destructive" });
      return;
    }
    try {
      await apiPut(`/api/period-based/${editModalLine.id}/true-up`, { field: "currentMonthTrueUp", value: curTU, processingMonth });
      await apiPut(`/api/period-based/${editModalLine.id}/remarks`, { remarks: modalRemarks, processingMonth });
      if (modalCategory !== (editModalLine.category || "Period")) {
        await apiPut(`/api/po-lines/${editModalLine.id}/category`, {
          category: modalCategory,
          startDate: editModalLine.startDate,
          endDate: editModalLine.endDate,
        });
      }
      setEditModalOpen(false);
      await queryClient.refetchQueries({ queryKey: ["/api/period-based"], type: "active" });
      await queryClient.refetchQueries({ queryKey: ["/api/activity-based"], type: "active" });
      toast({ title: "Saved", description: "All changes saved successfully." });
    } catch (err: any) {
      await queryClient.refetchQueries({ queryKey: ["/api/period-based"], type: "active" });
      toast({ title: "Error", description: err?.message || "Failed to save changes.", variant: "destructive" });
    }
  };

  const handleCellEdit = (line: PeriodLine, field: string) => {
    setEditingCell({ id: line.id, field });
    setEditValue(String(line.currentMonthTrueUp || 0));
  };

  const handleCellBlur = () => {
    if (!editingCell) return;
    const val = parseFloat(editValue) || 0;
    if (val < 0) {
      toast({ title: "Invalid value", description: "True-up cannot be negative.", variant: "destructive" });
      setEditingCell(null);
      return;
    }
    const line = lines.find(l => l.id === editingCell.id);
    if (line) {
      const computedFinal = Math.round((line.suggestedProvision || 0) - (line.totalGrnToDate || 0) + val);
      if (computedFinal < 0) {
        toast({ title: "Invalid value", description: "True-up would result in a negative final provision.", variant: "destructive" });
        setEditingCell(null);
        return;
      }
    }
    updateTrueUp.mutate({ id: editingCell.id, field: editingCell.field, value: val });
    setEditingCell(null);
  };

  const openApproverModal = async (lineIds: number[], label: string) => {
    setApproverModalLineIds(lineIds);
    setApproverModalLabel(label);
    setRuleMatchResult(null);
    setRuleMatchLoading(true);
    setApproverModalOpen(true);
    try {
      const result = await apiPost<any>("/api/rules/match", { poLineIds: lineIds });
      setRuleMatchResult(result);
      if (result.suggestedApproverIds && result.suggestedApproverIds.length > 0) {
        setSelectedApprovers(new Set(result.suggestedApproverIds));
      } else {
        setSelectedApprovers(new Set(approvers.map((a: Approver) => a.id)));
      }
    } catch {
      setSelectedApprovers(new Set(approvers.map((a: Approver) => a.id)));
    } finally {
      setRuleMatchLoading(false);
    }
  };

  const toggleApprover = (id: number) => {
    setSelectedApprovers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const serverTotal = pagedResponse?.total || 0;
  const totalPages = Math.max(1, Math.ceil(serverTotal / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const selectableLines = lines.filter(isSelectable);
  const allSelectableSelected = selectableLines.length > 0 && selectableLines.every(l => selectedIds.has(l.id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableLines.map(l => l.id)));
    }
  };

  const prevLabel = lines[0]?.prevMonthLabel || prevMonthLabel;
  const curLabel = lines[0]?.currentMonthLabel || monthLabel;

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
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active (Default)</SelectItem>
              <SelectItem value="All">All Statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Recalled">Recalled</SelectItem>
              <SelectItem value="Submitted">In Approval</SelectItem>
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
          ) : (
            <div className="p-2">
              <DataTable
                storageKey="period-based"
                minWidth={1800}
                data={lines}
                rowKey={(l: PeriodLine) => l.id}
                rowClass={(l: PeriodLine) => `${getRowColor(l)} ${recalledHighlight === l.id ? "ring-2 ring-orange-400 ring-inset" : ""}`}
                emptyState={
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Calculator className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No period-based accruals</p>
                    <p className="text-xs text-muted-foreground">Upload PO data to get started</p>
                  </div>
                }
                columns={[
                  ...(can("period_based", "canEdit") ? [{
                    key: "_select", noDrag: true, noFilter: true, sortable: false,
                    width: 40, align: "center" as const,
                    label: <Checkbox checked={allSelectableSelected} onCheckedChange={toggleSelectAll} data-testid="checkbox-select-all" />,
                    render: (l: PeriodLine) => isSelectable(l) ? (
                      <Checkbox checked={selectedIds.has(l.id)} onCheckedChange={() => toggleRowSelection(l.id)} data-testid={`checkbox-row-${l.id}`} />
                    ) : null,
                  }] as ColDef<PeriodLine>[] : []),
                  { key: "poNumber", label: "PO Number", width: 120, sticky: true, tdClass: "font-mono font-medium text-xs", render: (l) => l.poNumber },
                  { key: "poLineItem", label: "Line", width: 56, render: (l) => l.poLineItem },
                  { key: "vendorName", label: "Vendor", width: 140, render: (l) => <span className="truncate max-w-[130px] block">{l.vendorName}</span> },
                  { key: "itemDescription", label: "Description", width: 160, render: (l) => <span className="truncate max-w-[150px] block">{l.itemDescription}</span> },
                  { key: "netAmount", label: "Net Amt", align: "right", width: 100, tdClass: "font-mono", tip: "Total net PO value", filterValue: (l) => String(l.netAmount ?? ""), render: (l) => formatAmount(l.netAmount) },
                  {
                    key: "pendingPoValue",
                    label: <span className="inline-flex items-center gap-1 text-orange-700 dark:text-orange-400 font-semibold"><Calculator className="h-3 w-3" />Pending PO</span>,
                    filterLabel: "Pending PO", align: "right", width: 110,
                    tip: "Net PO value minus cumulative GRN to date — the remaining open commitment",
                    thClass: "bg-orange-50/60 dark:bg-orange-950/20",
                    tdClass: "font-mono font-semibold bg-orange-50/40 dark:bg-orange-950/10",
                    filterValue: (l) => String(l.pendingPoValue ?? ""),
                    render: (l) => <span className={l.pendingPoValue < 0 ? "text-destructive" : "text-orange-700 dark:text-orange-400"}>{formatAmount(l.pendingPoValue)}</span>,
                  },
                  { key: "glAccount", label: "GL", width: 80, tdClass: "font-mono", tip: "GL Account code", filterValue: (l) => l.glAccount || "-", render: (l) => l.glAccount },
                  { key: "costCenter", label: "CC", width: 80, tdClass: "font-mono", tip: "Cost Center code", filterValue: (l) => l.costCenter || "-", render: (l) => l.costCenter },
                  { key: "startDate", label: "Start", width: 88, tip: "PO contract start date", filterValue: (l) => l.startDate || "-", render: (l) => l.startDate },
                  { key: "endDate", label: "End", width: 88, tip: "PO contract end date", filterValue: (l) => l.endDate || "-", render: (l) => l.endDate },
                  {
                    key: "totalDays",
                    label: <span className="inline-flex items-center gap-1"><Calculator className="h-3 w-3" />Days</span>,
                    filterLabel: "Days", align: "right", width: 60,
                    tip: "Total contract days between start and end date",
                    thClass: "bg-muted/30", tdClass: "bg-muted/10",
                    filterValue: (l) => String(l.totalDays ?? ""),
                    render: (l) => l.totalDays,
                  },
                  {
                    key: "prevMonthProvision",
                    label: <span className="inline-flex items-center gap-1"><Calculator className="h-3 w-3" />{prevLabel} Prov</span>,
                    filterLabel: `${prevLabel} Provision`, align: "right", width: 90,
                    tip: `${prevLabel} calculated provision`,
                    thClass: "bg-muted/30", tdClass: "font-mono bg-muted/10",
                    filterValue: (l) => String(l.prevMonthProvision ?? ""),
                    render: (l) => formatAmount(l.prevMonthProvision),
                  },
                  {
                    key: "prevMonthTrueUp",
                    label: <span className="inline-flex items-center gap-1"><Calculator className="h-3 w-3" />{prevLabel} T/U</span>,
                    filterLabel: `${prevLabel} True-Up`, align: "right", width: 80,
                    tip: `${prevLabel} true-up adjustment`,
                    thClass: "bg-muted/30", tdClass: "bg-muted/10",
                    filterValue: (l) => String(l.prevMonthTrueUp ?? ""),
                    render: (l) => <span className={`font-mono ${l.prevMonthTrueUp ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}>{formatAmount(l.prevMonthTrueUp)}</span>,
                  },
                  {
                    key: "prevMonthGrn",
                    label: <span className="inline-flex items-center gap-1">{prevLabel} GRN</span>,
                    filterLabel: `${prevLabel} GRN`, align: "right", width: 80,
                    tip: `Goods Receipt Note value from ${prevLabel}`,
                    thClass: "bg-muted/30", tdClass: "font-mono bg-muted/10",
                    filterValue: (l) => String(l.prevMonthGrn ?? ""),
                    render: (l) => formatAmount(l.prevMonthGrn),
                  },
                  {
                    key: "suggestedProvision",
                    label: <span className="inline-flex items-center gap-1"><Calculator className="h-3 w-3" />{curLabel} Prov</span>,
                    filterLabel: `${curLabel} Provision`, align: "right", width: 90,
                    tip: `System-suggested provision for ${curLabel}`,
                    thClass: "bg-accent/30", tdClass: "font-mono bg-accent/10",
                    filterValue: (l) => String(l.suggestedProvision ?? ""),
                    render: (l) => formatAmount(l.suggestedProvision),
                  },
                  {
                    key: "currentMonthGrn",
                    label: <span className="inline-flex items-center gap-1">{curLabel} GRN</span>,
                    filterLabel: `${curLabel} GRN`, align: "right", width: 78,
                    tip: `Goods Receipt Note value for ${curLabel}`,
                    thClass: "bg-accent/30", tdClass: "font-mono bg-accent/10",
                    filterValue: (l) => String(l.currentMonthGrn ?? ""),
                    render: (l) => formatAmount(l.currentMonthGrn),
                  },
                  {
                    key: "totalGrnToDate",
                    label: <span className="inline-flex items-center gap-1"><Calculator className="h-3 w-3" />Total GRN</span>,
                    filterLabel: "Total GRN", align: "right", width: 100,
                    tip: "Cumulative GRN value to date (derived)",
                    thClass: "bg-accent/30", tdClass: "font-mono bg-accent/10",
                    filterValue: (l) => String(l.totalGrnToDate ?? ""),
                    render: (l) => (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help font-semibold">{formatAmount(l.totalGrnToDate)}</span>
                        </TooltipTrigger>
                        <TooltipContent>{l.totalGrnDateLabel ? `As of ${l.totalGrnDateLabel}` : "No GRN data"}</TooltipContent>
                      </Tooltip>
                    ),
                  },
                  {
                    key: "currentMonthTrueUp",
                    label: <span className="inline-flex items-center gap-1"><Pencil className="h-3 w-3" />{curLabel} T/U</span>,
                    filterLabel: `${curLabel} True-Up`, align: "right", width: 96,
                    tip: `${curLabel} true-up adjustment (editable)`,
                    thClass: "bg-accent/30 border-b-2 border-primary/50", tdClass: "bg-accent/10",
                    filterValue: (l) => String(l.currentMonthTrueUp ?? ""),
                    render: (l) => editingCell?.id === l.id && editingCell?.field === "currentMonthTrueUp" ? (
                      <Input type="number" min="0" value={editValue} onChange={e => setEditValue(e.target.value)}
                        onBlur={handleCellBlur} onKeyDown={e => e.key === "Enter" && handleCellBlur()}
                        className="h-6 text-xs w-20 text-right" autoFocus data-testid="input-current-true-up" />
                    ) : (
                      <span
                        className={`cursor-pointer font-mono border-b border-dashed border-muted-foreground/40 ${l.currentMonthTrueUp ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}
                        onClick={() => can("period_based", "canEdit") && handleCellEdit(l, "currentMonthTrueUp")}
                        data-testid={`cell-true-up-${l.id}`}
                      >
                        {formatAmount(l.currentMonthTrueUp)}
                      </span>
                    ),
                  },
                  {
                    key: "_remarks", label: <span className="inline-flex items-center gap-1"><Pencil className="h-3 w-3" />Remarks</span>,
                    filterLabel: "Remarks", width: 64, noFilter: true, noDrag: false,
                    thClass: "bg-accent/30 border-b-2 border-primary/50", tdClass: "bg-accent/10",
                    render: (l) => (
                      <Button variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => { setRemarksLine(l); setRemarksText(l.remarks || ""); setRemarksOpen(true); }}
                        data-testid={`button-remarks-${l.id}`}>
                        <MessageSquare className={`h-3.5 w-3.5 ${l.remarks ? "text-primary" : "text-muted-foreground"}`} />
                      </Button>
                    ),
                  },
                  {
                    key: "finalProvision",
                    label: <span className="inline-flex items-center gap-1 font-bold"><Calculator className="h-3 w-3" />Final</span>,
                    filterLabel: "Final Provision", align: "right", width: 100,
                    tip: "Final provision = Carry Forward + Current Provision − Current GRN + Current True-Up",
                    thClass: "bg-primary/10",
                    tdClass: "font-bold font-mono bg-primary/5",
                    filterValue: (l) => String(l.finalProvision ?? ""),
                    render: (l) => <span className={l.finalProvision < 0 ? "text-destructive" : ""}>{formatAmount(l.finalProvision)}</span>,
                  },
                  {
                    key: "status", label: "Status", width: 96,
                    render: (l) => (
                      <div className="flex items-center gap-1">
                        <Badge variant={statusVariant(l.status)} className="text-[10px]" data-testid={`badge-status-${l.id}`}>{l.status}</Badge>
                        {l.status === "Rejected" && <Badge variant="outline" className="text-[9px] border-destructive text-destructive" data-testid={`badge-resubmit-${l.id}`}>Resubmit</Badge>}
                        {l.status === "Recalled" && <Badge variant="outline" className="text-[9px] border-orange-500 text-orange-600 dark:text-orange-400">Edit to resubmit</Badge>}
                      </div>
                    ),
                  },
                  {
                    key: "category", label: "Category", width: 100,
                    render: (l) => can("period_based", "canEdit") ? (
                      <Select value={l.category || "Period"} onValueChange={val => updateCategory.mutate({ id: l.id, category: val, startDate: l.startDate, endDate: l.endDate })}>
                        <SelectTrigger className="h-7 text-xs w-24" data-testid={`select-category-${l.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Period">Period</SelectItem>
                          <SelectItem value="Activity">Activity</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : <span className="text-xs">{l.category || "Period"}</span>,
                  },
                  ...(can("period_based", "canEdit") ? [
                    {
                      key: "_edit", label: "Edit", width: 52, noFilter: true, sortable: false, align: "center" as const,
                      render: (l: PeriodLine) => (
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(l)} data-testid={`button-edit-row-${l.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      ),
                    },
                    {
                      key: "_send", label: "Send", width: 52, noFilter: true, sortable: false, align: "center" as const,
                      render: (l: PeriodLine) => isSelectable(l) ? (
                        <Button variant="ghost" size="icon" onClick={() => openApproverModal([l.id], `PO ${l.poNumber} / ${l.poLineItem}`)} data-testid={`button-send-row-${l.id}`}>
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      ) : null,
                    },
                  ] as ColDef<PeriodLine>[] : []),
                ]}
              />
            </div>
          )}
          {serverTotal > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, serverTotal)} of {serverTotal} rows
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">Page {safePage + 1} / {totalPages}</span>
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>
                  Next
                </Button>
              </div>
            </div>
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

              <Card className="border-dashed bg-muted/20">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    {prevLabel} Final Provision <span className="text-[10px] font-normal ml-1">(reference only)</span>
                  </div>
                  <div className="space-y-1 text-sm font-mono">
                    <div className="flex items-center justify-between gap-4 text-muted-foreground">
                      <span>{prevLabel} Provision</span>
                      <span>{formatAmount(editModalLine.prevMonthProvision)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 text-muted-foreground">
                      <span>- Total GRN to Date</span>
                      <span>{formatAmount(editModalLine.totalGrnToDate)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 text-muted-foreground">
                      <span>+ {prevLabel} True-Up</span>
                      <span>{formatAmount(editModalLine.prevMonthTrueUp)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t pt-1">
                      <span className="font-semibold text-muted-foreground">= {prevLabel} Final</span>
                      <span className={`font-semibold ${Math.round((editModalLine.prevMonthProvision || 0) - (editModalLine.totalGrnToDate || 0) + (editModalLine.prevMonthTrueUp || 0)) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {formatAmount(Math.round((editModalLine.prevMonthProvision || 0) - (editModalLine.totalGrnToDate || 0) + (editModalLine.prevMonthTrueUp || 0)))}
                      </span>
                    </div>
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
                    <Label className="text-xs font-medium text-muted-foreground">{prevLabel} True-Up <span className="text-[10px] font-normal">(locked)</span></Label>
                    <div className="flex items-center h-9 px-3 rounded-md border border-input bg-muted/40 font-mono text-sm text-muted-foreground select-none" data-testid="input-modal-prev-trueup">
                      {formatAmount(editModalLine?.prevMonthTrueUp ?? 0)}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      The {prevLabel} true-up was set during the previous month's processing cycle and cannot be changed in the current month.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="modal-cur-trueup" className="text-xs font-medium">{curLabel} True-Up</Label>
                    <Input
                      id="modal-cur-trueup"
                      type="number"
                      min="0"
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
                      <span className="text-muted-foreground">{curLabel} Provision</span>
                      <span>{formatAmount(editModalLine.suggestedProvision)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">- Total GRN to Date</span>
                      <span>{formatAmount(editModalLine.totalGrnToDate)}</span>
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

      <Dialog open={approverModalOpen} onOpenChange={open => { if (!open) { setApproverModalOpen(false); setRuleMatchResult(null); } }}>
        <DialogContent className="max-w-md" data-testid="dialog-approver-selection">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Send className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base">Submit for Approval</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">{approverModalLabel}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {ruleMatchLoading ? (
              <div className="space-y-3">
                <div className="h-16 rounded-lg bg-muted/40 animate-pulse" />
                <div className="h-12 rounded-lg bg-muted/40 animate-pulse" />
                <div className="h-12 rounded-lg bg-muted/40 animate-pulse" />
              </div>
            ) : (
              <>
                {ruleMatchResult?.matchedRules?.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-900 p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Smart Suggestions Active</p>
                    </div>
                    <div className="space-y-1.5">
                      {ruleMatchResult.matchedRules.map((mr: any) => (
                        <div key={mr.id} className="flex items-start gap-2 text-xs">
                          <Gavel className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium text-amber-800 dark:text-amber-300">{mr.ruleName}</span>
                            <span className="text-amber-600 dark:text-amber-500 ml-1">
                              — matches {mr.matchingLineCount} of {approverModalLineIds.length} line{approverModalLineIds.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">Suggested approvers are pre-selected below. You can modify the selection.</p>
                  </div>
                )}

                {ruleMatchResult && ruleMatchResult.matchedRules?.length === 0 && (
                  <div className="rounded-xl border border-muted bg-muted/30 p-3 flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">No active rules match the selected lines. Select approvers manually.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Users className="h-3 w-3" /> Finance Approvers
                    </Label>
                    {approvers.length > 0 && (
                      <button
                        className="text-[11px] text-primary hover:underline"
                        onClick={() => {
                          if (selectedApprovers.size === approvers.length) {
                            setSelectedApprovers(new Set());
                          } else {
                            setSelectedApprovers(new Set(approvers.map((a: Approver) => a.id)));
                          }
                        }}
                      >
                        {selectedApprovers.size === approvers.length ? "Deselect all" : "Select all"}
                      </button>
                    )}
                  </div>

                  {approvers.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center">
                      <p className="text-sm text-muted-foreground">No finance approvers found.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {approvers.map((approver: Approver) => {
                        const isSuggested = ruleMatchResult?.suggestedApproverIds?.includes(approver.id);
                        const isSelected = selectedApprovers.has(approver.id);
                        return (
                          <div
                            key={approver.id}
                            onClick={() => toggleApprover(approver.id)}
                            className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all select-none
                              ${isSelected
                                ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                                : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                              }`}
                            data-testid={`approver-item-${approver.id}`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {}}
                              data-testid={`checkbox-approver-${approver.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium truncate">{approver.name}</p>
                                {isSuggested && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900 shrink-0">
                                    <Sparkles className="h-2 w-2" /> Suggested
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{approver.email}</p>
                            </div>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedApprovers.size > 0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border">
                    <UserCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{selectedApprovers.size}</span> approver{selectedApprovers.size !== 1 ? "s" : ""} selected
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setApproverModalOpen(false); setRuleMatchResult(null); }} data-testid="button-cancel-approver">
              Cancel
            </Button>
            <Button
              onClick={handleSendApproval}
              disabled={selectedApprovers.size === 0 || submitForApproval.isPending || ruleMatchLoading}
              data-testid="button-confirm-send-approval"
            >
              {submitForApproval.isPending
                ? <><span className="h-3.5 w-3.5 mr-1.5 border-2 border-background/40 border-t-background rounded-full animate-spin inline-block" />Submitting...</>
                : <><Send className="mr-1.5 h-3.5 w-3.5" />Submit for Approval</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
