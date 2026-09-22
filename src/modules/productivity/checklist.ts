import { type DailyChecklist, db, newId } from "../../storage/db.js";
import { now } from "../../utils/time.js";

export async function createSentChecklist(dateISO: string): Promise<DailyChecklist> {
  const checklist: DailyChecklist = {
    id: newId(),
    date: dateISO,
    sentAt: new Date().toISOString(),
    status: "sent",
  };
  db.data.dailyChecklists.push(checklist);
  await db.write();
  return checklist;
}

export function hasChecklistForToday(): boolean {
  const today = now().format("YYYY-MM-DD");
  return db.data.dailyChecklists.some((c) => c.date.startsWith(today));
}

export function getAwaitingChecklist(): DailyChecklist | undefined {
  return db.data.dailyChecklists
    .filter((c) => c.status === "sent")
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
}

export async function recordChecklistResponse(
  id: string,
  response: string,
): Promise<DailyChecklist | undefined> {
  const checklist = db.data.dailyChecklists.find((c) => c.id === id);
  if (!checklist) return undefined;
  checklist.status = "answered";
  checklist.response = response;
  checklist.respondedAt = new Date().toISOString();
  await db.write();
  return checklist;
}

export function listChecklistHistory(limit = 14): DailyChecklist[] {
  return db.data.dailyChecklists.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
