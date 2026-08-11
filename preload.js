// Loads the previously selected question bank before the legacy app boot completes.
(() => {
  const SELECTED_KEY = 'quiz_selected_test_v2';
  const OLD_FILE = 'moodle_527_questions_with_answers.json';
  const NEW_GZ = 'moodle_306_questions_with_answers_and_sections.json.gz';

  if (localStorage.getItem(SELECTED_KEY) !== 'general306') return;
  if (typeof DecompressionStream !== 'function') return;

  const nativeFetch = window.fetch.bind(window);
  let redirected = false;

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';

    if (!redirected && url.includes(OLD_FILE)) {
      redirected = true;
      const response = await nativeFetch(NEW_GZ, { ...(init || {}), cache: 'no-store' });
      if (!response.ok) return response;

      const compressed = await response.arrayBuffer();
      const stream = new Blob([compressed])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      const text = await new Response(stream).text();

      return new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    return nativeFetch(input, init);
  };
})();
