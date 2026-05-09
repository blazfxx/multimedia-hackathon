const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "google/gemma-4-31b-it";
const NVIDIA_KEY = "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";
export const PRESETS = {
nvidia: { url: NVIDIA_BASE, model: NVIDIA_MODEL, key: NVIDIA_KEY },
openai: { url: "https://api.openai.com/v1", model: "gpt-3.5-turbo" },
openrouter: { url: "https://openrouter.ai/api/v1", model: "openai/gpt-3.5-turbo" },
groq: { url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
together: { url: "https://api.together.xyz/v1", model: "meta-llama/Llama-3-70b-chat-hf" },
ollama: { url: "http://localhost:11434/v1", model: "llama3" }
};
export function createChat(baseUrl, apiKey, model, systemPrompt) {
const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
let conversation = [];
return {
async send(userText) {
conversation.push({ role: "user", content: userText });
const messages = systemPrompt ? [{ role: "system", content: systemPrompt }, ...conversation] : [...conversation];
const res = await fetch(url, {
method: "POST",
headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
body: JSON.stringify({ model, messages, stream: false })
});
if (!res.ok) {
const err = await res.text();
throw new Error(`HTTP ${res.status}: ${err}`);
}
const data = await res.json();
const reply = data.choices?.[0]?.message?.content || JSON.stringify(data);
conversation.push({ role: "assistant", content: reply });
return reply;
},
reset() {
conversation = [];
}
};
}
