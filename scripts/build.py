#!/usr/bin/env python3
"""Merge per-book JSON files into data/all.json and check them.

Usage: python3 scripts/build.py SRC_DIR [BOOKS_DIR]

SRC_DIR holds <book-id>.json files. If BOOKS_DIR (the book .txt files, not
part of this repo) is given, every quote is checked to appear verbatim in its
book.
"""
import json
import re
import sys
from pathlib import Path

ORDER = ["chudesa", "son", "telo", "iscelenie", "trum"]
BOOK_FILES = {
    "chudesa": "Чудеса естественного ума.txt",
    "son": "Тибетская йога сна и сновидений.txt",
    "telo": "Пробуждение священного тела (йога дыхания и движения).txt",
    "iscelenie": "Исцеление формой, энергией и светом.txt",
    "trum": "Тибетская йога тела, речи и ума.txt",
}
MAX_QUOTE = 320


def squash(s):
    s = s.lower().replace("ё", "е")
    s = re.sub(r"-\s*\n\s*", "", s)          # broken hyphenation
    s = re.sub(r"[«»\"“”„'’`]", "", s)
    s = re.sub(r"[—–-]", "-", s)
    return re.sub(r"[^\w]+", "", s)


def main():
    src = Path(sys.argv[1])
    books_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    out = Path(__file__).resolve().parent.parent / "data" / "all.json"
    books, problems = [], []

    for bid in ORDER:
        f = src / f"{bid}.json"
        if not f.exists():
            problems.append(f"{bid}: file missing")
            continue
        b = json.loads(f.read_text(encoding="utf-8"))
        b["id"] = bid
        chapters = {c["id"] for c in b["chapters"]}
        text = None
        if books_dir:
            raw = (books_dir / BOOK_FILES[bid]).read_text(encoding="utf-8")
            # drop page-number and watermark lines that interrupt sentences
            raw = re.sub(r"(?m)^\s*(\d{1,3}|.*e-puzzle\.ru.*)\s*$\n?", "", raw)
            text = squash(raw)

        def check_ch(kind, name, chs):
            for c in chs or []:
                if c not in chapters:
                    problems.append(f"{bid}: {kind} «{name}» refers to unknown chapter {c}")

        def check_quote(q, where):
            t = q.get("text", "")
            if len(t) > MAX_QUOTE:
                problems.append(f"{bid}: quote too long ({len(t)}) in {where}")
            if q.get("chapter") not in chapters:
                problems.append(f"{bid}: quote in {where} has unknown chapter {q.get('chapter')}")
            if text is not None and squash(t) not in text:
                problems.append(f"{bid}: quote not verbatim in {where}: {t[:70]}…")

        for t in b.get("terms", []):
            check_ch("term", t["term"], t.get("chapters"))
            if t.get("quote", {}).get("text"):
                check_quote(t["quote"], f"term «{t['term']}»")
        for p in b.get("practices", []):
            check_ch("practice", p["name"], p.get("chapters"))
        for i in b.get("ideas", []):
            check_ch("idea", i["title"], i.get("chapters"))
        for n, q in enumerate(b.get("quotes", [])):
            check_quote(q, f"quote #{n}")
        books.append(b)

    result = {"books": books}
    texts = {}
    mf = src / "mantras.json"
    if mf.exists():
        m = json.loads(mf.read_text(encoding="utf-8"))
        by_id = {b["id"]: b for b in books}
        groups = {g["id"] for g in m["groups"]}
        for x in m["mantras"]:
            where = f"mantra «{x['name']}»"
            if x["group"] not in groups:
                problems.append(f"{where}: unknown group {x['group']}")
            for r in x.get("refs", []):
                chs = {c["id"] for c in by_id[r["book"]]["chapters"]}
                problems += [f"{where}: unknown chapter {r['book']}/{c}" for c in r["chapters"] if c not in chs]
            for ref in x.get("practices", []):
                bid, idx = ref.split("/")
                if int(idx) >= len(by_id[bid].get("practices", [])):
                    problems.append(f"{where}: unknown practice {ref}")
            if books_dir:
                for bid, t in x.get("check", []):
                    if bid not in texts:
                        raw = (books_dir / BOOK_FILES[bid]).read_text(encoding="utf-8")
                        texts[bid] = squash(re.sub(r"(?m)^\s*(\d{1,3}|.*e-puzzle\.ru.*)\s*$\n?", "", raw))
                    if squash(t) not in texts[bid]:
                        problems.append(f"{where}: not found in {bid}: {t[:60]}…")
            x.pop("check", None)
        result["mantraGroups"] = m["groups"]
        result["mantras"] = m["mantras"]
        print(f"mantras    {len(m['mantras'])}")
    bf = src / "breath.json"
    if bf.exists():
        br = json.loads(bf.read_text(encoding="utf-8"))
        by_id = {b["id"]: b for b in books}
        groups = {g["id"] for g in br["groups"]}
        ids = {x["id"] for x in br["items"]}
        for x in br["items"]:
            where = f"breath «{x['name']}»"
            if x["group"] not in groups:
                problems.append(f"{where}: unknown group {x['group']}")
            problems += [f"{where}: unknown related {r}" for r in x.get("related", []) if r not in ids]
            for v in x["versions"]:
                chs = {c["id"] for c in by_id[v["book"]]["chapters"]}
                problems += [f"{where}: unknown chapter {v['book']}/{c}" for c in v.get("chapters", []) if c not in chs]
                if v.get("practice"):
                    bid, idx = v["practice"].split("/")
                    if bid != v["book"] or int(idx) >= len(by_id[bid].get("practices", [])):
                        problems.append(f"{where}: bad practice {v['practice']}")
                q = v.get("quote")
                if q:
                    if q.get("chapter") not in chs:
                        problems.append(f"{where}: quote has unknown chapter {q.get('chapter')}")
                    if len(q["text"]) > MAX_QUOTE:
                        problems.append(f"{where}: quote too long")
                    if books_dir:
                        if v["book"] not in texts:
                            raw = (books_dir / BOOK_FILES[v["book"]]).read_text(encoding="utf-8")
                            texts[v["book"]] = squash(re.sub(r"(?m)^\s*(\d{1,3}|.*e-puzzle\.ru.*)\s*$\n?", "", raw))
                        if squash(q["text"]) not in texts[v["book"]]:
                            problems.append(f"{where}: quote not verbatim in {v['book']}: {q['text'][:60]}…")
        result["breathGroups"] = br["groups"]
        result["breathDifferences"] = br.get("differences", [])
        result["breath"] = br["items"]
        print(f"breath     {len(br['items'])}")
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for b in books:
        nq = len(b.get("quotes", [])) + sum(1 for t in b.get("terms", []) if t.get("quote", {}).get("text"))
        print(f"{b['id']:10} chapters={len(b['chapters']):3} terms={len(b.get('terms', [])):3} "
              f"practices={len(b.get('practices', [])):3} ideas={len(b.get('ideas', [])):3} quotes={nq:3}")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
    if problems:
        print(f"\n{len(problems)} problem(s):")
        print("\n".join("  " + p for p in problems))
        sys.exit(1)


if __name__ == "__main__":
    main()
