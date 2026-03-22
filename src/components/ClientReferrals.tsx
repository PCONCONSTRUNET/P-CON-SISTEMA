import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Link2,
  MousePointerClick,
  Users,
  DollarSign,
  Copy,
  CheckCircle,
  Clock,
  Gift,
  TrendingUp,
  AlertCircle,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { useClientReferrals } from '@/hooks/useReferrals';
import { supabase } from '@/integrations/supabase/client';

interface ClientReferralsProps {
  clientId: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

const REFERRAL_DOMAIN = 'https://www.assinaturaspcon.sbs';

const ClientReferrals = ({ clientId }: ClientReferralsProps) => {
  const { link, clicks, leads, rewards, settings, stats, loading } = useClientReferrals(clientId);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  
  // Check if client has active subscription
  React.useEffect(() => {
    const checkSubscription = async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .limit(1);
      
      setHasActiveSubscription((data && data.length > 0) || false);
    };
    
    if (clientId) {
      checkSubscription();
    }
  }, [clientId]);
  
  // Determine reward info based on subscription status
  const rewardValue = hasActiveSubscription 
    ? (settings?.client_reward_value || 150) 
    : (settings?.reward_value || 100);
  const rewardType = hasActiveSubscription ? 'coupon' : 'cash';
  const rewardDescription = hasActiveSubscription 
    ? 'Cupom de desconto para projetos futuros' 
    : 'Recompensa em dinheiro via PIX';

  const handleCopyLink = () => {
    if (link) {
      const url = `${REFERRAL_DOMAIN}/r/${link.slug}`;
      navigator.clipboard.writeText(url);
      toast.success('Link copiado!');
    }
  };

  const getRewardStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
      pending: { 
        label: 'Pendente', 
        icon: <Clock className="h-3 w-3" />,
        className: 'bg-warning/20 text-warning border-warning/30' 
      },
      approved: { 
        label: 'Aprovado', 
        icon: <CheckCircle className="h-3 w-3" />,
        className: 'bg-success/20 text-success border-success/30' 
      },
      paid: { 
        label: 'Pago', 
        icon: <DollarSign className="h-3 w-3" />,
        className: 'bg-primary/20 text-primary border-primary/30' 
      },
    };
    const config = configs[status] || { label: status, icon: null, className: 'bg-muted' };
    return (
      <Badge className={`${config.className} border flex items-center gap-1`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  // If system is not active, don't show anything
  if (!settings?.is_active) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-heading font-semibold text-foreground">
          Programa de Indicações
        </h2>
      </div>

      {/* Info Banner */}
      <Card className={`glass-card border-primary/20 ${hasActiveSubscription ? 'bg-purple-500/5' : 'bg-primary/5'}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg ${hasActiveSubscription ? 'bg-purple-500/20' : 'bg-primary/20'} flex items-center justify-center flex-shrink-0`}>
              <Gift className={`h-5 w-5 ${hasActiveSubscription ? 'text-purple-400' : 'text-primary'}`} />
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">
                Ganhe {formatCurrency(rewardValue)} por indicação!
              </h3>
              <p className="text-sm text-muted-foreground">
                {hasActiveSubscription 
                  ? `Como cliente ativo, você recebe um cupom de ${formatCurrency(rewardValue)} para projetos ou aplicações futuras quando sua indicação fechar.`
                  : `Indique novos clientes e receba ${formatCurrency(rewardValue)} em dinheiro quando o projeto for fechado.`
                }
                {' '}A indicação é válida por {settings?.validity_days || 60} dias.
              </p>
              {hasActiveSubscription && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs">
                  🎫 Cupom de Desconto
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referral Link */}
      {link ? (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Seu Link de Indicação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-secondary/30 rounded-lg px-4 py-3 border border-border/30">
                <code className="text-sm text-foreground break-all">
                  {REFERRAL_DOMAIN}/r/{link.slug}
                </code>
              </div>
              <Button onClick={handleCopyLink} size="icon" variant="outline">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {!link.is_active && (
              <div className="flex items-center gap-2 text-sm text-warning">
                <AlertCircle className="h-4 w-4" />
                Seu link está temporariamente desativado
              </div>
            )}

            {/* Share Buttons */}
            <div className="pt-4 border-t border-border/50">
              <p className="text-sm text-muted-foreground text-center mb-4 flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" />
                Compartilhe seu link
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {/* WhatsApp Share */}
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full w-10 h-10 bg-[#25D366]/10 border-[#25D366]/30 hover:bg-[#25D366]/20"
                  onClick={() => {
                    const url = `${REFERRAL_DOMAIN}/r/${link.slug}`;
                    const text = `Conheça a P-CON! Uma empresa incrível que eu indico: ${url}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                  }}
                  title="Compartilhar no WhatsApp"
                >
                  <svg className="w-5 h-5 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </Button>

                {/* Telegram Share */}
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full w-10 h-10 bg-[#0088cc]/10 border-[#0088cc]/30 hover:bg-[#0088cc]/20"
                  onClick={() => {
                    const url = `${REFERRAL_DOMAIN}/r/${link.slug}`;
                    const text = `Conheça a P-CON! Uma empresa incrível que eu indico!`;
                    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
                  }}
                  title="Compartilhar no Telegram"
                >
                  <svg className="w-5 h-5 text-[#0088cc]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                </Button>

                {/* Facebook Share */}
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full w-10 h-10 bg-[#1877F2]/10 border-[#1877F2]/30 hover:bg-[#1877F2]/20"
                  onClick={() => {
                    const url = `${REFERRAL_DOMAIN}/r/${link.slug}`;
                    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
                  }}
                  title="Compartilhar no Facebook"
                >
                  <svg className="w-5 h-5 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </Button>

                {/* Twitter/X Share */}
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full w-10 h-10 bg-foreground/10 border-foreground/30 hover:bg-foreground/20"
                  onClick={() => {
                    const url = `${REFERRAL_DOMAIN}/r/${link.slug}`;
                    const text = `Conheça a P-CON! Uma empresa incrível que eu indico!`;
                    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
                  }}
                  title="Compartilhar no X"
                >
                  <svg className="w-4 h-4 text-foreground" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </Button>

                {/* Copy Link */}
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full w-10 h-10"
                  onClick={handleCopyLink}
                  title="Copiar link"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <CardContent className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Link2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              Seu link de indicação ainda não foi criado. Entre em contato com o suporte.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {link && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                  <MousePointerClick className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Acessos</p>
                  <p className="text-xl font-bold">{stats.totalClicks}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center">
                  <Users className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Leads</p>
                  <p className="text-xl font-bold">{stats.totalLeads}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-success/20 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fechados</p>
                  <p className="text-xl font-bold">{stats.totalConversions}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-success/20 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ganhos</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.totalEarned)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rewards Table */}
      {rewards.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Suas Recompensas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rewards.map((reward) => (
                  <TableRow key={reward.id}>
                    <TableCell className="font-medium">
                      {reward.referral_lead?.lead_name || 'N/A'}
                    </TableCell>
                    <TableCell>{formatCurrency(Number(reward.amount))}</TableCell>
                    <TableCell>{getRewardStatusBadge(reward.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(reward.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {rewards.length === 0 && link && (
        <Card className="glass-card">
          <CardContent className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Gift className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-1">
              Você ainda não tem recompensas
            </p>
            <p className="text-sm text-muted-foreground">
              Compartilhe seu link de indicação para começar a ganhar!
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
};

export default ClientReferrals;
