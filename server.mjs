import express from "express";
import axios from "axios";
import "dotenv/config";

const app = express();
app.use(express.json());

const PORT = 8082;
const NIM_URL = "https://nvidia.com";

app.post("/v1/messages", async (req, res) => {
  try {
    const { messages, system, temperature, max_tokens } = req.body;

    // Filter messages down to clean text strings
    const nimMessages = messages.map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: Array.isArray(msg.content)
        ? msg.content.map((c) => c.text || "").join("\n")
        : msg.content,
    }));

    if (system) nimMessages.unshift({ role: "system", content: system });

    const payload = {
      model: "qwen/qwen2.5-coder-32b-instruct",
      messages: nimMessages,
      temperature: temperature || 0.1,
      max_tokens: max_tokens || 2048, // Lowered max tokens to prevent large token dumps
      stream: false, // Disabled streaming to prevent context bloating
    };

    const headers = {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      Accept: "application/json",
    };

    const response = await axios.post(NIM_URL, payload, { headers });

    // Package it cleanly into Anthropic's exact expected spec
    return res.json({
      id: `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: response.data.choices[0].message.content }],
      model: payload.model,
    });
  } catch (error) {
    console.error("Proxy Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Nvidia NIM Gateway Error" });
  }
});

app.listen(PORT, "127.0.0.1", () =>
  console.log(`🚀 Memory-Safe Bridge listening on http://127.0.0.1:${PORT}`),
);
