import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import BlueBackground from "@/components/BlueBackground";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gift, User, Calendar, DollarSign, CheckCircle, Clock, FileText } from "lucide-react";

const Receipt = () => {
  const { id } = useParams<{ id: string }>();

  const { data: coupon, isLoading, error } = useQuery({
    queryKey: ['receipt', id],
    queryFn: async () => {
      // Try to find as a coupon first - cast to bypass TypeScript issues
      const { data: couponData, error: couponError } = await (supabase
        .from('client_coupons') as any)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (couponError) {
        // Public receipts must not depend on private joins (like clients). Log for debugging.
        console.error('Receipt coupon query error:', couponError);
      }

      if (couponData) {
        return { type: 'coupon', data: couponData };
      }

      // Try as referral reward
      const { data: rewardData, error: rewardError } = await supabase
        .from('referral_rewards')
        .select(`
          *,
          referral_leads:referral_lead_id (lead_name, lead_email, lead_phone)
        `)
        .eq('id', id)
        .maybeSingle();

      if (rewardError) {
        console.error('Receipt referral reward query error:', rewardError);
      }

      if (rewardData) {
        return { type: 'reward', data: rewardData };
      }

      // Try as affiliate reward
      const { data: affiliateRewardData, error: affRewardError } = await supabase
        .from('affiliate_rewards')
        .select(`
          *,
          affiliate_leads:affiliate_lead_id (lead_name, lead_email, lead_phone)
        `)
        .eq('id', id)
        .maybeSingle();

      if (affRewardError) {
        console.error('Receipt affiliate reward query error:', affRewardError);
      }

      if (affiliateRewardData) {
        return { type: 'affiliate_reward', data: affiliateRewardData };
      }

      // Try as referral lead - find the associated reward
      const { data: leadData, error: leadError } = await supabase
        .from('referral_leads')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (leadError) {
        console.error('Receipt referral lead query error:', leadError);
      }

      if (leadData) {
        // Find associated reward
        const { data: leadReward } = await supabase
          .from('referral_rewards')
          .select(`*`)
          .eq('referral_lead_id', id)
          .maybeSingle();

        return { 
          type: 'lead', 
          data: { 
            ...leadData, 
            reward: leadReward,
            amount: leadReward?.amount || 0,
            status: leadReward?.status || 'pending'
          } 
        };
      }

      // Try as affiliate lead - find the associated reward
      const { data: affLeadData, error: affLeadError } = await supabase
        .from('affiliate_leads')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (affLeadError) {
        console.error('Receipt affiliate lead query error:', affLeadError);
      }

      if (affLeadData) {
        // Find associated reward
        const { data: affLeadReward } = await supabase
          .from('affiliate_rewards')
          .select(`*`)
          .eq('affiliate_lead_id', id)
          .maybeSingle();

        return { 
          type: 'affiliate_lead', 
          data: { 
            ...affLeadData, 
            reward: affLeadReward,
            amount: affLeadReward?.amount || 0,
            status: affLeadReward?.status || 'pending'
          } 
        };
      }

      return null;
    },
    enabled: !!id,
  });

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pendente", variant: "secondary" },
      approved: { label: "Aprovado", variant: "default" },
      paid: { label: "Pago", variant: "default" },
      active: { label: "Ativo", variant: "default" },
      used: { label: "Utilizado", variant: "outline" },
      expired: { label: "Expirado", variant: "destructive" },
    };
    const config = statusMap[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="relative min-h-screen">
        <BlueBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando comprovante...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !coupon) {
    return (
      <div className="relative min-h-screen">
        <BlueBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <Card className="max-w-md mx-4 bg-card/90 backdrop-blur-sm border-primary/20">
            <CardContent className="pt-6 text-center">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Comprovante não encontrado</h2>
              <p className="text-muted-foreground">
                O comprovante solicitado não existe ou foi removido.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const renderCouponReceipt = () => {
    const data = coupon.data as any;
    const clientName = "Cliente";
    
    return (
      <Card className="max-w-lg mx-4 bg-card/95 backdrop-blur-sm border-primary/20 shadow-2xl">
        <CardHeader className="text-center border-b border-border/50 pb-6">
          <img 
            src="/images/logo-pcon-white.png" 
            alt="P-CON" 
            className="h-12 mx-auto mb-4"
          />
          <CardTitle className="text-2xl">Comprovante de Cupom</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">P-CON CONSTRUNET</p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <User className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Beneficiário</p>
              <p className="font-medium">{clientName}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Valor Inicial</p>
                <p className="font-semibold text-lg">
                  R$ {data.initial_amount?.toFixed(2) || "0.00"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
              <Gift className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Saldo Atual</p>
                <p className="font-semibold text-lg">
                  R$ {data.current_balance?.toFixed(2) || "0.00"}
                </p>
              </div>
            </div>
          </div>

          {data.origin && (
            <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
              <CheckCircle className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Origem</p>
                <p className="font-medium">{data.origin}</p>
              </div>
            </div>
          )}

          {data.description && (
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Descrição</p>
              <p className="text-sm">{data.description}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {format(new Date(data.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
            {getStatusBadge(data.status)}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderRewardReceipt = () => {
    const data = coupon.data as any;
    const leadName = data.referral_leads?.lead_name || data.affiliate_leads?.lead_name || "Lead";
    const ownerName = "Indicador";

    return (
      <Card className="max-w-lg mx-4 bg-card/95 backdrop-blur-sm border-primary/20 shadow-2xl">
        <CardHeader className="text-center border-b border-border/50 pb-6">
          <img 
            src="/images/logo-pcon-white.png" 
            alt="P-CON" 
            className="h-12 mx-auto mb-4"
          />
          <CardTitle className="text-2xl">Comprovante de Recompensa</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Programa de Indicações P-CON</p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <User className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Indicador</p>
              <p className="font-medium">{ownerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
            <DollarSign className="h-6 w-6 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Valor da Recompensa</p>
              <p className="font-bold text-2xl text-green-500">
                R$ {data.amount?.toFixed(2) || "0.00"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <Gift className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Lead Indicado</p>
              <p className="font-medium">{leadName}</p>
            </div>
          </div>

          {data.description && (
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Descrição</p>
              <p className="text-sm">{data.description}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {format(new Date(data.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
            {getStatusBadge(data.status)}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderLeadReceipt = () => {
    const data = coupon.data as any;
    const leadName = data.lead_name || "Lead";
    const ownerName = "Indicador";

    return (
      <Card className="max-w-lg mx-4 bg-card/95 backdrop-blur-sm border-primary/20 shadow-2xl">
        <CardHeader className="text-center border-b border-border/50 pb-6">
          <img 
            src="/images/logo-pcon-white.png" 
            alt="P-CON" 
            className="h-12 mx-auto mb-4"
          />
          <CardTitle className="text-2xl">Comprovante de Indicação</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Programa de Indicações P-CON</p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <User className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Indicador</p>
              <p className="font-medium">{ownerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <Gift className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Lead Indicado</p>
              <p className="font-medium">{leadName}</p>
            </div>
          </div>

          {data.amount > 0 && (
            <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
              <DollarSign className="h-6 w-6 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Valor da Recompensa</p>
                <p className="font-bold text-2xl text-green-500">
                  R$ {data.amount?.toFixed(2) || "0.00"}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <CheckCircle className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Conversão</p>
              <p className="font-medium">{data.is_converted ? "Convertido" : "Aguardando conversão"}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {format(new Date(data.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
            {getStatusBadge(data.status)}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderReceipt = () => {
    switch (coupon.type) {
      case 'coupon':
        return renderCouponReceipt();
      case 'lead':
      case 'affiliate_lead':
        return renderLeadReceipt();
      default:
        return renderRewardReceipt();
    }
  };

  return (
    <div className="relative min-h-screen">
      <BlueBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center py-8">
        {renderReceipt()}
      </div>
    </div>
  );
};

export default Receipt;
