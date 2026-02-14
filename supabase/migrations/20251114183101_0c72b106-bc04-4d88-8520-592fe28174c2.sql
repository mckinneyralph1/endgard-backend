-- Create permissions enum
CREATE TYPE public.app_permission AS ENUM ('approver', 'admin');

-- Create user_permissions table
CREATE TABLE public.user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission app_permission NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, permission)
);

-- Enable RLS on user_permissions
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Create function to check if a user has a permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission app_permission)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions
    WHERE user_id = _user_id
      AND permission = _permission
  )
$$;

-- Create function to check current user's permission
CREATE OR REPLACE FUNCTION public.current_user_has_permission(_permission app_permission)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_permission(auth.uid(), _permission)
$$;

-- RLS policies for user_permissions
CREATE POLICY "Managers can view all permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Users can view their own permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Managers can insert permissions"
ON public.user_permissions
FOR INSERT
TO authenticated
WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update permissions"
ON public.user_permissions
FOR UPDATE
TO authenticated
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete permissions"
ON public.user_permissions
FOR DELETE
TO authenticated
USING (current_user_has_role('manager'::app_role));

-- Migrate existing data: convert 'admin' and 'approver' roles to permissions
INSERT INTO public.user_permissions (user_id, permission)
SELECT user_id, 'admin'::app_permission
FROM public.user_roles
WHERE role = 'admin'::app_role
ON CONFLICT (user_id, permission) DO NOTHING;

INSERT INTO public.user_permissions (user_id, permission)
SELECT user_id, 'approver'::app_permission
FROM public.user_roles
WHERE role = 'approver'::app_role
ON CONFLICT (user_id, permission) DO NOTHING;

-- Remove admin and approver from user_roles table
DELETE FROM public.user_roles
WHERE role IN ('admin'::app_role, 'approver'::app_role);