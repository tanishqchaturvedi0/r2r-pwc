import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import Papa from "papaparse";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";
import { authMiddleware, requireRole, generateToken, comparePassword } from "./auth";
import { loginSchema, poLines, poUploads, grnTransactions, grnUploads, periodCalculations, activityAssignments, businessResponses, nonpoForms, nonpoFormAssignments, nonpoSubmissions, approvalSubmissions, approvalRules, auditLog, notifications } from "@shared/schema";
import { Readable } from "stream";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(401).json({ message: "Invalid email or password" });
      if (user.status !== "Active") return res.status(403).json({ message: "Account is inactive" });

      const valid = await comparePassword(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });

      const userWithRoles = await storage.getUserWithRoles(user.id);
      if (!userWithRoles) return res.status(500).json({ message: "User roles not found" });

      const token = generateToken({ userId: user.id, email: user.email, roles: userWithRoles.roles });
      // Fire-and-forget: don't block the login response for non-critical writes
      storage.updateLastLogin(user.id).catch(() => {});
      storage.logAudit(user.id, "Login", "user", String(user.id)).catch(() => {});

      res.json({ token, user: userWithRoles });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Login failed" });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    const user = await storage.getUserWithRoles(req.userId!);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  });

  // Dashboard
  app.get("/api/dashboard", authMiddleware, async (req, res) => {
    try {
      const processingMonth = req.query.processingMonth as string | undefined;
      const data = await storage.getFinanceDashboard(processingMonth);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/dashboard/business", authMiddleware, async (req, res) => {
    try {
      const data = await storage.getBusinessDashboard(req.userId!);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Config
  app.get("/api/config", authMiddleware, async (req, res) => {
    const config = await storage.getConfigMap();
    res.json(config);
  });

  app.get("/api/permissions/me", authMiddleware, async (req, res) => {
    try {
      const effective = await storage.getEffectivePermissions(req.userId!);
      res.json(effective);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/config/permissions", authMiddleware, async (req, res) => {
    const perms = await storage.getPermissions();
    res.json(perms);
  });

  app.put("/api/config/permissions", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const { role, permission, field, value } = req.body;
      if (!role || !permission || !field) return res.status(400).json({ message: "role, permission, and field are required" });
      const validFields = ["canView", "canCreate", "canEdit", "canDelete", "canApprove", "canDownload", "canInvite"];
      if (!validFields.includes(field)) return res.status(400).json({ message: "Invalid field" });
      await storage.updatePermission(role, permission, field, !!value);
      await storage.logAudit(req.userId!, "Update Permission", "permission", `${role}:${permission}:${field}=${value}`);
      res.json({ success: true, field, value: !!value });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/config/:key", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      await storage.updateConfig(req.params.key, req.body.value, req.userId!);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Users
  app.get("/api/users", authMiddleware, async (req, res) => {
    const users = await storage.getAllUsersWithRoles();
    res.json(users);
  });

  app.post("/api/users", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const { name, email, phone, password, roles, costCenters, status } = req.body;
      if (!name || !email || !password) return res.status(400).json({ message: "Name, email and password are required" });
      if (!roles || roles.length === 0) return res.status(400).json({ message: "At least one role is required" });

      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ message: "User with this email already exists" });

      const user = await storage.createUser({ name, email, phone, password, roles, costCenters, status });
      await storage.logAudit(req.userId!, "Create User", "user", String(user?.id));
      res.json(user);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/users/:id", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, phone, password, roles, costCenters, status } = req.body;
      const user = await storage.updateUser(id, { name, phone, password: password || undefined, roles, costCenters, status });
      await storage.logAudit(req.userId!, "Update User", "user", String(id));
      res.json(user);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Period-Based
  app.get("/api/period-based", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const processingMonth = (req.query.processingMonth as string) || "";
      const pageParam = req.query.page;
      const limitParam = req.query.limit;

      // Use paginated method when page/limit params are provided
      if (pageParam !== undefined && limitParam !== undefined) {
        const result = await storage.getPeriodBasedLinesPaged({
          processingMonth: processingMonth || "Feb 2026",
          page: Math.max(0, parseInt(pageParam as string) || 0),
          limit: Math.min(500, Math.max(1, parseInt(limitParam as string) || 100)),
          search: (req.query.search as string) || "",
          statusFilter: (req.query.status as string) || "All",
        });
        return res.json(result);
      }

      // Legacy: return full array for reports/exports
      const lines = await storage.getPeriodBasedLines(processingMonth || undefined);
      res.json(lines);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/period-based/:id/true-up", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { field, value, processingMonth } = req.body;
      if (field === "prevMonthTrueUp") {
        return res.status(400).json({ message: "Previous month true-up cannot be modified in the current processing month" });
      }
      if (!["currentMonthTrueUp"].includes(field)) {
        return res.status(400).json({ message: "Invalid field" });
      }
      const numericValue = parseFloat(value) || 0;
      if (numericValue < 0) {
        return res.status(400).json({ message: "True-up cannot be negative" });
      }
      await storage.updatePeriodTrueUp(id, field, numericValue, req.userId!, processingMonth);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/period-based/:id/remarks", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { remarks, processingMonth } = req.body;
      await storage.updatePeriodRemarks(id, remarks, req.userId!, processingMonth);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Submit period-based for approval (single or bulk)
  app.post("/api/period-based/submit", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const { poLineIds, approverIds, processingMonth } = req.body;
      if (!poLineIds || !Array.isArray(poLineIds) || poLineIds.length === 0) {
        return res.status(400).json({ message: "poLineIds array is required" });
      }
      if (!approverIds || !Array.isArray(approverIds) || approverIds.length === 0) {
        return res.status(400).json({ message: "At least one approver is required" });
      }
      let month = processingMonth;
      if (!month) {
        const config = await storage.getConfigMap();
        month = config.processing_month || "Feb 2026";
      }
      const results = await storage.submitForApproval(poLineIds, approverIds, req.userId!, month);
      await storage.logAudit(req.userId!, "Submit Period Accruals", "period_based", "batch", { count: results.length, approverIds });
      res.json({ success: true, count: results.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Get approvers list
  app.get("/api/approvers", authMiddleware, async (req, res) => {
    try {
      const approvers = await storage.getApprovers();
      res.json(approvers);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Approval tracker
  app.get("/api/approvals/tracker", authMiddleware, async (req, res) => {
    try {
      const tracker = await storage.getApprovalTracker(req.userId!);
      res.json(tracker);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Nudge approval
  app.post("/api/approvals/:id/nudge", authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.nudgeApproval(id);
      await storage.logAudit(req.userId!, "Nudge Approval", "approval", String(id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/approvals/:id/recall", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.recallSubmission(id);
      await storage.logAudit(req.userId!, "Recall Submission", "approval", String(id));
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/activity-based/:id/recall", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.recallActivityAssignment(id);
      await storage.logAudit(req.userId!, "Recall Activity Assignment", "activity", String(id));
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Approve submission
  app.put("/api/approvals/:id/approve", authMiddleware, requireRole("Finance Approver", "Finance Admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.approveSubmission(id, req.userId!);
      await storage.logAudit(req.userId!, "Approve Submission", "approval", String(id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Reject submission
  app.put("/api/approvals/:id/reject", authMiddleware, requireRole("Finance Approver", "Finance Admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { reason } = req.body;
      await storage.rejectSubmission(id, req.userId!, reason || "");
      await storage.logAudit(req.userId!, "Reject Submission", "approval", String(id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Calendar stats
  app.get("/api/dashboard/calendar-stats", authMiddleware, async (req, res) => {
    try {
      const stats = await storage.getCalendarStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/po-lines/:id/category", authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { category, startDate, endDate } = req.body;
      if (!["Period", "Activity"].includes(category)) {
        return res.status(400).json({ message: "Category must be 'Period' or 'Activity'" });
      }
      if (category === "Period" && (!startDate || !endDate)) {
        return res.status(400).json({ message: "Start date and end date are required when switching to Period-Based" });
      }
      const updateData: any = { category };
      if (startDate) updateData.startDate = startDate;
      if (endDate) updateData.endDate = endDate;
      await db.update(poLines).set(updateData).where(eq(poLines.id, id));
      await storage.logAudit(req.userId!, "Change Category", "po_line", String(id), { category, startDate, endDate });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/po-lines/:id/dates", authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { startDate, endDate } = req.body;
      const updateData: any = {};
      if (startDate !== undefined) updateData.startDate = startDate;
      if (endDate !== undefined) updateData.endDate = endDate;
      await db.update(poLines).set(updateData).where(eq(poLines.id, id));
      await storage.logAudit(req.userId!, "Update Dates", "po_line", String(id), { startDate, endDate });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Activity-Based
  app.get("/api/activity-based", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const processingMonth = (req.query.processingMonth as string) || "";
      const pageParam = req.query.page;
      const limitParam = req.query.limit;

      if (pageParam !== undefined && limitParam !== undefined) {
        const result = await storage.getActivityBasedLinesPaged({
          processingMonth: processingMonth || "Feb 2026",
          page: Math.max(0, parseInt(pageParam as string) || 0),
          limit: Math.min(500, Math.max(1, parseInt(limitParam as string) || 100)),
          search: (req.query.search as string) || "",
          hideAssigned: req.query.hideAssigned === "true",
        });
        return res.json(result);
      }

      const lines = await storage.getActivityBasedLines(processingMonth || undefined);
      res.json(lines);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/activity-based/assign", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const { poLineId, assignedToUserId, assignedToUserIds } = req.body;
      // Support both single (legacy) and multi-user assignment
      if (assignedToUserIds && Array.isArray(assignedToUserIds) && assignedToUserIds.length > 0) {
        const result = await storage.assignActivityPoMultiple(poLineId, assignedToUserIds, req.userId!);
        res.json({ ids: result.map(a => a.id) });
      } else {
        const id = await storage.assignActivityPo(poLineId, assignedToUserId, req.userId!);
        res.json({ id });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/activity-based/my-tasks", authMiddleware, async (req, res) => {
    try {
      const tasks = await storage.getMyTasks(req.userId!);
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/activity-based/respond", authMiddleware, async (req, res) => {
    try {
      await storage.submitActivityResponse(req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/activity-based/responses", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const responses = await storage.getActivityResponses();
      res.json(responses);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/activity-based/:id/nudge", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.nudgeActivityAssignment(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/activity-based/:id/return", authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { comments } = req.body;
      if (!comments?.trim()) return res.status(400).json({ message: "Return comments are required." });
      const result = await storage.returnActivityTask(id, comments.trim());
      await storage.logAudit(req.userId!, "Return Task to Finance", "activity", String(id));
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Reset business response + recall assignments so Finance Admin can re-assign after editing
  app.post("/api/activity-based/:id/reset-response", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.resetActivityResponse(id);
      await storage.logAudit(req.userId!, "Reset Activity Response", "activity", String(id));
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/activity-based/:id/submit-for-approval", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { approverIds = [], processingMonth } = req.body;
      const config = await storage.getConfigMap();
      const month = processingMonth || config.processing_month || "Feb 2026";
      const result = await storage.submitActivityForApproval(id, approverIds, req.userId!, month);
      await storage.logAudit(req.userId!, "Submit Activity for Approval", "activity", String(id));
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/activity-based/approval-tracker", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const data = await storage.getActivityApprovalTracker();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/activity-based/:id/approve", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.approveActivityResponse(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/activity-based/:id/true-up", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const poLineId = parseInt(req.params.id);
      const { field, value, processingMonth } = req.body;
      if (field === "prevMonthTrueUp") {
        return res.status(400).json({ message: "Previous month true-up cannot be modified in the current processing month" });
      }
      if (!["currentMonthTrueUp"].includes(field)) {
        return res.status(400).json({ message: "Invalid field" });
      }
      const numericValue = parseFloat(value) || 0;
      if (numericValue < 0) {
        return res.status(400).json({ message: "True-up cannot be negative" });
      }
      await storage.updatePeriodTrueUp(poLineId, field, numericValue, req.userId!, processingMonth);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/activity-based/:id/remarks", authMiddleware, async (req, res) => {
    try {
      const poLineId = parseInt(req.params.id);
      const { remarks, processingMonth } = req.body;
      await storage.updatePeriodRemarks(poLineId, remarks || "", req.userId!, processingMonth);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Non-PO
  app.post("/api/non-po/forms", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const form = await storage.createNonPoForm(req.body, req.userId!);
      res.json(form);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/non-po/my-forms", authMiddleware, async (req, res) => {
    try {
      const forms = await storage.getMyForms(req.userId!);
      res.json(forms);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/non-po/submit", authMiddleware, async (req, res) => {
    try {
      const provisionAmount = parseFloat(req.body?.standardFields?.provisionAmount);
      if (!isNaN(provisionAmount) && provisionAmount < 0) {
        return res.status(400).json({ message: "Provision amount cannot be negative" });
      }
      const sub = await storage.submitNonPoForm(req.body, req.userId!);
      res.json(sub);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/non-po/submissions", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const subs = await storage.getNonPoSubmissions();
      res.json(subs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/non-po/assignments/:id/submit-for-approval", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { approverIds = [] } = req.body;
      const result = await storage.submitNonPoForApproval(id, approverIds);
      await storage.logAudit(req.userId!, "Submit Non-PO for Approval", "non_po", String(id));
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/non-po/approval-tracker", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const data = await storage.getNonPoApprovalTracker();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/non-po/assignments/:id/nudge", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.nudgeNonPoAssignment(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/non-po/assignments/:id/return", authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { comments } = req.body;
      if (!comments?.trim()) return res.status(400).json({ message: "Return comments are required." });
      const result = await storage.returnNonPoForm(id, comments.trim());
      await storage.logAudit(req.userId!, "Return Form to Finance", "non_po", String(id));
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/non-po/submissions/:id/review", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.reviewNonPoSubmission(id, req.body.status, req.userId!);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Approval Rules
  app.get("/api/rules", authMiddleware, async (req, res) => {
    const rules = await storage.getRules();
    res.json(rules);
  });

  app.post("/api/rules", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const rule = await storage.createRule(req.body, req.userId!);
      res.json(rule);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/rules/parse", authMiddleware, async (req, res) => {
    const { text } = req.body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "OpenAI API key not configured" });
    }

    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });

      const systemPrompt = `You are an approval rule parser for a financial accruals management system. Your job is to extract structured conditions and actions from natural language approval rules.

===== AVAILABLE FIELDS =====

PO Line fields:
- costCenter: Cost Center code
- vendorName: Vendor / Supplier name
- netAmount: Net PO amount (numeric)
- glAccount: GL Account code
- plant: Plant code
- profitCenter: Profit Center code
- itemDescription: Item description text
- poNumber: Purchase Order number

Calculated / accrual fields:
- currentMonthTrueUp: Current month true-up adjustment amount (numeric)
- prevMonthTrueUp: Previous month true-up amount (numeric)
- finalProvision: Final provision amount for current month (numeric)
- suggestedProvision: System-suggested provision before true-up (numeric)

===== AVAILABLE OPERATORS =====
equals, notEquals, contains, greaterThan, lessThan, between, startsWith

===== AVAILABLE ACTION TYPES =====
- assignTo: Route to a specific named user (provide userName)
- autoAssign: Route to ALL Finance Approvers (use when rule says "all approvers" or no specific person)
- requireApproval: Require approval from a named user (provide approverName)
- flagForReview: Flag the item for manual review
- setStatus: Set a specific status (provide status value)

===== FIELD MAPPING REFERENCE =====
- Any of: "true up", "trueup", "true-up", "true up for current month", "true up to current month", "current month true up", "this month true up", "current true-up" → field: currentMonthTrueUp
- Any of: "previous month true up", "last month true up", "prev true up", "prior month true up" → field: prevMonthTrueUp
- "provision", "final provision" → field: finalProvision
- "suggested provision" → field: suggestedProvision
- "net amount", "amount", "PO amount" → field: netAmount
- "3K" / "3k" / "3,000" → 3000 | "1L" / "1 lakh" / "100K" → 100000

IMPORTANT: "true up to current month" or "true up for current month" is NOT a temporal expression. It refers to the field currentMonthTrueUp.

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "conditions": [{"field": "string", "operator": "string", "value": "string or number", "description": "human readable"}],
  "actions": [{"type": "string", "userName": "name if assignTo", "approverName": "name if requireApproval", "status": "value if setStatus", "description": "human readable"}],
  "rewrittenRule": "A cleaner, professional rewrite of the rule in one sentence",
  "summary": "One clear sentence: what triggers this rule and what happens",
  "applierScope": "Which items this applies to",
  "approverNote": "Who gets suggested and why"
}`;

      const userPrompt = `Parse this approval rule step by step, then output the JSON:

Input: "${text}"

Step 1: Identify conditions (field + operator + value)
Step 2: Identify actions (type + optional name)
Step 3: Output the final JSON only`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      });

      const responseText = completion.choices[0].message.content?.trim() || "{}";
      const parsed = JSON.parse(responseText);

      res.json({
        conditions: parsed.conditions || [],
        actions: parsed.actions || [],
        rewrittenRule: parsed.rewrittenRule || "",
        interpretedText: parsed.summary || text,
        applierScope: parsed.applierScope || "",
        approverNote: parsed.approverNote || "",
      });
    } catch (err: any) {
      // Regex fallback — used when Gemini is unavailable
      const conditions: any[] = [];
      const actions: any[] = [];

      // Helper: parse shorthand amounts like 3K → 3000, 1L → 100000
      const parseAmount = (raw: string): number => {
        const s = raw.replace(/,/g, "").trim();
        if (/^\d+(\.\d+)?[Kk]$/.test(s)) return parseFloat(s) * 1000;
        if (/^\d+(\.\d+)?[Ll]$/.test(s)) return parseFloat(s) * 100000;
        return parseFloat(s) || 0;
      };

      const gtOp = (word: string) => ["above", "greater", "over", "more", "exceeds", "exceed"].includes(word.toLowerCase()) ? "greaterThan" : "lessThan";

      // True-up conditions (currentMonthTrueUp / prevMonthTrueUp)
      const trueUpMatch = text.match(
        /(?:true[-\s]?up(?:\s+(?:for|to|of|in))?\s+(?:current|this)\s+month|current\s+month\s+true[-\s]?up|this\s+month(?:'s)?\s+true[-\s]?up)\s+(?:is\s+)?(greater\s+than|more\s+than|above|exceeds?|less\s+than|below|under)\s+([\d,.]+[KkLl]?)/i
      );
      if (trueUpMatch) {
        const op = /greater|more|above|exceed/i.test(trueUpMatch[1]) ? "greaterThan" : "lessThan";
        conditions.push({ field: "currentMonthTrueUp", operator: op, value: parseAmount(trueUpMatch[2]), description: `Current Month True-Up is ${op === "greaterThan" ? "greater than" : "less than"} ₹${parseAmount(trueUpMatch[2]).toLocaleString("en-IN")}` });
      }

      const prevTrueUpMatch = text.match(
        /(?:prev(?:ious)?|last|prior)\s+month\s+true[-\s]?up\s+(?:is\s+)?(greater\s+than|more\s+than|above|exceeds?|less\s+than|below|under)\s+([\d,.]+[KkLl]?)/i
      );
      if (prevTrueUpMatch) {
        const op = /greater|more|above|exceed/i.test(prevTrueUpMatch[1]) ? "greaterThan" : "lessThan";
        conditions.push({ field: "prevMonthTrueUp", operator: op, value: parseAmount(prevTrueUpMatch[2]), description: `Prev Month True-Up is ${op === "greaterThan" ? "greater than" : "less than"} ₹${parseAmount(prevTrueUpMatch[2]).toLocaleString("en-IN")}` });
      }

      // Cost Center
      const ccMatch = text.match(/cost\s*center\s*(\w+)/i);
      if (ccMatch) conditions.push({ field: "costCenter", operator: "equals", value: ccMatch[1] });

      // Vendor
      const vendorMatch = text.match(/vendor\s+(.+?)(?:\s+should|\s+go|\s+must|$)/i);
      if (vendorMatch) conditions.push({ field: "vendorName", operator: "contains", value: vendorMatch[1].trim() });

      // Net amount
      const amountMatch = text.match(/(?:net\s+)?amount\s*(above|below|greater|less|over|under)\s*([\d,.]+[KkLl]?)/i);
      if (amountMatch) {
        conditions.push({ field: "netAmount", operator: gtOp(amountMatch[1]), value: parseAmount(amountMatch[2]) });
      }

      // Action — named user or all approvers
      const userMatch = text.match(/(?:to|by|assign\s+to)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/);
      if (userMatch) actions.push({ type: "assignTo", userName: userMatch[1] });
      else actions.push({ type: "autoAssign" });

      res.json({ conditions, actions, interpretedText: text, fallback: true });
    }
  });

  app.delete("/api/rules/:id", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      await storage.deleteRule(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/rules/:id/toggle", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const { isActive } = req.body;
      const rule = await storage.updateRuleStatus(parseInt(req.params.id), Boolean(isActive));
      res.json(rule);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Match rules against a set of PO lines - returns suggested approvers
  app.post("/api/rules/match", authMiddleware, async (req, res) => {
    try {
      const { poLineIds } = req.body;
      if (!poLineIds || !Array.isArray(poLineIds) || poLineIds.length === 0) {
        return res.status(400).json({ message: "poLineIds array is required" });
      }
      const result = await storage.matchRulesForPoLines(poLineIds.map(Number));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Reports
  app.get("/api/reports/analytics", authMiddleware, async (req, res) => {
    try {
      const processingMonth = req.query.processingMonth as string | undefined;
      const data = await storage.getAnalytics(processingMonth);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/reports/exceptions", authMiddleware, async (req, res) => {
    try {
      const processingMonth = req.query.processingMonth as string | undefined;
      const data = await storage.getExceptions(processingMonth);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/reports/export", authMiddleware, async (req, res) => {
    try {
      const columnsParam = req.query.columns as string | undefined;
      const selectedColumns = columnsParam ? columnsParam.split(",") : null;

      const allColumnMap: Record<string, (l: any) => any> = {
        "PO Number": l => l.poNumber,
        "Line Item": l => l.poLineItem,
        "Vendor": l => l.vendorName,
        "Description": l => l.itemDescription,
        "Net Amount": l => l.netAmount,
        "GL Account": l => l.glAccount,
        "Cost Center": l => l.costCenter,
        "Profit Center": l => l.profitCenter,
        "Plant": l => l.plant,
        "Start Date": l => l.startDate,
        "End Date": l => l.endDate,
        "Total Days": l => l.totalDays,
        "Prev Month Days": l => l.prevMonthDays,
        "Prev Month Provision": l => l.prevMonthProvision,
        "Prev Month True-Up": l => l.prevMonthTrueUp,
        "Prev Month GRN": l => l.prevMonthGrn,
        "Carry Forward": l => l.carryForward,
        "Current Month Days": l => l.currentMonthDays,
        "Suggested Provision": l => l.suggestedProvision,
        "Current Month GRN": l => l.currentMonthGrn,
        "Current Month True-Up": l => l.currentMonthTrueUp,
        "Remarks": l => l.remarks,
        "Final Provision": l => l.finalProvision,
        "Status": l => l.status,
        "Category": l => l.category,
      };

      const processingMonth = req.query.processingMonth as string | undefined;
      const periodLines = await storage.getPeriodBasedLines(processingMonth);
      const activityLines = await storage.getActivityBasedLines(processingMonth);
      const lines = [...periodLines, ...activityLines];
      const cols = selectedColumns || Object.keys(allColumnMap);
      const csvData = lines.map(l => {
        const row: Record<string, any> = {};
        cols.forEach(c => { if (allColumnMap[c]) row[c] = allColumnMap[c](l); });
        return row;
      });
      const csv = Papa.unparse(csvData);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=accruals_report.csv");
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // SAP Post-Ready Report
  app.get("/api/reports/sap-post-ready", authMiddleware, async (req, res) => {
    try {
      const processingMonth = req.query.processingMonth as string | undefined;
      const periodLines = await storage.getPeriodBasedLines(processingMonth);
      const activityLines = await storage.getActivityBasedLines(processingMonth);
      const allLines = [...periodLines, ...activityLines];
      const approved = allLines.filter(l => l.status === "Approved" || l.status === "Posted");
      const summary = {
        totalLines: approved.length,
        totalProvision: approved.reduce((s, l) => s + l.finalProvision, 0),
        byGlAccount: {} as Record<string, { count: number; total: number }>,
        byCostCenter: {} as Record<string, { count: number; total: number }>,
        lines: approved,
      };
      approved.forEach(l => {
        if (!summary.byGlAccount[l.glAccount]) summary.byGlAccount[l.glAccount] = { count: 0, total: 0 };
        summary.byGlAccount[l.glAccount].count++;
        summary.byGlAccount[l.glAccount].total += l.finalProvision;
        if (!summary.byCostCenter[l.costCenter]) summary.byCostCenter[l.costCenter] = { count: 0, total: 0 };
        summary.byCostCenter[l.costCenter].count++;
        summary.byCostCenter[l.costCenter].total += l.finalProvision;
      });
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/reports/sap-post-ready/export", authMiddleware, async (req, res) => {
    try {
      const columnsParam = req.query.columns as string | undefined;
      const selectedColumns = columnsParam ? columnsParam.split(",") : null;

      const allColumnMap: Record<string, (l: any) => any> = {
        "PO Number": l => l.poNumber,
        "Line Item": l => l.poLineItem,
        "Vendor": l => l.vendorName,
        "Description": l => l.itemDescription,
        "Net Amount": l => l.netAmount,
        "GL Account": l => l.glAccount,
        "Cost Center": l => l.costCenter,
        "Profit Center": l => l.profitCenter,
        "Plant": l => l.plant,
        "Start Date": l => l.startDate,
        "End Date": l => l.endDate,
        "Total Days": l => l.totalDays,
        "Carry Forward": l => l.carryForward,
        "Suggested Provision": l => l.suggestedProvision,
        "Current Month GRN": l => l.currentMonthGrn,
        "Current Month True-Up": l => l.currentMonthTrueUp,
        "Remarks": l => l.remarks,
        "Final Provision": l => l.finalProvision,
      };

      const processingMonth = req.query.processingMonth as string | undefined;
      const periodLines = await storage.getPeriodBasedLines(processingMonth);
      const activityLines = await storage.getActivityBasedLines(processingMonth);
      const allLines = [...periodLines, ...activityLines];
      const approved = allLines.filter((l: any) => l.status === "Approved" || l.status === "Posted");
      const cols = selectedColumns || Object.keys(allColumnMap);
      const csvData = approved.map(l => {
        const row: Record<string, any> = {};
        cols.forEach(c => { if (allColumnMap[c]) row[c] = allColumnMap[c](l); });
        return row;
      });
      const csv = Papa.unparse(csvData);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=sap_post_ready_report.csv");
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Notifications
  app.get("/api/notifications/unread-count", authMiddleware, async (req, res) => {
    const count = await storage.getUnreadCount(req.userId!);
    res.json({ count });
  });

  // CSV Upload
  app.get("/api/po/uploads", authMiddleware, async (req, res) => {
    const uploads = await storage.getPoUploads();
    res.json(uploads);
  });

  app.post("/api/po/upload", authMiddleware, requireRole("Finance Admin"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const csvText = req.file.buffer.toString("utf-8");
      let result = Papa.parse(csvText, { header: true, skipEmptyLines: true });

      if (result.errors.length > 0 && result.errors[0].type === "Abort") {
        return res.status(400).json({ message: `CSV parse errors: ${result.errors[0].message}` });
      }

      const config = await storage.getConfigMap();
      const processingMonth = config.processing_month || "Feb 2026";

      let rows = result.data as any[];
      const detectedHeaders = result.meta.fields || [];
      const knownHeaders = ["Unique ID", "PO Number", "PO Line Item", "Vendor Name", "Net Amount", "GL Account", "Cost Center", "Start Date", "End Date"];
      const headersLookValid = knownHeaders.some(h => detectedHeaders.includes(h));

      if (!headersLookValid && rows.length > 0) {
        const firstRowValues = Object.values(rows[0]).map((v: any) => (v || "").toString().trim());
        const firstRowHasHeaders = knownHeaders.some(h => firstRowValues.includes(h));

        if (firstRowHasHeaders) {
          const headerRow = rows[0];
          const newHeaders = Object.keys(headerRow).map(k => (headerRow[k] || "").toString().trim());
          rows = rows.slice(1).map((row: any) => {
            const mapped: any = {};
            const keys = Object.keys(row);
            keys.forEach((k, i) => {
              if (i < newHeaders.length) {
                mapped[newHeaders[i]] = row[k];
              }
            });
            return mapped;
          });
          console.log("[upload] Re-mapped headers from first data row:", newHeaders);
        }
      }

      const trimmedRows = rows.map((row: any) => {
        const trimmed: any = {};
        for (const key of Object.keys(row)) {
          trimmed[key.trim()] = row[key];
        }
        return trimmed;
      });

      if (trimmedRows.length > 0) {
        console.log("[upload] Final headers:", Object.keys(trimmedRows[0]));
        console.log("[upload] First row sample:", JSON.stringify(trimmedRows[0]));
      }

      let periodCount = 0;
      let activityCount = 0;

      const poLinePayloads = trimmedRows.map((row: any) => {
        const startDate = (row["Start Date"] || row["start_date"] || row["StartDate"] || "").toString().trim();
        const endDate = (row["End Date"] || row["end_date"] || row["EndDate"] || "").toString().trim();
        const hasDates = startDate && endDate;
        const category = hasDates ? "Period" : "Activity";

        if (category === "Period") periodCount++;
        else activityCount++;

        const poNumber = (row["PO Number"] || row["po_number"] || row["PONumber"] || "").toString().trim();
        const lineItem = (row["PO Line Item"] || row["Line Item"] || row["po_line_item"] || row["LineItem"] || "").toString().trim();
        const uniqueId = (row["Unique ID"] || row["UniqueID"] || row["unique_id"] || `${poNumber}-${lineItem}`).toString().trim();

        return {
          uploadId: null as null,
          uniqueId: uniqueId || `${poNumber}-${lineItem}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          poNumber,
          poLineItem: lineItem,
          vendorName: (row["Vendor Name"] || row["vendor_name"] || row["VendorName"] || "").toString().trim(),
          itemDescription: (row["Item Description"] || row["item_description"] || row["Description"] || "").toString().trim(),
          projectName: (row["Project Name"] || row["project_name"] || "").toString().trim(),
          wbsElement: (row["WBS Element"] || row["wbs_element"] || "").toString().trim(),
          costCenter: (row["Cost Center"] || row["cost_center"] || row["CostCenter"] || "").toString().trim(),
          profitCenter: (row["ProfitCenter"] || row["Profit Center"] || row["profit_center"] || "").toString().trim(),
          glAccount: (row["GL Account"] || row["gl_account"] || row["GLAccount"] || "").toString().trim(),
          docType: (row["Doc. Type"] || row["Doc Type"] || row["doc_type"] || "").toString().trim(),
          startDate,
          endDate,
          plant: (row["Plant"] || row["plant"] || "").toString().trim(),
          netAmount: parseFloat((row["Net Amount"] || row["net_amount"] || row["NetAmount"] || "0").toString().replace(/,/g, "")) || 0,
          prNumber: (row["PR Number"] || row["pr_number"] || "").toString().trim(),
          prOwnerId: (row["PR Owner Id"] || row["PR Owner ID"] || row["pr_owner_id"] || "").toString().trim(),
          costCenterOwnerId: (row["CostCenter Owner Id"] || row["CC Owner ID"] || row["cost_center_owner_id"] || "").toString().trim(),
          documentDate: (row["Document Date"] || row["document_date"] || "").toString().trim(),
          category,
          status: "Draft" as const,
        };
      });

      // Insert in batches of 100 to handle large files efficiently
      const BATCH_SIZE = 100;
      for (let i = 0; i < poLinePayloads.length; i += BATCH_SIZE) {
        const batch = poLinePayloads.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(payload => storage.createPoLine(payload)));
      }

      const uploadRecord = await storage.createPoUpload({
        uploadedBy: req.userId!,
        filename: req.file.originalname,
        processingMonth,
        totalRows: result.data.length,
        periodBasedCount: periodCount,
        activityBasedCount: activityCount,
        status: "Completed",
      });

      await storage.logAudit(req.userId!, "Upload CSV", "po_upload", String(uploadRecord.id), {
        filename: req.file.originalname,
        totalRows: result.data.length,
        periodBased: periodCount,
        activityBased: activityCount,
      });

      res.json({
        totalRows: result.data.length,
        periodBased: periodCount,
        activityBased: activityCount,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GRN Upload
  app.get("/api/grn/uploads", authMiddleware, async (req, res) => {
    const uploads = await storage.getGrnUploads();
    res.json(uploads);
  });

  app.post("/api/grn/upload", authMiddleware, requireRole("Finance Admin"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const config = await storage.getConfigMap();
      const processingMonth = config.processing_month || "Feb 2026";

      // Fix duplicate "GRN Date" headers: the second occurrence is actually the GRN document number
      let csvText = req.file.buffer.toString("utf-8");
      const csvLines = csvText.split(/\r?\n/);
      if (csvLines.length > 0) {
        const headerCols = csvLines[0].split(",");
        let foundFirst = false;
        const fixedCols = headerCols.map(h => {
          if (h.trim() === "GRN Date") {
            if (foundFirst) return "GRN Doc";
            foundFirst = true;
          }
          return h;
        });
        csvLines[0] = fixedCols.join(",");
        csvText = csvLines.join("\n");
      }

      const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      if (result.errors.length > 0 && result.errors[0].type === "Abort") {
        return res.status(400).json({ message: `CSV parse errors: ${result.errors[0].message}` });
      }

      const rows = (result.data as any[]).map((row: any) => {
        const trimmed: any = {};
        for (const key of Object.keys(row)) {
          trimmed[key.trim()] = (row[key] || "").toString().trim();
        }
        return trimmed;
      });

      // Build a lookup map of poNumber-lineItem → poLineId
      const allPoLines = await db.select({ id: poLines.id, poNumber: poLines.poNumber, poLineItem: poLines.poLineItem }).from(poLines);
      const poLineMap = new Map<string, number>();
      for (const line of allPoLines) {
        poLineMap.set(`${line.poNumber}-${line.poLineItem}`, line.id);
      }

      // Deduplicate rows by (poLineId, grnDate, grnDoc) — source files may contain exact duplicate rows
      const seenKeys = new Set<string>();
      const grnRowsToInsert: { poLineId: number; grnDate: string; grnDoc: string; grnValue: number }[] = [];
      const incomingGrnDocs = new Set<string>(); // track grnDoc values being uploaded

      for (const row of rows) {
        const poNumber = row["PO Number"] || "";
        const lineItem = row["PO Line Item"] || "";
        const poLineId = poLineMap.get(`${poNumber}-${lineItem}`);
        if (!poLineId) continue;

        const grnDate = row["GRN Date"] || "";
        const grnDoc = row["GRN Doc"] || "";
        const dedupKey = `${poLineId}|${grnDate}|${grnDoc}`;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);

        if (grnDoc) incomingGrnDocs.add(grnDoc);

        grnRowsToInsert.push({
          poLineId,
          grnDate,
          grnDoc,
          grnValue: parseFloat((row["GRN Value"] || "0").replace(/,/g, "")) || 0,
        });
      }

      // Only delete DB rows whose grnDoc appears in this upload — preserves snapshots from other periods
      if (incomingGrnDocs.size > 0) {
        await db.delete(grnTransactions).where(inArray(grnTransactions.grnDoc, Array.from(incomingGrnDocs)));
      }

      if (grnRowsToInsert.length > 0) {
        await db.insert(grnTransactions).values(
          grnRowsToInsert.map(row => ({
            poLineId: row.poLineId,
            grnDate: row.grnDate,
            grnDoc: row.grnDoc,
            grnMovementType: "",
            grnValue: row.grnValue,
          }))
        );
      }

      const matchedRows = grnRowsToInsert.length;
      const unmatchedRows = rows.length - matchedRows;

      const uploadRecord = await storage.createGrnUpload({
        uploadedBy: req.userId!,
        filename: req.file.originalname,
        processingMonth,
        totalRows: rows.length,
        matchedRows,
        unmatchedRows,
        status: "Completed",
      });

      await storage.logAudit(req.userId!, "Upload GRN CSV", "grn_upload", String(uploadRecord.id), {
        filename: req.file.originalname,
        totalRows: rows.length,
        matchedRows,
        unmatchedRows,
      });

      res.json({ totalRows: rows.length, matchedRows, unmatchedRows });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/data/date-range", authMiddleware, async (_req, res) => {
    try {
      const range = await storage.getDataDateRange();
      res.json(range);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/data/clear-all", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const { passkey } = req.body;
      if (passkey !== "r2r") {
        return res.status(403).json({ message: "Invalid passkey" });
      }
      await db.delete(approvalSubmissions);
      await db.delete(businessResponses);
      await db.delete(activityAssignments);
      await db.delete(periodCalculations);
      await db.delete(nonpoSubmissions);
      await db.delete(nonpoFormAssignments);
      await db.delete(nonpoForms);
      await db.delete(grnTransactions);
      await db.delete(poLines);
      await db.delete(poUploads);
      await db.delete(grnUploads);
      await db.delete(approvalRules);
      await db.delete(notifications);
      await db.delete(auditLog);
      res.json({ message: "All PO and transaction data cleared successfully" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
