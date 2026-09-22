import { type Habit, type HabitCheckIn, db, newId } from "../../storage/db.js";
import { fromISO, now } from "../../utils/time.js";
import { expectedOccurrencesInRange } from "./frequency.js";
import { listActiveHabits } from "./habits.js";

export async function createNotifiedCheckIn(habitId: string, dueAtISO: string): Promise<HabitCheckIn> {
  const checkIn: HabitCheckIn = {
    id: newId(),
    habitId,
    dueAt: dueAtISO,
    status: "notified",
    notifiedAt: new Date().toISOString(),
  };
  db.data.habitCheckIns.push(checkIn);
  await db.write();
  return checkIn;
}

export function getAwaitingCheckIns(): HabitCheckIn[] {
  return db.data.habitCheckIns.filter((c) => c.status === "notified");
}

export function getCheckIn(id: string): HabitCheckIn | undefined {
  return db.data.habitCheckIns.find((c) => c.id === id);
}

export function getTodayCheckIns(habitId: string): HabitCheckIn[] {
  const today = now().format("YYYY-MM-DD");
  return db.data.habitCheckIns.filter(
    (c) => c.habitId === habitId && fromISO(c.dueAt).format("YYYY-MM-DD") === today,
  );
}

export async function resolveCheckIn(
  id: string,
  status: "done" | "not_done",
): Promise<HabitCheckIn | undefined> {
  const checkIn = getCheckIn(id);
  if (!checkIn) return undefined;
  checkIn.status = status;
  checkIn.respondedAt = new Date().toISOString();
  await db.write();
  return checkIn;
}

export function listCheckInHistory(habitId: string, limit = 20): HabitCheckIn[] {
  return db.data.habitCheckIns
    .filter((c) => c.habitId === habitId)
    .sort((a, b) => b.dueAt.localeCompare(a.dueAt))
    .slice(0, limit);
}

export interface HabitProgress {
  habit: Habit;
  done: number;
  expected: number;
}

export function getProgress(period: "day" | "week"): HabitProgress[] {
  const today = now().startOf("day");
  const fromDay = period === "day" ? today : today.subtract(6, "day");
  const fromDayISO = fromDay.toISOString();
  const toDayISO = today.toISOString();

  return listActiveHabits().map((habit) => {
    const done = db.data.habitCheckIns.filter(
      (c) =>
        c.habitId === habit.id &&
        c.status === "done" &&
        !fromISO(c.dueAt).isBefore(fromDay) &&
        !fromISO(c.dueAt).isAfter(today.endOf("day")),
    ).length;
    const expected = expectedOccurrencesInRange(habit, fromDayISO, toDayISO);
    return { habit, done, expected };
  });
}
