(function () {
  var KEY = 'memospace:theme';
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function read() {
    try {
      var value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function apply(pref) {
    var resolved = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
    root.setAttribute('data-bs-theme', resolved);
    root.setAttribute('data-theme-pref', pref);
  }

  function write(pref) {
    try {
      if (pref === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch (e) {}
    apply(pref);
    document.dispatchEvent(new CustomEvent('memospace:themechange', { detail: pref }));
  }

  function onSystemChange() {
    if (read() === 'system') apply('system');
  }

  apply(read());
  if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
  else if (mq.addListener) mq.addListener(onSystemChange);

  window.addEventListener('storage', function (event) {
    if (event.key === KEY) apply(read());
  });

  window.MemoTheme = { get: read, set: write };
})();
