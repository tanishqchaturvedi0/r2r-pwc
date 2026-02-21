import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { User, UserRole, CostCenterAssignment } from "@shared/schema";

interface AuthUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  status: string;
  roles: string[];
  costCenters: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  isFinanceAdmin: boolean;
  isFinanceApprover: boolean;
  isBusinessUser: boolean;
  isFinance: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("auth_token"));
  const [isLoading, setIsLoading] = useState(true);

  const hasRole = useCallback((role: string) => {
    return user?.roles.includes(role) ?? false;
  }, [user]);

  const hasAnyRole = useCallback((roles: string[]) => {
    return roles.some(role => user?.roles.includes(role));
  }, [user]);

  const isFinanceAdmin = hasRole("Finance Admin");
  const isFinanceApprover = hasRole("Finance Approver");
  const isBusinessUser = hasRole("Business User");
  const isFinance = hasAnyRole(["Finance Admin", "Finance Approver"]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Login failed");
    }
    const data = await res.json();
    sessionStorage.setItem("auth_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Never let the full-screen spinner show for more than 5 seconds
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const checkAuth = async () => {
      try {
        const stored = sessionStorage.getItem("auth_token");
        if (stored) {
          const res = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${stored}` },
            signal: controller.signal,
          });
          if (res.ok) {
            const data = await res.json();
            setToken(stored);
            setUser(data.user);
          } else {
            sessionStorage.removeItem("auth_token");
          }
        }
      } catch {
        // AbortError (timeout) or network error — clear invalid token
        const stored = sessionStorage.getItem("auth_token");
        if (stored) sessionStorage.removeItem("auth_token");
      } finally {
        clearTimeout(timeoutId);
        setIsLoading(false);
      }
    };
    checkAuth();
    return () => { controller.abort(); clearTimeout(timeoutId); };
  }, []);

  useEffect(() => {
    if (token) {
      sessionStorage.setItem("auth_token", token);
    } else {
      sessionStorage.removeItem("auth_token");
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, hasRole, hasAnyRole, isFinanceAdmin, isFinanceApprover, isBusinessUser, isFinance }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
