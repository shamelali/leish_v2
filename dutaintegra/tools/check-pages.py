#!/usr/bin/env python3
"""Static checks for the Duta Integra merged site. No dependencies.

    python3 tools/check-pages.py            # run from the dutaintegra/ folder

Checks, per HTML page:
  1. tag balance / stray end tags
  2. every data-en has a data-ms (and every data-en-placeholder a data-ms-placeholder)
  3. every class used in the markup exists in assets/css/site.css
  4. every in-page #anchor resolves to an id on the same page
  5. every local file reference exists on disk

Exit code is 1 if anything fails, so it can be dropped into CI or a git hook.
"""

from __future__ import annotations

import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["index.html", "ai-outbound.html"]
VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


class Audit(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, tuple[int, int]]] = []
        self.errors: list[str] = []
        self.mismatched_pairs: list[str] = []
        self.pairs = 0
        self.ids: set[str] = set()
        self.classes: set[str] = set()
        self.hrefs: list[str] = []
        self.srcs: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)

        if "id" in a:
            self.ids.add(a["id"])
        for cls in (a.get("class") or "").split():
            self.classes.add(cls)
        if "href" in a:
            self.hrefs.append(a["href"])
        for key in ("src", "data-src"):
            if key in a:
                self.srcs.append(a[key])

        for first, second in (
            ("data-en", "data-ms"),
            ("data-en-placeholder", "data-ms-placeholder"),
        ):
            if (first in a) != (second in a):
                self.mismatched_pairs.append(f"<{tag}> has {first} without {second}")
            if first in a:
                self.pairs += 1

        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"stray </{tag}> at line {self.getpos()[0]}")
            return
        if self.stack[-1][0] != tag:
            open_tag, pos = self.stack[-1]
            self.errors.append(
                f"</{tag}> at line {self.getpos()[0]} closes <{open_tag}> opened at line {pos[0]}"
            )
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    del self.stack[i:]
                    return
            return
        self.stack.pop()


def css_classes() -> set[str]:
    path = os.path.join(ROOT, "assets", "css", "site.css")
    with open(path, encoding="utf-8") as fh:
        return set(re.findall(r"\.([A-Za-z][\w-]*)", fh.read()))


def main() -> int:
    defined = css_classes()
    failures = 0

    for page in PAGES:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            print(f"FAIL {page}: missing")
            failures += 1
            continue

        with open(path, encoding="utf-8") as fh:
            html = fh.read()

        audit = Audit()
        audit.feed(html)

        problems: list[str] = []
        problems += audit.errors
        problems += [f"unclosed <{tag}> (line {pos[0]})" for tag, pos in audit.stack]
        problems += audit.mismatched_pairs

        unknown = sorted(c for c in audit.classes if c not in defined)
        if unknown:
            problems.append(f"classes with no CSS rule: {', '.join(unknown)}")

        for href in audit.hrefs:
            if href.startswith("#") and href != "#":
                if href[1:] not in audit.ids:
                    problems.append(f"anchor {href} has no matching id")
            elif not href.startswith(("http://", "https://", "mailto:", "tel:", "data:", "#", "//")):
                target = href.split("#")[0]
                if target and not os.path.exists(os.path.join(ROOT, target)):
                    problems.append(f"local link {href} not found on disk")

        for src in audit.srcs:
            if src.startswith(("http://", "https://", "data:", "//")):
                continue
            if not os.path.exists(os.path.join(ROOT, src)):
                problems.append(f"asset {src} not found on disk")

        status = "PASS" if not problems else "FAIL"
        print(f"{status} {page} — {audit.pairs} bilingual pairs, {len(audit.classes)} classes")
        for problem in problems:
            print(f"     · {problem}")
        failures += len(problems)

    print("\nall checks passed" if not failures else f"\n{failures} problem(s) found")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
