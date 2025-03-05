export function formatDateToTimezone(date: Date | string, timezone: string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('es-ES', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return new Date(date).toISOString();
  }
}