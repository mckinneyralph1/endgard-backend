-- Create profiles table
create table public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  
  primary key (id)
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Create policies
create policy "Profiles are viewable by everyone"
  on public.profiles
  for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

-- Create trigger function to auto-create profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

-- Create trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create updated_at trigger
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at_column();