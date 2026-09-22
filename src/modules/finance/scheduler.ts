import { config } from "../../config/index.js";
import { isFocusModeActive } from "../productivity/focusMode.js";
import { logger } from "../../utils/logger.js";
import { formatDateTime } from "../../utils/time.js";
import { sendToOwner } from "../../whatsapp/connection.js";
import { getPayablesNeedingReminder, markPayableReminded } from "./payables.js";
import { ensureCurrentMonthOccurrences } from "./recurringItems.js";

export function startFinanceScheduler(): void {
  setInterval(async () => {
    try {
      if (isFocusModeActive()) return;

      const nowISO = new Date().toISOString();
      await ensureCurrentMonthOccurrences(nowISO);

      for (const payable of getPayablesNeedingReminder(nowISO)) {
        const isOverdue = payable.dueDate < nowISO;
        const label = isOverdue ? "venceu" : "vence em breve";
        await sendToOwner(
          `💳 Conta ${label}: ${payable.description} — R$${payable.amount.toFixed(2)}, vencimento ${formatDateTime(payable.dueDate)}.`,
        );
        await markPayableReminded(payable.id, nowISO);
      }
    } catch (err) {
      logger.error(err, "Erro no scheduler financeiro.");
    }
  }, config.habitCheckIntervalMs);
}
