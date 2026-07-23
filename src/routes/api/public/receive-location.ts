import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().trim().min(1).max(200).optional().nullable(),
  timestamp: z.union([z.string().min(1), z.number()]),
  source: z.string().trim().min(1).max(80),
});

function parseTimestamp(value: string | number): Date | null {
  if (typeof value === "number") {
    // seconds or ms
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const asNum = Number(value);
  if (!isNaN(asNum) && value.trim() !== "") {
    const ms = asNum > 1e12 ? asNum : asNum * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export const Route = createFileRoute("/api/public/receive-location")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.WEBHOOK_API_KEY;
        if (!expected) {
          return new Response(
            JSON.stringify({ error: "WEBHOOK_API_KEY não configurada no servidor." }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        const provided = request.headers.get("x-api-key");
        if (!provided || provided !== expected) {
          return new Response(
            JSON.stringify({ error: "Chave inválida." }),
            { status: 401, headers: { "content-type": "application/json" } },
          );
        }

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "JSON inválido." }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const parsed = payloadSchema.safeParse(json);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({
              error: "Payload inválido.",
              details: parsed.error.flatten(),
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        const { latitude, longitude, city, timestamp, source } = parsed.data;
        const ts = parseTimestamp(timestamp);
        if (!ts) {
          return new Response(
            JSON.stringify({ error: "timestamp inválido." }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const link = `https://www.google.com/maps/?q=${latitude},${longitude} [${source}]`;
        const { data, error } = await supabaseAdmin
          .from("locations")
          .insert({
            city: city ?? null,
            latitude,
            longitude,
            link,
            created_at: ts.toISOString(),
          })
          .select()
          .single();
        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ ok: true, row: data }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});