from typing import List, Optional
from pydantic import BaseModel


class LessonMeta(BaseModel):
    slug: str
    title: str
    difficulty: str
    done: bool = False


class LanguageMeta(BaseModel):
    id: str
    label: str
    icon: str
    total: int
    completed: int
    lessons: List[LessonMeta] = []


class LessonContent(BaseModel):
    slug: str
    title: str
    difficulty: str
    lang: str
    content: str  # raw markdown
    done: bool = False


class ProgressUpdate(BaseModel):
    lang: str
    slug: str
    done: bool
