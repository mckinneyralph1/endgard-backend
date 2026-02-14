-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create hazards table
CREATE TABLE public.hazards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('catastrophic', 'critical', 'marginal', 'negligible')),
  likelihood TEXT NOT NULL CHECK (likelihood IN ('frequent', 'probable', 'occasional', 'remote', 'improbable')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('high', 'medium', 'low')),
  mitigation TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigated', 'accepted', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;

-- Create policies for hazards (public access for now since auth isn't implemented yet)
CREATE POLICY "Anyone can view hazards" 
ON public.hazards 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert hazards" 
ON public.hazards 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update hazards" 
ON public.hazards 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete hazards" 
ON public.hazards 
FOR DELETE 
USING (true);

-- Create index for better performance
CREATE INDEX idx_hazards_project_id ON public.hazards(project_id);
CREATE UNIQUE INDEX idx_hazards_project_uid ON public.hazards(project_id, uid);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_hazards_updated_at
BEFORE UPDATE ON public.hazards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();