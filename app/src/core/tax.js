// 2026/27 rates (England, Wales & NI): personal allowance £12,570; basic rate 20% on next £37,700, 40% above;
// employee NI 8% from £1,048/month to £4,189/month, 2% above; self-employed Class 4 6% / 2%;
// auto-enrolment qualifying earnings £520–£4,189/month; student loan monthly thresholds below.
export const R = {
  FREE_M: 1048.25, PA: 12570, BASIC: 37700, PT_M: 1048, UEL_M: 4189, QE_LO_M: 520, QE_HI_M: 4189,
  SL: { p1: [2241, 0.09], p2: [2448, 0.09], p4: [2816, 0.09], p5: [2083, 0.09], pg: [1750, 0.06] }
};

export function deductions(g, mc) {
  const pct = (Number(mc.pensionPct) || 0) / 100;
  const pension = mc.employment === "paye" ? Math.max(0, Math.min(g, R.QE_HI_M) - R.QE_LO_M) * pct : g * pct;
  const paM = R.PA / 12, basicM = R.BASIC / 12;
  let tax;
  if (mc.employment === "paye" && mc.taxCode === "BR") tax = g * 0.2;
  else { const t = mc.employment === "paye" ? Math.max(0, Math.floor(g - R.FREE_M)) : Math.max(0, g - paM); tax = Math.min(t, basicM) * 0.2 + Math.max(0, t - basicM) * 0.4; }
  const lo = mc.employment === "paye" ? R.PT_M : paM, rate = mc.employment === "paye" ? 0.08 : 0.06;
  const ni = Math.max(0, Math.min(g, R.UEL_M) - lo) * rate + Math.max(0, g - R.UEL_M) * 0.02;
  const L = R.SL[mc.studentLoan];
  const sl = L ? Math.max(0, g - L[0]) * L[1] : 0;
  return { tax, ni, pension, sl, net: Math.max(0, g - tax - ni - pension - sl) };
}