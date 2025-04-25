export function formatDateToTimezone(date: Date | string, timezone: string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d); // Returns YYYY-MM-DD format
  } catch (error) {
    console.error('Error formatting date:', error);
    return new Date(date).toISOString().split('T')[0];
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
  try {
    // Make sure we have valid format dates
    if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/) || !endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD');
    }
    
    // Parse the date parts
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    
    // Ensure valid month values (JavaScript months are 0-indexed)
    const startMonthIndex = startMonth - 1;
    const endMonthIndex = endMonth - 1;
    
    // Create Date objects for start and end of day in UTC
    const startUTC = new Date(Date.UTC(startYear, startMonthIndex, startDay, 0, 0, 0));
    const endUTC = new Date(Date.UTC(endYear, endMonthIndex, endDay, 23, 59, 59, 999));
    
    return {
      start: startUTC.toISOString(),
      end: endUTC.toISOString()
    };
  } catch (error) {
    console.error('Error in getStartEndDatesInUTC:', error);
    throw error; // Re-throw to make debugging easier
  }
}

export function parseUTCToTimezone(utcDate: string, timezone: string): string {
  return getDateInTimezone(new Date(utcDate), timezone);
}