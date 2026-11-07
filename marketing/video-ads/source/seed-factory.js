// sample account for the factory ad: Kemi, a made-up warehouse worker on nights. No real data.
window.__seed = () => {
  const uid = "demo-kemi", base = "shiftbook:data/users/" + uid;
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  localStorage.clear();
  put("shiftbook:auth", { id: uid, email: "kemi@example.com" });
  put("shiftbook:accounts", ["kemi@example.com"]);
  const types = [
    { name: "Early", paid: "hours", start: "06:00", end: "14:00", breakHrs: 0.5 },
    { name: "Late", paid: "hours", start: "14:00", end: "22:00", breakHrs: 0.5 },
    { name: "Night", paid: "hours", start: "22:00", end: "06:00", breakHrs: 0.5 }
  ];
  put(base + "/main", { name: "Kemi", role: "Warehouse operative", hourlyRate: 13.2, sleepInRate: 0, periodStartDay: 1, serviceUsers: [], busFare: 0,
    workType: "other", shiftTypes: types });
  put(base + "/profile", { ageGroup: "25-34", sex: null, area: "Coventry", employer: null, nickname: "NightOwl_Cov", createdAt: "2026-10-01T10:00:00Z" });
  put(base + "/account", { status: "active", since: "2026-10-01T10:00:00Z" });
  const plan = { 1: "N", 2: "N", 3: "N", 4: "N" };
  Object.entries(plan).forEach(([d]) => {
    const date = "2026-11-" + String(d).padStart(2, "0");
    put(base + "/main/shifts/" + date, { date, type: "Night", start: "22:00", end: "06:00", users: [], sleepIn: false, dayHours: 8, breakHrs: 0.5, rate: null, notes: "", updatedAt: date + "T23:00:00Z" });
  });
};
