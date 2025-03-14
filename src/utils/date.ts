export function formatDateToTimezone(date: Date | string, timezone: string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
  } catch (error) {
    console.error('Error formatting date:', error);
    return new Date(date).toISOString();
  }
}

export function getDateInTimezone(date: Date | string, timezone: string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    const formatter = new Intl.DateTimeFormat('en-CA', { 
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d); // Returns YYYY-MM-DD format
  } catch (error) {
    console.error('Error getting date in timezone:', error);
    return new Date(date).toISOString().split('T')[0];
  }
}

export function getStartEndDatesInUTC(startDate: string, endDate: string, timezone: string): { start: string, end: string } {
  // Create dates at start and end of the day in the specified timezone
  const startDateTime = new Date(`${startDate}T00:00:00`);
  const endDateTime = new Date(`${endDate}T23:59:59.999`);

  // Convert to UTC strings
  const start = new Date(startDateTime.toLocaleString('en-US', { timeZone: timezone })).toISOString();
  const end = new Date(endDateTime.toLocaleString('en-US', { timeZone: timezone })).toISOString();

  return { start, end };
}

export function parseUTCToTimezone(utcDate: string, timezone: string): string {
  return getDateInTimezone(new Date(utcDate), timezone);
}