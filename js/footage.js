const PROXY_BASE = "https://api-proxy.evan-zhao140.workers.dev";

export async function searchVideos(query, perPage = 3) {
  const res = await fetch(
    `${PROXY_BASE}/pexels/videos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`
  );
  if (!res.ok) throw new Error(`Pexels search failed: HTTP ${res.status}`);
  const data = await res.json();
  return (data.videos || []).map(v => {
    const file = v.video_files?.find(f => f.quality === "sd") ||
                 v.video_files?.find(f => f.quality === "hd") ||
                 v.video_files?.[0];
    return {
      id: v.id,
      duration: v.duration,
      image: v.image,
      videoUrl: file?.link,
      width: file?.width,
      height: file?.height
    };
  });
}

export async function downloadVideo(url) {
  const proxyUrl = `${PROXY_BASE}/pexels/proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Video download failed: HTTP ${res.status}`);
  return await res.arrayBuffer();
}

export function parseKeywords(rawText) {
  const segments = [];
  const lines = rawText.split("\n").filter(l => l.trim());
  for (const line of lines) {
    const match = line.match(/Segment\s+(\d+)\s*:\s*(.+)/i);
    if (match) {
      const keywords = match[2].split(",").map(k => k.trim()).filter(Boolean);
      segments.push({ index: parseInt(match[1]), keywords });
    }
  }
  return segments;
}

export async function searchFootageForSegments(parsedKeywords, perSegment = 1) {
  const results = [];
  for (const seg of parsedKeywords) {
    const query = seg.keywords[0] || seg.keywords.join(" ");
    try {
      const videos = await searchVideos(query, perSegment);
      results.push({ ...seg, videos });
    } catch (err) {
      results.push({ ...seg, videos: [], error: err.message });
    }
  }
  return results;
}
