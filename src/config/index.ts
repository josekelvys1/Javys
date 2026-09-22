import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Copie .env.example para .env e preencha.`,
    );
  }
  return value;
}

export const config = {
  ownerNumber: required("OWNER_WHATSAPP_NUMBER").replace(/\D/g, ""),
  timezone: process.env.TIMEZONE || "America/Sao_Paulo",
  morningBriefingTime: process.env.MORNING_BRIEFING_TIME || "07:00",
  eveningChecklistTime: process.env.EVENING_CHECKLIST_TIME || "21:00",
  reminderCheckIntervalMs: Number(process.env.REMINDER_CHECK_INTERVAL_MS || 30000),
  habitCheckIntervalMs: Number(process.env.HABIT_CHECK_INTERVAL_MS || 60000),
  model: process.env.JARVIS_MODEL || "claude-opus-5",
  effort: (process.env.JARVIS_EFFORT || "medium") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max",
  groqApiKey: process.env.GROQ_API_KEY,
  dataDir: process.env.DATA_DIR || "./data",
  logLevel: process.env.LOG_LEVEL || "info",
};
