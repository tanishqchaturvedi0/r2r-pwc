import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Shield, Plus, Wand2, CheckCircle, Trash2, Loader2 } from "lucide-react";

export default function ApprovalRulesPage() {
  const { isFinanceAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [ruleText, setRuleText] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [appliesTo, setAppliesTo] = useState("Both");
  const [parsed, setParsed] = useState<any>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["/api/rules"],
    queryFn: () => apiGet<any[]>("/api/rules"),
  });

  const parseMutation = useMutation({
    mutationFn: (text: string) => apiPost<any>("/api/rules/parse", { text }),
    onSuccess: (data) => setParsed(data),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createRule = useMutation({
    mutationFn: (data: any) => apiPost("/api/rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
      setRuleText("");
      setRuleName("");
      setParsed(null);
      toast({ title: "Rule saved", description: "Approval rule has been created." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
      toast({ title: "Deleted", description: "Rule has been removed." });
    },
  });

  const handleInterpret = () => {
    if (!ruleText.trim()) return;
    parseMutation.mutate(ruleText);
  };

  const handleSave = () => {
    if (!ruleName || !parsed) return;
    createRule.mutate({
      ruleName,
      naturalLanguageText: ruleText,
      parsedConditions: parsed.conditions,
      parsedActions: parsed.actions,
      appliesTo,
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Approval Rules</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure auto-assignment rules using natural language</p>
      </div>

      <Tabs defaultValue={isFinanceAdmin ? "builder" : "list"}>
        <TabsList>
          {isFinanceAdmin && <TabsTrigger value="builder" data-testid="tab-rule-builder">Rule Builder</TabsTrigger>}
          <TabsTrigger value="list" data-testid="tab-rule-list">Active Rules</TabsTrigger>
        </TabsList>

        {isFinanceAdmin && (
          <TabsContent value="builder" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-semibold">Describe your approval rule</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={ruleText}
                    onChange={e => setRuleText(e.target.value)}
                    placeholder="e.g., All POs for Cost Center 40030403 should go to Jane Smith"
                    rows={4}
                    data-testid="input-rule-text"
                  />
                  <Button onClick={handleInterpret} disabled={parseMutation.isPending || !ruleText.trim()} data-testid="button-interpret">
                    {parseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    Interpret Rule
                  </Button>
                </CardContent>
              </Card>

              {parsed && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <h3 className="text-sm font-semibold">Rule Interpreted</h3>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {parsed.interpretedText && parsed.interpretedText !== ruleText && (
                      <div className="p-3 bg-primary/5 border border-primary/20 rounded-md">
                        <p className="text-xs text-muted-foreground mb-1">AI Summary</p>
                        <p className="text-sm" data-testid="text-ai-summary">{parsed.interpretedText}</p>
                      </div>
                    )}
                    <div className="space-y-2 p-3 bg-muted/40 rounded-md">
                      <p className="text-xs text-muted-foreground mb-2">Parsed Structure</p>
                      {(parsed.conditions || []).map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <Badge variant="outline" className="text-[10px] shrink-0">IF</Badge>
                          <span className="font-mono">{c.field}</span>
                          <span className="text-muted-foreground">{c.operator}</span>
                          <span className="font-medium">{String(c.value)}</span>
                        </div>
                      ))}
                      {(parsed.actions || []).map((a: any, i: number) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <Badge variant="secondary" className="text-[10px] shrink-0">THEN</Badge>
                          <span className="font-mono">{a.type}</span>
                          {a.userName && <span className="font-medium">{a.userName}</span>}
                          {a.approverName && <span className="font-medium">{a.approverName}</span>}
                          {a.status && <span className="font-medium">{a.status}</span>}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <Label>Rule Name</Label>
                      <Input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="Name this rule..." data-testid="input-rule-name" />
                    </div>

                    <div className="space-y-2">
                      <Label>Applies To</Label>
                      <Select value={appliesTo} onValueChange={setAppliesTo}>
                        <SelectTrigger data-testid="select-applies-to"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Activity">Activity-based</SelectItem>
                          <SelectItem value="NonPO">Non-PO</SelectItem>
                          <SelectItem value="Both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button onClick={handleSave} disabled={!ruleName || createRule.isPending} className="w-full" data-testid="button-save-rule">
                      {createRule.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Save Rule
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        )}

        <TabsContent value="list" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (rules || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Shield className="h-12 w-12 text-muted-foreground/40 mb-3" />
                  <h3 className="text-sm font-medium">No approval rules</h3>
                  <p className="text-xs text-muted-foreground mt-1">Create rules to auto-suggest approvers</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Applies To</TableHead>
                      <TableHead>Active</TableHead>
                      {isFinanceAdmin && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rules || []).map((rule: any, idx: number) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{rule.ruleName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate max-w-[300px]">{rule.naturalLanguageText}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{rule.appliesTo}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={rule.isActive ? "default" : "outline"} className="text-[10px]">
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        {isFinanceAdmin && (
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" data-testid={`button-delete-rule-${rule.id}`}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Rule</AlertDialogTitle>
                                  <AlertDialogDescription>Are you sure you want to delete "{rule.ruleName}"?</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteRule.mutate(rule.id)} data-testid="button-confirm-delete">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
