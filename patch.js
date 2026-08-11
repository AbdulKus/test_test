// UI/UX patch: search, read-only result review, study viewed-progress, home navigation.

const PATCH_VERSION = "2026-08-11.2";

// Existing saves from the first version did not have `viewed`.
const baseLoadState = loadState;
loadState = function () {
  const parsed = baseLoadState();
  if (!parsed) return null;
  parsed.answers ||= {};
  parsed.checked ||= {};
  parsed.viewed ||= {};
  if (!Number.isInteger(parsed.current)) parsed.current = 0;
  return parsed;
};

createState = function (mode, feedback) {
  return {
    datasetVersion: DATA_VERSION,
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

function viewedCountPatched() {
  return bank.questions.reduce((n, q) => n + (state.viewed?.[q.id] ? 1 : 0), 0);
}

function startNewModePatched(mode, feedback) {
  const saved = loadState();
  if (saved && !confirm("Начать новый режим? Текущее сохранение будет заменено.")) return;
  state = createState(mode, feedback);
  saveState();
  renderQuiz();
}

renderHome = function () {
  document.body.classList.remove("nav-open");
  app.innerHTML = "";
  app.append(cloneTemplate("homeTemplate"));

  const footer = document.querySelector(".home-footer");
  if (footer) {
    footer.innerHTML = "<span>Прогресс хранится локально в браузере.</span><span>Перезагрузка страницы его не сбрасывает.</span>";
  }

  const studyCard = document.querySelector(".mode-card.accent");
  if (studyCard) {
    const text = studyCard.querySelector(":scope > p");
    if (text) text.textContent = "Правильные варианты подсвечены с самого начала. Режим для спокойного просмотра и повторения без баллов.";
    const note = studyCard.querySelector(".study-note span");
    if (note) note.textContent = "Считаются просмотренные вопросы, а не ответы.";
  }

  const saved = loadState();
  const resumeCard = document.getElementById("resumeCard");

  if (saved) {
    state = saved;
    const progress = saved.mode === "study"
      ? Object.values(saved.viewed || {}).filter(Boolean).length
      : bank.questions.reduce((n, q) => {
          const arr = Array.isArray(saved.answers?.[q.id]) ? saved.answers[q.id] : [];
          return n + (arr.length ? 1 : 0);
        }, 0);

    const progressLabel = saved.mode === "study" ? "просмотрено" : "отвечено";
    const title = saved.finished
      ? (saved.mode === "study" ? "Просмотр завершён" : "Тест завершён")
      : formatMode();

    resumeCard.classList.remove("hidden");
    resumeCard.innerHTML = `
      <div class="resume-info">
        <div class="eyebrow">Найдено сохранение</div>
        <strong>${title}</strong>
        <span>${saved.finished ? "Результат сохранён" : `${progress} из ${bank.total} ${progressLabel}`}</span>
      </div>
      <div class="resume-actions">
        <button class="btn primary" data-action="resume">${saved.finished ? "Открыть" : "Продолжить"}</button>
      </div>`;
  }

  bindGlobalActions();
};

renderQuiz = function () {
  document.body.classList.remove("nav-open");
  app.innerHTML = "";
  app.append(cloneTemplate("quizTemplate"));
  document.getElementById("modeLabel").textContent = formatMode();

  // Replace all restart buttons with a non-destructive Home action.
  document.querySelectorAll('[data-action="restart"]').forEach(btn => {
    btn.dataset.action = "home";
    btn.textContent = "На главную";
    btn.classList.remove("danger-ghost");
    btn.classList.add("secondary");
  });

  const finishButton = document.querySelector('.sidebar-actions [data-action="finish"]');
  if (finishButton) finishButton.textContent = state.mode === "study" ? "Завершить просмотр" : "Завершить тест";

  const legend = document.querySelector(".legend");
  if (legend) {
    legend.innerHTML = state.mode === "study"
      ? '<span><i class="dot neutral"></i> не просмотрен</span><span><i class="dot answered"></i> просмотрен</span>'
      : '<span><i class="dot neutral"></i> без ответа</span><span><i class="dot answered"></i> отвечен</span><span><i class="dot correct"></i> верно</span><span><i class="dot wrong"></i> ошибка</span>';
  }

  injectSearchPatched();
  buildQuestionGrid();
  renderCurrentQuestion();
  updateChrome();
  bindGlobalActions();
};

renderCurrentQuestion = function () {
  const q = bank.questions[state.current];
  const card = document.getElementById("questionCard");
  if (!card || !q) return;

  state.viewed ||= {};
  if (!state.viewed[q.id]) {
    state.viewed[q.id] = true;
    saveState();
  }

  const selected = selectedFor(q);
  const correct = correctIndexes(q);
  const revealed = isRevealed(q);
  const locked = state.finished || state.mode === "study" || (state.mode === "test" && state.feedback === "instant" && state.checked[q.id]);

  const options = q.options.map((text, index) => {
    const selectedNow = selected.includes(index);
    const correctNow = correct.includes(index);
    let cls = "option";
    if (selectedNow) cls += " selected";
    if (locked) cls += " locked";
    if (revealed) {
      if (correctNow) cls += " correct";
      if (selectedNow && !correctNow) cls += " wrong";
    }

    const inputType = q.type === "multiple" ? "checkbox" : "radio";
    const mark = revealed ? (correctNow ? "✓" : (selectedNow ? "×" : "")) : "";

    return `
      <label class="${cls}">
        <input type="${inputType}" name="question-${q.id}" value="${index}" ${selectedNow ? "checked" : ""} ${locked ? "disabled" : ""}>
        <span class="option-text">${escapeHtml(text)}</span>
        <span class="answer-mark">${mark}</span>
      </label>`;
  }).join("");

  // No extra green success banner. The correct option itself is already green.
  let feedbackHtml = "";
  if (revealed && state.mode === "test" && isAnswered(q) && !isCorrect(q)) {
    feedbackHtml = `<div class="result-hint bad"><span>×</span><span>Неправильно. Правильн${q.correct.length > 1 ? "ые ответы" : "ый ответ"}: <b>${q.correct.map(escapeHtml).join("; ")}</b></span></div>`;
  }

  const needsCheckButton = !state.finished && state.mode === "test" && state.feedback === "instant" && q.type === "multiple" && !state.checked[q.id];
  const delayedNote = state.mode === "test" && state.feedback === "final" && !state.finished
    ? '<div class="question-note">Ответ сохранится автоматически. Правильность будет показана после завершения всего теста.</div>'
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
    ${needsCheckButton ? `<div class="question-actions"><button class="btn primary" data-action="check-current" ${selected.length ? "" : "disabled"}>Проверить ответ</button></div>` : ""}`;

  if (!locked) {
    card.querySelectorAll("input").forEach(input => input.addEventListener("change", handleAnswerChange));
  }

  const checkBtn = card.querySelector('[data-action="check-current"]');
  if (checkBtn) checkBtn.addEventListener("click", checkCurrent);

  document.getElementById("topQuestionCounter").textContent = `Вопрос ${q.id} из ${bank.total}`;
  document.querySelector('[data-action="prev"]').disabled = state.current === 0;
  document.querySelector('[data-action="next"]').textContent = state.current === bank.total - 1
    ? (state.mode === "study" ? "Завершить просмотр →" : "Завершить тест →")
    : "Далее →";

  updateGridState(q.id);
  updateGridCurrent();
  updateChrome();
};

updateGridState = function (id) {
  const q = bank.questions[id - 1];
  const btn = document.querySelector(`.qnav[data-index="${id - 1}"]`);
  if (!btn) return;

  btn.classList.remove("answered", "correct", "wrong");

  if (state.mode === "study") {
    if (state.viewed?.[q.id]) btn.classList.add("answered");
    return;
  }

  const answered = isAnswered(q);

  // After test completion unanswered questions remain neutral grey.
  if (state.finished && !answered) return;

  const graded = state.finished || (state.feedback === "instant" && state.checked[q.id]);
  if (graded && answered) btn.classList.add(isCorrect(q) ? "correct" : "wrong");
  else if (answered) btn.classList.add("answered");
};

updateChrome = function () {
  const sideAnswered = document.getElementById("sideAnswered");
  const sideCorrect = document.getElementById("sideCorrect");
  const topbarScore = document.getElementById("topbarScore");
  const bottom = document.getElementById("bottomCenter");
  const bar = document.getElementById("sideProgressBar");

  if (state.mode === "study") {
    const viewed = viewedCountPatched();
    const pct = Math.round(viewed / bank.total * 100);
    if (bar) bar.style.width = pct + "%";
    if (sideAnswered) sideAnswered.textContent = `${viewed} просмотрено`;
    if (sideCorrect) sideCorrect.textContent = "";
    if (topbarScore) topbarScore.textContent = `${viewed} / ${bank.total} просмотрено`;
    if (bottom) bottom.textContent = `Просмотрено ${viewed} из ${bank.total} · сохранено автоматически`;
    return;
  }

  const answered = answeredCount();
  const pct = Math.round(answered / bank.total * 100);
  if (bar) bar.style.width = pct + "%";
  if (sideAnswered) sideAnswered.textContent = `${answered} отвечено`;

  if (state.finished) {
    const score = scoreNow();
    if (sideCorrect) sideCorrect.textContent = `${score} / ${bank.total}`;
    if (topbarScore) topbarScore.textContent = `${score} / ${bank.total}`;
  } else if (state.feedback === "instant") {
    const graded = gradedCount();
    const good = correctGradedCount();
    if (sideCorrect) sideCorrect.textContent = graded ? `${good} верно из ${graded} проверенных` : "";
    if (topbarScore) topbarScore.textContent = graded ? `${good} / ${graded}` : "";
  } else {
    if (sideCorrect) sideCorrect.textContent = "";
    if (topbarScore) topbarScore.textContent = `${answered} / ${bank.total}`;
  }

  if (bottom) bottom.textContent = `Сохранено автоматически · ${answered} из ${bank.total}`;
};

function injectSearchPatched() {
  const navTools = document.querySelector(".nav-tools");
  if (!navTools || document.getElementById("searchInput")) return;

  const wrap = document.createElement("div");
  wrap.className = "search-wrap";
  wrap.innerHTML = `
    <label class="search-box">
      <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l5 5"></path></svg>
      <input id="searchInput" type="search" autocomplete="off" placeholder="Поиск по тексту вопроса…" aria-label="Поиск вопроса по тексту">
    </label>
    <div class="search-results hidden" id="searchResults"></div>`;
  navTools.parentNode.insertBefore(wrap, navTools);

  const input = wrap.querySelector("#searchInput");
  const results = wrap.querySelector("#searchResults");

  const render = () => {
    const raw = input.value.trim();
    const query = raw.toLocaleLowerCase("ru");
    if (!query) {
      results.classList.add("hidden");
      results.innerHTML = "";
      return;
    }

    const matches = bank.questions.filter(q => q.text.toLocaleLowerCase("ru").includes(query)).slice(0, 20);
    results.innerHTML = matches.length
      ? matches.map(q => `<button class="search-result" data-index="${q.id - 1}"><b>№${q.id}</b><span>${highlightSearchPatched(q.text, raw)}</span></button>`).join("")
      : '<div class="search-empty">Ничего не найдено</div>';
    results.classList.remove("hidden");
  };

  input.addEventListener("input", render);
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      input.value = "";
      render();
    } else if (e.key === "Enter") {
      const first = results.querySelector(".search-result");
      if (first) {
        e.preventDefault();
        goTo(Number(first.dataset.index));
        input.value = "";
        render();
        closeNav();
      }
    }
  });

  results.addEventListener("click", e => {
    const item = e.target.closest(".search-result");
    if (!item) return;
    goTo(Number(item.dataset.index));
    input.value = "";
    render();
    closeNav();
  });
}

function highlightSearchPatched(text, query) {
  const safeText = escapeHtml(text);
  const safeQuery = String(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safeText.replace(new RegExp(`(${safeQuery})`, "ig"), "<mark>$1</mark>");
}

finishTest = function () {
  if (state.mode === "study") {
    if (!confirm("Завершить просмотр? Прогресс останется сохранённым.")) return;
    state.finished = true;
    state.finishedAt = Date.now();
    saveState();
    renderResult();
    return;
  }

  const unanswered = bank.total - answeredCount();
  const message = unanswered ? `Без ответа осталось ${unanswered} вопросов. Всё равно завершить тест?` : "Завершить тест и посчитать результат?";
  if (!confirm(message)) return;
  state.finished = true;
  state.finishedAt = Date.now();
  saveState();
  renderResult();
};

renderResult = function () {
  document.body.classList.remove("nav-open");
  app.innerHTML = "";
  app.append(cloneTemplate("resultTemplate"));

  const homeButton = document.querySelector('[data-action="restart"]');
  if (homeButton) {
    homeButton.dataset.action = "home";
    homeButton.textContent = "На главную";
    homeButton.classList.remove("danger-ghost");
    homeButton.classList.add("ghost");
  }

  if (state.mode === "study") {
    const viewed = viewedCountPatched();
    const percent = Math.round(viewed / bank.total * 100);
    const kicker = document.querySelector(".result-kicker");
    if (kicker) kicker.textContent = "Просмотр завершён";
    document.getElementById("scoreRing").classList.add("hidden");
    document.getElementById("resultHeadline").textContent = `Просмотрено ${viewed} из ${bank.total}`;
    document.getElementById("resultPercent").textContent = `${percent}% вопросов просмотрено`;

    const stats = document.querySelector(".result-stats");
    stats.classList.add("single-stat");
    stats.innerHTML = `<div class="stat viewed"><b>${viewed}</b><span>Просмотрено</span></div>`;

    document.querySelector('[data-action="review-wrong"]')?.remove();
    const reviewAll = document.querySelector('[data-action="review-all"]');
    if (reviewAll) reviewAll.textContent = "Продолжить просмотр";
  } else {
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
  }

  bindGlobalActions();
};

reviewWrong = function () {
  const first = bank.questions.findIndex(q => isAnswered(q) && !isCorrect(q));
  state.current = first >= 0 ? first : 0;
  saveState();
  renderQuiz();
};

bindGlobalActions = function () {
  document.querySelectorAll("[data-action]").forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", () => {
      const action = el.dataset.action;
      if (action === "start-test") {
        const feedback = document.querySelector('input[name="feedbackMode"]:checked')?.value || "instant";
        startNewModePatched("test", feedback);
      }
      if (action === "start-study") startNewModePatched("study", "final");
      if (action === "resume") {
        state = loadState();
        state.finished ? renderResult() : renderQuiz();
      }
      if (action === "home") renderHome();
      if (action === "prev") goTo(state.current - 1);
      if (action === "next") {
        if (state.current === bank.total - 1) state.finished ? renderResult() : finishTest();
        else goTo(state.current + 1);
      }
      if (action === "finish") state.finished ? renderResult() : finishTest();
      if (action === "review-wrong") reviewWrong();
      if (action === "review-all") {
        if (state.mode === "study") {
          state.finished = false;
          state.finishedAt = null;
        }
        state.current = 0;
        saveState();
        renderQuiz();
      }
      if (action === "open-nav") openNav();
      if (action === "close-nav") closeNav();
      if (action === "jump") jumpFromInput();
    });
  });
};

// Extra styles are isolated here so the base stylesheet stays simple.
const patchStyle = document.createElement("style");
patchStyle.textContent = `
  .option.locked{cursor:default;pointer-events:none}
  .option.locked:hover{border-color:var(--line);background:var(--surface)}
  .option.locked.correct{border-color:#92d5b6;background:var(--green-soft)}
  .option.locked.wrong{border-color:#eca5a5;background:var(--red-soft)}
  .search-wrap{position:relative}
  .search-box{height:42px;border:1px solid var(--line);background:var(--bg);border-radius:12px;display:flex;align-items:center;gap:9px;padding:0 11px;transition:.15s ease}
  .search-box:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}
  .search-icon{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round}
  .search-box input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font-size:13px}
  .search-box input::placeholder{color:var(--muted)}
  .search-results{position:absolute;top:48px;left:0;right:0;z-index:50;max-height:320px;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 18px 40px rgba(20,22,36,.16);padding:6px}
  .search-result{width:100%;border:0;background:transparent;color:var(--text);text-align:left;padding:10px;border-radius:10px;display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:start}
  .search-result:hover{background:var(--surface-2)}
  .search-result b{color:var(--primary);font-size:11px;padding-top:2px}
  .search-result span{font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .search-result mark{background:#fff0a8;color:inherit;border-radius:3px;padding:0 1px}
  .search-empty{padding:13px;color:var(--muted);font-size:12px;text-align:center}
  .result-stats.single-stat{grid-template-columns:minmax(180px,280px);justify-content:center}
  .stat.viewed b{color:var(--blue)}
  @media(max-width:900px){.search-results{position:static;margin-top:7px;max-height:230px;box-shadow:none}}
  @media(max-width:600px){.result-stats.single-stat{grid-template-columns:1fr}}
  @media(prefers-color-scheme:dark){.search-result mark{background:#665b1f;color:#fff3a7}}
`;
document.head.appendChild(patchStyle);
