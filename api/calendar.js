module.exports = function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { title, date, time, location, description, uid } = req.query;
  if (!date) return res.status(400).send('Missing date parameter');

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time || '09:00').split(':').map(Number);
  const pad = n => String(n || 0).padStart(2, '0');

  const startStr = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;

  const endTotalMins = hour * 60 + minute + 120;
  const endH = Math.floor(endTotalMins / 60) % 24;
  const endM = endTotalMins % 60;
  const dayOverflow = endTotalMins >= 24 * 60 ? 1 : 0;
  const endDay = new Date(year, month - 1, day + dayOverflow);
  const endStr = `${endDay.getFullYear()}${pad(endDay.getMonth() + 1)}${pad(endDay.getDate())}T${pad(endH)}${pad(endM)}00`;

  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const eventUid = uid || `booking-${Date.now()}@theglambyankita.com`;
  const eventTitle = title || 'Makeup Appointment — The Glam by Ankita';
  const eventLocation = location || '';
  const eventDesc = (description || 'Booking with The Glam by Ankita').replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Glam by Ankita//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${eventUid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${eventTitle}`,
    eventLocation ? `LOCATION:${eventLocation}` : null,
    `DESCRIPTION:${eventDesc}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="glam-booking.ics"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(lines);
};
