import { randomUUID } from "node:crypto";
import path from "node:path";
import { JSONFilePreset } from "lowdb/node";
import { config } from "../config/index.js";

export interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  createdAt: string;
  status: "pending" | "sent" | "cancelled";
}

export interface Appointment {
  id: string;
  title: string;
  startAt: string;
  endAt?: string;
  location?: string;
  notes?: string;
  createdAt: string;
  status: "scheduled" | "cancelled";
}

export interface PendingAction {
  id: string;
  type: string;
  description: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: "awaiting_confirmation" | "confirmed" | "cancelled";
}

interface DbSchema {
  reminders: Reminder[];
  appointments: Appointment[];
  pendingActions: PendingAction[];
}

const defaultData: DbSchema = {
  reminders: [],
  appointments: [],
  pendingActions: [],
};

const dbFile = path.join(config.dataDir, "jarvis-db.json");

export const db = await JSONFilePreset<DbSchema>(dbFile, defaultData);

export function newId(): string {
  return randomUUID().slice(0, 8);
}
