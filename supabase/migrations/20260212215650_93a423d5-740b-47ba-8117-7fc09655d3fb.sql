-- Create the trigger that fires notify_subscription_date_change on subscription updates
CREATE TRIGGER trigger_notify_subscription_date_change
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_subscription_date_change();