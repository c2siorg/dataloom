import "@testing-library/jest-dom";

if (!globalThis.localStorage) {
  const store = new Map();

  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}
