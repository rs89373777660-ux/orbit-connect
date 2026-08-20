import math
import struct
import wave
from pathlib import Path

RATE = 48000
DURATION = 0.72
FRAMES = int(RATE * DURATION)

def envelope(t: float, attack: float, decay: float) -> float:
    if t < 0:
        return 0.0
    return min(1.0, t / attack) * math.exp(-t / decay)

samples = []
for i in range(FRAMES):
    t = i / RATE
    bright_t = t
    warm_t = t - 0.085
    bright_pitch = 760 - 170 * min(bright_t / 0.25, 1)
    warm_pitch = 420 - 75 * min(max(warm_t, 0) / 0.42, 1)
    bright = envelope(bright_t, 0.006, 0.105) * (
        math.sin(2 * math.pi * bright_pitch * bright_t)
        + 0.28 * math.sin(2 * math.pi * bright_pitch * 2.01 * bright_t)
    )
    warm = envelope(warm_t, 0.018, 0.22) * (
        math.sin(2 * math.pi * warm_pitch * max(warm_t, 0))
        + 0.20 * math.sin(2 * math.pi * warm_pitch * 1.5 * max(warm_t, 0))
    )
    shimmer = envelope(t - 0.03, 0.01, 0.075) * 0.10 * math.sin(2 * math.pi * 1240 * max(t - 0.03, 0))
    value = math.tanh((bright * 0.46 + warm * 0.62 + shimmer) * 1.18) * 0.72
    samples.append(int(max(-1, min(1, value)) * 32767))

root = Path(__file__).resolve().parents[1]
targets = [
    root / "public" / "orbit-plum.wav",
    root / "android" / "app" / "src" / "main" / "res" / "raw" / "orbit_plum.wav",
]
payload = b"".join(struct.pack("<h", sample) for sample in samples)
for target in targets:
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(payload)
    print(f"{target}: {target.stat().st_size} bytes")
