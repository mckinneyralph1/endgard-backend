-- Allow managers to update any user profile
CREATE POLICY "Managers can update all profiles"
ON public.profiles
FOR UPDATE
USING (current_user_has_role('manager'::app_role));