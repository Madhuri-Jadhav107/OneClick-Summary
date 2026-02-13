-- Drop existing objects to ensure a clean slate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Ensure tables exist (using IF NOT EXISTS to avoid errors if they do)
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id),
  full_name text
);

CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  title text NOT NULL,
  date timestamptz NOT NULL,
  duration text,
  transcript text,
  summary text,
  participants jsonb,
  status text DEFAULT 'Processed'
);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Re-create the function with better error handling and permissions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_company_id uuid;
BEGIN
  -- Create a new company for the user
  INSERT INTO public.companies (name)
  VALUES ('My Company')
  RETURNING id INTO new_company_id;

  -- Create the profile
  INSERT INTO public.profiles (id, company_id, full_name)
  VALUES (new.id, new_company_id, COALESCE(new.raw_user_meta_data->>'full_name', 'New User'));

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Grant permissions to authenticated users to allow reading their own data
-- (Note: The Trigger bypasses this for writing, but we need these for the app to work)
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.meetings TO authenticated;

-- Policies
-- Drop existing policies first to avoiding duplication errors
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own company meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can insert meetings for their company" ON public.meetings;

-- Create Policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can view own company meetings"
ON public.meetings FOR SELECT
USING (
  company_id IN (
    SELECT company_id FROM public.profiles
    WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert meetings for their company"
ON public.meetings FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id FROM public.profiles
    WHERE id = auth.uid()
  )
);
