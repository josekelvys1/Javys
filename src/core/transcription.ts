import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (!config.groqApiKey) {
    logger.warn("GROQ_API_KEY não configurada; não é possível transcrever áudio.");
    return null;
  }

  try {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), "audio.ogg");
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "pt");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.groqApiKey}` },
      body: form,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      logger.error({ status: response.status, errorBody }, "Groq recusou a transcrição do áudio.");
      return null;
    }

    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim();
    return text || null;
  } catch (err) {
    logger.error(err, "Erro chamando a API de transcrição da Groq.");
    return null;
  }
}
