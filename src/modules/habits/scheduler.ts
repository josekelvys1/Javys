import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { sendToOwner } from "../../whatsapp/connection.js";
import { createNotifiedCheckIn, getTodayCheckIns } from "./checkins.js";
import { getDueOccurrence } from "./frequency.js";
import { listActiveHabits } from "./habits.js";

export function startHabitReminderLoop(): void {
  setInterval(async () => {
    try {
      const nowISO = new Date().toISOString();
      for (const habit of listActiveHabits()) {
        const todayCheckIns = getTodayCheckIns(habit.id);
        const dueAt = getDueOccurrence(habit, todayCheckIns, nowISO);
        if (!dueAt) continue;

        const goalSuffix = habit.goal ? ` (meta: ${habit.goal})` : "";
        await sendToOwner(
          `🔔 Hábito: ${habit.name}${goalSuffix}\nFez? Responda "fiz" ou "não fiz".`,
        );
        await createNotifiedCheckIn(habit.id, dueAt);
      }
    } catch (err) {
      logger.error(err, "Erro checando hábitos.");
    }
  }, config.habitCheckIntervalMs);
}
