export function buildBackup({ cfg, money, shifts, spend, payslips }) {
    return {
        exportedAt: new Date().toISOString(),
        app: "Shiftbook",
        schemaVersion: 1,
        config: cfg,
        money,
        shifts: [...shifts.values()].sort((a, b) => a.date.localeCompare(b.date)),
        spend: Object.fromEntries(spend),
        payslips: Object.fromEntries(payslips)
    };
}

export function parseBackup(text) {
    const b = JSON.parse(text);
    if (b.app !== "Shiftbook" || !b.config) throw new Error("not a backup");
    return b;
}