import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AI Proxy Endpoint
  app.post("/api/proxy", async (req, res) => {
    const { url, method, headers, body } = req.body;

    try {
      const response = await fetch(url, {
        method: method || "POST",
        headers: headers || {},
        body: body ? JSON.stringify(body) : undefined,
      });

      // Forward status and headers
      res.status(response.status);
      
      // We only want to forward some headers, or just set content-type
      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);

      if (!response.body) {
        return res.end();
      }

      // Stream the response body
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (error: any) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
