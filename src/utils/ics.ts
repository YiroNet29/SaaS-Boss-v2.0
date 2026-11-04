import { ImportantDate, ServiceLink, Product } from '../types';

/**
 * Generates an iCalendar (.ics) content string from important dates and service renewals.
 */
export function generateICS(
  dates: ImportantDate[],
  services: ServiceLink[],
  products: Product[],
  workspaceName: string
): string {
  const productMap = new Map<string, string>();
  for (const p of products) {
    productMap.set(p.id, p.name);
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//StackTrack//${workspaceName.replace(/[^a-zA-Z0-9]/g, '')}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:StackTrack - ${workspaceName}`,
    'X-WR-TIMEZONE:UTC',
  ];

  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Add Important Dates
  for (const d of dates) {
    if (d.status === 'done') continue;
    const dateStr = d.snoozedUntil || d.dueDate;
    if (!dateStr) continue;
    const cleanDate = dateStr.slice(0, 10).replace(/-/g, '');
    const prodName = d.productId ? productMap.get(d.productId) || 'Global' : 'Global';

    lines.push(
      'BEGIN:VEVENT',
      `UID:date-${d.id}@stacktrack.internal`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${cleanDate}`,
      `DTEND;VALUE=DATE:${cleanDate}`,
      `SUMMARY:[StackTrack] ${d.title} (${prodName})`,
      `DESCRIPTION:Type: ${d.type}\\nProduct: ${prodName}\\nRecurrence: ${d.recurrence}\\nNotes: ${d.notes || 'None'}`,
      'STATUS:CONFIRMED'
    );

    // Add alarm for default lead days (e.g. 7 days before)
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-P7D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: ${d.title} is due in 7 days`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  // Add Service Link renewals
  for (const s of services) {
    if (s.status === 'cancelled' || !s.renewalDate) continue;
    const cleanDate = s.renewalDate.slice(0, 10).replace(/-/g, '');
    const prodName = productMap.get(s.productId) || 'Product';

    lines.push(
      'BEGIN:VEVENT',
      `UID:service-${s.id}@stacktrack.internal`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${cleanDate}`,
      `DTEND;VALUE=DATE:${cleanDate}`,
      `SUMMARY:[Renewal] ${s.providerName} (${prodName})`,
      `DESCRIPTION:Provider: ${s.providerName}\\nPlan: ${s.plan}\\nCost: ${s.cost} ${s.currency}\\nAuto-renew: ${s.autoRenew ? 'Yes' : 'No'}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-P14D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Renewal Reminder: ${s.providerName} renews in 14 days`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Triggers a browser file download of the generated ICS calendar.
 */
export function downloadICS(content: string, filename: string = 'stacktrack-reminders.ics'): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
