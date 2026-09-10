import cron from "node-cron";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { formatDateTime, now } from "../../utils/time.js";
import { sendToOwner } from "../../whatsapp/connection.js";
import { listAppointmentsForDay } from "./appointments.js";
import { listDueReminders, markReminderSent } from "./reminders.js";

export function startReminderLoop(): void {
  setInterval(async () => {
    try {
      const due = listDueReminders(new Date().toISOString());
      for (const reminder of due) {
        await sendToOwner(`⏰ Lembrete: ${reminder.text}`);
        await markReminderSent(reminder.id);
      }
    } catch (err) {
      logger.error(err, "Erro checando lembretes.");
    }
  }, config.reminderCheckIntervalMs);
}

export function startMorningBriefing(): void {
  const [hour, minute] = config.morningBriefingTime.split(":").map(Number);
  const cronExpr = `${minute} ${hour} * * *`;

  cron.schedule(
    cronExpr,
    async () => {
      try {
        const today = now().format("YYYY-MM-DD");
        const appointments = listAppointmentsForDay(today);
        const lines = [`☀️ Bom dia! Aqui está o seu briefing de ${now().format("DD/MM")}:`];
        if (appointments.length === 0) {
          lines.push("Nenhum compromisso marcado para hoje.");
        } else {
          lines.push("Compromissos de hoje:");
          for (const a of appointments) {
            lines.push(
              `- ${formatDateTime(a.startAt)}: ${a.title}${a.location ? ` @ ${a.location}` : ""}`,
            );
          }
        }
        await sendToOwner(lines.join("\n"));
      } catch (err) {
        logger.error(err, "Erro gerando briefing matinal.");
      }
    },
    { timezone: config.timezone },
  );

  logger.info(`Briefing matinal agendado para ${config.morningBriefingTime} (${config.timezone}).`);
}
