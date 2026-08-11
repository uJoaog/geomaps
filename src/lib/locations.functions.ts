import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const linkSchema = z.object({ link: z.string().trim().min(1).max(2000) });

// Extract lat/lng from a Google Maps URL.
// Handles patterns:  @lat,lng   !3dLAT!4dLNG   ?q=lat,lng   &ll=lat,lng   /place/.../@lat,lng
function extractLatLng(url: string): { lat: number; lng: number } | null {
  const patterns: RegExp[] = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!8m2!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /\/(-?\d+\.\d+),(-?\d+\.\d+)(?:[,/?]|$)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

async function expandShortLink(url: string): Promise<string> {
  const shortHosts = ["maps.app.goo.gl", "goo.gl", "g.co", "maps.google.com/maps?"];
  if (!shortHosts.some((h) => url.includes(h))) {
    // Even long-form links sometimes redirect; only expand short-ish ones.
    if (!/\.app\.goo\.gl|goo\.gl|g\.co/.test(url)) return url;
  }
  try {
    // Follow redirects manually so we can capture intermediate URLs that carry coords.
    let current = url;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(45000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
      });
      const loc = res.headers.get("location");
      if (loc && (res.status >= 300 || res.status < 400)) {
        current = new URL(loc, current).toString();
        if (extractLatLng(current)) return current;
        continue;
      }
      // Some short links resolve to a page whose body contains the canonical URL.
      if (res.ok) {
        const text = await res.text();
        const m =
          text.match(/https?:\/\/www\.google\.com\/maps[^"'\s<>]+/) ||
          text.match(/APP_INITIALIZATION_STATE[^"]*?(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (m) return m[0];
      }
      break;
    }
    return current;
  } catch {
    return url;
  }
}

async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pt`;
    const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
    };
    return (
      data.city ||
      data.locality ||
      data.principalSubdivision ||
      data.countryName ||
      null
    );
  } catch {
    return null;
  }
}

export const processLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => linkSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const originalLink = data.link.trim();
    let workUrl = originalLink;
    let coords = extractLatLng(workUrl);
    if (!coords) {
      workUrl = await expandShortLink(originalLink);
      coords = extractLatLng(workUrl);
    }
    if (!coords) {
      return { ok: false as const, error: "Não foi possível extrair coordenadas do link." };
    }
    const city = await reverseGeocodeCity(coords.lat, coords.lng);
    const { data: inserted, error } = await supabaseAdmin
      .from("locations")
      .insert({
        city,
        latitude: coords.lat,
        longitude: coords.lng,
        link: originalLink,
      })
      .select()
      .single();
    if (error) {
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const, row: inserted };
  });

export const listLocations = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const clearLocations = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("locations")
    .delete()
    .not("id", "is", null);
  if (error) throw new Error(error.message);
  return { ok: true as const };
});

const exportSchema = z.object({
  rows: z.array(
    z.object({
      city: z.string(),
      latitude: z.union([z.number(), z.string()]),
      longitude: z.union([z.number(), z.string()]),
      link: z.string(),
    }),
  ),
});

export const exportXlsx = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => exportSchema.parse(input))
  .handler(async ({ data }) => {
  const XLSX = await import("xlsx");
  const rows = data.rows.map((r, i) => ({
    "#": i + 1,
    Cidade: r.city,
    Latitude: r.latitude,
    Longitude: r.longitude,
    Link: r.link,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Localizações");
  const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
  return { base64: buf, filename: `localizacoes-${new Date().toISOString().slice(0, 10)}.xlsx` };
});