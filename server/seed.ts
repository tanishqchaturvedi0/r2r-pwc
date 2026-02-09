import { db } from "./db";
import { hashPassword } from "./auth";
import {
  users, userRoles, costCenterAssignments, systemConfig, rolePermissions, poLines, grnTransactions
} from "@shared/schema";
import { eq } from "drizzle-orm";

const samplePoData = [
  { uniqueId: "3000002021-10", poNumber: "3000002021", poLineItem: "10", vendorName: "545810", projectName: "DEV-01450", wbsElement: "DEV-01450-33-05", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202110-test", netAmount: 354400, prNumber: "1", prOwnerId: "Test User 1", costCenterOwnerId: "Cost Center ID 1", documentDate: "4/5/2023", grnDate: "4/13/2023", grnDoc: "5000121183", grnMovementType: "101", grnValue: 354400 },
  { uniqueId: "3000002021-20", poNumber: "3000002021", poLineItem: "20", vendorName: "545810", projectName: "DEV-01450", wbsElement: "DEV-01450-33-05", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202120-test", netAmount: 354400, prNumber: "2", prOwnerId: "Test User 2", costCenterOwnerId: "Cost Center ID 2", documentDate: "4/5/2023", grnDate: "9/21/2023", grnDoc: "5000319812", grnMovementType: "101", grnValue: 354400 },
  { uniqueId: "3000002021-30", poNumber: "3000002021", poLineItem: "30", vendorName: "545810", projectName: "DEV-01450", wbsElement: "DEV-01450-33-05", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202130-test", netAmount: 354400, prNumber: "3", prOwnerId: "Test User 3", costCenterOwnerId: "Cost Center ID 3", documentDate: "4/5/2023", grnDate: "11/4/2023", grnDoc: "5000377079", grnMovementType: "101", grnValue: 671000 },
  { uniqueId: "3000002021-40", poNumber: "3000002021", poLineItem: "40", vendorName: "545810", projectName: "DEV-01450", wbsElement: "DEV-01450-33-05", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202140-test", netAmount: 354400, prNumber: "4", prOwnerId: "Test User 4", costCenterOwnerId: "Cost Center ID 4", documentDate: "4/5/2023" },
  { uniqueId: "3000002022-10", poNumber: "3000002022", poLineItem: "10", vendorName: "545810", projectName: "NCE-10068", wbsElement: "NCE-10068-02-01", costCenter: "40030403", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "4/6/2023", endDate: "12/31/2024", plant: "4003", itemDescription: "300000202210-test", netAmount: 192240, prNumber: "5", prOwnerId: "Test User 5", costCenterOwnerId: "Cost Center ID 5", documentDate: "4/6/2023", grnDate: "4/11/2023", grnDoc: "5000114132", grnMovementType: "101", grnValue: 192240 },
  { uniqueId: "3000002022-20", poNumber: "3000002022", poLineItem: "20", vendorName: "545810", projectName: "NCE-10068", wbsElement: "NCE-10068-02-01", costCenter: "40030403", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "4/6/2023", endDate: "12/31/2024", plant: "4003", itemDescription: "300000202220-test", netAmount: 192240, prNumber: "6", prOwnerId: "Test User 6", costCenterOwnerId: "Cost Center ID 6", documentDate: "4/6/2023", grnDate: "5/30/2023", grnDoc: "5000172223", grnMovementType: "101", grnValue: 192240 },
  { uniqueId: "3000002022-30", poNumber: "3000002022", poLineItem: "30", vendorName: "545810", projectName: "NCE-10068", wbsElement: "NCE-10068-02-01", costCenter: "40030403", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "4/6/2023", endDate: "12/31/2024", plant: "4003", itemDescription: "300000202230-test", netAmount: 192240, prNumber: "7", prOwnerId: "Test User 7", costCenterOwnerId: "Cost Center ID 7", documentDate: "4/6/2023" },
  { uniqueId: "3000002022-40", poNumber: "3000002022", poLineItem: "40", vendorName: "545810", projectName: "NCE-10068", wbsElement: "NCE-10068-02-01", costCenter: "40030403", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "4/6/2023", endDate: "12/31/2024", plant: "4003", itemDescription: "300000202240-test", netAmount: 192240, prNumber: "8", prOwnerId: "Test User 8", costCenterOwnerId: "Cost Center ID 8", documentDate: "4/6/2023" },
  { uniqueId: "3000002022-50", poNumber: "3000002022", poLineItem: "50", vendorName: "545810", projectName: "NCE-10068", wbsElement: "NCE-10068-02-01", costCenter: "40030403", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "4/6/2023", endDate: "12/31/2024", plant: "4003", itemDescription: "300000202250-test", netAmount: 192240, prNumber: "9", prOwnerId: "Test User 9", costCenterOwnerId: "Cost Center ID 9", documentDate: "4/6/2023", grnDate: "5/30/2023", grnDoc: "5000172252", grnMovementType: "101", grnValue: 7000 },
  { uniqueId: "3000002023-10", poNumber: "3000002023", poLineItem: "10", vendorName: "529151", projectName: "DEV-01660", wbsElement: "DEV-01660-09", costCenter: "40030407", profitCenter: "", glAccount: "44010033", docType: "NSB", startDate: "4/6/2023", endDate: "9/30/2023", plant: "4003", itemDescription: "300000202310-test", netAmount: 890000, prNumber: "10", prOwnerId: "Test User 10", costCenterOwnerId: "Cost Center ID 10", documentDate: "4/6/2023", grnDate: "5/9/2023", grnDoc: "5000147466", grnMovementType: "101", grnValue: 890000 },
  { uniqueId: "3000002023-20", poNumber: "3000002023", poLineItem: "20", vendorName: "529151", projectName: "DEV-01660", wbsElement: "DEV-01660-09", costCenter: "40030407", profitCenter: "", glAccount: "44010033", docType: "NSB", startDate: "4/6/2023", endDate: "9/30/2023", plant: "4003", itemDescription: "300000202320-test", netAmount: 890000, prNumber: "11", prOwnerId: "Test User 11", costCenterOwnerId: "Cost Center ID 11", documentDate: "4/6/2023", grnDate: "7/27/2023", grnDoc: "5000243872", grnMovementType: "101", grnValue: 890000 },
  { uniqueId: "3000002024-10", poNumber: "3000002024", poLineItem: "10", vendorName: "406979", projectName: "DEV-01797", wbsElement: "DEV-01797-01", costCenter: "40030407", profitCenter: "", glAccount: "44010033", docType: "NSB", startDate: "4/11/2023", endDate: "3/30/2024", plant: "4003", itemDescription: "300000202410-test", netAmount: 2700000, prNumber: "12", prOwnerId: "Test User 12", costCenterOwnerId: "Cost Center ID 12", documentDate: "4/11/2023", grnDate: "6/5/2023", grnDoc: "5000181110", grnMovementType: "101", grnValue: 2700000 },
  { uniqueId: "3000002024-20", poNumber: "3000002024", poLineItem: "20", vendorName: "406979", projectName: "DEV-01797", wbsElement: "DEV-01797-01", costCenter: "40030407", profitCenter: "", glAccount: "44010033", docType: "NSB", startDate: "4/11/2023", endDate: "3/30/2024", plant: "4003", itemDescription: "300000202420-test", netAmount: 2700000, prNumber: "13", prOwnerId: "Test User 13", costCenterOwnerId: "Cost Center ID 13", documentDate: "4/11/2023", grnDate: "7/7/2023", grnDoc: "5000233136", grnMovementType: "101", grnValue: 1800000 },
  { uniqueId: "3000002024-30", poNumber: "3000002024", poLineItem: "30", vendorName: "406979", projectName: "DEV-01797", wbsElement: "DEV-01797-01", costCenter: "40030407", profitCenter: "", glAccount: "44010033", docType: "NSB", startDate: "4/11/2023", endDate: "3/30/2024", plant: "4003", itemDescription: "300000202430-test", netAmount: 2700000, prNumber: "14", prOwnerId: "Test User 14", costCenterOwnerId: "Cost Center ID 14", documentDate: "4/11/2023", grnDate: "11/9/2023", grnDoc: "5000377078", grnMovementType: "101", grnValue: 2700000 },
  { uniqueId: "3000002024-40", poNumber: "3000002024", poLineItem: "40", vendorName: "406979", projectName: "DEV-01797", wbsElement: "DEV-01797-01", costCenter: "40030407", profitCenter: "", glAccount: "44010033", docType: "NSB", startDate: "4/11/2023", endDate: "3/30/2024", plant: "4003", itemDescription: "300000202440-test", netAmount: 2700000, prNumber: "15", prOwnerId: "Test User 15", costCenterOwnerId: "Cost Center ID 15", documentDate: "4/11/2023" },
  { uniqueId: "3000002025-10", poNumber: "3000002025", poLineItem: "10", vendorName: "503350", projectName: "DEV-01630", wbsElement: "DEV-01630-04", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202510-test", netAmount: 1120310, prNumber: "16", prOwnerId: "Test User 16", costCenterOwnerId: "Cost Center ID 16", documentDate: "4/14/2023", grnDate: "5/3/2023", grnDoc: "5000140434", grnMovementType: "101", grnValue: 1120310 },
  { uniqueId: "3000002025-20", poNumber: "3000002025", poLineItem: "20", vendorName: "503350", projectName: "DEV-01630", wbsElement: "DEV-01630-04", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202520-test", netAmount: 1120310, prNumber: "17", prOwnerId: "Test User 17", costCenterOwnerId: "Cost Center ID 17", documentDate: "4/14/2023" },
  { uniqueId: "3000002025-30", poNumber: "3000002025", poLineItem: "30", vendorName: "503350", projectName: "DEV-01630", wbsElement: "DEV-01630-04", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202530-test", netAmount: 1120310, prNumber: "18", prOwnerId: "Test User 18", costCenterOwnerId: "Cost Center ID 18", documentDate: "4/14/2023" },
  { uniqueId: "3000002025-40", poNumber: "3000002025", poLineItem: "40", vendorName: "503350", projectName: "DEV-01630", wbsElement: "DEV-01630-04", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202540-test", netAmount: 1120310, prNumber: "19", prOwnerId: "Test User 19", costCenterOwnerId: "Cost Center ID 19", documentDate: "4/14/2023" },
  { uniqueId: "3000002026-10", poNumber: "3000002026", poLineItem: "10", vendorName: "503350", projectName: "DEV-01630", wbsElement: "DEV-01630-04", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202610-test", netAmount: 1120310, prNumber: "20", prOwnerId: "Test User 20", costCenterOwnerId: "Cost Center ID 20", documentDate: "4/14/2023", grnDate: "5/3/2023", grnDoc: "5000140363", grnMovementType: "101", grnValue: 1120310 },
  { uniqueId: "3000002026-20", poNumber: "3000002026", poLineItem: "20", vendorName: "503350", projectName: "DEV-01630", wbsElement: "DEV-01630-04", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202620-test", netAmount: 1120310, prNumber: "21", prOwnerId: "Test User 21", costCenterOwnerId: "Cost Center ID 21", documentDate: "4/14/2023" },
  { uniqueId: "3000002026-30", poNumber: "3000002026", poLineItem: "30", vendorName: "503350", projectName: "DEV-01630", wbsElement: "DEV-01630-04", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202630-test", netAmount: 1120310, prNumber: "22", prOwnerId: "Test User 22", costCenterOwnerId: "Cost Center ID 22", documentDate: "4/14/2023" },
  { uniqueId: "3000002026-40", poNumber: "3000002026", poLineItem: "40", vendorName: "503350", projectName: "DEV-01630", wbsElement: "DEV-01630-04", costCenter: "40030405", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202640-test", netAmount: 1120310, prNumber: "23", prOwnerId: "Test User 23", costCenterOwnerId: "Cost Center ID 23", documentDate: "4/14/2023" },
  { uniqueId: "3000002027-10", poNumber: "3000002027", poLineItem: "10", vendorName: "517220", projectName: "DEV-01637", wbsElement: "DEV-01637-03-03", costCenter: "40030413", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202710-test", netAmount: 862880, prNumber: "24", prOwnerId: "Test User 24", costCenterOwnerId: "Cost Center ID 24", documentDate: "4/15/2023", grnDate: "6/16/2023", grnDoc: "5000196712", grnMovementType: "101", grnValue: 862880 },
  { uniqueId: "3000002027-20", poNumber: "3000002027", poLineItem: "20", vendorName: "517220", projectName: "DEV-01637", wbsElement: "DEV-01637-03-03", costCenter: "40030413", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202720-test", netAmount: 862880, prNumber: "25", prOwnerId: "Test User 25", costCenterOwnerId: "Cost Center ID 25", documentDate: "4/15/2023" },
  { uniqueId: "3000002027-30", poNumber: "3000002027", poLineItem: "30", vendorName: "517220", projectName: "DEV-01637", wbsElement: "DEV-01637-03-03", costCenter: "40030413", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202730-test", netAmount: 862880, prNumber: "26", prOwnerId: "Test User 26", costCenterOwnerId: "Cost Center ID 26", documentDate: "4/15/2023" },
  { uniqueId: "3000002027-40", poNumber: "3000002027", poLineItem: "40", vendorName: "517220", projectName: "DEV-01637", wbsElement: "DEV-01637-03-03", costCenter: "40030413", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202740-test", netAmount: 862880, prNumber: "27", prOwnerId: "Test User 27", costCenterOwnerId: "Cost Center ID 27", documentDate: "4/15/2023" },
  { uniqueId: "3000002028-10", poNumber: "3000002028", poLineItem: "10", vendorName: "517220", projectName: "DEV-01637", wbsElement: "DEV-01637-03-03", costCenter: "40030413", profitCenter: "", glAccount: "44010011", docType: "NSB", startDate: "", endDate: "", plant: "4004", itemDescription: "300000202810-test", netAmount: 862880, prNumber: "28", prOwnerId: "Test User 28", costCenterOwnerId: "Cost Center ID 28", documentDate: "4/15/2023", grnDate: "6/17/2023", grnDoc: "5000196745", grnMovementType: "101", grnValue: 862880 },
];

export async function seedDatabase() {
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    console.log("[seed] Database already seeded, skipping.");
    return;
  }

  console.log("[seed] Seeding database with demo data...");

  const adminHash = await hashPassword("Admin@123");
  const approverHash = await hashPassword("Approver@123");
  const userHash = await hashPassword("User@123");

  const [admin] = await db.insert(users).values({
    email: "admin@company.com",
    passwordHash: adminHash,
    name: "Rajesh Kumar",
    phone: "+91 98765 43210",
    status: "Active",
  }).returning();

  const [approver] = await db.insert(users).values({
    email: "approver@company.com",
    passwordHash: approverHash,
    name: "Priya Sharma",
    phone: "+91 98765 43211",
    status: "Active",
  }).returning();

  const [bizUser] = await db.insert(users).values({
    email: "user@company.com",
    passwordHash: userHash,
    name: "Amit Patel",
    phone: "+91 98765 43212",
    status: "Active",
  }).returning();

  const [bizUser2] = await db.insert(users).values({
    email: "sanjay@company.com",
    passwordHash: userHash,
    name: "Sanjay Gupta",
    phone: "+91 98765 43213",
    status: "Active",
  }).returning();

  await db.insert(userRoles).values([
    { userId: admin.id, role: "Finance Admin" },
    { userId: approver.id, role: "Finance Approver" },
    { userId: bizUser.id, role: "Business User" },
    { userId: bizUser2.id, role: "Business User" },
  ]);

  await db.insert(costCenterAssignments).values([
    { userId: bizUser.id, costCenter: "40030403" },
    { userId: bizUser.id, costCenter: "40030405" },
    { userId: bizUser2.id, costCenter: "40030407" },
    { userId: bizUser2.id, costCenter: "40030413" },
  ]);

  await db.insert(systemConfig).values([
    { configKey: "processing_month", configValue: "Feb 2026" },
    { configKey: "threshold_amount", configValue: "100000" },
    { configKey: "default_credit_gl", configValue: "44010011" },
  ]);

  const permissions = [
    { role: "Finance Admin", permission: "period_based", canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canDownload: false, canInvite: false },
    { role: "Finance Admin", permission: "activity_based", canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canDownload: false, canInvite: false },
    { role: "Finance Admin", permission: "non_po", canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canDownload: false, canInvite: false },
    { role: "Finance Admin", permission: "reports", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canDownload: true, canInvite: false },
    { role: "Finance Admin", permission: "users", canView: true, canCreate: false, canEdit: true, canDelete: true, canApprove: false, canDownload: false, canInvite: true },
    { role: "Finance Admin", permission: "config", canView: true, canCreate: false, canEdit: true, canDelete: false, canApprove: false, canDownload: false, canInvite: false },
    { role: "Finance Approver", permission: "period_based", canView: true, canCreate: false, canEdit: true, canDelete: false, canApprove: true, canDownload: false, canInvite: false },
    { role: "Finance Approver", permission: "activity_based", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: true, canDownload: false, canInvite: false },
    { role: "Finance Approver", permission: "non_po", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: true, canDownload: false, canInvite: false },
    { role: "Finance Approver", permission: "reports", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canDownload: true, canInvite: false },
    { role: "Finance Approver", permission: "users", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canDownload: false, canInvite: false },
    { role: "Finance Approver", permission: "config", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canDownload: false, canInvite: false },
    { role: "Business User", permission: "activity_based", canView: true, canCreate: false, canEdit: true, canDelete: false, canApprove: false, canDownload: false, canInvite: false },
    { role: "Business User", permission: "non_po", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canDownload: false, canInvite: false },
    { role: "Business User", permission: "reports", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canDownload: false, canInvite: false },
  ];
  await db.insert(rolePermissions).values(permissions);

  for (const po of samplePoData) {
    const { grnDate, grnDoc, grnMovementType, grnValue, projectName, wbsElement, documentDate, ...lineData } = po;
    const [line] = await db.insert(poLines).values({
      ...lineData,
      projectName,
      wbsElement,
      documentDate,
      category: lineData.startDate && lineData.endDate ? "Period" : "Activity",
      status: "Draft",
    }).returning();

    if (grnDoc || (grnValue && grnValue > 0)) {
      await db.insert(grnTransactions).values({
        poLineId: line.id,
        grnDate: grnDate || "",
        grnDoc: grnDoc || "",
        grnMovementType: grnMovementType || "",
        grnValue: grnValue || 0,
      });
    }
  }

  console.log("[seed] Database seeded successfully with demo data (28 PO lines from sample dump).");
}
