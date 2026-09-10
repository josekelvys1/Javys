import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import "dayjs/locale/pt-br.js";
import { config } from "../config/index.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("pt-br");

export function now() {
  return dayjs().tz(config.timezone);
}

export function formatDateTime(iso: string): string {
  return dayjs(iso).tz(config.timezone).format("DD/MM/YYYY HH:mm");
}

export function parseLocalDateTime(value: string): string {
  const parsed = dayjs.tz(value, config.timezone);
  if (!parsed.isValid()) {
    throw new Error(`Data/hora inválida: ${value}`);
  }
  return parsed.toISOString();
}

export function isSameLocalDay(iso: string, dayISO: string): boolean {
  return dayjs(iso).tz(config.timezone).format("YYYY-MM-DD") === dayISO;
}
