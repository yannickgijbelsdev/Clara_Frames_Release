// Shared clock formatter used by the editor canvas (mirrors backend overlay JS).
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function formatClock(tz, format) {
  const parts = {};
  try {
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'UTC', hour12: false,
      year: 'numeric', month: 'long', day: '2-digit', weekday: 'long',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date()).forEach((p) => (parts[p.type] = p.value));
  } catch (e) {}
  const f = format || 'HH:mm:ss';
  return f
    .replace('dddd', parts.weekday || '')
    .replace('YYYY', parts.year || '')
    .replace('MMMM', parts.month || '')
    .replace('MM', String((MONTHS.indexOf(parts.month) + 1) || '').padStart(2, '0'))
    .replace('DD', parts.day || '')
    .replace('HH', parts.hour || '')
    .replace('mm', parts.minute || '')
    .replace('ss', parts.second || '');
}
