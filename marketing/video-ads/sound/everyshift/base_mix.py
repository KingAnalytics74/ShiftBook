import numpy as np, soundfile as sf, pyloudnorm as pyln, json, soxr
SR = 48000; DUR = 31.5; N = int(SR * DUR)
meter = pyln.Meter(SR)
def load(p):
    a, sr = sf.read(p, always_2d=True)
    if sr != SR: a = soxr.resample(a, sr, SR)
    if a.shape[1] == 1: a = np.repeat(a, 2, 1)
    return a
voice = np.zeros((N, 2)); music = np.zeros((N, 2)); ui = np.zeros((N, 2))
def place(buf, a, t, g=1.0):
    i = int(round(t * SR)); j = min(N, i + len(a)); buf[max(0, i):j] += a[max(0, -i):j - i] * g
# voiceover: each line to -16 LUFS
VO = {1: .30, 2: 3.20, 3: 5.75, 4: 8.30, 5: 12.30, 6: 14.75, 7: 17.55, 8: 21.20, 9: 23.55, 10: 26.80, 11: 29.25}
spans = []
for k, t in VO.items():
    a = load(f"vo/{k}.wav"); a = pyln.normalize.loudness(a, meter.integrated_loudness(a), -16.0)
    place(voice, a, t); spans.append((t, t + len(a) / SR))
# music: -26 LUFS, ducked 5 dB under the voice with 0.15 s ramps
m = load("music.wav")[:N]; m = pyln.normalize.loudness(m, meter.integrated_loudness(m), -26.0); music[:len(m)] = m
env = np.ones(N)
for a, b in spans: env[int(a * SR):int(b * SR)] = 10 ** (-5 / 20)
k = int(.15 * SR); env = np.convolve(env, np.ones(k) / k, mode="same"); music *= env[:, None]
# earshot (code-made) sounds, each placed so its loudest point meets the moment
def es(name, at, g_db):
    a = load(f"es/{name}.wav"); pk = int(np.argmax(np.abs(a).max(1))); place(ui, a, at - pk / SR, 10 ** (g_db / 20))
for n, t in zip(["word1", "word2", "word3"], [.30, .85, 1.45]): es(n, t, -8)
for t in [3.0, 5.6, 12.0, 17.2, 21.0, 23.6, 26.1]: es("whoosh_soft", t, -14)
es("whoosh_big", 8.0, -12)
es("tap", 13.4, -6); es("ringtick", 13.55, -10); es("pay99", 14.95, -8)
es("ringtick", 17.75, -10); es("pay175", 18.55, -8)
es("rest", 21.6, -9); es("payslip", 24.55, -10); es("chip", 26.75, -8)
mix = voice + music + ui
sf.write("base.wav", mix, SR, subtype="PCM_24"); sf.write("stem_voice.wav", voice, SR, subtype="PCM_24"); sf.write("stem_music.wav", music, SR, subtype="PCM_24"); sf.write("stem_earshot.wav", ui, SR, subtype="PCM_24")
print("base LUFS", round(meter.integrated_loudness(mix), 1), "peak dBFS", round(20 * np.log10(np.abs(mix).max()), 1))
