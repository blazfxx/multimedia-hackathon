const PROXY_BASE = "https://api-proxy.evan-zhao140.workers.dev";
const CORE_URL = `${PROXY_BASE}/ffmpeg/ffmpeg-core.js`;
const WASM_URL = `${PROXY_BASE}/ffmpeg/ffmpeg-core.wasm`;
const WORKER_SRC = `const MsgType={LOAD:"LOAD",EXEC:"EXEC",WRITE_FILE:"WRITE_FILE",READ_FILE:"READ_FILE",DELETE_FILE:"DELETE_FILE",RENAME:"RENAME",CREATE_DIR:"CREATE_DIR",LIST_DIR:"LIST_DIR",DELETE_DIR:"DELETE_DIR",ERROR:"ERROR",DOWNLOAD:"DOWNLOAD",PROGRESS:"PROGRESS",LOG:"LOG",MOUNT:"MOUNT",UNMOUNT:"UNMOUNT"};let core=null;self.postMessage({type:MsgType.LOG,data:{message:"worker script loaded"}});self.addEventListener("error",function(e){self.postMessage({type:MsgType.ERROR,data:"Worker global error: message="+e.message+" filename="+e.filename+" lineno="+e.lineno+" colno="+e.colno})});self.addEventListener("unhandledrejection",function(e){self.postMessage({type:MsgType.ERROR,data:"Worker unhandled rejection: reason="+String(e.reason)})});self.onmessage=async function(ev){var d=ev.data,id=d.id,type=d.type,data=d.data;self.postMessage({type:MsgType.LOG,data:{message:"worker received msg type="+type+" id="+id}});var transfer=[],result;try{if(type!==MsgType.LOAD&&!core)throw new Error("ffmpeg is not loaded");switch(type){case MsgType.LOAD:result=await(async function(opts){if(!core){self.postMessage({type:MsgType.LOG,data:{message:"eval coreText length="+opts.coreText.length}});try{(0,eval)(opts.coreText)}catch(e){throw new Error("failed to eval ffmpeg-core.js: "+e.message)}self.postMessage({type:MsgType.LOG,data:{message:"eval done, typeof createFFmpegCore="+typeof self.createFFmpegCore}});if(typeof self.createFFmpegCore!=="function")throw new Error("createFFmpegCore not found after eval")}var wb=opts.wasmBinary?new Uint8Array(opts.wasmBinary):null;var CDN="https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";var moduleOpts={mainScriptUrlOrBlob:CDN+"/ffmpeg-core.js#"+btoa(JSON.stringify({wasmURL:CDN+"/ffmpeg-core.wasm",workerURL:CDN+"/ffmpeg-core.worker.js"}))};if(wb){moduleOpts.wasmBinary=wb;moduleOpts.instantiateWasm=function(imports,callback){WebAssembly.instantiate(wb,imports).then(function(r){callback(r.instance)}).catch(function(e){self.postMessage({type:MsgType.ERROR,data:"instantiateWasm failed: "+e})});return{}}}self.postMessage({type:MsgType.LOG,data:{message:"calling createFFmpegCore..."}});try{core=await self.createFFmpegCore(moduleOpts)}catch(e){throw new Error("createFFmpegCore failed: "+e.message)}self.postMessage({type:MsgType.LOG,data:{message:"createFFmpegCore done"}});core.setLogger(function(msg){self.postMessage({type:MsgType.LOG,data:msg})});core.setProgress(function(p){self.postMessage({type:MsgType.PROGRESS,data:p})});return true})(data);break;case MsgType.EXEC:result=(function(o){core.setTimeout(o.timeout);core.exec.apply(core,o.args);var ret=core.ret;core.reset();return ret})(data);break;case MsgType.WRITE_FILE:result=(function(o){core.FS.writeFile(o.path,o.data);return true})(data);break;case MsgType.READ_FILE:result=(function(o){return core.FS.readFile(o.path,{encoding:o.encoding})})(data);if(result instanceof Uint8Array)transfer.push(result.buffer);break;case MsgType.DELETE_FILE:result=(function(o){core.FS.unlink(o.path);return true})(data);break;case MsgType.RENAME:result=(function(o){core.FS.rename(o.oldPath,o.newPath);return true})(data);break;case MsgType.CREATE_DIR:result=(function(o){core.FS.mkdir(o.path);return true})(data);break;case MsgType.LIST_DIR:result=(function(o){var entries=core.FS.readdir(o.path);return entries.map(function(name){var stat=core.FS.stat(o.path+"/"+name);return{name:name,isDir:core.FS.isDir(stat.mode)}})})(data);break;case MsgType.DELETE_DIR:result=(function(o){core.FS.rmdir(o.path);return true})(data);break;case MsgType.MOUNT:result=(function(o){var fs=core.FS.filesystems[o.fsType];return!!(fs&&(core.FS.mount(fs,o.options,o.mountPoint),true))})(data);break;case MsgType.UNMOUNT:result=(function(o){core.FS.unmount(o.mountPoint);return true})(data);break;default:throw new Error("unknown message type")}}catch(e){self.postMessage({id:id,type:MsgType.ERROR,data:e.toString()});return}self.postMessage({id:id,type:type,data:result},transfer)};`;
let ffmpeg = null;
let loaded = false;
function log(msg) { console.log(`[FFmpeg] ${msg}`); }
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
const MsgType = { LOAD: "LOAD", EXEC: "EXEC", WRITE_FILE: "WRITE_FILE", READ_FILE: "READ_FILE", DELETE_FILE: "DELETE_FILE", RENAME: "RENAME", CREATE_DIR: "CREATE_DIR", LIST_DIR: "LIST_DIR", DELETE_DIR: "DELETE_DIR", ERROR: "ERROR", DOWNLOAD: "DOWNLOAD", PROGRESS: "PROGRESS", LOG: "LOG", MOUNT: "MOUNT", UNMOUNT: "UNMOUNT" };
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
        case MsgType.LOAD: this.loaded = true; log(`Worker LOAD response: success=${data}`); this.#resolvers[id]?.(data); break;
        case MsgType.EXEC: case MsgType.WRITE_FILE: case MsgType.READ_FILE: case MsgType.DELETE_FILE: case MsgType.RENAME: case MsgType.CREATE_DIR: case MsgType.LIST_DIR: case MsgType.DELETE_DIR: case MsgType.MOUNT: case MsgType.UNMOUNT: this.#resolvers[id]?.(data); break;
        case MsgType.LOG: this.#logHandlers.forEach(h => h(data)); break;
        case MsgType.PROGRESS: this.#progressHandlers.forEach(h => h(data)); break;
        case MsgType.ERROR: log(`Worker ERROR on msg #${id}: ${JSON.stringify(data)}`); this.#rejecters[id]?.(data); break;
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
  on(event, handler) { if (event === "log") this.#logHandlers.push(handler); else if (event === "progress") this.#progressHandlers.push(handler); }
  off(event, handler) { if (event === "log") this.#logHandlers = this.#logHandlers.filter(h => h !== handler); else if (event === "progress") this.#progressHandlers = this.#progressHandlers.filter(h => h !== handler); }
  async load({ coreURL, wasmURL, coreText, wasmBinary } = {}, { signal } = {}) {
    log("Creating worker from inlined source...");
    const workerBlob = new Blob([WORKER_SRC], { type: "application/javascript" });
    const workerBlobURL = URL.createObjectURL(workerBlob);
    this.#worker = new Worker(workerBlobURL);
    URL.revokeObjectURL(workerBlobURL);
    this.#worker.onerror = (e) => { log(`Worker onerror: ${e.message} filename=${e.filename} lineno=${e.lineno}`); };
    log("Worker created, attaching onMessage");
    this.#onMessage();
    log(`Sending LOAD: coreText=${coreText ? coreText.length + ' chars' : 'none'} wasmBinary=${wasmBinary ? wasmBinary.byteLength + ' bytes' : 'none'}`);
    const transfer = wasmBinary ? [wasmBinary] : [];
    return this.#send({ type: MsgType.LOAD, data: { coreURL, wasmURL, coreText, wasmBinary } }, transfer, signal);
  }
  exec(args, timeout = 0, { signal } = {}) { return this.#send({ type: MsgType.EXEC, data: { args, timeout } }, undefined, signal); }
  writeFile(path, data, { signal } = {}) { const transfer = data instanceof Uint8Array ? [data.buffer] : []; return this.#send({ type: MsgType.WRITE_FILE, data: { path, data } }, transfer, signal); }
  readFile(path, encoding = "binary", { signal } = {}) { return this.#send({ type: MsgType.READ_FILE, data: { path, encoding } }, undefined, signal); }
  deleteFile(path, { signal } = {}) { return this.#send({ type: MsgType.DELETE_FILE, data: { path } }, undefined, signal); }
  terminate() { this.#worker?.terminate(); this.#worker = null; this.loaded = false; }
}
export async function initFFmpeg(onLog) {
  if (loaded) return;
  log(`crossOriginIsolated = ${window.crossOriginIsolated}`);
  log(`Initializing FFmpeg - proxy: ${PROXY_BASE}/ffmpeg/`);
  ffmpeg = new FFmpeg();
  if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));
  let coreText;
  try {
    log("Pre-fetching ffmpeg-core.js from proxy...");
    const coreRes = await fetch(CORE_URL);
    log(`Core JS fetch: status=${coreRes.status}`);
    if (!coreRes.ok) throw new Error(`Core JS fetch failed: HTTP ${coreRes.status}`);
    coreText = await coreRes.text();
    log(`Core JS: ${coreText.length} chars`);
  } catch (err) { log(`Core JS pre-fetch FAILED: ${err.message}`); throw err; }
  let wasmBinary;
  try {
    log("Pre-fetching WASM binary from proxy...");
    const wasmRes = await fetch(WASM_URL);
    log(`WASM fetch: status=${wasmRes.status} content-type=${wasmRes.headers.get("content-type")}`);
    if (!wasmRes.ok) throw new Error(`WASM fetch failed: HTTP ${wasmRes.status}`);
    wasmBinary = await wasmRes.arrayBuffer();
    log(`WASM binary: ${wasmBinary.byteLength} bytes`);
  } catch (err) { log(`WASM pre-fetch FAILED: ${err.message}`); throw err; }
  try {
    log("Loading FFmpeg (inlined worker, core+wasm pre-fetched)...");
    await ffmpeg.load({ coreURL: CORE_URL, wasmURL: WASM_URL, coreText, wasmBinary });
    loaded = true;
    log("FFmpeg loaded successfully!");
  } catch (err) { log(`FFmpeg load FAILED: ${err.message}\n${err.stack}`); throw err; }
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
  ffmpeg.on("progress", ({ progress }) => { if (onProgress) onProgress(Math.max(0, Math.min(1, progress))); });
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
      for (let c = 0; c < t.length; c += charsPerLine) { lines.push(t.slice(c, c + charsPerLine)); }
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
    "-vsync", "cfr", "-shortest", "-movflags", "+faststart", "-y", "output.mp4",
  ], 0);
  const data = await ffmpeg.readFile("output.mp4");
  for (const f of clipNames) await ffmpeg.deleteFile(f);
  await ffmpeg.deleteFile("audio.mp3");
  await ffmpeg.deleteFile("concat.txt");
  await ffmpeg.deleteFile("output.mp4");
  const copy = new Uint8Array(data).buffer;
  return new Blob([copy], { type: "video/mp4" });
}
