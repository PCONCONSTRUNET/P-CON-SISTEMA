import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import BlueBackground from '@/components/BlueBackground';
import StandalonePaymentCheckout from '@/components/StandalonePaymentCheckout';
import { PaymentLinkRecord } from '@/hooks/usePaymentLinks';
import { supabase } from '@/integrations/supabase/client';

const SubscriptionCheckoutPublic = lazy(() => import('@/pages/SubscriptionCheckoutPublic'));

/**
 * Dispatcher para /pagar/:id:
 * identifica se o token pertence a um Link de Pagamento avulso (`payment_links`)
 * ou segue normalmente para o checkout legado de assinatura (`SubscriptionCheckoutPublic`).
 */
export default function PublicPayDispatcher() {
  const { id } = useParams();
  const [standaloneLink, setStandaloneLink] = useState<PaymentLinkRecord | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!id) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('payment_links')
          .select('*')
          .eq('token', id)
          .maybeSingle();

        if (!cancelled && !error && data) {
          setStandaloneLink(data as PaymentLinkRecord);
        } else if (!cancelled) {
          setStandaloneLink(null);
        }
      } catch {
        if (!cancelled) setStandaloneLink(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (checking) {
    return (
      <div className="relative min-h-screen bg-[#061224] flex items-center justify-center text-white">
        <BlueBackground />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <LoaderCircle className="w-8 h-8 animate-spin text-sky-400" />
          <p className="text-sm text-white/75">Carregando pagamento...</p>
        </div>
      </div>
    );
  }

  if (standaloneLink) {
    return <StandalonePaymentCheckout initialLink={standaloneLink} />;
  }

  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen bg-[#061224] flex items-center justify-center text-white">
          <BlueBackground />
          <LoaderCircle className="w-8 h-8 animate-spin text-sky-400 relative z-10" />
        </div>
      }
    >
      <SubscriptionCheckoutPublic />
    </Suspense>
  );
}
