/**
 * Utilitários para acesso seguro ao Storage do navegador.
 * Garante que dados inválidos ou corrompidos não quebrem o aplicativo.
 * Objetivo: "Sempre validar dados vindos do localStorage antes de usar"
 */

export const safeStorage = {
  /**
   * Obtém um item do localStorage com validação profunda.
   * Caso o dado seja inválido, undefined ou corrompido: retorna null (ignora).
   */
  getItem<T>(key: string, validator?: (data: any) => data is T): T | null {
    try {
      const item = localStorage.getItem(key);
      
      // Se não existe, retorna null para que o app recrie o dado se necessário
      if (item === null || item === undefined || item === "undefined") {
        return null;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(item);
      } catch (e) {
        console.warn(`[SafeStorage] Erro de parse JSON na chave "${key}". Removendo dado corrompido.`);
        localStorage.removeItem(key);
        return null;
      }

      // Validação extra se fornecida
      if (validator) {
        if (validator(parsed)) {
          return parsed;
        } else {
          console.warn(`[SafeStorage] Validação falhou para a chave "${key}". O dado será ignorado.`);
          localStorage.removeItem(key);
          return null;
        }
      }

      return parsed as T;
    } catch (error) {
      console.error(`[SafeStorage] Erro inesperado ao ler chave "${key}":`, error);
      return null;
    }
  },

  /**
   * Salva um item no localStorage garantindo conversão para JSON.
   */
  setItem(key: string, value: any): void {
    try {
      if (value === undefined) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`[SafeStorage] Erro ao salvar chave "${key}":`, error);
    }
  },

  /**
   * Remove um item do localStorage.
   */
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },

  /**
   * Limpa todo o storage de forma segura.
   */
  clear(): void {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
  }
};

