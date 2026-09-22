import path from "node:path";
import { JSONFilePreset } from "lowdb/node";
import { config } from "../../config/index.js";
import { newId } from "../../storage/id.js";

export interface Category {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  category: string;
  date: string;
  source: "manual" | "pluggy";
  externalId?: string;
  accountId?: string;
  rawText?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  category: string;
  monthlyLimit: number;
  createdAt: string;
  lastAlertedMonth?: string;
  lastAlertedThreshold?: number;
}

export interface ReferenceBalance {
  amount: number;
  asOf: string;
  updatedAt: string;
}

export interface Receivable {
  id: string;
  description: string;
  amount: number;
  expectedDate: string;
  category?: string;
  status: "pending" | "received" | "cancelled";
  transactionId?: string;
  recurringItemId?: string;
  createdAt: string;
}

export interface Payable {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  category?: string;
  status: "pending" | "paid" | "cancelled";
  transactionId?: string;
  recurringItemId?: string;
  lastReminderAt?: string;
  createdAt: string;
}

export interface RecurringItem {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category?: string;
  dayOfMonth: number;
  status: "active" | "paused";
  createdAt: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  kind: "monthly" | "target";
  targetAmount: number;
  currentAmount: number;
  createdAt: string;
}

interface FinanceDbSchema {
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  referenceBalance: ReferenceBalance;
  receivables: Receivable[];
  payables: Payable[];
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
}

const DEFAULT_CATEGORIES = [
  "alimentação",
  "mercado",
  "transporte",
  "lazer",
  "contas fixas",
  "saúde",
  "educação",
  "salário/receita",
  "outros",
];

function seedDefaultCategories(): Category[] {
  const now = new Date().toISOString();
  return DEFAULT_CATEGORIES.map((name) => ({
    id: newId(),
    name,
    isDefault: true,
    createdAt: now,
  }));
}

const defaultData: FinanceDbSchema = {
  categories: seedDefaultCategories(),
  transactions: [],
  budgets: [],
  referenceBalance: { amount: 0, asOf: new Date().toISOString(), updatedAt: new Date().toISOString() },
  receivables: [],
  payables: [],
  recurringItems: [],
  savingsGoals: [],
};

const financeDbFile = path.join(config.dataDir, "finance-db.json");

export const financeDb = await JSONFilePreset<FinanceDbSchema>(financeDbFile, defaultData);

// Mesmo raciocínio de storage/db.ts: JSONFilePreset só aplica defaultData
// quando o arquivo ainda não existe. Preenche chaves novas do schema que
// faltem num arquivo já existente (exceto `categories`, que só é semeada
// uma vez na criação do arquivo — não queremos reinserir os defaults toda
// vez que o Dono apagar uma categoria).
let migrated = false;
for (const key of Object.keys(defaultData) as (keyof FinanceDbSchema)[]) {
  if (key === "categories") continue;
  if (financeDb.data[key] === undefined) {
    (financeDb.data[key] as unknown) = defaultData[key];
    migrated = true;
  }
}
if (financeDb.data.categories === undefined) {
  financeDb.data.categories = defaultData.categories;
  migrated = true;
}
if (migrated) await financeDb.write();
