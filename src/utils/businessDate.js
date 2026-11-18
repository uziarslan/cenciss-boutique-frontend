const validTime = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || ''));

export const getOutletBusinessDate = (outlet, instant = new Date()) => {
  const timezone = outlet?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi';
  const start = validTime(outlet?.businessDayStart) ? outlet.businessDayStart : '00:00';
  const end = validTime(outlet?.businessDayEnd) ? outlet.businessDayEnd : start;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const toMinutes = (value) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const previousDate = startMinutes === endMinutes
    ? currentMinutes < startMinutes
    : startMinutes > endMinutes && currentMinutes < endMinutes;
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (previousDate) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

export const resolveBusinessDate = (outlets, selectedOutlet, instant = new Date()) => {
  const outlet = outlets.find((item) => item._id === selectedOutlet) || outlets[0];
  return getOutletBusinessDate(outlet, instant);
};
