import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useProcessingMonth } from "@/contexts/ProcessingMonthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, UserPlus, CheckCircle, Clock, Send, Activity, Calculator, Pencil, Info, ArrowRight, CornerUpLeft, FileCheck, RefreshCw, Sparkles, Users, CheckCircle2, UserCheck, Shield, Gavel } from "lucide-react";
import { Label } from "@/components/ui/label";
import { DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, ColDef } from "@/components/ui/data-table";

function formatAmount(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v);
}

// Converts any stored date string (M/D/YYYY, MM/DD/YYYY, YYYY-MM-DD) to YYYY-MM-DD for HTML date inputs.
// Returns "" if the input is empty or unrecognizable.
function toDateInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const s = dateStr.trim();
  // Already in YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D/YYYY or MM/DD/YYYY
  const parts = s.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    if (y.length === 4) {
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  // Fallback: try native Date parsing
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function statusBadge(status: string) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    "Not Assigned": { variant: "outline", className: "text-[10px] text-muted-foreground" },
    "Assigned":     { variant: "secondary", className: "text-[10px]" },
    "Responded":    { variant: "secondary", className: "text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700" },
    "Overdue":      { variant: "destructive", className: "text-[10px]" },
    "Approved":     { variant: "default", className: "text-[10px] bg-green-600 dark:bg-green-700 text-white border-0" },
    "Recalled":     { variant: "outline", className: "text-[10px] text-amber-600 border-amber-400 dark:text-amber-400 dark:border-amber-600" },
    "Submitted":    { variant: "secondary", className: "text-[10px] bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-700" },
  };
  const c = config[status] || { variant: "secondary" as const, className: "text-[10px]" };
  return <Badge variant={c.variant} className={c.className}>{status}</Badge>;
}

const PAGE_SIZE = 100;

function AssignmentTab({ filterMode = "all" }: { filterMode?: "all" | "unassigned" }) {
  const { can } = usePermissions();
  const { processingMonth, prevMonthLabel, monthLabel } = useProcessingMonth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [recalledHighlight, setRecalledHighlight] = useState<number | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<any>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalLine, setEditModalLine] = useState<any>(null);
  const [modalCategory, setModalCategory] = useState("");
  const [modalAssignUsers, setModalAssignUsers] = useState<Set<number>>(new Set());
  const [modalPrevTrueUp, setModalPrevTrueUp] = useState("0");
  const [modalCurTrueUp, setModalCurTrueUp] = useState("0");
  const [modalRemarks, setModalRemarks] = useState("");
  const [modalStartDate, setModalStartDate] = useState("");
  const [modalEndDate, setModalEndDate] = useState("");
  const [categoryDateDialogOpen, setCategoryDateDialogOpen] = useState(false);
  const [pendingCategoryLine, setPendingCategoryLine] = useState<any>(null);
  const [catStartDate, setCatStartDate] = useState("");
  const [catEndDate, setCatEndDate] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location]);

  useEffect(() => { setPage(0); }, [debouncedSearch, processingMonth]);

  const { data: pagedResponse, isLoading } = useQuery({
    queryKey: ["/api/activity-based", processingMonth, page, PAGE_SIZE, debouncedSearch, filterMode],
    queryFn: () => {
      const params = new URLSearchParams({
        processingMonth,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      // For "unassigned" tab, hide items with active assignments
      if (filterMode === "unassigned") params.set("hideAssigned", "true");
      return apiGet<{ data: any[]; total: number; page: number; limit: number }>(
        `/api/activity-based?${params}`
      );
    },
  });
  const lines = pagedResponse?.data || [];
  const serverTotal = pagedResponse?.total || 0;

  const { data: users } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiGet<any[]>("/api/users"),
  });

  const assignMutation = useMutation({
    mutationFn: (data: any) => apiPost("/api/activity-based/assign", data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/activity-based"], type: "active" });
      queryClient.refetchQueries({ queryKey: ["/api/activity-based/responses"], type: "active" });
      queryClient.refetchQueries({ queryKey: ["/api/approvals/tracker"], type: "active" });
      setAssignOpen(false);
      setSelectedUsers(new Set());
      toast({ title: "Assigned", description: "PO assigned successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to assign PO.", variant: "destructive" });
    },
  });

  const categoryMutation = useMutation({
    mutationFn: ({ id, category, startDate, endDate }: { id: number; category: string; startDate?: string; endDate?: string }) =>
      apiPut(`/api/po-lines/${id}/category`, { category, startDate, endDate }),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/activity-based"], type: "active" });
      queryClient.refetchQueries({ queryKey: ["/api/period-based"], type: "active" });
      toast({ title: "Updated", description: "Category updated successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to update category.", variant: "destructive" });
    },
  });

  const totalPages = Math.max(1, Math.ceil(serverTotal / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedFiltered = lines;

  const businessUsers = (users || []).filter((u: any) => u.roles?.includes("Business User"));

  // Auto-open edit modal for a recalled item when navigated from approval tracker "Edit Now"
  useEffect(() => {
    if (!recalledHighlight || isLoading || lines.length === 0) return;
    const recalled = lines.find((l: any) => l.id === recalledHighlight);
    if (recalled) {
      openEditModal(recalled);
      setRecalledHighlight(null);
    }
  }, [recalledHighlight, lines, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEditModal = (line: any) => {
    setEditModalLine(line);
    setModalCategory(line.category || "Activity");
    // Pre-populate ALL currently assigned users (multi-user aware)
    const existingIds: number[] = line.allAssignedUserIds?.length
      ? line.allAssignedUserIds
      : line.assignedToUserId ? [line.assignedToUserId] : [];
    setModalAssignUsers(new Set(existingIds));
    setModalPrevTrueUp(String(line.prevMonthTrueUp || 0));
    setModalCurTrueUp(String(line.currentMonthTrueUp || 0));
    setModalRemarks(line.remarks || "");
    // Normalize to YYYY-MM-DD so HTML date inputs always receive a valid value
    setModalStartDate(toDateInput(line.startDate));
    setModalEndDate(toDateInput(line.endDate));
    setEditModalOpen(true);
  };

  const handleInlineCategorySwitch = (line: any, newCategory: string) => {
    if (newCategory === "Period" && (!line.startDate || !line.endDate)) {
      setPendingCategoryLine(line);
      // Normalize to YYYY-MM-DD for the dialog's date inputs
      setCatStartDate(toDateInput(line.startDate));
      setCatEndDate(toDateInput(line.endDate));
      setCategoryDateDialogOpen(true);
    } else {
      categoryMutation.mutate({ id: line.id, category: newCategory, startDate: line.startDate, endDate: line.endDate } as any);
    }
  };

  const confirmCategoryWithDates = async () => {
    if (!pendingCategoryLine || !catStartDate || !catEndDate) return;
    try {
      await apiPut(`/api/po-lines/${pendingCategoryLine.id}/category`, {
        category: "Period",
        startDate: catStartDate,
        endDate: catEndDate,
      });
      queryClient.refetchQueries({ queryKey: ["/api/activity-based"], type: "active" });
      queryClient.refetchQueries({ queryKey: ["/api/period-based"], type: "active" });
      setCategoryDateDialogOpen(false);
      setPendingCategoryLine(null);
      toast({ title: "Updated", description: "Moved to Period-Based with dates." });
    } catch {
      toast({ title: "Error", description: "Failed to switch category.", variant: "destructive" });
    }
  };

  const getModalCalcPreview = () => {
    if (!editModalLine) return null;
    const curTU = parseFloat(modalCurTrueUp) || 0;
    const netAmount = editModalLine.netAmount || 0;
    const totalGrnToDate = editModalLine.totalGrnToDate || 0;
    const provisionPercent = editModalLine.provisionPercent;

    // Activity-Based formula: (PO × % completion) − GRN to date + True-up
    // If no % of completion is known yet, we can't compute a final provision
    if (provisionPercent == null) {
      return { hasPercent: false, curTU, netAmount, totalGrnToDate, finalProvision: null };
    }

    const fp = Math.round((netAmount * provisionPercent / 100) - totalGrnToDate + curTU);
    return {
      hasPercent: true,
      provisionPercent,
      netAmount,
      totalGrnToDate,
      curTU,
      finalProvision: fp,
    };
  };

  const saveEditModal = async () => {
    if (!editModalLine) return;
    const curTUCheck = parseFloat(modalCurTrueUp) || 0;
    if (curTUCheck < 0) {
      toast({ title: "Invalid value", description: "True-up cannot be negative.", variant: "destructive" });
      return;
    }
    const calcPreview = getModalCalcPreview();
    if (calcPreview?.hasPercent && calcPreview.finalProvision != null) {
      if (calcPreview.finalProvision < 0) {
        toast({ title: "Invalid value", description: "Final provision cannot be negative.", variant: "destructive" });
        return;
      }
    }

    // Detect if this item has already been responded to — if so, we need to reset after saving
    const hadResponse = editModalLine.assignmentStatus === "Responded" || editModalLine.assignmentStatus === "Returned";

    try {
      if (modalStartDate !== toDateInput(editModalLine.startDate) || modalEndDate !== toDateInput(editModalLine.endDate)) {
        await apiPut(`/api/po-lines/${editModalLine.id}/dates`, {
          startDate: modalStartDate,
          endDate: modalEndDate,
        });
      }
      const curTU = parseFloat(modalCurTrueUp) || 0;
      await apiPut(`/api/activity-based/${editModalLine.id}/true-up`, { field: "currentMonthTrueUp", value: curTU, processingMonth });
      await apiPut(`/api/activity-based/${editModalLine.id}/remarks`, { remarks: modalRemarks, processingMonth });
      if (modalCategory !== (editModalLine.category || "Activity")) {
        if (modalCategory === "Period" && (!modalStartDate || !modalEndDate)) {
          toast({ title: "Dates required", description: "Start and end dates are required to switch to Period-Based.", variant: "destructive" });
          return;
        }
        await apiPut(`/api/po-lines/${editModalLine.id}/category`, {
          category: modalCategory,
          startDate: modalStartDate || editModalLine.startDate,
          endDate: modalEndDate || editModalLine.endDate,
        });
      }

      if (hadResponse) {
        // Reset the business response — item will return to unassigned state
        await apiPost(`/api/activity-based/${editModalLine.id}/reset-response`, {});
      } else {
        // Only reassign if user explicitly changed assignment (for non-responded items)
        const originalIds: number[] = editModalLine.allAssignedUserIds?.length
          ? editModalLine.allAssignedUserIds
          : editModalLine.assignedToUserId ? [editModalLine.assignedToUserId] : [];
        const originalSet = new Set(originalIds);
        const usersChanged =
          modalAssignUsers.size !== originalSet.size ||
          Array.from(modalAssignUsers).some(id => !originalSet.has(id));
        if (modalAssignUsers.size > 0 && usersChanged) {
          await apiPost("/api/activity-based/assign", {
            poLineId: editModalLine.id,
            assignedToUserIds: Array.from(modalAssignUsers),
          });
        }
      }

      setEditModalOpen(false);
      await queryClient.refetchQueries({ queryKey: ["/api/activity-based"], type: "active" });
      await queryClient.refetchQueries({ queryKey: ["/api/activity-based/responses"], type: "active" });
      await queryClient.refetchQueries({ queryKey: ["/api/approvals/tracker"], type: "active" });
      await queryClient.refetchQueries({ queryKey: ["/api/period-based"], type: "active" });

      if (hadResponse) {
        // Prompt the assign dialog immediately
        setAssignOpen(true);
        setSelectedPo(editModalLine);
        setSelectedUsers(new Set());
        toast({ title: "Saved & Reset", description: "Changes saved. Business response cleared — please re-assign to a business user." });
      } else {
        toast({ title: "Saved", description: "All changes saved successfully." });
      }
    } catch (err: any) {
      await queryClient.refetchQueries({ queryKey: ["/api/activity-based"], type: "active" });
      await queryClient.refetchQueries({ queryKey: ["/api/activity-based/responses"], type: "active" });
      toast({ title: "Error", description: err?.message || "Failed to save changes.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search PO, vendor, description..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="input-search-activity" />
        </div>
        {filterMode === "unassigned" && (
          <span className="text-xs text-muted-foreground">Showing only unassigned PO lines</span>
        )}
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
                storageKey={`activity-all-${filterMode}`}
                minWidth={1340}
                data={lines}
                rowKey={(r: any) => r.id}
                emptyState={
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Activity className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No activity-based accruals</p>
                    <p className="text-xs text-muted-foreground">Upload PO data to see activity items</p>
                  </div>
                }
                columns={[
                  {
                    key: "poNumber", label: "PO Number", filterLabel: "PO Number",
                    width: 120, sticky: true,
                    tdClass: "font-mono font-semibold text-xs",
                    render: (l: any) => l.poNumber,
                  },
                  {
                    key: "poLineItem", label: "Line", width: 48, align: "center",
                    render: (l: any) => l.poLineItem,
                  },
                  {
                    key: "vendorName", label: "Vendor", width: 130,
                    render: (l: any) => <span className="truncate max-w-[120px] block">{l.vendorName}</span>,
                  },
                  {
                    key: "itemDescription", label: "Description", width: 170,
                    render: (l: any) => <span className="truncate max-w-[160px] block">{l.itemDescription}</span>,
                  },
                  {
                    key: "netAmount", label: "Net Amt", align: "right", width: 96,
                    filterValue: (l: any) => String(l.netAmount ?? ""),
                    tdClass: "font-mono",
                    render: (l: any) => formatAmount(l.netAmount),
                  },
                  {
                    key: "pendingPoValue",
                    label: <span className="inline-flex items-center gap-1 text-orange-700 dark:text-orange-400 font-semibold"><Calculator className="h-3 w-3" />Pending PO</span>,
                    filterLabel: "Pending PO", align: "right", width: 100,
                    tip: "Net PO value minus cumulative GRN to date — the remaining open commitment",
                    thClass: "bg-orange-50/70 dark:bg-orange-950/20",
                    tdClass: "font-mono font-semibold bg-orange-50/40 dark:bg-orange-950/10",
                    filterValue: (l: any) => String(l.pendingPoValue ?? ""),
                    render: (l: any) => (
                      <span className={l.pendingPoValue < 0 ? "text-destructive" : "text-orange-700 dark:text-orange-400"}>
                        {formatAmount(l.pendingPoValue)}
                      </span>
                    ),
                  },
                  {
                    key: "glAccount", label: "GL Acct", width: 72,
                    tip: "GL Account code for this PO line",
                    filterValue: (l: any) => l.glAccount || "-",
                    tdClass: "font-mono",
                    render: (l: any) => l.glAccount || "-",
                  },
                  {
                    key: "costCenter", label: "Cost Ctr", width: 78,
                    tip: "Cost Center code for this PO line",
                    filterValue: (l: any) => l.costCenter || "-",
                    tdClass: "font-mono",
                    render: (l: any) => l.costCenter || "-",
                  },
                  {
                    key: "startDate", label: "Start", width: 90,
                    tip: "PO contract start date",
                    filterValue: (l: any) => l.startDate || "-",
                    tdClass: "font-mono whitespace-nowrap",
                    render: (l: any) => l.startDate || "-",
                  },
                  {
                    key: "endDate", label: "End", width: 90,
                    tip: "PO contract end date",
                    filterValue: (l: any) => l.endDate || "-",
                    tdClass: "font-mono whitespace-nowrap",
                    render: (l: any) => l.endDate || "-",
                  },
                  {
                    key: "totalGrnToDate",
                    label: <span className="inline-flex items-center gap-1"><Calculator className="h-3 w-3" />GRN</span>,
                    filterLabel: "GRN", align: "right", width: 88,
                    tip: "Cumulative Goods Receipt Note value to date (derived)",
                    thClass: "bg-accent/30",
                    tdClass: "font-mono bg-accent/10",
                    filterValue: (l: any) => String(l.totalGrnToDate ?? ""),
                    render: (l: any) => (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help font-semibold">{formatAmount(l.totalGrnToDate)}</span>
                        </TooltipTrigger>
                        <TooltipContent>{l.totalGrnDateLabel ? `As of ${l.totalGrnDateLabel}` : "No GRN data"}</TooltipContent>
                      </Tooltip>
                    ),
                  },
                  {
                    key: "provisionPercent",
                    label: <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 font-semibold"><Calculator className="h-3 w-3" />% Done</span>,
                    filterLabel: "% Done", align: "right", width: 72,
                    tip: "Work completion percentage reported by the business user",
                    thClass: "bg-blue-50/60 dark:bg-blue-950/20",
                    tdClass: "font-mono bg-blue-50/30 dark:bg-blue-950/10",
                    filterValue: (l: any) => l.provisionPercent != null ? `${l.provisionPercent}%` : "—",
                    render: (l: any) => l.provisionPercent != null
                      ? <span className="font-semibold text-blue-700 dark:text-blue-400">{l.provisionPercent}%</span>
                      : <span className="text-muted-foreground">—</span>,
                  },
                  {
                    key: "prevMonthFinalProvision",
                    label: <span className="inline-flex items-center gap-1"><Calculator className="h-3 w-3" />Prev Prov.</span>,
                    filterLabel: "Prev Provision", align: "right", width: 86,
                    tip: "Final provision carried forward from the previous month",
                    thClass: "bg-muted/30",
                    tdClass: "font-mono bg-muted/10 text-muted-foreground",
                    filterValue: (l: any) => l.prevMonthFinalProvision != null ? String(l.prevMonthFinalProvision) : "—",
                    render: (l: any) => l.prevMonthFinalProvision != null
                      ? formatAmount(l.prevMonthFinalProvision)
                      : <span className="text-muted-foreground/50 italic text-[11px]">—</span>,
                  },
                  {
                    key: "finalProvision",
                    label: <span className="inline-flex items-center gap-1 font-semibold"><Calculator className="h-3 w-3" />Final Prov.</span>,
                    filterLabel: "Final Provision", align: "right", width: 94,
                    tip: "Final provision: includes carry-forward, true-ups, and GRN. Derived from business user % when dates are not set.",
                    thClass: "bg-primary/10",
                    tdClass: "font-mono font-medium bg-primary/5",
                    filterValue: (l: any) => l.finalProvision != null ? String(l.finalProvision) : "Pending",
                    render: (l: any) => l.finalProvision != null
                      ? <span className={l.finalProvision < 0 ? "text-destructive" : ""}>{formatAmount(l.finalProvision)}</span>
                      : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground/50 italic cursor-help text-[11px]">Pending %</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {l.isAssigned ? "Awaiting business user % of completion" : "Not yet assigned"}
                          </TooltipContent>
                        </Tooltip>
                      ),
                  },
                  {
                    key: "assignedToName", label: "Assigned To", width: 110,
                    tip: "Business user assigned to verify this PO",
                    filterValue: (l: any) => l.assignedToName || "Unassigned",
                    render: (l: any) => l.assignedToName || <span className="text-muted-foreground/50">—</span>,
                  },
                  {
                    key: "assignmentStatus", label: "Status", width: 90,
                    tip: "Current assignment/approval status",
                    filterValue: (l: any) => l.assignmentStatus || "Not Assigned",
                    render: (l: any) => statusBadge(l.assignmentStatus || "Not Assigned"),
                  },
                  {
                    key: "category", label: "Category", width: 96,
                    render: (l: any) => can("activity_based", "canEdit") ? (
                      <Select value={l.category || "Activity"} onValueChange={val => handleInlineCategorySwitch(l, val)}>
                        <SelectTrigger className="h-7 text-xs w-[88px]" data-testid={`select-category-${l.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Period">Period</SelectItem>
                          <SelectItem value="Activity">Activity</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : <span className="text-xs">{l.category || "Activity"}</span>,
                  },
                  {
                    key: "_actions", label: "Actions", width: 80, noFilter: true, sortable: false,
                    render: (l: any) => can("activity_based", "canCreate") ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                        onClick={() => { setSelectedPo(l); setAssignOpen(true); }}
                        data-testid={`button-assign-${l.id}`}>
                        <UserPlus className="h-3 w-3 mr-1" />Assign
                      </Button>
                    ) : null,
                  },
                  ...(can("activity_based", "canEdit") ? [{
                    key: "_edit", label: "Edit", width: 48, noFilter: true, sortable: false, align: "center" as const,
                    render: (l: any) => (
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => openEditModal(l)} data-testid={`button-edit-row-${l.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ),
                  }] : []),
                ] as ColDef[]}
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

      <Dialog open={assignOpen} onOpenChange={open => { setAssignOpen(open); if (!open) setSelectedUsers(new Set()); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign PO {selectedPo?.poNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <p className="text-muted-foreground">Vendor: {selectedPo?.vendorName}</p>
              <p className="text-muted-foreground">Amount: {formatAmount(selectedPo?.netAmount)}</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Select Assignees <span className="text-xs text-muted-foreground font-normal">(multiple allowed)</span></p>
              {businessUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No business users available.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {businessUsers.map((u: any) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/60">
                      <Checkbox
                        checked={selectedUsers.has(u.id)}
                        onCheckedChange={(checked: boolean | "indeterminate") => {
                          setSelectedUsers(prev => {
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
              {selectedUsers.size > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{selectedUsers.size} user(s) selected</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignOpen(false); setSelectedUsers(new Set()); }}>Cancel</Button>
            <Button
              onClick={() => selectedPo && selectedUsers.size > 0 && assignMutation.mutate({
                poLineId: selectedPo.id,
                assignedToUserIds: Array.from(selectedUsers),
              })}
              disabled={selectedUsers.size === 0 || assignMutation.isPending}
              data-testid="button-confirm-assign"
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              Assign ({selectedUsers.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-row-activity">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Line - PO {editModalLine?.poNumber} / {editModalLine?.poLineItem}
            </DialogTitle>
            <DialogDescription>
              {editModalLine?.vendorName} - {editModalLine?.itemDescription}
            </DialogDescription>
          </DialogHeader>

          {editModalLine && (() => {
            const calcPreview = getModalCalcPreview();
            const prevLabel = prevMonthLabel;
            const curLabel = monthLabel;
            return (
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
                    <div><span className="text-muted-foreground">Total GRN to Date:</span> <span className="font-mono">{formatAmount(editModalLine.totalGrnToDate)}</span></div>
                    <div><span className="text-muted-foreground">% Completion:</span> <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">{editModalLine.provisionPercent != null ? `${editModalLine.provisionPercent}%` : "Not yet reported"}</span></div>
                    <div><span className="text-muted-foreground">Status:</span> {statusBadge(editModalLine.assignmentStatus || "Not Assigned")}</div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Pencil className="h-3.5 w-3.5" />
                  Editable Fields
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="modal-start-date" className="text-xs font-medium">Start Date</Label>
                    <Input
                      id="modal-start-date"
                      type="date"
                      value={modalStartDate}
                      onChange={e => setModalStartDate(e.target.value)}
                      data-testid="input-modal-start-date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="modal-end-date" className="text-xs font-medium">End Date</Label>
                    <Input
                      id="modal-end-date"
                      type="date"
                      value={modalEndDate}
                      onChange={e => setModalEndDate(e.target.value)}
                      data-testid="input-modal-end-date"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Start and end dates define the contract window for reference. Provision for Activity-Based is calculated from the business user's reported % of completion, not daily proration.
                </p>

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
                    <SelectTrigger data-testid="select-modal-activity-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Period">Period-Based</SelectItem>
                      <SelectItem value="Activity">Activity-Based</SelectItem>
                    </SelectContent>
                  </Select>
                  {modalCategory === "Period" && (!modalStartDate || !modalEndDate) && (
                    <p className="text-[11px] text-destructive leading-tight font-medium">
                      Start and end dates are required to switch to Period-Based. Please enter dates above.
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    <strong>Period-Based:</strong> Provision is calculated proportionally over the contract duration based on elapsed days.
                    <strong> Activity-Based:</strong> Provision is determined by actual work completion reported by the assigned business user.
                    Changing category moves this line to the other module.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Assign to Business Users <span className="font-normal text-muted-foreground">(multiple allowed)</span></Label>
                  {businessUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No business users available.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto border rounded-md p-2">
                      {businessUsers.map((u: any) => (
                        <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-1 hover:bg-muted/50">
                          <Checkbox
                            checked={modalAssignUsers.has(u.id)}
                            onCheckedChange={(checked: boolean | "indeterminate") => {
                              setModalAssignUsers(prev => {
                                const next = new Set(prev);
                                if (checked === true) next.add(u.id); else next.delete(u.id);
                                return next;
                              });
                            }}
                            data-testid={`checkbox-modal-assign-${u.id}`}
                          />
                          <span>{u.name}</span>
                          <span className="text-muted-foreground text-xs">({u.email})</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {modalAssignUsers.size > 0 && (
                    <p className="text-[11px] text-muted-foreground">{modalAssignUsers.size} user(s) selected</p>
                  )}
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Assign one or more business users to confirm activity completion.
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
                  <p className="text-[11px] text-muted-foreground italic">
                    Formula: (Net Amount × % Completion) − GRN to Date + True-Up
                  </p>
                  {calcPreview?.hasPercent ? (
                    <div className="space-y-1 text-sm font-mono">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Net Amount</span>
                        <span>{formatAmount(calcPreview.netAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">× % Completion</span>
                        <span className="text-blue-700 dark:text-blue-400 font-semibold">{calcPreview.provisionPercent}%</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">= Gross Provision</span>
                        <span>{formatAmount(Math.round((calcPreview.netAmount * calcPreview.provisionPercent) / 100))}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t pt-1 mt-1">
                        <span className="text-muted-foreground">− GRN to Date</span>
                        <span>{formatAmount(calcPreview.totalGrnToDate)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">+ {curLabel} True-Up</span>
                        <span className={(parseFloat(modalCurTrueUp) || 0) !== (editModalLine.currentMonthTrueUp || 0) ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>{formatAmount(parseFloat(modalCurTrueUp) || 0)}</span>
                      </div>
                      <div className={`flex items-center justify-between gap-4 border-t pt-1 text-base ${calcPreview.finalProvision! < 0 ? "text-destructive" : ""}`}>
                        <span className="font-bold">= Final Provision</span>
                        <span className="font-bold">{formatAmount(calcPreview.finalProvision)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-2 text-center">
                      <p className="italic">
                        {editModalLine.isAssigned
                          ? "Awaiting business user response with % of completion"
                          : "Assign a business user to report % of completion"}
                      </p>
                      <p className="text-[11px] mt-1">Final provision will be calculated once % is available.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            );
          })()}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditModalOpen(false)} data-testid="button-cancel-edit-modal-activity">Cancel</Button>
            <Button onClick={saveEditModal} data-testid="button-save-edit-modal-activity">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDateDialogOpen} onOpenChange={setCategoryDateDialogOpen}>
        <DialogContent data-testid="dialog-category-dates">
          <DialogHeader>
            <DialogTitle>Enter Contract Dates</DialogTitle>
            <DialogDescription>
              Start and end dates are required to switch PO {pendingCategoryLine?.poNumber} to Period-Based accruals.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Start Date</Label>
              <Input
                type="date"
                value={catStartDate}
                onChange={e => setCatStartDate(e.target.value)}
                data-testid="input-cat-start-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">End Date</Label>
              <Input
                type="date"
                value={catEndDate}
                onChange={e => setCatEndDate(e.target.value)}
                data-testid="input-cat-end-date"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCategoryDateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmCategoryWithDates}
              disabled={!catStartDate || !catEndDate}
              data-testid="button-confirm-cat-dates"
            >
              Switch to Period-Based
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssignedTab() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ["/api/activity-based/responses"],
    queryFn: () => apiGet<any[]>("/api/activity-based/responses"),
    staleTime: 0,
  });

  const nudgeMutation = useMutation({
    mutationFn: (assignmentId: number) => apiPost(`/api/activity-based/${assignmentId}/nudge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/responses"] });
      toast({ title: "Nudge sent", description: "Business user has been notified." });
    },
    onError: (err: any) => toast({ title: "Failed to nudge", description: err.message, variant: "destructive" }),
  });

  const recallMutation = useMutation({
    mutationFn: (assignmentId: number) =>
      apiPost<{ success: boolean; fullyRecalled: boolean }>(`/api/activity-based/${assignmentId}/recall`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/responses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
      toast({ title: "Recalled", description: "Assignment recalled. PO line returned to unassigned list." });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  // Assigned but awaiting response (exclude recalled, returned, responded, submitted, approved)
  const assignedItems = (responses as any[]).filter((r: any) =>
    !r.hasResponse && r.status !== "Recalled" && r.status !== "Returned" && r.status !== "Submitted" && r.status !== "Approved"
  );

  const filtered = assignedItems.filter((r: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.poNumber?.toLowerCase().includes(q) ||
      r.vendorName?.toLowerCase().includes(q) ||
      r.itemDescription?.toLowerCase().includes(q) ||
      r.assignedToName?.toLowerCase().includes(q) ||
      r.costCenter?.toLowerCase().includes(q)
    );
  });

  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  if (isLoading) return (
    <div className="space-y-3 p-2">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search PO, vendor, user..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} awaiting response</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle className="h-10 w-10 text-green-400/60 mb-3" />
          <p className="text-sm font-medium">All assigned items have been responded to</p>
          <p className="text-xs text-muted-foreground mt-1">Check the Responded tab for details</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-2">
            <DataTable
              storageKey="activity-assigned"
              minWidth={900}
              data={filtered}
              rowKey={(r: any) => r.assignmentId}
              emptyState={<p className="text-sm text-muted-foreground">No assigned PO lines</p>}
              columns={[
                { key: "poNumber", label: "PO Number", width: 120, sticky: true, tdClass: "font-mono font-semibold text-xs", render: (r: any) => r.poNumber },
                { key: "poLineItem", label: "Line", width: 48, align: "center", render: (r: any) => r.poLineItem },
                { key: "vendorName", label: "Vendor", width: 130, render: (r: any) => <span className="truncate max-w-[120px] block">{r.vendorName}</span> },
                { key: "itemDescription", label: "Description", width: 170, render: (r: any) => <span className="truncate max-w-[160px] block">{r.itemDescription}</span> },
                { key: "netAmount", label: "Net Amt", align: "right", width: 90, tdClass: "font-mono", filterValue: (r: any) => String(r.netAmount ?? ""), render: (r: any) => formatAmount(r.netAmount) },
                {
                  key: "_pendingPo", label: "Pending PO", filterLabel: "Pending PO", align: "right", width: 96,
                  tip: "Net PO value minus cumulative GRN to date — the remaining open commitment",
                  tdClass: "font-mono font-semibold text-orange-700 dark:text-orange-400",
                  filterValue: (r: any) => r.netAmount != null && r.totalGrnToDate != null ? String(r.netAmount - r.totalGrnToDate) : "—",
                  render: (r: any) => r.netAmount != null && r.totalGrnToDate != null ? formatAmount(r.netAmount - r.totalGrnToDate) : "—",
                },
                { key: "assignedToName", label: "Assigned To", width: 120, tip: "Business user assigned to verify this PO", filterValue: (r: any) => r.assignedToName || "—", render: (r: any) => r.assignedToName || "—" },
                { key: "assignedDate", label: "Assigned On", width: 100, tip: "Date the PO was assigned to the business user", filterValue: (r: any) => fmtDate(r.assignedDate) || "-", tdClass: "text-muted-foreground whitespace-nowrap", render: (r: any) => fmtDate(r.assignedDate) },
                { key: "status", label: "Status", width: 90, tip: "Current assignment status", filterValue: (r: any) => r.status || "Assigned", render: (r: any) => statusBadge(r.status || "Assigned") },
                {
                  key: "nudgeCount", label: "Nudges", width: 72, align: "center", noFilter: true,
                  tip: "Number of reminder nudges sent to the business user",
                  render: (r: any) => (
                    <span className={`font-mono font-medium ${(r.nudgeCount ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {r.nudgeCount ?? 0}
                    </span>
                  ),
                },
                ...(can("activity_based", "canEdit") ? [{
                  key: "_actions", label: "Actions", width: 140, noFilter: true, sortable: false,
                  render: (r: any) => (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                        onClick={() => nudgeMutation.mutate(r.assignmentId)} disabled={nudgeMutation.isPending}>
                        <Send className="h-3 w-3 mr-1" />Nudge
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => recallMutation.mutate(r.assignmentId)} disabled={recallMutation.isPending}>
                        Recall
                      </Button>
                    </div>
                  ),
                }] as ColDef[] : []),
              ] as ColDef[]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RespondedTab() {
  const { can } = usePermissions();
  const { processingMonth } = useProcessingMonth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Submit for approval
  const [submitModalItem, setSubmitModalItem] = useState<any>(null);
  const [selectedApprovers, setSelectedApprovers] = useState<Set<number>>(new Set());
  const [ruleMatchResult, setRuleMatchResult] = useState<any>(null);
  const [ruleMatchLoading, setRuleMatchLoading] = useState(false);

  // Re-assign (for Returned items OR after edit)
  const [reassignItem, setReassignItem] = useState<any>(null);
  const [reassignUsers, setReassignUsers] = useState<Set<number>>(new Set());

  // Edit before re-assign
  const [editItem, setEditItem] = useState<any>(null);
  const [editCurTrueUp, setEditCurTrueUp] = useState("0");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ["/api/activity-based/responses"],
    queryFn: () => apiGet<any[]>("/api/activity-based/responses"),
    staleTime: 0,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiGet<any[]>("/api/users"),
  });

  const financeApprovers = (users as any[]).filter((u: any) =>
    u.roles?.includes("Finance Approver") || u.roles?.includes("Finance Admin")
  );
  const businessUsers = (users as any[]).filter((u: any) =>
    u.roles?.includes("Business User")
  );

  const submitForApprovalMutation = useMutation({
    mutationFn: ({ assignmentId }: { assignmentId: number }) =>
      apiPost(`/api/activity-based/${assignmentId}/submit-for-approval`, {
        approverIds: Array.from(selectedApprovers),
        processingMonth,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/responses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based/approval-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity-based"] });
      setSubmitModalItem(null);
      setSelectedApprovers(new Set());
      toast({ title: "Submitted for Approval", description: "Item sent to Finance Approver." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reassignMutation = useMutation({
    mutationFn: (data: any) => apiPost("/api/activity-based/assign", data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/activity-based/responses"], type: "active" });
      queryClient.refetchQueries({ queryKey: ["/api/activity-based"], type: "active" });
      setReassignItem(null);
      setReassignUsers(new Set());
      toast({ title: "Re-assigned", description: "PO re-assigned to selected user(s)." });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed to re-assign.", variant: "destructive" }),
  });

  const openSubmitModal = async (r: any) => {
    setSubmitModalItem(r);
    setSelectedApprovers(new Set());
    setRuleMatchResult(null);
    setRuleMatchLoading(true);
    try {
      const result = await apiPost<any>("/api/rules/match", { poLineIds: [r.poLineId] });
      setRuleMatchResult(result);
      if (result.suggestedApproverIds?.length > 0) {
        setSelectedApprovers(new Set(result.suggestedApproverIds));
      }
    } catch {
      // If rule matching fails, leave approver selection empty
    } finally {
      setRuleMatchLoading(false);
    }
  };

  const openEdit = (r: any) => {
    setEditItem(r);
    setEditCurTrueUp(String(r.financeTrueUp ?? r.currentMonthTrueUp ?? 0));
    setEditStartDate(r.startDate ? r.startDate.slice(0, 10) : "");
    setEditEndDate(r.endDate ? r.endDate.slice(0, 10) : "");
    setEditRemarks(r.financeRemarks ?? "");
  };

  const saveEditAndReset = async () => {
    if (!editItem) return;
    setEditSaving(true);
    try {
      // 1. Save edits to the PO line
      if (editStartDate || editEndDate) {
        await apiPut(`/api/po-lines/${editItem.poLineId}/dates`, {
          startDate: editStartDate || editItem.startDate,
          endDate: editEndDate || editItem.endDate,
        });
      }
      await apiPut(`/api/activity-based/${editItem.poLineId}/true-up`, {
        field: "currentMonthTrueUp",
        value: parseFloat(editCurTrueUp) || 0,
        processingMonth,
      });
      await apiPut(`/api/activity-based/${editItem.poLineId}/remarks`, {
        remarks: editRemarks,
        processingMonth,
      });

      // 2. Clear business response + recall assignment so item goes back to unassigned
      await apiPost(`/api/activity-based/${editItem.poLineId}/reset-response`, {});

      // 3. Refresh data
      await queryClient.refetchQueries({ queryKey: ["/api/activity-based/responses"], type: "active" });
      await queryClient.refetchQueries({ queryKey: ["/api/activity-based"], type: "active" });

      // 4. Close edit modal and immediately open the assign dialog
      const savedItem = { ...editItem };
      setEditItem(null);
      setReassignItem(savedItem);
      setReassignUsers(new Set());

      toast({ title: "Saved", description: "Changes saved. Please re-assign to a business user." });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save changes.", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const respondedItems = (responses as any[]).filter((r: any) =>
    r.status === "Responded" || r.status === "Returned"
  );

  const filtered = respondedItems.filter((r: any) => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      r.poNumber?.toLowerCase().includes(q) ||
      r.vendorName?.toLowerCase().includes(q) ||
      r.itemDescription?.toLowerCase().includes(q) ||
      r.assignedToName?.toLowerCase().includes(q) ||
      r.costCenter?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "responded" && r.status === "Responded") ||
      (statusFilter === "returned" && r.status === "Returned");
    return matchSearch && matchStatus;
  });

  const respondedCount = respondedItems.filter((r: any) => r.status === "Responded").length;
  const returnedCount = respondedItems.filter((r: any) => r.status === "Returned").length;

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Edit modal (edit PO details → reset response → re-assign) ── */}
      <Dialog open={!!editItem} onOpenChange={open => { if (!open) setEditItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Edit PO Line — {editItem?.poNumber} / {editItem?.poLineItem}
            </DialogTitle>
            <DialogDescription>
              Editing will clear the existing business user response. You will need to re-assign to a business user after saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Warning banner */}
            <div className="rounded border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <RefreshCw className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>The business user's response will be cleared and the workflow will restart from the assignment step.</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Start Date</Label>
                <Input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">End Date</Label>
                <Input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Current Month True-Up</Label>
              <Input
                type="number"
                step="0.01"
                value={editCurTrueUp}
                onChange={e => setEditCurTrueUp(e.target.value)}
                className="h-8 text-xs font-mono"
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Remarks / Finance Notes</Label>
              <Textarea
                value={editRemarks}
                onChange={e => setEditRemarks(e.target.value)}
                placeholder="Optional finance remarks..."
                rows={2}
                className="text-xs resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)} disabled={editSaving}>Cancel</Button>
            <Button onClick={saveEditAndReset} disabled={editSaving}>
              {editSaving
                ? <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />Saving...</>
                : <><Pencil className="h-3.5 w-3.5 mr-2" />Save & Re-assign</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Submit for Approval modal ── */}
      <Dialog open={!!submitModalItem} onOpenChange={open => { if (!open) { setSubmitModalItem(null); setSelectedApprovers(new Set()); setRuleMatchResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileCheck className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base">Submit for Approval</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {submitModalItem ? `${submitModalItem.poNumber} / ${submitModalItem.poLineItem} — ${submitModalItem.vendorName}` : "Send for Finance review"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {submitModalItem && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                <div><span className="text-muted-foreground text-xs">Responded by</span><p className="font-medium text-sm">{submitModalItem.assignedToName}</p></div>
                {submitModalItem.provisionPercent != null && (
                  <div><span className="text-muted-foreground text-xs">% Completion</span><p className="font-semibold text-sm text-blue-700 dark:text-blue-400">{submitModalItem.provisionPercent}%</p></div>
                )}
                {submitModalItem.activityProvision != null && (
                  <div><span className="text-muted-foreground text-xs">Provision</span><p className="font-mono font-semibold text-sm">₹{formatAmount(submitModalItem.activityProvision)}</p></div>
                )}
              </div>

              {ruleMatchLoading ? (
                <div className="space-y-2">
                  <div className="h-14 rounded-lg bg-muted/40 animate-pulse" />
                  <div className="h-12 rounded-lg bg-muted/40 animate-pulse" />
                </div>
              ) : (
                <>
                  {ruleMatchResult?.matchedRules?.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-900 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Smart Suggestions Active</p>
                      </div>
                      {ruleMatchResult.matchedRules.map((mr: any) => (
                        <div key={mr.id} className="flex items-center gap-2 text-xs">
                          <Gavel className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span className="font-medium text-amber-800 dark:text-amber-300">{mr.ruleName}</span>
                        </div>
                      ))}
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">Suggested approvers are pre-selected. You can modify the selection.</p>
                    </div>
                  )}

                  {ruleMatchResult && ruleMatchResult.matchedRules?.length === 0 && (
                    <div className="rounded-xl border border-muted bg-muted/30 p-3 flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground">No active rules match this line. Select approvers manually.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Users className="h-3 w-3" /> Finance Approvers
                      </Label>
                      {financeApprovers.length > 0 && (
                        <button
                          className="text-[11px] text-primary hover:underline"
                          onClick={() => {
                            if (selectedApprovers.size === financeApprovers.length) {
                              setSelectedApprovers(new Set());
                            } else {
                              setSelectedApprovers(new Set(financeApprovers.map((u: any) => u.id)));
                            }
                          }}
                        >
                          {selectedApprovers.size === financeApprovers.length ? "Deselect all" : "Select all"}
                        </button>
                      )}
                    </div>

                    {financeApprovers.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center">
                        <p className="text-sm text-muted-foreground">No finance approvers found.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {financeApprovers.map((u: any) => {
                          const isSuggested = ruleMatchResult?.suggestedApproverIds?.includes(u.id);
                          const isSelected = selectedApprovers.has(u.id);
                          return (
                            <div
                              key={u.id}
                              onClick={() => {
                                setSelectedApprovers(prev => {
                                  const next = new Set(prev);
                                  if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                                  return next;
                                });
                              }}
                              className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all select-none
                                ${isSelected
                                  ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                                }`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => {}}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium truncate">{u.name}</p>
                                  {isSuggested && (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900 shrink-0">
                                      <Sparkles className="h-2 w-2" /> Suggested
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{u.roles?.join(", ")}</p>
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
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setSubmitModalItem(null); setSelectedApprovers(new Set()); setRuleMatchResult(null); }}>Cancel</Button>
            <Button
              onClick={() => submitForApprovalMutation.mutate({ assignmentId: submitModalItem.assignmentId })}
              disabled={selectedApprovers.size === 0 || submitForApprovalMutation.isPending || ruleMatchLoading}
            >
              {submitForApprovalMutation.isPending
                ? <><span className="h-3.5 w-3.5 mr-1.5 border-2 border-background/40 border-t-background rounded-full animate-spin inline-block" />Submitting...</>
                : <><FileCheck className="h-4 w-4 mr-2" />Submit for Approval</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Re-assign modal (for Returned items OR after edit) ── */}
      <Dialog open={!!reassignItem} onOpenChange={open => { if (!open) { setReassignItem(null); setReassignUsers(new Set()); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-amber-600" />
              Assign PO {reassignItem?.poNumber} to Business User
            </DialogTitle>
            <DialogDescription>
              {reassignItem?.returnComments
                ? "This item was returned by the business user. Re-assign it to the same or a different user."
                : "Select a business user to collect the updated % of completion."}
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
              <p><span className="text-muted-foreground">Vendor:</span> {reassignItem?.vendorName}</p>
              <p><span className="text-muted-foreground">Net Amount:</span> <span className="font-mono font-medium">₹{formatAmount(reassignItem?.netAmount)}</span></p>
              <p><span className="text-muted-foreground">Previously assigned to:</span> <span className="font-medium">{reassignItem?.assignedToName}</span></p>
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
                poLineId: reassignItem.poLineId ?? reassignItem.id,
                assignedToUserIds: Array.from(reassignUsers),
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
          <Input placeholder="Search PO, vendor, description, user..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5">
          {[
            { v: "all",       label: `All (${respondedItems.length})` },
            { v: "responded", label: `Responded (${respondedCount})` },
            { v: "returned",  label: `Returned (${returnedCount})` },
          ].map(({ v, label }) => (
            <Button key={v} size="sm" variant={statusFilter === v ? "default" : "outline"} className="text-xs" onClick={() => setStatusFilter(v)}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-2">
          <DataTable
            storageKey="activity-responded"
            minWidth={1200}
            data={filtered}
            rowKey={(r: any) => r.assignmentId}
            rowClass={(r: any) => r.status === "Returned" ? "bg-red-50/30 dark:bg-red-950/10" : undefined}
            emptyState={
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm font-medium">No responded or returned items</p>
                <p className="text-xs text-muted-foreground">Business user responses will appear here</p>
              </div>
            }
            columns={[
              { key: "poNumber", label: "PO Number", width: 120, sticky: true, tdClass: "font-mono font-semibold text-xs", render: (r: any) => r.poNumber },
              { key: "poLineItem", label: "Line", width: 48, align: "center", render: (r: any) => r.poLineItem },
              { key: "vendorName", label: "Vendor", width: 130, render: (r: any) => <span className="truncate max-w-[120px] block">{r.vendorName}</span> },
              { key: "itemDescription", label: "Description", width: 160, render: (r: any) => <span className="truncate max-w-[150px] block">{r.itemDescription}</span> },
              { key: "netAmount", label: "Net Amt", align: "right", width: 90, tdClass: "font-mono", filterValue: (r: any) => String(r.netAmount ?? ""), render: (r: any) => formatAmount(r.netAmount) },
              {
                key: "totalGrnToDate",
                label: <span className="inline-flex items-center gap-1"><Calculator className="h-3 w-3" />GRN to Date</span>,
                filterLabel: "GRN to Date", align: "right", width: 96,
                tip: "Cumulative Goods Receipt Note value to date (derived)",
                thClass: "bg-accent/30", tdClass: "font-mono font-semibold bg-accent/10",
                filterValue: (r: any) => String(r.totalGrnToDate ?? ""),
                render: (r: any) => formatAmount(r.totalGrnToDate),
              },
              {
                key: "provisionPercent",
                label: <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400"><Calculator className="h-3 w-3" />% Done</span>,
                filterLabel: "% Done", align: "right", width: 76,
                tip: "Work completion percentage reported by the business user",
                thClass: "bg-blue-50/60 dark:bg-blue-950/20", tdClass: "font-mono bg-blue-50/30 dark:bg-blue-950/10",
                filterValue: (r: any) => r.provisionPercent != null ? `${r.provisionPercent}%` : "—",
                render: (r: any) => r.provisionPercent != null
                  ? <span className="font-semibold text-blue-700 dark:text-blue-400">{r.provisionPercent}%</span>
                  : <span className="text-muted-foreground/50">—</span>,
              },
              {
                key: "activityProvision",
                label: <span className="inline-flex items-center gap-1 font-semibold"><Calculator className="h-3 w-3" />Provision</span>,
                filterLabel: "Provision", align: "right", width: 100,
                tip: "Provision amount suggested by the business user based on % completion",
                thClass: "bg-primary/10", tdClass: "font-mono font-medium bg-primary/5",
                filterValue: (r: any) => r.activityProvision != null ? String(r.activityProvision) : "—",
                render: (r: any) => r.activityProvision != null
                  ? formatAmount(r.activityProvision)
                  : <span className="text-muted-foreground/50 italic text-[11px]">—</span>,
              },
              {
                key: "completionStatus", label: "Completion", width: 96,
                tip: "Completion status as reported by the business user",
                filterValue: (r: any) => r.completionStatus || "—",
                render: (r: any) => r.completionStatus
                  ? <span className="text-blue-700 dark:text-blue-400 font-medium">{r.completionStatus}</span>
                  : <span className="text-muted-foreground/50">—</span>,
              },
              { key: "assignedToName", label: "Assigned To", width: 120, tip: "Business user who responded", filterValue: (r: any) => r.assignedToName || "—", render: (r: any) => r.assignedToName || <span className="text-muted-foreground/50">—</span> },
              {
                key: "responseDate", label: "Response Date", width: 110, tip: "Date the business user submitted their response",
                filterValue: (r: any) => r.responseDate ? new Date(r.responseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—",
                tdClass: "font-mono whitespace-nowrap text-muted-foreground",
                render: (r: any) => r.responseDate
                  ? new Date(r.responseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                  : <span className="text-muted-foreground/50">—</span>,
              },
              { key: "status", label: "Status", width: 90, filterValue: (r: any) => r.status || "—", render: (r: any) => statusBadge(r.status) },
              {
                key: "_comments", label: "Comments / Return", width: 180, noFilter: true,
                render: (r: any) => {
                  const isReturned = r.status === "Returned";
                  if (isReturned && r.returnComments) return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-start gap-1 cursor-help max-w-[170px]">
                          <CornerUpLeft className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                          <span className="truncate italic text-destructive/80">{r.returnComments}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs whitespace-pre-wrap">{r.returnComments}</TooltipContent>
                    </Tooltip>
                  );
                  if (r.comments) return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate italic text-muted-foreground cursor-help max-w-[170px] block">{r.comments}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs whitespace-pre-wrap">{r.comments}</TooltipContent>
                    </Tooltip>
                  );
                  return <span className="text-muted-foreground/40">—</span>;
                },
              },
              {
                key: "_actions", label: "Actions", width: 190, noFilter: true, sortable: false, align: "center",
                render: (r: any) => {
                  const isReturned = r.status === "Returned";
                  return (
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {can("activity_based", "canEdit") && (
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => openEdit(r)}>
                          <Pencil className="h-3 w-3 mr-1" />Edit
                        </Button>
                      )}
                      {isReturned
                        ? can("activity_based", "canCreate") && (
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400"
                            onClick={() => { setReassignItem(r); setReassignUsers(new Set()); }}>
                            <UserPlus className="h-3 w-3 mr-1" />Re-assign
                          </Button>
                        )
                        : can("activity_based", "canEdit") && (
                          <Button size="sm" className="h-7 text-xs"
                            onClick={() => openSubmitModal(r)}>
                            <FileCheck className="h-3 w-3 mr-1" />Submit
                          </Button>
                        )}
                    </div>
                  );
                },
              },
            ] as ColDef[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ActivityBasedPage() {
  const [activeTab, setActiveTab] = useState("all");
  const { processingMonth } = useProcessingMonth();

  const { data: allData } = useQuery({
    queryKey: ["/api/activity-based", processingMonth, 0, PAGE_SIZE, "", "all"],
    queryFn: () =>
      apiGet<{ data: any[]; total: number; page: number; limit: number }>(
        `/api/activity-based?processingMonth=${processingMonth}&page=0&limit=${PAGE_SIZE}`
      ),
    staleTime: 30_000,
  });

  const { data: unassignedData } = useQuery({
    queryKey: ["/api/activity-based", processingMonth, 0, PAGE_SIZE, "", "unassigned"],
    queryFn: () =>
      apiGet<{ data: any[]; total: number; page: number; limit: number }>(
        `/api/activity-based?processingMonth=${processingMonth}&page=0&limit=${PAGE_SIZE}&hideAssigned=true`
      ),
    staleTime: 30_000,
  });

  const { data: responses = [] } = useQuery({
    queryKey: ["/api/activity-based/responses"],
    queryFn: () => apiGet<any[]>("/api/activity-based/responses"),
    staleTime: 30_000,
  });

  const assignedCount = (responses as any[]).filter(
    (r: any) => !r.hasResponse && r.status !== "Recalled" && r.status !== "Returned" && r.status !== "Submitted" && r.status !== "Approved"
  ).length;
  const respondedCount = (responses as any[]).filter(
    (r: any) => r.status === "Responded" || r.status === "Returned"
  ).length;
  const unassignedCount = unassignedData?.total ?? 0;
  const allCount = allData?.total ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Activity-Based Accruals</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage PO assignments and business user responses</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 inline-flex items-center gap-0.5 rounded-lg bg-muted p-1">
          <TabsTrigger value="all" className="rounded-md px-4 text-sm data-[state=active]:shadow-sm">
            All POs
            {allCount > 0 && (
              <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[11px] font-medium leading-none">
                {allCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="unassigned" className="rounded-md px-4 text-sm data-[state=active]:shadow-sm">
            Unassigned
            {unassignedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[11px] font-medium leading-none">
                {unassignedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="assigned" className="rounded-md px-4 text-sm data-[state=active]:shadow-sm">
            Assigned
            {assignedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 text-[11px] font-medium leading-none">
                {assignedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="responded" className="rounded-md px-4 text-sm data-[state=active]:shadow-sm">
            Responded / Returned
            {respondedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-green-500/20 text-green-700 dark:text-green-400 px-1.5 py-0.5 text-[11px] font-medium leading-none">
                {respondedCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <AssignmentTab filterMode="all" />
        </TabsContent>
        <TabsContent value="unassigned" className="mt-4">
          <AssignmentTab filterMode="unassigned" />
        </TabsContent>
        <TabsContent value="assigned" className="mt-4">
          <AssignedTab />
        </TabsContent>
        <TabsContent value="responded" className="mt-4">
          <RespondedTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
