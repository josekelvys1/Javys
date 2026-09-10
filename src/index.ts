import { handleOwnerMessage } from "./core/jarvis.js";
import { startReminderLoop, startMorningBriefing } from "./modules/agenda/scheduler.js";
import { logger } from "./utils/logger.js";
import { sendToOwner, startWhatsApp } from "./whatsapp/connection.js";

async function main(): Promise<void> {
  logger.info("Iniciando o Jarvis...");

  await startWhatsApp(async (jid, text, isOwner) => {
    if (!isOwner) {
      logger.debug({ jid }, "Mensagem ignorada (não é do Dono).");
      return;
    }
    logger.info({ text }, "Mensagem recebida do Dono.");
    const reply = await handleOwnerMessage(text);
    await sendToOwner(reply);
  });

  startReminderLoop();
  startMorningBriefing();

  logger.info("Jarvis pronto. Aguardando mensagens no WhatsApp.");
}

main().catch((err) => {
  logger.error(err, "Falha fatal ao iniciar o Jarvis.");
  process.exit(1);
});
