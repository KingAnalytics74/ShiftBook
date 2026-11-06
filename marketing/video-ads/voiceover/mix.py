#!/usr/bin/env python3
"""
mix.py — puts recorded voiceover lines onto the Shiftbuck video ads.

Record each line in lines.json as its own file, named by its id, in a folder per ad:
  voiceover/vivian/1.m4a, voiceover/vivian/2.m4a, ...   (.wav, .mp3 or .m4a)
Then, from this folder:
  python3 mix.py            # every ad that has recordings
  python3 mix.py vivian     # just one
Each ad gets <video name>-voice.mp4 next to the original. The picture is copied unchanged.

A line a little longer than its slot is sped up by up to 12%; anything longer is reported so it can be
re-recorded faster or shortened. The mix is levelled to -14 LUFS, the loudness TikTok, Instagram and
YouTube play at. Needs ffmpeg.
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ADS_DIR = os.path.dirname(HERE)
EXTS = (".wav", ".mp3", ".m4a", ".aac", ".ogg")
MAX_SPEEDUP = 1.12

TRIM = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"

def duration(path):
    """length of the speech itself, with silence before and after the words cut off"""
    out = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-af", TRIM, "-f", "null", "-"], capture_output=True, text=True).stderr
    t = re.findall(r"time=(\d+):(\d+):([\d.]+)", out)[-1]
    return int(t[0]) * 3600 + int(t[1]) * 60 + float(t[2])

def mix(ad, spec, voice_dir):
    folder = os.path.join(voice_dir, ad)
    lines, inputs, problems = [], [], []
    for ln in spec["lines"]:
        f = next((os.path.join(folder, ln["id"] + e) for e in EXTS if os.path.exists(os.path.join(folder, ln["id"] + e))), None)
        if not f:
            problems.append(f'line {ln["id"]} missing ("{ln["text"]}")'); continue
        d = duration(f); speed = max(1.0, d / ln["max"])
        if speed > MAX_SPEEDUP:
            problems.append(f'line {ln["id"]} is {d:.1f}s but must fit in {ln["max"]:.1f}s: record it faster or shorten it'); speed = MAX_SPEEDUP
        lines.append((ln, f, speed, d))
    if not lines:
        print(f"{ad}: no recordings in {folder}"); return False
    video = os.path.join(ADS_DIR, spec["video"]); out = video.replace(".mp4", "-voice.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", video]
    chains = []
    for i, (ln, f, speed, d) in enumerate(lines, start=1):
        cmd += ["-i", f]
        ms = int(round(ln["at"] * 1000))
        # trim silence around each take, so the line lands on its mark
        chains.append(f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,{TRIM},"
                      f"atempo={speed:.3f},adelay={ms}|{ms}[v{i}]")
    n = len(lines)
    chains.append("".join(f"[v{i}]" for i in range(1, n + 1)) + f"amix=inputs={n}:normalize=0:dropout_transition=0,"
                  "loudnorm=I=-14:TP=-1.5:LRA=11,apad[aout]")
    cmd += ["-filter_complex", ";".join(chains), "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-shortest", "-movflags", "+faststart", out]
    subprocess.run(cmd, check=True)
    print(f"{ad}: {n} line(s) -> {os.path.basename(out)}" + (f" ({len(lines) - sum(1 for l in lines if l[2] == 1.0)} sped up slightly)" if any(l[2] > 1.0 for l in lines) else ""))
    for p in problems: print(f"   ! {p}")
    return True

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    voice_dir = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--voices=")), HERE)
    spec = json.load(open(os.path.join(HERE, "lines.json")))
    for ad in (args or [k for k in spec if not k.startswith("_")]):
        mix(ad, spec[ad], voice_dir)
