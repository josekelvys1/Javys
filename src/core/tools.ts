import type Anthropic from "@anthropic-ai/sdk";
import {
  cancelAppointment,
  createAppointment,
  listUpcomingAppointments,
} from "../modules/agenda/appointments.js";
import {
  cancelReminder,
  createReminder,
  listPendingReminders,
} from "../modules/agenda/reminders.js";
import { sendText } from "../whatsapp/connection.js";
import { formatDateTime, parseLocalDateTime } from "../utils/time.js";
import {
  createPendingAction,
  getAwaitingActions,
  getPendingAction,
  resolvePendingAction,
} from "./confirmations.js";

export const tools: Anthropic.Tool[] = [
  {
    name: "create_reminder",
    description:
      'Cria um lembrete para o Dono. Use para pedidos como "me lembre de X às Y" ou "me avisa amanhã sobre Z". Ação de rotina, não precisa de confirmação.',
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Texto do lembrete" },
        due_at: {
          type: "string",
          description: "Data/hora local no formato YYYY-MM-DDTHH:mm, no fuso do Dono",
        },
      },
      required: ["text", "due_at"],
    },
  },
  {
    name: "list_reminders",
    description: "Lista os lembretes pendentes do Dono.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "cancel_reminder",
    description: "Cancela um lembrete pendente pelo id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "create_appointment",
    description: "Cria um compromisso/evento na agenda do Dono.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start_at: { type: "string", description: "Data/hora local YYYY-MM-DDTHH:mm" },
        end_at: {
          type: "string",
          description: "Data/hora local YYYY-MM-DDTHH:mm (opcional)",
        },
        location: { type: "string" },
        notes: { type: "string" },
      },
      required: ["title", "start_at"],
    },
  },
  {
    name: "list_appointments",
    description: "Lista os próximos compromissos agendados do Dono.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "cancel_appointment",
    description: "Cancela um compromisso pelo id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "propose_message_to_contact",
    description:
      "Rascunha uma mensagem para ser enviada a um terceiro pelo WhatsApp em nome do Dono. NUNCA envia direto — cria uma ação pendente que exige confirmação explícita do Dono. Escreva a mensagem em primeira pessoa, como se fosse o Dono escrevendo.",
    input_schema: {
      type: "object",
      properties: {
        contact_number: {
          type: "string",
          description:
            "Número de WhatsApp do destinatário, com DDI e DDD, apenas dígitos (ex: 5511999999999)",
        },
        contact_name: { type: "string", description: "Nome do contato, para exibir ao Dono" },
        message: { type: "string", description: "Texto da mensagem a enviar, em primeira pessoa" },
      },
      required: ["contact_number", "message"],
    },
  },
  {
    name: "list_pending_actions",
    description: "Lista ações que estão aguardando confirmação do Dono.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "confirm_pending_action",
    description:
      "Confirma e executa uma ação pendente (ex: enviar uma mensagem rascunhada) depois que o Dono autorizou explicitamente.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "cancel_pending_action",
    description: "Cancela uma ação pendente que o Dono não quer mais executar.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

export async function executeConfirmedAction(actionId: string): Promise<string> {
  const action = getPendingAction(actionId);
  if (!action) return "Não encontrei essa ação.";
  if (action.status !== "awaiting_confirmation") return "Essa ação já foi resolvida antes.";

  if (action.type === "send_message") {
    const { to, message } = action.payload as { to: string; message: string };
    await sendText(`${to}@s.whatsapp.net`, message);
    await resolvePendingAction(actionId, "confirmed");
    return `Mensagem enviada para ${to}.`;
  }

  await resolvePendingAction(actionId, "confirmed");
  return "Ação confirmada.";
}

export async function executeTool(name: string, input: any): Promise<string> {
  switch (name) {
    case "create_reminder": {
      const dueAt = parseLocalDateTime(input.due_at);
      const reminder = await createReminder(input.text, dueAt);
      return `Lembrete criado (id: ${reminder.id}) para ${formatDateTime(dueAt)}.`;
    }
    case "list_reminders": {
      const reminders = listPendingReminders();
      if (reminders.length === 0) return "Nenhum lembrete pendente.";
      return reminders.map((r) => `- [${r.id}] ${r.text} (${formatDateTime(r.dueAt)})`).join("\n");
    }
    case "cancel_reminder": {
      const ok = await cancelReminder(input.id);
      return ok ? "Lembrete cancelado." : "Não encontrei esse lembrete.";
    }
    case "create_appointment": {
      const startAt = parseLocalDateTime(input.start_at);
      const endAt = input.end_at ? parseLocalDateTime(input.end_at) : undefined;
      const appointment = await createAppointment({
        title: input.title,
        startAt,
        endAt,
        location: input.location,
        notes: input.notes,
      });
      return `Compromisso criado (id: ${appointment.id}) para ${formatDateTime(startAt)}.`;
    }
    case "list_appointments": {
      const appointments = listUpcomingAppointments(new Date().toISOString());
      if (appointments.length === 0) return "Nenhum compromisso futuro.";
      return appointments
        .map(
          (a) =>
            `- [${a.id}] ${a.title} (${formatDateTime(a.startAt)}${a.location ? ` @ ${a.location}` : ""})`,
        )
        .join("\n");
    }
    case "cancel_appointment": {
      const ok = await cancelAppointment(input.id);
      return ok ? "Compromisso cancelado." : "Não encontrei esse compromisso.";
    }
    case "propose_message_to_contact": {
      const digits = String(input.contact_number).replace(/\D/g, "");
      const action = await createPendingAction(
        "send_message",
        `Enviar mensagem para ${input.contact_name ?? digits}`,
        { to: digits, toName: input.contact_name, message: input.message },
      );
      return `Rascunho criado (id: ${action.id}). Aguardando confirmação do Dono antes de enviar:\n"${input.message}"`;
    }
    case "list_pending_actions": {
      const actions = getAwaitingActions();
      if (actions.length === 0) return "Nenhuma ação pendente.";
      return actions.map((a) => `- [${a.id}] ${a.description}`).join("\n");
    }
    case "confirm_pending_action":
      return executeConfirmedAction(input.id);
    case "cancel_pending_action": {
      const resolved = await resolvePendingAction(input.id, "cancelled");
      return resolved ? "Ação cancelada." : "Não encontrei essa ação.";
    }
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}
