import { type FocusMode, db } from "../../storage/db.js";

export async function activateFocusMode(durationMinutes: number): Promise<FocusMode> {
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
  db.data.focusMode = {
    active: true,
    startedAt: startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
  await db.write();
  return db.data.focusMode;
}

export async function deactivateFocusMode(): Promise<void> {
  db.data.focusMode = { active: false };
  await db.write();
}

export function getFocusMode(): FocusMode {
  return db.data.focusMode;
}

export function isFocusModeActive(nowISO: string = new Date().toISOString()): boolean {
  const fm = db.data.focusMode;
  return Boolean(fm.active && fm.endsAt && fm.endsAt > nowISO);
}

/**
 * Se o modo foco estava ativo e já passou do endsAt, desativa e retorna true
 * (usado pelo scheduler pra avisar o fim do modo foco exatamente uma vez).
 */
export async function checkFocusModeExpired(nowISO: string = new Date().toISOString()): Promise<boolean> {
  const fm = db.data.focusMode;
  if (fm.active && fm.endsAt && fm.endsAt <= nowISO) {
    await deactivateFocusMode();
    return true;
  }
  return false;
}
