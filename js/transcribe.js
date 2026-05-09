export async function transcribeAudio(file, options = {}) {
  if (!file) throw new Error("No file provided");
  const model = options.model || "whisper-1";
  const result = await puter.ai.speech2txt(file, { model });
  return result.text || result;
}

export function saveTranscription(filename, text) {
  const saved = JSON.parse(localStorage.getItem("transcriptions") || "[]");
  saved.unshift({ filename, text, date: new Date().toISOString() });
  localStorage.setItem("transcriptions", JSON.stringify(saved));
}

export function loadTranscriptions() {
  return JSON.parse(localStorage.getItem("transcriptions") || "[]");
}

export function deleteTranscription(index) {
  const saved = JSON.parse(localStorage.getItem("transcriptions") || "[]");
  saved.splice(index, 1);
  localStorage.setItem("transcriptions", JSON.stringify(saved));
}
