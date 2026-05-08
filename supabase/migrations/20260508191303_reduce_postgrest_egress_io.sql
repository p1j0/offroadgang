-- Store tiny route metadata next to the full GPX JSON. Weather/location
-- features can use this instead of downloading gpx_route from PostgREST.

alter table public.tours
  add column if not exists route_metadata jsonb;

create or replace function public.build_route_metadata(gpx jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  tracks_json jsonb;
  waypoints_json jsonb;
  track jsonb;
  points jsonb;
  p jsonb;
  start_p jsonb;
  middle_p jsonb;
  end_p jsonb;
  points_len int;
  idx int := 0;
  track_rows jsonb := '[]'::jsonb;
  min_lat double precision := null;
  min_lon double precision := null;
  max_lat double precision := null;
  max_lon double precision := null;
  lat double precision;
  lon double precision;
begin
  if gpx is null then
    return null;
  end if;

  if jsonb_typeof(gpx) = 'array' then
    tracks_json := jsonb_build_array(jsonb_build_object('name', 'Route', 'points', gpx));
    waypoints_json := '[]'::jsonb;
  else
    tracks_json := coalesce(gpx->'tracks', '[]'::jsonb);
    waypoints_json := coalesce(gpx->'waypoints', '[]'::jsonb);
  end if;

  for track in select value from jsonb_array_elements(tracks_json)
  loop
    points := coalesce(track->'points', '[]'::jsonb);
    if jsonb_typeof(points) <> 'array' then
      idx := idx + 1;
      continue;
    end if;

    points_len := jsonb_array_length(points);
    if points_len = 0 then
      idx := idx + 1;
      continue;
    end if;

    for p in select value from jsonb_array_elements(points)
    loop
      if jsonb_typeof(p) = 'array' and jsonb_array_length(p) >= 2 then
        lat := (p->>0)::double precision;
        lon := (p->>1)::double precision;
        min_lat := least(coalesce(min_lat, lat), lat);
        min_lon := least(coalesce(min_lon, lon), lon);
        max_lat := greatest(coalesce(max_lat, lat), lat);
        max_lon := greatest(coalesce(max_lon, lon), lon);
      end if;
    end loop;

    start_p := points->0;
    middle_p := points->(((points_len - 1) / 2)::int);
    end_p := points->(points_len - 1);

    track_rows := track_rows || jsonb_build_array(jsonb_build_object(
      'index', idx,
      'name', coalesce(nullif(track->>'name', ''), 'Track ' || (idx + 1)),
      'color', track->>'color',
      'pointCount', points_len,
      'start', jsonb_build_object('lat', (start_p->>0)::double precision, 'lon', (start_p->>1)::double precision),
      'middle', jsonb_build_object('lat', (middle_p->>0)::double precision, 'lon', (middle_p->>1)::double precision),
      'end', jsonb_build_object('lat', (end_p->>0)::double precision, 'lon', (end_p->>1)::double precision)
    ));

    idx := idx + 1;
  end loop;

  return jsonb_build_object(
    'version', 1,
    'trackCount', jsonb_array_length(track_rows),
    'waypointCount', case when jsonb_typeof(waypoints_json) = 'array' then jsonb_array_length(waypoints_json) else 0 end,
    'bounds', case when min_lat is null then null else jsonb_build_object(
      'minLat', min_lat,
      'minLon', min_lon,
      'maxLat', max_lat,
      'maxLon', max_lon
    ) end,
    'tracks', track_rows
  );
end;
$$;

update public.tours
set route_metadata = public.build_route_metadata(gpx_route)
where gpx_route is not null
  and route_metadata is null;

create or replace function public.set_tour_route_metadata()
returns trigger
language plpgsql
as $$
begin
  if new.gpx_route is null then
    new.route_metadata := null;
  elsif tg_op = 'INSERT' then
    new.route_metadata := public.build_route_metadata(new.gpx_route);
  elsif new.gpx_route is distinct from old.gpx_route then
    new.route_metadata := public.build_route_metadata(new.gpx_route);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_tour_route_metadata on public.tours;
create trigger trg_set_tour_route_metadata
before insert or update of gpx_route on public.tours
for each row execute function public.set_tour_route_metadata();

-- Reduce Disk IO for badge/count queries that filter by scope + created_at.
-- Existing single-column scope indexes are still useful, but these composite
-- indexes let Postgres jump directly to the time range for "new since seen".

create index if not exists idx_messages_tour_created_at
  on public.messages (tour_id, created_at);

create index if not exists idx_change_log_tour_created_at
  on public.change_log (tour_id, created_at);

create index if not exists idx_tour_media_tour_created_at
  on public.tour_media (tour_id, created_at);

create index if not exists idx_community_messages_community_created_at
  on public.community_messages (community_id, created_at);

create index if not exists idx_community_polls_community_created_at
  on public.community_polls (community_id, created_at);

create index if not exists idx_community_media_community_created_at
  on public.community_media (community_id, created_at);

-- Route-heavy screens load route JSON only for tours in the current community.
create index if not exists idx_tours_community_date
  on public.tours (community_id, date);
