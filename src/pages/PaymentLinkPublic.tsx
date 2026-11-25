import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LoaderCircle, XCircle } from 'lucide-react';
import BlueBackground from '@/components/BlueBackground';
import StandalonePaymentCheckout from '@/components/StandalonePaymentCheckout';
import { Card } from '@/components/ui/card';
import { PaymentLinkRecord } from '@/hooks/usePaymentLinks';
import { supabase } from '@/integrations/supabase/client';

export default function PaymentLinkPublic() {
  const { id } = useParams();
  const [link, setLink] = useState<PaymentLinkRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('payment_links')
          .select('*')
          .eq('token', id)
          .maybeSingle();

        if (!cancelled) {
          setLink((data as PaymentLinkRecord) || null);
        }
      } catch (err) {
        console.error('Erro ao buscar link de pagamento:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="relative min-h-screen bg-[#061224] flex items-center justify-center text-white">
        <BlueBackground />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <LoaderCircle className="w-8 h-8 animate-spin text-sky-400" />
          <p className="text-sm text-white/75">Carregando cobrança...</p>
        </div>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="relative min-h-screen bg-[#061224] flex items-center justify-center p-4 text-white">
        <BlueBackground />
        <Card className="relative z-10 max-w-md w-full p-6 bg-[#0c1d38]/90 border-white/15 text-center space-y-3 text-white">
          <XCircle className="w-10 h-10 text-red-400 mx-auto" />
          <h1 className="text-lg font-bold">Link não encontrado</h1>
          <p className="text-sm text-white/65">
            Verifique se o endereço está completo ou solicite um novo link de pagamento.
          </p>
        </Card>
      </div>
    );
  }

  return <StandalonePaymentCheckout initialLink={link} />;
}
