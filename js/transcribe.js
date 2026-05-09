const GROQ_KEY = "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";
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const CORS_PROXY = "https://corsproxy.io/?";

export function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function listen() {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return reject(new Error("Speech Recognition not supported. Use Chrome."));
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => resolve(e.results[0][0].transcript);
    recognition.onerror = (e) => reject(new Error("Speech error: " + e.error));
    recognition.start();
  });
}

export async function transcribeFile(file) {
  if (!GROQ_KEY) throw new Error("Groq API key not set.");
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");
  const url = CORS_PROXY + encodeURIComponent(GROQ_URL);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_KEY}` },
    body: formData
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  const data = await res.json();
  return {
    text: data.text,
    duration: data.duration,
    segments: (data.segments || []).map(s => ({
      start: s.start,
      end: s.end,
      text: s.text
    }))
  };
}

export function saveTranscription(filename, result) {
  const saved = JSON.parse(localStorage.getItem("transcriptions") || "[]");
  saved.unshift({ filename, ...result, date: new Date().toISOString() });
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
