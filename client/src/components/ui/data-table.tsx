/**
 * Generic DataTable with:
 *  - Google Sheets–style per-column filters
 *  - Drag-to-reorder columns
 *  - Sort by column
 */
import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Filter, X, CheckSquare, Square, Search,
  ChevronUp, ChevronDown, GripVertical, SlidersHorizontal,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface ColDef<T = any> {
  key: string;
  label: React.ReactNode;
  /** Plain-text label used in filter popup header (falls back to key) */
  filterLabel?: string;
  /** Width in px or CSS string */
  width?: number | string;
  align?: "left" | "right" | "center";
  /** Sticky left column (also disables drag) */
  sticky?: boolean;
  /** Disable drag-to-reorder for this column */
  noDrag?: boolean;
  /** Custom className on <th> */
  thClass?: string;
  /** Custom className on <td> */
  tdClass?: string;
  /** Disable filter for this column */
  noFilter?: boolean;
  /** Custom value extractor for filter (defaults to String(row[key])) */
  filterValue?: (row: T) => string;
  /** Render cell */
  render: (row: T, index: number) => React.ReactNode;
  /** Whether column is sortable (sorts by filterValue or String(row[key])) */
  sortable?: boolean;
  /** Tooltip shown on column header hover — explains how the value is calculated/derived */
  tip?: React.ReactNode;
}

/* ─── Filter Popover ────────────────────────────────────────────────────────── */

interface FilterPopoverProps {
  label: string;
  uniqueValues: string[];
  selected: Set<string>;
  onApply: (s: Set<string>) => void;
  onClear: () => void;
  isActive: boolean;
}

function FilterPopover({ label, uniqueValues, selected, onApply, onClear, isActive }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [local, setLocal] = useState<Set<string>>(new Set(selected));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLocal(new Set(selected));
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]); // eslint-disable-line

  const shown = useMemo(() => {
    const q = search.toLowerCase();
    return uniqueValues.filter(v => v.toLowerCase().includes(q));
  }, [uniqueValues, search]);

  const allChecked = shown.length > 0 && shown.every(v => local.has(v));
  const someChecked = shown.some(v => local.has(v)) && !allChecked;

  const toggleAll = () => setLocal(prev => {
    const n = new Set(prev);
    if (allChecked) shown.forEach(v => n.delete(v)); else shown.forEach(v => n.add(v));
    return n;
  });

  const toggleVal = (v: string) => setLocal(prev => {
    const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n;
  });

  const apply = () => {
    const effective = local.size === uniqueValues.length ? new Set<string>() : local;
    onApply(effective);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={e => e.stopPropagation()}
          className={cn(
            "flex-shrink-0 rounded p-0.5 transition-all",
            isActive
              ? "text-primary bg-primary/15 opacity-100 shadow-sm"
              : "text-muted-foreground opacity-0 group-hover/th:opacity-60 hover:!opacity-100 hover:bg-muted",
          )}
          title={`Filter ${label}`}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-0 shadow-2xl border border-border/70 bg-popover"
        align="start" side="bottom" sideOffset={6}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 pt-2.5 pb-2 border-b border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Filter: {label}</span>
            {isActive && (
              <button onClick={() => { onClear(); setOpen(false); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search values…"
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Select all */}
        <div className="border-b border-border/40 px-2 py-1">
          <button onClick={toggleAll}
            className="flex w-full items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/70 transition-colors">
            {allChecked
              ? <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
              : someChecked
                ? <div className="h-3.5 w-3.5 shrink-0 rounded-sm border-2 border-primary bg-primary/20" />
                : <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <span className="font-medium">{allChecked ? "Deselect All" : "Select All"}</span>
            <span className="ml-auto text-muted-foreground">{shown.length}</span>
          </button>
        </div>

        {/* Values */}
        <div className="max-h-48 overflow-y-auto py-0.5">
          {shown.length === 0
            ? <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</p>
            : shown.map(v => (
              <button key={v} onClick={() => toggleVal(v)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/60 transition-colors">
                {local.has(v)
                  ? <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                  : <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className={cn("truncate", !local.has(v) && "text-muted-foreground")}>
                  {v === "" ? <em className="opacity-60">(blank)</em> : v}
                </span>
              </button>
            ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-muted/30">
          <span className="text-xs text-muted-foreground">{local.size}/{uniqueValues.length}</span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={apply}>Apply</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Draggable <th> ────────────────────────────────────────────────────────── */

interface DraggableThProps {
  colKey: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  sticky?: boolean;
  noDrag?: boolean;
}

function DraggableTh({ colKey, children, className, style, sticky, noDrag }: DraggableThProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colKey,
    disabled: !!(sticky || noDrag),
  });
  return (
    <th
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 20 : sticky ? 10 : undefined,
        ...style,
      }}
      className={cn(
        "group/th relative bg-muted/50 border-b border-border px-2.5 py-2 text-left whitespace-nowrap",
        sticky && "sticky left-0 z-10 bg-background border-r",
        isDragging && "bg-primary/5",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        {!sticky && !noDrag && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors opacity-0 group-hover/th:opacity-100 flex-shrink-0"
            tabIndex={-1}
            title="Drag to reorder"
          >
            <GripVertical className="h-3 w-3" />
          </button>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </th>
  );
}

/* ─── DataTable ─────────────────────────────────────────────────────────────── */

interface DataTableProps<T> {
  columns: ColDef<T>[];
  data: T[];
  rowKey: (row: T, idx: number) => string | number;
  /** Additional className on <table> */
  tableClass?: string;
  /** Min-width of the outer scroll wrapper div */
  minWidth?: number;
  /** Optional extra buttons / controls rendered next to the "clear filters" button */
  headerSlot?: React.ReactNode;
  /** Rendered when no data */
  emptyState?: React.ReactNode;
  /** Row className */
  rowClass?: (row: T) => string | undefined;
  /** Callback when a row is clicked */
  onRowClick?: (row: T) => void;
  /** Sticky table header */
  stickyHeader?: boolean;
  /** ID used to persist column order in sessionStorage (optional) */
  storageKey?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  tableClass,
  minWidth = 800,
  headerSlot,
  emptyState,
  rowClass,
  onRowClick,
  stickyHeader = true,
  storageKey,
}: DataTableProps<T>) {

  /* ── Column order ── */
  const initOrder = () => {
    if (storageKey) {
      try {
        const saved = sessionStorage.getItem(`dt-col-order:${storageKey}`);
        if (saved) {
          const parsed: string[] = JSON.parse(saved);
          const colKeys = columns.map(c => c.key);
          // Only use saved order if same set of columns
          if (parsed.length === colKeys.length && parsed.every(k => colKeys.includes(k))) return parsed;
        }
      } catch { /* ignore */ }
    }
    return columns.map(c => c.key);
  };

  const [colOrder, setColOrder] = useState<string[]>(initOrder);

  const persistOrder = (order: string[]) => {
    setColOrder(order);
    if (storageKey) {
      try { sessionStorage.setItem(`dt-col-order:${storageKey}`, JSON.stringify(order)); } catch { /* ignore */ }
    }
  };

  const orderedCols = useMemo(
    () => colOrder.map(k => columns.find(c => c.key === k)).filter(Boolean) as ColDef<T>[],
    [colOrder, columns],
  );

  // Fixed columns (sticky or noDrag) are not included in sortable context
  const draggableKeys = colOrder.filter(k => {
    const col = columns.find(c => c.key === k);
    return col && !col.sticky && !col.noDrag;
  });

  /* ── Filters ── */
  type FilterMap = Record<string, Set<string>>;
  const [filters, setFilters] = useState<FilterMap>({});

  const getUniqueVals = (col: ColDef<T>) => {
    const extract = col.filterValue ?? ((r: T) => String(r[col.key] ?? ""));
    const set = new Set(data.map(extract));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  const filteredData = useMemo(() => {
    return data.filter(row => {
      for (const col of columns) {
        const sel = filters[col.key];
        if (!sel || sel.size === 0) continue;
        const extract = col.filterValue ?? ((r: T) => String(r[col.key] ?? ""));
        if (!sel.has(extract(row))) return false;
      }
      return true;
    });
  }, [data, filters, columns]);

  /* ── Sort ── */
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const col = columns.find(c => c.key === sortKey);
    if (!col) return filteredData;
    const extract = col.filterValue ?? ((r: T) => String(r[sortKey] ?? ""));
    return [...filteredData].sort((a, b) => {
      const cmp = extract(a).localeCompare(extract(b), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); }
    } else {
      setSortKey(key); setSortDir("asc");
    }
  };

  /* ── DnD ── */
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = (e: DragStartEvent) => setActiveColId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveColId(null);
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const oi = colOrder.indexOf(String(active.id));
      const ni = colOrder.indexOf(String(over.id));
      persistOrder(arrayMove(colOrder, oi, ni));
    }
  };

  /* ── Active filter count ── */
  const activeFilterCount = Object.values(filters).filter(s => s.size > 0).length;

  const clearAllFilters = () => setFilters({});

  const activeColLabel = activeColId
    ? (columns.find(c => c.key === activeColId)?.filterLabel
      ?? (typeof columns.find(c => c.key === activeColId)?.label === "string"
        ? columns.find(c => c.key === activeColId)?.label as string
        : activeColId))
    : null;

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      {(activeFilterCount > 0 || headerSlot) && (
        <div className="flex items-center gap-2 flex-wrap px-1">
          {headerSlot}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="gap-1 text-xs font-normal py-0.5">
                <SlidersHorizontal className="h-3 w-3" />
                {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
              </Badge>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground" onClick={clearAllFilters}>
                <X className="h-3 w-3 mr-1" /> Clear all
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border/50">
        <div style={{ minWidth }}>
          <table className={cn("w-full text-xs border-collapse", tableClass)}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={draggableKeys} strategy={horizontalListSortingStrategy}>
                <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
                  <tr>
                    {orderedCols.map(col => {
                      const isFiltered = (filters[col.key]?.size ?? 0) > 0;
                      const isSorted = sortKey === col.key;
                      const uniq = col.noFilter ? [] : getUniqueVals(col);
                      const filterLbl = col.filterLabel
                        ?? (typeof col.label === "string" ? col.label : col.key);

                      return (
                        <DraggableTh
                          key={col.key}
                          colKey={col.key}
                          sticky={col.sticky}
                          noDrag={col.noDrag}
                          style={{ width: col.width, minWidth: col.width }}
                          className={col.thClass}
                        >
                          <div className={cn(
                            "flex items-center gap-0.5",
                            col.align === "right" && "justify-end",
                            col.align === "center" && "justify-center",
                          )}>
                            {/* Label + sort — optionally wrapped in Tooltip.
                                The Tooltip always wraps the button as a whole so that
                                the filter popover and drag handle (siblings, outside this
                                button) are never touched. */}
                            {col.tip ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => col.sortable !== false && toggleSort(col.key)}
                                    className={cn(
                                      "flex items-center gap-0.5 min-w-0",
                                      col.sortable !== false
                                        ? "hover:text-foreground cursor-pointer"
                                        : "cursor-help",
                                    )}
                                  >
                                    <span className={cn("truncate font-semibold text-[11px]", isSorted ? "text-primary" : "text-foreground/75")}>
                                      {col.label}
                                    </span>
                                    {isSorted && (
                                      sortDir === "asc"
                                        ? <ChevronUp className="h-3 w-3 text-primary shrink-0" />
                                        : <ChevronDown className="h-3 w-3 text-primary shrink-0" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="bottom"
                                  sideOffset={6}
                                  className="max-w-[280px] text-left text-xs leading-snug"
                                >
                                  {col.tip}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <button
                                onClick={() => col.sortable !== false && toggleSort(col.key)}
                                className={cn(
                                  "flex items-center gap-0.5 min-w-0",
                                  col.sortable !== false && "hover:text-foreground cursor-pointer",
                                )}
                              >
                                <span className={cn("truncate font-semibold text-[11px]", isSorted ? "text-primary" : "text-foreground/75")}>
                                  {col.label}
                                </span>
                                {isSorted && (
                                  sortDir === "asc"
                                    ? <ChevronUp className="h-3 w-3 text-primary shrink-0" />
                                    : <ChevronDown className="h-3 w-3 text-primary shrink-0" />
                                )}
                              </button>
                            )}

                            {/* Filter */}
                            {!col.noFilter && uniq.length > 1 && (
                              <FilterPopover
                                label={filterLbl}
                                uniqueValues={uniq}
                                selected={filters[col.key] ?? new Set()}
                                isActive={isFiltered}
                                onApply={sel => setFilters(prev => ({ ...prev, [col.key]: sel }))}
                                onClear={() => setFilters(prev => { const n = { ...prev }; delete n[col.key]; return n; })}
                              />
                            )}
                          </div>
                        </DraggableTh>
                      );
                    })}
                  </tr>
                </thead>
              </SortableContext>

              <DragOverlay>
                {activeColLabel && (
                  <div className="bg-primary/10 border border-primary/30 rounded px-3 py-1.5 text-xs font-medium text-primary shadow-xl backdrop-blur-sm">
                    {activeColLabel}
                  </div>
                )}
              </DragOverlay>
            </DndContext>

            <tbody>
              {sortedData.length === 0
                ? (
                  <tr>
                    <td colSpan={orderedCols.length} className="py-12 text-center text-muted-foreground">
                      {emptyState ?? "No data"}
                    </td>
                  </tr>
                )
                : sortedData.map((row, idx) => (
                  <tr
                    key={rowKey(row, idx)}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "border-b border-border/30 last:border-0 transition-colors",
                      onRowClick && "cursor-pointer",
                      "hover:bg-muted/40",
                      rowClass?.(row),
                    )}
                  >
                    {orderedCols.map(col => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-2.5 py-2",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          col.sticky && "sticky left-0 bg-background border-r z-10",
                          col.tdClass,
                        )}
                      >
                        {col.render(row, idx)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
