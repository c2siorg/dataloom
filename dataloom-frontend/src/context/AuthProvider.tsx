import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  getCurrentUser,
  signin as signinRequest,
  signup as signupRequest,
  logout as logoutRequest,
  type User,
} from "../api/auth";
import { AuthContext } from "./AuthContext";

/**
 * Provides authentication state to the app: bootstraps the current user on
 * mount and exposes sign-in / sign-up / logout actions via `useAuth`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // True until the initial "am I logged in?" check resolves.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((current) => setUser(current))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signin = useCallback(async (email: string, password: string): Promise<User> => {
    const current = await signinRequest(email, password);
    setUser(current);
    return current;
  }, []);

  const signup = useCallback(async (email: string, password: string): Promise<User> => {
    const current = await signupRequest(email, password);
    setUser(current);
    return current;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await logoutRequest();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signin, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
