"""Kokoro narration: one WAV per scene in public/vo/<key>.wav + src/timing.json (per-line start/end in seconds).

    python vo/tts.py
"""
import json, os, re, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAY = [(r"\bBPC\b", "B P C"), (r"\bNetSuite\b", "Net Suite"), (r"\bSmart View\b", "Smart View"), (r"\b401k\b", "four oh one K")]
GAP = 0.35  # silence between lines

# python vo/tts.py [script.json] [vo subdir] [timing.json]
SCRIPT = sys.argv[1] if len(sys.argv) > 1 else "script.json"
VODIR = os.path.join(ROOT, "public", "vo", *(sys.argv[2:3]))
TIMING = sys.argv[3] if len(sys.argv) > 3 else "timing.json"
os.makedirs(VODIR, exist_ok=True)
cfg = json.load(open(os.path.join(ROOT, "vo", SCRIPT), encoding="utf-8"))
k = Kokoro(os.path.join(ROOT, "models", "kokoro-v1.0.onnx"), os.path.join(ROOT, "models", "voices-v1.0.bin"))
out = {"fps": 30, "scenes": []}
for sc in cfg["scenes"]:
    sr, parts, lines, t = 24000, [], [], sc["lead"]
    parts.append(np.zeros(int(sc["lead"] * sr), np.float32))
    for i, line in enumerate(sc["lines"]):
        s = line
        for a, b in SAY:
            s = re.sub(a, b, s)
        a, sr = k.create(s, voice=cfg["voice"], speed=cfg["speed"], lang="en-us")
        a = np.asarray(a, np.float32)
        idx = np.where(np.abs(a) > 0.008)[0]
        if len(idx):
            a = a[max(0, idx[0] - int(0.04 * sr)): idx[-1] + int(0.08 * sr)]
        d = len(a) / sr
        lines.append({"text": line, "start": round(t, 3), "end": round(t + d, 3)})
        parts.append(a)
        t += d
        if i < len(sc["lines"]) - 1:
            parts.append(np.zeros(int(GAP * sr), np.float32))
            t += GAP
    parts.append(np.zeros(int(sc["tail"] * sr), np.float32))
    t += sc["tail"]
    sf.write(os.path.join(VODIR, sc["key"] + ".wav"), np.concatenate(parts), sr)
    out["scenes"].append({"key": sc["key"], "duration": round(t, 3), "captions": sc["captions"], "lines": lines})
    print("%-14s %5.1fs" % (sc["key"], t))
print("TOTAL %.1fs" % sum(s["duration"] for s in out["scenes"]))
json.dump(out, open(os.path.join(ROOT, "src", TIMING), "w"), indent=1)
