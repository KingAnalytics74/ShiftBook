const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function periodFor(d, k = 0, startDay = 26) {
    const sd = startDay || 26;
    let y = d.getFullYear(), m = d.getMonth();
    if (d.getDate() < sd) m -= 1;
    m += k;
    const start = new Date(y, m, sd);
    const end = addDays(new Date(y, m + 1, sd), -1);
    return { start, end };
}

export function daysIn(p) {
    const out = [];
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) out.push(d);
    return out;
}