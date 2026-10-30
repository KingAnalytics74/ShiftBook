const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const REST = { amberRun: 6, redRun: 7, amberHrs: 40, redHrs: 48 };

export const hasDayHrs = s => !!s && s.dayHours != null && s.dayHours !== "" && Number(s.dayHours) > 0;
export function worked(s) { return !!s && (!!s.sleepIn || hasDayHrs(s)); }

export function hours7(d, m) {
  let h = 0;
  for (let i = 0; i < 7; i++) { const s = m.get(ymd(addDays(d, -i))); if (hasDayHrs(s)) h += Math.max(0, Number(s.dayHours) - (Number(s.breakHrs) || 0)); }
  return Math.round(h * 10) / 10;
}

export function restDay(key, m) {
  const d = parse(key), s = m.get(key), hrs = hours7(d, m);
  if (!worked(s)) return { level: "off", run: 0, hrs7: hrs, reasons: [] };
  let run = 0; for (let k = d; worked(m.get(ymd(k))) && run < 90; k = addDays(k, -1)) run++;
  const prev = m.get(ymd(addDays(d, -1)));
  const reasons = []; let level = "ok";
  const up = l => { if (l === "red" || (l === "amber" && level === "ok")) level = l; };
  if (run >= REST.redRun) { up("red"); reasons.push(`${run} days in a row without a day off`); }
  else if (run >= REST.amberRun) { up("amber"); reasons.push(`${run} days in a row, so the next day should be off`); }
  if (hrs > REST.redHrs) { up("red"); reasons.push(`${hrs} hours worked in the last 7 days, over 48`); }
  else if (hrs > REST.amberHrs) { up("amber"); reasons.push(`${hrs} hours worked in the last 7 days`); }
  if (prev && prev.sleepIn && hasDayHrs(prev) && hasDayHrs(s)) { up("red"); reasons.push("day shift, sleep-in, then another day shift: about 36 hours on duty"); }
  else if (prev && prev.sleepIn && hasDayHrs(s)) { up("amber"); reasons.push("straight from a sleep-in onto a day shift"); }
  return { level, run, hrs7: hrs, reasons };
}