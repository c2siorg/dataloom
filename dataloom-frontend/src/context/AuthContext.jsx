import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser, loginUser, logoutUser, registerUser } from "../api/auth";

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      if (error.response?.status === 401) {
        setUser(null);
        return null;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadSession = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (isActive) {
          setUser(currentUser);
        }
      } catch (error) {
        if (isActive && error.response?.status === 401) {
          setUser(null);
        }
        if (error.response?.status !== 401) {
          console.error("Failed to restore auth session:", error);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadSession();

    return () => {
      isActive = false;
    };
  }, []);

  const signIn = useCallback(
    async (credentials) => {
      await loginUser(credentials);
      const currentUser = await refreshUser();
      if (!currentUser) {
        throw new Error("Authenticated session was not established. Check the backend auth cookie settings.");
      }
      return currentUser;
    },
    [refreshUser],
  );

  const register = useCallback(
    async (credentials) => {
      await registerUser(credentials);
      await loginUser(credentials);
      const currentUser = await refreshUser();
      if (!currentUser) {
        throw new Error("Account created, but the authenticated session was not established.");
      }
      return currentUser;
    },
    [refreshUser],
  );

  const signOut = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      refreshUser,
      signIn,
      register,
      signOut,
    }),
    [isLoading, refreshUser, register, signIn, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
