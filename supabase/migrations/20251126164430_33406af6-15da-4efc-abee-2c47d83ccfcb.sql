-- Create page_banners table for managing banner content across pages
CREATE TABLE public.page_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.page_banners ENABLE ROW LEVEL SECURITY;

-- Anyone can view banners
CREATE POLICY "Anyone can view page banners"
ON public.page_banners
FOR SELECT
USING (true);

-- Only admins can insert banners
CREATE POLICY "Admins can insert page banners"
ON public.page_banners
FOR INSERT
WITH CHECK (current_user_has_role('admin'::app_role));

-- Only admins can update banners
CREATE POLICY "Admins can update page banners"
ON public.page_banners
FOR UPDATE
USING (current_user_has_role('admin'::app_role));

-- Only admins can delete banners
CREATE POLICY "Admins can delete page banners"
ON public.page_banners
FOR DELETE
USING (current_user_has_role('admin'::app_role));

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_page_banners_updated_at
BEFORE UPDATE ON public.page_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default banners for existing pages
INSERT INTO public.page_banners (page_key, title, subtitle) VALUES
('dashboard', 'Safety Certification Dashboard', 'AI-powered compliance tracking across multiple industry standards'),
('comparison', 'The First Platform Purpose-Built for Multi-Modal Transportation Safety Certification', 'While general ALM tools require heavy customization, ProSafe is designed from the ground up to handle rail, bus, eVTOL, heliport, and other transportation safety certification projects natively.');

-- Comment on table
COMMENT ON TABLE public.page_banners IS 'Stores editable banner content for different pages throughout the application';