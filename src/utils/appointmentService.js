import { get, push, ref, set } from "firebase/database";

const APPOINTMENT_TIME_PATTERN = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

export function parseAppointmentDateTime(appointmentData = {}) {
  const existingCheckup = appointmentData?.checkupDateTime ? new Date(appointmentData.checkupDateTime) : null;
  if (isValidDate(existingCheckup)) {
    return existingCheckup;
  }

  const appointmentDate = String(appointmentData?.appointmentDate || "").trim();
  const appointmentTime = String(appointmentData?.appointmentTime || "").trim();

  if (!appointmentDate) {
    return null;
  }

  const baseDate = new Date(`${appointmentDate}T00:00:00`);
  if (!isValidDate(baseDate)) {
    return null;
  }

  if (!appointmentTime) {
    return baseDate;
  }

  const matchedTime = appointmentTime.match(APPOINTMENT_TIME_PATTERN);
  if (matchedTime) {
    let hours = Number.parseInt(matchedTime[1], 10);
    const minutes = Number.parseInt(matchedTime[2], 10);
    const meridiem = matchedTime[3].toUpperCase();

    if (meridiem === "PM" && hours !== 12) {
      hours += 12;
    }

    if (meridiem === "AM" && hours === 12) {
      hours = 0;
    }

    const localDate = new Date(baseDate);
    localDate.setHours(hours, minutes, 0, 0);
    return isValidDate(localDate) ? localDate : null;
  }

  const directDate = new Date(`${appointmentDate}T${appointmentTime}`);
  return isValidDate(directDate) ? directDate : baseDate;
}

export function buildCheckupDateTime(appointmentData = {}) {
  const parsed = parseAppointmentDateTime(appointmentData);
  return parsed ? parsed.toISOString() : "";
}

export function formatAppointmentDateLabel(appointmentData = {}) {
  const appointmentDate = String(appointmentData?.appointmentDate || "").trim();
  if (appointmentDate) {
    const parsedDate = new Date(`${appointmentDate}T00:00:00`);
    if (isValidDate(parsedDate)) {
      return parsedDate.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    return appointmentDate;
  }

  const parsed = parseAppointmentDateTime(appointmentData);
  return parsed
    ? parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
}

export function formatAppointmentTimeLabel(appointmentData = {}) {
  const appointmentTime = String(appointmentData?.appointmentTime || "").trim();
  if (appointmentTime) {
    return appointmentTime;
  }

  const parsed = parseAppointmentDateTime(appointmentData);
  return parsed
    ? parsed.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}

export function formatAppointmentScheduleLabel(appointmentData = {}) {
  const dateLabel = formatAppointmentDateLabel(appointmentData);
  const timeLabel = formatAppointmentTimeLabel(appointmentData);

  if (dateLabel === "—" && timeLabel === "—") {
    return "Not scheduled yet";
  }

  if (dateLabel === "—") {
    return timeLabel;
  }

  if (timeLabel === "—") {
    return dateLabel;
  }

  return `${dateLabel} at ${timeLabel}`;
}

export function buildAppointmentStatusPayload(appointmentData = {}, nextStatus, options = {}) {
  const normalizedStatus = String(nextStatus || "pending").toLowerCase();
  const nowIso = options.nowIso || new Date().toISOString();
  const customDoctorMessage = String(options.doctorMessage || "").trim();
  const scheduleLabel = formatAppointmentScheduleLabel(appointmentData);

  let patientNotification = customDoctorMessage;
  if (!patientNotification) {
    if (normalizedStatus === "accepted") {
      patientNotification =
        scheduleLabel !== "Not scheduled yet"
          ? `Your appointment request was accepted for ${scheduleLabel}.`
          : "Your appointment request was accepted by doctor.";
    } else if (normalizedStatus === "rejected") {
      patientNotification = "Your appointment request was rejected by doctor.";
    } else {
      patientNotification = options.patientNotification || "";
    }
  }

  const payload = {
    status: normalizedStatus,
    patientNotification,
    patientNotificationSeen: false,
    respondedAt: nowIso,
  };

  if (normalizedStatus === "accepted") {
    payload.acceptedAt = nowIso;
    payload.doctorMessage =
      customDoctorMessage ||
      (scheduleLabel !== "Not scheduled yet"
        ? `Doctor accepted your request for ${scheduleLabel}.`
        : "Doctor accepted your appointment request.");

    const checkupDateTime = buildCheckupDateTime(appointmentData);
    if (checkupDateTime) {
      payload.checkupDateTime = checkupDateTime;
    }
  }

  if (normalizedStatus === "rejected") {
    payload.rejectedAt = nowIso;
    payload.doctorMessage = customDoctorMessage || "Doctor rejected your appointment request.";
  }

  return payload;
}

export async function createAppointment(database, appointmentData) {
  const appointmentsRef = ref(database, "appointments");
  const appointmentRef = push(appointmentsRef);
  const nowIso = new Date().toISOString();
  const checkupDateTime = appointmentData.checkupDateTime || buildCheckupDateTime(appointmentData);

  const payload = {
    ...appointmentData,
    status: appointmentData.status || "pending",
    createdAt: appointmentData.createdAt || nowIso,
    requestTime: appointmentData.requestTime || nowIso,
    ...(checkupDateTime ? { checkupDateTime } : {}),
  };

  await set(appointmentRef, payload);
  return appointmentRef.key;
}

export async function ensureAppointmentsRoot(database) {
  const appointmentsRef = ref(database, "appointments");
  const snapshot = await get(appointmentsRef);

  if (!snapshot.exists()) {
    await set(appointmentsRef, {});
  }
}
