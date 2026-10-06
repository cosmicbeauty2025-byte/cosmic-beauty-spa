// Supabase Edge Function: analyze-skin
// POST { image: "<base64 jpeg, no data: prefix>" }  (Authorization: Bearer <user JWT>)
// -> { face_found, face_box, skin_type_guess, zones, summary, suggestions }
// Requires the secret ANTHROPIC_API_KEY (set in Supabase → Edge Functions → Secrets).
// Cosmetic observations only — never a medical diagnosis.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MODEL = 'claude-sonnet-5-5';
const MAX_BASE64_CHARS = 4_000_000; // ~3 MB image
const ZONES = ['forehead', 'left_cheek', 'right_cheek', 'nose_tzone', 'chin'];
const STATUSES = ['good', 'moderate', 'attention'];

const PROMPT = `You are a cosmetic skincare assistant for an esthetician's client portal. Look at this face photo and give a gentle, cosmetic-only skin overview. You are NOT diagnosing anything: never name medical conditions or diseases, and never claim to detect cancer, infections, or similar.

Reply with ONLY one JSON object (no markdown, no prose) shaped exactly like:
{
  "face_found": boolean,
  "face_box": {"x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1},   // the face (hairline to chin), as fractions of image width/height, top-left origin
  "lighting": "good" | "low" | "harsh",
  "skin_type_guess": "Oily" | "Dry" | "Combination" | "Normal" | "Sensitive" | "Unclear",
  "zones": {
    "forehead":   {"status": "good"|"moderate"|"attention", "focus": string, "note": string},
    "left_cheek": {...}, "right_cheek": {...}, "nose_tzone": {...}, "chin": {...}
  },
  "summary": string,
  "suggestions": [string, string, string]
}
Rules:
- left_cheek / right_cheek mean the left / right side of the IMAGE.
- "focus" is one or two words such as hydration, texture, shine, redness, tone, fine lines, or clear.
- "note" is one short, kind sentence (max 18 words) about what is visible.
- "summary" is 1-2 warm sentences. "suggestions" are up to 3 practical skincare habits (hydration, SPF, gentle routine, etc.).
- If lighting, makeup, filters or angle limit accuracy, say so in "summary".
- If no clear face is visible, set "face_found": false and keep other fields minimal.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // Require a signed-in user
    const authHeader = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return json({ error: 'Please sign in to use skin analysis.' }, 401);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Skin analysis is not configured yet.' }, 503);

    const { image } = await req.json();
    if (typeof image !== 'string' || !image || image.length > MAX_BASE64_CHARS) {
      return json({ error: 'Please send a smaller photo.' }, 400);
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    if (!res.ok) {
      console.error('Anthropic error', res.status, await res.text());
      return json({ error: 'The analysis service is busy. Please try again.' }, 502);
    }
    const out = await res.json();
    const text: string = (out.content || []).map((c: any) => c.text || '').join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: 'Could not read the analysis. Please try again.' }, 502);
    const raw = JSON.parse(match[0]);

    // Normalise so the client can trust the shape
    const clamp = (n: unknown, d: number) => Math.min(1, Math.max(0, Number.isFinite(Number(n)) ? Number(n) : d));
    const str = (v: unknown, max: number) => String(v ?? '').slice(0, max);
    const box = raw.face_box || {};
    const zones: Record<string, unknown> = {};
    for (const z of ZONES) {
      const r = (raw.zones || {})[z] || {};
      zones[z] = {
        status: STATUSES.includes(r.status) ? r.status : 'moderate',
        focus: str(r.focus, 30),
        note: str(r.note, 160),
      };
    }
    return json({
      face_found: raw.face_found === true,
      face_box: { x: clamp(box.x, 0.2), y: clamp(box.y, 0.1), w: clamp(box.w, 0.6), h: clamp(box.h, 0.7) },
      lighting: ['good', 'low', 'harsh'].includes(raw.lighting) ? raw.lighting : 'good',
      skin_type_guess: str(raw.skin_type_guess, 20),
      zones,
      summary: str(raw.summary, 400),
      suggestions: (Array.isArray(raw.suggestions) ? raw.suggestions : []).slice(0, 3).map((s: unknown) => str(s, 160)),
    });
  } catch (err) {
    console.error(err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
