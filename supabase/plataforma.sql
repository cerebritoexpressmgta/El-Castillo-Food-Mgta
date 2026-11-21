-- =====================================================================
-- PLATAFORMA: planes, vencimientos, pagos y plantillas por negocio.
-- Ejecutar UNA VEZ en Supabase > SQL Editor (después de multi-cliente.sql). Es seguro repetirlo.
-- =====================================================================
alter table public.negocios add column if not exists plantilla       text    not null default 'general';
alter table public.negocios add column if not exists precio_mensual  numeric(10,2) not null default 0 check (precio_mensual >= 0);
alter table public.negocios add column if not exists moneda          text    not null default 'USD';
alter table public.negocios add column if not exists vence_el        date;                       -- null = sin control de pago (no se bloquea por fecha)
alter table public.negocios add column if not exists dias_gracia     int     not null default 5 check (dias_gracia >= 0);
alter table public.negocios add column if not exists notas           text    not null default '';

-- El Castillo conserva su plantilla de comida original y no tiene vencimiento
update public.negocios set plantilla = 'restaurante' where id = 1 and plantilla = 'general';

create table if not exists public.negocio_pagos (
  id              bigint generated always as identity primary key,
  negocio_id      int not null references public.negocios (id) on delete cascade,
  fecha           date not null default current_date,
  monto           numeric(10,2) not null check (monto >= 0),
  moneda          text not null default 'USD',
  metodo          text not null default '',
  referencia      text not null default '',
  meses           int  not null default 1 check (meses between 1 and 24),
  vence_el_nuevo  date,
  notas           text not null default '',
  creado_en       timestamptz not null default now()
);
create index if not exists negocio_pagos_negocio on public.negocio_pagos (negocio_id, fecha desc);

alter table public.negocio_pagos enable row level security;
revoke all on public.negocio_pagos from anon, authenticated;
