import { db } from "./db";
import { eq, and, sql, desc, count, sum, avg, inArray, isNull, ne, lt, gt } from "drizzle-orm";
import {
  users, userRoles, costCenterAssignments, poUploads, poLines, grnTransactions,
  periodCalculations, activityAssignments, businessResponses, nonpoForms,
  nonpoFormAssignments, nonpoSubmissions, approvalRules, systemConfig,
  auditLog, notifications, rolePermissions
} from "@shared/schema";
import { hashPassword } from "./auth";

export const storage = {
  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user || null;
  },

  async getUserById(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user || null;
  },

  async getUserWithRoles(userId: number) {
    const user = await this.getUserById(userId);
    if (!user) return null;
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    const ccs = await db.select().from(costCenterAssignments).where(eq(costCenterAssignments.userId, userId));
    return {
      id: user.id, email: user.email, name: user.name, phone: user.phone, status: user.status,
      roles: roles.map(r => r.role),
      costCenters: ccs.map(c => c.costCenter),
    };
  },

  async getAllUsersWithRoles() {
    const allUsers = await db.select().from(users).orderBy(users.name);
    const allRoles = await db.select().from(userRoles);
    const allCcs = await db.select().from(costCenterAssignments);
    return allUsers.map(u => ({
      id: u.id, email: u.email, name: u.name, phone: u.phone, status: u.status,
      roles: allRoles.filter(r => r.userId === u.id).map(r => r.role),
      costCenters: allCcs.filter(c => c.userId === u.id).map(c => c.costCenter),
    }));
  },

  async createUser(data: { name: string; email: string; phone?: string | null; password: string; roles: string[]; costCenters?: string[]; status?: string }) {
    const passwordHash = await hashPassword(data.password);
    const [user] = await db.insert(users).values({
      email: data.email,
      passwordHash,
      name: data.name,
      phone: data.phone || null,
      status: data.status || "Active",
    }).returning();

    for (const role of data.roles) {
      await db.insert(userRoles).values({ userId: user.id, role }).onConflictDoNothing();
    }
    for (const cc of (data.costCenters || [])) {
      await db.insert(costCenterAssignments).values({ userId: user.id, costCenter: cc }).onConflictDoNothing();
    }
    return this.getUserWithRoles(user.id);
  },

  async updateUser(id: number, data: { name?: string; phone?: string | null; password?: string; roles?: string[]; costCenters?: string[]; status?: string }) {
    const updates: any = {};
    if (data.name) updates.name = data.name;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.status) updates.status = data.status;
    if (data.password) updates.passwordHash = await hashPassword(data.password);

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, id));
    }

    if (data.roles) {
      await db.delete(userRoles).where(eq(userRoles.userId, id));
      for (const role of data.roles) {
        await db.insert(userRoles).values({ userId: id, role }).onConflictDoNothing();
      }
    }
    if (data.costCenters) {
      await db.delete(costCenterAssignments).where(eq(costCenterAssignments.userId, id));
      for (const cc of data.costCenters) {
        await db.insert(costCenterAssignments).values({ userId: id, costCenter: cc }).onConflictDoNothing();
      }
    }
    return this.getUserWithRoles(id);
  },

  async updateLastLogin(id: number) {
    await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, id));
  },

  // PO Lines
  async getPeriodBasedLines() {
    const lines = await db.select().from(poLines).where(eq(poLines.category, "Period")).orderBy(poLines.poNumber);
    const lineIds = lines.map(l => l.id);
    if (lineIds.length === 0) return [];

    const calcs = await db.select().from(periodCalculations).where(inArray(periodCalculations.poLineId, lineIds));
    const grns = await db.select().from(grnTransactions).where(inArray(grnTransactions.poLineId, lineIds));

    return lines.map(line => {
      const calc = calcs.find(c => c.poLineId === line.id);
      const lineGrns = grns.filter(g => g.poLineId === line.id);
      const totalGrn = lineGrns.reduce((sum, g) => sum + (g.grnValue || 0), 0);

      const start = line.startDate ? new Date(line.startDate) : null;
      const end = line.endDate ? new Date(line.endDate) : null;
      const totalDays = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000)) : 1;
      const dailyRate = (line.netAmount || 0) / totalDays;

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      let currentMonthDays = 0;
      if (start && end) {
        const effectiveStart = new Date(Math.max(start.getTime(), monthStart.getTime()));
        const effectiveEnd = new Date(Math.min(end.getTime(), monthEnd.getTime()));
        if (effectiveEnd >= effectiveStart) {
          currentMonthDays = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1;
        }
      }

      let prevMonthDays = 0;
      if (start && end) {
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const effectiveStart = new Date(Math.max(start.getTime(), prevMonthStart.getTime()));
        const effectiveEnd = new Date(Math.min(end.getTime(), prevMonthEnd.getTime()));
        if (effectiveEnd >= effectiveStart) {
          prevMonthDays = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1;
        }
      }

      const prevMonthProvision = Math.round(dailyRate * prevMonthDays);
      const suggestedProvision = Math.round(dailyRate * currentMonthDays);
      const prevTrueUp = calc?.prevMonthTrueUp || 0;
      const currTrueUp = calc?.currentMonthTrueUp || 0;
      const prevMonthGrn = totalGrn * 0.4;
      const currentMonthGrn = totalGrn * 0.6;
      const carryForward = prevMonthProvision + prevTrueUp - prevMonthGrn;
      const finalProvision = suggestedProvision + currTrueUp - currentMonthGrn + carryForward;

      return {
        id: line.id,
        poNumber: line.poNumber || "",
        poLineItem: line.poLineItem || "",
        vendorName: line.vendorName || "",
        itemDescription: line.itemDescription || "",
        netAmount: line.netAmount || 0,
        glAccount: line.glAccount || "",
        costCenter: line.costCenter || "",
        profitCenter: line.profitCenter || "",
        plant: line.plant || "",
        startDate: line.startDate || "",
        endDate: line.endDate || "",
        totalDays,
        prevMonthDays,
        prevMonthProvision,
        prevMonthTrueUp: prevTrueUp,
        prevMonthGrn: Math.round(prevMonthGrn),
        carryForward: Math.round(carryForward),
        currentMonthDays,
        suggestedProvision,
        currentMonthGrn: Math.round(currentMonthGrn),
        currentMonthTrueUp: currTrueUp,
        remarks: calc?.remarks || "",
        finalProvision: Math.round(finalProvision),
        status: line.status || "Draft",
      };
    });
  },

  async updatePeriodTrueUp(poLineId: number, field: string, value: number, userId: number) {
    const config = await this.getConfigMap();
    const month = config.processing_month || "Feb 2026";

    const existing = await db.select().from(periodCalculations)
      .where(and(eq(periodCalculations.poLineId, poLineId), eq(periodCalculations.processingMonth, month))).limit(1);

    if (existing.length > 0) {
      const updates: any = { calculatedBy: userId };
      if (field === "prevMonthTrueUp") updates.prevMonthTrueUp = value;
      if (field === "currentMonthTrueUp") updates.currentMonthTrueUp = value;
      await db.update(periodCalculations).set(updates).where(eq(periodCalculations.id, existing[0].id));
    } else {
      await db.insert(periodCalculations).values({
        poLineId,
        processingMonth: month,
        prevMonthTrueUp: field === "prevMonthTrueUp" ? value : 0,
        currentMonthTrueUp: field === "currentMonthTrueUp" ? value : 0,
        calculatedBy: userId,
      });
    }
  },

  async updatePeriodRemarks(poLineId: number, remarks: string, userId: number) {
    const config = await this.getConfigMap();
    const month = config.processing_month || "Feb 2026";

    const existing = await db.select().from(periodCalculations)
      .where(and(eq(periodCalculations.poLineId, poLineId), eq(periodCalculations.processingMonth, month))).limit(1);

    if (existing.length > 0) {
      await db.update(periodCalculations).set({ remarks, calculatedBy: userId }).where(eq(periodCalculations.id, existing[0].id));
    } else {
      await db.insert(periodCalculations).values({ poLineId, processingMonth: month, remarks, calculatedBy: userId });
    }
  },

  // Activity-based
  async getActivityBasedLines() {
    const lines = await db.select().from(poLines).where(eq(poLines.category, "Activity")).orderBy(poLines.poNumber);
    const lineIds = lines.map(l => l.id);
    if (lineIds.length === 0) return [];

    const assigns = await db.select().from(activityAssignments).where(inArray(activityAssignments.poLineId, lineIds));
    const allUsers = await db.select().from(users);

    return lines.map(line => {
      const assign = assigns.find(a => a.poLineId === line.id);
      const assignedUser = assign ? allUsers.find(u => u.id === assign.assignedToUserId) : null;
      return {
        id: line.id,
        poNumber: line.poNumber || "",
        poLineItem: line.poLineItem || "",
        vendorName: line.vendorName || "",
        itemDescription: line.itemDescription || "",
        netAmount: line.netAmount || 0,
        glAccount: line.glAccount || "",
        costCenter: line.costCenter || "",
        assignmentId: assign?.id || null,
        assignedToUserId: assign?.assignedToUserId || null,
        assignedToName: assignedUser?.name || null,
        assignmentStatus: assign?.status || "Not Assigned",
        assignedDate: assign?.assignedDate || null,
      };
    });
  },

  async assignActivityPo(poLineId: number, assignedToUserId: number, assignedBy: number) {
    const existing = await db.select().from(activityAssignments)
      .where(eq(activityAssignments.poLineId, poLineId)).limit(1);
    if (existing.length > 0) {
      await db.update(activityAssignments)
        .set({ assignedToUserId, assignedBy, status: "Assigned" })
        .where(eq(activityAssignments.id, existing[0].id));
      return existing[0].id;
    }
    const [assign] = await db.insert(activityAssignments).values({
      poLineId, assignedToUserId, assignedBy, isPrimary: true, status: "Assigned",
    }).returning();
    return assign.id;
  },

  async getMyTasks(userId: number) {
    const assigns = await db.select().from(activityAssignments)
      .where(eq(activityAssignments.assignedToUserId, userId));
    if (assigns.length === 0) return [];

    const poLineIds = assigns.map(a => a.poLineId);
    const lines = await db.select().from(poLines).where(inArray(poLines.id, poLineIds));
    const assignIds = assigns.map(a => a.id);
    const responses = assignIds.length > 0
      ? await db.select().from(businessResponses).where(inArray(businessResponses.assignmentId, assignIds))
      : [];

    return assigns.map(a => {
      const line = lines.find(l => l.id === a.poLineId);
      const resp = responses.find(r => r.assignmentId === a.id);
      return {
        assignmentId: a.id,
        poNumber: line?.poNumber || "",
        poLineItem: line?.poLineItem || "",
        vendorName: line?.vendorName || "",
        itemDescription: line?.itemDescription || "",
        netAmount: line?.netAmount || 0,
        glAccount: line?.glAccount || "",
        costCenter: line?.costCenter || "",
        assignmentStatus: a.status,
        assignedDate: a.assignedDate,
        responseStatus: resp?.completionStatus || "Not Started",
        provisionAmount: resp?.provisionAmount || null,
        comments: resp?.comments || "",
      };
    });
  },

  async submitActivityResponse(data: { assignmentId: number; completionStatus: string; provisionAmount: number; provisionPercent?: number | null; comments: string }) {
    const existing = await db.select().from(businessResponses)
      .where(eq(businessResponses.assignmentId, data.assignmentId)).limit(1);

    if (existing.length > 0) {
      await db.update(businessResponses).set({
        completionStatus: data.completionStatus,
        provisionAmount: data.provisionAmount,
        provisionPercent: data.provisionPercent || null,
        comments: data.comments,
        responseDate: new Date(),
      }).where(eq(businessResponses.id, existing[0].id));
    } else {
      await db.insert(businessResponses).values({
        assignmentId: data.assignmentId,
        completionStatus: data.completionStatus,
        provisionAmount: data.provisionAmount,
        provisionPercent: data.provisionPercent || null,
        comments: data.comments,
      });
    }

    await db.update(activityAssignments).set({ status: "Responded" }).where(eq(activityAssignments.id, data.assignmentId));
  },

  async getActivityResponses() {
    const assigns = await db.select().from(activityAssignments);
    const responses = await db.select().from(businessResponses);
    const allLines = await db.select().from(poLines);
    const allUsers = await db.select().from(users);

    return assigns.map(a => {
      const line = allLines.find(l => l.id === a.poLineId);
      const resp = responses.find(r => r.assignmentId === a.id);
      const assignedUser = allUsers.find(u => u.id === a.assignedToUserId);
      if (!resp) return null;
      return {
        id: resp.id,
        assignmentId: a.id,
        poNumber: line?.poNumber || "",
        vendorName: line?.vendorName || "",
        netAmount: line?.netAmount || 0,
        assignedToName: assignedUser?.name || "",
        completionStatus: resp.completionStatus,
        provisionAmount: resp.provisionAmount,
        comments: resp.comments,
        status: a.status,
      };
    }).filter(Boolean);
  },

  async approveActivityResponse(assignmentId: number) {
    await db.update(activityAssignments).set({ status: "Approved" }).where(eq(activityAssignments.id, assignmentId));
  },

  // Non-PO
  async createNonPoForm(data: any, createdBy: number) {
    const [form] = await db.insert(nonpoForms).values({
      formName: data.formName,
      description: data.description,
      dueDate: data.dueDate,
      priority: data.priority || "Medium",
      fieldConfiguration: data.fieldConfiguration,
      createdBy,
    }).returning();

    for (const userId of (data.assignedUserIds || [])) {
      await db.insert(nonpoFormAssignments).values({ formId: form.id, assignedToUserId: userId });
    }
    return form;
  },

  async getMyForms(userId: number) {
    const assigns = await db.select().from(nonpoFormAssignments)
      .where(eq(nonpoFormAssignments.assignedToUserId, userId));
    if (assigns.length === 0) return [];

    const formIds = assigns.map(a => a.formId);
    const forms = await db.select().from(nonpoForms).where(inArray(nonpoForms.id, formIds));

    return assigns.map(a => {
      const form = forms.find(f => f.id === a.formId);
      return {
        assignmentId: a.id,
        formId: form?.id,
        formName: form?.formName,
        description: form?.description,
        dueDate: form?.dueDate,
        priority: form?.priority,
        fieldConfiguration: form?.fieldConfiguration,
      };
    });
  },

  async submitNonPoForm(data: any, submittedBy: number) {
    const [sub] = await db.insert(nonpoSubmissions).values({
      formId: data.formId,
      submittedBy,
      standardFields: data.standardFields,
      customFields: data.customFields || {},
      status: "Submitted",
    }).returning();
    return sub;
  },

  async getNonPoSubmissions() {
    const subs = await db.select().from(nonpoSubmissions).orderBy(desc(nonpoSubmissions.submissionDate));
    const forms = await db.select().from(nonpoForms);
    const allUsers = await db.select().from(users);

    return subs.map(s => {
      const form = forms.find(f => f.id === s.formId);
      const user = allUsers.find(u => u.id === s.submittedBy);
      return {
        id: s.id,
        formId: s.formId,
        formName: form?.formName || "",
        submittedByName: user?.name || "",
        submissionDate: s.submissionDate,
        standardFields: s.standardFields,
        customFields: s.customFields,
        status: s.status,
      };
    });
  },

  async reviewNonPoSubmission(id: number, status: string, reviewedBy: number) {
    await db.update(nonpoSubmissions).set({ status, reviewedBy, reviewedAt: new Date() }).where(eq(nonpoSubmissions.id, id));
  },

  // Approval Rules
  async getRules() {
    return db.select().from(approvalRules).orderBy(approvalRules.priority);
  },

  async createRule(data: any, createdBy: number) {
    const [rule] = await db.insert(approvalRules).values({
      ruleName: data.ruleName,
      naturalLanguageText: data.naturalLanguageText,
      parsedConditions: data.parsedConditions,
      parsedActions: data.parsedActions,
      appliesTo: data.appliesTo || "Both",
      createdBy,
    }).returning();
    return rule;
  },

  async deleteRule(id: number) {
    await db.delete(approvalRules).where(eq(approvalRules.id, id));
  },

  // Config
  async getConfigMap() {
    const rows = await db.select().from(systemConfig);
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.configKey] = r.configValue || "";
    }
    return map;
  },

  async updateConfig(key: string, value: string, updatedBy: number) {
    const existing = await db.select().from(systemConfig).where(eq(systemConfig.configKey, key)).limit(1);
    if (existing.length > 0) {
      await db.update(systemConfig).set({ configValue: value, updatedBy, updatedAt: new Date() }).where(eq(systemConfig.id, existing[0].id));
    } else {
      await db.insert(systemConfig).values({ configKey: key, configValue: value, updatedBy });
    }
  },

  // Notifications
  async getUnreadCount(userId: number) {
    const [result] = await db.select({ count: count() }).from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result?.count || 0;
  },

  // Permissions
  async getPermissions() {
    return db.select().from(rolePermissions);
  },

  // Dashboard
  async getFinanceDashboard() {
    const periodLines = await db.select().from(poLines).where(eq(poLines.category, "Period"));
    const activityLines = await db.select().from(poLines).where(eq(poLines.category, "Activity"));
    const nonpoSubs = await db.select().from(nonpoSubmissions);
    const allUsers = await db.select().from(users).where(eq(users.status, "Active"));
    const assigns = await db.select().from(activityAssignments);

    const totalPeriodProvision = periodLines.reduce((s, l) => s + (l.netAmount || 0), 0);
    const pendingAssigns = assigns.filter(a => a.status === "Assigned").length;
    const respondedAssigns = assigns.filter(a => a.status === "Responded" || a.status === "Approved").length;
    const completionRate = assigns.length > 0 ? Math.round((respondedAssigns / assigns.length) * 100) : 0;

    const vendorMap = new Map<string, number>();
    for (const l of [...periodLines, ...activityLines]) {
      const v = l.vendorName || "Unknown";
      vendorMap.set(v, (vendorMap.get(v) || 0) + (l.netAmount || 0));
    }
    const topVendors = Array.from(vendorMap.entries())
      .map(([name, amount]) => ({ name: name.length > 15 ? name.slice(0, 15) + ".." : name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const statusMap = new Map<string, number>();
    for (const l of [...periodLines, ...activityLines]) {
      statusMap.set(l.status, (statusMap.get(l.status) || 0) + 1);
    }
    const statusDistribution = Array.from(statusMap.entries()).map(([name, value]) => ({ name, value }));

    return {
      totalPeriodBased: periodLines.length,
      totalActivityBased: activityLines.length,
      totalNonPo: nonpoSubs.length,
      totalProvision: totalPeriodProvision,
      pendingApprovals: pendingAssigns,
      overdueItems: 0,
      completionRate,
      totalUsers: allUsers.length,
      provisionByCategory: [
        { name: "Period-Based", value: periodLines.reduce((s, l) => s + (l.netAmount || 0), 0) },
        { name: "Activity-Based", value: activityLines.reduce((s, l) => s + (l.netAmount || 0), 0) },
        { name: "Non-PO", value: nonpoSubs.length * 50000 },
      ],
      topVendors,
      statusDistribution,
    };
  },

  async getBusinessDashboard(userId: number) {
    const tasks = await this.getMyTasks(userId);
    const forms = await this.getMyForms(userId);
    const pendingTasks = tasks.filter(t => t.assignmentStatus === "Assigned").length;
    const overdueItems = tasks.filter(t => t.assignmentStatus === "Overdue").length;

    return {
      pendingTasks,
      pendingForms: forms.length,
      overdueItems,
      recentTasks: tasks.slice(0, 5).map(t => ({
        poNumber: t.poNumber,
        vendorName: t.vendorName,
        itemDescription: t.itemDescription,
        status: t.assignmentStatus,
      })),
    };
  },

  // Reports
  async getAnalytics() {
    const allLines = await db.select().from(poLines);
    const vendorMap = new Map<string, number>();
    for (const l of allLines) {
      const v = l.vendorName || "Unknown";
      vendorMap.set(v, (vendorMap.get(v) || 0) + (l.netAmount || 0));
    }
    const topVendors = Array.from(vendorMap.entries())
      .map(([name, amount]) => ({ name: name.length > 15 ? name.slice(0, 15) + ".." : name, amount }))
      .sort((a, b) => b.amount - a.amount).slice(0, 10);

    const statusMap = new Map<string, number>();
    for (const l of allLines) statusMap.set(l.status, (statusMap.get(l.status) || 0) + 1);
    const statusDistribution = Array.from(statusMap.entries()).map(([name, value]) => ({ name, value }));

    const totalAmount = allLines.reduce((s, l) => s + (l.netAmount || 0), 0);
    return {
      avgProvisionPerPo: allLines.length > 0 ? totalAmount / allLines.length : 0,
      avgResponseDays: 3,
      completionRate: 78,
      totalPoLines: allLines.length,
      topVendors,
      statusDistribution,
    };
  },

  async getExceptions() {
    return {
      negativeProvisions: 0, negativeValue: 0,
      zeroProvisions: 0,
      unassigned: 0, unassignedValue: 0,
      overdueApprovals: 0, overdueValue: 0,
      largeTrueUps: 0, largeTrueUpValue: 0,
      grnExceeds: 0, grnExceedsValue: 0,
      missingDates: 0, missingDatesValue: 0,
      missingFields: 0,
    };
  },

  // PO Upload
  async getPoUploads() {
    return db.select().from(poUploads).orderBy(desc(poUploads.uploadDate));
  },

  async createPoUpload(data: any) {
    const [upload] = await db.insert(poUploads).values(data).returning();
    return upload;
  },

  async createPoLine(data: any) {
    const [line] = await db.insert(poLines).values(data).returning();
    return line;
  },

  async createGrnTransaction(data: { poLineId: number; grnDate?: string; grnDoc?: string; grnMovementType?: string; grnValue?: number }) {
    const [grn] = await db.insert(grnTransactions).values(data).returning();
    return grn;
  },

  async clearAllPoData() {
    await db.delete(businessResponses);
    await db.delete(activityAssignments);
    await db.delete(periodCalculations);
    await db.delete(grnTransactions);
    await db.delete(poLines);
    await db.delete(poUploads);
  },

  // Audit
  async logAudit(userId: number, action: string, entityType?: string, entityId?: string, details?: any) {
    await db.insert(auditLog).values({ userId, action, entityType, entityId, details });
  },
};
