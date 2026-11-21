#!/usr/bin/env python3
"""Bundle the dashboard into ONE self-contained HTML file: dist/mis-dashboard.html

The local CSS and JavaScript are inlined. The three open-source libraries
(SheetJS, ExcelJS, Chart.js) still load from cdnjs, so an internet connection
is needed when the page is opened.

Usage:  python3 build.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "index.html"
OUT = ROOT / "dist" / "mis-dashboard.html"


def main() -> None:
    html = SRC.read_text(encoding="utf-8")

    def inline_css(match: re.Match) -> str:
        css = (ROOT / match.group(1)).read_text(encoding="utf-8")
        return "<style>\n" + css + "\n</style>"

    def inline_js(match: re.Match) -> str:
        js = (ROOT / match.group(1)).read_text(encoding="utf-8")
        return "<script>\n" + js.replace("</script>", "<\\/script>") + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="(assets/[^"]+)">', inline_css, html)
    html = re.sub(r'<script src="(assets/[^"]+)"></script>', inline_js, html)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
