import { createLogger } from "../logger";

describe("createLogger", () => {
  let spies;

  beforeEach(() => {
    spies = {
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an object with debug, info, warn, error methods", () => {
    const logger = createLogger("Test");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("prefixes warn messages with tag", () => {
    const logger = createLogger("MyModule");
    logger.warn("something happened");
    expect(spies.warn).toHaveBeenCalledWith("[MyModule]", "something happened");
  });

  it("prefixes error messages with tag", () => {
    const logger = createLogger("API");
    logger.error("request failed", 404);
    expect(spies.error).toHaveBeenCalledWith("[API]", "request failed", 404);
  });

  // In Vitest with Vite dev mode, import.meta.env.DEV is true
  it("logs debug messages in dev mode", () => {
    const logger = createLogger("Dev");
    logger.debug("debug msg");
    expect(spies.debug).toHaveBeenCalledWith("[Dev]", "debug msg");
  });

  it("logs info messages in dev mode", () => {
    const logger = createLogger("Dev");
    logger.info("info msg");
    expect(spies.info).toHaveBeenCalledWith("[Dev]", "info msg");
  });
});
