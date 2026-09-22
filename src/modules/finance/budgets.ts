import { type Budget, financeDb } from "./db.js";
import { newId } from "../../storage/id.js";
import { fromISO } from "../../utils/time.js";

const THRESHOLDS = [150, 100, 80];

export async function setBudget(category: string, monthlyLimit: number): Promise<Budget> {
  const existing = financeDb.data.budgets.find(
    (b) => b.category.toLowerCase() === category.toLowerCase(),
  );
  if (existing) {
    existing.monthlyLimit = monthlyLimit;
    existing.lastAlertedMonth = undefined;
    existing.lastAlertedThreshold = undefined;
    await financeDb.write();
    return existing;
  }

  const budget: Budget = {
    id: newId(),
    category,
    monthlyLimit,
    createdAt: new Date().toISOString(),
  };
  financeDb.data.budgets.push(budget);
  await financeDb.write();
  return budget;
}

export function listBudgets(): Budget[] {
  return financeDb.data.budgets;
}

function monthTotalForCategory(category: string, monthISO: string): number {
  const monthKey = fromISO(monthISO).format("YYYY-MM");
  return financeDb.data.transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        t.category.toLowerCase() === category.toLowerCase() &&
        fromISO(t.date).format("YYYY-MM") === monthKey,
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Recalcula o gasto do mês na categoria e checa se cruzou um novo limiar da
 * meta (80/100/150%) que ainda não tinha sido avisado neste mês. Retorna a
 * mensagem de alerta se sim, ou null caso contrário.
 */
export async function checkBudgetAlert(category: string, monthISO: string): Promise<string | null> {
  const budget = financeDb.data.budgets.find(
    (b) => b.category.toLowerCase() === category.toLowerCase(),
  );
  if (!budget) return null;

  const monthKey = fromISO(monthISO).format("YYYY-MM");
  if (budget.lastAlertedMonth !== monthKey) {
    budget.lastAlertedMonth = monthKey;
    budget.lastAlertedThreshold = 0;
  }

  const total = monthTotalForCategory(category, monthISO);
  const pct = (total / budget.monthlyLimit) * 100;

  const crossed = THRESHOLDS.find((t) => pct >= t && (budget.lastAlertedThreshold ?? 0) < t);
  if (!crossed) {
    await financeDb.write();
    return null;
  }

  budget.lastAlertedThreshold = crossed;
  await financeDb.write();

  if (crossed >= 150) {
    return `🚨 Você já gastou ${pct.toFixed(0)}% da meta de ${budget.category} (R$${total.toFixed(2)} de R$${budget.monthlyLimit.toFixed(2)}) — bem acima do combinado.`;
  }
  if (crossed >= 100) {
    return `⚠️ Meta de ${budget.category} estourada: R$${total.toFixed(2)} de R$${budget.monthlyLimit.toFixed(2)} este mês.`;
  }
  return `👀 Você já usou ${pct.toFixed(0)}% da meta de ${budget.category} este mês (R$${total.toFixed(2)} de R$${budget.monthlyLimit.toFixed(2)}).`;
}
