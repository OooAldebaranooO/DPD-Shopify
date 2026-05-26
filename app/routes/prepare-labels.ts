import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

export async function action({ request }: { request: Request }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await request.json() as { orders: unknown[] };

    if (!body?.orders || !Array.isArray(body.orders) || body.orders.length === 0) {
      return new Response(JSON.stringify({ error: "Aucune commande fournie." }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Génère un token unique
    const token = randomBytes(16).toString('hex');

    // Stocke les données dans Vercel KV avec une expiration de 10 minutes
    await kv.set(`print:${token}`, JSON.stringify(body.orders), { ex: 600 });

    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("prepare-labels error:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur." }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}