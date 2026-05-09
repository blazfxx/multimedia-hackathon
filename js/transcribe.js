export function isSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function listen() {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return reject(new Error("Speech Recognition not supported in this browser. Use Chrome."));
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      resolve(text);
    };
    recognition.onerror = (e) => reject(new Error("Speech error: " + e.error));
    recognition.onend = () => {};
    recognition.start();
  });
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
