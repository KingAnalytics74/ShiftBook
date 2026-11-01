// sample account for the story ad: Tunde (made up), a new support worker saving for a house deposit
window.__seed = () => {
  const uid = "demo-tunde", base = "shiftbook:data/users/" + uid;
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  localStorage.clear();
  put("shiftbook:auth", { id: uid, email: "tunde@example.com" });
  put("shiftbook:accounts", ["tunde@example.com"]);
  put(base + "/main", { name: "Tunde", role: "Support Worker", hourlyRate: 13, sleepInRate: 45, periodStartDay: 1, serviceUsers: ["Alex", "Sam", "Jo"], busFare: 0,
    pattern: { dayStart: "08:00", dayHours: 12, breakHrs: 2, sleepStart: "20:00", sleepEnd: "08:00" } });
  put(base + "/profile", { ageGroup: "35-44", sex: null, area: "Leeds", employer: null, nickname: "Tunde_cares", createdAt: "2026-09-20T10:00:00Z" });
  put(base + "/account", { status: "active", since: "2026-09-20T10:00:00Z" });
  put(base + "/money", { employment: "paye", taxCode: "1257L", pensionPct: 4, studentLoan: "none", pots: [
    { id: "rent", name: "Rent & bills", mode: "pct", value: 40, kind: "need" }, { id: "food", name: "Food", mode: "pct", value: 15, kind: "need" },
    { id: "travel", name: "Travel", mode: "pct", value: 8, kind: "need" }, { id: "house", name: "House deposit", mode: "pct", value: 15, kind: "save" },
    { id: "fun", name: "Treats", mode: "pct", value: 10, kind: "want" }, { id: "buffer", name: "Buffer", mode: "pct", value: 12, kind: "want" } ] });
  const plan = { 1: "D", 2: "DS", 3: "D", 5: "D", 6: "S", 8: "D", 9: "DS", 10: "D", 13: "D", 14: "D", 15: "DS", 16: "D", 17: "D", 18: "D", 19: "D",
                 22: "D", 23: "DS", 25: "D", 27: "D", 28: "S", 29: "D", 30: "DS" };
  const who = ["Alex", "Sam", "Jo"];
  Object.entries(plan).forEach(([d, t], i) => {
    const date = "2026-10-" + String(d).padStart(2, "0"), day = t !== "S";
    put(base + "/main/shifts/" + date, { date, users: [who[i % 3]], sleepIn: t !== "D", dayHours: day ? 12 : null, breakHrs: day ? 2 : null, notes: "", updatedAt: date + "T20:00:00Z" });
  });
  put(base + "/main/spend/2026-10-01", { rent: 918.66, food: 331.20, travel: 172.40, house: 344.50, fun: 196.80 });
};
