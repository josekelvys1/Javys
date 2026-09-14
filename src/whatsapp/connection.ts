import path from "node:path";
import {
  DisconnectReason,
  type WASocket,
  fetchLatestBaileysVersion,
  jidDecode,
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

// Números de celular brasileiros às vezes aparecem no JID com ou sem o 9º
// dígito, dependendo de como a conta foi registrada — aceitamos as duas formas.
function phoneVariants(number: string): string[] {
  const variants = new Set([number]);
  if (number.startsWith("55")) {
    const ddd = number.slice(2, 4);
    const rest = number.slice(4);
    if (rest.length === 9 && rest.startsWith("9")) variants.add(`55${ddd}${rest.slice(1)}`);
    if (rest.length === 8) variants.add(`55${ddd}9${rest}`);
  }
  return [...variants];
}

const ownerNumberVariants = new Set(phoneVariants(config.ownerNumber));

// Desde a v7, o Baileys pode endereçar uma conversa por LID (um id opaco,
// não o número de telefone) em vez do JID tradicional baseado em número.
// Quando isso acontece, o JID "de verdade" vem em `remoteJidAlt`. Por isso
// checamos tanto o jid principal quanto o alternativo antes de descartar
// uma mensagem como "não é do Dono".
function isOwnerNumberJid(jid: string | undefined): boolean {
  if (!jid) return false;
  const decoded = jidDecode(jid);
  if (!decoded || decoded.server !== "s.whatsapp.net") return false;
  return ownerNumberVariants.has(decoded.user);
}

export function isOwnerMessage(jid: string, jidAlt?: string): boolean {
  return isOwnerNumberJid(jid) || isOwnerNumberJid(jidAlt);
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

      const jidAlt = msg.key.remoteJidAlt;
      const owner = isOwnerMessage(jid, jidAlt);
      if (!owner) {
        logger.info({ jid, jidAlt }, "Mensagem ignorada: remetente não é o Dono configurado.");
      }

      try {
        await onMessage(jid, text, owner);
      } catch (err) {
        logger.error(err, "Erro ao processar mensagem recebida.");
      }
    }
  });
}
