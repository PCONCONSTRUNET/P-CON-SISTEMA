-- Add reward_type column to referral_rewards table
-- 'cash' = R$100 for affiliates
-- 'coupon' = R$150 discount coupon for clients with active monthly subscription

ALTER TABLE public.referral_rewards 
ADD COLUMN IF NOT EXISTS reward_type TEXT NOT NULL DEFAULT 'cash';

-- Add description column to store additional info about the reward
ALTER TABLE public.referral_rewards 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Also add to affiliate_rewards for consistency
ALTER TABLE public.affiliate_rewards 
ADD COLUMN IF NOT EXISTS reward_type TEXT NOT NULL DEFAULT 'cash';

ALTER TABLE public.affiliate_rewards 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add client_reward_value to referral_settings for the coupon value
ALTER TABLE public.referral_settings 
ADD COLUMN IF NOT EXISTS client_reward_value NUMERIC NOT NULL DEFAULT 150;

-- Add client_reward_type description
ALTER TABLE public.referral_settings 
ADD COLUMN IF NOT EXISTS client_reward_description TEXT NOT NULL DEFAULT 'Cupom de desconto para projetos futuros';