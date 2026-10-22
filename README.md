# Shiftbook

A personal shift log, pay calculator and money planner for support workers and carers. Log your shifts and Shiftbook works out your pay, your timesheet, your take-home and whether you're getting enough rest.

**Use it online:** https://kinganalytics74.github.io/ShiftBook/

It's a single page (`index.html`) that works on phones and computers. There's nothing to install.

## What it does

- **Overview:** gross pay for the pay period, estimated take-home, earnings build-up, weekly earnings, a shift calendar, shifts by service user and earnings by day of the week.
- **Rest check:** flags long runs of days without a day off, weeks over 48 hours, and day shifts straight after a sleep-in. It's based on UK working time rules and is a guide, not legal advice.
- **Log shift:** date, service user(s), sleep-in, day hours and unpaid break, with the pay for that shift shown as you type.
- **Timesheet:** the full pay period in a table, with CSV download, a summary you can copy for your manager, and backup and restore.
- **Money:** take-home after income tax, National Insurance, pension and student loan (2026/27 rates for England, Wales and Northern Ireland), a payslip check, and a spending plan with pots and spending charts.

## How pay is worked out

- Net hours = day hours − unpaid break
- Pay for a shift = net hours × hourly rate + sleep-in rate (if it was a sleep-in)
- A pay period runs from your chosen start day (1–28) to the day before that date the next month.

Tax and deductions are estimates. Your payslip is the final word.

## Getting started

1. Open the link above.
2. Fill in the setup screen: your name, role, hourly rate, sleep-in rate, the day your pay period starts, and your service users.
3. Log your shifts on the **Log shift** tab.

On a phone, use **Add to Home Screen** in your browser's menu to open it like an app.

## Where your data is kept

- **On the website (GitHub Pages):** shifts are saved in your browser on that device only. Nothing is sent to a server. Clearing your browser data or using private browsing will remove them, so use **Back up all data** on the Timesheet tab now and then. Use **Restore from backup** to move your shifts to another device.
- **Inside Claude (as an artifact):** shifts are saved to your Claude account and are private to you.

## Publishing with GitHub Pages

In the repository, go to **Settings → Pages**. Set **Source** to **Deploy from a branch**, pick the branch that has `index.html`, choose the `/ (root)` folder, and click **Save**. The site appears at `https://<username>.github.io/ShiftBook/` after a minute or two.

---

Powered by **WesTech Innovation**
