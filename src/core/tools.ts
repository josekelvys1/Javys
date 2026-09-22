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
import {
  getAwaitingCheckIns,
  getProgress,
  listCheckInHistory,
  resolveCheckIn,
} from "../modules/habits/checkins.js";
import { describeFrequency } from "../modules/habits/frequency.js";
import { archiveHabit, createHabit, listActiveHabits } from "../modules/habits/habits.js";
import { sendText } from "../whatsapp/connection.js";
import { formatDateTime, parseLocalDateTime } from "../utils/time.js";
import {
  createPendingAction,
  getAwaitingActions,
  getPendingAction,
  resolvePendingAction,
} from "./confirmations.js";
import type { HabitFrequency } from "../storage/db.js";

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
  {
    name: "create_habit",
    description:
      'Cria um hábito recorrente de saúde/rotina do Dono (ex: "ir à academia" em dias fixos, "beber água" a cada X horas). Ação de rotina, não precisa de confirmação.',
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do hábito, ex: 'Ir à academia'" },
        frequency_kind: {
          type: "string",
          enum: ["weekly", "interval"],
          description:
            "'weekly' para dias fixos da semana (um ou mais horários por dia); 'interval' para repetir a cada X horas dentro de uma janela do dia.",
        },
        days_of_week: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 6 },
          description:
            "Obrigatório se frequency_kind='weekly'. Dias da semana, 0=domingo .. 6=sábado.",
        },
        times: {
          type: "array",
          items: { type: "string" },
          description:
            "Obrigatório se frequency_kind='weekly'. Horários locais HH:mm, ex: ['18:00']. Pode ter mais de um por dia.",
        },
        every_hours: {
          type: "number",
          description: "Obrigatório se frequency_kind='interval'. De quantas em quantas horas lembrar.",
        },
        active_from: {
          type: "string",
          description: "Obrigatório se frequency_kind='interval'. Início da janela, HH:mm.",
        },
        active_to: {
          type: "string",
          description: "Obrigatório se frequency_kind='interval'. Fim da janela, HH:mm.",
        },
        goal: {
          type: "string",
          description: "Meta descritiva opcional, ex: '2 litros por dia'. Apenas exibida, não calculada.",
        },
      },
      required: ["name", "frequency_kind"],
    },
  },
  {
    name: "list_habits",
    description: "Lista os hábitos ativos do Dono, com frequência e meta.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "archive_habit",
    description: "Arquiva um hábito pelo id, parando os lembretes dele.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "record_habit_checkin",
    description:
      'Registra que o Dono fez ou não fez um hábito, quando ele responde em linguagem livre (ex: "acabei de treinar") em vez do atalho direto "fiz"/"não fiz". Informe check_in_id se souber (via contexto de hábitos aguardando check-in), senão informe habit_name para tentar casar pelo nome.',
    input_schema: {
      type: "object",
      properties: {
        check_in_id: { type: "string", description: "Id do check-in aguardando resposta, se conhecido." },
        habit_name: { type: "string", description: "Nome (ou parte do nome) do hábito, se o id não for conhecido." },
        status: { type: "string", enum: ["done", "not_done"] },
      },
      required: ["status"],
    },
  },
  {
    name: "list_habit_history",
    description: "Lista o histórico recente de check-ins de um hábito específico.",
    input_schema: {
      type: "object",
      properties: { habit_id: { type: "string" } },
      required: ["habit_id"],
    },
  },
  {
    name: "get_habit_progress",
    description: "Mostra o progresso de check-ins do Dono (feitos vs esperados) no dia ou na semana, para todos os hábitos ativos.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["day", "week"] },
      },
      required: ["period"],
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
    case "create_habit": {
      let frequency: HabitFrequency;
      if (input.frequency_kind === "weekly") {
        if (!input.days_of_week?.length || !input.times?.length) {
          throw new Error("Para frequency_kind='weekly', informe days_of_week e times.");
        }
        frequency = { kind: "weekly", daysOfWeek: input.days_of_week, times: input.times };
      } else if (input.frequency_kind === "interval") {
        if (!input.every_hours || !input.active_from || !input.active_to) {
          throw new Error(
            "Para frequency_kind='interval', informe every_hours, active_from e active_to.",
          );
        }
        frequency = {
          kind: "interval",
          everyHours: input.every_hours,
          activeFrom: input.active_from,
          activeTo: input.active_to,
        };
      } else {
        throw new Error("frequency_kind deve ser 'weekly' ou 'interval'.");
      }

      const habit = await createHabit({ name: input.name, frequency, goal: input.goal });
      return `Hábito criado (id: ${habit.id}): ${habit.name} — ${describeFrequency(habit.frequency)}${habit.goal ? ` (meta: ${habit.goal})` : ""}.`;
    }
    case "list_habits": {
      const habits = listActiveHabits();
      if (habits.length === 0) return "Nenhum hábito ativo.";
      return habits
        .map(
          (h) =>
            `- [${h.id}] ${h.name} — ${describeFrequency(h.frequency)}${h.goal ? ` (meta: ${h.goal})` : ""}`,
        )
        .join("\n");
    }
    case "archive_habit": {
      const ok = await archiveHabit(input.id);
      return ok ? "Hábito arquivado." : "Não encontrei esse hábito.";
    }
    case "record_habit_checkin": {
      const awaiting = getAwaitingCheckIns();
      let checkIn = input.check_in_id
        ? awaiting.find((c) => c.id === input.check_in_id)
        : undefined;

      if (!checkIn && input.habit_name) {
        const needle = String(input.habit_name).toLowerCase();
        const matches = awaiting.filter((c) => {
          const habit = listActiveHabits().find((h) => h.id === c.habitId);
          return habit?.name.toLowerCase().includes(needle);
        });
        if (matches.length === 1) checkIn = matches[0];
      }

      if (!checkIn) {
        return "Não encontrei um check-in aguardando resposta para esse hábito. Use list_habits ou pergunte ao Dono qual hábito ele quer confirmar.";
      }

      await resolveCheckIn(checkIn.id, input.status);
      return input.status === "done" ? "Check-in registrado: feito! 💪" : "Check-in registrado: não feito.";
    }
    case "list_habit_history": {
      const history = listCheckInHistory(input.habit_id);
      if (history.length === 0) return "Nenhum check-in registrado para esse hábito ainda.";
      return history
        .map((c) => `- ${formatDateTime(c.dueAt)}: ${c.status}`)
        .join("\n");
    }
    case "get_habit_progress": {
      const progress = getProgress(input.period === "week" ? "week" : "day");
      if (progress.length === 0) return "Nenhum hábito ativo.";
      return progress.map((p) => `- ${p.habit.name}: ${p.done}/${p.expected}`).join("\n");
    }
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}
