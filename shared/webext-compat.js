(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : self;

  if (typeof root.browser === 'undefined' && typeof root.chrome !== 'undefined') {
    root.browser = root.chrome;
  }
})();
