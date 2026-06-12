/**
 * API functions for authentication.
 * @module api/auth
 */
import client from "./client";

/** A DataLoom user, as returned by the auth endpoints. */
export interface User {
  id: string;
  email: string;
  created_at: string;
}

/**
 * Register a new account. On success the server sets the httpOnly auth cookie.
 * @param email - Email address for the new account.
 * @param password - Plain-text password (8–72 bytes).
 * @returns The newly created user.
 */
export const signup = async (email: string, password: string): Promise<User> => {
  const response = await client.post<User>("/auth/signup", { email, password });
  return response.data;
};

/**
 * Sign in to an existing account. On success the server sets the httpOnly auth cookie.
 * @param email - The account's email address.
 * @param password - The account's password.
 * @returns The authenticated user.
 */
export const signin = async (email: string, password: string): Promise<User> => {
  const response = await client.post<User>("/auth/signin", { email, password });
  return response.data;
};

/**
 * Clear the auth session. The server clears the auth cookie.
 * @returns Resolves once the session has been cleared.
 */
export const logout = async (): Promise<void> => {
  await client.post("/auth/logout");
};

/**
 * Fetch the currently authenticated user.
 * @returns The current user; rejects with a 401 error when not signed in.
 */
export const getCurrentUser = async (): Promise<User> => {
  const response = await client.get<User>("/auth/me");
  return response.data;
};

/**
 * Update the authenticated user's email address.
 * @param email - New email address.
 * @returns Updated user object.
 */
export const updateEmail = async (email: string): Promise<User> => {
  const response = await client.patch<User>("/auth/me/email", {
    email,
  });
  console.log(response);
  return response.data;
};

/**
 * Change the authenticated user's password.
 * @param currentPassword - Current account password.
 * @param newPassword - New password to set.
 * @returns Success response from the API.
 */
export const changePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> => {
  const response = await client.patch<{ message: string }>("/auth/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });

  return response.data;
};

/**
 * Request a password reset email for an existing account. If the email exists, the server sends a password reset link/token.
 * @param email - The account's email address.
 * @returns nothing.
 */
export const forgotPassword = async (email: string): Promise<void> => {
  await client.post("/auth/forgot-password", { email });
};

/**
 * Reset the account password using a valid reset token.
 * @param token - Password reset token received via email.
 * @param newPassword - New password to set for the account.
 * @returns Promise that resolves when the password is successfully updated.
 */
export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  await client.post("/auth/reset-password", { token, new_password: newPassword });
};
