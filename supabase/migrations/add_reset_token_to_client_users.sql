-- Migration: Add reset_token columns to client_users table
-- Run this in the Supabase SQL editor

ALTER TABLE client_users
ADD COLUMN IF NOT EXISTS reset_token TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ DEFAULT NULL;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_client_users_reset_token 
ON client_users(reset_token) 
WHERE reset_token IS NOT NULL;
