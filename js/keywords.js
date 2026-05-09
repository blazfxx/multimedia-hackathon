import { streamQuery } from "./chat.js";

const SEGMENT_PERCENT = 0.15;

export function buildFootageSegments(segments, totalDuration) {
  if (!segments || !segments.length || !totalDuration) return [];
  const targetLen = totalDuration * SEGMENT_PERCENT;
  const footageSegments = [];
  let group = [];
  let groupStart = segments[0].start;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    group.push(seg.text.trim());
    const groupEnd = seg.end;
    const groupDur = groupEnd - groupStart;
    const remaining = segments.length - i - 1;
    if (groupDur >= targetLen || remaining === 0) {
      footageSegments.push({
        start: groupStart,
        end: groupEnd,
        text: group.join(" ")
      });
      group = [];
      if (remaining > 0) groupStart = segments[i + 1].start;
    }
  }
  return footageSegments;
}

export async function generateKeywords(footageSegments, onToken) {
  const segmentDescs = footageSegments
    .map((s, i) => `Segment ${i + 1} [${fmt(s.start)}-${fmt(s.end)}]: "${s.text}"`)
    .join("\n");
  const prompt = `Given these audio transcript segments with timestamps, generate 3-5 stock footage search keywords for each segment. The keywords should describe visual imagery that would fit as background video for what is being said. Be specific and visual. Use spaces between words, never underscores.

${segmentDescs}

Respond in this exact format only, one line per segment:
Segment N: keyword phrase 1, keyword phrase 2, keyword phrase 3`;
  return streamQuery(prompt, onToken);
}

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export { fmt };
