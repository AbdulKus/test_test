// Repairs Moodle answer keys that were falsely matched by substring.
// Example: "Правильный ответ: не разрешается" must NOT also mark "разрешается".
const baseNormalizeSourceForExactAnswers = normalizeSource;

function exactAnswerNorm(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function exactAnswerKey(value) {
  return exactAnswerNorm(value).toLocaleLowerCase("ru");
}

function exactAnswerTail(raw) {
  return exactAnswerNorm(raw)
    .replace(/^Правильн(?:ый ответ|ые ответы)\s*:\s*/i, "")
    .trim();
}

function parseExactMultipleAnswers(tail, options) {
  const source = exactAnswerKey(tail);
  const optionKeys = options.map(exactAnswerKey);
  const memo = new Map();

  function walk(position, usedMask) {
    const memoKey = `${position}:${usedMask}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    if (position === source.length) return [];

    for (let i = 0; i < optionKeys.length; i++) {
      if ((usedMask & (1 << i)) !== 0) continue;
      const key = optionKeys[i];
      if (!source.startsWith(key, position)) continue;

      const end = position + key.length;
      if (end === source.length) {
        const result = [options[i]];
        memo.set(memoKey, result);
        return result;
      }

      if (source.startsWith(", ", end)) {
        const rest = walk(end + 2, usedMask | (1 << i));
        if (rest) {
          const result = [options[i], ...rest];
          memo.set(memoKey, result);
          return result;
        }
      }
    }

    memo.set(memoKey, null);
    return null;
  }

  return walk(0, 0);
}

normalizeSource = function (source) {
  const normalized = baseNormalizeSourceForExactAnswers(source);

  normalized.questions.forEach((question, index) => {
    const raw = source.questions[index];
    if (!raw) return;

    const tail = exactAnswerTail(raw.rightAnswerRaw);
    if (!tail) return;

    if (raw.type === "single_choice") {
      const target = exactAnswerKey(tail);
      const exact = question.options.filter(option => exactAnswerKey(option) === target);
      if (exact.length !== 1) {
        throw new Error(`Не удалось однозначно восстановить ответ для вопроса №${raw.number}`);
      }
      question.correct = [exact[0]];
      return;
    }

    if (raw.type === "multiple_choice") {
      const parsed = parseExactMultipleAnswers(tail, question.options);
      if (!parsed || !parsed.length) {
        throw new Error(`Не удалось восстановить несколько ответов для вопроса №${raw.number}`);
      }
      question.correct = [...new Set(parsed)];
    }
  });

  return normalized;
};

// Keeps the sidebar controls visible at every viewport height.
// Only the 527-question number grid should scroll vertically.
const sidebarFixStyle = document.createElement("style");
sidebarFixStyle.textContent = `
  .sidebar{
    min-height:0;
    overflow:hidden;
    gap:12px;
  }

  .sidebar-head,
  .sidebar-progress,
  .search-wrap,
  .nav-tools,
  .legend,
  .sidebar-actions{
    flex:0 0 auto;
  }

  .question-grid{
    flex:1 1 auto;
    min-height:0;
    overflow-y:auto;
    overscroll-behavior:contain;
    padding-bottom:4px;
  }

  .sidebar-actions{
    margin-top:0;
    padding-top:4px;
    padding-bottom:max(0px, env(safe-area-inset-bottom));
    background:var(--surface);
    position:relative;
    z-index:2;
  }

  /* On short desktop/laptop screens compress non-essential vertical spacing
     instead of pushing the Home button below the viewport. */
  @media (min-width:901px) and (max-height:820px){
    .sidebar{padding:14px;gap:9px}
    .sidebar-head strong{font-size:14px}
    .sidebar-progress{gap:5px}
    .legend{gap:4px 8px}
    .search-box{height:38px}
    .jump-box{gap:3px}
    .jump-box input{height:34px}
    .btn.tiny{min-height:34px}
    .sidebar-actions{gap:6px;padding-top:2px}
    .sidebar-actions .btn{min-height:38px}
    .qnav{border-radius:7px;font-size:10px}
  }

  @media (max-width:900px){
    .sidebar{
      height:100dvh;
      max-height:100dvh;
      padding-bottom:calc(14px + env(safe-area-inset-bottom));
    }
    .sidebar-actions{padding-bottom:0}
  }
`;
document.head.appendChild(sidebarFixStyle);
