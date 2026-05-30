import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import * as http from "http";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }

  wss.on("connection", async (clientWs: WebSocket, req: http.IncomingMessage) => {
    if (!ai) {
      clientWs.close(1011, "GEMINI_API_KEY not configured");
      return;
    }

    const requestUrl = new URL(req.url || '/', `http://localhost`);
    const rawVoice = requestUrl.searchParams.get('voice') || "Zephyr";
    const voiceName = rawVoice.charAt(0).toUpperCase() + rawVoice.slice(1).toLowerCase();
    const memoryParam = requestUrl.searchParams.get('memory');
    const memoryContext = memoryParam ? `\n\nTake note of these important facts about the user:\n${memoryParam}` : "";

    // As a fallback, maybe we also need to set voice directly if the SDK changed?
    // We'll stick to the docs first but ensure it's "Kore" instead of "KORE" or "kore"
    console.log("Connecting with voiceName:", voiceName);

    try {
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onmessage: (message: any) => {
            if (message.toolCall && message.toolCall.functionCalls) {
              for (const call of message.toolCall.functionCalls) {
                if (call.name === "rememberFact" && call.args && call.args.fact) {
                  clientWs.send(JSON.stringify({ memoryFact: call.args.fact }));
                  try {
                    if (typeof (session as any).sendToolResponse === 'function') {
                      (session as any).sendToolResponse({
                        functionResponses: [{
                          id: call.id,
                          name: call.name,
                          response: { result: "Success" }
                        }]
                      });
                    } else if (typeof (session as any).send === 'function') {
                      (session as any).send({
                        toolResponse: {
                          functionResponses: [{
                            id: call.id,
                            name: call.name,
                            response: { result: "Success" }
                          }]
                        }
                      });
                    }
                  } catch (err) {
                    console.error("Error sending tool response:", err);
                  }
                }
              }
            }
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                  clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                }
                if (part.text) {
                  clientWs.send(JSON.stringify({ text: part.text, isServer: true }));
                }
              }
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onclose: () => {
            clientWs.close();
          },
          onerror: (err) => {
            console.error("Gemini Live API error:", err);
            clientWs.send(JSON.stringify({ error: "Gemini Live session error" }));
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          tools: [{
            functionDeclarations: [{
              name: "rememberFact",
              description: "Call this tool immediately when the user tells you an important personal fact, preference, or detail about themselves.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  fact: {
                    type: Type.STRING,
                    description: "A concise statement of the personal fact to remember."
                  }
                },
                required: ["fact"]
              }
            }]
          }],
          systemInstruction: "You are PatroParadax (Patro), a helpful, conversational AI. Keep your responses concise and natural. Use the rememberFact tool to save important facts the user tells you." + memoryContext,
        },
      });

      clientWs.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio) {
            session.sendRealtimeInput({
              audio: {
                data: parsed.audio,
                mimeType: "audio/pcm;rate=16000"
              }
            });
          } else if (parsed.text) {
            session.sendRealtimeInput({ text: parsed.text });
          }
        } catch (e) {
          console.error("Error parsing message", e);
        }
      });

      clientWs.on("close", () => {
        // Unfortunately standard ai.live.connect session doesn't easily expose a disconnect,
        // but session connection ends when no longer referenced or web socket is closed.
        // Wait, @google/genai Live API has session.close() interface according to skill.
        if ((session as any).close) {
          (session as any).close();
        }
      });

    } catch (e: any) {
      console.error("Error starting Gemini Live session:", e);
      clientWs.send(JSON.stringify({ error: "Could not connect to Gemini Live" }));
      clientWs.close();
    }
  });

  app.use(express.json());

  app.post("/api/chat", async (req, res) => {
    if (!ai) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }
    try {
      const { messages, memory } = req.body;
      const sysInstruction = memory && memory.length > 0 
        ? `You are PatroParadax (Patro), a helpful AI assistant.\n\nTake note of these important facts about the user:\n${memory.join('\n')}`
        : `You are PatroParadax (Patro), a helpful AI assistant.`;

      const contents = messages.map((m: any) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }));
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: { systemInstruction: sysInstruction }
      });
      
      res.json({ text: response.text });
    } catch (e) {
      console.error("Error generating chat:", e);
      res.status(500).json({ error: "Failed to generate chat." });
    }
  });

  app.post("/api/extract-memory", async (req, res) => {
    if (!ai) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }
    try {
      const { text, memory } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `You are a memory extractor. Analyze the user's message: "${text}".
Existing memory: ${memory.join("; ")}
If the user stated a NEW important personal fact (e.g., their name, preferences, goals) that is NOT in the existing memory, output a JSON object with a 'newFacts' array of strings. Otherwise, output {"newFacts": []}. Keep facts concise.`,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      const parsed = JSON.parse(response.text.trim());
      res.json(parsed);
    } catch (e) {
      console.error("Error extracting memory:", e);
      res.status(500).json({ error: "Failed to extract memory." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server", err);
});
