-- Ejecutar en Supabase > SQL Editor (una sola vez)

-- 1) Estado de la aplicación (menú, pedidos, usuarios...) en una fila
create table if not exists public.app_state (
  id          int primary key,
  version     bigint not null default 1,
  data        jsonb  not null,
  evento      jsonb,
  last_ping   timestamptz,
  updated_at  timestamptz not null default now()
);

-- Candado total: nadie con la llave pública (anon) puede leer ni escribir.
-- Solo el Worker, con la llave service_role (secreta), accede.
alter table public.app_state enable row level security;
revoke all on public.app_state from anon, authenticated;

-- 2) Imágenes del menú (bucket público de solo lectura)
insert into storage.buckets (id, name, public)
values ('imagenes', 'imagenes', true)
on conflict (id) do nothing;
