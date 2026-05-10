const MsgType = {
  LOAD: "LOAD",
  EXEC: "EXEC",
  WRITE_FILE: "WRITE_FILE",
  READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE",
  RENAME: "RENAME",
  CREATE_DIR: "CREATE_DIR",
  LIST_DIR: "LIST_DIR",
  DELETE_DIR: "DELETE_DIR",
  ERROR: "ERROR",
  DOWNLOAD: "DOWNLOAD",
  PROGRESS: "PROGRESS",
  LOG: "LOG",
  MOUNT: "MOUNT",
  UNMOUNT: "UNMOUNT",
};

let core = null;

self.onmessage = async ({ data: { id, type, data } }) => {
  const transfer = [];
  let result;
  try {
    if (type !== MsgType.LOAD && !core) throw new Error("ffmpeg is not loaded");
    switch (type) {
      case MsgType.LOAD:
        result = await (async ({ coreURL, wasmURL, coreText, wasmBinary }) => {
          if (!core) {
            try {
              const blob = new Blob([coreText], { type: "text/javascript" });
              const blobURL = URL.createObjectURL(blob);
              importScripts(blobURL);
              URL.revokeObjectURL(blobURL);
            } catch (e) {
              throw new Error("failed to import ffmpeg-core.js: " + e.message);
            }
          }
          const moduleOpts = {
            mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL: coreURL.replace(/.js$/g, ".worker.js") }))}`,
          };
          if (wasmBinary) {
            moduleOpts.wasmBinary = new Uint8Array(wasmBinary);
          }
          core = await self.createFFmpegCore(moduleOpts);
          core.setLogger((msg) => self.postMessage({ type: MsgType.LOG, data: msg }));
          core.setProgress((p) => self.postMessage({ type: MsgType.PROGRESS, data: p }));
          return true;
        })(data);
        break;
      case MsgType.EXEC:
        result = (({ args, timeout = -1 }) => {
          core.setTimeout(timeout);
          core.exec(...args);
          const ret = core.ret;
          core.reset();
          return ret;
        })(data);
        break;
      case MsgType.WRITE_FILE:
        result = (({ path, data: d }) => (core.FS.writeFile(path, d), true))(data);
        break;
      case MsgType.READ_FILE:
        result = (({ path, encoding }) => core.FS.readFile(path, { encoding }))(data);
        if (result instanceof Uint8Array) transfer.push(result.buffer);
        break;
      case MsgType.DELETE_FILE:
        result = (({ path }) => (core.FS.unlink(path), true))(data);
        break;
      case MsgType.RENAME:
        result = (({ oldPath, newPath }) => (core.FS.rename(oldPath, newPath), true))(data);
        break;
      case MsgType.CREATE_DIR:
        result = (({ path }) => (core.FS.mkdir(path), true))(data);
        break;
      case MsgType.LIST_DIR:
        result = (({ path }) => {
          const entries = core.FS.readdir(path);
          return entries.map((name) => {
            const stat = core.FS.stat(`${path}/${name}`);
            return { name, isDir: core.FS.isDir(stat.mode) };
          });
        })(data);
        break;
      case MsgType.DELETE_DIR:
        result = (({ path }) => (core.FS.rmdir(path), true))(data);
        break;
      case MsgType.MOUNT:
        result = (({ fsType, options, mountPoint }) => {
          const fs = core.FS.filesystems[fsType];
          return !!(fs && (core.FS.mount(fs, options, mountPoint), true));
        })(data);
        break;
      case MsgType.UNMOUNT:
        result = (({ mountPoint }) => (core.FS.unmount(mountPoint), true))(data);
        break;
      default:
        throw new Error("unknown message type");
    }
  } catch (e) {
    self.postMessage({ id, type: MsgType.ERROR, data: e.toString() });
    return;
  }
  self.postMessage({ id, type, data: result }, transfer);
};
