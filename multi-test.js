// Multi-test selector + per-test saves + chapter navigation.
(() => {
  const SELECTED_KEY = 'quiz_selected_test_v2';

  const TESTS = {
    physio527: {
      id: 'physio527',
      name: 'Медицинская сестра по физиотерапии (старшая), медицинский брат по физиотерапии (старший)',
      description: '527 вопросов',
      file: 'moodle_527_questions_with_answers.json',
      compressed: false,
      version: '54e779ae9103',
      storageKey: 'moodle527_session_54e779ae9103'
    },
    general306: {
      id: 'general306',
      name: 'Вопросы по общепрофессиональным дисциплинам (дополнительные) СCО',
      description: '306 вопросов · 8 глав',
      file: 'moodle_306_questions_with_answers_and_sections.json.gz',
      compressed: true,
      version: 'general306-v1',
      storageKey: 'moodle306_general_session_v1'
    }
  };

  let activeTestId = localStorage.getItem(SELECTED_KEY);
  if (!TESTS[activeTestId]) activeTestId = 'physio527';

  const baseNormalize = normalizeSource;
  const baseRenderHome = renderHome;
  const baseRenderQuiz = renderQuiz;
  const baseRenderCurrentQuestion = renderCurrentQuestion;

  const clean = value => String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function activeConfig() {
    return TESTS[activeTestId];
  }

  function normalizeGeneralSource(source) {
    const questions = (source.questions || []).map((raw, index) => {
      const options = [];
      const seen = new Set();

      for (const option of raw.options || []) {
        const text = clean(option?.text);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        options.push(text);
      }

      const correct = [...new Set(
        (raw.correctAnswers || [])
          .map(clean)
          .filter(text => options.includes(text))
      )];

      if (raw.type === 'single_choice' && correct.length !== 1) {
        throw new Error(`Не найден однозначный ответ для вопроса №${raw.number || index + 1}`);
      }
      if (raw.type === 'multiple_choice' && !correct.length) {
        throw new Error(`Не найдены ответы для вопроса №${raw.number || index + 1}`);
      }

      return {
        id: Number(raw.number || index + 1),
        text: clean(raw.question),
        type: raw.type === 'multiple_choice' ? 'multiple' : 'single',
        options,
        correct,
        chapter: clean(raw.chapter) || null
      };
    }).sort((a, b) => a.id - b.id);

    const sections = (source.sections || [])
      .map(section => ({
        name: clean(section.name),
        start: Number(section.start),
        end: Number(section.end)
      }))
      .filter(section => section.name && Number.isInteger(section.start) && Number.isInteger(section.end));

    for (const q of questions) {
      if (!q.chapter) {
        q.chapter = sections.find(s => q.id >= s.start && q.id <= s.end)?.name || null;
      }
    }

    return {
      title: TESTS.general306.name,
      total: questions.length,
      singleCount: questions.filter(q => q.type === 'single').length,
      multipleCount: questions.filter(q => q.type === 'multiple').length,
      sections,
      questions
    };
  }

  normalizeSource = function(source) {
    if (Array.isArray(source?.sections) && Number(source?.totalQuestions) === 306) {
      return normalizeGeneralSource(source);
    }

    const normalized = baseNormalize(source);
    normalized.sections ||= [];
    normalized.questions.forEach(q => { q.chapter ||= null; });
    normalized.title = TESTS.physio527.name;
    return normalized;
  };

  // Separate save slot for every test. The old test keeps its original key,
  // therefore previously saved progress remains available.
  saveState = function() {
    if (!state) return;
    localStorage.setItem(activeConfig().storageKey, JSON.stringify(state));
  };

  loadState = function() {
    try {
      const raw = localStorage.getItem(activeConfig().storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.datasetVersion !== activeConfig().version) return null;

      parsed.answers ||= {};
      parsed.checked ||= {};
      parsed.viewed ||= {};
      if (!Number.isInteger(parsed.current) || parsed.current < 0 || parsed.current >= bank.total) parsed.current = 0;
      return parsed;
    } catch {
      return null;
    }
  };

  createState = function(mode, feedback) {
    return {
      datasetVersion: activeConfig().version,
      testId: activeTestId,
      mode,
      feedback,
      current: 0,
      answers: {},
      checked: {},
      viewed: {},
      finished: false,
      startedAt: Date.now(),
      finishedAt: null
    };
  };

  async function fetchTestSource(config) {
    const response = await fetch(config.file, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!config.compressed) return response.json();

    if (typeof DecompressionStream !== 'function') {
      throw new Error('Для второго теста нужен современный Chrome/браузер с поддержкой gzip.');
    }

    const compressed = await response.arrayBuffer();
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  async function switchTest(nextId) {
    if (!TESTS[nextId] || nextId === activeTestId) return;

    activeTestId = nextId;
    localStorage.setItem(SELECTED_KEY, activeTestId);
    state = null;

    app.innerHTML = `
      <div class="loading-screen">
        <div class="loader"></div>
        <div>Загружаю ${escapeHtml(activeConfig().description)}…</div>
      </div>`;

    try {
      const source = await fetchTestSource(activeConfig());
      bank = normalizeSource(source);
      state = loadState();
      document.title = `Тренировочный тест — ${activeConfig().name}`;
      renderHome();
    } catch (error) {
      console.error(error);
      app.innerHTML = `
        <main class="result-page">
          <section class="result-card">
            <div class="result-kicker">Ошибка загрузки</div>
            <h1>Не удалось открыть тест</h1>
            <p>${escapeHtml(error.message || error)}</p>
            <div class="result-actions"><button class="btn primary" id="backToTests">Вернуться</button></div>
          </section>
        </main>`;
      document.getElementById('backToTests')?.addEventListener('click', () => {
        activeTestId = activeTestId === 'physio527' ? 'general306' : 'physio527';
        localStorage.setItem(SELECTED_KEY, activeTestId);
        location.reload();
      });
    }
  }

  function injectTestPicker() {
    const page = document.querySelector('.home-page');
    if (!page || document.querySelector('.test-picker')) return;

    const block = document.createElement('section');
    block.className = 'test-picker';
    block.innerHTML = `
      <div class="test-picker-head">
        <div>
          <div class="eyebrow">Банк вопросов</div>
          <h2>Выберите тест</h2>
        </div>
        <span class="test-picker-current">${escapeHtml(activeConfig().description)}</span>
      </div>
      <div class="test-choice-grid">
        ${Object.values(TESTS).map(test => `
          <label class="test-choice ${test.id === activeTestId ? 'selected' : ''}">
            <input type="radio" name="selectedTest" value="${test.id}" ${test.id === activeTestId ? 'checked' : ''}>
            <span class="test-choice-main">
              <strong>${escapeHtml(test.name)}</strong>
              <small>${escapeHtml(test.description)}</small>
            </span>
            <span class="test-choice-check">✓</span>
          </label>`).join('')}
      </div>`;

    page.prepend(block);

    block.querySelectorAll('input[name="selectedTest"]').forEach(input => {
      input.addEventListener('change', () => switchTest(input.value));
    });
  }

  renderHome = function() {
    baseRenderHome();

    const badge = document.querySelector('.hero-badge');
    if (badge) {
      badge.textContent = `${bank.total} вопросов · ${bank.singleCount} одиночных · ${bank.multipleCount} множественных`;
    }

    const heroText = document.querySelector('.hero p');
    if (heroText) {
      heroText.textContent = activeConfig().name;
    }

    injectTestPicker();
  };

  buildQuestionGrid = function() {
    const grid = document.getElementById('questionGrid');
    if (!grid) return;

    if (!bank.sections?.length) {
      grid.classList.remove('has-chapters');
      grid.innerHTML = bank.questions
        .map((q, i) => `<button class="qnav" data-index="${i}" title="${escapeHtml(q.text)}">${q.id}</button>`)
        .join('');
    } else {
      grid.classList.add('has-chapters');
      grid.innerHTML = bank.sections.map(section => {
        const rows = bank.questions.filter(q => q.id >= section.start && q.id <= section.end);
        return `
          <section class="chapter-nav">
            <button class="chapter-nav-title" data-index="${rows[0]?.id - 1 ?? 0}" type="button">
              <span>${escapeHtml(section.name)}</span>
              <small>${section.start}–${section.end}</small>
            </button>
            <div class="chapter-nav-grid">
              ${rows.map(q => `<button class="qnav" data-index="${q.id - 1}" title="${escapeHtml(q.text)}">${q.id}</button>`).join('')}
            </div>
          </section>`;
      }).join('');
    }

    grid.addEventListener('click', event => {
      const question = event.target.closest('.qnav');
      if (question) {
        goTo(Number(question.dataset.index));
        closeNav();
        return;
      }

      const chapter = event.target.closest('.chapter-nav-title');
      if (chapter) {
        goTo(Number(chapter.dataset.index));
        closeNav();
      }
    });

    bank.questions.forEach(q => updateGridState(q.id));
    updateGridCurrent();
  };

  renderCurrentQuestion = function() {
    baseRenderCurrentQuestion();

    const q = bank.questions[state.current];
    if (!q?.chapter) return;

    const head = document.querySelector('.question-head');
    const index = head?.querySelector('.question-index');
    if (!head || !index || head.querySelector('.chapter-pill')) return;

    const meta = document.createElement('span');
    meta.className = 'chapter-pill';
    meta.textContent = q.chapter;
    index.insertAdjacentElement('afterend', meta);
  };

  renderQuiz = function() {
    baseRenderQuiz();

    const sidebarTitle = document.getElementById('sidebarTitle');
    if (sidebarTitle) sidebarTitle.textContent = `${bank.total} вопросов`;

    const jump = document.getElementById('jumpInput');
    if (jump) jump.max = String(bank.total);

    document.title = `Тренировочный тест — ${activeConfig().name}`;
  };

  const style = document.createElement('style');
  style.textContent = `
    .test-picker{margin-bottom:26px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:22px}
    .test-picker-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:14px}
    .test-picker-head h2{margin:0;font-size:24px}
    .test-picker-current{color:var(--muted);font-size:12px;font-weight:800}
    .test-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .test-choice{min-width:0;display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:15px;padding:15px;background:var(--bg);cursor:pointer;transition:.15s ease}
    .test-choice:hover{border-color:#bbb9ff}
    .test-choice.selected,.test-choice:has(input:checked){border-color:#aaa8ff;background:var(--primary-soft)}
    .test-choice input{position:absolute;opacity:0;pointer-events:none}
    .test-choice-main{min-width:0;display:grid;gap:5px;flex:1}
    .test-choice-main strong{line-height:1.3;font-size:14px}
    .test-choice-main small{color:var(--muted)}
    .test-choice-check{width:26px;height:26px;flex:0 0 26px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1px solid var(--line);color:transparent;font-weight:950}
    .test-choice:has(input:checked) .test-choice-check{background:var(--primary);border-color:var(--primary);color:#fff}
    .chapter-pill{max-width:100%;padding:5px 8px;border-radius:999px;background:var(--blue-soft);color:var(--blue);font-size:10px;font-weight:850;line-height:1.2}
    .question-grid.has-chapters{display:block;overflow-y:auto}
    .chapter-nav{margin-bottom:15px}
    .chapter-nav:last-child{margin-bottom:4px}
    .chapter-nav-title{width:100%;border:0;background:transparent;color:var(--text);padding:0 1px 7px;display:flex;justify-content:space-between;gap:8px;text-align:left;font-size:11px;font-weight:900;line-height:1.25}
    .chapter-nav-title:hover span{color:var(--primary)}
    .chapter-nav-title small{color:var(--muted);font-size:10px}
    .chapter-nav-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
    @media(max-width:720px){.test-choice-grid{grid-template-columns:1fr}.test-picker{padding:17px}.test-picker-head{align-items:flex-start}}
    @media(max-width:600px){.chapter-nav-grid{grid-template-columns:repeat(6,1fr)}}
  `;
  document.head.appendChild(style);

  // If the preloader substituted the second bank for the hard-coded initial
  // request, normalizeSource above will recognise it. The normal app boot then
  // uses the correct save slot and our patched renderers.
})();
