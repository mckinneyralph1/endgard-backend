-- Fix section_comments: Restrict to authenticated users (already done, keeping as is)
-- No changes needed for section_comments as it already requires authentication

-- Fix checklist_items: Restrict all operations to authenticated users
DROP POLICY IF EXISTS "Anyone can view checklist items" ON public.checklist_items;
DROP POLICY IF EXISTS "Anyone can insert checklist items" ON public.checklist_items;
DROP POLICY IF EXISTS "Anyone can delete checklist items" ON public.checklist_items;
DROP POLICY IF EXISTS "Users can update checklist items" ON public.checklist_items;

-- Create authenticated-only policies for checklist_items
CREATE POLICY "Authenticated users can view checklist items" 
ON public.checklist_items 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert checklist items" 
ON public.checklist_items 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update checklist items" 
ON public.checklist_items 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Only managers can delete checklist items" 
ON public.checklist_items 
FOR DELETE 
TO authenticated
USING (public.current_user_has_role('manager'::app_role));

-- Fix checklist_approvals: Restrict to authenticated users
DROP POLICY IF EXISTS "Anyone can view checklist approvals" ON public.checklist_approvals;
DROP POLICY IF EXISTS "Users can submit checklist for approval" ON public.checklist_approvals;

CREATE POLICY "Authenticated users can view checklist approvals" 
ON public.checklist_approvals 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can submit checklist for approval" 
ON public.checklist_approvals 
FOR INSERT 
TO authenticated
WITH CHECK (true);