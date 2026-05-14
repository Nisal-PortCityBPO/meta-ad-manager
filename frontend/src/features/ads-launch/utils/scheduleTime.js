export const INDONESIA_TIME_ZONE = 'Asia/Jakarta';
export const INDONESIA_TIME_ZONE_LABEL = 'Indonesia time (WIB, UTC+7)';
export const INDONESIA_UTC_OFFSET = '+07:00';
export const SCHEDULE_MIN_LEAD_MINUTES = 10;

export const hasExplicitTimezone = (value) => /(Z|[+-]\d{2}:?\d{2})$/i.test(String(value || '').trim());

const getDateTimeWithSeconds = (value) => {
  const normalizedValue = String(value || '').trim();
  return normalizedValue.length === 16 ? `${normalizedValue}:00` : normalizedValue;
};

const parseExplicitScheduleDate = (value) =>
  new Date(String(value || '').trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));

export const parseScheduleDate = (value) => {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return null;
  }

  if (hasExplicitTimezone(normalizedValue)) {
    return parseExplicitScheduleDate(normalizedValue);
  }

  return new Date(`${getDateTimeWithSeconds(normalizedValue)}${INDONESIA_UTC_OFFSET}`);
};

export const getIndonesiaDateTimeInputValue = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDONESIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .reduce((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

export const getMinimumScheduleStartValue = () =>
  getIndonesiaDateTimeInputValue(new Date(Date.now() + SCHEDULE_MIN_LEAD_MINUTES * 60 * 1000));

export const getScheduleValidationError = ({ scheduleStart, scheduleEnd } = {}) => {
  if ((scheduleStart && !scheduleEnd) || (!scheduleStart && scheduleEnd)) {
    return 'Schedule start and schedule end must both be set, or both left empty';
  }

  if (scheduleStart) {
    const start = parseScheduleDate(scheduleStart);
    const minimumStart = new Date(Date.now() + SCHEDULE_MIN_LEAD_MINUTES * 60 * 1000);

    if (!start || Number.isNaN(start.getTime())) {
      return 'Schedule start must be a valid date and time';
    }

    if (start < minimumStart) {
      return `Schedule start must be at least ${SCHEDULE_MIN_LEAD_MINUTES} minutes ahead in ${INDONESIA_TIME_ZONE_LABEL}`;
    }
  }

  if (scheduleEnd) {
    const start = parseScheduleDate(scheduleStart);
    const end = parseScheduleDate(scheduleEnd);

    if (!end || Number.isNaN(end.getTime())) {
      return 'Schedule end must be a valid date and time';
    }

    if (start && end <= start) {
      return 'Schedule end must be after schedule start';
    }

    if (end <= new Date()) {
      return `Schedule end must be in the future using ${INDONESIA_TIME_ZONE_LABEL}`;
    }
  }

  return '';
};

export const toSchedulePayloadValue = (value) => {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return '';
  }

  if (hasExplicitTimezone(normalizedValue)) {
    return normalizedValue;
  }

  return `${getDateTimeWithSeconds(normalizedValue)}${INDONESIA_UTC_OFFSET}`;
};

export const toDateTimeLocalInputValue = (value) => {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return '';
  }

  if (!hasExplicitTimezone(normalizedValue)) {
    return normalizedValue.slice(0, 16);
  }

  const date = parseExplicitScheduleDate(normalizedValue);
  return Number.isNaN(date.getTime()) ? '' : getIndonesiaDateTimeInputValue(date);
};
