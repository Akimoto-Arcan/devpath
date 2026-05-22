# DevPath

A self-hosted interactive learning platform for intermediate developers. Dark theme, progress tracking, syntax-highlighted lessons across 7 languages.

**Not for beginners.** Every lesson assumes you already know the basics and want to understand the concept beneath the syntax.

---

## Languages & Topics

| Language | Lessons |
|----------|---------|
| 🐍 Python | Decorators, Generators, Context Managers, Type Hints & Dataclasses, Async/Await |
| 🐘 PHP | Namespaces & Autoloading, Traits, Interfaces vs Abstract Classes, PHP 8 Features, Closures |
| 🟨 JavaScript | The Event Loop, Closures, Promises & Async, Prototypes, Modern ES6+ Patterns |
| 🗄️ SQL | Execution Plans, Window Functions, CTEs & Recursive Queries, Index Strategy, Transactions & Isolation |
| 🌙 Lua | Metatables, OOP Patterns, Coroutines, Closures & Upvalues, Standard Library |
| ⚙️ C++ | Pointers vs References, RAII, Smart Pointers, STL Containers & Algorithms, Move Semantics |
| 🖥️ Bash | Arrays, Functions, Error Handling, Process Substitution, String Manipulation |

Each lesson includes a concept explanation, a complete working code example, practical context, a coding exercise, and a collapsible hint + solution.

---

## Quick Start

```bash
git clone https://github.com/Akimoto-Arcan/devpath.git
cd devpath
pip install -r requirements.txt
uvicorn main:app --reload
```

Open `http://localhost:8000` in your browser.

Interactive API docs at `http://localhost:8000/docs`.

---

## Adding Lessons

Lessons are markdown files in `lessons/{language}/`. Name them `##_slug.md` and they appear in order automatically.

```
lessons/
  python/
    01_decorators.md
    06_your_new_lesson.md   ← just add a file
```

Frontmatter (optional):

```markdown
---
difficulty: intermediate   # beginner | intermediate | advanced
---

# Lesson Title

Content here...
```

---

## Stack

- **FastAPI** — serves lesson content via REST API, auto-generated OpenAPI docs
- **SQLite** — progress tracking, zero setup
- **Marked.js** — client-side markdown rendering
- **Prism.js** — syntax highlighting for all 7 languages
- Vanilla JS, no framework

---

## Project Structure

```
devpath/
├── main.py          # FastAPI app and routes
├── database.py      # SQLite init and connection
├── models.py        # Pydantic models
├── requirements.txt
├── static/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── lessons/
    ├── index.json   # language metadata
    ├── python/
    ├── php/
    ├── javascript/
    ├── sql/
    ├── lua/
    ├── cpp/
    └── bash/
```

---

## License

MIT
