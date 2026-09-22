import path from "node:path";
import {
  DisconnectReason,
  type WASocket,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  jidDecode,
  makeWASocket,
  normalizeMessageContent,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { config } from "../config/index.js";
import { transcribeAudio } from "../core/transcription.js";
import { logger } from "../utils/logger.js";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const ALLOWED_IMAGE_MEDIA_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export interface IncomingMessage {
  jid: string;
  text?: string;
  image?: { base64: string; mediaType: ImageMediaType; caption?: string };
}

export type IncomingHandler = (msg: IncomingMessage) => Promise<void>;

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
    // Log cru de todo evento que chega, antes de qualquer filtro — se isso
    // não aparecer no log ao mandar uma mensagem de teste, o problema está
    // na conexão/entrega (fora deste arquivo), não no filtro abaixo.
    logger.info(
      { type, count: messages.length },
      "Evento messages.upsert recebido.",
    );

    // O Baileys também entrega mensagens novas e legítimas com type "append"
    // (não só "notify") — por exemplo em algumas reconexões ou quando a
    // mensagem chega por um dispositivo vinculado. Descartar "append" fazia
    // o Jarvis ignorar mensagens de teste reais. Para não reprocessar
    // despejos de histórico antigo (que também podem vir como "append"),
    // exigimos que a mensagem seja recente nesse caso.
    if (type !== "notify" && type !== "append") {
      logger.info({ type }, "Evento ignorado: type diferente de 'notify'/'append'.");
      return;
    }

    for (const msg of messages) {
      const jid = msg.key.remoteJid;

      if (type === "append") {
        const timestamp = Number(msg.messageTimestamp ?? 0);
        const ageSeconds = Date.now() / 1000 - timestamp;
        if (!Number.isFinite(ageSeconds) || ageSeconds > 60) {
          logger.info(
            { jid, ageSeconds },
            "Evento ignorado: mensagem 'append' antiga (provável sincronização de histórico).",
          );
          continue;
        }
      }

      const content = normalizeMessageContent(msg.message);

      if (!content) {
        logger.info(
          { jid, fromMe: msg.key.fromMe },
          "Evento ignorado: mensagem sem conteúdo suportado (ex: notificação de sistema, reação).",
        );
        continue;
      }
      if (msg.key.fromMe) {
        logger.info({ jid }, "Evento ignorado: mensagem enviada pelo próprio Jarvis (fromMe).");
        continue;
      }
      if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") {
        logger.info({ jid }, "Evento ignorado: grupo ou status, não é conversa individual.");
        continue;
      }

      const jidAlt = msg.key.remoteJidAlt;
      const owner = isOwnerMessage(jid, jidAlt);
      if (!owner) {
        logger.info({ jid, jidAlt }, "Mensagem ignorada: remetente não é o Dono configurado.");
        continue;
      }

      try {
        if (content.audioMessage) {
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          const transcript = await transcribeAudio(
            buffer,
            content.audioMessage.mimetype ?? "audio/ogg",
          );
          if (!transcript) {
            await sendText(jid, "⚠️ Não consegui entender esse áudio. Pode repetir ou escrever?");
            continue;
          }
          await onMessage({ jid, text: transcript });
          continue;
        }

        if (content.imageMessage) {
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          const rawMimeType = content.imageMessage.mimetype ?? "image/jpeg";
          const mediaType = (
            ALLOWED_IMAGE_MEDIA_TYPES.has(rawMimeType) ? rawMimeType : "image/jpeg"
          ) as ImageMediaType;
          await onMessage({
            jid,
            image: {
              base64: buffer.toString("base64"),
              mediaType,
              caption: content.imageMessage.caption ?? undefined,
            },
          });
          continue;
        }

        const text =
          content.conversation ??
          content.extendedTextMessage?.text ??
          content.videoMessage?.caption;
        if (!text) {
          logger.info({ jid }, "Evento ignorado: mensagem sem texto (ex: figurinha, vídeo sem legenda).");
          continue;
        }

        await onMessage({ jid, text });
      } catch (err) {
        logger.error(err, "Erro ao processar mensagem recebida.");
      }
    }
  });
}
