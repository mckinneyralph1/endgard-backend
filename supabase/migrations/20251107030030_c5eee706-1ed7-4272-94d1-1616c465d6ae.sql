-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('user', 'manager');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user has a role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if current user has a role
CREATE OR REPLACE FUNCTION public.current_user_has_role(_role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), _role)
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_role('manager'));

CREATE POLICY "Only managers can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_role('manager'));

CREATE POLICY "Only managers can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role('manager'));

CREATE POLICY "Only managers can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_role('manager'));

-- Update checklist_items RLS policies
-- Drop old policy
DROP POLICY IF EXISTS "Anyone can update checklist items" ON public.checklist_items;

-- Create new policies - split into manager and non-manager updates
CREATE POLICY "Managers can update all checklist items"
  ON public.checklist_items
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role('manager'));

CREATE POLICY "Users can update non-approval fields"
  ON public.checklist_items
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_has_role('manager'))
  WITH CHECK (
    approval_status IS NULL OR 
    approval_status = 'not_submitted' OR 
    approval_status = 'pending'
  );

-- Create index for faster role lookups
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);