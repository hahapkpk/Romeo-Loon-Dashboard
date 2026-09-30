#!/usr/bin/env python3
"""Build a local/offline-ready Loon module catalog from Romeo's current revision."""
import argparse
import datetime as dt
import json
import re
import subprocess
import tarfile
import urllib.parse
import urllib.request
from pathlib import Path

REPOSITORY = "https://github.com/ifflagged/Romeo.git"
PREFIX = "Modules/Loon/"
HEADERS = {"User-Agent": "Romeo-Loon-Dashboard/1.0"}
ALIASES = {
    "12306": "铁路 12306", "amap": "高德地图", "gaode": "高德地图",
    "bilibili": "哔哩哔哩", "biliverse": "哔哩哔哩", "douyin": "抖音",
    "douban": "豆瓣", "eleme": "饿了么", "gaode": "高德地图",
    "iqiyi": "爱奇艺", "jd": "京东", "jingdong": "京东", "kuaishou": "快手",
    "kuwo": "酷我音乐", "kugou": "酷狗音乐", "neteasecloudmusic": "网易云音乐",
    "neteasemusic": "网易云音乐", "qqmusic": "QQ 音乐", "qq": "QQ",
    "quark": "夸克", "redbook": "小红书", "xiaohongshu": "小红书",
    "smzdm": "什么值得买", "taobao": "淘宝", "tencentvideo": "腾讯视频",
    "tieba": "百度贴吧", "toutiao": "今日头条", "weibo": "微博",
    "wechat": "微信", "weixin": "微信", "wps": "WPS Office",
    "xiaomi": "小米", "youtube": "YouTube", "zhihu": "知乎",
    "spotify": "Spotify", "netflix": "Netflix", "reddit": "Reddit",
    "telegram": "Telegram", "instagram": "Instagram", "tiktok": "TikTok",
    "applemusic": "Apple Music", "appleweather": "Apple 天气",
    "alicloud": "阿里云盘", "aliyundrive": "阿里云盘",
    "baidumap": "百度地图", "baidunetdisk": "百度网盘",
    "meituan": "美团", "meituanwm": "美团外卖", "pdd": "拼多多",
    "pinduoduo": "拼多多", "xianyu": "闲鱼", "goofish": "闲鱼",
}
SKIP = re.compile(r"(?:^|[._-])(?:request|response|config|manifest|api|script)\.bundle\.(?:lpx|plugin)$", re.I)
META = re.compile(r"^#!\s*(name|desc|date)\s*=\s*(.*)$", re.I)

def git(*args, cwd=None):
    return subprocess.check_output(["git", *args], cwd=cwd).decode("utf-8", "replace").strip()

def last_changes(repo):
    result = subprocess.check_output([
        "git", "log", "--no-renames", "--format=@@@%cI", "--name-only", "HEAD", "--", PREFIX
    ], cwd=repo).decode("utf-8", "replace")
    dates = {}
    current = None
    for line in result.splitlines():
        if line.startswith("@@@"):
            current = line[3:]
        elif line.startswith(PREFIX) and current:
            dates.setdefault(line, current)
    return dates

def parse_header(contents):
    fields = {}
    for line in contents.splitlines()[:45]:
        if not line.startswith("#!"):
            if line.strip() and not line.startswith("#"):
                break
            continue
        found = META.match(line)
        if found:
            fields[found.group(1).lower()] = found.group(2).strip().replace("\\n", " ")[:280]
    return fields

def friendly_name(path, raw_name):
    stem = Path(path).stem
    core = re.sub(r"(?i)(?:_remove_ads|_adblock|[._-]ads?)$", "", stem)
    key = re.sub(r"[^a-z0-9]", "", core.lower())
    # Exact aliases; for names such as BiliBili.ADBlock only match the first segment.
    first = re.split(r"[._-]", core, maxsplit=1)[0].lower()
    translated = ALIASES.get(key) or ALIASES.get(first)
    if translated:
        return translated
    return raw_name or core.replace("_", " ")

def build(repo, archive, output):
    sha = git("rev-parse", "HEAD", cwd=repo)
    dates = last_changes(repo)
    items = []
    with tarfile.open(archive, "r:gz") as package:
        for member in package:
            if not member.isfile() or "/Modules/Loon/" not in member.name:
                continue
            path = member.name.split("/Modules/Loon/", 1)[1]
            if not path.lower().endswith((".lpx", ".plugin")) or SKIP.search(path):
                continue
            repo_path = PREFIX + path
            if repo_path not in dates:
                continue  # Do not emit paths absent from the matching Git revision.
            stream = package.extractfile(member)
            if not stream:
                continue
            header = parse_header(stream.read(8192).decode("utf-8-sig", "replace"))
            segments = path.split("/")
            variant = next((s for s in segments[1:-1] if s.lower() in ("beta", "official")), "standard")
            base = "https://raw.githubusercontent.com/ifflagged/Romeo/main/"
            items.append({
                "path": repo_path,
                "name": friendly_name(path, header.get("name", "")),
                "originalName": header.get("name", "") or Path(path).stem,
                "author": segments[0] if len(segments) > 1 else "Romeo",
                "variant": variant,
                "format": Path(path).suffix[1:].lower(),
                "updated": dates[repo_path],
                "moduleDate": header.get("date", ""),
                "description": header.get("desc", ""),
                "url": base + urllib.parse.quote(repo_path, safe="/"),
                "github": "https://github.com/ifflagged/Romeo/blob/main/" + urllib.parse.quote(repo_path, safe="/"),
            })
    items.sort(key=lambda x: (x["updated"], x["path"]), reverse=True)
    payload = {"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "sourceRevision": sha, "items": items}
    output.mkdir(parents=True, exist_ok=True)
    # JavaScript data file works both on GitHub Pages and via file:// (fetch() does not).
    (output / "data.js").write_text("window.ROMEO_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Generated {len(items)} modules; {len(dates)} changed paths; revision {sha[:12]}")
    return payload

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True, help="Romeo git clone containing full history")
    parser.add_argument("--archive", type=Path, help="Matching source tar.gz; downloaded if absent")
    parser.add_argument("--out", type=Path, default=Path(__file__).parent)
    args = parser.parse_args()
    sha = git("rev-parse", "HEAD", cwd=args.repo)
    archive = args.archive or args.out / "romeo-source.tar.gz"
    temporary = args.archive is None
    if temporary:
        url = "https://codeload.github.com/ifflagged/Romeo/tar.gz/" + sha
        print("Downloading source archive for", sha[:12], flush=True)
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=240) as source, archive.open("wb") as target:
            import shutil
            shutil.copyfileobj(source, target)
    try:
        build(args.repo, archive, args.out)
    finally:
        if temporary:
            archive.unlink(missing_ok=True)

if __name__ == "__main__":
    main()
