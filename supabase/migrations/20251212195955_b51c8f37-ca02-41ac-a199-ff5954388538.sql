-- Create client_users table for client authentication
CREATE TABLE public.client_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public access for login verification (we'll handle security in edge function)
CREATE POLICY "Allow public read for login" ON public.client_users
  FOR SELECT USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_client_users_updated_at
  BEFORE UPDATE ON public.client_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create client_sessions table for session management
CREATE TABLE public.client_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_user_id UUID NOT NULL REFERENCES public.client_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public access for session verification
CREATE POLICY "Allow public read for sessions" ON public.client_sessions
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert for sessions" ON public.client_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public delete for sessions" ON public.client_sessions
  FOR DELETE USING (true);