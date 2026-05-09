import { streamQuery } from "./chat.js";

const SEGMENT_PERCENT = 0.15;

export function buildFootageSegments(segments, totalDuration) {
  if (!segments || !segments.length || !totalDuration) return [];
  const segLen = totalDuration * SEGMENT_PERCENT;
  const footageSegments = [];
  let start = 0;
  while (start < totalDuration) {
    const end = Math.min(start + segLen, totalDuration);
    const textInWindow = segments
      .filter(s => s.start < end && s.end > start)
      .map(s => s.text.trim())
      .join(" ");
    footageSegments.push({
      start,
      end,
      text: textInWindow
    });
    start = end;
  }
  return footageSegments;
}

export async function generateKeywords(footageSegments, onToken) {
  const segmentDescs = footageSegments
    .map((s, i) => `Segment ${i + 1} [${fmt(s.start)}-${fmt(s.end)}]: "${s.text}"`)
    .join("\n");
  const prompt = `Given these audio transcript segments with timestamps, generate 3-5 stock footage search keywords for each segment. The keywords should describe visual imagery that would fit as background video for what is being said. Be specific and visual.

${segmentDescs}

Respond in this exact format only, one line per segment:
Segment N: keyword1, keyword2, keyword3`;
  return streamQuery(prompt, onToken);
}

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export { fmt };
