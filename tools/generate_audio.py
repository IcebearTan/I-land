"""生成 I-land 的四条原创声音；只用 Python 标准库。

运行 python3 tools/generate_audio.py，输出 mono / 22050 Hz / 16-bit PCM WAV。
音乐为 80 BPM、16 小节的柔和 chiptune；环境声保持完整位深。
所有延迟/噪声在循环边界连续，输出同时打印响度与边界差供复核。
真实夜间虫鸣单独由 prepare_insects.py 处理，不在这里合成或覆盖。
"""

from array import array
import math
from pathlib import Path
import random
import sys
import wave

RATE = 22050
TAU = math.tau
DEST = Path(__file__).resolve().parents[1] / "frontend/public/audio"


def note_frequency(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def add_note(track, at, duration, midi, gain, voice="bell"):
    frequency = note_frequency(midi)
    for i in range(int(duration * RATE)):
        t = i / RATE
        attack = min(1, t / .025)
        release = min(1, max(0, (duration - t) / .13))
        envelope = attack * release * math.exp(-t * (2.8 if voice == "bell" else 1.1))
        p = TAU * frequency * t
        if voice == "bass":
            sample = math.sin(p) - math.sin(3 * p) / 9 + math.sin(5 * p) / 25
        else:
            # 带限、柔化的方波音色，保留像素旋律而不过分尖锐。
            sample = math.sin(p) + .19 * math.sin(3 * p) + .06 * math.sin(5 * p)
        track[(int(at * RATE) + i) % len(track)] += sample * gain * envelope


def music(night=False):
    beat = .75
    track = [0.0] * int(48 * RATE)
    chords = [(48, 64, 67, 71), (45, 60, 64, 67), (41, 57, 60, 64), (43, 59, 62, 67)]
    melody = [
        [(0, 76, 1), (1.5, 79, .5), (2.5, 74, 1)],
        [(.5, 72, 1), (2, 71, .5), (3, 67, .7)],
        [(0, 69, 1.5), (2, 72, .5), (3, 76, .7)],
        [(.5, 74, 1), (2.5, 71, 1)],
        [(0, 79, 1), (1.5, 76, 1), (3, 74, .7)],
        [(.5, 72, 1.5), (2.5, 76, 1)],
        [(0, 77, 1), (1.5, 76, .5), (2.5, 72, 1)],
        [(.5, 74, 1), (2, 71, .5), (3, 67, .7)],
        [(0, 76, 1.5), (2, 79, 1)],
        [(.5, 76, 1), (2, 72, 1.4)],
        [(0, 69, 1), (1.5, 72, 1), (3, 76, .7)],
        [(.5, 74, 1.5), (2.5, 71, 1)],
        [(0, 72, 1.5), (2.5, 76, 1)],
        [(.5, 71, 1), (2, 69, 1.4)],
        [(0, 69, 1.5), (2, 72, 1)],
        [(.5, 74, 1), (2, 71, .5), (3, 67, .8)],
    ]
    for bar, notes in enumerate(melody):
        base = bar * 4 * beat
        chord = chords[bar % 4]
        add_note(track, base, beat * 2.8, chord[0], .11 if night else .14, "bass")
        add_note(track, base + 2 * beat, beat * 1.8, chord[0] + 7, .045 if night else .06, "bass")
        for offset, midi in enumerate(chord[1:]):
            add_note(track, base + (.5 + offset) * beat, beat * (2.1 if night else 1.7), midi, .035 if night else .047, "bass" if night else "bell")
        for index, (at, midi, length) in enumerate(notes):
            if night and index == 1:
                continue
            add_note(track, base + at * beat, length * beat, midi - 12 if night else midi, .15 if night else .20, "bass" if night else "bell")
    # 循环延迟以 modulo 写入开头，尾部不会突然截断。
    dry = track[:]
    for seconds, gain in [(.14, .12), (.29, .07), (.43, .035)]:
        shift = int(seconds * RATE)
        for i, sample in enumerate(dry):
            track[(i + shift) % len(track)] += sample * gain
    return track


def circular_noise(seconds, seed, cutoff):
    n = int(seconds * RATE)
    overlap = int(.4 * RATE)
    rng = random.Random(seed)
    alpha = 1 - math.exp(-TAU * cutoff / RATE)
    raw, state = [], 0.0
    for _ in range(n + overlap):
        state += alpha * (rng.uniform(-1, 1) - state)
        raw.append(state)
    # 尾部之后的信号与开头交叉融合；最后一帧到首帧仍是相邻采样。
    for i in range(overlap):
        mix = .5 - .5 * math.cos(math.pi * i / overlap)
        raw[i] = raw[n + i] * (1 - mix) + raw[i] * mix
    return raw[:n]


def waves():
    seconds = 28
    low = circular_noise(seconds, 614, 320)
    foam = circular_noise(seconds, 730, 1900)
    for i in range(len(low)):
        t = i / RATE
        swell = (.5 + .5 * math.sin(TAU * 4 * t / seconds - .7)) ** 1.7
        breath = .86 + .14 * math.sin(TAU * t / seconds)
        low[i] = breath * ((.24 + .65 * swell) * low[i] + (.04 + .24 * swell) * foam[i])
    return low


def birds():
    seconds = 26
    track = [sample * .014 for sample in circular_noise(seconds, 864, 500)]
    rng = random.Random(821)
    for at in [1.2, 4.7, 9.1, 13.8, 18.3, 22.5]:
        for chirp in range(rng.randint(2, 4)):
            start = at + chirp * .24
            duration = rng.uniform(.10, .19)
            f0 = rng.uniform(1800, 2400)
            sweep = rng.uniform(550, 1000)
            phase = 0.0
            for i in range(int(duration * RATE)):
                t = i / RATE
                envelope = math.sin(math.pi * t / duration) ** 2
                frequency = f0 + sweep * math.sin(math.pi * t / duration) + 65 * math.sin(TAU * 27 * t)
                phase += TAU * frequency / RATE
                sample = math.sin(phase) + .07 * math.sin(2 * phase)
                track[(int(start * RATE) + i) % len(track)] += .24 * sample * envelope
    return track


def write(name, samples, peak):
    scale = peak / max(abs(v) for v in samples)
    pcm = array("h", (round(sample * scale * 32767) for sample in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    path = DEST / (name + ".wav")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())
    rms = math.sqrt(sum((v * scale) ** 2 for v in samples) / len(samples))
    seam = abs(samples[-1] - samples[0]) * scale
    print(f"{name}: {len(samples) / RATE:.0f}s, peak={peak:.2f}, RMS={rms:.3f}, seam={seam:.5f}, {path.stat().st_size} bytes")


if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    write("little-island", music(), .55)
    write("night-on-island", music(night=True), .42)
    write("birds", birds(), .32)
    write("waves", waves(), .55)
