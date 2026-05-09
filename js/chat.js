const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "google/gemma-4-31b-it";
const NVIDIA_KEY = "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";
const CORS_PROXY = "https://corsproxy.io/?";

export function createChat() {
  const targetUrl = NVIDIA_BASE + "/chat/completions";
  const url = CORS_PROXY + encodeURIComponent(targetUrl);
  let conversation = [];
  return {
    async send(userText) {
      conversation.push({ role: "user", content: userText });
      const messages = [
        { role: "system", content: "You are a helpful assistant. Be concise." },
        ...conversation
      ];
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${NVIDIA_KEY}`
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages,
          stream: false,
          max_tokens: 512,
          temperature: 0.7,
          top_p: 0.9
        })
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
