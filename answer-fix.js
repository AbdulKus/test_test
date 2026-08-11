// Repairs answer keys extracted from Moodle feedback.
// The original scraper used substring matching, which can create false positives
// for answers such as "не разрешается" + "разрешается".

const baseNormalizeSourceForAnswerFix = normalizeSource;

function answerFixNorm(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function answerFixKey(value) {
  return answerFixNorm(value).toLocaleLowerCase("ru");
}

function answerFixTail(raw) {
  return answerFixNorm(raw)
    .replace(/^Правильн(?:ый ответ|ые ответы)\s*:\s*/i, "")
    .trim();
}

function parseMultipleAnswersExactly(tail, options) {
  const source = answerFixKey(tail);
  const keys = options.map(answerFixKey);
  const memo = new Map();

  function walk(pos, usedMask) {
    const memoKey = `${pos}:${usedMask}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    if (pos === source.length) return [];

    for (let i = 0; i < keys.length; i++) {
      if ((usedMask & (1 << i)) !== 0) continue;
      const key = keys[i];
      if (!source.startsWith(key, pos)) continue;

      const end = pos + key.length;
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
  const normalized = baseNormalizeSourceForAnswerFix(source);

  normalized.questions.forEach((question, index) => {
    const raw = source.questions[index];
    if (!raw) return;

    const tail = answerFixTail(raw.rightAnswerRaw);
    if (!tail) return;

    if (raw.type === "single_choice") {
      // A radio question can only have one correct answer. Moodle's own
      // "Правильный ответ: ..." line is authoritative, so require an exact match.
      const target = answerFixKey(tail);
      const exact = question.options.filter(option => answerFixKey(option) === target);

      if (exact.length !== 1) {
        throw new Error(`Не удалось однозначно восстановить ответ для вопроса №${raw.number}`);
      }

      question.correct = [exact[0]];
      return;
    }

    if (raw.type === "multiple_choice") {
      // Moodle joins correct options with ", ". Options themselves may contain
      // commas, so do not split naively; instead segment the complete feedback
      // line using the known full option strings.
      const parsed = parseMultipleAnswersExactly(tail, question.options);
      if (!parsed || !parsed.length) {
        throw new Error(`Не удалось восстановить несколько ответов для вопроса №${raw.number}`);
      }
      question.correct = [...new Set(parsed)];
    }
  });

  return normalized;
};
