export async function GET() {
  return new Response(JSON.stringify({ error: "Gone" }), {
    status: 410,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request) {
  void req;
  return new Response(JSON.stringify({ error: "Gone" }), {
    status: 410,
    headers: { "content-type": "application/json" },
  });
}
