# Voiceover for the video ads

The script for all five videos, timed to the scenes. Record each line as its own file, then `mix.py` puts the lines on the videos.

**Current voices:** the files in the ad folders (`payslip/`, `vivian/` and so on) are British AI voices made with Kokoro, a free, open-source voice model (Apache 2.0 licence, so they can be used in ads): `bf_emma` for the narrator, `bm_george` for the manager and `bf_isabella` for Vivian. To swap in real recordings, replace a file with one of the same number and run `mix.py` again.

## How to record

1. Use a phone's voice recorder in a quiet room with soft furnishings (a bedroom is better than a kitchen). Hold the phone about a hand's width from your mouth.
2. Record **one line per file**, with a second of silence before and after. Re-record any line with stumbles.
3. Name each file by its line number and put it in the ad's folder: `voiceover/vivian/1.m4a`, `voiceover/vivian/2.m4a`, and so on. `.m4a`, `.mp3` and `.wav` all work.
4. From this folder, run `python3 mix.py` (or `python3 mix.py vivian` for one ad). Each video gets a copy ending in `-voice.mp4`.

Speak at a relaxed, natural pace. Each line has a time limit; a line slightly over is sped up by up to 12%, and anything longer is reported so you can say it a little faster.
Use one warm, friendly narrator for all five, ideally a real care worker. Vivian's ad also needs a manager and Vivian, so it works best with two or three voices.

## Payslip check (`shiftbuck-payslip-9x16.mp4`)

| File | Starts | Up to | Voice | Line |
|---|---|---|---|---|
| `payslip/1` | 0.2 s | 2.6 s | Narrator | Was a sleep-in missing from your payslip? |
| `payslip/2` | 3.0 s | 5.2 s | Narrator | Log every shift in Shiftbuck, and it checks your payslip for you. |
| `payslip/3` | 8.6 s | 3.0 s | Narrator | Know your pay before payday. |
| `payslip/4` | 12.0 s | 2.9 s | Narrator | Shiftbuck. Free for UK care workers. |

## Shift pay (`shiftbuck-shiftpay-9x16.mp4`)

| File | Starts | Up to | Voice | Line |
|---|---|---|---|---|
| `shiftpay/1` | 0.2 s | 2.6 s | Narrator | What does today's shift actually pay? |
| `shiftpay/2` | 3.0 s | 3.5 s | Narrator | Pick the shift, and Shiftbuck shows you. |
| `shiftpay/3` | 6.8 s | 2.5 s | Narrator | That's a hundred and seventy-five pounds. |
| `shiftpay/4` | 9.6 s | 2.3 s | Narrator | Watch your month add up. |
| `shiftpay/5` | 12.2 s | 2.7 s | Narrator | Shiftbuck. Free for UK care workers. |

## Rest check (`shiftbuck-rest-9x16.mp4`)

| File | Starts | Up to | Voice | Line |
|---|---|---|---|---|
| `rest/1` | 0.2 s | 2.6 s | Narrator | Seven days straight, no day off? |
| `rest/2` | 3.0 s | 4.8 s | Narrator | Shiftbuck warns you when you're not resting enough, using UK working time rules. |
| `rest/3` | 8.2 s | 3.4 s | Narrator | And shows you what every shift pays. |
| `rest/4` | 12.0 s | 2.9 s | Narrator | Shiftbuck. Free for UK care workers. |

## Tunde's story (`shiftbuck-story-tunde-9x16.mp4`)

| File | Starts | Up to | Voice | Line |
|---|---|---|---|---|
| `story/1` | 0.3 s | 3.2 s | Narrator | Meet Tunde. He's just started as a support worker. |
| `story/2` | 3.8 s | 2.8 s | Narrator | He logs every shift in Shiftbuck. |
| `story/3` | 7.0 s | 2.3 s | Narrator | That's a hundred and seventy-five pounds. |
| `story/4` | 9.6 s | 2.8 s | Narrator | So he knows his pay before payday. |
| `story/5` | 12.8 s | 3.4 s | Narrator | Every pound gets a job, including a house deposit. |
| `story/6` | 16.6 s | 3.8 s | Narrator | Month after month: over twelve thousand pounds. |
| `story/7` | 20.8 s | 3.0 s | Narrator | Three years on: keys to his first home. |
| `story/8` | 24.2 s | 3.1 s | Narrator | Shiftbuck. Free for UK care workers. |

## Vivian's overtime (`shiftbuck-overtime-vivian-9x16.mp4`)

| File | Starts | Up to | Voice | Line |
|---|---|---|---|---|
| `vivian/1` | 0.3 s | 2.0 s | Manager | Vivian, can you work Saturday? |
| `vivian/2` | 2.4 s | 1.8 s | Vivian | I've earned enough this month... |
| `vivian/3` | 4.4 s | 3.0 s | Narrator | But first, she checks Shiftbuck. |
| `vivian/4` | 7.8 s | 3.2 s | Narrator | Her plan is eighty-three pounds short. |
| `vivian/5` | 11.4 s | 3.2 s | Narrator | Saturday pays one hundred and eighty-one pounds fifty. |
| `vivian/6` | 15.0 s | 3.0 s | Narrator | Now her plan adds up. |
| `vivian/7` | 18.4 s | 3.0 s | Narrator | And she's still well rested. |
| `vivian/8` | 21.8 s | 2.6 s | Vivian | Yes, I'll do Saturday! |
| `vivian/9` | 24.8 s | 3.1 s | Narrator | Know your pay before you decide. Shiftbuck. |

## Other ways to add a voice

- **TikTok or Instagram's own text-to-speech:** add the lines as text in the app's editor and turn on text-to-speech. It's free, but every brand using it sounds the same.
- **An AI voice service** (for example ElevenLabs): paste each line, pick a British voice, and download one file per line into the folders above. Don't use a voice that imitates a real person.
- **A voice artist** (for example from Voices.com or Fiverr): send them this page. Ask for a commercial licence for social media ads.

Whatever you use, keep the on-screen text: most people watch with the sound off.
