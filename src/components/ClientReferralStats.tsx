import { useMemo } from 'react';
import { MousePointerClick, Users, TrendingUp, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ReferralData {
  links: Array<{ id: string; client_id: string }>;
  clicks: Array<{ referral_link_id: string }>;
  leads: Array<{ referral_link_id: string; is_converted: boolean }>;
  rewards: Array<{ referral_link_id: string; status: string; amount: number }>;
}

interface ClientReferralStatsProps {
  clientId: string;
  referralData: ReferralData;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

const ClientReferralStats = ({ clientId, referralData }: ClientReferralStatsProps) => {
  const stats = useMemo(() => {
    const clientLink = referralData.links.find(l => l.client_id === clientId);
    
    if (!clientLink) {
      return null;
    }

    const linkClicks = referralData.clicks.filter(c => c.referral_link_id === clientLink.id).length;
    const linkLeads = referralData.leads.filter(l => l.referral_link_id === clientLink.id);
    const totalLeads = linkLeads.length;
    const conversions = linkLeads.filter(l => l.is_converted).length;
    
    const linkRewards = referralData.rewards.filter(r => r.referral_link_id === clientLink.id);
    const paidRewards = linkRewards.filter(r => r.status === 'paid');
    const totalEarned = paidRewards.reduce((sum, r) => sum + Number(r.amount), 0);
    const pendingRewards = linkRewards.filter(r => r.status === 'pending' || r.status === 'approved').length;

    return {
      clicks: linkClicks,
      leads: totalLeads,
      conversions,
      totalEarned,
      pendingRewards,
    };
  }, [clientId, referralData]);

  if (!stats) {
    return (
      <span className="text-xs text-muted-foreground">Sem link</span>
    );
  }

  const hasActivity = stats.clicks > 0 || stats.leads > 0 || stats.conversions > 0;

  if (!hasActivity) {
    return (
      <span className="text-xs text-muted-foreground">Sem atividade</span>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 flex-wrap">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 text-xs bg-primary/10 border-primary/20">
              <MousePointerClick className="h-3 w-3 text-primary" />
              {stats.clicks}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{stats.clicks} cliques no link</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 text-xs bg-secondary/50 border-secondary">
              <Users className="h-3 w-3" />
              {stats.leads}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{stats.leads} leads capturados</p>
          </TooltipContent>
        </Tooltip>

        {stats.conversions > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-xs bg-success/10 border-success/20">
                <TrendingUp className="h-3 w-3 text-success" />
                {stats.conversions}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{stats.conversions} conversões (projetos fechados)</p>
            </TooltipContent>
          </Tooltip>
        )}

        {stats.totalEarned > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-xs bg-success/10 border-success/20 text-success">
                <DollarSign className="h-3 w-3" />
                {formatCurrency(stats.totalEarned)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Total recebido em recompensas</p>
            </TooltipContent>
          </Tooltip>
        )}

        {stats.pendingRewards > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-xs bg-warning/10 border-warning/20 text-warning">
                {stats.pendingRewards} pendente{stats.pendingRewards > 1 ? 's' : ''}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{stats.pendingRewards} recompensa(s) aguardando pagamento</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

export default ClientReferralStats;
