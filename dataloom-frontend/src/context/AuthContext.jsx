import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "dataloom:auth";

const AuthContext = createContext(null);

const buildUser = (provider, overrides = {}) => {
  const pretty = provider.charAt(0).toUpperCase() + provider.slice(1);
  const id = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${provider}-${Date.now()}`;
  return {
    id,
    name: overrides.name || `${pretty} User`,
    email: overrides.email || `${provider}@example.com`,
    provider,
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const signInWithProvider = async (provider) => {
    const normalized = provider.toLowerCase();
    const profile = buildUser(normalized);
    setUser(profile);
    return profile;
  };

  const signInWithEmail = async ({ email, password, name, mode }) => {
    if (!email || !password) throw new Error("Email and password are required");
    const displayName = name?.trim() || email.split("@")[0];
    const profile = buildUser("email", { name: displayName, email });
    setUser(profile);
    return { profile, mode };
  };

  const logout = () => setUser(null);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      signInWithProvider,
      signInWithEmail,
      logout,
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
