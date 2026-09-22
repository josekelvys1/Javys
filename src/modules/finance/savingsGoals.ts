import { type SavingsGoal, financeDb } from "./db.js";
import { getFinancialSummary } from "./transactions.js";
import { newId } from "../../storage/id.js";

export async function setSavingsGoal(
  name: string,
  kind: "monthly" | "target",
  targetAmount: number,
): Promise<SavingsGoal> {
  const existing = financeDb.data.savingsGoals.find((g) => g.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.kind = kind;
    existing.targetAmount = targetAmount;
    await financeDb.write();
    return existing;
  }

  const goal: SavingsGoal = {
    id: newId(),
    name,
    kind,
    targetAmount,
    currentAmount: 0,
    createdAt: new Date().toISOString(),
  };
  financeDb.data.savingsGoals.push(goal);
  await financeDb.write();
  return goal;
}

export function listSavingsGoals(): SavingsGoal[] {
  return financeDb.data.savingsGoals;
}

export function getSavingsGoal(id: string): SavingsGoal | undefined {
  return financeDb.data.savingsGoals.find((g) => g.id === id);
}

export async function contributeToSavingsGoal(id: string, amount: number): Promise<SavingsGoal | null> {
  const goal = getSavingsGoal(id);
  if (!goal) return null;
  goal.currentAmount += amount;
  await financeDb.write();
  return goal;
}

export interface SavingsGoalProgress {
  goal: SavingsGoal;
  current: number;
  target: number;
}

export function getSavingsGoalsProgress(): SavingsGoalProgress[] {
  const monthNet = () => {
    const summary = getFinancialSummary("month");
    return summary.totalIncome - summary.totalExpense;
  };

  return listSavingsGoals().map((goal) => ({
    goal,
    current: goal.kind === "monthly" ? monthNet() : goal.currentAmount,
    target: goal.targetAmount,
  }));
}
