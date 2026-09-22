import type { Habit, HabitCheckIn, HabitFrequency } from "../../storage/db.js";
import { fromISO, now } from "../../utils/time.js";

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function describeFrequency(frequency: HabitFrequency): string {
  if (frequency.kind === "weekly") {
    const days = frequency.daysOfWeek
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d])
      .join(", ");
    return `${days} às ${frequency.times.join(" e ")}`;
  }
  return `a cada ${frequency.everyHours}h, das ${frequency.activeFrom} às ${frequency.activeTo}`;
}

function todayAt(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return now().hour(hour).minute(minute).second(0).millisecond(0);
}

function dayAt(dayISO: string, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return fromISO(dayISO).hour(hour).minute(minute).second(0).millisecond(0);
}

/**
 * Retorna o dueAt (ISO) da próxima ocorrência já vencida e ainda sem
 * HabitCheckIn, ou null se nenhuma ocorrência estiver devida agora.
 */
export function getDueOccurrence(
  habit: Habit,
  todayCheckIns: HabitCheckIn[],
  nowISO: string,
): string | null {
  const current = fromISO(nowISO);

  if (habit.frequency.kind === "weekly") {
    const { daysOfWeek, times } = habit.frequency;
    if (!daysOfWeek.includes(current.day())) return null;

    for (const time of times) {
      const dueAt = todayAt(time);
      if (current.isBefore(dueAt)) continue;
      const dueAtISO = dueAt.toISOString();
      const alreadyNotified = todayCheckIns.some((c) => c.dueAt === dueAtISO);
      if (!alreadyNotified) return dueAtISO;
    }
    return null;
  }

  const { everyHours, activeFrom, activeTo } = habit.frequency;
  const windowStart = todayAt(activeFrom);
  const windowEnd = todayAt(activeTo);

  const last = todayCheckIns.slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt)).at(-1);
  const next = last ? fromISO(last.dueAt).add(everyHours, "hour") : windowStart;

  if (next.isAfter(windowEnd)) return null;
  if (current.isBefore(next)) return null;
  return next.toISOString();
}

export function expectedOccurrencesForDay(habit: Habit, dayISO: string): number {
  if (habit.frequency.kind === "weekly") {
    const { daysOfWeek, times } = habit.frequency;
    const dayOfWeek = fromISO(dayISO).day();
    return daysOfWeek.includes(dayOfWeek) ? times.length : 0;
  }

  const { everyHours, activeFrom, activeTo } = habit.frequency;
  const start = dayAt(dayISO, activeFrom);
  const end = dayAt(dayISO, activeTo);
  if (end.isBefore(start)) return 0;
  return Math.floor(end.diff(start, "hour", true) / everyHours) + 1;
}

export function expectedOccurrencesInRange(
  habit: Habit,
  fromDayISO: string,
  toDayISO: string,
): number {
  let total = 0;
  let cursor = fromISO(fromDayISO).startOf("day");
  const end = fromISO(toDayISO).startOf("day");
  while (!cursor.isAfter(end)) {
    total += expectedOccurrencesForDay(habit, cursor.toISOString());
    cursor = cursor.add(1, "day");
  }
  return total;
}
