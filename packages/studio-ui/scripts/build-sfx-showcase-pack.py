#!/usr/bin/env python3
"""Build one deterministic, peak-safe listening pack from the licensed SFX catalog."""
from array import array
from hashlib import sha256
import json
import math
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parents[1] / 'src'
SOUNDS = ROOT / 'sfx-library-assets'
OUT = ROOT / 'workflow-art'
CATALOG = json.loads((SOUNDS / 'PROVENANCE.json').read_text())
RATE = 48000
GAP_FRAMES = round(RATE * .24)
FADE_FRAMES = round(RATE * .006)
TARGET_RMS = .16
MAX_PEAK = .68

all_samples = array('h')
entries = []
for sound in CATALOG['files']:
    path = SOUNDS / (sound['id'].replace('-', '_') + '.wav')
    if sha256(path.read_bytes()).hexdigest() != sound['sha256']:
        raise ValueError(f"Catalog hash mismatch: {sound['id']}")
    with wave.open(str(path), 'rb') as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate(), source.getcomptype()) != (1, 2, RATE, 'NONE'):
            raise ValueError(f"Unsupported SFX format: {sound['id']}")
        data = array('h'); data.frombytes(source.readframes(source.getnframes()))
    if sys.byteorder != 'little':
        data.byteswap()
    peak = max((abs(value) / 32768 for value in data), default=0)
    if peak < .0001:
        raise ValueError(f"Silent SFX: {sound['id']}")
    active = [value / 32768 for value in data if abs(value) > peak * 32768 * .08]
    rms = math.sqrt(sum(value * value for value in active) / max(1, len(active)))
    gain = min(8, TARGET_RMS / max(.0001, rms), MAX_PEAK / peak)
    start = len(all_samples) / RATE
    count = len(data)
    for index, sample in enumerate(data):
        edge = min(1, index / max(1, FADE_FRAMES), (count - 1 - index) / max(1, FADE_FRAMES))
        all_samples.append(round(max(-32768, min(32767, sample * gain * max(0, edge)))))
    entries.append({'id': sound['id'], 'startSec': round(start, 4), 'durationSec': round(count / RATE, 4)})
    all_samples.extend([0] * GAP_FRAMES)

if sys.byteorder != 'little':
    all_samples.byteswap()
OUT.mkdir(parents=True, exist_ok=True)
output = OUT / 'sfx-showcase-pack-v1.wav'
with wave.open(str(output), 'wb') as dest:
    dest.setnchannels(1); dest.setsampwidth(2); dest.setframerate(RATE)
    dest.writeframes(all_samples.tobytes())

# Derive the displayed waveform from the packaged audio, not an invented animation.
frames = array('h', all_samples)
if sys.byteorder != 'little':
    frames.byteswap()
waveform = []
for index in range(72):
    window = frames[index * len(frames) // 72:(index + 1) * len(frames) // 72]
    waveform.append(round(max((abs(value) / 32768 for value in window), default=0), 3))
metadata = {
    'source': 'sfx-library-assets/PROVENANCE.json', 'license': CATALOG['license'],
    'count': len(entries), 'durationSec': round(len(frames) / RATE, 3),
    'gapSec': GAP_FRAMES / RATE, 'targetActiveRms': TARGET_RMS, 'maxPeak': MAX_PEAK,
    'sha256': sha256(output.read_bytes()).hexdigest(), 'entries': entries, 'waveform': waveform,
}
(OUT / 'sfx-showcase-pack-v1.provenance.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
print(f"{output.name}: {metadata['count']} sounds, {metadata['durationSec']}s, {output.stat().st_size} bytes")
