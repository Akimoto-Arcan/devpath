/* DevPath — static GitHub Pages version */

const state = {
  languages: [],
  activeLang: null,
  activeSlug: null,
};

// ---- Storage (localStorage) ---------------------------------------------

function getProgress() {
  try {
    return JSON.parse(localStorage.getItem("devpath_progress") || "{}");
  } catch {
    return {};
  }
}

function saveProgress(lang, slug, done) {
  const progress = getProgress();
  if (!progress[lang]) progress[lang] = {};
  progress[lang][slug] = done;
  localStorage.setItem("devpath_progress", JSON.stringify(progress));
}

function isComplete(lang, slug) {
  const progress = getProgress();
  return !!(progress[lang] && progress[lang][slug]);
}

function countCompleted(langId) {
  const progress = getProgress();
  if (!progress[langId]) return 0;
  return Object.values(progress[langId]).filter(Boolean).length;
}

// ---- Data ---------------------------------------------------------------

async function loadLanguages() {
  const res = await fetch("lessons.json");
  const data = await res.json();

  state.languages = data.map(lang => ({
    ...lang,
    lessons: lang.lessons.map(l => ({
      ...l,
      done: isComplete(lang.id, l.slug),
    })),
    completed: countCompleted(lang.id),
    total: lang.lessons.length,
  }));
}

function getLesson(lang, slug) {
  const langData = state.languages.find(l => l.id === lang);
  if (!langData) return null;
  const lesson = langData.lessons.find(l => l.slug === slug);
  if (!lesson) return null;
  return { ...lesson, lang };
}

// ---- Render sidebar -----------------------------------------------------

function renderSidebar() {
  const nav = document.getElementById("lang-nav");
  nav.innerHTML = "";

  state.languages.forEach(lang => {
    const group = document.createElement("div");
    group.className = "lang-group";
    group.dataset.lang = lang.id;

    const completed = countCompleted(lang.id);
    const pct = lang.total > 0 ? Math.round((completed / lang.total) * 100) : 0;
    const isActive = state.activeLang === lang.id;

    group.innerHTML = `
      <div class="lang-header ${isActive ? "active" : ""}" data-lang="${lang.id}">
        <span class="lang-icon">${lang.icon}</span>
        <span class="lang-label">${lang.label}</span>
        <span class="lang-progress ${completed === lang.total && lang.total > 0 ? "done" : ""}">
          ${completed}/${lang.total}
        </span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="lesson-list ${isActive ? "open" : ""}">
        ${lang.lessons.map(l => {
          const done = isComplete(lang.id, l.slug);
          return `
          <div class="lesson-item ${done ? "completed" : ""} ${state.activeSlug === l.slug && isActive ? "active" : ""}"
               data-lang="${lang.id}" data-slug="${l.slug}">
            <span class="check-icon">${done ? "✓" : "○"}</span>
            <span>${l.title}</span>
          </div>`;
        }).join("")}
      </div>
    `;

    nav.appendChild(group);
  });

  nav.querySelectorAll(".lang-header").forEach(el => {
    el.addEventListener("click", () => toggleLang(el.dataset.lang));
  });

  nav.querySelectorAll(".lesson-item").forEach(el => {
    el.addEventListener("click", () => openLesson(el.dataset.lang, el.dataset.slug));
  });
}

// ---- Render welcome grid ------------------------------------------------

function renderWelcome() {
  const grid = document.getElementById("welcome-grid");
  grid.innerHTML = state.languages.map(l => `
    <div class="lang-card" data-lang="${l.id}">
      <span class="lang-card-icon">${l.icon}</span>
      <span class="lang-card-label">${l.label}</span>
    </div>
  `).join("");

  grid.querySelectorAll(".lang-card").forEach(el => {
    el.addEventListener("click", () => toggleLang(el.dataset.lang));
  });
}

// ---- Navigation ---------------------------------------------------------

function toggleLang(langId) {
  state.activeLang = state.activeLang === langId ? null : langId;
  state.activeSlug = null;
  renderSidebar();
  showWelcome();

  if (state.activeLang) {
    const lang = state.languages.find(l => l.id === langId);
    if (lang && lang.lessons.length > 0) {
      const firstIncomplete = lang.lessons.find(l => !isComplete(lang.id, l.slug)) || lang.lessons[0];
      openLesson(langId, firstIncomplete.slug);
    }
  }
}

function openLesson(lang, slug) {
  state.activeLang = lang;
  state.activeSlug = slug;
  renderSidebar();

  const lesson = getLesson(lang, slug);
  if (lesson) renderLesson(lesson);
}

// ---- Render lesson ------------------------------------------------------

function renderLesson(lesson) {
  document.getElementById("welcome").classList.add("hidden");
  document.getElementById("lesson-header").classList.remove("hidden");
  document.getElementById("lesson-nav").classList.remove("hidden");

  const langMeta = state.languages.find(l => l.id === lesson.lang);
  document.getElementById("breadcrumb").textContent =
    `${langMeta?.icon ?? ""} ${langMeta?.label ?? lesson.lang}`;

  document.getElementById("lesson-title").textContent = lesson.title;
  const badge = document.getElementById("difficulty-badge");
  badge.textContent = lesson.difficulty;
  badge.className = lesson.difficulty;

  const btn = document.getElementById("complete-btn");
  const done = isComplete(lesson.lang, lesson.slug);
  updateCompleteBtn(btn, done);
  btn.onclick = () => toggleComplete(lesson.lang, lesson.slug, btn);

  const body = document.getElementById("lesson-body");
  body.innerHTML = marked.parse(lesson.content);
  Prism.highlightAllUnder(body);

  const lang = state.languages.find(l => l.id === lesson.lang);
  const lessons = lang?.lessons ?? [];
  const idx = lessons.findIndex(l => l.slug === lesson.slug);

  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= lessons.length - 1;

  prevBtn.onclick = idx > 0
    ? () => openLesson(lesson.lang, lessons[idx - 1].slug)
    : null;
  nextBtn.onclick = idx < lessons.length - 1
    ? () => openLesson(lesson.lang, lessons[idx + 1].slug)
    : null;

  document.getElementById("main").scrollTo(0, 0);
}

function showWelcome() {
  document.getElementById("welcome").classList.remove("hidden");
  document.getElementById("lesson-header").classList.add("hidden");
  document.getElementById("lesson-nav").classList.add("hidden");
  document.getElementById("lesson-body").innerHTML = "";
}

// ---- Progress -----------------------------------------------------------

function updateCompleteBtn(btn, done) {
  btn.textContent = done ? "✓ Completed" : "Mark Complete";
  btn.classList.toggle("done", done);
}

function toggleComplete(lang, slug, btn) {
  const done = !isComplete(lang, slug);
  saveProgress(lang, slug, done);
  updateCompleteBtn(btn, done);
  renderSidebar();
}

// ---- Init ---------------------------------------------------------------

async function init() {
  marked.setOptions({ gfm: true, breaks: false });
  await loadLanguages();
  renderSidebar();
  renderWelcome();
}

init();
