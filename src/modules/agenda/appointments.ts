import { type Appointment, db, newId } from "../../storage/db.js";
import { isSameLocalDay } from "../../utils/time.js";

export interface CreateAppointmentInput {
  title: string;
  startAt: string;
  endAt?: string;
  location?: string;
  notes?: string;
}

export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  const appointment: Appointment = {
    id: newId(),
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    location: input.location,
    notes: input.notes,
    createdAt: new Date().toISOString(),
    status: "scheduled",
  };
  db.data.appointments.push(appointment);
  await db.write();
  return appointment;
}

export function listUpcomingAppointments(fromISO: string): Appointment[] {
  return db.data.appointments
    .filter((a) => a.status === "scheduled" && a.startAt >= fromISO)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function listAppointmentsForDay(dayISO: string): Appointment[] {
  return db.data.appointments
    .filter((a) => a.status === "scheduled" && isSameLocalDay(a.startAt, dayISO))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function cancelAppointment(id: string): Promise<boolean> {
  const appointment = db.data.appointments.find((a) => a.id === id);
  if (!appointment) return false;
  appointment.status = "cancelled";
  await db.write();
  return true;
}
