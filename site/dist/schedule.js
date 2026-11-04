const ZONE = "Africa/Cairo";
const API = "https://api.aladhan.com/v1/calendarByCity/";
const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const keyOf = (year, month) => String(year) + "-" + String(month).padStart(2, "0");

export function cairoDate(time) {
  const parts = Object.fromEntries(calendar.formatToParts(time).map(({ type, value }) => [type, value]));
  return [parts.year, parts.month, parts.day].join("-");
}

export function relativeMonth(date, offset) {
  const [year, month] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  return keyOf(first.getUTCFullYear(), first.getUTCMonth() + 1);
}

export function prayerClock(time) {
  return clock.format(time).replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

export function parseMonth(payload, monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (payload?.code !== 200 || !Array.isArray(payload.data) || payload.data.length !== daysInMonth) {
    throw new Error("Incomplete AlAdhan month");
  }
  const days = {};
  for (const row of payload.data) {
    const [day, returnedMonth, returnedYear] = row.date.gregorian.date.split("-");
    const date = returnedYear + "-" + returnedMonth + "-" + day;
    const metadata = row.meta;
    if (!date.startsWith(monthKey + "-") || Number(day) < 1 || Number(day) > daysInMonth ||
        days[date] || metadata.timezone !== ZONE || metadata.method.id !== 5 || metadata.school !== "STANDARD") {
      throw new Error("Unexpected AlAdhan date or settings");
    }
    const starts = {};
    let last = -Infinity;
    for (const prayer of PRAYERS) {
      const field = prayer[0].toUpperCase() + prayer.slice(1);
      const stamp = row.timings[field];
      const instant = Date.parse(stamp);
      if (typeof stamp !== "string" || !stamp.startsWith(date + "T") || !Number.isFinite(instant) ||
          instant <= last || cairoDate(instant) !== date || clock.format(instant) !== stamp.slice(11, 16) ||
          metadata.offset[field] !== 0) {
        throw new Error("Invalid AlAdhan prayer time");
      }
      starts[prayer] = instant;
      last = instant;
    }
    days[date] = starts;
  }
  return days;
}

export function getSuggestion(now, today, yesterday) {
  if (!today) return null;
  for (const id of PRAYERS.slice().reverse()) {
    if (now >= today[id]) return { id, at: today[id] };
  }
  return yesterday ? { id: "isha", at: yesterday.isha } : null;
}

export async function fetchMonth(monthKey) {
  const [year, month] = monthKey.split("-");
  const query = new URLSearchParams({
    city: "Cairo", country: "Egypt", method: "5", school: "0", timezonestring: ZONE, iso8601: "true",
  });
  const response = await fetch(API + year + "/" + Number(month) + "?" + query, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("AlAdhan returned HTTP " + response.status);
  return parseMonth(await response.json(), monthKey);
}
