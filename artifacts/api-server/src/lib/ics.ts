export function buildIcs(opts: {
  uid: string;
  summary: string;
  date: string;
  time?: string;
  durationHours?: number;
  location?: string;
  description?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
  attendeeName?: string;
}): Buffer {
  const d = opts.date.replace(/-/g, "");
  const dtstamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const duration = opts.durationHours ?? 2;
  let dtstart: string;
  let dtend: string;

  if (opts.time) {
    const [h, m] = opts.time.split(":").map(Number);
    const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
    const totalEndMins = h * 60 + m + Math.round(duration * 60);
    const endH = Math.floor(totalEndMins / 60) % 24;
    const endM = totalEndMins % 60;
    dtstart = `DTSTART;TZID=Australia/Melbourne:${d}T${pad(h)}${pad(m)}00`;
    dtend   = `DTEND;TZID=Australia/Melbourne:${d}T${pad(endH)}${pad(endM)}00`;
  } else {
    const next = new Date(opts.date + "T00:00:00");
    next.setDate(next.getDate() + 1);
    const endD = next.toISOString().slice(0, 10).replace(/-/g, "");
    dtstart = `DTSTART;VALUE=DATE:${d}`;
    dtend   = `DTEND;VALUE=DATE:${endD}`;
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Glam by Ankita//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${dtstamp}`,
    dtstart,
    dtend,
    `SUMMARY:${opts.summary}`,
    "STATUS:CONFIRMED",
  ];

  if (opts.location) lines.push(`LOCATION:${opts.location}`);
  if (opts.description) {
    lines.push(`DESCRIPTION:${opts.description.replace(/[\r\n]+/g, "\\n").replace(/,/g, "\\,")}`);
  }
  if (opts.organizerEmail) {
    lines.push(`ORGANIZER;CN="The Glam by Ankita":MAILTO:${opts.organizerEmail}`);
  }
  if (opts.attendeeEmail) {
    lines.push(
      `ATTENDEE;CN="${opts.attendeeName || opts.attendeeEmail}";RSVP=FALSE:MAILTO:${opts.attendeeEmail}`
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return Buffer.from(lines.join("\r\n"), "utf8");
}
