"""将已入库的 CC0 夜间蟋蟀实录处理为 58 秒连续环境声。

运行 python3 tools/prepare_insects.py。仅用标准库处理采样；解码使用
macOS 自带 afconvert，或开发机器已安装的 ffmpeg。服务器无需这些工具。
来源、许可与原始下载文件校验见 audio_sources/README.md。
"""

from array import array
import hashlib
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import wave

from generate_audio import RATE, write

SOURCE = Path(__file__).resolve().parent / "audio_sources/night-field-cricket-175020.mp3"
SOURCE_HASH = "18da78264ed2ff12e74d1bc6ac17ce539a12568fd04a32c830f117fed31da8ea"
START = .25
SECONDS = 58
OVERLAP = 1.5


def decode(destination):
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_HASH:
        raise ValueError("虫鸣源文件与入库校验不一致，请核对来源记录")
    if shutil.which("afconvert"):
        command = ["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", "1", str(SOURCE), str(destination)]
    elif shutil.which("ffmpeg"):
        command = ["ffmpeg", "-v", "error", "-i", str(SOURCE), "-ac", "1", "-ar", str(RATE), "-c:a", "pcm_s16le", str(destination)]
    else:
        raise RuntimeError("开发机器需有 afconvert（macOS 自带）或 ffmpeg；部署无需重新生成")
    subprocess.run(command, check=True)
    with wave.open(str(destination), "rb") as source:
        if source.getframerate() != RATE or source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError("解码格式应为单声道 22050 Hz / PCM 16-bit")
        pcm = array("h", source.readframes(source.getnframes()))
        if sys.byteorder != "little":
            pcm.byteswap()
        return [sample / 32768 for sample in pcm]


def prepare(samples):
    # 温和去掉低频风噪与过亮的高频；保留真实虫鸣的节奏和交织层次。
    high_alpha = math.exp(-math.tau * 160 / RATE)
    low_alpha = 1 - math.exp(-math.tau * 6500 / RATE)
    filtered = []
    previous, high, low = samples[0], 0.0, 0.0
    for sample in samples:
        high = high_alpha * (high + sample - previous)
        previous = sample
        low += low_alpha * (high - low)
        filtered.append(low)

    start, length, overlap = int(START * RATE), int(SECONDS * RATE), int(OVERLAP * RATE)
    if len(filtered) < start + length + overlap:
        raise ValueError("实录长度不足以裁切并处理循环接缝")
    loop = filtered[start:start + length]
    # 从末尾之后的相邻采样接到开头，再用 1.5 秒余弦曲线渐入开头。
    # 没有周期性的静音或新造的蜂鸣，循环边界仍连续。
    for i in range(overlap):
        mix = .5 - .5 * math.cos(math.pi * i / (overlap - 1))
        loop[i] = filtered[start + length + i] * (1 - mix) + loop[i] * mix
    # 连续循环整体旋转到接近零的相邻采样；不改变虫鸣节奏或插入静音。
    # 即使后备播放器重新开始文件，低振幅边界也更稳妥。
    cut = min(range(5 * RATE, 6 * RATE), key=lambda i: abs(loop[i - 1]) + abs(loop[i]))
    return loop[cut:] + loop[:cut]


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="iland-insects-") as temporary:
        samples = decode(Path(temporary) / "source.wav")
    write("night-insects", prepare(samples), .22)
