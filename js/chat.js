const PROXY_BASE = "https://api-proxy.evan-zhao140.workers.dev";

async function streamMessages(messages, onToken) {
  const body = {
    model: "meta/llama-3.1-8b-instruct",
    messages,
    stream: true,
    max_tokens: 1024,
    temperature: 0.7,
    top_p: 0.9
  };
  const res = await fetch(`${PROXY_BASE}/nvidia/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let reply = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const token = json.choices?.[0]?.delta?.content;
        if (token) {
          reply += token;
          if (onToken) onToken(token);
        }
      } catch {}
    }
  }
  return reply;
}

export async function streamQuery(prompt, onToken) {
  const messages = [
    { role: "system", content: "You generate stock footage search keywords from audio transcripts. Respond only in the requested format. Use spaces between words, never underscores." },
    { role: "user", content: prompt }
  ];
  return streamMessages(messages, onToken);
}
