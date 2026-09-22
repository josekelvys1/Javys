import { type Payable, financeDb } from "./db.js";
import { createTransaction } from "./transactions.js";
import { newId } from "../../storage/id.js";
import { fromISO } from "../../utils/time.js";

const REMINDER_WINDOW_DAYS = 3;

export interface CreatePayableInput {
  description: string;
  amount: number;
  dueDate: string;
  category?: string;
  recurringItemId?: string;
}

export async function createPayable(input: CreatePayableInput): Promise<Payable> {
  const payable: Payable = {
    id: newId(),
    description: input.description,
    amount: input.amount,
    dueDate: input.dueDate,
    category: input.category,
    recurringItemId: input.recurringItemId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  financeDb.data.payables.push(payable);
  await financeDb.write();
  return payable;
}

export function listPayables(status: "pending" | "paid" | "cancelled" | "all" = "pending"): Payable[] {
  const items = status === "all" ? financeDb.data.payables : financeDb.data.payables.filter((p) => p.status === status);
  return items.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getPayable(id: string): Payable | undefined {
  return financeDb.data.payables.find((p) => p.id === id);
}

export async function cancelPayable(id: string): Promise<boolean> {
  const payable = getPayable(id);
  if (!payable || payable.status !== "pending") return false;
  payable.status = "cancelled";
  await financeDb.write();
  return true;
}

export interface MarkPaidInput {
  amount?: number;
  date?: string;
}

export async function markPayablePaid(id: string, input: MarkPaidInput = {}): Promise<Payable | null> {
  const payable = getPayable(id);
  if (!payable || payable.status !== "pending") return null;

  const { transaction } = await createTransaction({
    type: "expense",
    amount: input.amount ?? payable.amount,
    description: payable.description,
    category: payable.category ?? "outros",
    date: input.date ?? new Date().toISOString(),
  });

  payable.status = "paid";
  payable.transactionId = transaction.id;
  await financeDb.write();
  return payable;
}

export function getPayablesNeedingReminder(nowISO: string): Payable[] {
  const today = fromISO(nowISO).format("YYYY-MM-DD");
  const soonThreshold = fromISO(nowISO).add(REMINDER_WINDOW_DAYS, "day").toISOString();

  return financeDb.data.payables.filter((p) => {
    if (p.status !== "pending") return false;
    if (p.dueDate > soonThreshold) return false;
    if (p.lastReminderAt && fromISO(p.lastReminderAt).format("YYYY-MM-DD") === today) return false;
    return true;
  });
}

export async function markPayableReminded(id: string, remindedAtISO: string): Promise<void> {
  const payable = getPayable(id);
  if (!payable) return;
  payable.lastReminderAt = remindedAtISO;
  await financeDb.write();
}
