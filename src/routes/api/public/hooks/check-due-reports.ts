import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/check-due-reports")({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
          return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 });
        }
        const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error } = await admin.rpc("notify_due_campaign_reports");
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        return new Response(JSON.stringify({ inserted: data ?? 0, ranAt: new Date().toISOString() }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } }),
    },
  },
});
