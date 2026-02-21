import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, integer, serial, boolean, timestamp, real, jsonb, uniqueIndex, index
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
}, (table) => [
  uniqueIndex("users_email_idx").on(table.email),
]);

export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  assignedBy: integer("assigned_by").references(() => users.id),
}, (table) => [
  uniqueIndex("user_roles_unique_idx").on(table.userId, table.role),
  index("user_roles_user_idx").on(table.userId),
]);

export const costCenterAssignments = pgTable("cost_center_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  costCenter: text("cost_center").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("cc_assign_unique_idx").on(table.userId, table.costCenter),
  index("cc_assign_user_idx").on(table.userId),
]);

export const poUploads = pgTable("po_uploads", {
  id: serial("id").primaryKey(),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
  filename: text("filename").notNull(),
  processingMonth: text("processing_month").notNull(),
  uploadDate: timestamp("upload_date").defaultNow().notNull(),
  totalRows: integer("total_rows").default(0),
  periodBasedCount: integer("period_based_count").default(0),
  activityBasedCount: integer("activity_based_count").default(0),
  status: text("status").notNull().default("Completed"),
});

export const poLines = pgTable("po_lines", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").references(() => poUploads.id),
  uniqueId: text("unique_id").unique(),
  poNumber: text("po_number"),
  poLineItem: text("po_line_item"),
  vendorName: text("vendor_name"),
  itemDescription: text("item_description"),
  projectName: text("project_name"),
  wbsElement: text("wbs_element"),
  costCenter: text("cost_center"),
  profitCenter: text("profit_center"),
  glAccount: text("gl_account"),
  docType: text("doc_type"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  plant: text("plant"),
  netAmount: real("net_amount").default(0),
  prNumber: text("pr_number"),
  prOwnerId: text("pr_owner_id"),
  costCenterOwnerId: text("cost_center_owner_id"),
  documentDate: text("document_date"),
  category: text("category").notNull().default("Period"),
  status: text("status").notNull().default("Draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("po_lines_po_number_idx").on(table.poNumber),
  index("po_lines_category_idx").on(table.category),
  index("po_lines_cost_center_idx").on(table.costCenter),
  index("po_lines_upload_idx").on(table.uploadId),
]);

export const grnUploads = pgTable("grn_uploads", {
  id: serial("id").primaryKey(),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
  filename: text("filename").notNull(),
  processingMonth: text("processing_month").notNull(),
  uploadDate: timestamp("upload_date").defaultNow().notNull(),
  totalRows: integer("total_rows").default(0),
  matchedRows: integer("matched_rows").default(0),
  unmatchedRows: integer("unmatched_rows").default(0),
  status: text("status").notNull().default("Completed"),
});

export const grnTransactions = pgTable("grn_transactions", {
  id: serial("id").primaryKey(),
  poLineId: integer("po_line_id").notNull().references(() => poLines.id, { onDelete: "cascade" }),
  grnDate: text("grn_date"),
  grnDoc: text("grn_doc"),
  grnMovementType: text("grn_movement_type"),
  grnValue: real("grn_value").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("grn_po_line_idx").on(table.poLineId),
  index("grn_doc_idx").on(table.grnDoc),
]);

export const periodCalculations = pgTable("period_calculations", {
  id: serial("id").primaryKey(),
  poLineId: integer("po_line_id").notNull().references(() => poLines.id, { onDelete: "cascade" }),
  processingMonth: text("processing_month").notNull(),
  prevMonthTrueUp: real("prev_month_true_up").default(0),
  currentMonthTrueUp: real("current_month_true_up").default(0),
  remarks: text("remarks"),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  calculatedBy: integer("calculated_by").references(() => users.id),
  activityFinalProvision: real("activity_final_provision"),
}, (table) => [
  uniqueIndex("period_calc_unique_idx").on(table.poLineId, table.processingMonth),
  index("period_calc_po_line_idx").on(table.poLineId),
]);

export const activityAssignments = pgTable("activity_assignments", {
  id: serial("id").primaryKey(),
  poLineId: integer("po_line_id").notNull().references(() => poLines.id, { onDelete: "cascade" }),
  assignedToUserId: integer("assigned_to_user_id").notNull().references(() => users.id),
  isPrimary: boolean("is_primary").default(false),
  assignedDate: timestamp("assigned_date").defaultNow().notNull(),
  assignedBy: integer("assigned_by").references(() => users.id),
  status: text("status").notNull().default("Assigned"),
  nudgeCount: integer("nudge_count").default(0),
  lastNudgeAt: timestamp("last_nudge_at"),
  returnComments: text("return_comments"),
  returnedAt: timestamp("returned_at"),
}, (table) => [
  index("activity_assign_user_idx").on(table.assignedToUserId),
  index("activity_assign_po_idx").on(table.poLineId),
]);

export const businessResponses = pgTable("business_responses", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => activityAssignments.id, { onDelete: "cascade" }),
  completionStatus: text("completion_status").notNull().default("Not Started"),
  provisionAmount: real("provision_amount").default(0),
  provisionPercent: real("provision_percent"),
  comments: text("comments"),
  attachments: jsonb("attachments").$type<string[]>(),
  responseDate: timestamp("response_date").defaultNow(),
  financeTrueUp: real("finance_true_up").default(0),
  financeRemarks: text("finance_remarks"),
}, (table) => [
  index("biz_response_assign_idx").on(table.assignmentId),
]);

export const nonpoForms = pgTable("nonpo_forms", {
  id: serial("id").primaryKey(),
  formName: text("form_name").notNull(),
  description: text("description"),
  dueDate: text("due_date"),
  priority: text("priority").default("Medium"),
  fieldConfiguration: jsonb("field_configuration").$type<any>(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isTemplate: boolean("is_template").default(false),
});

export const nonpoFormAssignments = pgTable("nonpo_form_assignments", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => nonpoForms.id, { onDelete: "cascade" }),
  assignedToUserId: integer("assigned_to_user_id").notNull().references(() => users.id),
  assignedDate: timestamp("assigned_date").defaultNow().notNull(),
  nudgeCount: integer("nudge_count").default(0),
  lastNudgeAt: timestamp("last_nudge_at"),
  status: text("status").notNull().default("Assigned"),
  returnComments: text("return_comments"),
  returnedAt: timestamp("returned_at"),
}, (table) => [
  index("nonpo_assign_form_idx").on(table.formId),
  index("nonpo_assign_user_idx").on(table.assignedToUserId),
]);

export const nonpoSubmissions = pgTable("nonpo_submissions", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => nonpoForms.id, { onDelete: "cascade" }),
  submittedBy: integer("submitted_by").notNull().references(() => users.id),
  submissionDate: timestamp("submission_date").defaultNow().notNull(),
  standardFields: jsonb("standard_fields").$type<any>(),
  customFields: jsonb("custom_fields").$type<any>(),
  attachments: jsonb("attachments").$type<string[]>(),
  financeTrueUp: real("finance_true_up").default(0),
  financeRemarks: text("finance_remarks"),
  status: text("status").notNull().default("Draft"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => [
  index("nonpo_sub_form_idx").on(table.formId),
  index("nonpo_sub_user_idx").on(table.submittedBy),
]);

export const approvalRules = pgTable("approval_rules", {
  id: serial("id").primaryKey(),
  ruleName: text("rule_name").notNull(),
  naturalLanguageText: text("natural_language_text"),
  parsedConditions: jsonb("parsed_conditions").$type<any>(),
  parsedActions: jsonb("parsed_actions").$type<any>(),
  priority: integer("priority").default(1),
  appliesTo: text("applies_to").default("Both"),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  configKey: text("config_key").notNull().unique(),
  configValue: text("config_value"),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  details: jsonb("details").$type<any>(),
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  notificationType: text("notification_type"),
  title: text("title").notNull(),
  message: text("message"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("notifications_user_idx").on(table.userId),
]);

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  permission: text("permission").notNull(),
  canView: boolean("can_view").default(false),
  canCreate: boolean("can_create").default(false),
  canEdit: boolean("can_edit").default(false),
  canDelete: boolean("can_delete").default(false),
  canApprove: boolean("can_approve").default(false),
  canDownload: boolean("can_download").default(false),
  canInvite: boolean("can_invite").default(false),
}, (table) => [
  uniqueIndex("role_perm_unique_idx").on(table.role, table.permission),
]);

export const approvalSubmissions = pgTable("approval_submissions", {
  id: serial("id").primaryKey(),
  poLineId: integer("po_line_id").notNull().references(() => poLines.id, { onDelete: "cascade" }),
  submittedBy: integer("submitted_by").notNull().references(() => users.id),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  status: text("status").notNull().default("Pending"),
  approverIds: jsonb("approver_ids").$type<number[]>().notNull(),
  rejectionReason: text("rejection_reason"),
  approvedBy: integer("approved_by").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  nudgeCount: integer("nudge_count").default(0),
  lastNudgeAt: timestamp("last_nudge_at"),
  processingMonth: text("processing_month"),
}, (table) => [
  index("approval_sub_po_line_idx").on(table.poLineId),
  index("approval_sub_status_idx").on(table.status),
]);

// Insert schemas
export const insertApprovalSubmissionSchema = createInsertSchema(approvalSubmissions).omit({ id: true, submittedAt: true, decidedAt: true, lastNudgeAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, lastLogin: true, resetToken: true, resetTokenExpiry: true });
export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ id: true, assignedAt: true });
export const insertCostCenterAssignmentSchema = createInsertSchema(costCenterAssignments).omit({ id: true, assignedAt: true });
export const insertPoUploadSchema = createInsertSchema(poUploads).omit({ id: true, uploadDate: true });
export const insertPoLineSchema = createInsertSchema(poLines).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGrnTransactionSchema = createInsertSchema(grnTransactions).omit({ id: true, createdAt: true });
export const insertPeriodCalculationSchema = createInsertSchema(periodCalculations).omit({ id: true, calculatedAt: true });
export const insertActivityAssignmentSchema = createInsertSchema(activityAssignments).omit({ id: true, assignedDate: true });
export const insertBusinessResponseSchema = createInsertSchema(businessResponses).omit({ id: true, responseDate: true });
export const insertNonpoFormSchema = createInsertSchema(nonpoForms).omit({ id: true, createdAt: true });
export const insertNonpoFormAssignmentSchema = createInsertSchema(nonpoFormAssignments).omit({ id: true, assignedDate: true });
export const insertNonpoSubmissionSchema = createInsertSchema(nonpoSubmissions).omit({ id: true, submissionDate: true, reviewedAt: true });
export const insertApprovalRuleSchema = createInsertSchema(approvalRules).omit({ id: true, createdAt: true });
export const insertSystemConfigSchema = createInsertSchema(systemConfig).omit({ id: true, updatedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ id: true, timestamp: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type CostCenterAssignment = typeof costCenterAssignments.$inferSelect;
export type PoUpload = typeof poUploads.$inferSelect;
export type PoLine = typeof poLines.$inferSelect;
export type GrnTransaction = typeof grnTransactions.$inferSelect;
export type PeriodCalculation = typeof periodCalculations.$inferSelect;
export type ActivityAssignment = typeof activityAssignments.$inferSelect;
export type BusinessResponse = typeof businessResponses.$inferSelect;
export type NonpoForm = typeof nonpoForms.$inferSelect;
export type NonpoFormAssignment = typeof nonpoFormAssignments.$inferSelect;
export type NonpoSubmission = typeof nonpoSubmissions.$inferSelect;
export type ApprovalRule = typeof approvalRules.$inferSelect;
export type SystemConfig = typeof systemConfig.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type ApprovalSubmission = typeof approvalSubmissions.$inferSelect;

// Login schema
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Create user form schema
export const createUserFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  roles: z.array(z.string()).min(1, "At least one role is required"),
  costCenters: z.array(z.string()).optional(),
  status: z.string().default("Active"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
export type CreateUserFormInput = z.infer<typeof createUserFormSchema>;

// Role type
export type UserRoleName = "Finance Admin" | "Finance Approver" | "Business User";
