"""Four single-shot procedural arcade cannon transients; no sample-library inputs."""
from pathlib import Path
import json, math, wave
import numpy as np

OUT = Path(__file__).resolve().parent
SR = 48000
PEAK = 0.16  # Five coherent voices with +0.8 dB variation remain below full scale.

def band_noise(rng, n, low, high):
    # Spectral shaping of excitation only; every component shares one onset.
    size = 8192
    f = np.fft.rfftfreq(size, 1 / SR)
    shape = (1 - np.exp(-(f / low) ** 6)) * np.exp(-(f / high) ** 6)
    a = np.fft.irfft(np.fft.rfft(rng.standard_normal(size)) * shape, size)[:n]
    return a / np.sqrt(np.mean(a * a))

report = []
for index, (duration, pitch, decay) in enumerate([
    (.110, 1.000, 1.000), (.106, 1.023, .970),
    (.114, .981, 1.035), (.109, 1.009, .990)
], 1):
    rng = np.random.default_rng(8701)
    n = round(duration * SR)
    t = np.arange(n) / SR
    # Broadband mechanical snap, rounded midrange pressure, damped metal.
    crack = band_noise(rng, n, 1700, 10000) * np.exp(-t / .00165) * .58
    punch = band_noise(rng, n, 380, 2700) * np.exp(-t / (.016 * decay)) * .63
    body = sum(amp * np.cos(2 * np.pi * freq * pitch * t + phase)
               for freq, amp, phase in [(610, .43, .2), (940, .27, .6), (1370, .15, -.4)])
    body *= np.exp(-t / (.020 * decay))
    metal = sum(amp * np.cos(2 * np.pi * freq * pitch * t + phase)
                for freq, amp, phase in [(2370, .12, .3), (3610, .07, -.2), (4930, .04, .5)])
    metal *= np.exp(-t / (.009 * decay))
    x = crack + punch + body + metal
    # Suppress sub-bass without adding a tail outside the file.
    hp = np.empty(n); previous_x = previous_y = 0.0
    alpha = math.exp(-2 * math.pi * 240 / SR)
    for k, v in enumerate(x):
        previous_y = alpha * (previous_y + v - previous_x)
        previous_x = v
        hp[k] = previous_y
    # Immediate attack; short smooth end fade, not appended silent padding.
    hp[:12] *= np.linspace(.15, 1, 12)
    fade = round(.006 * SR)
    hp[-fade:] *= .5 + .5 * np.cos(np.linspace(0, math.pi, fade))
    hp *= PEAK / np.max(np.abs(hp))
    pcm = np.rint(hp * 32767).astype('<i2')
    # Remove only quantization-zero padding; final nonzero sample is near zero.
    nonzero = np.flatnonzero(pcm)
    pcm = pcm[nonzero[0]:nonzero[-1] + 1]
    file = OUT / f'player_shot_{index:02}.wav'
    with wave.open(str(file), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    a = pcm.astype(float) / 32768
    peak = float(np.max(np.abs(a)))
    # Relative -60 dB threshold describes audible extent, not a listening judgement.
    active = np.flatnonzero(np.abs(a) >= peak * .001)
    spectrum = np.abs(np.fft.rfft(a)) ** 2
    frequencies = np.fft.rfftfreq(len(a), 1 / SR)
    row = dict(file=file.name, duration_ms=len(a) / SR * 1000,
               active_to_minus60dB_ms=(int(active[-1]) + 1) / SR * 1000,
               peak_dBFS=20 * math.log10(peak),
               rms_dBFS=20 * math.log10(float(np.sqrt(np.mean(a*a)))),
               sub100Hz_energy_percent=float(spectrum[frequencies < 100].sum()/spectrum.sum()*100),
               leading_zero_samples=0, trailing_zero_samples=0,
               final_sample=int(pcm[-1]),
               five_voice_bound_with_plus_0_8dB=peak * 5 * 10 ** (.8 / 20))
    assert 80 <= row['active_to_minus60dB_ms'] <= 140
    assert row['duration_ms'] <= 160 and row['five_voice_bound_with_plus_0_8dB'] < 1
    report.append(row)
(OUT / 'signal-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
