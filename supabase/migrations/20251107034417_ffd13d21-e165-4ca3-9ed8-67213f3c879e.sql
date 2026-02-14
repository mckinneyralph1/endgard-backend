-- Create report templates table
create table public.report_templates (
  id uuid not null default gen_random_uuid() primary key,
  project_id text not null,
  template_type text not null check (template_type in ('safety_case', 'verification_report')),
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published')),
  version text not null default '1.0',
  created_by text,
  approved_by text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_modified_by text,
  content jsonb default '{}'::jsonb
);

-- Enable RLS
alter table public.report_templates enable row level security;

-- Create policies
create policy "Anyone can view report templates"
  on public.report_templates
  for select
  using (true);

create policy "Anyone can insert report templates"
  on public.report_templates
  for insert
  with check (true);

create policy "Anyone can update report templates"
  on public.report_templates
  for update
  using (true);

create policy "Managers can delete report templates"
  on public.report_templates
  for delete
  using (current_user_has_role('manager'::app_role));

-- Create updated_at trigger
create trigger update_report_templates_updated_at
  before update on public.report_templates
  for each row
  execute function public.update_updated_at_column();

-- Create report sections table
create table public.report_sections (
  id uuid not null default gen_random_uuid() primary key,
  report_id uuid not null references public.report_templates(id) on delete cascade,
  section_number text not null,
  title text not null,
  content text,
  status text not null default 'incomplete' check (status in ('incomplete', 'in_progress', 'complete', 'reviewed')),
  assigned_to text,
  completed_by text,
  completed_date timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Enable RLS on report sections
alter table public.report_sections enable row level security;

-- Create policies for report sections
create policy "Anyone can view report sections"
  on public.report_sections
  for select
  using (true);

create policy "Anyone can insert report sections"
  on public.report_sections
  for insert
  with check (true);

create policy "Anyone can update report sections"
  on public.report_sections
  for update
  using (true);

create policy "Anyone can delete report sections"
  on public.report_sections
  for delete
  using (true);

-- Create updated_at trigger for sections
create trigger update_report_sections_updated_at
  before update on public.report_sections
  for each row
  execute function public.update_updated_at_column();