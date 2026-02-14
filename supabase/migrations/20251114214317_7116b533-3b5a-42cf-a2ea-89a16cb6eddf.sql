-- Drop the manager policy only
DROP POLICY IF EXISTS "Managers can update all profiles" ON public.profiles;