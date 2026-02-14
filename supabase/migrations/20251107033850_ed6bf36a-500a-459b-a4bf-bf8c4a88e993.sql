-- Create profiles for existing auth users that don't have one yet
insert into public.profiles (id, email)
select 
  au.id,
  au.email
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null;

-- Now add foreign key from user_roles to profiles
alter table public.user_roles
  add constraint user_roles_user_id_profiles_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;