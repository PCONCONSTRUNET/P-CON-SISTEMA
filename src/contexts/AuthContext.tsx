import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { safeStorage } from '../utils/storage';

interface AuthContextType {
  isAuthenticated: boolean;
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Validação simples: o valor deve ser exatamente booleano true se salvo como JSON
    return safeStorage.getItem<boolean>(AUTH_KEY, (val) => typeof val === 'boolean') === true;
  });

  const [user, setUser] = useState<{ username: string } | null>(() => {
    const isAuth = safeStorage.getItem<boolean>(AUTH_KEY, (val) => typeof val === 'boolean') === true;
    return isAuth ? { username: 'admin' } : null;
  });

  useEffect(() => {
    // Sync logic if needed
  }, []);

  const login = (username: string, password: string): boolean => {
    if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
      setIsAuthenticated(true);
      setUser({ username });
      safeStorage.setItem(AUTH_KEY, true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    safeStorage.removeItem(AUTH_KEY);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
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

