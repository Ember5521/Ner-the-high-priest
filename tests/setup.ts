// The game reads the browser language on start. The tests assert the Korean source copy,
// so the test browser speaks Korean unless a test mocks another language itself.
if (typeof navigator !== 'undefined')
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    get: () => 'ko-KR',
  });
