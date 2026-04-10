import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { safeStorage } from '../utils/storage';

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
const DATA_KEY = 'client_data';

// URL e Chave fixas para garantir que o cache não interfira (banco consolidado)
const AUTH_URL = "https://bevahgtmcdicyhjnrylk.supabase.co/functions/v1/client-auth-new";
const API_KEY = "sb_publishable_ziYHN3SayMmRYxusCm7qQQ_-rqQG7gM";

async function callAuth(action: string, body: object) {
  console.log(`[DEBUG AUTH] Chamando ${action}`, { url: AUTH_URL, apiKey: API_KEY });
  const res = await fetch(`${AUTH_URL}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
    body: JSON.stringify(body),
  });
  return res;
}

export const ClientAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [client, setClient] = useState<Client | null>(() => {
    // Validação básica do objeto Client
    return safeStorage.getItem<Client>(DATA_KEY, (val) => val && typeof val === 'object' && 'id' in val);
  });
  const [isLoading, setIsLoading] = useState(true);

  const verifySession = async () => {
    const token = safeStorage.getItem<string>(TOKEN_KEY);
    if (!token) { setIsLoading(false); return; }

    try {
      const res = await callAuth('verify', { token });

      if (res.ok) {
        const data = await res.json();
        setClient(data.client);
        safeStorage.setItem(DATA_KEY, data.client);
      } else {
        // Sessão inválida ou expirada — limpar tudo via safeStorage
        safeStorage.removeItem(TOKEN_KEY);
        safeStorage.removeItem('client_session_db'); // limpar chave legada
        safeStorage.removeItem(DATA_KEY);
        setClient(null);
      }
    } catch (err) {
      console.error('Session verification network error, keeping token:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { verifySession(); }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await callAuth('login', { email, password });

      if (!res.ok) {
        const errData = await res.json();
        return { success: false, error: errData.error || 'Email ou senha incorretos' };
      }

      const data = await res.json();
      safeStorage.setItem(TOKEN_KEY, data.token);
      safeStorage.removeItem('client_session_db'); // remover chave legada
      safeStorage.setItem(DATA_KEY, data.client);
      setClient(data.client);
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'Erro de conexão' };
    }
  };

  const logout = async () => {
    const token = safeStorage.getItem<string>(TOKEN_KEY);

    try {
      if (token) {
        await callAuth('logout', { token });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      safeStorage.removeItem(TOKEN_KEY);
      safeStorage.removeItem('client_session_db'); // remover chave legada
      safeStorage.removeItem(DATA_KEY);
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

