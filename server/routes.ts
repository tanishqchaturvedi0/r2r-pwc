import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import Papa from "papaparse";
import { storage } from "./storage";
import { authMiddleware, requireRole, generateToken, comparePassword } from "./auth";
import { loginSchema } from "@shared/schema";
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

      await storage.updateLastLogin(user.id);
      const token = generateToken({ userId: user.id, email: user.email, roles: userWithRoles.roles });
      await storage.logAudit(user.id, "Login", "user", String(user.id));

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
      const data = await storage.getFinanceDashboard();
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
      const lines = await storage.getPeriodBasedLines();
      res.json(lines);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/period-based/:id/true-up", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.updatePeriodTrueUp(id, req.body.field, req.body.value, req.userId!);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/period-based/:id/remarks", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.updatePeriodRemarks(id, req.body.remarks, req.userId!);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Activity-Based
  app.get("/api/activity-based", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const lines = await storage.getActivityBasedLines();
      res.json(lines);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/activity-based/assign", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const { poLineId, assignedToUserId } = req.body;
      const id = await storage.assignActivityPo(poLineId, assignedToUserId, req.userId!);
      res.json({ id });
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

  app.put("/api/activity-based/:id/approve", authMiddleware, requireRole("Finance Admin", "Finance Approver"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.approveActivityResponse(id);
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
    const conditions: any[] = [];
    const actions: any[] = [];

    const ccMatch = text.match(/cost\s*center\s*(\w+)/i);
    if (ccMatch) conditions.push({ field: "costCenter", operator: "equals", value: ccMatch[1] });

    const vendorMatch = text.match(/vendor\s+(.+?)(?:\s+should|\s+go|\s+must|$)/i);
    if (vendorMatch) conditions.push({ field: "vendorName", operator: "contains", value: vendorMatch[1].trim() });

    const amountMatch = text.match(/amount\s*(above|below|greater|less|over|under)\s*(\d[\d,]*)/i);
    if (amountMatch) {
      const op = ["above", "greater", "over"].includes(amountMatch[1].toLowerCase()) ? "greaterThan" : "lessThan";
      conditions.push({ field: "netAmount", operator: op, value: parseFloat(amountMatch[2].replace(/,/g, "")) });
    }

    const userMatch = text.match(/(?:to|by)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/);
    if (userMatch) actions.push({ type: "assignTo", userName: userMatch[1] });
    else actions.push({ type: "autoAssign" });

    res.json({ conditions, actions, interpretedText: text });
  });

  app.delete("/api/rules/:id", authMiddleware, requireRole("Finance Admin"), async (req, res) => {
    try {
      await storage.deleteRule(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Reports
  app.get("/api/reports/analytics", authMiddleware, async (req, res) => {
    try {
      const data = await storage.getAnalytics();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/reports/exceptions", authMiddleware, async (req, res) => {
    try {
      const data = await storage.getExceptions();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/reports/export", authMiddleware, async (req, res) => {
    try {
      const lines = await storage.getPeriodBasedLines();
      const csvData = lines.map(l => ({
        "PO Number": l.poNumber,
        "Line Item": l.poLineItem,
        "Vendor": l.vendorName,
        "Description": l.itemDescription,
        "Net Amount": l.netAmount,
        "GL Account": l.glAccount,
        "Cost Center": l.costCenter,
        "Final Provision": l.finalProvision,
        "Status": l.status,
      }));
      const csv = Papa.unparse(csvData);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=accruals_report.csv");
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

      for (const row of trimmedRows) {
        const startDate = (row["Start Date"] || row["start_date"] || row["StartDate"] || "").toString().trim();
        const endDate = (row["End Date"] || row["end_date"] || row["EndDate"] || "").toString().trim();
        const hasDates = startDate && endDate;
        const category = hasDates ? "Period" : "Activity";

        if (category === "Period") periodCount++;
        else activityCount++;

        const poNumber = (row["PO Number"] || row["po_number"] || row["PONumber"] || "").toString().trim();
        const lineItem = (row["PO Line Item"] || row["Line Item"] || row["po_line_item"] || row["LineItem"] || "").toString().trim();
        const uniqueId = (row["Unique ID"] || row["UniqueID"] || row["unique_id"] || `${poNumber}-${lineItem}`).toString().trim();

        const poLine = await storage.createPoLine({
          uploadId: null,
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
          status: "Draft",
        });

        const grnDoc = (row["GRN Doc"] || row["grn_doc"] || "").toString().trim();
        const grnValue = parseFloat((row["GRN Value"] || row["grn_value"] || "0").toString().replace(/,/g, "")) || 0;
        if (grnDoc || grnValue > 0) {
          await storage.createGrnTransaction({
            poLineId: poLine.id,
            grnDate: (row["GRN Date"] || row["grn_date"] || "").toString().trim(),
            grnDoc,
            grnMovementType: (row["GRN Movement Type"] || row["grn_movement_type"] || "").toString().trim(),
            grnValue,
          });
        }
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

  return httpServer;
}
