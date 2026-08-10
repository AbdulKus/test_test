const DATA_VERSION = "54e779ae9103";
const STORAGE_KEY = "moodle527_session_" + DATA_VERSION;

const app = document.getElementById("app");
let bank = null;
let state = null;

const cloneTemplate = id => document.getElementById(id).content.cloneNode(true);

function saveState() {
  if (!state) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.datasetVersion !== DATA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function createState(mode, feedback) {
  return {
    datasetVersion: DATA_VERSION,
    mode,
    feedback,
    current: 0,
    answers: {},
    checked: {},
    finished: false,
    startedAt: Date.now(),
    finishedAt: null
  };
}

function selectedFor(q) {
  return Array.isArray(state.answers[q.id]) ? state.answers[q.id] : [];
}

function correctIndexes(q) {
  const set = new Set(q.correct);
  return q.options.map((text, index) => set.has(text) ? index : -1).filter(index => index >= 0);
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const aa = [...a].sort((x,y) => x-y);
  const bb = [...b].sort((x,y) => x-y);
  return aa.every((v, i) => v === bb[i]);
}

function isAnswered(q) {
  return selectedFor(q).length > 0;
}

function isCorrect(q) {
  return sameSet(selectedFor(q), correctIndexes(q));
}

function isRevealed(q) {
  if (state.mode === "study") return true;
  if (state.finished) return true;
  return state.feedback === "instant" && !!state.checked[q.id];
}

function answeredCount() {
  return bank.questions.reduce((n, q) => n + (isAnswered(q) ? 1 : 0), 0);
}

function scoreNow() {
  return bank.questions.reduce((n, q) => n + (isCorrect(q) ? 1 : 0), 0);
}

function gradedCount() {
  if (state.finished) return bank.questions.length;
  if (state.mode === "study") return 0;
  if (state.feedback !== "instant") return 0;
  return Object.keys(state.checked).filter(k => state.checked[k]).length;
}

function correctGradedCount() {
  if (state.finished) return scoreNow();
  if (state.mode !== "test" || state.feedback !== "instant") return 0;
  return bank.questions.reduce((n, q) => n + (state.checked[q.id] && isCorrect(q) ? 1 : 0), 0);
}

function formatMode() {
  if (state.mode === "study") return "Ответы сразу";
  return state.feedback === "instant" ? "Тест · результат сразу" : "Тест · результат в конце";
}

function renderHome() {
  document.body.classList.remove("nav-open");
  app.innerHTML = "";
  app.append(cloneTemplate("homeTemplate"));

  const saved = loadState();
  const resumeCard = document.getElementById("resumeCard");
  const modePicker = document.getElementById("modePicker");

  if (saved) {
    state = saved;
    const answered = bank.questions.reduce((n, q) => {
      const arr = Array.isArray(saved.answers?.[q.id]) ? saved.answers[q.id] : [];
      return n + (arr.length ? 1 : 0);
    }, 0);
    resumeCard.classList.remove("hidden");
    modePicker.classList.add("hidden");
    resumeCard.innerHTML = `
      <div class="resume-info">
        <div class="eyebrow">Найдено сохранение</div>
        <strong>${saved.finished ? "Тест завершён" : formatMode()}</strong>
        <span>${saved.finished ? `Результат сохранён` : `Отвечено ${answered} из ${bank.total}`}</span>
      </div>
      <div class="resume-actions">
        <button class="btn primary" data-action="resume">${saved.finished ? "Открыть результат" : "Продолжить"}</button>
        <button class="btn danger-ghost" data-action="restart">Заново</button>
      </div>
    `;
  }

  bindGlobalActions();
}

function renderQuiz() {
  document.body.classList.remove("nav-open");
  app.innerHTML = "";
  app.append(cloneTemplate("quizTemplate"));
  document.getElementById("modeLabel").textContent = formatMode();
  buildQuestionGrid();
  renderCurrentQuestion();
  updateChrome();
  bindGlobalActions();
}

function renderCurrentQuestion() {
  const q = bank.questions[state.current];
  const card = document.getElementById("questionCard");
  if (!card || !q) return;

  const selected = selectedFor(q);
  const correct = correctIndexes(q);
  const revealed = isRevealed(q);
  const locked = state.finished || (state.mode === "test" && state.feedback === "instant" && state.checked[q.id]);

  const options = q.options.map((text, index) => {
    const selectedNow = selected.includes(index);
    const correctNow = correct.includes(index);
    let cls = "option";
    if (selectedNow) cls += " selected";

    if (revealed) {
      if (correctNow) cls += " correct";
      if (selectedNow && !correctNow) cls += " wrong";
    }

    const inputType = q.type === "multiple" ? "checkbox" : "radio";
    const mark = revealed ? (correctNow ? "✓" : (selectedNow ? "×" : "")) : "";

    return `
      <label class="${cls}">
        <input
          type="${inputType}"
          name="question-${q.id}"
          value="${index}"
          ${selectedNow ? "checked" : ""}
          ${locked ? "disabled" : ""}
        >
        <span class="option-text">${escapeHtml(text)}</span>
        <span class="answer-mark">${mark}</span>
      </label>
    `;
  }).join("");

  let feedbackHtml = "";
  if (state.mode === "study" && !state.finished) {
    feedbackHtml = `
      <div class="correct-hint">
        <span>✓</span>
        <span>Правильный ответ показан зелёным. Можно выбрать свой вариант и продолжить — итог всё равно посчитается в конце.</span>
      </div>`;
  } else if (revealed) {
    const ok = isCorrect(q);
    feedbackHtml = ok
      ? `<div class="result-hint good"><span>✓</span><span>Правильно.</span></div>`
      : `<div class="result-hint bad"><span>×</span><span>Неправильно. Правильн${q.correct.length > 1 ? "ые ответы" : "ый ответ"}: <b>${q.correct.map(escapeHtml).join("; ")}</b></span></div>`;
  }

  const needsCheckButton = !state.finished && state.mode === "test" && state.feedback === "instant" && q.type === "multiple" && !state.checked[q.id];

  const delayedNote = state.mode === "test" && state.feedback === "final" && !state.finished
    ? `<div class="question-note">Ответ сохранится автоматически. Правильность будет показана после завершения всего теста.</div>`
    : "";

  card.innerHTML = `
    <div class="question-head">
      <span class="question-index">Вопрос ${q.id} из ${bank.total}</span>
      <span class="type-pill">${q.type === "multiple" ? "Несколько ответов" : "Один ответ"}</span>
    </div>
    <h1 class="question-text">${escapeHtml(q.text)}</h1>
    <div class="option-list">${options}</div>
    ${feedbackHtml}
    ${delayedNote}
    ${needsCheckButton ? `
      <div class="question-actions">
        <button class="btn primary" data-action="check-current" ${selected.length ? "" : "disabled"}>Проверить ответ</button>
      </div>` : ""}
  `;

  card.querySelectorAll("input").forEach(input => input.addEventListener("change", handleAnswerChange));

  const checkBtn = card.querySelector('[data-action="check-current"]');
  if (checkBtn) checkBtn.addEventListener("click", checkCurrent);

  document.getElementById("topQuestionCounter").textContent = `Вопрос ${q.id} из ${bank.total}`;
  document.querySelector('[data-action="prev"]').disabled = state.current === 0;
  document.querySelector('[data-action="next"]').textContent = state.current === bank.total - 1 ? "Завершить →" : "Далее →";

  updateGridCurrent();
}

function handleAnswerChange() {
  const q = bank.questions[state.current];
  if (state.finished) return;

  const card = document.getElementById("questionCard");
  const inputs = [...card.querySelectorAll("input")];
  const selected = inputs.filter(i => i.checked).map(i => Number(i.value));

  state.answers[q.id] = selected;

  if (state.mode === "test" && state.feedback === "instant" && q.type === "single" && selected.length) {
    state.checked[q.id] = true;
  }

  saveState();
  renderCurrentQuestion();
  updateChrome();
  updateGridState(q.id);
}

function checkCurrent() {
  const q = bank.questions[state.current];
  if (!isAnswered(q)) return;
  state.checked[q.id] = true;
  saveState();
  renderCurrentQuestion();
  updateChrome();
  updateGridState(q.id);
}

function buildQuestionGrid() {
  const grid = document.getElementById("questionGrid");
  grid.innerHTML = bank.questions.map((q, i) => `<button class="qnav" data-index="${i}" title="${escapeHtml(q.text)}">${q.id}</button>`).join("");

  grid.addEventListener("click", e => {
    const btn = e.target.closest(".qnav");
    if (!btn) return;
    goTo(Number(btn.dataset.index));
    closeNav();
  });

  bank.questions.forEach(q => updateGridState(q.id));
  updateGridCurrent();
}

function updateGridState(id) {
  const q = bank.questions[id - 1];
  const btn = document.querySelector(`.qnav[data-index="${id - 1}"]`);
  if (!btn) return;

  btn.classList.remove("answered", "correct", "wrong");

  const answered = isAnswered(q);
  const graded = state.finished || (state.mode === "test" && state.feedback === "instant" && state.checked[q.id]);

  if (graded) {
    btn.classList.add(isCorrect(q) ? "correct" : "wrong");
  } else if (answered) {
    btn.classList.add("answered");
  }
}

function updateGridCurrent() {
  document.querySelectorAll(".qnav.current").forEach(x => x.classList.remove("current"));
  const current = document.querySelector(`.qnav[data-index="${state.current}"]`);
  if (current) {
    current.classList.add("current");
    current.scrollIntoView({block:"nearest"});
  }
}

function updateChrome() {
  const answered = answeredCount();
  const pct = Math.round(answered / bank.total * 100);
  const bar = document.getElementById("sideProgressBar");
  if (bar) bar.style.width = pct + "%";

  const sideAnswered = document.getElementById("sideAnswered");
  if (sideAnswered) sideAnswered.textContent = `${answered} отвечено`;

  const sideCorrect = document.getElementById("sideCorrect");
  const topbarScore = document.getElementById("topbarScore");

  if (state.finished) {
    const score = scoreNow();
    if (sideCorrect) sideCorrect.textContent = `${score} / ${bank.total}`;
    if (topbarScore) topbarScore.textContent = `${score} / ${bank.total}`;
  } else if (state.mode === "test" && state.feedback === "instant") {
    const graded = gradedCount();
    const good = correctGradedCount();
    if (sideCorrect) sideCorrect.textContent = graded ? `${good} верно из ${graded} проверенных` : "";
    if (topbarScore) topbarScore.textContent = graded ? `${good} / ${graded}` : "";
  } else {
    if (sideCorrect) sideCorrect.textContent = "";
    if (topbarScore) topbarScore.textContent = `${answered} / ${bank.total}`;
  }

  const bottom = document.getElementById("bottomCenter");
  if (bottom) bottom.textContent = `Сохранено автоматически · ${answered} из ${bank.total}`;
}

function goTo(index) {
  if (index < 0 || index >= bank.total) return;
  state.current = index;
  saveState();
  renderCurrentQuestion();
  updateChrome();
  window.scrollTo({top:0, behavior:"smooth"});
}

function finishTest() {
  const unanswered = bank.total - answeredCount();
  const message = unanswered ? `Без ответа осталось ${unanswered} вопросов. Всё равно завершить тест?` : "Завершить тест и посчитать результат?";

  if (!confirm(message)) return;

  state.finished = true;
  state.finishedAt = Date.now();
  saveState();
  renderResult();
}

function renderResult() {
  document.body.classList.remove("nav-open");
  app.innerHTML = "";
  app.append(cloneTemplate("resultTemplate"));

  const correct = scoreNow();
  const empty = bank.total - answeredCount();
  const wrong = bank.total - correct - empty;
  const percent = Math.round(correct / bank.total * 100);

  document.getElementById("resultScore").textContent = correct;
  document.getElementById("resultTotal").textContent = `/ ${bank.total}`;
  document.getElementById("resultPercent").textContent = `${percent}% правильных ответов`;
  document.getElementById("statCorrect").textContent = correct;
  document.getElementById("statWrong").textContent = wrong;
  document.getElementById("statEmpty").textContent = empty;
  document.getElementById("scoreRing").style.background = `conic-gradient(var(--primary) ${percent * 3.6}deg, var(--surface-2) 0deg)`;

  let headline = "Есть что повторить";
  if (percent >= 90) headline = "Отличный результат";
  else if (percent >= 75) headline = "Очень хорошо";
  else if (percent >= 60) headline = "Неплохо";
  document.getElementById("resultHeadline").textContent = headline;

  bindGlobalActions();
}

function reviewWrong() {
  const first = bank.questions.findIndex(q => !isCorrect(q));
  state.current = first >= 0 ? first : 0;
  saveState();
  renderQuiz();
}

function bindGlobalActions() {
  document.querySelectorAll("[data-action]").forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", () => {
      const action = el.dataset.action;
      if (action === "start-test") {
        const feedback = document.querySelector('input[name="feedbackMode"]:checked')?.value || "instant";
        state = createState("test", feedback);
        saveState();
        renderQuiz();
      }
      if (action === "start-study") {
        state = createState("study", "final");
        saveState();
        renderQuiz();
      }
      if (action === "resume") {
        state = loadState();
        state.finished ? renderResult() : renderQuiz();
      }
      if (action === "restart") restart();
      if (action === "prev") goTo(state.current - 1);
      if (action === "next") {
        if (state.current === bank.total - 1) {
          state.finished ? renderResult() : finishTest();
        } else {
          goTo(state.current + 1);
        }
      }
      if (action === "finish") state.finished ? renderResult() : finishTest();
      if (action === "review-wrong") reviewWrong();
      if (action === "review-all") { state.current = 0; saveState(); renderQuiz(); }
      if (action === "open-nav") openNav();
      if (action === "close-nav") closeNav();
      if (action === "jump") jumpFromInput();
    });
  });
}

function jumpFromInput() {
  const input = document.getElementById("jumpInput");
  const n = Number(input?.value);
  if (Number.isInteger(n) && n >= 1 && n <= bank.total) {
    goTo(n - 1);
    closeNav();
  } else {
    input?.focus();
  }
}

function openNav() { document.body.classList.add("nav-open"); }
function closeNav() { document.body.classList.remove("nav-open"); }

function restart() {
  if (!confirm("Удалить сохранённый прогресс и начать заново?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = null;
  renderHome();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("keydown", e => {
  if (!state || state.finished || !document.querySelector(".quiz-main")) return;
  if (e.target.matches("input")) return;
  if (e.key === "ArrowLeft") goTo(state.current - 1);
  if (e.key === "ArrowRight") {
    if (state.current < bank.total - 1) goTo(state.current + 1);
  }
});

function normalizeSource(source) {
  const questions = source.questions.map(raw => {
    const options = [];
    const seen = new Set();

    for (const option of raw.options || []) {
      const text = String(option.text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        options.push(text);
      }
    }

    let correct = (raw.correctAnswers || [])
      .map(x => String(x || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
      .filter(x => options.includes(x));

    if (!correct.length && raw.rightAnswerRaw) {
      const tail = String(raw.rightAnswerRaw)
        .replace(/^Правильн(?:ый ответ|ые ответы)\s*:\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();

      if (raw.type === "single_choice") {
        const exact = options.find(x => x.toLocaleLowerCase("ru") === tail.toLocaleLowerCase("ru"));
        if (exact) correct = [exact];
      } else {
        correct = options.filter(x => tail.toLocaleLowerCase("ru").includes(x.toLocaleLowerCase("ru")));
      }
    }

    if (!correct.length) {
      throw new Error(`Не найден правильный ответ для вопроса №${raw.number}`);
    }

    return {
      id: Number(raw.number),
      text: String(raw.question || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(),
      type: raw.type === "multiple_choice" ? "multiple" : "single",
      options,
      correct: [...new Set(correct)]
    };
  });

  return {
    title: source.title || "Тренировочный тест",
    total: questions.length,
    singleCount: questions.filter(q => q.type === "single").length,
    multipleCount: questions.filter(q => q.type === "multiple").length,
    questions
  };
}

async function boot() {
  try {
    const response = await fetch("moodle_527_questions_with_answers.json", {cache:"no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const source = await response.json();
    bank = normalizeSource(source);

    state = loadState();
    if (state?.finished) renderResult();
    else if (state) renderQuiz();
    else renderHome();
  } catch (error) {
    app.innerHTML = `
      <main class="result-page">
        <section class="result-card">
          <div class="result-kicker">Ошибка загрузки</div>
          <h1>Не удалось открыть вопросы</h1>
          <p>${escapeHtml(error.message)}</p>
          <p>Если ты открыл index.html как локальный файл, запусти сайт через GitHub Pages или любой HTTP-сервер.</p>
        </section>
      </main>`;
  }
}

boot();
