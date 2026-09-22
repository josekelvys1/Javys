import { randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID().slice(0, 8);
}
