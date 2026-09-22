import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { formatDateTime, now } from "../utils/time.js";
import { listUpcomingAppointments } from "../modules/agenda/appointments.js";
import { listPendingReminders } from "../modules/agenda/reminders.js";
import { getAwaitingCheckIns, resolveCheckIn } from "../modules/habits/checkins.js";
import { getHabit } from "../modules/habits/habits.js";
import { getAwaitingChecklist } from "../modules/productivity/checklist.js";
import { getAwaitingActions, resolvePendingAction } from "./confirmations.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { executeConfirmedAction, executeTool, tools } from "./tools.js";

// Quando não há ANTHROPIC_API_KEY, assumimos autenticação via
// ANTHROPIC_AUTH_TOKEN (ex: token de `claude setup-token`, ligado à
// assinatura Claude Pro/Max). Esse modo exige o header beta abaixo para o
// backend tratar a requisição como autenticada por assinatura em vez de
// chave de API paga.
const client = new Anthropic(
  process.env.ANTHROPIC_API_KEY
    ? undefined
    : { defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" } },
);

const MAX_HISTORY_MESSAGES = 30;
const MAX_TOOL_ITERATIONS = 6;
const history: Anthropic.MessageParam[] = [];

const YES_RE = /^(sim|s|ok|confirmo|confirmado|confirma|pode mandar|manda|pode enviar|isso mesmo|correto)[.!]?$/i;
const NO_RE = /^(não|nao|n|cancela|cancelar|para|pera|perai|peraí|espera|deixa)[.!]?$/i;

const DONE_RE = /^(fiz|feito|consegui|pronto|bebi|treinei|sim|s|ok)[.!]?$/i;
const NOT_DONE_RE = /^(não fiz|nao fiz|não|nao|n|pulei|não deu|nao deu|esqueci)[.!]?$/i;

export interface ImageInput {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

function buildContextBlock(): string {
  const nowStr = now().format("dddd, DD/MM/YYYY HH:mm");
  const reminders =
    listPendingReminders()
      .slice(0, 5)
      .map((r) => `- ${r.text} (${formatDateTime(r.dueAt)})`)
      .join("\n") || "Nenhum.";
  const appointments =
    listUpcomingAppointments(new Date().toISOString())
      .slice(0, 5)
      .map((a) => `- ${a.title} (${formatDateTime(a.startAt)})`)
      .join("\n") || "Nenhum.";
  const pending =
    getAwaitingActions()
      .slice(0, 5)
      .map((a) => `- [${a.id}] ${a.description}`)
      .join("\n") || "Nenhuma.";
  const awaitingCheckIns =
    getAwaitingCheckIns()
      .slice(0, 5)
      .map((c) => `- [${c.id}] ${getHabit(c.habitId)?.name ?? "hábito desconhecido"}`)
      .join("\n") || "Nenhum.";
  const checklist = getAwaitingChecklist()
    ? "Aguardando resposta (se a próxima mensagem do Dono parecer uma reflexão sobre o dia, chame record_daily_checklist)."
    : "Nenhum aguardando hoje.";

  return `CONTEXTO ATUAL (uso interno, não repita isso cru para o Dono)
Agora: ${nowStr} (${config.timezone})
Próximos lembretes:
${reminders}
Próximos compromissos:
${appointments}
Ações aguardando confirmação:
${pending}
Hábitos aguardando check-in (fiz/não fiz):
${awaitingCheckIns}
Checklist de fechamento do dia:
${checklist}`;
}

function pushHistory(entry: Anthropic.MessageParam): void {
  history.push(entry);
  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES);
  }
}

async function runAgentTurn(userText: string, image?: ImageInput): Promise<string> {
  const content: Anthropic.MessageParam["content"] = image
    ? [
        {
          type: "image",
          source: { type: "base64", media_type: image.mediaType, data: image.base64 },
        },
        {
          type: "text",
          text:
            userText ||
            "O Dono mandou essa imagem sem legenda. Descreva o que reconhece e aja com contexto (ex: se for recibo/extrato/print financeiro, sugira ou registre o gasto); se não ficar claro o propósito, pergunte o que ele quer fazer com ela.",
        },
      ]
    : userText;
  pushHistory({ role: "user", content });

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } },
    { type: "text", text: buildContextBlock() },
  ];

  let finalText = "";

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system,
      tools,
      messages: history,
      output_config: { effort: config.effort },
    });

    pushHistory({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") {
      continue;
    }

    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (textBlocks.length) finalText = textBlocks.map((b) => b.text).join("\n");

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      try {
        const result = await executeTool(use.name, use.input);
        toolResults.push({ type: "tool_result", tool_use_id: use.id, content: result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: message,
          is_error: true,
        });
      }
    }
    pushHistory({ role: "user", content: toolResults });
  }

  return finalText || "Feito.";
}

export async function handleOwnerMessage(text: string, image?: ImageInput): Promise<string> {
  const trimmed = text.trim();

  // Atalhos determinísticos só fazem sentido pra texto puro — uma imagem
  // sempre vai pro modelo, mesmo que venha com legenda "sim"/"fiz".
  if (!image) {
    const awaiting = getAwaitingActions();

    // Fast path: exactly one pending confirmation and a clear yes/no reply -
    // resolve deterministically without a model round-trip.
    if (awaiting.length === 1) {
      if (YES_RE.test(trimmed)) {
        const result = await executeConfirmedAction(awaiting[0].id);
        pushHistory({ role: "user", content: trimmed });
        pushHistory({ role: "assistant", content: result });
        return result;
      }
      if (NO_RE.test(trimmed)) {
        await resolvePendingAction(awaiting[0].id, "cancelled");
        const result = "Ok, cancelado.";
        pushHistory({ role: "user", content: trimmed });
        pushHistory({ role: "assistant", content: result });
        return result;
      }
    }

    // Fast path: exatamente um check-in de hábito aguardando resposta e uma
    // réplica clara de fiz/não fiz - resolve direto, sem passar pelo modelo.
    const awaitingCheckIns = getAwaitingCheckIns();
    if (awaitingCheckIns.length === 1) {
      const checkIn = awaitingCheckIns[0];
      const habitName = getHabit(checkIn.habitId)?.name ?? "hábito";
      if (DONE_RE.test(trimmed)) {
        await resolveCheckIn(checkIn.id, "done");
        const result = `Show, ${habitName} marcado como feito! 💪`;
        pushHistory({ role: "user", content: trimmed });
        pushHistory({ role: "assistant", content: result });
        return result;
      }
      if (NOT_DONE_RE.test(trimmed)) {
        await resolveCheckIn(checkIn.id, "not_done");
        const result = `Ok, marquei ${habitName} como não feito.`;
        pushHistory({ role: "user", content: trimmed });
        pushHistory({ role: "assistant", content: result });
        return result;
      }
    }
  }

  try {
    return await runAgentTurn(trimmed, image);
  } catch (err) {
    logger.error(err, "Erro ao processar mensagem com Claude.");
    return "Deu um erro aqui do meu lado processando isso. Tenta de novo?";
  }
}
