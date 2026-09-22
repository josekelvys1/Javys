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

export type HabitFrequency =
  | { kind: "weekly"; daysOfWeek: number[]; times: string[] }
  | { kind: "interval"; everyHours: number; activeFrom: string; activeTo: string };

export interface Habit {
  id: string;
  name: string;
  frequency: HabitFrequency;
  goal?: string;
  createdAt: string;
  status: "active" | "paused" | "archived";
}

export interface HabitCheckIn {
  id: string;
  habitId: string;
  dueAt: string;
  status: "notified" | "done" | "not_done";
  notifiedAt: string;
  respondedAt?: string;
}

export interface WorkoutExercise {
  name: string;
  muscleGroup?: string;
  weightKg?: number;
  sets?: number;
  reps?: number;
  notes?: string;
}

export interface WorkoutSession {
  id: string;
  date: string;
  muscleGroup?: string;
  exercises: WorkoutExercise[];
  rawText?: string;
  createdAt: string;
}

interface DbSchema {
  reminders: Reminder[];
  appointments: Appointment[];
  pendingActions: PendingAction[];
  habits: Habit[];
  habitCheckIns: HabitCheckIn[];
  workouts: WorkoutSession[];
}

const defaultData: DbSchema = {
  reminders: [],
  appointments: [],
  pendingActions: [],
  habits: [],
  habitCheckIns: [],
  workouts: [],
};

const dbFile = path.join(config.dataDir, "jarvis-db.json");

export const db = await JSONFilePreset<DbSchema>(dbFile, defaultData);

// JSONFilePreset só aplica defaultData quando o arquivo ainda não existe.
// Em bancos já existentes (ex: antes deste módulo de hábitos), chaves novas
// do schema ficam undefined e quebram qualquer código que assuma array.
// Preenche o que estiver faltando e persiste uma vez.
let migrated = false;
for (const key of Object.keys(defaultData) as (keyof DbSchema)[]) {
  if (db.data[key] === undefined) {
    (db.data[key] as unknown) = defaultData[key];
    migrated = true;
  }
}
if (migrated) await db.write();

export function newId(): string {
  return randomUUID().slice(0, 8);
}
