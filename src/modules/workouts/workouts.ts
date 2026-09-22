import { type WorkoutExercise, type WorkoutSession, db, newId } from "../../storage/db.js";
import { fromISO, now } from "../../utils/time.js";

export interface CreateWorkoutInput {
  date: string;
  muscleGroup?: string;
  exercises: WorkoutExercise[];
  rawText?: string;
}

export async function createWorkoutSession(input: CreateWorkoutInput): Promise<WorkoutSession> {
  const session: WorkoutSession = {
    id: newId(),
    date: input.date,
    muscleGroup: input.muscleGroup,
    exercises: input.exercises,
    rawText: input.rawText,
    createdAt: new Date().toISOString(),
  };
  db.data.workouts.push(session);
  await db.write();
  return session;
}

export function listWorkoutSessions(period: "today" | "week" | "month" | "all"): WorkoutSession[] {
  const sorted = db.data.workouts.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (period === "all") return sorted;

  const today = now().startOf("day");
  const fromDay =
    period === "today" ? today : period === "week" ? today.subtract(6, "day") : today.subtract(29, "day");

  return sorted.filter((w) => !fromISO(w.date).isBefore(fromDay));
}

export interface ExerciseRecord {
  date: string;
  exercise: WorkoutExercise;
}

export function getExerciseHistory(exerciseName: string): ExerciseRecord[] {
  const needle = exerciseName.toLowerCase();
  const records: ExerciseRecord[] = [];
  for (const session of db.data.workouts) {
    for (const exercise of session.exercises) {
      if (exercise.name.toLowerCase().includes(needle)) {
        records.push({ date: session.date, exercise });
      }
    }
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

export function describeExercise(e: WorkoutExercise): string {
  const parts = [e.name];
  if (e.weightKg !== undefined) parts.push(`${e.weightKg}kg`);
  if (e.sets !== undefined && e.reps !== undefined) parts.push(`${e.sets}x${e.reps}`);
  if (e.notes) parts.push(`(${e.notes})`);
  return parts.join(" ");
}
