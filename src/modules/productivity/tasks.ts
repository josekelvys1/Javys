import { type Task, db, newId } from "../../storage/db.js";
import { fromISO } from "../../utils/time.js";

export async function createTask(title: string, dueAtISO: string): Promise<Task> {
  const task: Task = {
    id: newId(),
    title,
    dueAt: dueAtISO,
    createdAt: new Date().toISOString(),
    status: "open",
  };
  db.data.tasks.push(task);
  await db.write();
  return task;
}

export function listOpenTasks(): Task[] {
  return db.data.tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function getTask(id: string): Task | undefined {
  return db.data.tasks.find((t) => t.id === id);
}

export async function completeTask(id: string): Promise<boolean> {
  const task = db.data.tasks.find((t) => t.id === id);
  if (!task) return false;
  task.status = "done";
  await db.write();
  return true;
}

export async function cancelTask(id: string): Promise<boolean> {
  const task = db.data.tasks.find((t) => t.id === id);
  if (!task) return false;
  task.status = "cancelled";
  await db.write();
  return true;
}

export async function markTaskNudged(id: string, nudgedAtISO: string): Promise<void> {
  const task = db.data.tasks.find((t) => t.id === id);
  if (!task) return;
  task.lastNudgeAt = nudgedAtISO;
  await db.write();
}

export async function recordProgress(id: string, note: string): Promise<boolean> {
  const task = db.data.tasks.find((t) => t.id === id);
  if (!task) return false;
  const nowISO = new Date().toISOString();
  task.lastProgressNote = note;
  task.lastProgressAt = nowISO;
  task.lastNudgeAt = nowISO;
  await db.write();
  return true;
}

export function getTasksNeedingNudge(nowISO: string): Task[] {
  const today = fromISO(nowISO).format("YYYY-MM-DD");
  const soonThreshold = fromISO(nowISO).add(24, "hour").toISOString();

  return db.data.tasks.filter((t) => {
    if (t.status !== "open") return false;
    if (t.dueAt > soonThreshold) return false;
    if (t.lastNudgeAt && fromISO(t.lastNudgeAt).format("YYYY-MM-DD") === today) return false;
    return true;
  });
}
