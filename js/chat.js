export const PRESETS = {
  openai: { url: "https://api.openai.com/v1", model: "gpt-3.5-turbo" },
  openrouter: { url: "https://openrouter.ai/api/v1", model: "openai/gpt-3.5-turbo" },
  groq: { url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  together: { url: "https://api.together.xyz/v1", model: "meta-llama/Llama-3-70b-chat-hf" },
  nvidia: { url: "https://integrate.api.nvidia.com/v1", model: "nvidia/llama-3.1-nemotron-70b-instruct" },
  ollama: { url: "http://localhost:11434/v1", model: "llama3" }
};

export function createChat(baseUrl, apiKey, model, systemPrompt) {
  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  let conversation = [];
  return {
    async send(userText) {
      conversation.push({ role: "user", content: userText });
      const messages = systemPrompt
        ? [{ role: "system", content: systemPrompt }, ...conversation]
        : [...conversation];
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
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
