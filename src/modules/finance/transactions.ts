import { type Transaction, financeDb } from "./db.js";
import { checkBudgetAlert } from "./budgets.js";
import { newId } from "../../storage/id.js";
import { fromISO, now } from "../../utils/time.js";

const ANOMALY_MIN_SAMPLES = 3;
const ANOMALY_MULTIPLIER = 2.5;

export interface CreateTransactionInput {
  type: "income" | "expense";
  amount: number;
  description: string;
  category: string;
  date: string;
  rawText?: string;
}

export interface CreateTransactionResult {
  transaction: Transaction;
  budgetAlert: string | null;
  anomalyAlert: string | null;
}

function detectAnomaly(newTx: Transaction): string | null {
  const priorAmounts = financeDb.data.transactions
    .filter(
      (t) =>
        t.id !== newTx.id &&
        t.type === "expense" &&
        t.category.toLowerCase() === newTx.category.toLowerCase(),
    )
    .map((t) => t.amount);

  if (priorAmounts.length < ANOMALY_MIN_SAMPLES) return null;

  const average = priorAmounts.reduce((sum, a) => sum + a, 0) / priorAmounts.length;
  if (average <= 0 || newTx.amount < average * ANOMALY_MULTIPLIER) return null;

  return `📈 Esse gasto de R$${newTx.amount.toFixed(2)} em ${newTx.category} está bem acima do seu normal (média de R$${average.toFixed(2)} nos lançamentos anteriores).`;
}

export async function createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult> {
  const transaction: Transaction = {
    id: newId(),
    type: input.type,
    amount: input.amount,
    description: input.description,
    category: input.category,
    date: input.date,
    source: "manual",
    rawText: input.rawText,
    createdAt: new Date().toISOString(),
  };
  financeDb.data.transactions.push(transaction);
  await financeDb.write();

  let budgetAlert: string | null = null;
  let anomalyAlert: string | null = null;
  if (transaction.type === "expense") {
    budgetAlert = await checkBudgetAlert(transaction.category, transaction.date);
    anomalyAlert = detectAnomaly(transaction);
  }

  return { transaction, budgetAlert, anomalyAlert };
}

export interface ListTransactionsFilters {
  category?: string;
  type?: "income" | "expense";
}

export function listTransactions(
  period: "today" | "week" | "month" | "all",
  filters: ListTransactionsFilters = {},
): Transaction[] {
  let items = financeDb.data.transactions.slice();

  if (period !== "all") {
    const today = now().startOf("day");
    const fromDay =
      period === "today" ? today : period === "week" ? today.subtract(6, "day") : today.startOf("month");
    items = items.filter((t) => !fromISO(t.date).isBefore(fromDay));
  }

  if (filters.category) {
    const needle = filters.category.toLowerCase();
    items = items.filter((t) => t.category.toLowerCase().includes(needle));
  }
  if (filters.type) {
    items = items.filter((t) => t.type === filters.type);
  }

  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  byCategory: CategoryTotal[];
  projectedExpense?: number;
}

export function getFinancialSummary(period: "today" | "week" | "month" | "all"): FinancialSummary {
  const items = listTransactions(period);

  const totalIncome = items.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = items.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);

  const byCategoryMap = new Map<string, CategoryTotal>();
  for (const t of items.filter((t) => t.type === "expense")) {
    const entry = byCategoryMap.get(t.category) ?? { category: t.category, total: 0, count: 0 };
    entry.total += t.amount;
    entry.count += 1;
    byCategoryMap.set(t.category, entry);
  }
  const byCategory = Array.from(byCategoryMap.values()).sort((a, b) => b.total - a.total);

  const summary: FinancialSummary = {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    byCategory,
  };

  if (period === "month") {
    const today = now();
    const dayOfMonth = today.date();
    const daysInMonth = today.daysInMonth();
    summary.projectedExpense = (totalExpense / dayOfMonth) * daysInMonth;
  }

  return summary;
}

export interface MonthCategoryTotals {
  month: string;
  byCategory: CategoryTotal[];
}

export function getCategoryHistory(months = 6): MonthCategoryTotals[] {
  const result: MonthCategoryTotals[] = [];
  let cursor = now().startOf("month");

  for (let i = 0; i < months; i++) {
    const monthKey = cursor.format("YYYY-MM");
    const byCategoryMap = new Map<string, CategoryTotal>();

    for (const t of financeDb.data.transactions) {
      if (t.type !== "expense") continue;
      if (fromISO(t.date).format("YYYY-MM") !== monthKey) continue;
      const entry = byCategoryMap.get(t.category) ?? { category: t.category, total: 0, count: 0 };
      entry.total += t.amount;
      entry.count += 1;
      byCategoryMap.set(t.category, entry);
    }

    result.push({
      month: monthKey,
      byCategory: Array.from(byCategoryMap.values()).sort((a, b) => b.total - a.total),
    });
    cursor = cursor.subtract(1, "month");
  }

  return result.reverse();
}

export async function updateTransactionCategory(id: string, category: string): Promise<boolean> {
  const transaction = financeDb.data.transactions.find((t) => t.id === id);
  if (!transaction) return false;
  transaction.category = category;
  await financeDb.write();
  return true;
}
