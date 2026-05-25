"""
Build script — bundles all lessons into a single lessons.json for static hosting.
Run this after adding or editing any lesson markdown files.
"""
import json
import re
from pathlib import Path

LESSONS_DIR = Path("lessons")
INDEX_FILE = LESSONS_DIR / "index.json"
OUT_FILE = Path("docs/lessons.json")


def parse_lesson(path):
    text = path.read_text(encoding="utf-8")

    difficulty = "intermediate"
    fm_match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if fm_match:
        fm = fm_match.group(1)
        d = re.search(r"difficulty:\s*(\S+)", fm)
        if d:
            difficulty = d.group(1)
        text = text[fm_match.end():]

    h1 = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    title = h1.group(1).strip() if h1 else path.stem.replace("_", " ").title()

    return {
        "slug": path.stem,
        "title": title,
        "difficulty": difficulty,
        "content": text.strip(),
    }


def main():
    index = json.loads(INDEX_FILE.read_text())
    output = []

    for lang in index:
        lang_dir = LESSONS_DIR / lang["id"]
        lesson_files = sorted(lang_dir.glob("*.md")) if lang_dir.exists() else []

        lessons = [parse_lesson(f) for f in lesson_files]

        output.append({
            "id": lang["id"],
            "label": lang["label"],
            "icon": lang["icon"],
            "lessons": lessons,
        })

    OUT_FILE.write_text(json.dumps(output, indent=2), encoding="utf-8")

    total = sum(len(l["lessons"]) for l in output)
    print(f"Built {total} lessons across {len(output)} languages → {OUT_FILE}")


if __name__ == "__main__":
    main()
