import { type Category, financeDb } from "./db.js";
import { newId } from "../../storage/id.js";

export function listCategories(): Category[] {
  return financeDb.data.categories;
}

export async function resolveOrCreateCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  const existing = financeDb.data.categories.find(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return existing;

  const category: Category = {
    id: newId(),
    name: trimmed,
    isDefault: false,
    createdAt: new Date().toISOString(),
  };
  financeDb.data.categories.push(category);
  await financeDb.write();
  return category;
}

export async function createCategory(name: string): Promise<Category> {
  return resolveOrCreateCategory(name);
}
