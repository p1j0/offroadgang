type GeoPoint = {
  latitude: number;
  longitude: number;
};

type GpxTrack = {
  name: string | null;
  segments: GeoPoint[][];
};

type SurfaceBreakdown = {
  pavedKilometers: number;
  unpavedKilometers: number;
  unknownKilometers: number;
  totalKilometers: number;
  offRoadPercentageOfKnownSurface: number;
  offRoadPercentageOfTotal: number;
};

type TrackSurfaceBreakdown = {
  trackNumber: number;
  trackName: string | null;
  breakdown: SurfaceBreakdown;
};

const VALHALLA_BASE_URL = Deno.env.get("VALHALLA_BASE_URL") ?? "https://valhalla1.openstreetmap.de";
const DEFAULT_COSTING = Deno.env.get("VALHALLA_COSTING") ?? "bicycle";
const DEFAULT_MAX_KM_PER_REQUEST = Number(Deno.env.get("VALHALLA_MAX_KM_PER_REQUEST") ?? "80");
const DEFAULT_REQUEST_DELAY_MS = Number(Deno.env.get("VALHALLA_REQUEST_DELAY_MS") ?? "1100");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Use POST with GPX XML or JSON body { gpx: string }" }, 405);
  }

  try {
    const body = await request.text();
    const contentType = request.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? JSON.parse(body) : { gpx: body };
    const gpx = String(payload.gpx ?? "");

    if (!gpx.trim()) {
      return json({ error: "Missing GPX content" }, 400);
    }

    const options = {
      costing: String(payload.costing ?? DEFAULT_COSTING),
      maxKilometersPerRequest: Number(payload.maxKilometersPerRequest ?? DEFAULT_MAX_KM_PER_REQUEST),
      requestDelayMillis: Number(payload.requestDelayMillis ?? DEFAULT_REQUEST_DELAY_MS),
    };

    const result = await analyzeGpx(gpx, options);
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function analyzeGpx(
  gpx: string,
  options: { costing: string; maxKilometersPerRequest: number; requestDelayMillis: number },
) {
  const tracks = parseGpxTracks(gpx);
  const trackResults: TrackSurfaceBreakdown[] = [];
  let total = emptyBreakdown();

  for (let i = 0; i < tracks.length; i++) {
    const trackBreakdown = await analyzeSegments(tracks[i].segments, options);
    total = addBreakdowns(total, trackBreakdown);
    trackResults.push({
      trackNumber: i + 1,
      trackName: tracks[i].name,
      breakdown: withTotals(trackBreakdown),
    });
  }

  return {
    total: withTotals(total),
    tracks: trackResults,
  };
}

async function analyzeSegments(
  segments: GeoPoint[][],
  options: { costing: string; maxKilometersPerRequest: number; requestDelayMillis: number },
) {
  let breakdown = emptyBreakdown();

  for (const segment of segments) {
    const chunks = splitByDistance(segment, options.maxKilometersPerRequest);
    for (const chunk of chunks) {
      if (chunk.length < 2) continue;
      const edges = await fetchValhallaTraceAttributes(chunk, options.costing);
      breakdown = addBreakdowns(breakdown, summarizeEdges(edges));
      if (options.requestDelayMillis > 0) {
        await delay(options.requestDelayMillis);
      }
    }
  }

  return breakdown;
}

async function fetchValhallaTraceAttributes(points: GeoPoint[], costing: string) {
  const response = await fetch(`${VALHALLA_BASE_URL.replace(/\/$/, "")}/trace_attributes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      shape: points.map((point) => ({ lat: point.latitude, lon: point.longitude })),
      costing,
      shape_match: "walk_or_snap",
      units: "kilometers",
      trace_options: {
        gps_accuracy: 20,
        search_radius: 50,
      },
      filters: {
        action: "include",
        attributes: [
          "edge.length",
          "edge.surface",
          "edge.unpaved",
          "edge.use",
          "edge.road_class",
          "edge.way_id",
        ],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Valhalla failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return Array.isArray(data.edges) ? data.edges : [];
}

function parseGpxTracks(gpx: string): GpxTrack[] {
  const trackMatches = [...gpx.matchAll(/<trk\b[\s\S]*?<\/trk>/gi)];
  const tracks = trackMatches.map((match) => parseTrack(match[0])).filter((track) => track.segments.length > 0);

  if (tracks.length > 0) {
    return tracks;
  }

  const fallbackPoints = parseTrackPoints(gpx);
  return fallbackPoints.length > 0 ? [{ name: null, segments: [fallbackPoints] }] : [];
}

function parseTrack(trackXml: string): GpxTrack {
  const name = decodeXml(firstMatch(trackXml, /<name\b[^>]*>([\s\S]*?)<\/name>/i));
  const segmentMatches = [...trackXml.matchAll(/<trkseg\b[\s\S]*?<\/trkseg>/gi)];
  const segments = segmentMatches
    .map((match) => parseTrackPoints(match[0]))
    .filter((points) => points.length > 0);

  return { name, segments };
}

function parseTrackPoints(xml: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  const pointRegex = /<trkpt\b[^>]*\blat=["']([^"']+)["'][^>]*\blon=["']([^"']+)["'][^>]*>/gi;

  for (const match of xml.matchAll(pointRegex)) {
    points.push({
      latitude: Number(match[1]),
      longitude: Number(match[2]),
    });
  }

  return points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
}

function summarizeEdges(edges: any[]) {
  let breakdown = emptyBreakdown();

  for (const edge of edges) {
    const length = Math.max(0, Number(edge.length ?? 0));
    const surfaceType = classifySurface(edge);

    if (surfaceType === "PAVED") {
      breakdown.pavedKilometers += length;
    } else if (surfaceType === "UNPAVED") {
      breakdown.unpavedKilometers += length;
    } else {
      breakdown.unknownKilometers += length;
    }
  }

  return breakdown;
}

function classifySurface(edge: any) {
  if (edge.unpaved === true) return "UNPAVED";

  const surface = normalize(edge.surface);
  if (["0", "1", "2", "paved_smooth", "paved", "paved_rough"].includes(surface)) return "PAVED";
  if (["3", "4", "5", "6", "7", "compacted", "dirt", "gravel", "path", "impassable"].includes(surface)) {
    return "UNPAVED";
  }

  const use = normalize(edge.use);
  if (use === "track" || use === "mountain_bike") return "UNPAVED";

  const roadClass = normalize(edge.road_class);
  if (["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service_other"].includes(roadClass)) {
    return "PAVED";
  }

  return "UNKNOWN";
}

function splitByDistance(points: GeoPoint[], maxKilometers: number) {
  if (points.length < 2 || maxKilometers <= 0) return [points];

  const chunks: GeoPoint[][] = [];
  let current = [points[0]];
  let currentDistance = 0;

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const next = points[i];
    const stepDistance = distanceKilometers(previous, next);

    if (current.length >= 2 && currentDistance + stepDistance > maxKilometers) {
      chunks.push(current);
      current = [previous];
      currentDistance = 0;
    }

    current.push(next);
    currentDistance += stepDistance;
  }

  if (current.length >= 2) chunks.push(current);
  return chunks;
}

function distanceKilometers(from: GeoPoint, to: GeoPoint) {
  const earthRadiusKilometers = 6371.0088;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKilometers * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function emptyBreakdown(): SurfaceBreakdown {
  return {
    pavedKilometers: 0,
    unpavedKilometers: 0,
    unknownKilometers: 0,
    totalKilometers: 0,
    offRoadPercentageOfKnownSurface: 0,
    offRoadPercentageOfTotal: 0,
  };
}

function addBreakdowns(left: SurfaceBreakdown, right: SurfaceBreakdown) {
  return {
    ...emptyBreakdown(),
    pavedKilometers: left.pavedKilometers + right.pavedKilometers,
    unpavedKilometers: left.unpavedKilometers + right.unpavedKilometers,
    unknownKilometers: left.unknownKilometers + right.unknownKilometers,
  };
}

function withTotals(breakdown: SurfaceBreakdown) {
  const total = breakdown.pavedKilometers + breakdown.unpavedKilometers + breakdown.unknownKilometers;
  const known = breakdown.pavedKilometers + breakdown.unpavedKilometers;
  return {
    pavedKilometers: round3(breakdown.pavedKilometers),
    unpavedKilometers: round3(breakdown.unpavedKilometers),
    unknownKilometers: round3(breakdown.unknownKilometers),
    totalKilometers: round3(total),
    offRoadPercentageOfKnownSurface: known === 0 ? 0 : round1((breakdown.unpavedKilometers / known) * 100),
    offRoadPercentageOfTotal: total === 0 ? 0 : round1((breakdown.unpavedKilometers / total) * 100),
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function firstMatch(value: string, regex: RegExp) {
  return value.match(regex)?.[1] ?? null;
}

function decodeXml(value: string | null) {
  if (value == null) return null;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replaceAll(" ", "_");
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
