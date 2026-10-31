# Shiftbuck data model

All of a user's data lives under `data/users/<userId>/`. Paths alternate collection/document.

| Path | Type | Fields |
|---|---|---|
| `data/users/<id>/main` | document | `name`, `role`, `hourlyRate`, `sleepInRate`, `periodStartDay` (1–28), `serviceUsers[]`, `pattern` `{dayStart, dayHours, breakHrs, sleepStart, sleepEnd}` |
| `data/users/<id>/profile` | document | `ageGroup` (`18-24` … `65+`, `na`), `sex` (`female` \| `male` \| `other` \| null), `sexOther`, `area`, `employer` \| null, `nickname`, `createdAt`. Only `nickname` is ever shown to other users. |
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

`<id>` in every path is the signed-in user's Supabase id. Row-level security only lets people read and write rows where `user_id = auth.uid()`, and a check stops a row being saved outside `data/users/<their id>/`. `delete_my_account()` removes the person's rows and their sign-in.

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
Deleting an account removes the person's profile, messages and blocks through the `auth.users` cascade.

## Profiles and messages (Claude version)

The Claude-hosted pilot can't restrict a document to two people, so it has profiles and team messages but not private carer-to-carer messages.

- `community/<id>` `{nick, area, since, posts[]}` — the public profile and posts
- `toTeam/<id>` `{nick, area, msgs[]}` — written by that carer; read by them and the team (people with edit access)
- `fromTeam/<id>` `{msgs[], teamSeenAt}` — written by the team; read by that carer
- `announce/all` `{items[]}` — written by the team; read by everyone
- `data/users/<id>/inbox` `{teamSeenAt}` — private: when the carer last read the team's replies
- `main/shifts/<date>.fare` — the bus fare paid for that shift (never on the employer timesheet)


## Shift types and shift times (added 31 Oct 2026)

- `main` now also holds `workType` (`care` or `other`) and `shiftTypes[]`: `{name, paid: hours|sleep|both, start, end, hours?, breakHrs, rate?}`.
- Each shift can hold `type`, `start`, `end` (HH:MM; a finish at or before the start is the next day) and `rate` (its own £/hr, e.g. nights or weekends).
- Pay: (paid hours − break) × (shift rate or usual rate) + sleep-in rate if a sleep-in.
- Rest check adds an amber warning when there are under 11 hours between the end of one shift and the start of the next.
- All of this lives in the user's own `documents` rows; no database change was needed.
