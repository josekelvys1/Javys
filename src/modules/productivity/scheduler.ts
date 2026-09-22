import cron from "node-cron";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { formatDateTime, now } from "../../utils/time.js";
import { sendToOwner } from "../../whatsapp/connection.js";
import { createSentChecklist, hasChecklistForToday } from "./checklist.js";
import { checkFocusModeExpired, isFocusModeActive } from "./focusMode.js";
import { getTasksNeedingNudge, markTaskNudged } from "./tasks.js";

export function startEveningChecklistLoop(): void {
  const [hour, minute] = config.eveningChecklistTime.split(":").map(Number);
  const cronExpr = `${minute} ${hour} * * *`;

  cron.schedule(
    cronExpr,
    async () => {
      try {
        if (isFocusModeActive() || hasChecklistForToday()) return;
        await sendToOwner(
          "🌙 Fechamento do dia: o que você fez hoje, o que ficou pra trás e como foi sua energia/produtividade?",
        );
        await createSentChecklist(now().toISOString());
      } catch (err) {
        logger.error(err, "Erro enviando checklist noturno.");
      }
    },
    { timezone: config.timezone },
  );

  logger.info(`Checklist noturno agendado para ${config.eveningChecklistTime} (${config.timezone}).`);
}

export function startTaskNudgeLoop(): void {
  setInterval(async () => {
    try {
      if (isFocusModeActive()) return;
      const nowISO = new Date().toISOString();
      for (const task of getTasksNeedingNudge(nowISO)) {
        await sendToOwner(
          `📋 Como está indo a tarefa "${task.title}"? Prazo: ${formatDateTime(task.dueAt)}.`,
        );
        await markTaskNudged(task.id, nowISO);
      }
    } catch (err) {
      logger.error(err, "Erro cobrando progresso de tarefas.");
    }
  }, config.habitCheckIntervalMs);
}

export function startFocusModeWatcher(): void {
  setInterval(async () => {
    try {
      const justExpired = await checkFocusModeExpired(new Date().toISOString());
      if (justExpired) {
        await sendToOwner("🎯 Modo foco encerrado.");
      }
    } catch (err) {
      logger.error(err, "Erro checando expiração do modo foco.");
    }
  }, config.habitCheckIntervalMs);
}
