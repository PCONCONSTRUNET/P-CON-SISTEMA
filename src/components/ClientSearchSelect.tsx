import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ClientSelectItem {
  id: string;
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string;
}

interface ClientSearchSelectProps {
  clients: ClientSelectItem[];
  value: string;
  onChange: (clientId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const ClientSearchSelect: React.FC<ClientSearchSelectProps> = ({
  clients,
  value,
  onChange,
  placeholder = 'Selecione um cliente...',
  disabled = false,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedClient = useMemo(() => {
    return clients.find((c) => c.id === value);
  }, [clients, value]);

  // Limpa números e caracteres especiais para busca de CPF/Telefone flexível
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clients;

    const term = searchTerm.toLowerCase().trim();
    const cleanTerm = normalize(term);

    return clients.filter((client) => {
      const nameMatch = client.name.toLowerCase().includes(term);
      const emailMatch = client.email ? client.email.toLowerCase().includes(term) : false;
      const docMatch = client.document ? normalize(client.document).includes(cleanTerm) : false;
      const phoneMatch = client.phone ? normalize(client.phone).includes(cleanTerm) : false;

      return nameMatch || emailMatch || docMatch || phoneMatch;
    });
  }, [clients, searchTerm]);

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Foca automaticamente no campo de busca ao abrir
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (clientId: string) => {
    onChange(clientId);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {/* Botão Gatilho */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-border/50 bg-secondary/50 px-3 py-2 text-sm text-foreground shadow-sm transition-colors',
          'hover:bg-secondary/70 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          !selectedClient && 'text-muted-foreground'
        )}
      >
        <span className="truncate flex items-center gap-2">
          {selectedClient ? (
            <>
              <User className="w-4 h-4 text-primary shrink-0" />
              <span className="font-medium text-foreground">{selectedClient.name}</span>
              {selectedClient.document && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  • {selectedClient.document}
                </span>
              )}
            </>
          ) : (
            placeholder
          )}
        </span>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {selectedClient && !disabled && (
            <span
              role="button"
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
        </div>
      </button>

      {/* Dropdown com Busca */}
      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-72 w-full min-w-[280px] overflow-hidden rounded-md border border-border/60 bg-popover text-popover-foreground shadow-xl glass-card backdrop-blur-md animate-in fade-in-0 zoom-in-95">
          {/* Campo de Busca */}
          <div className="p-2 border-b border-border/40 bg-secondary/30">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, CPF/CNPJ, email ou telefone..."
                className="w-full pl-8 pr-3 py-1.5 text-xs sm:text-sm bg-secondary/60 border border-border/50 rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Lista de Clientes */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-border/20">
            {filteredClients.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Nenhum cliente encontrado para "{searchTerm}"
              </div>
            ) : (
              filteredClients.map((client) => {
                const isSelected = client.id === value;
                return (
                  <div
                    key={client.id}
                    onClick={() => handleSelect(client.id)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 text-xs sm:text-sm rounded-sm cursor-pointer transition-colors select-none',
                      isSelected ? 'bg-primary/20 text-primary font-medium' : 'hover:bg-secondary/80 text-foreground'
                    )}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{client.name}</span>
                        {client.status && (
                          <span
                            className={cn(
                              'text-[9px] px-1.5 py-0.2 rounded font-medium',
                              client.status === 'active'
                                ? 'bg-success/20 text-success'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {client.status === 'active' ? 'Ativo' : client.status}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        {client.document && <span>CPF/CNPJ: {client.document}</span>}
                        {client.phone && <span>Tel: {client.phone}</span>}
                        {client.email && !client.document && !client.phone && <span>{client.email}</span>}
                      </div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientSearchSelect;
