# Accruals Pro - Financial Accruals Management System

## Overview
Production-ready financial accruals management system with role-based access control, JWT authentication, and comprehensive modules for managing period-based accruals, activity-based accruals, non-PO accruals, approval rules, user management, reports, and system configuration.

## Architecture
- **Frontend**: React + TypeScript + Vite, TailwindCSS, shadcn/ui components, Recharts for data visualization
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM (17 tables)
- **Auth**: JWT tokens (sessionStorage) + bcrypt password hashing

## Key Files
- `shared/schema.ts` - Drizzle ORM schema (17 tables) with Zod validation
- `server/routes.ts` - All API routes with auth middleware
- `server/storage.ts` - Data access layer with all CRUD operations
- `server/auth.ts` - JWT generation/verification, bcrypt utilities, auth middleware
- `server/seed.ts` - Demo data seeding (4 users, 12 PO lines, config, permissions)
- `client/src/App.tsx` - Route configuration with role-based access
- `client/src/contexts/AuthContext.tsx` - Authentication state management
- `client/src/components/layout/AppLayout.tsx` - Main layout with sidebar navigation
- `client/src/lib/api.ts` - API utilities with auth headers

## Demo Users
- Finance Admin: admin@company.com / Admin@123
- Finance Approver: approver@company.com / Approver@123
- Business User: user@company.com / User@123
- Business User 2: sanjay@company.com / User@123

## Recent Changes
- 2026-02-17: Sidebar restructuring and Approval Rules relocation
  - Sidebar reordered: Dashboard → Accruals (collapsible) → Approval Tracker → Reports → User Management → Configuration
  - Period-Based, Activity-Based, Non-PO nested under collapsible "Accruals" group in sidebar
  - Approval Rules moved from standalone page into Configuration as a new "Approval Rules" tab
  - /approval-rules route removed; approval rules content integrated into /configuration page
  - Dynamic date range for month navigation (ProcessingMonthContext, dashboard calendar, config dropdown) based on actual PO data
  - GET /api/data/date-range endpoint scans PO/GRN data for min/max years
- 2026-02-16: Activity-Based edit modal, merged Approval Tracker, date-based calculations
  - Activity-Based edit modal rebuilt: editable start/end dates, true-up fields, remarks, live calculation preview (mirrors Period-Based modal)
  - When Activity lines have start/end dates, full pro-rated daily calculations (overlap days, carry-forward, true-ups) are used instead of GRN-only
  - Activity-Based table: added Start Date, End Date, Final Provision columns
  - Category switch validation: switching Activity→Period now requires start and end dates (backend enforced + frontend dialog)
  - New endpoints: PUT /api/po-lines/:id/dates, PUT /api/activity-based/:id/true-up, PUT /api/activity-based/:id/remarks
  - Approval Tracker merged into 3 tabs: Period-Based, Activity-Based, Non-PO with per-tab search/filter and pending count badges
  - Summary cards show total items and pending review counts across all approval types
- 2026-02-10: Calendar, dashboard, and table enhancements
  - Redesigned calendar as horizontal month scroller with always-visible stats (amount, lines, POs), gradient fade edges, hover-to-expand, smooth center-scroll
  - Dashboard activity-based count now filters by processing month dates
  - Activity-Based table expanded: GL Account, Start/End Date, Plant, Prev/Cur/Total GRN columns
  - Derived/calculated columns across period-based and activity-based tables have tinted backgrounds (bg-muted for prev month, bg-accent for current month, bg-primary for final)
  - Approval Tracker page for Finance users: submission tracking, nudge, approve/reject workflow
  - Approval submissions table in schema for per-line tracking
- 2026-02-10: Enhanced features across all modules
  - Tooltips on table headers (Period-Based, Activity-Based) explaining column meanings
  - Visual distinction: Calculator icon for calculated columns, Pencil icon for editable columns
  - Category switching (Period/Activity) on both Period-Based and Activity-Based pages via Select dropdown
  - Period-Based approval workflow: Send to Approver button (Draft→Submitted→Approved→Posted)
  - SAP Post-Ready Report tab in Reports with GL/CC breakdowns and column picker export
  - Column picker dialog for CSV exports (select which columns to include)
  - Approval Rules: Gemini AI-powered natural language rule parsing (with regex fallback)
  - Backend routes: POST /api/period-based/submit, PUT /api/period-based/approve, PUT /api/po-lines/:id/category
  - Backend routes: GET /api/reports/sap-post-ready, GET /api/reports/sap-post-ready/export
- 2026-02-09: Initial build - complete frontend and backend implementation
  - 17-table PostgreSQL schema with Drizzle ORM
  - JWT auth with bcrypt, role-based middleware
  - Full frontend with 10 pages, sidebar navigation, dark mode
  - CSV upload/parsing with PapaParse
  - Period-based accrual calculations with true-up support
  - Activity-based PO assignment and response workflow
  - Non-PO form builder and submission system
  - Reports with Recharts visualizations
  - System configuration management
