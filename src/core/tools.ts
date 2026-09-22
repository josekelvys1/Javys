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
import {
  createWorkoutSession,
  describeExercise,
  getExerciseHistory,
  listWorkoutSessions,
} from "../modules/workouts/workouts.js";
import {
  getAwaitingChecklist,
  listChecklistHistory,
  recordChecklistResponse,
} from "../modules/productivity/checklist.js";
import {
  activateFocusMode,
  deactivateFocusMode,
  getFocusMode,
} from "../modules/productivity/focusMode.js";
import {
  cancelTask,
  completeTask,
  createTask,
  listOpenTasks,
  recordProgress,
} from "../modules/productivity/tasks.js";
import {
  createCategory,
  listCategories,
  resolveOrCreateCategory,
} from "../modules/finance/categories.js";
import { getBudgetsStatus, listBudgets, setBudget } from "../modules/finance/budgets.js";
import {
  createTransaction,
  getCategoryHistory,
  getFinancialSummary,
  listTransactions,
  updateTransactionCategory,
} from "../modules/finance/transactions.js";
import { getCurrentBalance, setReferenceBalance } from "../modules/finance/balance.js";
import {
  cancelReceivable,
  createReceivable,
  listReceivables,
  markReceivableReceived,
} from "../modules/finance/receivables.js";
import {
  cancelPayable,
  createPayable,
  listPayables,
  markPayablePaid,
} from "../modules/finance/payables.js";
import {
  createRecurringItem,
  ensureCurrentMonthOccurrences,
  listRecurringItems,
  pauseRecurringItem,
} from "../modules/finance/recurringItems.js";
import {
  contributeToSavingsGoal,
  getSavingsGoalsProgress,
  setSavingsGoal,
} from "../modules/finance/savingsGoals.js";
import { getCashFlowProjection, getFinancialSnapshot } from "../modules/finance/snapshot.js";
import { sendText } from "../whatsapp/connection.js";
import { formatDateTime, fromISO, now, parseLocalDateTime } from "../utils/time.js";
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
  {
    name: "log_workout",
    description:
      'Registra uma sessão de treino que o Dono já fez, com os exercícios (ex: "treinei peito hoje: supino 40kg 4x10, crucifixo 12kg 3x12"). Extraia nome, peso, séries e repetições de cada exercício da mensagem. Ação de rotina, não precisa de confirmação.',
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Data do treino, YYYY-MM-DD. Se o Dono não especificar, use a data de hoje.",
        },
        muscle_group: {
          type: "string",
          description: "Grupo muscular geral da sessão, ex: 'peito', 'costas', 'perna'. Opcional.",
        },
        exercises: {
          type: "array",
          description: "Exercícios feitos na sessão.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              muscle_group: {
                type: "string",
                description: "Grupo muscular do exercício, se diferente do geral da sessão.",
              },
              weight_kg: { type: "number" },
              sets: { type: "integer" },
              reps: { type: "integer" },
              notes: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["exercises"],
    },
  },
  {
    name: "list_workouts",
    description: "Lista as sessões de treino registradas num período, para responder perguntas como 'o que treinei essa semana?'.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month", "all"] },
      },
      required: ["period"],
    },
  },
  {
    name: "get_exercise_history",
    description:
      "Retorna o histórico completo (data, peso, séries, repetições) de um exercício específico, do mais antigo pro mais recente. Use para responder 'qual foi minha última carga em X' (pegue o último item) ou 'como evoluiu meu X' (analise a lista inteira).",
    input_schema: {
      type: "object",
      properties: { exercise_name: { type: "string" } },
      required: ["exercise_name"],
    },
  },
  {
    name: "record_daily_checklist",
    description:
      "Registra a resposta do Dono ao checklist de fechamento do dia (o que fez, o que ficou pra trás, como foi a energia). Use SOMENTE quando houver um checklist aguardando resposta hoje (ver contexto) e a mensagem do Dono for claramente essa reflexão sobre o dia, não um comando qualquer.",
    input_schema: {
      type: "object",
      properties: { response: { type: "string", description: "Resposta do Dono, como ele escreveu." } },
      required: ["response"],
    },
  },
  {
    name: "list_daily_checklists",
    description: "Lista o histórico recente de checklists de fechamento do dia (respondidos ou não).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_task",
    description:
      'Cria uma tarefa com prazo para o Dono, ex: "preciso terminar o relatório até sexta". Converta o prazo mencionado para data/hora concreta. Ação de rotina, não precisa de confirmação.',
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        due_at: {
          type: "string",
          description: "Data/hora local do prazo, YYYY-MM-DDTHH:mm, no fuso do Dono",
        },
      },
      required: ["title", "due_at"],
    },
  },
  {
    name: "list_tasks",
    description: "Lista as tarefas abertas do Dono, ordenadas por prazo.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "complete_task",
    description: "Marca uma tarefa como concluída pelo id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "cancel_task",
    description: "Cancela uma tarefa pelo id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "update_task_progress",
    description:
      "Registra uma nota de andamento de uma tarefa, seja porque o Dono respondeu a uma cobrança ou avisou espontaneamente como está indo.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        note: { type: "string", description: "Resumo do andamento, ex: 'já fiz metade, falta a revisão'." },
      },
      required: ["id", "note"],
    },
  },
  {
    name: "activate_focus_mode",
    description:
      'Ativa o modo foco por um período, silenciando lembretes/hábitos/briefings/cobranças automáticas até o fim (o Dono ainda pode conversar normalmente). Ex: "ativa modo foco por 2 horas" -> duration_minutes: 120.',
    input_schema: {
      type: "object",
      properties: { duration_minutes: { type: "integer" } },
      required: ["duration_minutes"],
    },
  },
  {
    name: "deactivate_focus_mode",
    description: "Encerra o modo foco antes do prazo, se o Dono pedir.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_focus_status",
    description: "Consulta se o modo foco está ativo agora e até quando.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "log_transaction",
    description:
      'Registra uma transação financeira (entrada ou saída) que o Dono relatou, ex: "gastei 25 no lanche" ou "recebi 3000 de salário". Escolha a categoria (veja categorias existentes antes de inventar uma nova) e o tipo. Ação de rotina, não precisa de confirmação.',
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"] },
        amount: { type: "number", description: "Valor sempre positivo." },
        description: { type: "string" },
        category: {
          type: "string",
          description: "Nome de uma categoria existente (prefira reaproveitar) ou uma nova, se nenhuma existente fizer sentido.",
        },
        date: {
          type: "string",
          description: "Data/hora local YYYY-MM-DDTHH:mm. Se o Dono não especificar, use agora.",
        },
      },
      required: ["type", "amount", "description", "category"],
    },
  },
  {
    name: "list_transactions",
    description: "Lista transações registradas num período, opcionalmente filtradas por categoria e/ou tipo.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month", "all"] },
        category: { type: "string" },
        type: { type: "string", enum: ["income", "expense"] },
      },
      required: ["period"],
    },
  },
  {
    name: "update_transaction_category",
    description: "Corrige a categoria de uma transação já registrada, pelo id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, category: { type: "string" } },
      required: ["id", "category"],
    },
  },
  {
    name: "get_financial_summary",
    description:
      "Retorna total de entradas, saídas, saldo e detalhamento por categoria de gastos num período. Para 'month' inclui uma projeção simples de gasto total do mês com base no ritmo atual. Use antes de responder qualquer pergunta sobre quanto o Dono gastou/ganhou.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "week", "month", "all"] } },
      required: ["period"],
    },
  },
  {
    name: "get_category_history",
    description:
      "Retorna o total gasto por categoria em cada um dos últimos N meses (padrão 6). Use para identificar tendências, categoria que mais cresceu, ou embasar conselhos financeiros.",
    input_schema: {
      type: "object",
      properties: { months: { type: "integer" } },
      required: [],
    },
  },
  {
    name: "list_categories",
    description: "Lista as categorias financeiras existentes (padrão + criadas pelo Dono).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_category",
    description: "Cria uma nova categoria financeira explicitamente pedida pelo Dono, sem lançar uma transação ainda.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "set_budget",
    description: 'Define ou atualiza a meta mensal de gasto de uma categoria, ex: "quero gastar no máximo 300 com lanche por mês".',
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string" },
        monthly_limit: { type: "number" },
      },
      required: ["category", "monthly_limit"],
    },
  },
  {
    name: "list_budgets",
    description: "Lista as metas de gasto mensal configuradas por categoria, com o progresso do mês corrente.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "set_reference_balance",
    description:
      'Define o saldo de referência do Dono (ex: "meu saldo atual é 198,73"). A partir dessa data, o saldo real passa a ser esse valor + as transações registradas depois. Não conta como receita nos relatórios, só como ponto de partida.',
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        as_of: {
          type: "string",
          description: "Data/hora local YYYY-MM-DDTHH:mm a partir de quando esse saldo vale. Se omitido, usa agora.",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "get_current_balance",
    description:
      "Retorna o saldo REAL atual do Dono (saldo de referência + transações desde então). Use isso, não get_financial_summary, quando ele perguntar 'quanto eu tenho' ou 'qual meu saldo'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_receivable",
    description:
      'Cadastra um valor que ainda vai entrar mas não entrou (salário, pagamento de cliente etc.), ex: "vou receber 3000 de salário dia 5". Se o Dono disser que é recorrente (todo mês), use recurring: true — nesse caso o Javis já cria a ocorrência deste mês e projeta os próximos automaticamente, sem precisar cadastrar de novo.',
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string" },
        amount: { type: "number" },
        expected_date: { type: "string", description: "Data local YYYY-MM-DD (ou com hora) esperada." },
        category: { type: "string" },
        recurring: { type: "boolean", description: "true se repete todo mês (ex: salário)." },
      },
      required: ["description", "amount", "expected_date"],
    },
  },
  {
    name: "list_receivables",
    description: "Lista contas a receber pendentes (ou por outro status, se especificado).",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["pending", "received", "cancelled", "all"] } },
      required: [],
    },
  },
  {
    name: "mark_receivable_received",
    description: "Confirma que uma conta a receber caiu, movendo pra uma transação de entrada real.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        amount: { type: "number", description: "Valor real recebido, se diferente do previsto." },
        date: { type: "string", description: "Data/hora local do recebimento, se não for agora." },
      },
      required: ["id"],
    },
  },
  {
    name: "cancel_receivable",
    description: "Cancela uma conta a receber pendente que não vai mais acontecer.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "create_payable",
    description:
      'Cadastra uma conta a pagar (boleto, assinatura, parcela, dívida), ex: "tenho que pagar 150 de internet dia 10". Se for recorrente (todo mês), use recurring: true — o Javis já cria a ocorrência deste mês e projeta os próximos, além de avisar quando estiver perto do vencimento.',
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string" },
        amount: { type: "number" },
        due_date: { type: "string", description: "Data local YYYY-MM-DD (ou com hora) de vencimento." },
        category: { type: "string" },
        recurring: { type: "boolean", description: "true se repete todo mês (ex: aluguel, assinatura)." },
      },
      required: ["description", "amount", "due_date"],
    },
  },
  {
    name: "list_payables",
    description: "Lista contas a pagar pendentes (ou por outro status, se especificado), incluindo vencidas.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["pending", "paid", "cancelled", "all"] } },
      required: [],
    },
  },
  {
    name: "mark_payable_paid",
    description: "Confirma que uma conta a pagar foi paga, movendo pra uma transação de saída real.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        amount: { type: "number", description: "Valor real pago, se diferente do previsto." },
        date: { type: "string", description: "Data/hora local do pagamento, se não for agora." },
      },
      required: ["id"],
    },
  },
  {
    name: "cancel_payable",
    description: "Cancela uma conta a pagar pendente que não vai mais acontecer.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "list_recurring_items",
    description: "Lista os lançamentos recorrentes ativos (aluguel, assinaturas, salário etc.).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pause_recurring_item",
    description: "Pausa um lançamento recorrente (ex: assinatura cancelada) — ele para de gerar novas ocorrências.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "set_savings_goal",
    description:
      'Define uma meta de economia. kind "monthly" pra "quero economizar X por mês" (progresso = receita menos despesa do mês); kind "target" pra uma reserva a acumular no total, ex: reserva de emergência (progresso vai subindo conforme o Dono confirma contribuições).',
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["monthly", "target"] },
        target_amount: { type: "number" },
      },
      required: ["name", "kind", "target_amount"],
    },
  },
  {
    name: "contribute_to_savings_goal",
    description: 'Registra uma contribuição pra uma meta do tipo "target" (ex: reserva de emergência), ex: "guardei 200 pra reserva".',
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, amount: { type: "number" } },
      required: ["id", "amount"],
    },
  },
  {
    name: "get_cash_flow_projection",
    description:
      "Projeta o fluxo de caixa do mês corrente e (opcionalmente) dos próximos meses, considerando saldo atual, a receber, a pagar e recorrências. Use quando o Dono perguntar se vai sobrar ou faltar dinheiro.",
    input_schema: {
      type: "object",
      properties: { months_ahead: { type: "integer", description: "Quantos meses futuros incluir além do corrente. Padrão 1." } },
      required: [],
    },
  },
  {
    name: "get_financial_snapshot",
    description:
      'Monta um raio-x financeiro completo: saldo atual, resumo do mês, histórico de categorias (últimos 3 meses), contas a receber/pagar pendentes, progresso de metas de gasto e de economia. Use pra perguntas como "como estão minhas finanças" ou "faz um raio-x financeiro" — depois analise os dados retornados pra dar recomendações práticas, deixando claro que não é aconselhamento financeiro profissional.',
    input_schema: { type: "object", properties: {}, required: [] },
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
    case "log_workout": {
      const date = input.date ? parseLocalDateTime(`${input.date}T12:00`) : now().toISOString();
      const exercises = (input.exercises as any[]).map((e) => ({
        name: e.name,
        muscleGroup: e.muscle_group,
        weightKg: e.weight_kg,
        sets: e.sets,
        reps: e.reps,
        notes: e.notes,
      }));
      const session = await createWorkoutSession({
        date,
        muscleGroup: input.muscle_group,
        exercises,
      });
      return `Treino registrado (id: ${session.id}) em ${formatDateTime(date)}:\n${session.exercises.map((e) => `- ${describeExercise(e)}`).join("\n")}`;
    }
    case "list_workouts": {
      const sessions = listWorkoutSessions(input.period);
      if (sessions.length === 0) return "Nenhum treino registrado nesse período.";
      return sessions
        .map((s) => {
          const header = `${formatDateTime(s.date)}${s.muscleGroup ? ` — ${s.muscleGroup}` : ""}`;
          const lines = s.exercises.map((e) => `  - ${describeExercise(e)}`).join("\n");
          return `${header}\n${lines}`;
        })
        .join("\n");
    }
    case "get_exercise_history": {
      const history = getExerciseHistory(input.exercise_name);
      if (history.length === 0) return "Nenhum registro encontrado para esse exercício.";
      return history.map((r) => `- ${formatDateTime(r.date)}: ${describeExercise(r.exercise)}`).join("\n");
    }
    case "record_daily_checklist": {
      const awaiting = getAwaitingChecklist();
      if (!awaiting) return "Não há checklist aguardando resposta hoje.";
      await recordChecklistResponse(awaiting.id, input.response);
      return "Registrado! Bom descanso. 🌙";
    }
    case "list_daily_checklists": {
      const history = listChecklistHistory();
      if (history.length === 0) return "Nenhum checklist registrado ainda.";
      return history
        .map((c) => `- ${formatDateTime(c.sentAt)}: ${c.status === "answered" ? c.response : "(sem resposta)"}`)
        .join("\n");
    }
    case "create_task": {
      const dueAt = parseLocalDateTime(input.due_at);
      const task = await createTask(input.title, dueAt);
      return `Tarefa criada (id: ${task.id}): ${task.title}, prazo ${formatDateTime(dueAt)}.`;
    }
    case "list_tasks": {
      const tasks = listOpenTasks();
      if (tasks.length === 0) return "Nenhuma tarefa aberta.";
      return tasks
        .map(
          (t) =>
            `- [${t.id}] ${t.title} (prazo: ${formatDateTime(t.dueAt)})${t.lastProgressNote ? ` — último andamento: ${t.lastProgressNote}` : ""}`,
        )
        .join("\n");
    }
    case "complete_task": {
      const ok = await completeTask(input.id);
      return ok ? "Tarefa concluída! 🎉" : "Não encontrei essa tarefa.";
    }
    case "cancel_task": {
      const ok = await cancelTask(input.id);
      return ok ? "Tarefa cancelada." : "Não encontrei essa tarefa.";
    }
    case "update_task_progress": {
      const ok = await recordProgress(input.id, input.note);
      return ok ? "Andamento registrado." : "Não encontrei essa tarefa.";
    }
    case "activate_focus_mode": {
      const focus = await activateFocusMode(input.duration_minutes);
      return `Modo foco ativado até ${formatDateTime(focus.endsAt!)}. Só te procuro se você me chamar.`;
    }
    case "deactivate_focus_mode": {
      await deactivateFocusMode();
      return "Modo foco desativado.";
    }
    case "get_focus_status": {
      const focus = getFocusMode();
      return focus.active && focus.endsAt
        ? `Modo foco ativo até ${formatDateTime(focus.endsAt)}.`
        : "Modo foco inativo.";
    }
    case "log_transaction": {
      const date = input.date ? parseLocalDateTime(input.date) : now().toISOString();
      const category = await resolveOrCreateCategory(input.category);
      const { transaction, budgetAlert, anomalyAlert } = await createTransaction({
        type: input.type,
        amount: input.amount,
        description: input.description,
        category: category.name,
        date,
      });
      const lines = [
        `Transação registrada (id: ${transaction.id}): ${transaction.type === "income" ? "+" : "-"}R$${transaction.amount.toFixed(2)} — ${transaction.description} [${transaction.category}], ${formatDateTime(transaction.date)}.`,
      ];
      if (budgetAlert) lines.push(budgetAlert);
      if (anomalyAlert) lines.push(anomalyAlert);
      return lines.join("\n");
    }
    case "list_transactions": {
      const transactions = listTransactions(input.period, {
        category: input.category,
        type: input.type,
      });
      if (transactions.length === 0) return "Nenhuma transação encontrada nesse período.";
      return transactions
        .map(
          (t) =>
            `- [${t.id}] ${t.type === "income" ? "+" : "-"}R$${t.amount.toFixed(2)} ${t.description} [${t.category}] (${formatDateTime(t.date)})`,
        )
        .join("\n");
    }
    case "update_transaction_category": {
      const category = await resolveOrCreateCategory(input.category);
      const ok = await updateTransactionCategory(input.id, category.name);
      return ok ? `Categoria atualizada para ${category.name}.` : "Não encontrei essa transação.";
    }
    case "get_financial_summary": {
      const summary = getFinancialSummary(input.period);
      const lines = [
        `Entradas: R$${summary.totalIncome.toFixed(2)}`,
        `Saídas: R$${summary.totalExpense.toFixed(2)}`,
        `Saldo: R$${summary.balance.toFixed(2)}`,
      ];
      if (summary.projectedExpense !== undefined) {
        lines.push(`Projeção de gasto do mês (no ritmo atual): R$${summary.projectedExpense.toFixed(2)}`);
      }
      if (summary.byCategory.length > 0) {
        lines.push("Por categoria:");
        for (const c of summary.byCategory) {
          lines.push(`- ${c.category}: R$${c.total.toFixed(2)} (${c.count} lançamento(s))`);
        }
      }
      return lines.join("\n");
    }
    case "get_category_history": {
      const history = getCategoryHistory(input.months);
      return history
        .map((m) => {
          const byCategory = m.byCategory.map((c) => `${c.category}: R$${c.total.toFixed(2)}`).join(", ");
          return `${m.month}: ${byCategory || "sem gastos"}`;
        })
        .join("\n");
    }
    case "list_categories": {
      const categories = listCategories();
      return categories.map((c) => `- ${c.name}`).join("\n");
    }
    case "create_category": {
      const category = await createCategory(input.name);
      return `Categoria "${category.name}" pronta pra uso.`;
    }
    case "set_budget": {
      const budget = await setBudget(input.category, input.monthly_limit);
      return `Meta definida: até R$${budget.monthlyLimit.toFixed(2)}/mês em ${budget.category}.`;
    }
    case "list_budgets": {
      const statuses = getBudgetsStatus();
      if (statuses.length === 0) return "Nenhuma meta configurada.";
      return statuses
        .map(
          (b) =>
            `- ${b.category}: R$${b.spent.toFixed(2)} de R$${b.monthlyLimit.toFixed(2)} (${b.pct.toFixed(0)}%)`,
        )
        .join("\n");
    }
    case "set_reference_balance": {
      const asOf = input.as_of ? parseLocalDateTime(input.as_of) : undefined;
      const reference = await setReferenceBalance(input.amount, asOf);
      return `Saldo de referência definido: R$${reference.amount.toFixed(2)} a partir de ${formatDateTime(reference.asOf)}.`;
    }
    case "get_current_balance": {
      const current = getCurrentBalance();
      return `Saldo atual: R$${current.balance.toFixed(2)} (referência de R$${current.referenceAmount.toFixed(2)} em ${formatDateTime(current.asOf)} + transações desde então).`;
    }
    case "create_receivable": {
      const category = input.category ? (await resolveOrCreateCategory(input.category)).name : undefined;
      const expectedDate = parseLocalDateTime(
        input.expected_date.length <= 10 ? `${input.expected_date}T12:00` : input.expected_date,
      );
      if (input.recurring) {
        const dayOfMonth = fromISO(expectedDate).date();
        const item = await createRecurringItem({
          description: input.description,
          amount: input.amount,
          type: "income",
          category,
          dayOfMonth,
        });
        await ensureCurrentMonthOccurrences(new Date().toISOString());
        return `Recebimento recorrente criado: ${item.description}, R$${item.amount.toFixed(2)} todo dia ${dayOfMonth}.`;
      }
      const receivable = await createReceivable({
        description: input.description,
        amount: input.amount,
        expectedDate,
        category,
      });
      return `Conta a receber criada (id: ${receivable.id}): ${receivable.description}, R$${receivable.amount.toFixed(2)} em ${formatDateTime(receivable.expectedDate)}.`;
    }
    case "list_receivables": {
      const receivables = listReceivables(input.status ?? "pending");
      if (receivables.length === 0) return "Nenhuma conta a receber nesse status.";
      return receivables
        .map((r) => `- [${r.id}] ${r.description}: R$${r.amount.toFixed(2)} em ${formatDateTime(r.expectedDate)} (${r.status})`)
        .join("\n");
    }
    case "mark_receivable_received": {
      const date = input.date ? parseLocalDateTime(input.date) : undefined;
      const receivable = await markReceivableReceived(input.id, { amount: input.amount, date });
      return receivable
        ? `Recebimento confirmado: ${receivable.description}, R$${(input.amount ?? receivable.amount).toFixed(2)}.`
        : "Não encontrei essa conta a receber pendente.";
    }
    case "cancel_receivable": {
      const ok = await cancelReceivable(input.id);
      return ok ? "Conta a receber cancelada." : "Não encontrei essa conta a receber pendente.";
    }
    case "create_payable": {
      const category = input.category ? (await resolveOrCreateCategory(input.category)).name : undefined;
      const dueDate = parseLocalDateTime(input.due_date.length <= 10 ? `${input.due_date}T12:00` : input.due_date);
      if (input.recurring) {
        const dayOfMonth = fromISO(dueDate).date();
        const item = await createRecurringItem({
          description: input.description,
          amount: input.amount,
          type: "expense",
          category,
          dayOfMonth,
        });
        await ensureCurrentMonthOccurrences(new Date().toISOString());
        return `Conta recorrente criada: ${item.description}, R$${item.amount.toFixed(2)} todo dia ${dayOfMonth}.`;
      }
      const payable = await createPayable({
        description: input.description,
        amount: input.amount,
        dueDate,
        category,
      });
      return `Conta a pagar criada (id: ${payable.id}): ${payable.description}, R$${payable.amount.toFixed(2)} vencendo em ${formatDateTime(payable.dueDate)}.`;
    }
    case "list_payables": {
      const payables = listPayables(input.status ?? "pending");
      if (payables.length === 0) return "Nenhuma conta a pagar nesse status.";
      return payables
        .map((p) => `- [${p.id}] ${p.description}: R$${p.amount.toFixed(2)} vencendo em ${formatDateTime(p.dueDate)} (${p.status})`)
        .join("\n");
    }
    case "mark_payable_paid": {
      const date = input.date ? parseLocalDateTime(input.date) : undefined;
      const payable = await markPayablePaid(input.id, { amount: input.amount, date });
      return payable
        ? `Pagamento confirmado: ${payable.description}, R$${(input.amount ?? payable.amount).toFixed(2)}.`
        : "Não encontrei essa conta a pagar pendente.";
    }
    case "cancel_payable": {
      const ok = await cancelPayable(input.id);
      return ok ? "Conta a pagar cancelada." : "Não encontrei essa conta a pagar pendente.";
    }
    case "list_recurring_items": {
      const items = listRecurringItems();
      if (items.length === 0) return "Nenhum lançamento recorrente ativo.";
      return items
        .map((i) => `- [${i.id}] ${i.description}: ${i.type === "income" ? "+" : "-"}R$${i.amount.toFixed(2)} todo dia ${i.dayOfMonth}`)
        .join("\n");
    }
    case "pause_recurring_item": {
      const ok = await pauseRecurringItem(input.id);
      return ok ? "Lançamento recorrente pausado." : "Não encontrei esse lançamento recorrente.";
    }
    case "set_savings_goal": {
      const goal = await setSavingsGoal(input.name, input.kind, input.target_amount);
      return `Meta "${goal.name}" definida: ${goal.kind === "monthly" ? "economizar" : "acumular"} R$${goal.targetAmount.toFixed(2)}${goal.kind === "monthly" ? "/mês" : ""}.`;
    }
    case "contribute_to_savings_goal": {
      const goal = await contributeToSavingsGoal(input.id, input.amount);
      return goal
        ? `Contribuição registrada: ${goal.name} agora tem R$${goal.currentAmount.toFixed(2)} de R$${goal.targetAmount.toFixed(2)}.`
        : "Não encontrei essa meta.";
    }
    case "get_cash_flow_projection": {
      const projection = getCashFlowProjection(input.months_ahead ?? 1);
      return projection
        .map((p) => `- ${p.month}: +R$${p.projectedIncome.toFixed(2)} / -R$${p.projectedExpense.toFixed(2)} => saldo projetado R$${p.projectedBalance.toFixed(2)}`)
        .join("\n");
    }
    case "get_financial_snapshot": {
      return JSON.stringify(getFinancialSnapshot());
    }
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}
