const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "nvidia/parakeet-1.1b-rnnt-multilingual-asr";
const NVIDIA_KEY = "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";
export async function transcribeAudio(file, options = {}) {
if (!file) throw new Error("No file provided");
const apiKey = options.apiKey || NVIDIA_KEY;
const model = options.model || NVIDIA_MODEL;
const baseUrl = (options.baseUrl || NVIDIA_BASE).replace(/\/+$/, "");
const formData = new FormData();
formData.append("file", file);
formData.append("model", model);
const res = await fetch(baseUrl + "/audio/transcriptions", {
method: "POST",
headers: { "Authorization": `Bearer ${apiKey}` },
body: formData
});
if (!res.ok) {
const err = await res.text();
throw new Error(`HTTP ${res.status}: ${err}`);
}
const data = await res.json();
return data.text || JSON.stringify(data);
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
