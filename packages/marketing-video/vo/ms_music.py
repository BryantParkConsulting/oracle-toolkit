"""Synthesized ambient bed for the Managed Services video — our own audio, no licence question.

    python vo/ms_music.py [seconds]   ->  public/audio/ms-ambient.wav

Soft pads (detuned sines, slow attack/release) on D – Bm – G – A, a quiet bell arpeggio,
and a cheap reverb (exponential-noise convolution). Meant to sit well under the voice.
"""
import os, sys
import numpy as np, soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 90.0
BAR = 4.0  # seconds per chord
rng = np.random.default_rng(7)

def hz(m):  # midi -> Hz
    return 440.0 * 2 ** ((m - 69) / 12)

CHORDS = [  # Dmaj9, Bm9, Gmaj7, A6sus2
    [50, 57, 62, 66, 69, 76],
    [47, 54, 62, 66, 69, 73],
    [43, 50, 59, 62, 66, 71],
    [45, 52, 57, 59, 64, 66],
]

n = int(DUR * SR)
t = np.arange(n) / SR
out = np.zeros((n, 2), np.float32)

def env(length, a, r):
    e = np.ones(length, np.float32)
    ai, ri = int(a * SR), int(r * SR)
    e[:ai] = np.linspace(0, 1, ai) ** 2
    e[-ri:] *= np.linspace(1, 0, ri) ** 1.5
    return e

# pads
seg = int((BAR + 2.5) * SR)
for k in range(int(np.ceil(DUR / BAR))):
    start = int(k * BAR * SR)
    length = min(seg, n - start)
    if length <= 0:
        break
    tt = np.arange(length) / SR
    e = env(length, 1.6, min(2.6, length / SR * 0.6))
    for j, m in enumerate(CHORDS[k % 4]):
        f0 = hz(m)
        amp = (0.05 if j < 2 else 0.032) * (0.9 + 0.2 * rng.random())
        for side, det in ((0, -0.18), (1, 0.18)):
            w = np.sin(2 * np.pi * (f0 + det) * tt + rng.random() * 6.28)
            w += 0.18 * np.sin(2 * np.pi * 2 * (f0 + det) * tt)
            out[start:start + length, side] += (amp * e * w).astype(np.float32)

# bell arpeggio, sparse and quiet
step = BAR / 4
for k in range(int(DUR / step)):
    if rng.random() < 0.35:
        continue
    ch = CHORDS[int(k * step / BAR) % 4]
    m = ch[2 + (k % 4)] + 12
    start = int(k * step * SR)
    length = min(int(2.2 * SR), n - start)
    if length <= 0:
        break
    tt = np.arange(length) / SR
    w = (np.sin(2 * np.pi * hz(m) * tt) + 0.3 * np.sin(2 * np.pi * hz(m) * 2.01 * tt)) * np.exp(-tt * 2.4)
    pan = 0.3 + 0.4 * rng.random()
    out[start:start + length, 0] += (0.022 * (1 - pan) * w).astype(np.float32)
    out[start:start + length, 1] += (0.022 * pan * w).astype(np.float32)

# reverb: convolve with a short decaying noise tail (FFT)
ir_len = int(2.4 * SR)
ir = rng.standard_normal((ir_len, 2)).astype(np.float32) * np.exp(-np.arange(ir_len) / SR * 2.2)[:, None]
ir /= np.abs(ir).sum(0) / 6
N = 1 << int(np.ceil(np.log2(n + ir_len)))
wet = np.stack([np.fft.irfft(np.fft.rfft(out[:, c], N) * np.fft.rfft(ir[:, c], N), N)[:n] for c in range(2)], 1)
mix = 0.65 * out + 0.35 * wet.astype(np.float32)

# gentle low-pass (one-pole) and global fades
a = np.exp(-2 * np.pi * 3500 / SR)
for c in range(2):
    y, prev = mix[:, c], 0.0
    for i in range(0, n, 4096):  # vectorized in blocks via lfilter-free recurrence
        blk = y[i:i + 4096].copy()
        for j in range(len(blk)):
            prev = (1 - a) * blk[j] + a * prev
            blk[j] = prev
        y[i:i + 4096] = blk
fade = np.ones(n, np.float32)
fade[:int(2 * SR)] = np.linspace(0, 1, int(2 * SR))
fade[-int(4 * SR):] = np.linspace(1, 0, int(4 * SR))
mix *= fade[:, None]
mix *= 0.6 / max(1e-6, np.abs(mix).max())

os.makedirs(os.path.join(ROOT, 'public', 'audio'), exist_ok=True)
dst = os.path.join(ROOT, 'public', 'audio', 'ms-ambient.wav')
sf.write(dst, mix, SR)
print('wrote', dst, '%.1fs' % DUR)
