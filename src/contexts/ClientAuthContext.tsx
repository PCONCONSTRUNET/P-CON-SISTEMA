import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string | null;
  status: string;
}

interface ClientAuthContextType {
  client: Client | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextType | undefined>(undefined);

const TOKEN_KEY = 'client_session_token';
const DB_KEY = 'client_session_db'; // 'old' | 'new'

// Retorna a URL correta da Edge Function baseada no banco
function getAuthUrl(db: 'old' | 'new', action: string): string {
  // A Edge Function está hospedada no banco antigo, mas recebe o parâmetro `db`
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/functions/v1/client-auth?action=${action}`;
}

function getApiKey(): string {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

export const ClientAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const verifySession = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const db = (localStorage.getItem(DB_KEY) as 'old' | 'new') || 'old';
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        getAuthUrl(db, 'verify'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': getApiKey(),
          },
          body: JSON.stringify({ token, db }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(DB_KEY);
      }
    } catch (error) {
      console.error('Session verification error:', error);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(DB_KEY);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    verifySession();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch(
        getAuthUrl('old', 'login'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': getApiKey(),
          },
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Erro ao fazer login' };
      }

      // A Edge Function retorna qual banco o token pertence
      const db: 'old' | 'new' = data.db || 'old';
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(DB_KEY, db);
      setClient(data.client);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Erro de conexão' };
    }
  };

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const db = (localStorage.getItem(DB_KEY) as 'old' | 'new') || 'old';

    try {
      await fetch(
        getAuthUrl(db, 'logout'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': getApiKey(),
          },
          body: JSON.stringify({ token, db }),
        }
      );
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(DB_KEY);
      setClient(null);
    }
  };

  return (
    <ClientAuthContext.Provider
      value={{
        client,
        isLoading,
        isAuthenticated: !!client,
        login,
        logout,
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
};

export const useClientAuth = () => {
  const context = useContext(ClientAuthContext);
  if (!context) {
    throw new Error('useClientAuth must be used within a ClientAuthProvider');
  }
  return context;
};
