import path from "node:path";
import {
  DisconnectReason,
  type WASocket,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export type IncomingHandler = (jid: string, text: string, isOwner: boolean) => Promise<void>;

let sock: WASocket | undefined;
const baileysLogger = pino({ level: "silent" });

export function ownerJid(): string {
  return `${config.ownerNumber}@s.whatsapp.net`;
}

export function isOwnerJid(jid: string): boolean {
  return jid === ownerJid();
}

export async function sendText(jid: string, text: string): Promise<void> {
  if (!sock) throw new Error("WhatsApp ainda não está conectado.");
  await sock.sendMessage(jid, { text });
}

export async function sendToOwner(text: string): Promise<void> {
  await sendText(ownerJid(), text);
}

export async function startWhatsApp(onMessage: IncomingHandler): Promise<void> {
  const authDir = path.join(config.dataDir, "wa-auth");
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("Escaneie o QR code abaixo com o WhatsApp do número dedicado ao Jarvis:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      logger.info("Conectado ao WhatsApp.");
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn({ statusCode }, "Conexão com o WhatsApp encerrada.");
      if (shouldReconnect) {
        startWhatsApp(onMessage).catch((err) => logger.error(err, "Falha ao reconectar."));
      } else {
        logger.error(
          "Sessão do WhatsApp deslogada. Apague a pasta de autenticação e escaneie o QR novamente.",
        );
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;

      const text =
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        msg.message.imageMessage?.caption ??
        msg.message.videoMessage?.caption;
      if (!text) continue;

      try {
        await onMessage(jid, text, isOwnerJid(jid));
      } catch (err) {
        logger.error(err, "Erro ao processar mensagem recebida.");
      }
    }
  });
}
