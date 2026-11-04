import { addDays } from "./dates.js";

// A pay period runs from the start day of one month to the day before it next month.
// startDay comes from the user's settings (default 26) and can be 1 to 31. In a month too short
// for the start day, the period starts on that month's last day (31 in February = 28th or 29th).
export function periodFor(d, k = 0, startDay = 26) {
    const sd = startDay || 26;
    const on = (yy, mm) => new Date(yy, mm, Math.min(sd, new Date(yy, mm + 1, 0).getDate()));
    let y = d.getFullYear(), m = d.getMonth();
    if (d.getDate() < on(y, m).getDate()) m -= 1;
    m += k;
    const start = on(y, m);
    const end = addDays(on(y, m + 1), -1);
    return { start, end };
}

export function daysIn(p) {
    const out = [];
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) out.push(d);
    return out;
}