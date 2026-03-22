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

// URLs das Edge Functions de cada banco
const OLD_AUTH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-auth`;
const NEW_AUTH_URL = `${import.meta.env.VITE_SUPABASE_URL_NEW}/functions/v1/client-auth`;

const OLD_API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const NEW_API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY_NEW;

async function callAuth(baseUrl: string, apiKey: string, action: string, body: object) {
  const res = await fetch(`${baseUrl}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify(body),
  });
  return res;
}

export const ClientAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const verifySession = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const db = localStorage.getItem(DB_KEY) as 'old' | 'new' | null;
    if (!token || !db) { setIsLoading(false); return; }

    try {
      const [url, key] = db === 'new'
        ? [NEW_AUTH_URL, NEW_API_KEY]
        : [OLD_AUTH_URL, OLD_API_KEY];

      const res = await callAuth(url, key, 'verify', { token });

      if (res.ok) {
        const data = await res.json();
        setClient(data.client);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(DB_KEY);
      }
    } catch (err) {
      console.error('Session verification error:', err);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(DB_KEY);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { verifySession(); }, []);

  const login = async (email: string, password: string) => {
    try {
      // 1. Tenta no banco ANTIGO (clientes existentes)
      let res = await callAuth(OLD_AUTH_URL, OLD_API_KEY, 'login', { email, password });
      let db: 'old' | 'new' = 'old';

      // 2. Se falhou (usuário não encontrado), tenta no banco NOVO
      if (!res.ok) {
        const errData = await res.json();
        // Só tenta no banco novo se o erro for "não encontrado/senha inválida", não erros de rede
        res = await callAuth(NEW_AUTH_URL, NEW_API_KEY, 'login', { email, password });
        db = 'new';

        if (!res.ok) {
          const newErrData = await res.json();
          return { success: false, error: newErrData.error || errData.error || 'Email ou senha incorretos' };
        }
      }

      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(DB_KEY, db);
      setClient(data.client);
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'Erro de conexão' };
    }
  };

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const db = localStorage.getItem(DB_KEY) as 'old' | 'new' | null;

    try {
      if (token && db) {
        const [url, key] = db === 'new'
          ? [NEW_AUTH_URL, NEW_API_KEY]
          : [OLD_AUTH_URL, OLD_API_KEY];
        await callAuth(url, key, 'logout', { token });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(DB_KEY);
      setClient(null);
    }
  };

  return (
    <ClientAuthContext.Provider value={{ client, isLoading, isAuthenticated: !!client, login, logout }}>
      {children}
    </ClientAuthContext.Provider>
  );
};

export const useClientAuth = () => {
  const context = useContext(ClientAuthContext);
  if (!context) throw new Error('useClientAuth must be used within a ClientAuthProvider');
  return context;
};
