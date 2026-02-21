# Period-Based Final Provision Calculation Bug Report

**Date:** February 20, 2026
**Application:** r2r-pwc (Accruals Pro)
**Page:** Period-Based Accruals

## Summary

There is a **critical discrepancy** between the "Final" value displayed in the table row and the "Final Provision" calculated in the edit modal.

## Bug Details

### Example from PO 4400214554 (ID: 836)

#### Table Row Display (from API)
- **Final (displayed in table):** 4
- **Suggested Provision:** 2
- **Total GRN to Date:** 203,000
- **Current Month True-Up:** 0

#### Edit Modal Calculation
The modal uses the formula at line 214-218 of `client/src/pages/period-based.tsx`:

```typescript
const computeModalFinal = () => {
  if (!editModalLine) return 0;
  const curTU = parseFloat(modalCurTrueUp) || 0;
  return Math.round((editModalLine.suggestedProvision || 0) - (editModalLine.totalGrnToDate || 0) + curTU);
};
```

**Modal Calculated Value:** 2 - 203,000 + 0 = **-202,998**

#### Discrepancy
- **Table shows:** 4
- **Modal calculates:** -202,998
- **Difference:** 203,002

## Root Cause Analysis

### Backend Calculation (server/storage.ts line 275)
```typescript
const finalProvision = suggestedProvision - Math.round(lastKnown.value) + currTrueUp;
```

Where `lastKnown.value` is assigned to `totalGrnToDate`.

### Frontend Modal Calculation (client/src/pages/period-based.tsx line 217)
```typescript
return Math.round((editModalLine.suggestedProvision || 0) - (editModalLine.totalGrnToDate || 0) + curTU);
```

**Both use the same formula**, so the calculation logic is consistent. However, the API is returning stored `finalProvision` values that don't match this formula.

## Additional Examples

| PO Number | ID | Suggested | Total GRN | True-Up | Stored Final | Calculated | Difference |
|-----------|-----|-----------|-----------|---------|--------------|------------|------------|
| 4400214554 | 836 | 2 | 203,000 | 0 | 4 | -202,998 | 203,002 |
| 4400215096 | 1204 | 0 | 1,000 | 0 | 0 | -1,000 | 1,000 |
| 4400215236 | 1300 | 4 | 107,349 | 0 | 9 | -107,345 | 107,354 |
| 4400215262 | 1319 | 0 | 15,575 | 0 | 0 | -15,575 | 15,575 |
| 4400215325 | 1381 | 3 | 6,098 | 0 | 6 | -6,095 | 6,101 |

## Impact

1. **User Confusion:** Users see different values in the table vs. the edit modal
2. **Data Integrity:** The stored `finalProvision` doesn't match the calculation formula
3. **Business Logic Error:** Financial calculations are incorrect, leading to wrong accrual amounts

## Possible Causes

1. **Historical Data Issue:** The stored `finalProvision` values may have been calculated using a different (incorrect) formula
2. **Data Migration Problem:** Data might have been imported or migrated incorrectly
3. **Stale Data:** The `finalProvision` in the database might not have been recalculated after GRN updates

## Expected Behavior

The "Final" column in the table should show the same value as the "Final Provision" in the edit modal, calculated as:

**Final Provision = Current Month Provision - Total GRN to Date + Current Month True-Up**

## Actual Behavior

- **Table:** Shows stored `finalProvision` value from database (e.g., 4)
- **Modal:** Calculates fresh value using the formula (e.g., -202,998)

## Recommendations

1. **Immediate Fix:** Recalculate all `finalProvision` values in the database to match the formula
2. **Code Review:** Ensure the backend calculation at storage.ts:275 is being executed correctly
3. **Data Validation:** Add a database migration to fix existing records
4. **Testing:** Add unit tests to verify `finalProvision` calculation matches formula

## Test Instructions

1. Navigate to http://localhost:3000
2. Log in with admin@company.com / Admin@123
3. Go to "Period-Based" page
4. Find PO 4400214554
5. Note the "Final" column value: **4**
6. Click "Edit" button for that row
7. Observe "Final Provision" in modal: Should show **-202,998** (not 4)

## Additional Notes

The tooltip on the "Final" column header (line 533 in period-based.tsx) correctly describes the formula:
> "Final provision = Current Month Provision - Total GRN to Date + Current True-Up"

This confirms the intended calculation logic.
