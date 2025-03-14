export function formatDateToTimezone(date: Date | string, timezone: string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    
    // Get the UTC date components
    const utcYear = d.getUTCFullYear();
    const utcMonth = d.getUTCMonth();
    const utcDay = d.getUTCDate();
    const utcHours = d.getUTCHours();
    const utcMinutes = d.getUTCMinutes();

    // Create a new date using UTC components
    const localDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHours, utcMinutes));

    return localDate.toLocaleString('es-ES', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return new Date(date).toISOString();
  }
}