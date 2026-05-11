import { readFileSync } from "node:fs";
import vm from "node:vm";

const PROXY = "https://api-proxy.evan-zhao140.workers.dev";
const CORE_URL = `${PROXY}/ffmpeg/ffmpeg-core.js`;
const WASM_URL = `${PROXY}/ffmpeg/ffmpeg-core.wasm`;

async function testFFmpegLoad() {
  console.log("=== FFmpeg Load Test ===\n");

  console.log("[1/4] Fetching ffmpeg-core.js...");
  const coreRes = await fetch(CORE_URL);
  if (!coreRes.ok) { console.error(`FAIL: core.js HTTP ${coreRes.status}`); process.exit(1); }
  const coreText = await coreRes.text();
  console.log(`  OK: ${coreText.length} chars`);

  console.log("[2/4] Fetching ffmpeg-core.wasm...");
  const wasmRes = await fetch(WASM_URL);
  if (!wasmRes.ok) { console.error(`FAIL: core.wasm HTTP ${wasmRes.status}`); process.exit(1); }
  const wasmBinary = new Uint8Array(await wasmRes.arrayBuffer());
  console.log(`  OK: ${wasmBinary.byteLength} bytes`);

  console.log("[3/4] Setting up VM context with Module.wasmBinary + instantiateWasm...");
  const ctx = vm.createContext({
    WebAssembly, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Float32Array, Float64Array, ArrayBuffer, SharedArrayBuffer, DataView,
    Promise, Error, TypeError, RangeError, JSON, Math, console, setTimeout, clearTimeout,
    TextEncoder, TextDecoder, btoa, atob, fetch: globalThis.fetch,
    performance: { now: () => Date.now() },
    ENVIRONMENT_IS_WEB: false,
    ENVIRONMENT_IS_WORKER: true,
    ENVIRONMENT_IS_NODE: false,
    self: null,
    location: { href: CORE_URL },
  });

  ctx.self = ctx;

  ctx.Module = {};
  ctx.Module.locateFile = (path, prefix) => {
    if (path.endsWith(".wasm")) return WASM_URL;
    return prefix + path;
  };

  console.log("[4/4] eval(coreText) + createFFmpegCore(moduleOpts)...");
  try {
    vm.runInContext(coreText, ctx);
  } catch (e) {
    console.error("FAIL: eval(coreText):", e.message);
    process.exit(1);
  }

  if (typeof ctx.createFFmpegCore !== "function") {
    console.error("FAIL: createFFmpegCore not found after eval");
    process.exit(1);
  }
  console.log("  createFFmpegCore found");

  const wasmBinaryBytes = new Uint8Array(wasmBinary);
  const moduleOpts = {
    mainScriptUrlOrBlob: `${CORE_URL}#${Buffer.from(JSON.stringify({ wasmURL: WASM_URL, workerURL: CORE_URL.replace(/.js$/g, ".worker.js") })).toString("base64")}`,
    wasmBinary: wasmBinaryBytes,
    instantiateWasm: (imports, callback) => {
      console.log("  instantiateWasm callback called - bypassing streaming!");
      WebAssembly.instantiate(wasmBinaryBytes, imports).then(result => {
        console.log("  WebAssembly.instantiate succeeded");
        callback(result.instance);
      }).catch(e => {
        console.error("  WebAssembly.instantiate FAILED:", e);
        process.exit(1);
      });
      return {};
    },
  };

  try {
    const core = await ctx.createFFmpegCore(moduleOpts);
    console.log("  createFFmpegCore returned successfully!");
    console.log("  core.FS exists:", typeof core.FS === "object");

    console.log("\n[5/5] Testing EXEC: ffmpeg -version...");
    core.setTimeout(0);
    core.exec("-version");
    const ret = core.ret;
    core.reset();
    console.log(`  ffmpeg -version returned: ${ret}`);
    console.log(ret === 0 ? "  OK: exec works!" : "  WARN: non-zero return");

    console.log("\n=== FFmpeg LOAD SUCCESS ===");
    process.exit(0);
  } catch (e) {
    console.error("FAIL: createFFmpegCore:", e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

testFFmpegLoad().catch(e => {
  console.error("FAIL:", e);
  process.exit(1);
});
