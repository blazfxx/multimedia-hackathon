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

  async load({ coreURL, wasmURL, classWorkerURL } = {}, { signal } = {}) {
    if (!this.#worker) {
      this.#worker = new Worker(classWorkerURL, { type: "module" });
      this.#onMessage();
    }
    return this.#send({ type: MsgType.LOAD, data: { coreURL, wasmURL } }, undefined, signal);
  }

  exec(args, timeout = -1, { signal } = {}) {
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

  const classWorkerURL = await toBlobURL(WORKER_CDN, "text/javascript");

  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.wasm`, "application/wasm"),
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
