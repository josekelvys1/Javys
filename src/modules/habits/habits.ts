import { type Habit, type HabitFrequency, db, newId } from "../../storage/db.js";

export interface CreateHabitInput {
  name: string;
  frequency: HabitFrequency;
  goal?: string;
}

export async function createHabit(input: CreateHabitInput): Promise<Habit> {
  const habit: Habit = {
    id: newId(),
    name: input.name,
    frequency: input.frequency,
    goal: input.goal,
    createdAt: new Date().toISOString(),
    status: "active",
  };
  db.data.habits.push(habit);
  await db.write();
  return habit;
}

export function listActiveHabits(): Habit[] {
  return db.data.habits.filter((h) => h.status === "active");
}

export function getHabit(id: string): Habit | undefined {
  return db.data.habits.find((h) => h.id === id);
}

export async function archiveHabit(id: string): Promise<boolean> {
  const habit = db.data.habits.find((h) => h.id === id);
  if (!habit) return false;
  habit.status = "archived";
  await db.write();
  return true;
}
