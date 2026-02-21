import { db } from "./db";
import { eq, and, sql, desc, count, sum, avg, inArray, isNull, ne, lt, gt } from "drizzle-orm";
import {
  users, userRoles, costCenterAssignments, poUploads, poLines, grnTransactions,
  grnUploads,
  periodCalculations, activityAssignments, businessResponses, nonpoForms,
  nonpoFormAssignments, nonpoSubmissions, approvalRules, systemConfig,
  auditLog, notifications, rolePermissions, approvalSubmissions
} from "@shared/schema";
import { hashPassword } from "./auth";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// In-memory config cache — avoids a DB round-trip on every API request
let _configCache: Record<string, string> | null = null;
let _configCacheExpiry = 0;
const CONFIG_TTL_MS = 30_000;

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

/**
 * Direct lookup: returns the GRN value for rows whose grnDate falls within
 * [monthStart, monthEnd]. If multiple rows exist in the same month (re-uploads),
 * takes the latest one. Returns 0 if no row exists for that month.
 * Used for currentMonthGrn and prevMonthGrn — values come from the file, not derived.
 */
function getGrnForMonth(
  grns: { grnDate?: string | null; grnValue?: number | null }[],
  monthStart: Date,
  monthEnd: Date
): number {
  let latestInMonth: Date | null = null;
  let value = 0;
  for (const g of grns) {
    const d = parseDateStr(g.grnDate);
    if (d && d >= monthStart && d <= monthEnd) {
      if (!latestInMonth || d > latestInMonth) {
        latestInMonth = d;
        value = g.grnValue || 0;
      }
    }
  }
  return value;
}

/**
 * Returns the absolute latest GRN value with no date filter, plus a human-readable
 * label of the month it came from. Used for totalGrnToDate and pendingPoValue so
 * the value always reflects the last known cumulative GRN regardless of processing month.
 */
function getLastKnownGrn(grns: { grnDate?: string | null; grnValue?: number | null }[]): { value: number; label: string } {
  let latestDate: Date | null = null;
  let latestValue = 0;
  for (const g of grns) {
    const d = parseDateStr(g.grnDate);
    if (d && (!latestDate || d > latestDate)) {
      latestDate = d;
      latestValue = g.grnValue || 0;
    }
  }
  const label = latestDate
    ? `${MONTHS[latestDate.getMonth()]} ${latestDate.getFullYear()}`
    : "";
  return { value: latestValue, label };
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
    const [user, roles, ccs] = await Promise.all([
      this.getUserById(userId),
      db.select().from(userRoles).where(eq(userRoles.userId, userId)),
      db.select().from(costCenterAssignments).where(eq(costCenterAssignments.userId, userId)),
    ]);
    if (!user) return null;
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

    if (filteredLines.length === 0) return [];

    const filteredLineIds = filteredLines.map(l => l.id);

    const [calcs, grns] = await Promise.all([
      db.select().from(periodCalculations)
        .where(and(eq(periodCalculations.processingMonth, monthStr), inArray(periodCalculations.poLineId, filteredLineIds))),
      db.select().from(grnTransactions)
        .where(inArray(grnTransactions.poLineId, filteredLineIds)),
    ]);

    // Pre-build lookup maps for O(1) access instead of O(n) .find()/.filter() per line
    const calcMap = new Map<number, typeof calcs[0]>();
    for (const c of calcs) calcMap.set(c.poLineId, c);
    const grnMap = new Map<number, typeof grns>();
    for (const g of grns) {
      const list = grnMap.get(g.poLineId) || [];
      list.push(g);
      grnMap.set(g.poLineId, list);
    }

    return filteredLines.map(line => {
      const calc = calcMap.get(line.id);
      const lineGrns = grnMap.get(line.id) || [];

      // currentMonthGrn and prevMonthGrn: direct lookup from file by month date range
      const currentMonthGrn = getGrnForMonth(lineGrns, pm.monthStart, pm.monthEnd);
      const prevMonthGrn = getGrnForMonth(lineGrns, pm.prevMonthStart, pm.prevMonthEnd);
      // totalGrnToDate: absolute latest GRN regardless of processing month + label for tooltip
      const lastKnown = getLastKnownGrn(lineGrns);

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
      const carryForward = 0;
      const finalProvision = suggestedProvision - Math.round(lastKnown.value) + currTrueUp;

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
        carryForward,
        currentMonthDays,
        suggestedProvision,
        currentMonthGrn: Math.round(currentMonthGrn),
        currentMonthTrueUp: currTrueUp,
        remarks: calc?.remarks || "",
        finalProvision: Math.round(finalProvision),
        totalGrnToDate: Math.round(lastKnown.value),
        totalGrnDateLabel: lastKnown.label,
        pendingPoValue: Math.round((line.netAmount || 0) - lastKnown.value),
        status: line.status || "Draft",
        category: line.category || "Period",
        prevMonthLabel: pm.prevMonthLabel,
        currentMonthLabel: pm.monthLabel,
      };
    });
  },

  async updatePeriodTrueUp(poLineId: number, field: string, value: number, userId: number, processingMonth?: string) {
    const config = await this.getConfigMap();
    const month = processingMonth || config.processing_month || "Feb 2026";

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
    // If this line was recalled, editing it resets it to Draft so it can be resubmitted
    await db.update(poLines)
      .set({ status: "Draft", updatedAt: new Date() })
      .where(and(eq(poLines.id, poLineId), eq(poLines.status, "Recalled")));
  },

  async updatePeriodRemarks(poLineId: number, remarks: string, userId: number, processingMonth?: string) {
    const config = await this.getConfigMap();
    const month = processingMonth || config.processing_month || "Feb 2026";

    const existing = await db.select().from(periodCalculations)
      .where(and(eq(periodCalculations.poLineId, poLineId), eq(periodCalculations.processingMonth, month))).limit(1);

    if (existing.length > 0) {
      await db.update(periodCalculations).set({ remarks, calculatedBy: userId }).where(eq(periodCalculations.id, existing[0].id));
    } else {
      await db.insert(periodCalculations).values({ poLineId, processingMonth: month, remarks, calculatedBy: userId });
    }
    // If this line was recalled, editing it resets it to Draft so it can be resubmitted
    await db.update(poLines)
      .set({ status: "Draft", updatedAt: new Date() })
      .where(and(eq(poLines.id, poLineId), eq(poLines.status, "Recalled")));
  },

  async getActivityBasedLines(processingMonth?: string) {
    const config = await this.getConfigMap();
    const monthStr = processingMonth || config.processing_month || "Feb 2026";
    const pm = parseProcessingMonth(monthStr);

    const lines = await db.select().from(poLines).where(eq(poLines.category, "Activity")).orderBy(poLines.poNumber);

    if (lines.length === 0) return [];

    const lineIds = lines.map(l => l.id);

    // Run all independent fetches in parallel — assigns/grns/calcs have no inter-dependencies
    const [assigns, grns, calcs, prevCalcs, responses] = await Promise.all([
      lineIds.length > 0
        ? db.select().from(activityAssignments).where(inArray(activityAssignments.poLineId, lineIds))
        : Promise.resolve([] as typeof activityAssignments.$inferSelect[]),
      lineIds.length > 0
        ? db.select().from(grnTransactions).where(inArray(grnTransactions.poLineId, lineIds))
        : Promise.resolve([] as typeof grnTransactions.$inferSelect[]),
      lineIds.length > 0
        ? db.select().from(periodCalculations)
            .where(and(eq(periodCalculations.processingMonth, monthStr), inArray(periodCalculations.poLineId, lineIds)))
        : Promise.resolve([] as typeof periodCalculations.$inferSelect[]),
      // Previous month calculations — for prev month final provision display
      lineIds.length > 0
        ? db.select().from(periodCalculations)
            .where(and(eq(periodCalculations.processingMonth, pm.prevMonthLabel), inArray(periodCalculations.poLineId, lineIds)))
        : Promise.resolve([] as typeof periodCalculations.$inferSelect[]),
      // Business user responses — needed for provisionPercent (% of completion)
      Promise.resolve([] as typeof businessResponses.$inferSelect[]),
    ]);

    // Fetch responses in a second pass since we need assignment IDs first
    const assignmentIds = assigns.map(a => a.id);
    const allResponses = assignmentIds.length > 0
      ? await db.select().from(businessResponses).where(inArray(businessResponses.assignmentId, assignmentIds))
      : [];

    const assignedUserIds = Array.from(new Set(assigns.map(a => a.assignedToUserId).filter(Boolean))) as number[];
    const allUsers = assignedUserIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, assignedUserIds))
      : [];

    // Pre-build lookup maps for O(1) access instead of O(n) .find()/.filter() per line
    const assignMap = new Map<number, typeof assigns[0]>();
    const allAssignedUserIdsMap = new Map<number, number[]>();
    for (const a of assigns) {
      const existing = assignMap.get(a.poLineId);
      if (!existing || a.isPrimary) assignMap.set(a.poLineId, a);
      const ids = allAssignedUserIdsMap.get(a.poLineId) || [];
      ids.push(a.assignedToUserId);
      allAssignedUserIdsMap.set(a.poLineId, ids);
    }
    const userMap = new Map<number, typeof allUsers[0]>();
    for (const u of allUsers) userMap.set(u.id, u);
    const calcMap = new Map<number, typeof calcs[0]>();
    for (const c of calcs) calcMap.set(c.poLineId, c);
    const prevCalcMap = new Map<number, typeof prevCalcs[0]>();
    for (const c of prevCalcs) prevCalcMap.set(c.poLineId, c);
    const responseByAssignment = new Map<number, typeof allResponses[0]>();
    for (const r of allResponses) responseByAssignment.set(r.assignmentId, r);
    const grnMap = new Map<number, typeof grns>();
    for (const g of grns) {
      const list = grnMap.get(g.poLineId) || [];
      list.push(g);
      grnMap.set(g.poLineId, list);
    }

    const provisionUpserts: Promise<any>[] = [];

    const result = lines.map(line => {
      const assign = assignMap.get(line.id);
      const assignedUser = assign ? userMap.get(assign.assignedToUserId) ?? null : null;
      const lineGrns = grnMap.get(line.id) || [];
      const calc = calcMap.get(line.id);
      const prevCalc = prevCalcMap.get(line.id);
      const lastKnown = getLastKnownGrn(lineGrns);
      const currentMonthGrn = getGrnForMonth(lineGrns, pm.monthStart, pm.monthEnd);
      const prevMonthGrn = getGrnForMonth(lineGrns, pm.prevMonthStart, pm.prevMonthEnd);
      const currTrueUp = calc?.currentMonthTrueUp || 0;

      // Get business user's % of completion from their response (if any)
      const response = assign ? responseByAssignment.get(assign.id) : null;
      const provisionPercent = response?.provisionPercent ?? null;
      const isAssigned = !!assign;

      // Activity-Based formula: (PO × % completion) − GRN to date + True-up
      // Only calculate if a business user has responded with a % of completion
      let finalProvision: number | null = null;
      if (provisionPercent != null) {
        finalProvision = Math.round(
          ((line.netAmount || 0) * provisionPercent / 100) - lastKnown.value + currTrueUp
        );
      }

      // Previous month final provision stored from last month's run
      const prevMonthFinalProvision = prevCalc?.activityFinalProvision ?? null;

      // Auto-save computed activity provision for this month (for next month's prev display)
      if (finalProvision != null) {
        provisionUpserts.push(
          db.insert(periodCalculations)
            .values({ poLineId: line.id, processingMonth: monthStr, activityFinalProvision: finalProvision })
            .onConflictDoUpdate({
              target: [periodCalculations.poLineId, periodCalculations.processingMonth],
              set: { activityFinalProvision: finalProvision },
            })
        );
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
        profitCenter: line.profitCenter || "",
        startDate: line.startDate || "",
        endDate: line.endDate || "",
        projectName: line.projectName || "",
        plant: line.plant || "",
        status: line.status || "Draft",
        assignmentId: assign?.id || null,
        assignedToUserId: assign?.assignedToUserId || null,
        allAssignedUserIds: allAssignedUserIdsMap.get(line.id) || [],
        assignedToName: assignedUser?.name || null,
        assignmentStatus: assign?.status || "Not Assigned",
        assignedDate: assign?.assignedDate || null,
        category: line.category || "Activity",
        isAssigned,
        // Business user response data
        provisionPercent,
        responseProvisionAmount: response?.provisionAmount ?? null,
        responseCompletionStatus: response?.completionStatus ?? null,
        responseComments: response?.comments ?? null,
        // GRN data
        prevMonthGrn: Math.round(prevMonthGrn),
        currentMonthGrn: Math.round(currentMonthGrn),
        totalGrnToDate: Math.round(lastKnown.value),
        totalGrnDateLabel: lastKnown.label,
        pendingPoValue: Math.round((line.netAmount || 0) - lastKnown.value),
        // Provision (Activity-Based formula)
        currentMonthTrueUp: currTrueUp,
        remarks: calc?.remarks || "",
        finalProvision,
        prevMonthFinalProvision,
        prevMonthLabel: pm.prevMonthLabel,
        currentMonthLabel: pm.monthLabel,
      };
    });

    // Fire-and-forget background save of computed provisions
    if (provisionUpserts.length > 0) {
      Promise.all(provisionUpserts).catch(() => {});
    }

    return result;
  },

  async assignActivityPo(poLineId: number, assignedToUserId: number, assignedBy: number) {
    const existing = await db.select().from(activityAssignments)
      .where(eq(activityAssignments.poLineId, poLineId)).limit(1);
    if (existing.length > 0) {
      await db.update(activityAssignments)
        .set({ assignedToUserId, assignedBy, status: "Assigned" })
        .where(eq(activityAssignments.id, existing[0].id));
    } else {
      await db.insert(activityAssignments).values({
        poLineId, assignedToUserId, assignedBy, isPrimary: true, status: "Assigned",
      });
    }
    // Mark the PO line as Submitted so it hides from the main list
    await db.update(poLines).set({ status: "Submitted" }).where(eq(poLines.id, poLineId));
    return existing[0]?.id;
  },

  async assignActivityPoMultiple(poLineId: number, assignedToUserIds: number[], assignedBy: number) {
    // Only delete unresponded assignments — preserve Responded/Approved records to avoid data loss
    // (businessResponses has onDelete: "cascade" on activityAssignments, so deleting an assignment
    //  permanently deletes the business user's response)
    const existing = await db.select().from(activityAssignments)
      .where(eq(activityAssignments.poLineId, poLineId));
    const deletableIds = existing
      .filter(a => a.status === "Assigned" || a.status === "Recalled" || !a.status)
      .map(a => a.id);
    if (deletableIds.length > 0) {
      await db.delete(activityAssignments).where(inArray(activityAssignments.id, deletableIds));
    }
    // Create new assignments (first user is primary)
    const inserted = [];
    for (let i = 0; i < assignedToUserIds.length; i++) {
      const [assign] = await db.insert(activityAssignments).values({
        poLineId,
        assignedToUserId: assignedToUserIds[i],
        assignedBy,
        isPrimary: i === 0,
        status: "Assigned",
      }).returning();
      inserted.push(assign);
    }
    // Mark the PO line as Submitted so it hides from main list
    await db.update(poLines).set({ status: "Submitted" }).where(eq(poLines.id, poLineId));
    return inserted;
  },

  async recallSubmission(submissionId: number) {
    const [sub] = await db.select().from(approvalSubmissions)
      .where(eq(approvalSubmissions.id, submissionId)).limit(1);
    if (!sub) throw new Error("Submission not found");
    await db.update(approvalSubmissions)
      .set({ status: "Recalled" })
      .where(eq(approvalSubmissions.id, submissionId));
    // Reset line back to "Recalled" so it reappears in main list (requires edit before resubmit)
    await db.update(poLines).set({ status: "Recalled" }).where(eq(poLines.id, sub.poLineId));
    return { poLineId: sub.poLineId, processingMonth: sub.processingMonth };
  },

  async recallActivityAssignment(assignmentId: number) {
    const [assign] = await db.select().from(activityAssignments)
      .where(eq(activityAssignments.id, assignmentId)).limit(1);
    if (!assign) throw new Error("Assignment not found");
    // Only remove the specific assignment being recalled — not all assignments for the PO line.
    // Deleting all was the original bug: it would wipe out every other assignee's row from the
    // approval tracker when only one was being recalled.
    await db.delete(activityAssignments).where(eq(activityAssignments.id, assignmentId));
    // Only reset the PO line status if there are no remaining active assignments.
    // If other users are still assigned/responded/approved, the line stays "Submitted".
    const remaining = await db.select({ id: activityAssignments.id })
      .from(activityAssignments)
      .where(and(
        eq(activityAssignments.poLineId, assign.poLineId),
        inArray(activityAssignments.status, ["Assigned", "Responded", "Approved"])
      ));
    const fullyRecalled = remaining.length === 0;
    if (fullyRecalled) {
      await db.update(poLines).set({ status: "Recalled" }).where(eq(poLines.id, assign.poLineId));
    }
    return { poLineId: assign.poLineId, fullyRecalled };
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
        // PO Line details
        poNumber: line?.poNumber || "",
        poLineItem: line?.poLineItem || "",
        vendorName: line?.vendorName || "",
        itemDescription: line?.itemDescription || "",
        netAmount: line?.netAmount || 0,
        glAccount: line?.glAccount || "",
        costCenter: line?.costCenter || "",
        profitCenter: line?.profitCenter || "",
        plant: line?.plant || "",
        wbsElement: line?.wbsElement || "",
        projectName: line?.projectName || "",
        prNumber: line?.prNumber || "",
        prOwnerId: line?.prOwnerId || "",
        costCenterOwnerId: line?.costCenterOwnerId || "",
        documentDate: line?.documentDate || "",
        startDate: line?.startDate || "",
        endDate: line?.endDate || "",
        docType: line?.docType || "",
        // Assignment details
        assignmentStatus: a.status,
        assignedDate: a.assignedDate,
        isPrimary: a.isPrimary ?? false,
        nudgeCount: a.nudgeCount ?? 0,
        lastNudgeAt: a.lastNudgeAt,
        returnComments: a.returnComments ?? null,
        returnedAt: a.returnedAt ?? null,
        // Response details
        responseStatus: resp?.completionStatus || "Not Started",
        provisionAmount: resp?.provisionAmount ?? null,
        provisionPercent: resp?.provisionPercent ?? null,
        comments: resp?.comments || "",
        responseDate: resp?.responseDate || null,
        financeTrueUp: resp?.financeTrueUp ?? null,
        financeRemarks: resp?.financeRemarks || "",
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
    const allGrns = await db.select().from(grnTransactions);

    // Build GRN lookup map for last-known cumulative GRN per PO line
    const grnMap = new Map<number, typeof allGrns>();
    for (const g of allGrns) {
      const list = grnMap.get(g.poLineId) || [];
      list.push(g);
      grnMap.set(g.poLineId, list);
    }

    return assigns.map(a => {
      const line = allLines.find(l => l.id === a.poLineId);
      const resp = responses.find(r => r.assignmentId === a.id);
      const assignedUser = allUsers.find(u => u.id === a.assignedToUserId);
      const lineGrns = grnMap.get(a.poLineId) || [];
      const lastKnown = getLastKnownGrn(lineGrns);
      const totalGrnToDate = Math.round(lastKnown.value);

      // Compute activity provision: (PO × %) − GRN to date
      const provisionPercent = resp?.provisionPercent ?? null;
      const activityProvision = provisionPercent != null
        ? Math.round(((line?.netAmount || 0) * provisionPercent / 100) - totalGrnToDate)
        : null;

      return {
        id: resp?.id ?? null,
        assignmentId: a.id,
        poLineId: a.poLineId,
        hasResponse: !!resp,
        totalGrnToDate,
        activityProvision,
        // PO Line details — full set
        poNumber: line?.poNumber || "",
        poLineItem: line?.poLineItem || "",
        vendorName: line?.vendorName || "",
        itemDescription: line?.itemDescription || "",
        netAmount: line?.netAmount || 0,
        glAccount: line?.glAccount || "",
        costCenter: line?.costCenter || "",
        profitCenter: line?.profitCenter || "",
        plant: line?.plant || "",
        wbsElement: line?.wbsElement || "",
        projectName: line?.projectName || "",
        prNumber: line?.prNumber || "",
        prOwnerId: line?.prOwnerId || "",
        costCenterOwnerId: line?.costCenterOwnerId || "",
        documentDate: line?.documentDate || "",
        startDate: line?.startDate || "",
        endDate: line?.endDate || "",
        docType: line?.docType || "",
        category: line?.category || "",
        // Assignment details
        assignedToName: assignedUser?.name || "",
        assignedToEmail: assignedUser?.email || "",
        assignedDate: a.assignedDate,
        isPrimary: a.isPrimary ?? false,
        nudgeCount: a.nudgeCount ?? 0,
        lastNudgeAt: a.lastNudgeAt,
        // Response details (null if not responded yet)
        completionStatus: resp?.completionStatus ?? null,
        provisionAmount: resp?.provisionAmount ?? null,
        provisionPercent: resp?.provisionPercent ?? null,
        comments: resp?.comments ?? null,
        responseDate: resp?.responseDate ?? null,
        financeTrueUp: resp?.financeTrueUp ?? null,
        financeRemarks: resp?.financeRemarks ?? "",
        status: a.status,
        returnComments: a.returnComments ?? null,
        returnedAt: a.returnedAt ?? null,
      };
    });
  },

  // Clear business responses & recall all active assignments so Finance Admin can re-assign
  async resetActivityResponse(poLineId: number) {
    // Find all active assignments for this PO line (exclude already recalled/approved)
    const allAssigns = await db.select().from(activityAssignments)
      .where(eq(activityAssignments.poLineId, poLineId));
    const assigns = allAssigns.filter(a => a.status !== "Recalled" && a.status !== "Approved");

    for (const a of assigns) {
      // Delete business responses for each assignment
      await db.delete(businessResponses).where(eq(businessResponses.assignmentId, a.id));
      // Recall the assignment so it can be re-assigned fresh
      await db.update(activityAssignments)
        .set({ status: "Recalled" })
        .where(eq(activityAssignments.id, a.id));
    }

    // Reset PO line back to Draft (unassigned state)
    await db.update(poLines).set({ status: "Draft" }).where(eq(poLines.id, poLineId));

    return { poLineId, resetCount: assigns.length };
  },

  async approveActivityResponse(assignmentId: number) {
    await db.update(activityAssignments).set({ status: "Approved" }).where(eq(activityAssignments.id, assignmentId));
    // Also mark the PO line as Approved
    const [assign] = await db.select().from(activityAssignments).where(eq(activityAssignments.id, assignmentId)).limit(1);
    if (assign) await db.update(poLines).set({ status: "Approved" }).where(eq(poLines.id, assign.poLineId));
  },

  // Submit a responded activity assignment for Finance Approver review (creates an approvalSubmission)
  async submitActivityForApproval(assignmentId: number, approverIds: number[], submittedBy: number, processingMonth: string) {
    const [assign] = await db.select().from(activityAssignments)
      .where(eq(activityAssignments.id, assignmentId)).limit(1);
    if (!assign) throw new Error("Assignment not found");

    // Check for existing pending submission for this assignment
    const existing = await db.select().from(approvalSubmissions)
      .where(and(
        eq(approvalSubmissions.poLineId, assign.poLineId),
        eq(approvalSubmissions.processingMonth, processingMonth),
        eq(approvalSubmissions.status, "Pending"),
      )).limit(1);

    if (existing.length === 0) {
      await db.insert(approvalSubmissions).values({
        poLineId: assign.poLineId,
        submittedBy,
        approverIds,
        status: "Pending",
        processingMonth,
        nudgeCount: 0,
      });
    }

    // Mark both the assignment and the PO line as Submitted
    await db.update(activityAssignments)
      .set({ status: "Submitted" })
      .where(eq(activityAssignments.id, assignmentId));
    await db.update(poLines)
      .set({ status: "Submitted" })
      .where(eq(poLines.id, assign.poLineId));

    return { poLineId: assign.poLineId };
  },

  // Get Activity-Based items from approvalSubmissions (only items explicitly submitted for approval)
  async getActivityApprovalTracker() {
    const subs = await db.select().from(approvalSubmissions).orderBy(desc(approvalSubmissions.submittedAt));
    const allLines = await db.select().from(poLines).where(eq(poLines.category, "Activity"));
    const allLineIds = new Set(allLines.map(l => l.id));
    const activitySubs = subs.filter(s => allLineIds.has(s.poLineId));

    if (activitySubs.length === 0) return [];

    const lineIds = activitySubs.map(s => s.poLineId);
    const [assigns, responses, allUsers] = await Promise.all([
      db.select().from(activityAssignments).where(inArray(activityAssignments.poLineId, lineIds)),
      db.select().from(businessResponses),
      db.select().from(users),
    ]);

    const assignMap = new Map<number, typeof assigns[0]>();
    for (const a of assigns) {
      const existing = assignMap.get(a.poLineId);
      if (!existing || a.isPrimary || a.status === "Submitted" || a.status === "Approved") {
        assignMap.set(a.poLineId, a);
      }
    }
    const responseMap = new Map<number, typeof responses[0]>();
    for (const r of responses) responseMap.set(r.assignmentId, r);
    const lineMap = new Map<number, typeof allLines[0]>();
    for (const l of allLines) lineMap.set(l.id, l);
    const userMap = new Map<number, typeof allUsers[0]>();
    for (const u of allUsers) userMap.set(u.id, u);

    return activitySubs.map(s => {
      const line = lineMap.get(s.poLineId);
      const assign = assignMap.get(s.poLineId);
      const resp = assign ? responseMap.get(assign.id) : null;
      const assignedUser = assign ? userMap.get(assign.assignedToUserId) : null;
      const submitter = userMap.get(s.submittedBy);
      const approverNames = (s.approverIds as number[]).map(id => {
        const u = userMap.get(id);
        return u ? u.name : `User #${id}`;
      });

      return {
        id: s.id,
        assignmentId: assign?.id ?? null,
        poLineId: s.poLineId,
        hasResponse: !!resp,
        poNumber: line?.poNumber || "",
        poLineItem: line?.poLineItem || "",
        vendorName: line?.vendorName || "",
        itemDescription: line?.itemDescription || "",
        netAmount: line?.netAmount || 0,
        glAccount: line?.glAccount || "",
        costCenter: line?.costCenter || "",
        profitCenter: line?.profitCenter || "",
        plant: line?.plant || "",
        wbsElement: line?.wbsElement || "",
        projectName: line?.projectName || "",
        prNumber: line?.prNumber || "",
        prOwnerId: line?.prOwnerId || "",
        costCenterOwnerId: line?.costCenterOwnerId || "",
        documentDate: line?.documentDate || "",
        startDate: line?.startDate || "",
        endDate: line?.endDate || "",
        docType: line?.docType || "",
        category: "Activity",
        // Assignment
        assignedToName: assignedUser?.name || "",
        assignedToEmail: assignedUser?.email || "",
        assignedDate: assign?.assignedDate ?? null,
        isPrimary: assign?.isPrimary ?? false,
        nudgeCount: assign?.nudgeCount ?? 0,
        lastNudgeAt: assign?.lastNudgeAt ?? null,
        // Response
        completionStatus: resp?.completionStatus ?? null,
        provisionAmount: resp?.provisionAmount ?? null,
        provisionPercent: resp?.provisionPercent ?? null,
        comments: resp?.comments ?? null,
        responseDate: resp?.responseDate ?? null,
        financeTrueUp: resp?.financeTrueUp ?? null,
        financeRemarks: resp?.financeRemarks ?? "",
        status: s.status,
        returnComments: assign?.returnComments ?? null,
        returnedAt: assign?.returnedAt ?? null,
        // Submission info
        submittedBy: submitter?.name || "",
        submittedAt: s.submittedAt,
        approverNames,
        processingMonth: s.processingMonth,
      };
    });
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
    const [forms, submissions] = await Promise.all([
      db.select().from(nonpoForms).where(inArray(nonpoForms.id, formIds)),
      db.select().from(nonpoSubmissions)
        .where(and(inArray(nonpoSubmissions.formId, formIds), eq(nonpoSubmissions.submittedBy, userId))),
    ]);

    return assigns.map(a => {
      const form = forms.find(f => f.id === a.formId);
      const submission = submissions.find(s => s.formId === a.formId);
      const sf = submission?.standardFields as Record<string, any> | null;
      return {
        assignmentId: a.id,
        formId: form?.id,
        formName: form?.formName,
        description: form?.description,
        dueDate: form?.dueDate,
        priority: form?.priority,
        fieldConfiguration: form?.fieldConfiguration,
        assignedDate: a.assignedDate,
        assignmentStatus: a.status || "Assigned",
        nudgeCount: a.nudgeCount ?? 0,
        lastNudgeAt: a.lastNudgeAt,
        returnComments: a.returnComments ?? null,
        returnedAt: a.returnedAt ?? null,
        submissionId: submission?.id ?? null,
        submissionStatus: submission?.status || null,
        submissionDate: submission?.submissionDate || null,
        submittedAmount: sf?.provisionAmount ?? null,
        submittedVendor: sf?.vendorName ?? null,
        submittedDescription: sf?.serviceDescription ?? null,
        submittedFields: sf ?? null,
        reviewStatus: submission?.reviewedAt ? "Reviewed" : submission?.status === "Submitted" ? "Pending Review" : null,
        reviewedAt: submission?.reviewedAt ?? null,
        financeRemarks: submission?.financeRemarks ?? null,
        financeTrueUp: submission?.financeTrueUp ?? null,
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
    const [subs, assignments, forms, allUsers] = await Promise.all([
      db.select().from(nonpoSubmissions).orderBy(desc(nonpoSubmissions.submissionDate)),
      db.select().from(nonpoFormAssignments),
      db.select().from(nonpoForms),
      db.select().from(users),
    ]);

    // Build a set of (formId, submittedBy) pairs that have submissions
    const submittedKeys = new Set(subs.map(s => `${s.formId}:${s.submittedBy}`));

    // Map submitted entries
    const submittedItems = subs.map(s => {
      const form = forms.find(f => f.id === s.formId);
      const user = allUsers.find(u => u.id === s.submittedBy);
      const reviewer = s.reviewedBy ? allUsers.find(u => u.id === s.reviewedBy) : null;
      // Find the corresponding assignment to get nudge info
      const assignment = assignments.find(a => a.formId === s.formId && a.assignedToUserId === s.submittedBy);
      return {
        id: s.id,
        assignmentId: assignment?.id ?? null,
        formId: s.formId,
        hasSubmission: true,
        // Form metadata
        formName: form?.formName || "",
        formDescription: form?.description || "",
        dueDate: form?.dueDate || "",
        priority: form?.priority || "",
        // Submission details
        submittedByName: user?.name || "",
        submittedByEmail: user?.email || "",
        submissionDate: s.submissionDate,
        standardFields: s.standardFields,
        customFields: s.customFields,
        // Nudge
        nudgeCount: assignment?.nudgeCount ?? 0,
        lastNudgeAt: assignment?.lastNudgeAt ?? null,
        // Return-to-finance details
        returnComments: assignment?.returnComments ?? null,
        returnedAt: assignment?.returnedAt ?? null,
        assignmentStatus: assignment?.status ?? "Assigned",
        // Finance review
        status: s.status,
        reviewedByName: reviewer?.name || null,
        reviewedAt: s.reviewedAt,
        financeTrueUp: s.financeTrueUp ?? null,
        financeRemarks: s.financeRemarks || "",
      };
    });

    // Map unsubmitted assignments (assigned but never submitted)
    const pendingItems = assignments
      .filter(a => !submittedKeys.has(`${a.formId}:${a.assignedToUserId}`))
      .map(a => {
        const form = forms.find(f => f.id === a.formId);
        const user = allUsers.find(u => u.id === a.assignedToUserId);
        return {
          id: null,
          assignmentId: a.id,
          formId: a.formId,
          hasSubmission: false,
          // Form metadata
          formName: form?.formName || "",
          formDescription: form?.description || "",
          dueDate: form?.dueDate || "",
          priority: form?.priority || "",
          // Assignee details (no submission yet)
          submittedByName: user?.name || "",
          submittedByEmail: user?.email || "",
          submissionDate: null,
          standardFields: null,
          customFields: null,
          // Nudge
          nudgeCount: a.nudgeCount ?? 0,
          lastNudgeAt: a.lastNudgeAt ?? null,
          // Return-to-finance details
          returnComments: a.returnComments ?? null,
          returnedAt: a.returnedAt ?? null,
          assignmentStatus: a.status || "Assigned",
          // Review (not applicable yet)
          status: a.status === "Returned" ? "Returned" : "Pending",
          reviewedByName: null,
          reviewedAt: null,
          financeTrueUp: null,
          financeRemarks: "",
        };
      });

    return [...submittedItems, ...pendingItems];
  },

  async reviewNonPoSubmission(id: number, status: string, reviewedBy: number) {
    await db.update(nonpoSubmissions).set({ status, reviewedBy, reviewedAt: new Date() }).where(eq(nonpoSubmissions.id, id));
  },

  // Submit a Non-PO assignment for Finance Approver review
  async submitNonPoForApproval(assignmentId: number, _approverIds: number[] = []) {
    const [assign] = await db.select().from(nonpoFormAssignments)
      .where(eq(nonpoFormAssignments.id, assignmentId)).limit(1);
    if (!assign) throw new Error("Assignment not found");
    await db.update(nonpoFormAssignments)
      .set({ status: "Submitted" })
      .where(eq(nonpoFormAssignments.id, assignmentId));
    return { formId: assign.formId };
  },

  // Get Non-PO items that Finance Admin has submitted for approval (Approval Tracker)
  async getNonPoApprovalTracker() {
    const [subs, assignments, forms, allUsers] = await Promise.all([
      db.select().from(nonpoSubmissions).orderBy(desc(nonpoSubmissions.submissionDate)),
      db.select().from(nonpoFormAssignments).where(eq(nonpoFormAssignments.status, "Submitted")),
      db.select().from(nonpoForms),
      db.select().from(users),
    ]);

    if (assignments.length === 0) return [];

    return subs
      .filter(s => assignments.some(a => a.formId === s.formId && a.assignedToUserId === s.submittedBy))
      .map(s => {
        const form = forms.find(f => f.id === s.formId);
        const user = allUsers.find(u => u.id === s.submittedBy);
        const reviewer = s.reviewedBy ? allUsers.find(u => u.id === s.reviewedBy) : null;
        const assignment = assignments.find(a => a.formId === s.formId && a.assignedToUserId === s.submittedBy);
        return {
          id: s.id,
          assignmentId: assignment?.id ?? null,
          formId: s.formId,
          hasSubmission: true,
          formName: form?.formName || "",
          formDescription: form?.description || "",
          dueDate: form?.dueDate || "",
          priority: form?.priority || "",
          submittedByName: user?.name || "",
          submittedByEmail: user?.email || "",
          submissionDate: s.submissionDate,
          standardFields: s.standardFields,
          customFields: s.customFields,
          nudgeCount: assignment?.nudgeCount ?? 0,
          lastNudgeAt: assignment?.lastNudgeAt ?? null,
          returnComments: assignment?.returnComments ?? null,
          returnedAt: assignment?.returnedAt ?? null,
          assignmentStatus: assignment?.status ?? "Submitted",
          status: s.status,
          reviewedByName: reviewer?.name || null,
          reviewedAt: s.reviewedAt,
          financeTrueUp: s.financeTrueUp ?? null,
          financeRemarks: s.financeRemarks || "",
        };
      });
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

  async updateRuleStatus(id: number, isActive: boolean) {
    const [rule] = await db.update(approvalRules)
      .set({ isActive })
      .where(eq(approvalRules.id, id))
      .returning();
    return rule;
  },

  async matchRulesForPoLines(poLineIds: number[]) {
    const lines = await db.select().from(poLines).where(inArray(poLines.id, poLineIds));
    const activeRules = await db.select().from(approvalRules).where(eq(approvalRules.isActive, true)).orderBy(approvalRules.priority);
    const allApprovers = await this.getApprovers();

    // Fetch latest period calculations for each PO line and merge into line objects
    const calculations = await db.select().from(periodCalculations)
      .where(inArray(periodCalculations.poLineId, poLineIds))
      .orderBy(desc(periodCalculations.calculatedAt));
    const calcMap = new Map<number, any>();
    for (const c of calculations) {
      if (!calcMap.has(c.poLineId)) calcMap.set(c.poLineId, c);
    }

    const enrichedLines = lines.map(l => ({
      ...l,
      currentMonthTrueUp: calcMap.get(l.id)?.currentMonthTrueUp ?? 0,
      prevMonthTrueUp: calcMap.get(l.id)?.prevMonthTrueUp ?? 0,
      finalProvision: (() => {
        const calc = calcMap.get(l.id);
        if (!calc) return 0;
        return Math.round((calc.currentMonthTrueUp ?? 0));
      })(),
      suggestedProvision: calcMap.get(l.id)?.activityFinalProvision ?? 0,
    }));

    function evaluateCondition(line: any, cond: any): boolean {
      const fieldMap: Record<string, string> = {
        costCenter: "costCenter", vendorName: "vendorName", netAmount: "netAmount",
        glAccount: "glAccount", plant: "plant", profitCenter: "profitCenter",
        itemDescription: "itemDescription", poNumber: "poNumber",
        currentMonthTrueUp: "currentMonthTrueUp", prevMonthTrueUp: "prevMonthTrueUp",
        finalProvision: "finalProvision", suggestedProvision: "suggestedProvision",
      };
      const lineField = fieldMap[cond.field] || cond.field;
      const lineValue = line[lineField];
      if (lineValue == null) return false;

      const strLine = String(lineValue).toLowerCase().trim();
      const strCond = String(cond.value).toLowerCase().trim();

      switch (cond.operator) {
        case "equals": return strLine === strCond;
        case "notEquals": return strLine !== strCond;
        case "contains": return strLine.includes(strCond);
        case "startsWith": return strLine.startsWith(strCond);
        case "greaterThan": return parseFloat(String(lineValue)) > parseFloat(String(cond.value));
        case "lessThan": return parseFloat(String(lineValue)) < parseFloat(String(cond.value));
        case "between": {
          const parts = Array.isArray(cond.value) ? cond.value : String(cond.value).split(",").map(Number);
          const num = parseFloat(String(lineValue));
          return num >= parts[0] && num <= parts[1];
        }
        default: return false;
      }
    }

    const matchedRules: any[] = [];
    const suggestedApproverIdSet = new Set<number>();

    for (const rule of activeRules) {
      const conditions = (rule.parsedConditions as any[]) || [];
      const actions = (rule.parsedActions as any[]) || [];

      const matchingLines = enrichedLines.filter(line =>
        conditions.length === 0 || conditions.every(c => evaluateCondition(line, c))
      );

      if (matchingLines.length === 0) continue;

      const ruleApprovers: Array<{ id: number; name: string; email: string }> = [];
      let isAllApprovers = false;

      for (const action of actions) {
        if (action.type === "autoAssign") {
          isAllApprovers = true;
          for (const a of allApprovers) {
            ruleApprovers.push(a);
            suggestedApproverIdSet.add(a.id);
          }
        } else if (action.type === "assignTo" || action.type === "requireApproval") {
          // Direct userId reference (when chips were customized before saving)
          if (action.userId) {
            const found = allApprovers.find(a => a.id === Number(action.userId));
            if (found) {
              if (!ruleApprovers.find(r => r.id === found.id)) ruleApprovers.push(found);
              suggestedApproverIdSet.add(found.id);
            }
          } else {
            const name = (action.userName || action.approverName || "").toLowerCase().trim();
            if (name) {
              const found = allApprovers.find(a =>
                a.name.toLowerCase() === name ||
                a.name.toLowerCase().includes(name) ||
                name.includes(a.name.toLowerCase())
              );
              if (found) {
                if (!ruleApprovers.find(r => r.id === found.id)) ruleApprovers.push(found);
                suggestedApproverIdSet.add(found.id);
              }
            }
          }
        }
      }

      matchedRules.push({
        id: rule.id,
        ruleName: rule.ruleName,
        naturalLanguageText: rule.naturalLanguageText,
        parsedConditions: rule.parsedConditions,
        parsedActions: rule.parsedActions,
        appliesTo: rule.appliesTo,
        matchingLineCount: matchingLines.length,
        suggestedApprovers: ruleApprovers,
        isAllApprovers,
      });
    }

    return {
      matchedRules,
      suggestedApproverIds: Array.from(suggestedApproverIdSet),
      allApprovers,
    };
  },

  async getConfigMap() {
    if (_configCache && Date.now() < _configCacheExpiry) return _configCache;
    const rows = await db.select().from(systemConfig);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.configKey] = r.configValue || "";
    _configCache = map;
    _configCacheExpiry = Date.now() + CONFIG_TTL_MS;
    return map;
  },

  async updateConfig(key: string, value: string, updatedBy: number) {
    _configCache = null; // Invalidate cache on any config change
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

    // Run all independent DB queries in parallel — cuts sequential wait by ~5x
    const [allPeriodLines, allActivityLines, [{ count: nonpoCount }], [{ count: activeUserCount }], assigns] = await Promise.all([
      db.select({
        id: poLines.id, startDate: poLines.startDate, endDate: poLines.endDate,
        netAmount: poLines.netAmount, vendorName: poLines.vendorName, status: poLines.status,
      }).from(poLines).where(eq(poLines.category, "Period")),
      db.select({
        id: poLines.id, netAmount: poLines.netAmount, vendorName: poLines.vendorName, status: poLines.status,
      }).from(poLines).where(eq(poLines.category, "Activity")),
      db.select({ count: count() }).from(nonpoSubmissions),
      db.select({ count: count() }).from(users).where(eq(users.status, "Active")),
      db.select({ id: activityAssignments.id, status: activityAssignments.status }).from(activityAssignments),
    ]);

    const periodLines = allPeriodLines.filter(line => {
      const start = parseDateStr(line.startDate);
      const end = parseDateStr(line.endDate);
      if (!start || !end) return true;
      return start <= pm.monthEnd && end >= pm.monthStart;
    });

    const activityLines = allActivityLines;

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
      totalNonPo: nonpoCount,
      totalProvision: totalPeriodProvision,
      pendingApprovals: pendingAssigns,
      overdueItems: 0,
      completionRate,
      totalUsers: activeUserCount,
      provisionByCategory: [
        { name: "Period-Based", value: periodLines.reduce((s, l) => s + (l.netAmount || 0), 0) },
        { name: "Activity-Based", value: activityLines.reduce((s, l) => s + (l.netAmount || 0), 0) },
        { name: "Non-PO", value: Number(nonpoCount) * 50000 },
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
    const periodLines = await this.getPeriodBasedLines(processingMonth);
    const activityLines = await this.getActivityBasedLines(processingMonth);
    const allReportLines = [...periodLines, ...activityLines];

    const vendorMap = new Map<string, number>();
    for (const l of allReportLines) {
      const v = l.vendorName || "Unknown";
      vendorMap.set(v, (vendorMap.get(v) || 0) + (l.netAmount || 0));
    }
    const topVendors = Array.from(vendorMap.entries())
      .map(([name, amount]) => ({ name: name.length > 15 ? name.slice(0, 15) + ".." : name, amount }))
      .sort((a, b) => b.amount - a.amount).slice(0, 10);

    const statusMap = new Map<string, number>();
    for (const l of allReportLines) statusMap.set(l.status, (statusMap.get(l.status) || 0) + 1);
    const statusDistribution = Array.from(statusMap.entries()).map(([name, value]) => ({ name, value }));

    const categoryMap = new Map<string, number>();
    for (const l of allReportLines) {
      const cat = l.category || "Other";
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + (l.netAmount || 0));
    }
    const categoryDistribution = Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value }));

    const totalAmount = allReportLines.reduce((s, l) => s + (l.netAmount || 0), 0);
    const approvedCount = allReportLines.filter(l => l.status === "Approved" || l.status === "Posted").length;
    const completionRate = allReportLines.length > 0 ? Math.round((approvedCount / allReportLines.length) * 100) : 0;

    const assigns = await db.select().from(activityAssignments);
    const responses = await db.select().from(businessResponses);
    let totalResponseDays = 0;
    let respondedCount = 0;
    for (const a of assigns) {
      if (a.assignedDate && (a.status === "Responded" || a.status === "Completed")) {
        const response = responses.find(r => r.assignmentId === a.id);
        if (response && response.responseDate) {
          const assignedDt = parseDateStr(a.assignedDate);
          const respondedDt = new Date(response.responseDate);
          if (assignedDt && !isNaN(respondedDt.getTime())) {
            const days = Math.max(1, Math.ceil((respondedDt.getTime() - assignedDt.getTime()) / 86400000));
            totalResponseDays += days;
            respondedCount++;
          }
        }
      }
    }
    const avgResponseDays = respondedCount > 0 ? Math.round(totalResponseDays / respondedCount) : 0;

    return {
      avgProvisionPerPo: allReportLines.length > 0 ? totalAmount / allReportLines.length : 0,
      avgResponseDays,
      completionRate,
      totalPoLines: allReportLines.length,
      periodLines: periodLines.length,
      activityLines: activityLines.length,
      topVendors,
      statusDistribution,
      categoryDistribution,
    };
  },

  async getExceptions(processingMonth?: string) {
    const periodLines = await this.getPeriodBasedLines(processingMonth);
    const activityLines = await this.getActivityBasedLines(processingMonth);
    const allLines = [...periodLines, ...activityLines];

    let negativeProvisions = 0, negativeValue = 0;
    let zeroProvisions = 0;
    let largeTrueUps = 0, largeTrueUpValue = 0;
    let grnExceeds = 0, grnExceedsValue = 0;
    let missingFields = 0;

    for (const l of periodLines) {
      if (l.finalProvision < 0) { negativeProvisions++; negativeValue += Math.abs(l.finalProvision); }
      if (l.finalProvision === 0 && l.netAmount > 0) { zeroProvisions++; }
      const trueUpAbs = Math.abs(l.currentMonthTrueUp || 0) + Math.abs(l.prevMonthTrueUp || 0);
      if (trueUpAbs > l.netAmount * 0.2 && trueUpAbs > 0) { largeTrueUps++; largeTrueUpValue += trueUpAbs; }
      if (l.totalGrnToDate > l.netAmount && l.netAmount > 0) { grnExceeds++; grnExceedsValue += l.totalGrnToDate - l.netAmount; }
      if (!l.glAccount || !l.costCenter) missingFields++;
    }

    let unassigned = 0, unassignedValue = 0;
    for (const l of activityLines) {
      if (!l.assignedToUserId) { unassigned++; unassignedValue += l.netAmount || 0; }
      if (l.finalProvision != null && l.finalProvision < 0) { negativeProvisions++; negativeValue += Math.abs(l.finalProvision); }
      if (l.finalProvision != null && l.finalProvision === 0 && l.netAmount > 0 && l.totalGrnToDate === 0) { zeroProvisions++; }
      if (l.totalGrnToDate > l.netAmount && l.netAmount > 0) { grnExceeds++; grnExceedsValue += l.totalGrnToDate - l.netAmount; }
      if (!l.glAccount || !l.costCenter) missingFields++;
    }

    const overdueLines = allLines.filter(l => l.status === "Submitted");
    const overdueApprovals = overdueLines.length;
    const overdueValue = overdueLines.reduce((s, l) => s + (l.netAmount || 0), 0);

    const missingDatesLines = periodLines.filter(l => !l.startDate || !l.endDate);
    const missingDates = missingDatesLines.length;
    const missingDatesValue = missingDatesLines.reduce((s, l) => s + (l.netAmount || 0), 0);

    return {
      negativeProvisions, negativeValue: Math.round(negativeValue),
      zeroProvisions,
      unassigned, unassignedValue: Math.round(unassignedValue),
      overdueApprovals, overdueValue: Math.round(overdueValue),
      largeTrueUps, largeTrueUpValue: Math.round(largeTrueUpValue),
      grnExceeds, grnExceedsValue: Math.round(grnExceedsValue),
      missingDates, missingDatesValue: Math.round(missingDatesValue),
      missingFields,
    };
  },

  async getPoUploads() {
    return db.select().from(poUploads).orderBy(desc(poUploads.uploadDate));
  },

  async createPoUpload(data: any) {
    const [upload] = await db.insert(poUploads).values(data).returning();
    return upload;
  },

  async getGrnUploads() {
    return db.select().from(grnUploads).orderBy(desc(grnUploads.uploadDate));
  },

  async createGrnUpload(data: any) {
    const [upload] = await db.insert(grnUploads).values(data).returning();
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

  async getPeriodBasedLinesPaged(params: {
    processingMonth: string;
    page: number;
    limit: number;
    search?: string;
    statusFilter?: string;
  }): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const config = await this.getConfigMap();
    const monthStr = params.processingMonth || config.processing_month || "Feb 2026";
    const pm = parseProcessingMonth(monthStr);
    const { page, limit, search = "", statusFilter = "All" } = params;

    // Fetch minimal columns for ALL period lines — needed for JS-side month + search filter
    const allLines = await db.select({
      id: poLines.id, poNumber: poLines.poNumber, poLineItem: poLines.poLineItem,
      vendorName: poLines.vendorName, itemDescription: poLines.itemDescription,
      costCenter: poLines.costCenter, startDate: poLines.startDate,
      endDate: poLines.endDate, status: poLines.status,
    }).from(poLines).where(eq(poLines.category, "Period")).orderBy(poLines.poNumber);

    // Month filter (must be JS-side since dates are stored as text)
    let filtered = allLines.filter(line => {
      const start = parseDateStr(line.startDate);
      const end = parseDateStr(line.endDate);
      if (!start || !end) return true;
      return start <= pm.monthEnd && end >= pm.monthStart;
    });

    // Search filter
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(l =>
        (l.poNumber || "").toLowerCase().includes(s) ||
        (l.vendorName || "").toLowerCase().includes(s) ||
        (l.itemDescription || "").toLowerCase().includes(s) ||
        (l.costCenter || "").toLowerCase().includes(s)
      );
    }

    // Status filter: "Active" = show only Draft/Rejected/Recalled (hide Submitted/Approved)
    if (statusFilter === "Active") {
      filtered = filtered.filter(l => l.status === "Draft" || l.status === "Rejected" || l.status === "Recalled" || !l.status);
    } else if (statusFilter && statusFilter !== "All") {
      filtered = filtered.filter(l => l.status === statusFilter);
    }

    const total = filtered.length;
    const pageSlice = filtered.slice(page * limit, (page + 1) * limit);
    const pageIds = pageSlice.map(l => l.id);

    if (pageIds.length === 0) return { data: [], total, page, limit };

    // Fetch full data + GRN + calcs for current page — all in parallel
    const [fullLines, calcs, grns] = await Promise.all([
      db.select().from(poLines).where(inArray(poLines.id, pageIds)),
      db.select().from(periodCalculations)
        .where(and(eq(periodCalculations.processingMonth, monthStr), inArray(periodCalculations.poLineId, pageIds))),
      db.select().from(grnTransactions)
        .where(inArray(grnTransactions.poLineId, pageIds)),
    ]);
    const lineMap = new Map(fullLines.map(l => [l.id, l]));
    const orderedLines = pageIds.map(id => lineMap.get(id)!).filter(Boolean);

    const calcMap = new Map<number, typeof calcs[0]>();
    for (const c of calcs) calcMap.set(c.poLineId, c);
    const grnMap = new Map<number, typeof grns>();
    for (const g of grns) {
      const list = grnMap.get(g.poLineId) || [];
      list.push(g);
      grnMap.set(g.poLineId, list);
    }

    const data = orderedLines.map(line => {
      const calc = calcMap.get(line.id);
      const lineGrns = grnMap.get(line.id) || [];
      const currentMonthGrn = getGrnForMonth(lineGrns, pm.monthStart, pm.monthEnd);
      const prevMonthGrn = getGrnForMonth(lineGrns, pm.prevMonthStart, pm.prevMonthEnd);
      const lastKnown = getLastKnownGrn(lineGrns);
      const start = parseDateStr(line.startDate);
      const end = parseDateStr(line.endDate);
      const totalDays = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1) : 1;
      const dailyRate = (line.netAmount || 0) / totalDays;
      let currentMonthDays = 0, prevMonthDays = 0;
      if (start && end) {
        currentMonthDays = calcOverlapDays(start, end, pm.monthStart, pm.monthEnd);
        prevMonthDays = calcOverlapDays(start, end, pm.prevMonthStart, pm.prevMonthEnd);
      }
      const prevMonthProvision = Math.round(dailyRate * prevMonthDays);
      const suggestedProvision = Math.round(dailyRate * currentMonthDays);
      const prevTrueUp = calc?.prevMonthTrueUp || 0;
      const currTrueUp = calc?.currentMonthTrueUp || 0;
      const carryForward = 0;
      const finalProvision = suggestedProvision - Math.round(lastKnown.value) + currTrueUp;
      return {
        id: line.id, poNumber: line.poNumber || "", poLineItem: line.poLineItem || "",
        vendorName: line.vendorName || "", itemDescription: line.itemDescription || "",
        netAmount: line.netAmount || 0, glAccount: line.glAccount || "",
        costCenter: line.costCenter || "", profitCenter: line.profitCenter || "",
        plant: line.plant || "", startDate: line.startDate || "", endDate: line.endDate || "",
        totalDays, prevMonthDays, prevMonthProvision, prevMonthTrueUp: prevTrueUp,
        prevMonthGrn: Math.round(prevMonthGrn), carryForward,
        currentMonthDays, suggestedProvision, currentMonthGrn: Math.round(currentMonthGrn),
        currentMonthTrueUp: currTrueUp, remarks: calc?.remarks || "",
        finalProvision: Math.round(finalProvision),
        totalGrnToDate: Math.round(lastKnown.value),
        totalGrnDateLabel: lastKnown.label,
        pendingPoValue: Math.round((line.netAmount || 0) - lastKnown.value),
        status: line.status || "Draft", category: line.category || "Period",
        prevMonthLabel: pm.prevMonthLabel, currentMonthLabel: pm.monthLabel,
      };
    });

    return { data, total, page, limit };
  },

  async getActivityBasedLinesPaged(params: {
    processingMonth: string;
    page: number;
    limit: number;
    search?: string;
    hideAssigned?: boolean;
  }): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const config = await this.getConfigMap();
    const monthStr = params.processingMonth || config.processing_month || "Feb 2026";
    const pm = parseProcessingMonth(monthStr);
    const { page, limit, search = "", hideAssigned = false } = params;

    // Fetch minimal columns for ordering + search, run alongside active assignments lookup in parallel
    const [allLines, activeAssignments] = await Promise.all([
      db.select({
        id: poLines.id, poNumber: poLines.poNumber, vendorName: poLines.vendorName,
        itemDescription: poLines.itemDescription, costCenter: poLines.costCenter,
        status: poLines.status,
      }).from(poLines).where(eq(poLines.category, "Activity")).orderBy(poLines.poNumber),
      // Fetch all poLineIds that have an active (non-recalled) assignment
      hideAssigned
        ? db.selectDistinct({ poLineId: activityAssignments.poLineId })
            .from(activityAssignments)
            .where(inArray(activityAssignments.status, ["Assigned", "Responded", "Approved"]))
        : Promise.resolve([] as { poLineId: number }[]),
    ]);

    let filtered = allLines as typeof allLines;

    // Hide lines that have at least one active assignment (check real assignment records,
    // not just poLines.status, to cover items assigned before the status-tracking change)
    if (hideAssigned) {
      const assignedLineIds = new Set((activeAssignments as { poLineId: number }[]).map(a => a.poLineId));
      filtered = filtered.filter(l => !assignedLineIds.has(l.id));
    }

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(l =>
        (l.poNumber || "").toLowerCase().includes(s) ||
        (l.vendorName || "").toLowerCase().includes(s) ||
        (l.itemDescription || "").toLowerCase().includes(s)
      );
    }

    const total = filtered.length;
    const pageSlice = filtered.slice(page * limit, (page + 1) * limit);
    const pageIds = pageSlice.map(l => l.id);

    if (pageIds.length === 0) return { data: [], total, page, limit };

    // Fetch fullLines, assigns, grns, calcs (current + prev month) all in parallel
    const [fullLines, assigns, grns, calcs, prevCalcs] = await Promise.all([
      db.select().from(poLines).where(inArray(poLines.id, pageIds)),
      db.select().from(activityAssignments).where(inArray(activityAssignments.poLineId, pageIds)),
      db.select().from(grnTransactions).where(inArray(grnTransactions.poLineId, pageIds)),
      db.select().from(periodCalculations)
        .where(and(eq(periodCalculations.processingMonth, monthStr), inArray(periodCalculations.poLineId, pageIds))),
      // Previous month calculations — to display prev month final provision
      db.select().from(periodCalculations)
        .where(and(eq(periodCalculations.processingMonth, pm.prevMonthLabel), inArray(periodCalculations.poLineId, pageIds))),
    ]);

    // Fetch business user responses for these assignments (needed for provisionPercent / % completion)
    const pageAssignIds = assigns.map(a => a.id);
    const responses = pageAssignIds.length > 0
      ? await db.select().from(businessResponses).where(inArray(businessResponses.assignmentId, pageAssignIds))
      : [];
    const lineMap = new Map(fullLines.map(l => [l.id, l]));
    const orderedLines = pageIds.map(id => lineMap.get(id)!).filter(Boolean);

    const assignedUserIds = Array.from(new Set(assigns.map(a => a.assignedToUserId).filter(Boolean))) as number[];
    const pageUsers = assignedUserIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, assignedUserIds))
      : [];

    // Prefer the primary assignment for display; fall back to the most recent one
    const assignMap = new Map<number, typeof assigns[0]>();
    const allAssignedUserIdsMap = new Map<number, number[]>();
    for (const a of assigns) {
      const existing = assignMap.get(a.poLineId);
      if (!existing || a.isPrimary) assignMap.set(a.poLineId, a);
      const ids = allAssignedUserIdsMap.get(a.poLineId) || [];
      ids.push(a.assignedToUserId);
      allAssignedUserIdsMap.set(a.poLineId, ids);
    }
    const userMap = new Map<number, typeof pageUsers[0]>();
    for (const u of pageUsers) userMap.set(u.id, u);
    const calcMap = new Map<number, typeof calcs[0]>();
    for (const c of calcs) calcMap.set(c.poLineId, c);
    const prevCalcMap = new Map<number, typeof prevCalcs[0]>();
    for (const c of prevCalcs) prevCalcMap.set(c.poLineId, c);
    // Map responses by assignmentId for quick lookup
    const responseByAssignment = new Map<number, typeof responses[0]>();
    for (const r of responses) responseByAssignment.set(r.assignmentId, r);
    const grnMap = new Map<number, typeof grns>();
    for (const g of grns) {
      const list = grnMap.get(g.poLineId) || [];
      list.push(g);
      grnMap.set(g.poLineId, list);
    }

    const provisionUpserts: Promise<any>[] = [];

    const data = orderedLines.map(line => {
      const assign = assignMap.get(line.id);
      const assignedUser = assign ? userMap.get(assign.assignedToUserId) ?? null : null;
      const lineGrns = grnMap.get(line.id) || [];
      const calc = calcMap.get(line.id);
      const prevCalc = prevCalcMap.get(line.id);
      const lastKnown = getLastKnownGrn(lineGrns);
      const currTrueUp = calc?.currentMonthTrueUp || 0;

      // Get business user's % of completion from their response (if any)
      const response = assign ? responseByAssignment.get(assign.id) : null;
      const provisionPercent = response?.provisionPercent ?? null;
      const isAssigned = !!assign;

      // Activity-Based formula: (PO × % completion) − GRN to date + True-up
      // Only calculate if a business user has responded with a % of completion
      let finalProvision: number | null = null;
      if (provisionPercent != null) {
        finalProvision = Math.round(
          ((line.netAmount || 0) * provisionPercent / 100) - lastKnown.value + currTrueUp
        );
      }

      // Previous month final provision (stored from last month's calculation)
      const prevMonthFinalProvision = prevCalc?.activityFinalProvision ?? null;

      // Auto-save the computed activity final provision for current month so it's
      // available as "previous month provision" when processing the next month
      if (finalProvision != null) {
        provisionUpserts.push(
          db.insert(periodCalculations)
            .values({ poLineId: line.id, processingMonth: monthStr, activityFinalProvision: finalProvision })
            .onConflictDoUpdate({
              target: [periodCalculations.poLineId, periodCalculations.processingMonth],
              set: { activityFinalProvision: finalProvision },
            })
        );
      }

      const currentMonthGrn = getGrnForMonth(lineGrns, pm.monthStart, pm.monthEnd);
      const prevMonthGrn = getGrnForMonth(lineGrns, pm.prevMonthStart, pm.prevMonthEnd);

      return {
        id: line.id, poNumber: line.poNumber || "", poLineItem: line.poLineItem || "",
        vendorName: line.vendorName || "", itemDescription: line.itemDescription || "",
        netAmount: line.netAmount || 0, glAccount: line.glAccount || "",
        costCenter: line.costCenter || "", profitCenter: line.profitCenter || "",
        startDate: line.startDate || "", endDate: line.endDate || "",
        projectName: line.projectName || "", plant: line.plant || "",
        status: line.status || "Draft",
        assignmentId: assign?.id || null, assignedToUserId: assign?.assignedToUserId || null,
        allAssignedUserIds: allAssignedUserIdsMap.get(line.id) || [],
        assignedToName: assignedUser?.name || null, assignmentStatus: assign?.status || "Not Assigned",
        assignedDate: assign?.assignedDate || null, category: line.category || "Activity",
        isAssigned,
        // Business user response
        provisionPercent,
        responseProvisionAmount: response?.provisionAmount ?? null,
        responseCompletionStatus: response?.completionStatus ?? null,
        responseComments: response?.comments ?? null,
        // GRN data
        prevMonthGrn: Math.round(prevMonthGrn),
        currentMonthGrn: Math.round(currentMonthGrn),
        totalGrnToDate: Math.round(lastKnown.value),
        totalGrnDateLabel: lastKnown.label,
        pendingPoValue: Math.round((line.netAmount || 0) - lastKnown.value),
        // Provision (Activity-Based formula)
        currentMonthTrueUp: currTrueUp,
        remarks: calc?.remarks || "",
        finalProvision,
        prevMonthFinalProvision,
        prevMonthLabel: pm.prevMonthLabel,
        currentMonthLabel: pm.monthLabel,
      };
    });

    // Fire-and-forget background save of computed provisions (non-blocking)
    if (provisionUpserts.length > 0) {
      Promise.all(provisionUpserts).catch(() => {});
    }

    return { data, total, page, limit };
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

  async getCalendarStats() {
    const [allLines, allGrns] = await Promise.all([
      db.select({
        id: poLines.id, category: poLines.category, poNumber: poLines.poNumber,
        startDate: poLines.startDate, endDate: poLines.endDate, netAmount: poLines.netAmount,
      }).from(poLines),
      db.select({
        poLineId: grnTransactions.poLineId, grnDate: grnTransactions.grnDate, grnValue: grnTransactions.grnValue,
      }).from(grnTransactions),
    ]);

    const currentYear = new Date().getFullYear();
    const activityLines = allLines.filter(l => l.category === "Activity");
    const activityLineIds = new Set(activityLines.map(l => l.id));
    const activityPoNumbers = new Set(activityLines.map(l => l.poNumber).filter(Boolean) as string[]);

    // Parse period lines — cap end dates beyond 2100 (sentinel values like 12/31/9999)
    // so they don't expand the year range to thousands of years.
    const parsedPeriodLines = allLines
      .filter(l => l.category === "Period")
      .map(l => {
        const start = parseDateStr(l.startDate);
        let end = parseDateStr(l.endDate);
        if (end && end.getFullYear() > 2100) end = new Date(currentYear + 2, 11, 31);
        if (!start || !end) return null;
        const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
        return {
          poNumber: l.poNumber,
          netAmount: l.netAmount || 0,
          dailyRate: (l.netAmount || 0) / totalDays,
          start,
          end,
        };
      })
      .filter(Boolean) as { poNumber: string | null; netAmount: number; dailyRate: number; start: Date; end: Date }[];

    // Pre-aggregate GRNs into a month-keyed Map — O(1) lookup per month instead of
    // iterating all GRN rows for every calendar month (was O(months × GRNs)).
    const grnByMonth = new Map<string, { total: number; activityTotal: number }>();
    for (const g of allGrns) {
      const d = parseDateStr(g.grnDate);
      if (!d) continue;
      const key = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const bucket = grnByMonth.get(key) ?? { total: 0, activityTotal: 0 };
      const val = g.grnValue || 0;
      bucket.total += val;
      if (activityLineIds.has(g.poLineId)) bucket.activityTotal += val;
      grnByMonth.set(key, bucket);
    }

    // Compute year range from actual data, then hard-cap it so sentinel dates
    // like "12/31/9999" can never force us to loop thousands of years.
    let minYear = currentYear, maxYear = currentYear;
    for (const l of parsedPeriodLines) {
      minYear = Math.min(minYear, l.start.getFullYear());
      maxYear = Math.max(maxYear, l.end.getFullYear());
    }
    for (const [key] of grnByMonth) {
      const yr = parseInt(key.split(" ")[1]);
      if (!isNaN(yr)) { minYear = Math.min(minYear, yr); maxYear = Math.max(maxYear, yr); }
    }
    maxYear = Math.min(maxYear, currentYear + 3);
    minYear = Math.max(minYear, currentYear - 10);

    const monthStats: Record<string, { lineCount: number; totalAmount: number; poCount: number; grnTotal: number }> = {};
    const activityCount = activityLines.length;

    for (let baseYear = minYear; baseYear <= maxYear; baseYear++) {
      for (let m = 0; m < 12; m++) {
        const monthStart = new Date(baseYear, m, 1);
        const monthEnd = new Date(baseYear, m + 1, 0);
        const key = `${MONTHS[m]} ${baseYear}`;

        let periodCount = 0;
        let totalProvision = 0;
        const poSet = new Set<string>(activityPoNumbers);

        for (const l of parsedPeriodLines) {
          if (l.start <= monthEnd && l.end >= monthStart) {
            periodCount++;
            if (l.poNumber) poSet.add(l.poNumber);
            totalProvision += l.dailyRate * calcOverlapDays(l.start, l.end, monthStart, monthEnd);
          }
        }

        const grnData = grnByMonth.get(key);
        const grnTotal = grnData?.total ?? 0;
        totalProvision += grnData?.activityTotal ?? 0;

        const lineCount = periodCount + activityCount;

        if (lineCount > 0 || grnTotal > 0) {
          monthStats[key] = { lineCount, totalAmount: Math.round(totalProvision), poCount: poSet.size, grnTotal: Math.round(grnTotal) };
        }
      }
    }

    return monthStats;
  },

  async getDataDateRange() {
    const currentYear = new Date().getFullYear();
    const allLines = await db.select({ startDate: poLines.startDate, endDate: poLines.endDate }).from(poLines);
    const allGrns = await db.select({ grnDate: grnTransactions.grnDate }).from(grnTransactions);
    let minYear = currentYear;
    let maxYear = currentYear;
    for (const line of allLines) {
      const s = parseDateStr(line.startDate);
      const e = parseDateStr(line.endDate);
      // Only track start dates for min (end dates can be 9999 sentinels for open-ended contracts)
      if (s) { minYear = Math.min(minYear, s.getFullYear()); maxYear = Math.max(maxYear, s.getFullYear()); }
      if (e && e.getFullYear() <= 2100) { maxYear = Math.max(maxYear, e.getFullYear()); }
    }
    for (const g of allGrns) {
      const gd = parseDateStr(g.grnDate);
      if (gd && gd.getFullYear() >= 2000) { minYear = Math.min(minYear, gd.getFullYear()); maxYear = Math.max(maxYear, gd.getFullYear()); }
    }
    // Hard cap — never return a range that would freeze the browser calendar
    return { minYear: Math.max(minYear, currentYear - 10), maxYear: Math.min(maxYear, currentYear + 3) };
  },

  async getApprovers() {
    const approverRoles = await db.select().from(userRoles)
      .where(inArray(userRoles.role, ["Finance Approver", "Finance Admin"]));
    const approverIds = Array.from(new Set(approverRoles.map(r => r.userId)));
    if (approverIds.length === 0) return [];
    const approverUsers = await db.select().from(users).where(inArray(users.id, approverIds));
    return approverUsers.map(u => ({ id: u.id, name: u.name, email: u.email }));
  },

  async submitForApproval(poLineIds: number[], approverIds: number[], submittedBy: number, processingMonth: string) {
    const results = [];
    for (const poLineId of poLineIds) {
      const existing = await db.select().from(approvalSubmissions)
        .where(and(
          eq(approvalSubmissions.poLineId, poLineId),
          eq(approvalSubmissions.processingMonth, processingMonth),
          eq(approvalSubmissions.status, "Pending")
        )).limit(1);

      if (existing.length > 0) continue;

      const [sub] = await db.insert(approvalSubmissions).values({
        poLineId,
        submittedBy,
        approverIds,
        status: "Pending",
        processingMonth,
        nudgeCount: 0,
      }).returning();

      await db.update(poLines).set({ status: "Submitted" }).where(eq(poLines.id, poLineId));
      results.push(sub);
    }
    return results;
  },

  async getApprovalTracker(userId?: number) {
    const subs = await db.select().from(approvalSubmissions).orderBy(desc(approvalSubmissions.submittedAt));
    const allLines = await db.select().from(poLines);
    const allUsers = await db.select().from(users);

    return subs.map(s => {
      const line = allLines.find(l => l.id === s.poLineId);
      const submitter = allUsers.find(u => u.id === s.submittedBy);
      const approver = s.approvedBy ? allUsers.find(u => u.id === s.approvedBy) : null;
      const approverNames = (s.approverIds as number[]).map(id => {
        const u = allUsers.find(usr => usr.id === id);
        return u ? u.name : `User #${id}`;
      });

      return {
        id: s.id,
        poLineId: s.poLineId,
        // PO Line details
        poNumber: line?.poNumber || "",
        poLineItem: line?.poLineItem || "",
        vendorName: line?.vendorName || "",
        itemDescription: line?.itemDescription || "",
        netAmount: line?.netAmount || 0,
        costCenter: line?.costCenter || "",
        glAccount: line?.glAccount || "",
        profitCenter: line?.profitCenter || "",
        plant: line?.plant || "",
        wbsElement: line?.wbsElement || "",
        projectName: line?.projectName || "",
        prNumber: line?.prNumber || "",
        prOwnerId: line?.prOwnerId || "",
        costCenterOwnerId: line?.costCenterOwnerId || "",
        documentDate: line?.documentDate || "",
        startDate: line?.startDate || "",
        endDate: line?.endDate || "",
        docType: line?.docType || "",
        category: line?.category || "",
        lineStatus: line?.status || "",
        // Submission details
        submittedByName: submitter?.name || "",
        submittedByEmail: submitter?.email || "",
        submittedAt: s.submittedAt,
        processingMonth: s.processingMonth,
        // Approval details
        status: s.status,
        approverNames,
        approverIds: s.approverIds as number[],
        approvedByName: approver?.name || null,
        decidedAt: s.decidedAt,
        rejectionReason: s.rejectionReason,
        nudgeCount: s.nudgeCount || 0,
        lastNudgeAt: s.lastNudgeAt,
      };
    });
  },

  async nudgeApproval(submissionId: number) {
    await db.update(approvalSubmissions).set({
      nudgeCount: sql`COALESCE(${approvalSubmissions.nudgeCount}, 0) + 1`,
      lastNudgeAt: new Date(),
    }).where(eq(approvalSubmissions.id, submissionId));
  },

  async nudgeActivityAssignment(assignmentId: number) {
    await db.update(activityAssignments).set({
      nudgeCount: sql`COALESCE(${activityAssignments.nudgeCount}, 0) + 1`,
      lastNudgeAt: new Date(),
    }).where(eq(activityAssignments.id, assignmentId));
  },

  async nudgeNonPoAssignment(assignmentId: number) {
    await db.update(nonpoFormAssignments).set({
      nudgeCount: sql`COALESCE(${nonpoFormAssignments.nudgeCount}, 0) + 1`,
      lastNudgeAt: new Date(),
    }).where(eq(nonpoFormAssignments.id, assignmentId));
  },

  async returnActivityTask(assignmentId: number, comments: string) {
    const [assign] = await db.select().from(activityAssignments)
      .where(eq(activityAssignments.id, assignmentId)).limit(1);
    if (!assign) throw new Error("Assignment not found");
    await db.update(activityAssignments).set({
      status: "Returned",
      returnComments: comments,
      returnedAt: new Date(),
    }).where(eq(activityAssignments.id, assignmentId));
    // Return the PO line to the main activity list so finance can reassign/edit
    await db.update(poLines).set({ status: "Returned" }).where(eq(poLines.id, assign.poLineId));
    return { poLineId: assign.poLineId };
  },

  async returnNonPoForm(assignmentId: number, comments: string) {
    const [assign] = await db.select().from(nonpoFormAssignments)
      .where(eq(nonpoFormAssignments.id, assignmentId)).limit(1);
    if (!assign) throw new Error("Assignment not found");
    await db.update(nonpoFormAssignments).set({
      status: "Returned",
      returnComments: comments,
      returnedAt: new Date(),
    }).where(eq(nonpoFormAssignments.id, assignmentId));
    return { formId: assign.formId };
  },

  async approveSubmission(submissionId: number, approvedBy: number) {
    const [sub] = await db.select().from(approvalSubmissions).where(eq(approvalSubmissions.id, submissionId)).limit(1);
    if (!sub) throw new Error("Submission not found");

    await db.update(approvalSubmissions).set({
      status: "Approved",
      approvedBy,
      decidedAt: new Date(),
    }).where(eq(approvalSubmissions.id, submissionId));

    await db.update(poLines).set({ status: "Approved" }).where(eq(poLines.id, sub.poLineId));
  },

  async rejectSubmission(submissionId: number, rejectedBy: number, reason: string) {
    const [sub] = await db.select().from(approvalSubmissions).where(eq(approvalSubmissions.id, submissionId)).limit(1);
    if (!sub) throw new Error("Submission not found");

    await db.update(approvalSubmissions).set({
      status: "Rejected",
      approvedBy: rejectedBy,
      decidedAt: new Date(),
      rejectionReason: reason,
    }).where(eq(approvalSubmissions.id, submissionId));

    await db.update(poLines).set({ status: "Rejected" }).where(eq(poLines.id, sub.poLineId));
  },

  async getApprovalsByPoLineIds(poLineIds: number[]) {
    if (poLineIds.length === 0) return [];
    return db.select().from(approvalSubmissions).where(inArray(approvalSubmissions.poLineId, poLineIds));
  },
};
