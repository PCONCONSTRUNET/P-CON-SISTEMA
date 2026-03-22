import { cn } from '@/lib/utils';

type Status = 'active' | 'inactive' | 'pending' | 'overdue' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'issued' | 'sent';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'status-active' },
  inactive: { label: 'Inativo', className: 'status-inactive' },
  pending: { label: 'Pendente', className: 'status-pending' },
  overdue: { label: 'Vencido', className: 'status-overdue' },
  paid: { label: 'Pago', className: 'status-active' },
  failed: { label: 'Falhou', className: 'status-overdue' },
  cancelled: { label: 'Cancelado', className: 'status-inactive' },
  refunded: { label: 'Reembolsado', className: 'status-pending' },
  issued: { label: 'Emitida', className: 'status-active' },
  sent: { label: 'Enviado', className: 'status-active' },
};

const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = statusConfig[status as Status] || { label: status, className: 'status-pending' };
  
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
};

export default StatusBadge;
