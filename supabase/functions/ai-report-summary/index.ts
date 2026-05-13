import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { reportId } = await req.json();
    if (!reportId) return json({ error: "reportId required" }, 400);

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: report, error } = await supa
      .from("reports")
      .select("id,type,data,ai_summary,campaign:campaigns(name,university_name,objectives,type,paid_budget)")
      .eq("id", reportId)
      .single();
    if (error || !report) return json({ error: error?.message ?? "not found" }, 404);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI not configured" }, 500);

    const prompt = `You analyze digital marketing campaign reports for university clients.
Return a tight, scannable summary in clean GitHub-flavoured markdown.

Rules:
- Do NOT include a title heading or restate the campaign name. Start directly at the first section.
- Use exactly these three sections, each as an H3 heading on its own line:
  ### Highlights
  ### Gaps & Risks
  ### Recommended Next Actions
- Under each heading use 3 short bullet points starting with "- ".
- Do not include the literal campaign name or university name in any bullet unless the data clearly warrants it.
- Be concrete, reference numbers from the metrics, no fluff.

Context (do not echo back):
- Campaign type: ${(report as any).campaign?.type}
- Objectives: ${(report as any).campaign?.objectives ?? "n/a"}
- Report kind: ${report.type}
- Report metrics (JSON): ${JSON.stringify(report.data)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a senior digital marketing analyst. Be concise and concrete." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (aiRes.status === 429) return json({ error: "Rate limit hit, try again shortly." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted." }, 402);
    if (!aiRes.ok) return json({ error: "AI gateway error: " + (await aiRes.text()) }, 500);
    const aiJson = await aiRes.json();
    const summary: string = aiJson.choices?.[0]?.message?.content ?? "";

    await supa.from("reports").update({ ai_summary: summary }).eq("id", reportId);
    return json({ summary });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
