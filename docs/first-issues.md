# First issues

Four starter tasks, in priority order. Copy each into a GitHub issue. Each one is small enough for one pull request.

---

## 1. Set up the test Supabase project and test sign-in on a real phone

**Why:** nothing can launch until carers can sign in with a code on their own phone.

**Do:**
- Create a Supabase project called `shiftbook-test` (EU or UK region).
- Run `supabase/schema.sql` in the SQL Editor; run it a second time to check it's safe to re-run.
- Turn on email sign-in codes; for phone codes, connect the SMS provider Babatope chooses (for example Twilio) using test credentials.
- Put the test project's URL and anon key in your local `app/src/config.js`.
- Add yourself to `community_moderators` in the test project.

**Done when:**
- Two people can sign up on two phones with email or phone codes.
- Each sees only their own shifts.
- A post from one appears for the other; a private message between them works; block and report work.
- Pausing, reactivating and deleting an account all work.
- Write up anything that failed as new issues.

---

## 2. Add holiday tracking to the full app

**Why:** holiday nobody explains is one of the hidden costs carers face. The founder's personal Shiftbook already has it, so copy the logic, not invent new rules.

**Do:**
- Holiday year January to December by default, with the start month in settings.
- Two ways to earn holiday: 5.6 weeks a year for regular hours, or 12.07% of hours worked for irregular hours.
- Book holiday: date, hours, note; edit and delete.
- Show earned, booked and left, in hours and in days.
- Store under the user's own data (see `docs/DATA_MODEL.md`), never shared.

**Done when:**
- On irregular hours, a 12-hour day with a 2-hour unpaid break (10 paid hours) adds about 1.2 hours of holiday (10 × 12.07%).
- Booking 15 days (150 hours) reduces what's left by 150 hours.
- Figures are labelled as estimates, with the payslip as the final word.
- Checked in light and dark mode on a phone.

---

## 3. Safety notice at the start of every new private conversation

**Why:** the risk assessment rates fraud and trafficking as medium. Scammers use private messages to move people to other apps and ask for money.

**Do:**
- When a carer opens a private conversation with someone they haven't messaged before, show a short notice above the message box:
  "Stay safe: never pay for a job or a visa sponsorship, be careful moving to another app, and never share where you or the people you support live. Report anything that worries you."
- Include a link to Report and to Block.
- Show it again whenever the conversation has fewer than 3 messages.

**Done when:** the notice shows in new conversations only, works with a screen reader, and passes the contrast check.

---

## 4. Blocked-words list for scams and hate

**Why:** catches the most common scam phrases and slurs before they're posted or sent.

**Do:**
- Keep the list in one place (a table in the database the moderators can edit, or a file to start with).
- Check posts and private messages against it before sending, alongside the existing checks for phone numbers, postcodes and service users' names.
- For scam phrases ("pay for sponsorship", "certificate of sponsorship for sale"), block the post or message and explain why in plain words.
- For slurs, block it and say it breaks the community rules.
- Don't show the matched word list to users.

**Done when:** the check runs in both posts and private messages, has tests for a few phrases, and moderators can add a word without a code change (or there's a follow-up issue to make that possible).
