-- Add route preview points to route_metadata so overview/planning maps can
-- render without downloading the full gpx_route JSON.

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
  preview_rows jsonb;
  preview_step int;
  ord int;
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
    preview_rows := '[]'::jsonb;
    preview_step := greatest(1, ceil(points_len::numeric / 120)::int);

    for p, ord in select value, ordinality::int from jsonb_array_elements(points) with ordinality
    loop
      if ord = 1 or ord = points_len or ((ord - 1) % preview_step = 0) then
        preview_rows := preview_rows || jsonb_build_array(jsonb_build_object(
          'lat', (p->>0)::double precision,
          'lon', (p->>1)::double precision
        ));
      end if;
    end loop;

    track_rows := track_rows || jsonb_build_array(jsonb_build_object(
      'index', idx,
      'name', coalesce(nullif(track->>'name', ''), 'Track ' || (idx + 1)),
      'color', track->>'color',
      'pointCount', points_len,
      'start', jsonb_build_object('lat', (start_p->>0)::double precision, 'lon', (start_p->>1)::double precision),
      'middle', jsonb_build_object('lat', (middle_p->>0)::double precision, 'lon', (middle_p->>1)::double precision),
      'end', jsonb_build_object('lat', (end_p->>0)::double precision, 'lon', (end_p->>1)::double precision),
      'preview', preview_rows
    ));

    idx := idx + 1;
  end loop;

  return jsonb_build_object(
    'version', 2,
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
where gpx_route is not null;

create or replace function public.get_home_badges(
  p_tour_ids uuid[],
  p_chat_seen jsonb default '{}'::jsonb,
  p_changelog_seen jsonb default '{}'::jsonb
)
returns table (
  tour_id uuid,
  chat_count bigint,
  changelog_count bigint
)
language sql
stable
as $$
  with requested as (
    select unnest(p_tour_ids) as tour_id
  ),
  chat_counts as (
    select m.tour_id, count(*)::bigint as count
    from public.messages m
    join requested r on r.tour_id = m.tour_id
    where m.user_id <> auth.uid()
      and m.created_at > coalesce(
        nullif(p_chat_seen ->> m.tour_id::text, '')::timestamptz,
        '-infinity'::timestamptz
      )
    group by m.tour_id
  ),
  log_counts as (
    select l.tour_id, count(*)::bigint as count
    from public.change_log l
    join requested r on r.tour_id = l.tour_id
    where l.user_id <> auth.uid()
      and l.created_at > coalesce(
        nullif(p_changelog_seen ->> l.tour_id::text, '')::timestamptz,
        '-infinity'::timestamptz
      )
    group by l.tour_id
  )
  select
    r.tour_id,
    coalesce(c.count, 0)::bigint as chat_count,
    coalesce(l.count, 0)::bigint as changelog_count
  from requested r
  left join chat_counts c on c.tour_id = r.tour_id
  left join log_counts l on l.tour_id = r.tour_id;
$$;
