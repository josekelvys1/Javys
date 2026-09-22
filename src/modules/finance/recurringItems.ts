import { type RecurringItem, financeDb } from "./db.js";
import { createPayable } from "./payables.js";
import { createReceivable } from "./receivables.js";
import { newId } from "../../storage/id.js";
import { fromISO } from "../../utils/time.js";

export interface CreateRecurringItemInput {
  description: string;
  amount: number;
  type: "income" | "expense";
  category?: string;
  dayOfMonth: number;
}

export async function createRecurringItem(input: CreateRecurringItemInput): Promise<RecurringItem> {
  const item: RecurringItem = {
    id: newId(),
    description: input.description,
    amount: input.amount,
    type: input.type,
    category: input.category,
    dayOfMonth: input.dayOfMonth,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  financeDb.data.recurringItems.push(item);
  await financeDb.write();
  return item;
}

export function listRecurringItems(): RecurringItem[] {
  return financeDb.data.recurringItems.filter((i) => i.status === "active");
}

export async function pauseRecurringItem(id: string): Promise<boolean> {
  const item = financeDb.data.recurringItems.find((i) => i.id === id);
  if (!item) return false;
  item.status = "paused";
  await financeDb.write();
  return true;
}

function occurrenceDateForMonth(dayOfMonth: number, monthStartISO: string): string {
  const monthStart = fromISO(monthStartISO).startOf("month");
  const clampedDay = Math.min(dayOfMonth, monthStart.daysInMonth());
  return monthStart.date(clampedDay).toISOString();
}

/**
 * Garante que cada RecurringItem ativo tenha um Payable/Receivable
 * materializado para o mês corrente. Idempotente: não duplica se já existe
 * uma ocorrência deste item no mês.
 */
export async function ensureCurrentMonthOccurrences(nowISO: string): Promise<void> {
  const monthKey = fromISO(nowISO).format("YYYY-MM");

  for (const item of listRecurringItems()) {
    if (item.type === "expense") {
      const alreadyExists = financeDb.data.payables.some(
        (p) => p.recurringItemId === item.id && fromISO(p.dueDate).format("YYYY-MM") === monthKey,
      );
      if (alreadyExists) continue;

      await createPayable({
        description: item.description,
        amount: item.amount,
        dueDate: occurrenceDateForMonth(item.dayOfMonth, nowISO),
        category: item.category,
        recurringItemId: item.id,
      });
    } else {
      const alreadyExists = financeDb.data.receivables.some(
        (r) => r.recurringItemId === item.id && fromISO(r.expectedDate).format("YYYY-MM") === monthKey,
      );
      if (alreadyExists) continue;

      await createReceivable({
        description: item.description,
        amount: item.amount,
        expectedDate: occurrenceDateForMonth(item.dayOfMonth, nowISO),
        category: item.category,
        recurringItemId: item.id,
      });
    }
  }
}
