// Netlify Function — lives at /.netlify/functions/chat once deployed (also reachable at /api/chat, see netlify.toml).
// Proxies to Groq's free API (no credit card needed).
// Set GROQ_API_KEY as an environment variable in Site configuration > Environment variables.
// Get a free key at https://console.groq.com

const GROQ_MODEL = "qwen/qwen3.6-27b";

function toOpenAIContent(content) {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image") {
      return {
        type: "image_url",
        image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
      };
    }
    return { type: "text", text: "" };
  });
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");

    const oaMessages = [
      { role: "system", content: body.system || "" },
      ...(body.messages || []).map((m) => ({
        role: m.role,
        content: toOpenAIContent(m.content),
      })),
    ];

    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: oaMessages,
        max_tokens: body.max_tokens || 300,
        reasoning_format: "hidden",
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return {
        statusCode: upstream.status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: [{ type: "text", text: "" }], error: data }),
      };
    }

    const reply = data.choices?.[0]?.message?.content || "";
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: [{ type: "text", text: reply }] }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "proxy_failed", message: String(err) }),
    };
  }
};
