// Loads the previously selected question bank before the legacy app boot completes.
(() => {
  const SELECTED_KEY = 'quiz_selected_test_v2';
  const OLD_FILE = 'moodle_527_questions_with_answers.json';
  const NEW_PARTS = [
    'data/q306u-1.b64',
    'data/q306u-2.b64',
    'data/q306u-3.b64'
  ];

  if (localStorage.getItem(SELECTED_KEY) !== 'general306') return;
  if (typeof DecompressionStream !== 'function') return;

  const nativeFetch = window.fetch.bind(window);
  let redirected = false;

  async function loadUltraText(init) {
    const parts = await Promise.all(NEW_PARTS.map(async path => {
      const response = await nativeFetch(path, { ...(init || {}), cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
      return (await response.text()).trim();
    }));

    const binary = atob(parts.join(''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));

    return new Response(stream).text();
  }

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';

    if (!redirected && url.includes(OLD_FILE)) {
      redirected = true;

      try {
        const text = await loadUltraText(init);
        return new Response(text, {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (error) {
        console.error('Не удалось загрузить выбранный тест:', error);
        return new Response(JSON.stringify({ __quizLoadError: String(error?.message || error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    return nativeFetch(input, init);
  };
})();
