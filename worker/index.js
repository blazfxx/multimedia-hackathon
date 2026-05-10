const FFMPEG_CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/groq/transcriptions" && request.method === "POST") return proxyGroq(request, env);
    if (path === "/nvidia/chat/completions" && request.method === "POST") return proxyNvidia(request, env);
    if (path === "/pexels/videos" && request.method === "GET") return proxyPexels(request, url, env);
    if (path === "/pexels/proxy" && request.method === "GET") return proxyPexelsVideo(request, url);
    if (path === "/ffmpeg/ffmpeg-core.js" && request.method === "GET") return proxyFFmpegFile(request, `${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript");
    if (path === "/ffmpeg/ffmpeg-core.wasm" && request.method === "GET") return proxyFFmpegWasm(request);
    return new Response("Not found", { status: 404 });
  }
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ["https://blazfxx.github.io", "http://localhost:8000", "http://127.0.0.1:8000"];
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Vary": "Origin",
  };
}

async function proxyFFmpegFile(request, upstreamUrl, contentType) {
  const res = await fetch(upstreamUrl);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": contentType,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Access-Control-Allow-Origin": corsHeaders(request)["Access-Control-Allow-Origin"],
      "Vary": "Origin",
    },
  });
}

async function proxyFFmpegWasm(request) {
  const upstreamUrl = `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`;
  const res = await fetch(upstreamUrl);
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "application/wasm",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Access-Control-Allow-Origin": corsHeaders(request)["Access-Control-Allow-Origin"],
      "Vary": "Origin",
    },
  });
}

async function proxyGroq(request, env) {
  const incoming = await request.formData();
  const formData = new FormData();
  for (const [key, value] of incoming.entries()) {
    if (value instanceof File) formData.append(key, value, value.name);
    else formData.append(key, value);
  }
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}` },
    body: formData,
  });
  const data = await res.text();
  return new Response(data, { status: res.status, headers: { "Content-Type": "application/json", ...corsHeaders(request) } });
}

async function proxyNvidia(request, env) {
  const body = await request.text();
  const isStream = body.includes('"stream":true') || body.includes('"stream": true');
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.NVIDIA_API_KEY}` },
    body,
  });
  if (isStream) {
    const { readable, writable } = new TransformStream();
    res.body.pipeTo(writable);
    return new Response(readable, { headers: { "Content-Type": "text/event-stream", ...corsHeaders(request) } });
  }
  const data = await res.text();
  return new Response(data, { status: res.status, headers: { "Content-Type": "application/json", ...corsHeaders(request) } });
}

async function proxyPexels(request, url, env) {
  const query = url.searchParams.get("query") || "";
  const perPage = url.searchParams.get("per_page") || "3";
  const pexelsUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`;
  const res = await fetch(pexelsUrl, { headers: { "Authorization": env.PEXELS_API_KEY } });
  const data = await res.text();
  return new Response(data, { status: res.status, headers: { "Content-Type": "application/json", ...corsHeaders(request) } });
}

async function proxyPexelsVideo(request, url) {
  const videoUrl = url.searchParams.get("url");
  if (!videoUrl) return new Response("Missing url param", { status: 400 });
  const res = await fetch(videoUrl);
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "video/mp4", ...corsHeaders(request) },
  });
}
