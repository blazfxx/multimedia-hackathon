const CORE_BASE = "./ffmpeg";
const FFMPEG_BASE = "./ffmpeg";

let ffmpeg = null;
let loaded = false;

function toBlobURL(url, mimeType) {
  return fetch(url).then(r => r.arrayBuffer()).then(buf => {
    return URL.createObjectURL(new Blob([buf], { type: mimeType }));
  });
}

function fetchFile(data) {
  if (typeof data === "string") return fetch(data).then(r => r.arrayBuffer()).then(b => new Uint8Array(b));
  if (data instanceof URL) return fetch(data).then(r => r.arrayBuffer()).then(b => new Uint8Array(b));
  if (data instanceof File || data instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(data);
    });
  }
  return Promise.resolve(new Uint8Array());
}

export async function initFFmpeg(onLog) {
  if (loaded) return;

  if (!window.FFmpegWASM) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${FFMPEG_BASE}/ffmpeg.js`;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ffmpeg.js`));
      document.head.appendChild(s);
    });
  }

  const { FFmpeg } = window.FFmpegWASM;
  ffmpeg = new FFmpeg();
  if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));

  const classWorkerURL = await toBlobURL(
    `${FFMPEG_BASE}/814.ffmpeg.js`,
    "text/javascript"
  );

  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    classWorkerURL,
  });
  loaded = true;
}

export async function compileVideo({ footageSegments, audioFile, onProgress }) {
  if (!loaded) throw new Error("FFmpeg not loaded. Call initFFmpeg() first.");

  ffmpeg.on("progress", ({ progress }) => {
    if (onProgress) onProgress(Math.max(0, Math.min(1, progress)));
  });

  let idx = 0;
  const filenames = [];
  for (const seg of footageSegments) {
    if (!seg.videoData) continue;
    const name = `clip${idx}.mp4`;
    await ffmpeg.writeFile(name, new Uint8Array(seg.videoData));
    filenames.push(name);
    idx++;
  }

  await ffmpeg.writeFile("audio.mp3", await fetchFile(audioFile));

  const concatContent = filenames.map(f => `file '${f}'`).join("\n");
  await ffmpeg.writeFile("concat.txt", concatContent);

  const filterParts = footageSegments.map((seg) => {
    const escaped = seg.text
      .replace(/\\/g, "\\\\\\\\")
      .replace(/:/g, "\\\\:")
      .replace(/'/g, "\\\\'")
      .replace(/%/g, "%%")
      .replace(/\n/g, " ");
    const charsPerLine = 35;
    const lines = [];
    for (let c = 0; c < escaped.length; c += charsPerLine) {
      lines.push(escaped.slice(c, c + charsPerLine));
    }
    const text = lines.join("%{eif\\:n\\:2}\\n");
    return `drawtext=fontcolor=white:fontsize=18:borderw=1:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2+80:text='${text}':enable='between(t,${seg.start},${seg.end})'`;
  });

  const drawtext = filterParts.join(",");

  await ffmpeg.exec([
    "-f", "concat", "-safe", "0", "-i", "concat.txt",
    "-i", "audio.mp3",
    "-vf", `scale=1280:-2,${drawtext}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
    "-c:a", "aac", "-b:a", "128k",
    "-shortest",
    "-movflags", "+faststart",
    "output.mp4"
  ]);

  const data = await ffmpeg.readFile("output.mp4");

  for (const f of filenames) await ffmpeg.deleteFile(f);
  await ffmpeg.deleteFile("audio.mp3");
  await ffmpeg.deleteFile("concat.txt");
  await ffmpeg.deleteFile("output.mp4");

  return new Blob([data.buffer], { type: "video/mp4" });
}
