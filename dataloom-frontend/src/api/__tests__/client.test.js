import client from "../client";

describe("API client", () => {
  it("is an axios instance", () => {
    expect(client).toBeDefined();
    expect(typeof client.get).toBe("function");
    expect(typeof client.post).toBe("function");
    expect(typeof client.put).toBe("function");
    expect(typeof client.delete).toBe("function");
  });

  it("has a baseURL configured", () => {
    expect(client.defaults.baseURL).toBeDefined();
    expect(typeof client.defaults.baseURL).toBe("string");
  });

  it("has a timeout configured", () => {
    expect(client.defaults.timeout).toBeDefined();
    expect(typeof client.defaults.timeout).toBe("number");
    expect(client.defaults.timeout).toBeGreaterThan(0);
  });

  it("has response interceptors registered", () => {
    // Axios stores interceptors with handlers array
    expect(client.interceptors.response.handlers.length).toBeGreaterThan(0);
  });
});
