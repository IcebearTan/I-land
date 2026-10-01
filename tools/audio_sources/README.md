# 夜间虫鸣实录来源

- 作品：[AMBIENCE NIGHT FIELD CRICKET 01.wav](https://freesound.org/people/sengjinn/sounds/175020/)
- 作者：sengjinn；原作品发布于 2013-01-21。作者描述为午夜蟋蟀鸣叫的野外录音。
- 许可：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。允许复制、修改和再分发；本项目仍保留作者与作品链接。
- 获取日期：2026-10-01。获取的是作品页面公开提供的高质量 MP3 预览，未下载需要登录的原始 WAV。
- 入库文件：`night-field-cricket-175020.mp3`，1,375,296 字节。
- 页面公开的下载地址：<https://cdn.freesound.org/previews/175/175020_2979997-hq.mp3>
- SHA-256：`18da78264ed2ff12e74d1bc6ac17ce539a12568fd04a32c830f117fed31da8ea`。

`tools/prepare_insects.py` 从这个源文件解码、转单声道 22050 Hz、温和滤除 160 Hz 以下的风噪和过亮高频、裁切为 58 秒、处理 1.5 秒循环接缝，并限制峰值为 0.22。输出 `frontend/public/audio/night-insects.wav`，保留 CC0 来源说明。再生时会校验源文件，运行时不会从 Freesound 加载，也不会请求第三方服务。

在仓库根目录运行 `python3 tools/prepare_insects.py`。采样处理仅用 Python 标准库；MP3 解码调用开发机器上的 `afconvert`（macOS 自带），也支持已有的 `ffmpeg`。这些是离线制作工具，部署服务器不需要安装。
