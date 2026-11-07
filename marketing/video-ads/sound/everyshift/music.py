# Gentle piano bed from Meta Piano (real recorded upright piano, CC0). 92 bpm, Am F C G, resolves on C for the end card.
import numpy as np, soundfile as sf, subprocess, io
SR = 48000; DIR = "/home/claude/sfxlibs/meta/systems/instruments/meta-piano/ogg/"
cache = {}
def note(n, v):
    k = (n, v)
    if k not in cache:
        raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", f"{DIR}INSPiano_{v}_{n}_01.ogg", "-ac", "2", "-ar", str(SR), "-f", "wav", "-"], capture_output=True).stdout
        a, _ = sf.read(io.BytesIO(raw)); cache[k] = a
    return cache[k]
DUR = 32.0; out = np.zeros((int(SR * DUR) + SR * 14, 2))
def put(t, n, v, g, cut=None):
    a = note(n, v).copy()
    if cut: L = int(cut * SR); a = a[:L]; f = min(len(a), int(.25 * SR)); a[-f:] *= np.linspace(1, 0, f)[:, None]
    i = int(t * SR); out[i:i + len(a)] += a * g
beat = 60 / 92; bar = beat * 4
CH = {"Am": ("A2", ["A3", "C4", "E4", "A4"]), "F": ("F2", ["F3", "A3", "C4", "F3"]), "C": ("C3", ["E3", "G3", "C4", "E4"]), "G": ("G2", ["G3", "B3", "D4", "G4"])}
prog = ["Am", "F", "C", "G", "C", "Am", "F", "G", "F", "G"]
for b, ch in enumerate(prog):
    t0 = b * bar; bass, arp = CH[ch]
    put(t0, bass, "Vel02", .55, cut=bar + .6)
    if b < 3:   # night intro: sparse quarter notes
        for i, n in enumerate([arp[0], arp[2], arp[1], arp[3]]): put(t0 + i * beat, n, "Vel01", .42, cut=beat * 2.2)
    else:       # eighth-note arpeggio
        seq = [arp[0], arp[1], arp[2], arp[3], arp[2], arp[1], arp[2], arp[3]]
        for i, n in enumerate(seq): put(t0 + i * beat / 2, n, "Vel01" if i % 2 else "Vel02", .30 if i % 2 else .34, cut=beat * 1.6)
# final chord on the next bar, left to ring
tf = len(prog) * bar
for n, g in [("C3", .6), ("E3", .45), ("G3", .45), ("C4", .45), ("E4", .4), ("G4", .35), ("C5", .3)]: put(tf, n, "Vel02", g)
out = out[:int(SR * DUR)]
fade = int(1.2 * SR); out[-fade:] *= np.linspace(1, 0, fade)[:, None]
out /= np.max(np.abs(out)) * 1.12
sf.write("music.wav", out, SR, subtype="PCM_24")
print("bars", len(prog), "bar", round(bar, 3), "final chord at", round(tf, 2))
