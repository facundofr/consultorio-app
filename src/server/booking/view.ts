import type { ClientAppointmentView } from "@/components/public/appointment-details";
import { formatDateTime, utcToLocal } from "@/lib/time";
import type { PublicAppointmentView } from "./public";

/** Strip a public view down to what the browser needs (no ids, no dates as objects). */
export function toClientView(v: PublicAppointmentView): ClientAppointmentView {
  const local = utcToLocal(v.startsAt, v.timezone);
  return {
    code: v.code,
    status: v.status,
    when: v.when,
    date: local.date,
    time: local.time,
    professionalName: v.professionalName,
    specialtyName: v.specialtyName,
    serviceName: v.serviceName,
    location: v.location,
    clinic: { name: v.clinic.name, phone: v.clinic.phone, email: v.clinic.email },
    patientFirstName: v.patientFirstName,
    cancel: {
      allowed: v.cancel.allowed,
      reason: v.cancel.reason,
      deadlineText: formatDateTime(v.cancel.deadline, v.timezone),
      minHours: v.cancel.minHours,
    },
    outOfWindowMessage: v.outOfWindowMessage,
    rebookHref: v.rebookHref,
  };
}
