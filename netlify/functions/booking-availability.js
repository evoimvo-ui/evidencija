const SLOT_STEP_MINUTES = 15;
const DEFAULT_SERVICE_DURATION_MINUTES = 30;

const DEFAULT_WORKING_HOURS = {
  mon: { active: true, from: '09:00', to: '17:00' },
  tue: { active: true, from: '09:00', to: '17:00' },
  wed: { active: true, from: '09:00', to: '17:00' },
  thu: { active: true, from: '09:00', to: '17:00' },
  fri: { active: true, from: '09:00', to: '17:00' },
  sat: { active: false, from: '09:00', to: '17:00' },
  sun: { active: false, from: '09:00', to: '17:00' }
};

function getDayOfWeekSafe(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getWorkingDayDetails(dateString, userWorkingHours) {
  const dateObj = parseLocalDate(dateString);
  const dayOfWeek = getDayOfWeekSafe(dateString);
  const workingHours = { ...DEFAULT_WORKING_HOURS, ...(userWorkingHours || {}) };
  const dayKey = DAY_KEYS[dayOfWeek];

  return {
    dayOfWeek,
    dayKey,
    workingHours,
    dayHours: workingHours[dayKey]
  };
}

function timeToMinutes(timeString) {
  if (!timeString || typeof timeString !== 'string') return null;
  const [hours, minutes] = timeString.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function normalizeDurationMinutes(value, fallback = DEFAULT_SERVICE_DURATION_MINUTES) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : fallback;
}

function buildServiceDurationLookups(services) {
  const byId = {};
  const byName = {};

  for (const service of services || []) {
    const duration = normalizeDurationMinutes(service.trajanje_minuta);
    if (service.id) byId[service.id] = duration;
    if (service.name) byName[service.name] = duration;
  }

  return { byId, byName };
}

function getAppointmentDurationMinutes(appointment, serviceDurationLookups) {
  if (!appointment) return DEFAULT_SERVICE_DURATION_MINUTES;

  if (appointment.trajanje_minuta) {
    return normalizeDurationMinutes(appointment.trajanje_minuta);
  }

  if (appointment.serviceDuration) {
    return normalizeDurationMinutes(appointment.serviceDuration);
  }

  if (
    appointment.serviceId &&
    serviceDurationLookups &&
    serviceDurationLookups.byId &&
    serviceDurationLookups.byId[appointment.serviceId]
  ) {
    return serviceDurationLookups.byId[appointment.serviceId];
  }

  const serviceName = appointment.usluga || appointment.service;
  if (
    serviceName &&
    serviceDurationLookups &&
    serviceDurationLookups.byName &&
    serviceDurationLookups.byName[serviceName]
  ) {
    return serviceDurationLookups.byName[serviceName];
  }

  return DEFAULT_SERVICE_DURATION_MINUTES;
}

function getAppointmentIntervals(appointments, serviceDurationLookups) {
  return (appointments || [])
    .map((appointment) => {
      const startMinutes = timeToMinutes(appointment.vrijeme || appointment.time);
      if (startMinutes === null) return null;

      const durationMinutes = getAppointmentDurationMinutes(appointment, serviceDurationLookups);
      return {
        start: startMinutes,
        end: startMinutes + durationMinutes
      };
    })
    .filter(Boolean);
}

function generateAvailableStartTimes({
  dayHours,
  durationMinutes,
  appointments,
  serviceDurationLookups,
  stepMinutes = SLOT_STEP_MINUTES
}) {
  if (!dayHours || !dayHours.active || !dayHours.from || !dayHours.to) {
    return [];
  }

  const normalizedDuration = normalizeDurationMinutes(durationMinutes);
  const workStart = timeToMinutes(dayHours.from);
  const workEnd = timeToMinutes(dayHours.to);

  if (workStart === null || workEnd === null || workStart >= workEnd) {
    return [];
  }

  const existingIntervals = getAppointmentIntervals(appointments, serviceDurationLookups);
  const slots = [];

  for (
    let candidateStart = workStart;
    candidateStart + normalizedDuration <= workEnd;
    candidateStart += stepMinutes
  ) {
    const candidateEnd = candidateStart + normalizedDuration;
    const overlapsExisting = existingIntervals.some(
      (existing) => existing.start < candidateEnd && existing.end > candidateStart
    );

    if (!overlapsExisting) {
      slots.push(minutesToTime(candidateStart));
    }
  }

  return slots;
}

function isTimeSlotAvailable({
  dayHours,
  time,
  durationMinutes,
  appointments,
  serviceDurationLookups
}) {
  if (!dayHours || !dayHours.active || !dayHours.from || !dayHours.to) {
    return false;
  }

  const normalizedDuration = normalizeDurationMinutes(durationMinutes);
  const candidateStart = timeToMinutes(time);
  if (candidateStart === null) {
    return false;
  }

  const candidateEnd = candidateStart + normalizedDuration;
  const workStart = timeToMinutes(dayHours.from);
  const workEnd = timeToMinutes(dayHours.to);

  if (workStart === null || workEnd === null || candidateStart < workStart || candidateEnd > workEnd) {
    return false;
  }

  const existingIntervals = getAppointmentIntervals(appointments, serviceDurationLookups);
  const overlapsExisting = existingIntervals.some(
    (existing) => existing.start < candidateEnd && existing.end > candidateStart
  );

  return !overlapsExisting;
}

module.exports = {
  DEFAULT_WORKING_HOURS,
  SLOT_STEP_MINUTES,
  buildServiceDurationLookups,
  generateAvailableStartTimes,
  getWorkingDayDetails,
  isTimeSlotAvailable,
  getAppointmentIntervals,
  timeToMinutes
};
