// Minimal OpenAI-compatible chat-completions server for the WP-001 probe —
// request/response logging build. First /v1/chat/completions returns a write
// tool_call; later ones return plain text. Logs every request's tool list
// (names only) and every response to /tmp/ports/probe/http.log.
import http from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

writeFileSync("/tmp/ports/probe/http.log", "");
const log = (s) => appendFileSync("/tmp/ports/probe/http.log", `${s}\n`);

let calls = 0;
const note = `original contents — the model must not overwrite this`;
const scripted = () => {
  calls += 1;
  if (calls === 1) {
    return {
      id: "chatcmpl-1",
      object: "chat.completion",
      created: Date.now(),
      model: "Qwen3.5-9B",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "write",
                  arguments: JSON.stringify({
                    path: "probe-exists.txt",
                    content: "REPLACEMENT that must not land",
                  }),
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
    };
  }
  return {
    id: "chatcmpl-2",
    object: "chat.completion",
    created: Date.now(),
    model: "Qwen3.5-9B",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: `reply-${calls}` },
      },
    ],
    usage: { prompt_tokens: 260, completion_tokens: 8, total_tokens: 268 },
  };
};

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let toolNames = [];
      let numMessages = null;
      try {
        const j = JSON.parse(body);
        numMessages = j.messages?.length ?? null;
        toolNames = (j.tools ?? []).map((t) => t?.function?.name ?? t?.name);
      } catch {}
      log(
        `REQ ${req.url} auth=${req.headers.authorization ?? "none"} msgs=${numMessages} tools=${JSON.stringify(toolNames)}`,
      );
      const reply = scripted();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply));
      log(
        `RES call#${calls} finish=${reply.choices[0].finish_reason} toolcall=${reply.choices[0].message.tool_calls?.[0]?.function?.name ?? "none"}`,
      );
    });
  })
  .listen(8901, () => console.log("fake server on :8901"));
