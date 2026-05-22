/* DevPath — frontend app */

const state = {
  languages: [],
  activeLang: null,
  activeSlug: null,
};

// ---- API ----------------------------------------------------------------

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function loadLanguages() {
  state.languages = await api('/api/languages');
}

async function loadLesson(lang, slug) {
  return api(`/api/languages/${lang}/lessons/${slug}`);
}

async function setProgress(lang, slug, done) {
  return api('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang, slug, done }),
  });
}

// ---- Render sidebar -----------------------------------------------------

function renderSidebar() {
  const nav = document.getElementById('lang-nav');
  nav.innerHTML = '';

  state.languages.forEach(lang => {
    const group = document.createElement('div');
    group.className = 'lang-group';
    group.dataset.lang = lang.id;

    const pct = lang.total > 0 ? Math.round((lang.completed / lang.total) * 100) : 0;
    const isActive = state.activeLang === lang.id;

    group.innerHTML = `
      <div class="lang-header ${isActive ? 'active' : ''}" data-lang="${lang.id}">
        <span class="lang-icon">${lang.icon}</span>
        <span class="lang-label">${lang.label}</span>
        <span class="lang-progress ${lang.completed === lang.total && lang.total > 0 ? 'done' : ''}">
          ${lang.completed}/${lang.total}
        </span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="lesson-list ${isActive ? 'open' : ''}">
        ${lang.lessons.map(l => `
          <div class="lesson-item ${l.done ? 'completed' : ''} ${state.activeSlug === l.slug && isActive ? 'active' : ''}"
               data-lang="${lang.id}" data-slug="${l.slug}">
            <span class="check-icon">${l.done ? '✓' : '○'}</span>
            <span>${l.title}</span>
          </div>
        `).join('')}
      </div>
    `;

    nav.appendChild(group);
  });

  // Events
  nav.querySelectorAll('.lang-header').forEach(el => {
    el.addEventListener('click', () => toggleLang(el.dataset.lang));
  });

  nav.querySelectorAll('.lesson-item').forEach(el => {
    el.addEventListener('click', () => openLesson(el.dataset.lang, el.dataset.slug));
  });
}

// ---- Render welcome grid ------------------------------------------------

function renderWelcome() {
  const grid = document.getElementById('welcome-grid');
  grid.innerHTML = state.languages.map(l => `
    <div class="lang-card" data-lang="${l.id}">
      <span class="lang-card-icon">${l.icon}</span>
      <span class="lang-card-label">${l.label}</span>
    </div>
  `).join('');

  grid.querySelectorAll('.lang-card').forEach(el => {
    el.addEventListener('click', () => toggleLang(el.dataset.lang));
  });
}

// ---- Navigation ---------------------------------------------------------

function toggleLang(langId) {
  state.activeLang = state.activeLang === langId ? null : langId;
  state.activeSlug = null;
  renderSidebar();
  showWelcome();

  // Auto-open first lesson if language has any
  if (state.activeLang) {
    const lang = state.languages.find(l => l.id === langId);
    if (lang && lang.lessons.length > 0) {
      const firstIncomplete = lang.lessons.find(l => !l.done) || lang.lessons[0];
      openLesson(langId, firstIncomplete.slug);
    }
  }
}

async function openLesson(lang, slug) {
  state.activeLang = lang;
  state.activeSlug = slug;
  renderSidebar();

  const lesson = await loadLesson(lang, slug);
  renderLesson(lesson);
}

// ---- Render lesson ------------------------------------------------------

function renderLesson(lesson) {
  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('lesson-header').classList.remove('hidden');
  document.getElementById('lesson-nav').classList.remove('hidden');

  // Breadcrumb
  const langMeta = state.languages.find(l => l.id === lesson.lang);
  document.getElementById('breadcrumb').textContent =
    `${langMeta?.icon ?? ''} ${langMeta?.label ?? lesson.lang}`;

  // Title + badge
  document.getElementById('lesson-title').textContent = lesson.title;
  const badge = document.getElementById('difficulty-badge');
  badge.textContent = lesson.difficulty;
  badge.className = lesson.difficulty;

  // Complete button
  const btn = document.getElementById('complete-btn');
  updateCompleteBtn(btn, lesson.done);
  btn.onclick = () => toggleComplete(lesson.lang, lesson.slug, btn);

  // Lesson body — render markdown, then highlight
  const body = document.getElementById('lesson-body');
  body.innerHTML = marked.parse(lesson.content);
  Prism.highlightAllUnder(body);

  // Prev / Next
  const lang = state.languages.find(l => l.id === lesson.lang);
  const lessons = lang?.lessons ?? [];
  const idx = lessons.findIndex(l => l.slug === lesson.slug);

  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= lessons.length - 1;

  prevBtn.onclick = idx > 0
    ? () => openLesson(lesson.lang, lessons[idx - 1].slug)
    : null;
  nextBtn.onclick = idx < lessons.length - 1
    ? () => openLesson(lesson.lang, lessons[idx + 1].slug)
    : null;

  // Scroll to top
  document.getElementById('main').scrollTo(0, 0);
}

function showWelcome() {
  document.getElementById('welcome').classList.remove('hidden');
  document.getElementById('lesson-header').classList.add('hidden');
  document.getElementById('lesson-nav').classList.add('hidden');
  document.getElementById('lesson-body').innerHTML = '';
}

// ---- Progress -----------------------------------------------------------

function updateCompleteBtn(btn, done) {
  btn.textContent = done ? '✓ Completed' : 'Mark Complete';
  btn.classList.toggle('done', done);
}

async function toggleComplete(lang, slug, btn) {
  const langMeta = state.languages.find(l => l.id === lang);
  const lesson = langMeta?.lessons.find(l => l.slug === slug);
  if (!lesson) return;

  const newDone = !lesson.done;
  await setProgress(lang, slug, newDone);

  // Update local state
  lesson.done = newDone;
  if (newDone) {
    langMeta.completed = Math.min(langMeta.total, langMeta.completed + 1);
  } else {
    langMeta.completed = Math.max(0, langMeta.completed - 1);
  }

  updateCompleteBtn(btn, newDone);
  renderSidebar();
}

// ---- Init ---------------------------------------------------------------

async function init() {
  // Configure marked
  marked.setOptions({ gfm: true, breaks: false });

  await loadLanguages();
  renderSidebar();
  renderWelcome();
}

init();
