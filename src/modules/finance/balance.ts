import { type ReferenceBalance, financeDb } from "./db.js";
import { fromISO } from "../../utils/time.js";

export async function setReferenceBalance(amount: number, asOfISO?: string): Promise<ReferenceBalance> {
  const now = new Date().toISOString();
  financeDb.data.referenceBalance = {
    amount,
    asOf: asOfISO ?? now,
    updatedAt: now,
  };
  await financeDb.write();
  return financeDb.data.referenceBalance;
}

export function getReferenceBalance(): ReferenceBalance {
  return financeDb.data.referenceBalance;
}

export interface CurrentBalance {
  balance: number;
  referenceAmount: number;
  asOf: string;
}

export function getCurrentBalance(): CurrentBalance {
  const reference = financeDb.data.referenceBalance;
  const since = fromISO(reference.asOf);

  const net = financeDb.data.transactions
    .filter((t) => !fromISO(t.date).isBefore(since))
    .reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0);

  return {
    balance: reference.amount + net,
    referenceAmount: reference.amount,
    asOf: reference.asOf,
  };
}
