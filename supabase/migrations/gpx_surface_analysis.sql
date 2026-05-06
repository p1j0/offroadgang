alter table public.tours
add column if not exists surface_analysis jsonb,
add column if not exists surface_display jsonb,
add column if not exists surface_analysis_updated_at timestamptz;

comment on column public.tours.surface_analysis is
'GPX surface analysis result: total paved/unpaved/unknown km plus per-track offroad breakdown.';

comment on column public.tours.surface_analysis_updated_at is
'Timestamp when the GPX surface analysis was last calculated.';

comment on column public.tours.surface_display is
'Selected GPX surface breakdown for display, matching the chosen tour distance source.';
