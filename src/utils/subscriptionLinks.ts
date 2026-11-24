import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionPaymentLinkRecord {
  id: string;
  subscription_id: string;
  client_id: string;
  token: string;
  amount: number;
  due_date: string;
  status: string;
  payment_id: string | null;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export function buildSubscriptionPaymentUrl(token: string, origin?: string): string {
  const base =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.pconassinantes.site');
  return `${base}/pagar/${token}`;
}

export function getPendingLinkFromList(
  links?: Array<Partial<SubscriptionPaymentLinkRecord>> | null,
): Partial<SubscriptionPaymentLinkRecord> | null {
  if (!links || links.length === 0) return null;
  return (
    links
      .filter((l) => l.status === 'pending' && !!l.token)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] || null
  );
}

export async function ensureSubscriptionPaymentLink(subscription: {
  id: string;
  client_id: string;
  value: number;
  next_payment: string;
  status?: string;
}): Promise<SubscriptionPaymentLinkRecord | null> {
  const { data: existing } = await supabase
    .from('subscription_payment_links')
    .select('*')
    .eq('subscription_id', subscription.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing as SubscriptionPaymentLinkRecord;
  }

  if (subscription.status && subscription.status !== 'active') {
    return null;
  }

  const { data: created, error } = await supabase
    .from('subscription_payment_links')
    .insert({
      subscription_id: subscription.id,
      client_id: subscription.client_id,
      amount: Number(subscription.value),
      due_date: subscription.next_payment,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error || !created) {
    console.error('[subscriptionLinks] Error creating payment link:', error);
    return null;
  }

  return created as SubscriptionPaymentLinkRecord;
}

export async function ensureClientActiveSubscriptionUrl(clientId: string, origin?: string): Promise<string | null> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, client_id, value, next_payment, status')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('next_payment', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!sub) return null;
  const link = await ensureSubscriptionPaymentLink(sub);
  return link?.token ? buildSubscriptionPaymentUrl(link.token, origin) : null;
}

export function computeNextMonthlyDueDate(currentNextPayment: string): string {
  const currentNext = new Date(currentNextPayment || new Date().toISOString());
  const nextDay = currentNext.getDate();
  const nextMonth = currentNext.getMonth() + 1;
  const nextYear = currentNext.getFullYear();

  let newDate: Date;
  if (nextMonth > 11) {
    newDate = new Date(nextYear + 1, 0, 1);
  } else {
    newDate = new Date(nextYear, nextMonth, 1);
  }
  const lastDay = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
  newDate.setDate(Math.min(nextDay, lastDay));
  newDate.setHours(12, 0, 0, 0);
  return newDate.toISOString();
}

export async function advanceSubscriptionCycleClient(params: {
  subscriptionId: string;
  paymentId?: string | null;
  subscriptionLinkId?: string | null;
  paymentMethod?: string;
  paidAt?: string;
}): Promise<{ advanced: boolean; nextPayment?: string; newLinkToken?: string | null }> {
  const paidAt = params.paidAt || new Date().toISOString();
  const paymentMethod = params.paymentMethod || 'manual';

  const { data: rpcData, error: rpcError } = await supabase.rpc('advance_subscription_cycle', {
    p_subscription_id: params.subscriptionId,
    p_payment_id: params.paymentId || undefined,
    p_subscription_link_id: params.subscriptionLinkId || undefined,
    p_payment_method: paymentMethod,
    p_paid_at: paidAt,
  });

  if (!rpcError && rpcData && typeof rpcData === 'object') {
    const res = rpcData as Record<string, unknown>;
    return {
      advanced: !!res.advanced,
      nextPayment: (res.next_payment as string) || undefined,
      newLinkToken: (res.new_link_token as string) || null,
    };
  }

  // Fallback se a função SQL ainda não estiver aplicada
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, client_id, value, next_payment')
    .eq('id', params.subscriptionId)
    .maybeSingle();

  if (!sub) return { advanced: false };

  const nextPayment = computeNextMonthlyDueDate(sub.next_payment);

  await supabase
    .from('subscription_payment_links')
    .update({
      status: 'paid',
      payment_id: params.paymentId || null,
      payment_method: paymentMethod,
      paid_at: paidAt,
      updated_at: new Date().toISOString(),
    })
    .eq('subscription_id', params.subscriptionId)
    .eq('status', 'pending');

  await supabase
    .from('subscriptions')
    .update({ next_payment: nextPayment, status: 'active' })
    .eq('id', params.subscriptionId);

  const newLink = await ensureSubscriptionPaymentLink({
    id: sub.id,
    client_id: sub.client_id,
    value: sub.value,
    next_payment: nextPayment,
    status: 'active',
  });

  return {
    advanced: true,
    nextPayment,
    newLinkToken: newLink?.token || null,
  };
}
