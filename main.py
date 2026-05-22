import json
import re
from pathlib import Path
from typing import Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import get_conn, init_db
from models import LanguageMeta, LessonContent, LessonMeta, ProgressUpdate

LESSONS_DIR = Path("lessons")
INDEX_FILE = LESSONS_DIR / "index.json"

app = FastAPI(
    title="DevPath",
    description="Interactive programming lessons for intermediate developers.",
    version="1.0.0",
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse("static/index.html")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_index() -> List[dict]:
    return json.loads(INDEX_FILE.read_text())


def _parse_lesson(path: Path) -> dict:
    """Extract title and difficulty from markdown frontmatter + first H1."""
    text = path.read_text(encoding="utf-8")

    # Parse frontmatter
    difficulty = "intermediate"
    fm_match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if fm_match:
        fm = fm_match.group(1)
        d = re.search(r"difficulty:\s*(\S+)", fm)
        if d:
            difficulty = d.group(1)
        text = text[fm_match.end():]

    # First H1 is the title
    h1 = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    title = h1.group(1).strip() if h1 else path.stem.replace("_", " ").title()

    return {"title": title, "difficulty": difficulty, "content": text.strip()}


def _get_progress(lang: str) -> Dict[str, bool]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT slug, done FROM progress WHERE lang = ?", (lang,)
        ).fetchall()
    return {r["slug"]: bool(r["done"]) for r in rows}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/languages", response_model=List[LanguageMeta], tags=["Lessons"])
def get_languages() -> List[LanguageMeta]:
    index = _load_index()
    result = []

    for lang in index:
        lang_dir = LESSONS_DIR / lang["id"]
        lesson_files = sorted(lang_dir.glob("*.md")) if lang_dir.exists() else []
        progress = _get_progress(lang["id"])

        lessons = []
        for f in lesson_files:
            parsed = _parse_lesson(f)
            slug = f.stem
            lessons.append(LessonMeta(
                slug=slug,
                title=parsed["title"],
                difficulty=parsed["difficulty"],
                done=progress.get(slug, False),
            ))

        completed = sum(1 for l in lessons if l.done)
        result.append(LanguageMeta(
            id=lang["id"],
            label=lang["label"],
            icon=lang["icon"],
            total=len(lessons),
            completed=completed,
            lessons=lessons,
        ))

    return result


@app.get("/api/languages/{lang}/lessons/{slug}", response_model=LessonContent, tags=["Lessons"])
def get_lesson(lang: str, slug: str) -> LessonContent:
    path = LESSONS_DIR / lang / f"{slug}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Lesson '{slug}' not found in '{lang}'.")

    parsed = _parse_lesson(path)
    progress = _get_progress(lang)

    return LessonContent(
        slug=slug,
        title=parsed["title"],
        difficulty=parsed["difficulty"],
        lang=lang,
        content=parsed["content"],
        done=progress.get(slug, False),
    )


@app.post("/api/progress", tags=["Progress"])
def update_progress(update: ProgressUpdate) -> dict:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO progress (lang, slug, done, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(lang, slug) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at
            """,
            (update.lang, update.slug, int(update.done)),
        )
    return {"ok": True, "lang": update.lang, "slug": update.slug, "done": update.done}


@app.get("/api/progress", tags=["Progress"])
def get_all_progress() -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT lang, slug, done FROM progress").fetchall()
    result: dict = {}
    for r in rows:
        result.setdefault(r["lang"], {})[r["slug"]] = bool(r["done"])
    return result
