import { db } from "./db";
import { eq, and, sql, desc, count, sum, avg, inArray, isNull, ne, lt, gt } from "drizzle-orm";
import {
  users, userRoles, costCenterAssignments, poUploads, poLines, grnTransactions,
  periodCalculations, activityAssignments, businessResponses, nonpoForms,
  nonpoFormAssignments, nonpoSubmissions, approvalRules, systemConfig,
  auditLog, notifications, rolePermissions
} from "@shared/schema";
import { hashPassword } from "./auth";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDateStr(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function parseProcessingMonth(monthStr: string) {
  const parts = monthStr.trim().split(" ");
  const monthAbbr = parts[0];
  const year = parseInt(parts[1]);
  const monthIndex = MONTHS.indexOf(monthAbbr);

  if (monthIndex === -1 || isNaN(year)) {
    return {
      year: 2026, month: 1,
      monthStart: new Date(2026, 1, 1),
      monthEnd: new Date(2026, 1, 28),
      prevMonthStart: new Date(2026, 0, 1),
      prevMonthEnd: new Date(2026, 0, 31),
      monthLabel: "Feb 2026",
      prevMonthLabel: "Jan 2026",
    };
  }

  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);

  let prevMonth = monthIndex - 1;
  let prevYear = year;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear = year - 1;
  }
  const prevMonthStart = new Date(prevYear, prevMonth, 1);
  const prevMonthEnd = new Date(prevYear, prevMonth + 1, 0);

  return {
    year,
    month: monthIndex,
    monthStart,
    monthEnd,
    prevMonthStart,
    prevMonthEnd,
    monthLabel: `${MONTHS[monthIndex]} ${year}`,
    prevMonthLabel: `${MONTHS[prevMonth]} ${prevYear}`,
  };
}

function calcOverlapDays(periodStart: Date, periodEnd: Date, rangeStart: Date, rangeEnd: Date): number {
  const effectiveStart = new Date(Math.max(periodStart.getTime(), rangeStart.getTime()));
  const effectiveEnd = new Date(Math.min(periodEnd.getTime(), rangeEnd.getTime()));
  if (effectiveEnd >= effectiveStart) {
    return Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1;
  }
  return 0;
}

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

  async getPeriodBasedLines(processingMonth?: string) {
    const config = await this.getConfigMap();
    const monthStr = processingMonth || config.processing_month || "Feb 2026";
    const pm = parseProcessingMonth(monthStr);

    const lines = await db.select().from(poLines).where(eq(poLines.category, "Period")).orderBy(poLines.poNumber);

    const filteredLines = lines.filter(line => {
      const start = parseDateStr(line.startDate);
      const end = parseDateStr(line.endDate);
      if (!start || !end) {
        return true;
      }
      return start <= pm.monthEnd && end >= pm.monthStart;
    });

    const lineIds = filteredLines.map(l => l.id);
    if (lineIds.length === 0) return [];

    const calcs = await db.select().from(periodCalculations)
      .where(and(inArray(periodCalculations.poLineId, lineIds), eq(periodCalculations.processingMonth, monthStr)));
    const grns = await db.select().from(grnTransactions).where(inArray(grnTransactions.poLineId, lineIds));

    return filteredLines.map(line => {
      const calc = calcs.find(c => c.poLineId === line.id);
      const lineGrns = grns.filter(g => g.poLineId === line.id);

      let prevMonthGrn = 0;
      let currentMonthGrn = 0;
      let totalGrnToDate = 0;

      for (const g of lineGrns) {
        const gDate = parseDateStr(g.grnDate);
        const gVal = g.grnValue || 0;
        if (gDate) {
          if (gDate <= pm.monthEnd) {
            totalGrnToDate += gVal;
          }
          if (gDate >= pm.prevMonthStart && gDate <= pm.prevMonthEnd) {
            prevMonthGrn += gVal;
          }
          if (gDate >= pm.monthStart && gDate <= pm.monthEnd) {
            currentMonthGrn += gVal;
          }
        }
      }

      const start = parseDateStr(line.startDate);
      const end = parseDateStr(line.endDate);
      const totalDays = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1) : 1;
      const dailyRate = (line.netAmount || 0) / totalDays;

      let currentMonthDays = 0;
      let prevMonthDays = 0;
      if (start && end) {
        currentMonthDays = calcOverlapDays(start, end, pm.monthStart, pm.monthEnd);
        prevMonthDays = calcOverlapDays(start, end, pm.prevMonthStart, pm.prevMonthEnd);
      }

      const prevMonthProvision = Math.round(dailyRate * prevMonthDays);
      const suggestedProvision = Math.round(dailyRate * currentMonthDays);
      const prevTrueUp = calc?.prevMonthTrueUp || 0;
      const currTrueUp = calc?.currentMonthTrueUp || 0;
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
        totalGrnToDate: Math.round(totalGrnToDate),
        status: line.status || "Draft",
        category: line.category || "Period",
        prevMonthLabel: pm.prevMonthLabel,
        currentMonthLabel: pm.monthLabel,
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

  async getActivityBasedLines(processingMonth?: string) {
    const config = await this.getConfigMap();
    const monthStr = processingMonth || config.processing_month || "Feb 2026";
    const pm = parseProcessingMonth(monthStr);

    const lines = await db.select().from(poLines).where(eq(poLines.category, "Activity")).orderBy(poLines.poNumber);
    const lineIds = lines.map(l => l.id);
    if (lineIds.length === 0) return [];

    const assigns = await db.select().from(activityAssignments).where(inArray(activityAssignments.poLineId, lineIds));
    const allUsers = await db.select().from(users);
    const grns = await db.select().from(grnTransactions).where(inArray(grnTransactions.poLineId, lineIds));

    return lines.map(line => {
      const assign = assigns.find(a => a.poLineId === line.id);
      const assignedUser = assign ? allUsers.find(u => u.id === assign.assignedToUserId) : null;
      const lineGrns = grns.filter(g => g.poLineId === line.id);

      let prevMonthGrn = 0;
      let currentMonthGrn = 0;
      let totalGrnToDate = 0;

      for (const g of lineGrns) {
        const gDate = parseDateStr(g.grnDate);
        const gVal = g.grnValue || 0;
        if (gDate) {
          if (gDate <= pm.monthEnd) {
            totalGrnToDate += gVal;
          }
          if (gDate >= pm.prevMonthStart && gDate <= pm.prevMonthEnd) {
            prevMonthGrn += gVal;
          }
          if (gDate >= pm.monthStart && gDate <= pm.monthEnd) {
            currentMonthGrn += gVal;
          }
        }
      }

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
        category: line.category || "Activity",
        prevMonthGrn: Math.round(prevMonthGrn),
        currentMonthGrn: Math.round(currentMonthGrn),
        totalGrnToDate: Math.round(totalGrnToDate),
        prevMonthLabel: pm.prevMonthLabel,
        currentMonthLabel: pm.monthLabel,
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

  async getUnreadCount(userId: number) {
    const [result] = await db.select({ count: count() }).from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result?.count || 0;
  },

  async getPermissions() {
    return db.select().from(rolePermissions);
  },

  async getEffectivePermissions(userId: number) {
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    const roleNames = roles.map(r => r.role);
    if (roleNames.length === 0) return {};

    const perms = await db.select().from(rolePermissions)
      .where(inArray(rolePermissions.role, roleNames));

    const features = ["period_based", "activity_based", "non_po", "reports", "users", "config"];
    const effective: Record<string, Record<string, boolean>> = {};

    for (const feature of features) {
      const featurePerms = perms.filter(p => p.permission === feature);
      effective[feature] = {
        canView: featurePerms.some(p => p.canView),
        canCreate: featurePerms.some(p => p.canCreate),
        canEdit: featurePerms.some(p => p.canEdit),
        canDelete: featurePerms.some(p => p.canDelete),
        canApprove: featurePerms.some(p => p.canApprove),
        canDownload: featurePerms.some(p => p.canDownload),
        canInvite: featurePerms.some(p => p.canInvite),
      };
    }
    return effective;
  },

  async updatePermission(role: string, permission: string, field: string, value: boolean) {
    const existing = await db.select().from(rolePermissions)
      .where(and(eq(rolePermissions.role, role), eq(rolePermissions.permission, permission)));

    const fieldMap: Record<string, any> = {
      canView: rolePermissions.canView,
      canCreate: rolePermissions.canCreate,
      canEdit: rolePermissions.canEdit,
      canDelete: rolePermissions.canDelete,
      canApprove: rolePermissions.canApprove,
      canDownload: rolePermissions.canDownload,
      canInvite: rolePermissions.canInvite,
    };

    const column = fieldMap[field];
    if (!column) throw new Error(`Invalid permission field: ${field}`);

    if (existing.length > 0) {
      await db.update(rolePermissions)
        .set({ [field]: value } as any)
        .where(and(eq(rolePermissions.role, role), eq(rolePermissions.permission, permission)));
    } else {
      await db.insert(rolePermissions).values({
        role,
        permission,
        canView: field === "canView" ? value : false,
        canCreate: field === "canCreate" ? value : false,
        canEdit: field === "canEdit" ? value : false,
        canDelete: field === "canDelete" ? value : false,
        canApprove: field === "canApprove" ? value : false,
        canDownload: field === "canDownload" ? value : false,
        canInvite: field === "canInvite" ? value : false,
      });
    }
  },

  async getFinanceDashboard(processingMonth?: string) {
    const config = await this.getConfigMap();
    const monthStr = processingMonth || config.processing_month || "Feb 2026";
    const pm = parseProcessingMonth(monthStr);

    const allPeriodLines = await db.select().from(poLines).where(eq(poLines.category, "Period"));
    const activityLines = await db.select().from(poLines).where(eq(poLines.category, "Activity"));
    const nonpoSubs = await db.select().from(nonpoSubmissions);
    const allUsers = await db.select().from(users).where(eq(users.status, "Active"));
    const assigns = await db.select().from(activityAssignments);

    const periodLines = allPeriodLines.filter(line => {
      const start = parseDateStr(line.startDate);
      const end = parseDateStr(line.endDate);
      if (!start || !end) return true;
      return start <= pm.monthEnd && end >= pm.monthStart;
    });

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
      processingMonth: monthStr,
      currentMonthLabel: pm.monthLabel,
      prevMonthLabel: pm.prevMonthLabel,
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

  async getAnalytics(processingMonth?: string) {
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

  async getExceptions(processingMonth?: string) {
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

  async getPoUploads() {
    return db.select().from(poUploads).orderBy(desc(poUploads.uploadDate));
  },

  async createPoUpload(data: any) {
    const [upload] = await db.insert(poUploads).values(data).returning();
    return upload;
  },

  async createPoLine(data: any) {
    const [line] = await db.insert(poLines).values(data)
      .onConflictDoUpdate({
        target: poLines.uniqueId,
        set: {
          uploadId: data.uploadId,
          poNumber: data.poNumber,
          poLineItem: data.poLineItem,
          vendorName: data.vendorName,
          itemDescription: data.itemDescription,
          projectName: data.projectName,
          wbsElement: data.wbsElement,
          costCenter: data.costCenter,
          profitCenter: data.profitCenter,
          glAccount: data.glAccount,
          docType: data.docType,
          startDate: data.startDate,
          endDate: data.endDate,
          plant: data.plant,
          netAmount: data.netAmount,
          prNumber: data.prNumber,
          prOwnerId: data.prOwnerId,
          costCenterOwnerId: data.costCenterOwnerId,
          documentDate: data.documentDate,
          category: data.category,
          status: data.status,
        },
      })
      .returning();
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

  async logAudit(userId: number, action: string, entityType?: string, entityId?: string, details?: any) {
    await db.insert(auditLog).values({ userId, action, entityType, entityId, details });
  },
};
