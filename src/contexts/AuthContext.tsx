import { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { username: string } | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const VALID_CREDENTIALS = {
  username: 'admin',
  password: 'admin123',
};

const AUTH_KEY = 'pcon_auth';

const readAuthFromStorage = (): boolean => {
  try {
    const val = localStorage.getItem(AUTH_KEY);
    return val === 'true' || val === JSON.stringify(true);
  } catch {
    return false;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => readAuthFromStorage());
  const [user, setUser] = useState<{ username: string } | null>(() =>
    readAuthFromStorage() ? { username: 'admin' } : null
  );

  const login = (username: string, password: string): boolean => {
    if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
      setIsAuthenticated(true);
      setUser({ username });
      try { localStorage.setItem(AUTH_KEY, JSON.stringify(true)); } catch {}
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    try { localStorage.removeItem(AUTH_KEY); } catch {}
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading: false, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
