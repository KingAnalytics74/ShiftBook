// sample account for the ads: made-up carer and service users
window.__seed = () => {
  const uid = "demo-ada", base = "shiftbook:data/users/" + uid;
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  localStorage.clear();
  put("shiftbook:auth", { id: uid, email: "ada@example.com" });
  put("shiftbook:accounts", ["ada@example.com"]);
  put(base + "/main", { name: "Ada", role: "Support Worker", hourlyRate: 13, sleepInRate: 45, periodStartDay: 1, serviceUsers: ["Alex", "Sam", "Jo"], busFare: 0,
    pattern: { dayStart: "08:00", dayHours: 12, breakHrs: 2, sleepStart: "20:00", sleepEnd: "08:00" } });
  put(base + "/profile", { ageGroup: "35-44", sex: null, area: "Leeds", employer: null, nickname: "Ada_cares", createdAt: "2026-09-20T10:00:00Z" });
  put(base + "/account", { status: "active", since: "2026-09-20T10:00:00Z" });
  put(base + "/money", { employment: "paye", taxCode: "1257L", pensionPct: 4, studentLoan: "none", pots: [
    { id: "rent", name: "Rent & bills", mode: "pct", value: 40, kind: "need" }, { id: "food", name: "Food", mode: "pct", value: 15, kind: "need" },
    { id: "travel", name: "Travel", mode: "pct", value: 8, kind: "need" }, { id: "save", name: "Savings", mode: "pct", value: 15, kind: "save" },
    { id: "fun", name: "Treats", mode: "pct", value: 12, kind: "want" } ] });
  const plan = { 1: "D", 2: "DS", 3: "D", 5: "D", 6: "S", 8: "D", 9: "DS", 10: "D", 13: "D", 14: "D", 15: "DS", 16: "D", 17: "D", 18: "D", 19: "D",
                 22: "D", 23: "DS", 25: "D", 27: "D", 28: "S", 29: "D", 30: "DS" };
  const who = ["Alex", "Sam", "Jo"];
  Object.entries(plan).forEach(([d, t], i) => {
    const date = "2026-10-" + String(d).padStart(2, "0"), day = t !== "S";
    put(base + "/main/shifts/" + date, { date, users: [who[i % 3]], sleepIn: t !== "D", dayHours: day ? 12 : null, breakHrs: day ? 2 : null, notes: "", updatedAt: date + "T20:00:00Z" });
  });
  // the payslip leaves out one sleep-in (£45), which the payslip check should catch
  put(base + "/main/payslips/2026-10-01", { payDate: "2026-10-30", hours: 200, gross: 2870, sleepPay: 270, tax: 364.2, ni: 145.76, pension: 94, net: 2266.04 });
};
