# Shiftbuck data model

All of a user's data lives under `data/users/<userId>/`. Paths alternate collection/document.

| Path | Type | Fields |
|---|---|---|
| `data/users/<id>/main` | document | `name`, `role`, `hourlyRate`, `sleepInRate`, `periodStartDay` (1–28), `serviceUsers[]` (workplace labels such as "Site 1"; the key keeps its old name so older data still loads, and it must never hold people's names), `pattern` `{dayStart, dayHours, breakHrs, sleepStart, sleepEnd}` |
| `data/users/<id>/profile` | document | `ageGroup` (`18-24` … `65+`, `na`), `sex` (`female` \| `male` \| `other` \| null), `sexOther`, `area` (the council label chosen from the list in `app/src/core/areas-data.js`, e.g. `Charnwood, Leicestershire`, or `Outside the UK`), `areaCode` (its ONS code, e.g. `E07000130`, or `OUTSIDE`; absent on older profiles that typed their area), `employer` \| null, `nickname`, `createdAt`. Only `nickname` is ever shown to other users. |
| `data/users/<id>/account` | document | `status` (`active` \| `paused`), `since` |
| `data/users/<id>/money` | document | `employment` (`paye` \| `self`), `taxCode` (`1257L` \| `BR`), `pensionPct`, `studentLoan` (`none`,`p1`,`p2`,`p4`,`p5`,`pg`), `pots[]` |
| `.../main/shifts/<YYYY-MM-DD>` | document | `date`, `users[]`, `sleepIn`, `dayHours` \| null, `breakHrs` \| null, `notes`, `updatedAt` |
| `.../main/spend/<periodStart>` | document | `{ <potId>: amountSpent }` |
| `.../main/payslips/<periodStart>` | document | `payDate`, `hours`, `gross`, `sleepPay`, `tax`, `ni`, `pension`, `net` |

A pot is `{ id, name, mode: "pct" | "fixed", value, kind: "need" | "want" | "save" }`.

## Rules

- **Net hours** = day hours − break.
- **Shift pay** = net hours × hourly rate + (sleep-in ? sleep-in rate : 0).
- **Pay period** runs from `periodStartDay` of one month to the day before it next month.
- **Tax (PAYE 1257L, monthly):** free pay is £1,048.25. Taxable pay is rounded down to whole pounds, taxed at 20% up to £3,141.67 and 40% above.
- **Employee NI:** 8% from £1,048 to £4,189 a month, 2% above.
- **Pension:** `pensionPct` of earnings between £520 and £4,189 a month (relief at source, usually 4%).
- **Rest check:** red at 7+ days in a row, more than 48 net hours in 7 days, or day + sleep-in + day. Amber at 6 days, more than 40 hours, or sleep-in straight onto a day shift.

## Storage in Supabase

Every document above is one row in `public.documents` (see `supabase/schema.sql`):

| Column | Meaning |
|---|---|
| `path` | the document's full path (primary key) |
| `parent` | the collection it belongs to, used to list a collection |
| `user_id` | the owner, from `auth.users` |
| `data` | the document itself, as JSON |
| `updated_at` | last change |

`<id>` in every path is the signed-in user's Supabase id. Row-level security only lets people read and write rows where `user_id = auth.uid()`, and a check stops a row being saved outside `data/users/<their id>/`. `delete_my_account()` removes the person's rows and their sign-in. Each document's `data` is capped at 256 KB. Sign-in details (phone, email and, if someone chooses one, a password) live in Supabase Auth (`auth.users`), not in `documents`; passwords are stored only as a hash.

## Profiles and messages (Supabase)

All of these tables have row-level security on and no policies: the app reaches them only through views that leave out user ids and through `security definer` functions in `supabase/schema.sql`.

| Table | What it holds | Who can read it |
|---|---|---|
| `community_profiles` | public id, nickname, area, `dm_open`, `dm_restricted` | everyone signed in sees id, nickname and area through the `community_people` view |
| `dm_messages` | private messages between two carers | only the sender and recipient, via `dm_threads()` and `dm_thread(profile)` |
| `dm_blocks` | who has blocked whom | only the person who blocked, via `dm_blocked()` |
| `dm_reports` | reports on private messages (recipient only) | moderators, via `dm_reports_list()` |
| `team_messages` | a carer's conversation with the Shiftbuck team | that carer (`team_thread()`) and moderators (`team_inbox()`, `team_thread_for()`) |
| `announcements` | messages from the team to everyone | everyone signed in, via the `announcements_feed` view |

`community_feed` now also returns `author_id` (the author's public profile id) so tapping a nickname opens their profile.
`community_post` stores the poster's own profile nickname and area (creating the profile on a first post), never a nickname sent by the app.

**Likes (added 15 Nov 2026):** `community_likes` `(post_id, user_id, created_at)`, one row per person per post, removed with the post or the account. Nobody reads the table: `community_feed` adds `likes` (how many) and `liked` (whether you did), never who liked a post. People like or unlike only through `community_like(p_id, p_on)`, as themselves, on posts that aren't hidden, at most 300 likes an hour. Comments are posts with `reply_to` set (shown as "Comment" in the app).
Deleting an account removes the person's profile, messages and blocks through the `auth.users` cascade.

## Profiles and messages (Claude version)

The Claude-hosted pilot can't restrict a document to two people, so it has profiles and team messages but not private carer-to-carer messages.

- `community/<id>` `{nick, area, since, posts[], likes[]}` — the public profile, posts, and ids of posts this person likes (counts add up everyone's)
- `toTeam/<id>` `{nick, area, msgs[]}` — written by that carer; read by them and the team (people with edit access)
- `fromTeam/<id>` `{msgs[], teamSeenAt}` — written by the team; read by that carer
- `announce/all` `{items[]}` — written by the team; read by everyone
- `data/users/<id>/inbox` `{teamSeenAt}` — private: when the carer last read the team's replies
- `main/shifts/<date>.fare` — the bus fare paid for that shift (never on the employer timesheet)

## Shift types and shift times (added 1 Nov 2026)

- `main` also holds `workType` (`care` or `other`) and `shiftTypes[]`: `{name, paid: hours|sleep|both, start, end, hours?, breakHrs, rate?}`.
- Each shift can hold `type`, `start`, `end` (HH:MM; a finish at or before the start is the next day) and `rate` (its own £/hr, for example nights or weekends).
- `periodStartDay` can be 1 to 31; in a shorter month the period starts on that month's last day.
- Pay (core/pay.js): (paid hours − break) × (shift rate or usual rate) + sleep-in rate if a sleep-in.
- Rest (core/restCheck.js): amber when there are under 11 hours between the end of one shift and the start of the next.
- All of this lives in the user's own `documents` rows; no database change was needed.

## Holiday (added 20 Nov 2026)

- `main.holiday`: `{mode: irregular|regular|rolledup, startMonth 1-12, startDay 1-31 (a day the month lacks means its last day; missing = 1), startedJob? (date, only offers "the day I started" as a leave-year start), hoursPerDay?, daysPerWeek, contractDays?, joined?, weeks (5.6+), sleepIns: no|payroll, carriedHours, nation: ew|sc|ni}`.
  Since the leave brief (Nov 2026) it also holds: `mode` can be irregular | partyear | rolledup | regular | weekly | fixed; `employer?`, `contractType?`, `startedJob?` (replaces `joined`, which is still read), `leaving?`, `weeklyHours?`, `annualHours?` / `annualDays?`, `accrue: upfront|monthly`, `pattern?` ([Sun..Sat] hours), `bankHols: separate|deduct`, `changes[]` ({at, text}, the last 40 settings changes, shown in the history).
- `main/holidays/<id>`: one booking or adjustment. `{kind: leave|adjust, from, to, hours, note, status: pending|approved|rejected|cancelled, shifts?: [{date, hours}] (the rota shifts it covered when saved), createdAt, updatedAt}`. No status = approved (older bookings). Adjustments are `kind: "adjust"` with + or − hours and a reason in `note`.
  No new tables: everything stays in `documents` under the user's own path, so the existing row-level security covers it. The history (ledger) is never stored; it's rebuilt from shifts, bookings and settings each time, so the balance can't change without a line explaining it.
- `main/holidays/<id>`: `{from, to, hours, note, updatedAt}` — holiday the user has taken or booked. Private to the user, like shifts.
- Maths in `app/src/core/holiday.js` (tests in `app/tests/holiday.test.js`): 12.07% of hours worked per pay period rounded to the nearest hour (irregular hours); 5.6 × days a week capped at 28 days (regular); rolled-up = 12.07% of pay; holiday pay = average of the last 52 paid weeks.
