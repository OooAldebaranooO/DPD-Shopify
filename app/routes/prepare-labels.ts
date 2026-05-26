import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// 🔧 FIX : loader GET requis pour que Remix accepte la route
// et que le preflight OPTIONS retourne un statut OK
export async function loader({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function action({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const body = await request.json() as { orders: unknown[] };

    if (!body?.orders || !Array.isArray(body.orders) || body.orders.length === 0) {
      return new Response(JSON.stringify({ error: "Aucune commande fournie." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const token = randomBytes(16).toString('hex');
    await kv.set(`print:${token}`, JSON.stringify(body.orders), { ex: 600 });

    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (e) {
    console.error("prepare-labels error:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}