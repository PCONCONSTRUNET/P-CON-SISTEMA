ALTER TABLE public.proposals
ADD COLUMN view_notification_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN approved_notification_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN rejected_notification_sent_at TIMESTAMP WITH TIME ZONE;