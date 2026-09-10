import { type Reminder, db, newId } from "../../storage/db.js";

export async function createReminder(text: string, dueAtISO: string): Promise<Reminder> {
  const reminder: Reminder = {
    id: newId(),
    text,
    dueAt: dueAtISO,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  db.data.reminders.push(reminder);
  await db.write();
  return reminder;
}

export function listPendingReminders(): Reminder[] {
  return db.data.reminders
    .filter((r) => r.status === "pending")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function listDueReminders(nowISO: string): Reminder[] {
  return db.data.reminders.filter((r) => r.status === "pending" && r.dueAt <= nowISO);
}

export async function cancelReminder(id: string): Promise<boolean> {
  const reminder = db.data.reminders.find((r) => r.id === id);
  if (!reminder) return false;
  reminder.status = "cancelled";
  await db.write();
  return true;
}

export async function markReminderSent(id: string): Promise<void> {
  const reminder = db.data.reminders.find((r) => r.id === id);
  if (!reminder) return;
  reminder.status = "sent";
  await db.write();
}
