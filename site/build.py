"""Build the static reader from the canonical Markdown and bundled Quran text."""
from hashlib import sha256
from html import escape
from pathlib import Path
import json
import re
import unicodedata

HERE = Path(__file__).resolve().parent
DIST = HERE / "dist"
IDS = ("wake", "fajr", "dhuhr", "asr", "maghrib", "isha", "sleep")
NUMBERS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
QURAN = json.loads((HERE / "quran.json").read_text())

def readable(text):
    # Unfold legacy glyphs copied into the Markdown without normalizing Quran diacritics.
    return "".join(
        unicodedata.normalize("NFKC", c) if 0xFB50 <= ord(c) <= 0xFDFF or 0xFE70 <= ord(c) <= 0xFEFF else c
        for c in re.sub(r"[اﺍﺎ]ﷲ", "ﷲ", text)
    ).replace("ـ", "")

def passages(entry):
    references = {
        "الإخلاص": "الإخلاص",
        "الفلق": "سورة الفلق",
        "الناس": "سورة الناس",
        "الكافرون": "سورة الكافرون",
        "الأعلى": "سورة الأعلى",
        "آية الكرسي": "آية الكرسي",
    }
    text = entry["text"]
    names = sorted(
        (name for name, phrase in references.items() if phrase in text),
        key=lambda name: text.index(references[name]),
    )
    if "المعوذتين" in text:
        names.extend(name for name in ("الفلق", "الناس") if name not in names)
    result = []
    for name in names:
        passage = QURAN[name]
        verses = " ".join(
            f'{escape(verse)} <span class="verse-number">{key.split(":")[-1].translate(NUMBERS)}</span>'
            for key, verse in passage["verses"]
        )
        result.append(f'<div class="quran"><h3>{escape(passage["title"])}</h3><p>{verses}</p></div>')
    result.extend(f'<p class="quran">{escape(quote)}</p>' for quote in entry["quotes"])
    return "\n".join(result)

def parse_markdown():
    routines = []
    for number, raw in enumerate((HERE.parent / "ورد.md").read_text().splitlines(), 1):
        line = raw.strip()
        if not line or number == 1:
            continue
        if line.startswith("# "):
            title = re.sub(r"^[٠-٩]+\. ", "", line[2:])
            routine = {"id": IDS[len(routines)], "title": title, "groups": []}
            routines.append(routine)
            phase = ""
            group = None
        elif line.startswith("## "):
            phase = {"قبل الصلاة": "before", "بعد الصلاة": "after"}[line[3:]]
            group = None
        elif line.startswith("### "):
            group = {"title": line[4:].strip("*"), "phase": phase, "entries": []}
            routine["groups"].append(group)
        elif line.startswith(">"):
            quote = line[1:].strip()
            if quote:
                group["entries"][-1]["quotes"].append(quote)
        else:
            if group is None:
                group = {"title": "", "phase": phase, "entries": []}
                routine["groups"].append(group)
            group["entries"].append({"line": number, "text": readable(line.removeprefix("- ")), "quotes": []})
    if len(routines) != len(IDS):
        raise ValueError("The source must contain seven routines")
    return routines

def render_routine(routine):
    sections = []
    for index, group in enumerate(routine["groups"]):
        title, phase = group["title"], group["phase"]
        entries = []
        for entry in group["entries"]:
            text = re.sub(r"(٣٣|٣٤)", r'<span class="repeat">\1</span>', escape(entry["text"]))
            entries.append(f'<li data-source-line="{entry["line"]}"><p>{text}</p>{passages(entry)}</li>')
        heading = f"<h2>{escape(title)}</h2>" if title else ""
        sections.append(
            f'<section class="topic" id="{routine["id"]}-{index + 1}" data-phase="{phase}">'
            + heading + '<ul role="list">' + "\n".join(entries) + "</ul></section>"
        )
    return f'<template id="routine-{routine["id"]}">\n' + "\n".join(sections) + "\n</template>"

def build():
    routines = parse_markdown()
    nav = "".join(
        f'<button type="button" data-routine="{r["id"]}"><span>{escape(r["title"])}</span><small></small></button>'
        for r in routines
    )
    document = (HERE / "reader.html").read_text()
    (DIST / "index.html").write_text(document.replace("<!-- ROUTINES -->", "\n".join(map(render_routine, routines))).replace("<!-- DAY -->", nav))
    assets = ["index.html", "reader.css", "app.js", "schedule.js", "manifest.webmanifest"]
    assets += [f"awrad-logo-{size}.png" for size in (32, 180, 192, 512)]
    assets.append("awrad-logo-maskable-512.png")
    assets += ["fonts/IBMPlexSansArabic-Regular.woff2", "fonts/IBMPlexSansArabic-Medium.woff2"]
    digest = sha256()
    for asset in assets:
        digest.update((DIST / asset).read_bytes())
    worker = (HERE / "worker.js").read_text()
    digest.update(worker.encode())
    worker = worker.replace("__CACHE_VERSION__", digest.hexdigest()[:12]).replace("__ASSETS__", json.dumps(assets))
    (DIST / "sw.js").write_text(worker)
    print("Built", ", ".join(f"{r['id']} ({sum(len(g['entries']) for g in r['groups'])})" for r in routines))

if __name__ == "__main__":
    build()
