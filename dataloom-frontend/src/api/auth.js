import client from "./client";

export async function registerUser({ email, password }) {
  const response = await client.post("/auth/register", { email, password });
  return response.data;
}

export async function loginUser({ email, password }) {
  const payload = new URLSearchParams();
  payload.set("username", email);
  payload.set("password", password);

  await client.post("/auth/jwt/login", payload, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export async function logoutUser() {
  await client.post("/auth/jwt/logout");
}

export async function getCurrentUser() {
  const response = await client.get("/auth/me");
  return response.data;
}
