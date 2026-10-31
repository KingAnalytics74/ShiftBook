// 2026/27 rates (England, Wales & NI): personal allowance £12,570; basic rate 20% on next £37,700, 40% above;
// employee NI 8% from £1,048/month to £4,189/month, 2% above; self-employed Class 4 6% / 2%;
// auto-enrolment qualifying earnings £520–£4,189/month; student loan monthly thresholds below.
export const R = {
    FREE_M: 1048.25, ADD_M: 125140 / 12, PA: 12570, BASIC: 37700, PT_M: 1048, UEL_M: 4189, QE_LO_M: 520, QE_HI_M: 4189,
    SL: { p1: [2241, 0.09], p2: [2448, 0.09], p4: [2816, 0.09], p5: [2083, 0.09], pg: [1750, 0.06] }
};

// Tax codes: number + L/M/N/T (allowance = number x 10 + 9 a year), K codes (amount added to pay),
// BR / D0 / D1 (one flat rate), 0T (no allowance), NT (no tax). S = Scotland, C = Wales; W1/M1/X = emergency.
export function parseTaxCode(raw) {
    const c = String(raw || "1257L").toUpperCase().replace(/\s+/g, "").replace(/(W1|M1|X)$/, "");
    const region = /^S/.test(c) ? "scotland" : /^C/.test(c) ? "wales" : "ruk", body = c.replace(/^[SC](?=\d|K|BR|D0|D1|NT|0T)/, "");
    if (body === "BR") return { ok: true, kind: "flat", rate: 0.2, region };
    if (body === "D0") return { ok: true, kind: "flat", rate: 0.4, region };
    if (body === "D1") return { ok: true, kind: "flat", rate: 0.45, region };
    if (body === "NT") return { ok: true, kind: "none", region };
    if (body === "0T") return { ok: true, kind: "std", freeM: 0, region };
    let m = body.match(/^K(\d{1,4})$/);
    if (m) return { ok: true, kind: "std", freeM: -(Number(m[1]) * 10 + 9) / 12, k: true, region };
    m = body.match(/^(\d{1,4})[LMNT]$/);
    if (m) return { ok: true, kind: "std", freeM: (Number(m[1]) * 10 + 9) / 12, region };
    return { ok: false, kind: "std", freeM: R.FREE_M, region: "ruk" };
}

// g = gross pay for one month. mc = the user's money settings
// ({ employment, taxCode, pensionPct, studentLoan }). Returns tax, NI, pension, student loan and take-home.
export function deductions(g, mc) {
    const pct = (Number(mc.pensionPct) || 0) / 100;
    const pension = mc.employment === "paye" ? Math.max(0, Math.min(g, R.QE_HI_M) - R.QE_LO_M) * pct : g * pct;
    const paM = R.PA / 12, basicM = R.BASIC / 12;
    let tax;
    const tc = parseTaxCode(mc.taxCode);
    if (mc.employment !== "paye") { const t = Math.max(0, g - paM); tax = Math.min(t, basicM) * 0.2 + Math.max(0, t - basicM) * 0.4; }
    else if (tc.kind === "none") tax = 0;
    else if (tc.kind === "flat") tax = Math.floor(g) * tc.rate;
    else {
        const t = Math.max(0, Math.floor(g - tc.freeM));
        tax = Math.min(t, basicM) * 0.2 + Math.max(0, Math.min(t, R.ADD_M) - basicM) * 0.4 + Math.max(0, t - R.ADD_M) * 0.45;
        if (tc.k) tax = Math.min(tax, g * 0.5); // K-code tax can't exceed half of pay
    }
    const lo = mc.employment === "paye" ? R.PT_M : paM, rate = mc.employment === "paye" ? 0.08 : 0.06;
    const ni = Math.max(0, Math.min(g, R.UEL_M) - lo) * rate + Math.max(0, g - R.UEL_M) * 0.02;
    const L = R.SL[mc.studentLoan];
    const sl = L ? Math.max(0, g - L[0]) * L[1] : 0;
    return { tax, ni, pension, sl, net: Math.max(0, g - tax - ni - pension - sl) };
}