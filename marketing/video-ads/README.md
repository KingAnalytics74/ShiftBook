# Shiftbuck video ads

Three 15-second vertical ads (1080×1920, 9:16) for TikTok, Instagram Reels and Stories, Facebook Reels and YouTube Shorts. They show the real app with example figures.

| File | Opens with | Shows |
|---|---|---|
| `shiftbuck-payslip-9x16.mp4` | "Was a sleep-in missing from your payslip?" | The payslip check catching £45 not paid, then gross pay for the month |
| `shiftbuck-shiftpay-9x16.mp4` | "What does today's shift actually pay?" | Picking a shift type, "This shift pays £175", then the month adding up |
| `shiftbuck-rest-9x16.mp4` | "7 days in a row without a day off?" | The rest check warning and 70 hours in 7 days, then gross pay |

Each ends on the logo, "Know your pay before payday", "Free for UK care workers" and the web address.

They're made to work **with the sound off**: every message is on screen. Each file has a silent audio track, so platforms accept it. To add music, pick it inside TikTok or Instagram from their **commercial music library**. Paid ads can't use ordinary trending songs.

Text and app screens stay out of the bottom fifth and the right edge, where TikTok and Instagram put their buttons and captions.

## Captions to post with them

**Payslip ad**
> Ever been paid less than you worked? Log your shifts in Shiftbuck and it checks your payslip against them, including sleep-ins. Free for UK care workers. 💷
> #carers #supportworker #carework #sleepins #payslip #ukcarers

**Shift pay ad**
> Day shift, sleep-in or both: see what it pays before payday. Shiftbuck adds up every shift at your own rates. Free for UK care workers.
> #carers #supportworker #carework #nightshift #ukcarers

**Rest ad**
> Working day after day with no break? Shiftbuck warns you when you're not getting enough rest, using UK working time rules. Free for UK care workers.
> #carers #supportworker #carework #selfcare #ukcarers

## Before you pay to promote them

1. **Connect Supabase first.** Until it's connected the site runs in demo mode: shifts stay in that one browser, don't move between devices, and are lost if the browser is cleared. People who sign up from an ad deserve real accounts.
2. **Get your own web address.** The ads end on `kinganalytics74.github.io/ShiftBook`. Once you have a Shiftbuck address, re-render them (below).
3. **Keep the claims true (UK advertising rules, CAP Code).** The ads show only what the app does, with "Example figures shown" on the end card.
   - Keep "Free for UK care workers" true for as long as these ads run.
   - Don't add claims the app can't back up, such as "never be underpaid again" or "matches every payslip".
   - The rest check is a guide, not legal advice. Don't present it as a legal guarantee.
4. **Use an account for the business.** Use a TikTok Business account or Meta Business Suite in WesTech Innovation's name, and link the privacy notice (`app/#privacy`) wherever the platform asks for one.

## Re-render them (for example with a new web address)

Everything is in `source/`. You need Node, Playwright with Chromium, and ffmpeg.

1. Change `CTA_URL` near the top of the script in `source/ad.html`.
2. From the repository root:
   ```
   python3 -m http.server 8773
   node marketing/video-ads/source/render.js stills payslip 1.6,4,7.2,10.4,13.6   # quick check
   node marketing/video-ads/source/render.js video payslip marketing/video-ads/shiftbuck-payslip-9x16.mp4
   ```
   Repeat for `shiftpay` and `rest`. Each takes about 40 seconds.

To refresh the app screens after the app changes, serve the repository root on port 8772 and run `node marketing/video-ads/source/capture.js marketing/video-ads/source/screens`. The sample carer "Ada" and the service users "Alex", "Sam" and "Jo" are made up (`source/seed.js`).
