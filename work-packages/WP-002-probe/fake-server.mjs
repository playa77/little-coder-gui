// WP-002 evidence probe: fake OpenAI-compatible endpoint serving the fixed model.
// /props -> n_ctx 131072 (direct llama.cpp shape); /v1/chat/completions -> one text reply.
import http from "node:http";
const seen = [];
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ url: req.url });
      if (req.url === "/props") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ default_generation_settings: { n_ctx: 131072 } }));
        return;
      }
      // chat completions: plain stop reply
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-1",
          object: "chat.completion",
          created: Date.now(),
          model: "Qwen3.5-9B",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: "hello from the served model" },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );
    });
  })
  .listen(Number(process.env.WP002_FAKE_PORT) || 52393, () => console.log("up"));
