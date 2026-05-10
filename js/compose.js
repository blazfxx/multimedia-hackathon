const CORE_CDN = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
const WORKER_CDN = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js";

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

const MsgType = {
  LOAD: "LOAD", EXEC: "EXEC", WRITE_FILE: "WRITE_FILE", READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE", RENAME: "RENAME", CREATE_DIR: "CREATE_DIR",
  LIST_DIR: "LIST_DIR", DELETE_DIR: "DELETE_DIR", ERROR: "ERROR",
  DOWNLOAD: "DOWNLOAD", PROGRESS: "PROGRESS", LOG: "LOG",
  MOUNT: "MOUNT", UNMOUNT: "UNMOUNT",
};

let _id = 0;
const nextId = () => _id++;

class FFmpeg {
  #worker = null;
  #resolvers = {};
  #rejecters = {};
  #logHandlers = [];
  #progressHandlers = [];
  loaded = false;

  #onMessage = () => {
    this.#worker.onmessage = ({ data: { id, type, data } }) => {
      switch (type) {
        case MsgType.LOAD:
          this.loaded = true;
          this.#resolvers[id]?.(data);
          break;
        case MsgType.EXEC: case MsgType.WRITE_FILE: case MsgType.READ_FILE:
        case MsgType.DELETE_FILE: case MsgType.RENAME: case MsgType.CREATE_DIR:
        case MsgType.LIST_DIR: case MsgType.DELETE_DIR: case MsgType.MOUNT:
        case MsgType.UNMOUNT:
          this.#resolvers[id]?.(data);
          break;
        case MsgType.LOG:
          this.#logHandlers.forEach(h => h(data));
          break;
        case MsgType.PROGRESS:
          this.#progressHandlers.forEach(h => h(data));
          break;
        case MsgType.ERROR:
          this.#rejecters[id]?.(data);
          break;
      }
      delete this.#resolvers[id];
      delete this.#rejecters[id];
    };
  };

  #send({ type, data }, transfer = [], signal) {
    if (!this.#worker) return Promise.reject(new Error("ffmpeg is not loaded"));
    return new Promise((resolve, reject) => {
      const id = nextId();
      this.#worker.postMessage({ id, type, data }, transfer);
      this.#resolvers[id] = resolve;
      this.#rejecters[id] = reject;
      signal?.addEventListener("abort", () => reject(new DOMException(`Message #${id} aborted`, "AbortError")), { once: true });
    });
  }

  on(event, handler) {
    if (event === "log") this.#logHandlers.push(handler);
    else if (event === "progress") this.#progressHandlers.push(handler);
  }

  off(event, handler) {
    if (event === "log") this.#logHandlers = this.#logHandlers.filter(h => h !== handler);
    else if (event === "progress") this.#progressHandlers = this.#progressHandlers.filter(h => h !== handler);
  }

  async load({ coreURL, wasmURL, workerURL } = {}, { signal } = {}) {
    const classWorkerURL = await toBlobURL(WORKER_CDN, "text/javascript");
    this.#worker = new Worker(classWorkerURL);
    this.#onMessage();
    return this.#send({ type: MsgType.LOAD, data: { coreURL, wasmURL, workerURL } }, undefined, signal);
  }

  exec(args, timeout = 0, { signal } = {}) {
    return this.#send({ type: MsgType.EXEC, data: { args, timeout } }, undefined, signal);
  }

  writeFile(path, data, { signal } = {}) {
    const transfer = data instanceof Uint8Array ? [data.buffer] : [];
    return this.#send({ type: MsgType.WRITE_FILE, data: { path, data } }, transfer, signal);
  }

  readFile(path, encoding = "binary", { signal } = {}) {
    return this.#send({ type: MsgType.READ_FILE, data: { path, encoding } }, undefined, signal);
  }

  deleteFile(path, { signal } = {}) {
    return this.#send({ type: MsgType.DELETE_FILE, data: { path } }, undefined, signal);
  }

  terminate() {
    this.#worker?.terminate();
    this.#worker = null;
    this.loaded = false;
  }
}

export async function initFFmpeg(onLog) {
  if (loaded) return;

  ffmpeg = new FFmpeg();
  if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));

  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${CORE_CDN}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${CORE_CDN}/ffmpeg-core.wasm`, "application/wasm"),
  ]);

  await ffmpeg.load({ coreURL, wasmURL });
  loaded = true;
}

function escapeDrawtext(str) {
  return str
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "")
    .replace(/:/g, "\\\\:")
    .replace(/%/g, "%%")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .replace(/\n/g, " ");
}

export async function compileVideo({ footageSegments, audioFile, onProgress }) {
  if (!loaded) throw new Error("FFmpeg not loaded.");

  ffmpeg.on("progress", ({ progress }) => {
    if (onProgress) onProgress(Math.max(0, Math.min(1, progress)));
  });

  let idx = 0;
  const clipNames = [];

  for (const seg of footageSegments) {
    if (!seg.videoData) continue;
    const name = `clip${idx}.mp4`;
    await ffmpeg.writeFile(name, new Uint8Array(seg.videoData));
    clipNames.push(name);
    idx++;
  }

  if (!clipNames.length) throw new Error("No video clips to compile.");

  await ffmpeg.writeFile("audio.mp3", await fetchFile(audioFile));

  const concatContent = clipNames.map(f => `file '${f}'`).join("\n");
  await ffmpeg.writeFile("concat.txt", concatContent);

  const captionFilters = footageSegments
    .filter(seg => seg.videoData && seg.text)
    .map((seg) => {
      const t = escapeDrawtext(seg.text);
      const charsPerLine = 35;
      const lines = [];
      for (let c = 0; c < t.length; c += charsPerLine) {
        lines.push(t.slice(c, c + charsPerLine));
      }
      const wrapped = lines.join("\\n");
      return `drawtext=fontcolor=white:fontsize=20:borderw=1:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2+80:text='${wrapped}':enable='between(t\\,${seg.start}\\,${seg.end})'`;
    });

  const vf = `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24${captionFilters.length ? "," + captionFilters.join(",") : ""}`;

  await ffmpeg.exec([
    "-f", "concat", "-safe", "0", "-i", "concat.txt",
    "-i", "audio.mp3",
    "-vf", vf,
    "-af", "aformat=sample_fmts=fltp",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
    "-c:a", "aac", "-b:a", "128k",
    "-vsync", "cfr",
    "-shortest",
    "-movflags", "+faststart",
    "-y",
    "output.mp4",
  ], 0);

  const data = await ffmpeg.readFile("output.mp4");

  for (const f of clipNames) await ffmpeg.deleteFile(f);
  await ffmpeg.deleteFile("audio.mp3");
  await ffmpeg.deleteFile("concat.txt");
  await ffmpeg.deleteFile("output.mp4");

  const copy = new Uint8Array(data).buffer;
  return new Blob([copy], { type: "video/mp4" });
}
