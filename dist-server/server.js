// server.ts
import express from "express";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import youtubedl from "youtube-dl-exec";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import crypto from "crypto";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var firebaseConfig = {};
try {
  const firebaseConfigPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
} catch (e) {
  console.log("Firebase Admin initialization skipped or failed. Be careful with verifyIdToken.");
}
var getDb = () => {
  if (firebaseConfig.firestoreDatabaseId) {
    return getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
  }
  return getFirestore();
};
var app = express();
var PORT = 3e3;
app.use(express.json());
var verifyAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) {
    res.status(401).json({ error: "Unauthorized: No token provided" });
    return;
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Error verifying Firebase token:", error);
    res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};
app.get("/api/health", async (req, res) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  let uid = "";
  if (token) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      uid = decodedToken.uid;
    } catch (e) {
    }
  }
  const db = getDb();
  let cookiesFilePath;
  const rawTmpDir = process.platform === "win32" ? process.env.TEMP || "C:\\temp" : "/tmp";
  if (uid) {
    try {
      const doc = await db.collection("users").doc(uid).collection("settings").doc("youtube").get();
      if (doc.exists) {
        const cookiesText = doc.data()?.cookies;
        if (cookiesText) {
          cookiesFilePath = path.join(rawTmpDir, `cookies_${uid}.txt`);
          fs.writeFileSync(cookiesFilePath, cookiesText);
        }
      }
    } catch (e) {
      console.error("Failed to get cookies from Firestore", e);
    }
  }
  const args = {
    dumpJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    playlistEnd: 1,
    addHeader: [
      "referer:https://www.youtube.com/",
      "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ]
  };
  if (cookiesFilePath) args.cookies = cookiesFilePath;
  const testUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
  try {
    await youtubedl(testUrl, args);
    res.json({ status: "ok", botDetected: false });
  } catch (error) {
    const msg = error?.message || "";
    if (msg.includes("Sign in to confirm")) {
      res.json({ status: "error", botDetected: true });
    } else {
      res.json({ status: "error", error: msg });
    }
  } finally {
    if (cookiesFilePath && fs.existsSync(cookiesFilePath)) {
      try {
        fs.unlinkSync(cookiesFilePath);
      } catch (e) {
      }
    }
  }
});
app.post("/api/metadata", verifyAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: "URL is required" });
      return;
    }
    const uid = req.user.uid;
    const db = getDb();
    let cookiesFilePath;
    try {
      const doc = await db.collection("users").doc(uid).collection("settings").doc("youtube").get();
      if (doc.exists) {
        const cookiesText = doc.data()?.cookies;
        if (cookiesText) {
          const rawTmpDir = process.platform === "win32" ? process.env.TEMP || "C:\\temp" : "/tmp";
          cookiesFilePath = path.join(rawTmpDir, `cookies_${uid}.txt`);
          fs.writeFileSync(cookiesFilePath, cookiesText);
        }
      }
    } catch (e) {
      console.error("Failed to get cookies from Firestore", e);
    }
    const args = {
      dumpJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        "referer:https://www.youtube.com/",
        "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      ]
    };
    if (cookiesFilePath) {
      args.cookies = cookiesFilePath;
    }
    try {
      const metadata = await youtubedl(url, args);
      res.json(metadata);
    } finally {
      if (cookiesFilePath && fs.existsSync(cookiesFilePath)) {
        try {
          fs.unlinkSync(cookiesFilePath);
        } catch (e) {
        }
      }
    }
  } catch (error) {
    console.error("Failed to fetch metadata:", error);
    const msg = error?.message || "";
    if (msg.includes("Sign in to confirm")) {
      res.status(403).json({ error: "YouTube requires authentication. Please update your YouTube cookies in Settings > Advanced." });
    } else {
      res.status(500).json({ error: msg || "Failed to fetch metadata" });
    }
  }
});
app.get("/api/download", async (req, res) => {
  const token = req.query.token;
  let decodedToken;
  if (!token) {
    res.status(401).json({ error: "Unauthorized: No token provided" });
    return;
  }
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error("Error verifying Firebase token:", error);
    res.status(401).json({ error: "Unauthorized: Invalid token" });
    return;
  }
  const { url, type, resolution } = req.query;
  if (!url) {
    res.status(400).json({ error: "URL is required" });
    return;
  }
  const uid = decodedToken.uid;
  const db = getDb();
  let cookiesFilePath;
  const rawTmpDir = process.platform === "win32" ? process.env.TEMP || "C:\\temp" : "/tmp";
  try {
    const doc = await db.collection("users").doc(uid).collection("settings").doc("youtube").get();
    if (doc.exists) {
      const cookiesText = doc.data()?.cookies;
      if (cookiesText) {
        cookiesFilePath = path.join(rawTmpDir, `cookies_${uid}.txt`);
        fs.writeFileSync(cookiesFilePath, cookiesText);
      }
    }
  } catch (e) {
    console.error("Failed to get cookies from Firestore", e);
  }
  const fileId = crypto.randomUUID();
  const outPathPrefix = path.join(rawTmpDir, `ytdl_${fileId}`);
  try {
    if (type === "audio") {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="audio_${fileId}.mp3"`);
      const args = {
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: 0,
        embedThumbnail: true,
        addMetadata: true,
        xattrs: true,
        ffmpegLocation: ffmpegPath.path,
        output: `${outPathPrefix}.%(ext)s`,
        noCheckCertificates: true,
        addHeader: [
          "referer:https://www.youtube.com/",
          "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ]
      };
      if (cookiesFilePath) args.cookies = cookiesFilePath;
      await youtubedl(url, args);
      const files = fs.readdirSync(rawTmpDir);
      const downloadedFile = files.find((f) => f.startsWith(`ytdl_${fileId}`) && f.endsWith(".mp3"));
      if (!downloadedFile) {
        throw new Error("File not found after download");
      }
      const filePath = path.join(rawTmpDir, downloadedFile);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on("end", () => {
        fs.unlinkSync(filePath);
      });
    } else {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="video_${resolution || "best"}_${fileId}.mp4"`);
      let format = "best[ext=mp4]";
      if (resolution) {
        format = `bestvideo[height<=${resolution}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`;
      }
      const args = {
        format,
        mergeOutputFormat: "mp4",
        ffmpegLocation: ffmpegPath.path,
        output: `${outPathPrefix}.%(ext)s`,
        noCheckCertificates: true,
        addHeader: [
          "referer:https://www.youtube.com/",
          "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ]
      };
      if (cookiesFilePath) args.cookies = cookiesFilePath;
      await youtubedl(url, args);
      const files = fs.readdirSync(rawTmpDir);
      const downloadedFile = files.find((f) => f.startsWith(`ytdl_${fileId}`) && f.endsWith(".mp4"));
      if (!downloadedFile) {
        throw new Error("File not found after download");
      }
      const filePath = path.join(rawTmpDir, downloadedFile);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on("end", () => {
        fs.unlinkSync(filePath);
      });
    }
  } catch (err) {
    console.error("Download error:", err);
    const files = fs.readdirSync(rawTmpDir);
    files.filter((f) => f.startsWith(`ytdl_${fileId}`)).forEach((f) => {
      try {
        fs.unlinkSync(path.join(rawTmpDir, f));
      } catch (e) {
      }
    });
    if (!res.headersSent) {
      const msg = err.message || "";
      if (msg.includes("Sign in to confirm")) {
        res.status(403).json({ error: "YouTube requires authentication. Please update your YouTube cookies in Settings." });
      } else {
        res.status(500).json({ error: msg || "Download failed" });
      }
    }
  } finally {
    if (cookiesFilePath && fs.existsSync(cookiesFilePath)) {
      try {
        fs.unlinkSync(cookiesFilePath);
      } catch (e) {
      }
    }
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
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
