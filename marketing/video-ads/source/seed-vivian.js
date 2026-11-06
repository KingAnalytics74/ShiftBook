// sample account for Vivian's overtime ad: Vivian (made up), a support worker. November: long days on Mondays and
// Wednesdays, an early on Fridays, and a spending plan £83.56 more than her take-home until she takes one overtime day.
window.__seed = () => {
  const uid = "demo-vivian", base = "shiftbook:data/users/" + uid;
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  localStorage.clear();
  put("shiftbook:auth", { id: uid, email: "vivian@example.com" });
  put("shiftbook:accounts", ["vivian@example.com"]);
  put(base + "/main", { name: "Vivian", role: "Support Worker", hourlyRate: 13.2, sleepInRate: 45, periodStartDay: 1, serviceUsers: ["Alex", "Sam", "Jo"], busFare: 0,
    pattern: { dayStart: "08:00", dayHours: 12, breakHrs: 1, sleepStart: "20:00", sleepEnd: "08:00" }, workType: "care",
    shiftTypes: [
      { name: "Long day", paid: "hours", start: "08:00", end: "20:00", breakHrs: 1 },
      { name: "Early", paid: "hours", start: "07:00", end: "14:00", breakHrs: 0.5 },
      { name: "Overtime long day", paid: "hours", start: "08:00", end: "20:00", breakHrs: 1, rate: 16.5 } ] });
  put(base + "/profile", { ageGroup: "35-44", sex: null, area: "Leeds", employer: null, nickname: "Vivian_cares", createdAt: "2026-09-20T10:00:00Z" });
  put(base + "/account", { status: "active", since: "2026-09-20T10:00:00Z" });
  put(base + "/money", { employment: "paye", taxCode: "1257L", pensionPct: 4, studentLoan: "none", pots: [
    { id: "rent", name: "Rent", mode: "fixed", value: 700, kind: "need" }, { id: "bills", name: "Bills", mode: "fixed", value: 180, kind: "need" },
    { id: "food", name: "Food", mode: "fixed", value: 280, kind: "need" }, { id: "travel", name: "Travel", mode: "fixed", value: 110, kind: "need" },
    { id: "family", name: "Family", mode: "fixed", value: 150, kind: "need" }, { id: "save", name: "Savings", mode: "fixed", value: 100, kind: "save" } ] });
  const shift = (date, type, start, end, breakHrs, users) => put(base + "/main/shifts/" + date, { date, users, type, start, end, breakHrs, sleepIn: false,
    dayHours: ((h => h <= 0 ? h + 24 : h)((+end.slice(0, 2) + end.slice(3) / 60) - (+start.slice(0, 2) + start.slice(3) / 60))), notes: "", updatedAt: date + "T20:00:00Z" });
  [2, 4, 9, 11, 16, 18, 23, 25, 30].forEach((d, i) => shift("2026-11-" + String(d).padStart(2, "0"), "Long day", "08:00", "20:00", 1, [["Alex", "Sam", "Jo"][i % 3]]));
  [6, 13, 20, 27].forEach((d, i) => shift("2026-11-" + String(d).padStart(2, "0"), "Early", "07:00", "14:00", 0.5, [["Sam", "Jo"][i % 2]]));
};
