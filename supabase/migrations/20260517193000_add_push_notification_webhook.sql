-- ================================================================
-- Migration: Create admin_notifications and Webhook for OneSignal Push
-- ================================================================
-- 1. Cria a tabela admin_notifications caso não exista
-- 2. Habilita RLS e cria política de acesso público total (para correção)
-- 3. Adiciona a tabela ao Supabase Realtime
-- 4. Cria o Database Webhook para chamar a Edge Function send-push-notification
-- ================================================================

-- ── 1. CRIAR TABELA ADMIN_NOTIFICATIONS ──────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ── 2. CONFIGURAR RLS E POLÍTICAS ────────────────────────────────
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Remover políticas anteriores se existirem
DROP POLICY IF EXISTS "Public full access to admin_notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "Full access to service_role" ON public.admin_notifications;

-- Criar política de acesso público total
CREATE POLICY "Public full access to admin_notifications" 
  ON public.admin_notifications 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- ── 3. ADICIONAR AO REALTIME ─────────────────────────────────────
DO $$ 
BEGIN
  -- Se a publicação já existir, tenta adicionar a tabela
  ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
EXCEPTION 
  WHEN others THEN 
    -- Se não estiver no canal do realtime ou outro erro, ignora
    NULL;
END $$;

-- ── 4. CONFIGURAR WEBHOOK DE PUSH NOTIFICATIONS ──────────────────
-- Garante que pg_net está disponível (padrão no Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove trigger e função se já existirem
DROP TRIGGER  IF EXISTS trg_push_on_admin_notification ON admin_notifications;
DROP FUNCTION IF EXISTS fn_push_on_admin_notification();

-- Função que dispara o webhook via pg_net
CREATE OR REPLACE FUNCTION fn_push_on_admin_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Chamada HTTP assíncrona via pg_net (não bloqueia a transação)
  PERFORM extensions.http_post(
    url     := 'https://bevahgtmcdicyhjnrylk.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'SUPABASE_SERVICE_KEY'
        LIMIT 1
      )
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id',       NEW.id,
        'title',    NEW.title,
        'message',  NEW.message,
        'category', NEW.category,
        'type',     NEW.type
      )
    )::text
  );

  RETURN NEW;
EXCEPTION
  -- Se falhar (ex: pg_net indisponível), não bloqueia o INSERT
  WHEN others THEN
    RAISE WARNING '[push-webhook] Falha ao enviar push: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Criar Trigger AFTER INSERT
CREATE TRIGGER trg_push_on_admin_notification
  AFTER INSERT ON admin_notifications
  FOR EACH ROW
  EXECUTE FUNCTION fn_push_on_admin_notification();

COMMENT ON TRIGGER trg_push_on_admin_notification ON admin_notifications
  IS 'Dispara push OneSignal via Edge Function a cada nova notificação de admin.';
