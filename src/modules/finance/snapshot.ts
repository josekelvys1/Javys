import { getCurrentBalance } from "./balance.js";
import { getBudgetsStatus } from "./budgets.js";
import { financeDb } from "./db.js";
import { listPayables } from "./payables.js";
import { listReceivables } from "./receivables.js";
import { listRecurringItems } from "./recurringItems.js";
import { getSavingsGoalsProgress } from "./savingsGoals.js";
import { getCategoryHistory, getFinancialSummary } from "./transactions.js";
import { fromISO, now } from "../../utils/time.js";

export function getFinancialSnapshot() {
  return {
    currentBalance: getCurrentBalance(),
    monthSummary: getFinancialSummary("month"),
    categoryHistory: getCategoryHistory(3),
    receivablesPending: listReceivables("pending"),
    payablesPending: listPayables("pending"),
    budgets: getBudgetsStatus(),
    savingsGoals: getSavingsGoalsProgress(),
  };
}

export interface MonthProjection {
  month: string;
  projectedIncome: number;
  projectedExpense: number;
  projectedBalance: number;
}

export function getCashFlowProjection(monthsAhead = 1): MonthProjection[] {
  const results: MonthProjection[] = [];
  let runningBalance = getCurrentBalance().balance;
  const recurring = listRecurringItems();

  for (let i = 0; i <= monthsAhead; i++) {
    const monthCursor = now().add(i, "month").startOf("month");
    const monthKey = monthCursor.format("YYYY-MM");

    let income: number;
    let expense: number;

    if (i === 0) {
      income = financeDb.data.receivables
        .filter((r) => r.status === "pending" && fromISO(r.expectedDate).format("YYYY-MM") === monthKey)
        .reduce((sum, r) => sum + r.amount, 0);
      expense = financeDb.data.payables
        .filter((p) => p.status === "pending" && fromISO(p.dueDate).format("YYYY-MM") === monthKey)
        .reduce((sum, p) => sum + p.amount, 0);
    } else {
      const recurringIncome = recurring
        .filter((r) => r.type === "income")
        .reduce((sum, r) => sum + r.amount, 0);
      const recurringExpense = recurring
        .filter((r) => r.type === "expense")
        .reduce((sum, r) => sum + r.amount, 0);

      const explicitIncome = financeDb.data.receivables
        .filter(
          (r) =>
            r.status === "pending" &&
            !r.recurringItemId &&
            fromISO(r.expectedDate).format("YYYY-MM") === monthKey,
        )
        .reduce((sum, r) => sum + r.amount, 0);
      const explicitExpense = financeDb.data.payables
        .filter(
          (p) =>
            p.status === "pending" && !p.recurringItemId && fromISO(p.dueDate).format("YYYY-MM") === monthKey,
        )
        .reduce((sum, p) => sum + p.amount, 0);

      income = recurringIncome + explicitIncome;
      expense = recurringExpense + explicitExpense;
    }

    runningBalance = runningBalance + income - expense;
    results.push({ month: monthKey, projectedIncome: income, projectedExpense: expense, projectedBalance: runningBalance });
  }

  return results;
}
