import { type PendingAction, db, newId } from "../storage/db.js";

export async function createPendingAction(
  type: string,
  description: string,
  payload: Record<string, unknown>,
): Promise<PendingAction> {
  const action: PendingAction = {
    id: newId(),
    type,
    description,
    payload,
    createdAt: new Date().toISOString(),
    status: "awaiting_confirmation",
  };
  db.data.pendingActions.push(action);
  await db.write();
  return action;
}

export function getAwaitingActions(): PendingAction[] {
  return db.data.pendingActions.filter((a) => a.status === "awaiting_confirmation");
}

export function getPendingAction(id: string): PendingAction | undefined {
  return db.data.pendingActions.find((a) => a.id === id);
}

export async function resolvePendingAction(
  id: string,
  status: "confirmed" | "cancelled",
): Promise<PendingAction | undefined> {
  const action = getPendingAction(id);
  if (!action) return undefined;
  action.status = status;
  await db.write();
  return action;
}
