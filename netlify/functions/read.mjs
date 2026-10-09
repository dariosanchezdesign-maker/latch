export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ ok: false, error: 'Use POST' }, { status: 405 });
  }
  return Response.json({ ok: true, step: 1 });
};

export const config = { path: '/api/read' };
