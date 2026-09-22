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

interface FinanceDbSchema {
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
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
