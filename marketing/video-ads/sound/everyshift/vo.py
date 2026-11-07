import soundfile as sf, json, sys
from kokoro_onnx import Kokoro
k = Kokoro("/home/claude/kokoro/kokoro-v1.0.onnx", "/home/claude/kokoro/voices-v1.0.bin")
lines = json.load(open("lines.json"))
out = {}
for i, L in enumerate(lines, 1):
    a, sr = k.create(L["text"], voice=L.get("voice", "bf_emma"), speed=L.get("speed", 1.0), lang="en-gb")
    sf.write(f"vo/{i}.wav", a, sr); out[i] = round(len(a) / sr, 2)
    print(i, out[i], L["text"])
json.dump(out, open("vo/durations.json", "w"))
