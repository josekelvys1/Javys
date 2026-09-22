import { type Receivable, financeDb } from "./db.js";
import { createTransaction } from "./transactions.js";
import { newId } from "../../storage/id.js";

export interface CreateReceivableInput {
  description: string;
  amount: number;
  expectedDate: string;
  category?: string;
  recurringItemId?: string;
}

export async function createReceivable(input: CreateReceivableInput): Promise<Receivable> {
  const receivable: Receivable = {
    id: newId(),
    description: input.description,
    amount: input.amount,
    expectedDate: input.expectedDate,
    category: input.category,
    recurringItemId: input.recurringItemId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  financeDb.data.receivables.push(receivable);
  await financeDb.write();
  return receivable;
}

export function listReceivables(status: "pending" | "received" | "cancelled" | "all" = "pending"): Receivable[] {
  const items =
    status === "all" ? financeDb.data.receivables : financeDb.data.receivables.filter((r) => r.status === status);
  return items.slice().sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

export function getReceivable(id: string): Receivable | undefined {
  return financeDb.data.receivables.find((r) => r.id === id);
}

export async function cancelReceivable(id: string): Promise<boolean> {
  const receivable = getReceivable(id);
  if (!receivable || receivable.status !== "pending") return false;
  receivable.status = "cancelled";
  await financeDb.write();
  return true;
}

export interface MarkReceivedInput {
  amount?: number;
  date?: string;
}

export async function markReceivableReceived(
  id: string,
  input: MarkReceivedInput = {},
): Promise<Receivable | null> {
  const receivable = getReceivable(id);
  if (!receivable || receivable.status !== "pending") return null;

  const { transaction } = await createTransaction({
    type: "income",
    amount: input.amount ?? receivable.amount,
    description: receivable.description,
    category: receivable.category ?? "salário/receita",
    date: input.date ?? new Date().toISOString(),
  });

  receivable.status = "received";
  receivable.transactionId = transaction.id;
  await financeDb.write();
  return receivable;
}
