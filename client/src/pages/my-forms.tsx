import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  FileText, Send, Clock, CheckCircle2, Loader2, Calendar,
  DollarSign, AlertTriangle, Bell, ClipboardList, CornerUpLeft, MessageSquare
} from "lucide-react";

function formatAmount(v: number | string | null | undefined) {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return null;
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: any) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d: any) {
  if (!d) return null;
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function priorityVariant(p: string): "default" | "secondary" | "destructive" | "outline" {
  if (p === "High") return "destructive";
  if (p === "Medium") return "secondary";
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

function getVisibleFields(config: any) {
  if (!config?.defaultFields) return [];
  return Object.entries(config.defaultFields)
    .filter(([_, v]: any) => v.visible)
    .map(([key, v]: any) => ({
      key,
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase()),
      required: v.required,
    }));
}

function FormDetailSheet({ form, open, onClose, onFill, onReturn }: {
  form: any;
  open: boolean;
  onClose: () => void;
  onFill?: (form: any) => void;
  onReturn?: (form: any) => void;
}) {
  if (!form) return null;
  const isSubmitted = !!form.submissionStatus;
  const isReturned = form.assignmentStatus === "Returned";
  const isPending = !isSubmitted && !isReturned;
  const fields = getVisibleFields(form.fieldConfiguration);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base font-semibold">{form.formName}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <span className="text-xs">{form.description || "Non-PO accrual form"}</span>
            <Badge variant={priorityVariant(form.priority)} className="text-[10px]">{form.priority || "Normal"}</Badge>
            {isSubmitted && (
              <Badge variant="outline" className="text-[10px] border-green-500 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {form.submissionStatus}
              </Badge>
            )}
            {isReturned && (
              <Badge variant="destructive" className="text-[10px]">
                <CornerUpLeft className="h-3 w-3 mr-1" />
                Returned to Finance
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-3">
          {/* Returned-to-Finance banner */}
          {isReturned && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5 mb-1">
                <CornerUpLeft className="h-3.5 w-3.5" />
                Returned to Finance
              </p>
              {form.returnedAt && (
                <p className="text-xs text-red-600 dark:text-red-400/80">On {fmtDateTime(form.returnedAt)}</p>
              )}
              {form.returnComments && (
                <p className="text-xs mt-1 text-red-700 dark:text-red-300 italic">"{form.returnComments}"</p>
              )}
            </div>
          )}

          {/* Form Metadata */}
          <div>
            <SectionHeader icon={FileText} label="Form Details" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="Form Name" value={form.formName} />
              <DetailField label="Priority" value={form.priority || "Normal"} />
              <DetailField label="Due Date" value={fmtDate(form.dueDate)} />
              <DetailField label="Assigned On" value={fmtDate(form.assignedDate)} />
              {form.description && (
                <div className="col-span-2">
                  <DetailField label="Description" value={form.description} />
                </div>
              )}
            </div>
          </div>

          {form.nudgeCount > 0 && (
            <>
              <Separator />
              <div>
                <SectionHeader icon={Bell} label="Nudges" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailField label="Nudge Count" value={form.nudgeCount} />
                  <DetailField label="Last Nudge" value={fmtDateTime(form.lastNudgeAt)} />
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Submission / Fields */}
          <div>
            <SectionHeader icon={isSubmitted ? CheckCircle2 : ClipboardList} label={isSubmitted ? "Submitted Data" : "Form Fields"} />
            {isSubmitted ? (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailField label="Submission Date" value={fmtDateTime(form.submissionDate)} />
                  <DetailField label="Status" value={form.submissionStatus} />
                  {form.submittedAmount != null && (
                    <DetailField label="Provision Amount" value={`₹ ${formatAmount(form.submittedAmount)}`} mono />
                  )}
                  {form.submittedVendor && (
                    <DetailField label="Vendor Name" value={form.submittedVendor} />
                  )}
                  {form.submittedDescription && (
                    <div className="col-span-2">
                      <DetailField label="Service Description" value={form.submittedDescription} />
                    </div>
                  )}
                  {/* Show any other submitted fields */}
                  {form.submittedFields && Object.entries(form.submittedFields as Record<string, any>)
                    .filter(([k]) => !["provisionAmount", "vendorName", "serviceDescription"].includes(k))
                    .map(([k, v]) => (
                      <DetailField
                        key={k}
                        label={k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                        value={v != null ? String(v) : null}
                      />
                    ))
                  }
                </div>

                {(form.financeTrueUp != null || form.financeRemarks) && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Finance Review</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {form.financeTrueUp != null && (
                        <DetailField label="Finance True-Up" value={`₹ ${formatAmount(form.financeTrueUp)}`} mono />
                      )}
                      {form.financeRemarks && (
                        <div className="col-span-2">
                          <DetailField label="Finance Remarks" value={form.financeRemarks} />
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-4 p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <p className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Form submitted — awaiting Finance review
                  </p>
                </div>
              </>
            ) : (
              <>
                {fields.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {fields.map((f: any) => (
                      <div key={f.key} className={f.key === "serviceDescription" ? "col-span-2" : ""}>
                        <DetailField
                          label={`${f.label}${f.required ? " *" : ""}`}
                          value={null}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No fields configured.</p>
                )}
                <div className="mt-4 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Awaiting your submission
                  </p>
                </div>
              </>
            )}
          </div>

          {isPending && (
            <div className="flex gap-2">
              {onFill && (
                <Button className="flex-1" onClick={() => { onClose(); onFill(form); }}>
                  <Send className="h-4 w-4 mr-2" />
                  Fill & Submit
                </Button>
              )}
              {onReturn && (
                <Button variant="outline" className="flex-1 border-red-300 text-red-600 hover:bg-red-50" onClick={() => { onClose(); onReturn(form); }}>
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

function FillFormDialog({ form, open, onClose, onSubmit, submitting }: {
  form: any;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  submitting: boolean;
}) {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Reset values whenever a different form is opened (or dialog re-opens)
  useEffect(() => {
    if (open) setFormValues({});
  }, [open, form?.formId]);

  const fields = form ? getVisibleFields(form.fieldConfiguration) : [];

  const handleSubmit = () => {
    if (!form) return;
    const provisionStr = formValues["provisionAmount"];
    if (provisionStr !== undefined && provisionStr !== "") {
      const v = parseFloat(provisionStr);
      if (isNaN(v) || v < 0) {
        toast({ title: "Invalid value", description: "Provision amount cannot be negative.", variant: "destructive" });
        return;
      }
    }
    onSubmit({
      formId: form.formId,
      standardFields: formValues,
      customFields: {},
    });
    setFormValues({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form?.formName}</DialogTitle>
          <DialogDescription>{form?.description || "Fill in the required fields and submit."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
          {fields.map((field: any) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-sm">
                {field.label} {field.required && <span className="text-destructive">*</span>}
              </Label>
              {field.key === "serviceDescription" ? (
                <Textarea
                  value={formValues[field.key] || ""}
                  onChange={e => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={`Enter ${field.label.toLowerCase()}...`}
                  rows={2}
                  data-testid={`input-${field.key}`}
                />
              ) : (
                <Input
                  type={field.key === "provisionAmount" ? "number" : "text"}
                  min={field.key === "provisionAmount" ? "0" : undefined}
                  value={formValues[field.key] || ""}
                  onChange={e => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={`Enter ${field.label.toLowerCase()}...`}
                  data-testid={`input-${field.key}`}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid="button-submit-form">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MyFormsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [detailForm, setDetailForm] = useState<any>(null);
  const [fillingForm, setFillingForm] = useState<any>(null);
  const [returningForm, setReturningForm] = useState<any>(null);
  const [returnComments, setReturnComments] = useState("");

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["/api/non-po/my-forms"],
    queryFn: () => apiGet<any[]>("/api/non-po/my-forms"),
    // Always fetch fresh — global staleTime:Infinity would serve a stale empty cache
    // after new forms are assigned without the user doing a full browser refresh.
    staleTime: 0,
  });

  const submitMutation = useMutation({
    mutationFn: (data: any) => apiPost("/api/non-po/submit", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/my-forms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/submissions"] });
      setFillingForm(null);
      toast({ title: "Submitted", description: "Form submitted successfully." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const returnMutation = useMutation({
    mutationFn: ({ assignmentId, comments }: { assignmentId: number; comments: string }) =>
      apiPost(`/api/non-po/assignments/${assignmentId}/return`, { comments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/my-forms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/non-po/submissions"] });
      setReturningForm(null);
      setReturnComments("");
      toast({ title: "Returned to Finance", description: "Finance has been notified." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const pending = forms.filter((f: any) => !f.submissionStatus && f.assignmentStatus !== "Returned");
  const submitted = forms.filter((f: any) => !!f.submissionStatus);
  const returned = forms.filter((f: any) => f.assignmentStatus === "Returned" && !f.submissionStatus);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">My Forms</h1>
        <p className="text-sm text-muted-foreground mt-1">Non-PO accrual forms assigned to you</p>
      </div>

      {/* Stats */}
      {!isLoading && forms.length > 0 && (
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
                <p className="text-xs text-muted-foreground">Submitted</p>
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
                <p className="text-2xl font-bold">
                  {forms.filter((f: any) => f.priority === "High" && !f.submissionStatus).length}
                </p>
                <p className="text-xs text-muted-foreground">High Priority</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">No forms assigned</h3>
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

          {/* Pending Forms */}
          <TabsContent value="pending" className="mt-3">
            {pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500/40 mb-3" />
                <h3 className="text-sm font-medium">All forms submitted</h3>
                <p className="text-xs text-muted-foreground mt-1">No pending forms remaining.</p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Form Name</TableHead>
                      <TableHead className="min-w-[200px]">Description</TableHead>
                      <TableHead className="min-w-[80px]">Priority</TableHead>
                      <TableHead className="min-w-[100px]">Due Date</TableHead>
                      <TableHead className="min-w-[100px]">Assigned On</TableHead>
                      <TableHead className="min-w-[60px]">Nudges</TableHead>
                      <TableHead className="text-center min-w-[100px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((form: any) => (
                      <TableRow
                        key={form.assignmentId}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => setDetailForm(form)}
                        data-testid={`row-pending-${form.assignmentId}`}
                      >
                        <TableCell className="text-xs font-medium">{form.formName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {form.description || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={priorityVariant(form.priority)} className="text-[10px]">
                            {form.priority || "Normal"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {form.dueDate ? (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {fmtDate(form.dueDate)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(form.assignedDate) || "—"}</TableCell>
                        <TableCell className="text-xs text-center">
                          {form.nudgeCount > 0 ? (
                            <span className="flex items-center gap-1 text-amber-600">
                              <Bell className="h-3 w-3" />
                              {form.nudgeCount}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-center">
                            <Button
                              size="sm"
                              onClick={() => setFillingForm(form)}
                              data-testid={`button-fill-form-${form.formId}`}
                            >
                              <Send className="h-3 w-3 mr-1" />
                              Fill & Submit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => { setReturnComments(""); setReturningForm(form); }}
                              title="Return to Finance"
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

          {/* Submitted Forms */}
          <TabsContent value="submitted" className="mt-3">
            {submitted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-medium">No submitted forms yet</h3>
                <p className="text-xs text-muted-foreground mt-1">Submitted forms will appear here.</p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Form Name</TableHead>
                      <TableHead className="min-w-[80px]">Priority</TableHead>
                      <TableHead className="min-w-[100px]">Due Date</TableHead>
                      <TableHead className="min-w-[120px]">Submitted On</TableHead>
                      <TableHead className="text-right min-w-[120px]">Provision Amt</TableHead>
                      <TableHead className="min-w-[120px]">Vendor</TableHead>
                      <TableHead className="min-w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submitted.map((form: any) => (
                      <TableRow
                        key={form.assignmentId}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => setDetailForm(form)}
                        data-testid={`row-submitted-${form.assignmentId}`}
                      >
                        <TableCell className="text-xs font-medium">{form.formName}</TableCell>
                        <TableCell>
                          <Badge variant={priorityVariant(form.priority)} className="text-[10px]">
                            {form.priority || "Normal"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(form.dueDate) || "—"}</TableCell>
                        <TableCell className="text-xs">{fmtDateTime(form.submissionDate) || "—"}</TableCell>
                        <TableCell className="text-right text-xs font-mono font-medium">
                          {form.submittedAmount != null
                            ? `₹ ${formatAmount(form.submittedAmount)}`
                            : <span className="text-muted-foreground">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {form.submittedVendor || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-green-500 text-green-700 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {form.submissionStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Returned Forms */}
          <TabsContent value="returned" className="mt-3">
            {returned.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CornerUpLeft className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-medium">No returned forms</h3>
                <p className="text-xs text-muted-foreground mt-1">Forms you return to Finance will appear here.</p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Form Name</TableHead>
                      <TableHead className="min-w-[80px]">Priority</TableHead>
                      <TableHead className="min-w-[100px]">Due Date</TableHead>
                      <TableHead className="min-w-[100px]">Returned On</TableHead>
                      <TableHead className="min-w-[240px]">Your Comments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returned.map((form: any) => (
                      <TableRow
                        key={form.assignmentId}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => setDetailForm(form)}
                      >
                        <TableCell className="text-xs font-medium">{form.formName}</TableCell>
                        <TableCell>
                          <Badge variant={priorityVariant(form.priority)} className="text-[10px]">
                            {form.priority || "Normal"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(form.dueDate) || "—"}</TableCell>
                        <TableCell className="text-xs">{fmtDate(form.returnedAt) || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[240px]">
                          {form.returnComments ? (
                            <span className="flex items-start gap-1">
                              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-red-500" />
                              <span className="truncate italic">"{form.returnComments}"</span>
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

      <FormDetailSheet
        form={detailForm}
        open={!!detailForm}
        onClose={() => setDetailForm(null)}
        onFill={(f) => setFillingForm(f)}
        onReturn={(f) => { setReturnComments(""); setReturningForm(f); }}
      />

      <FillFormDialog
        form={fillingForm}
        open={!!fillingForm}
        onClose={() => setFillingForm(null)}
        onSubmit={submitMutation.mutate}
        submitting={submitMutation.isPending}
      />

      {/* Return to Finance Dialog */}
      <Dialog open={!!returningForm} onOpenChange={open => { if (!open) { setReturningForm(null); setReturnComments(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CornerUpLeft className="h-4 w-4 text-red-500" />
              Return to Finance
            </DialogTitle>
            <DialogDescription>
              This will notify the Finance team that you need clarification or cannot submit this form as-is.
            </DialogDescription>
          </DialogHeader>
          {returningForm && (
            <div className="py-2 space-y-3">
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Form:</span> <span className="font-medium">{returningForm.formName}</span></p>
                {returningForm.description && <p className="text-xs text-muted-foreground">{returningForm.description}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="form-return-comments">Reason / Comments <span className="text-destructive">*</span></Label>
                <Textarea
                  id="form-return-comments"
                  placeholder="Explain why you are returning this form to Finance..."
                  value={returnComments}
                  onChange={e => setReturnComments(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">This comment will be visible to Finance Admins in the Finance Approval Tracker.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReturningForm(null); setReturnComments(""); }} disabled={returnMutation.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => returnMutation.mutate({ assignmentId: returningForm.assignmentId, comments: returnComments })}
              disabled={returnMutation.isPending || !returnComments.trim()}
            >
              {returnMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CornerUpLeft className="mr-2 h-4 w-4" />}
              Return to Finance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
