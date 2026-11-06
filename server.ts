import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import youtubedl from 'youtube-dl-exec';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Cookies setup ────────────────────────────────────────────────────────────
// Cloud/prod: set YOUTUBE_COOKIES env var with the full Netscape cookie string.
// Local dev:  drop a cookies.txt file in the project root.
const rawTmpDir = process.platform === 'win32' ? process.env.TEMP || 'C:\\temp' : '/tmp';
const RUNTIME_COOKIES_FILE = path.join(rawTmpDir, 'yt_server_cookies.txt');

function setupCookies(): string | undefined {
  // 1. Env var takes priority (cloud deployments)
  const cookiesEnv = process.env.YOUTUBE_COOKIES;
  if (cookiesEnv && cookiesEnv.trim()) {
    fs.writeFileSync(RUNTIME_COOKIES_FILE, cookiesEnv.trim(), 'utf8');
    console.log('✅ YouTube cookies loaded from YOUTUBE_COOKIES env var.');
    return RUNTIME_COOKIES_FILE;
  }

  // 2. Fall back to cookies.txt file (local dev)
  const localFile = path.resolve(
    process.cwd(),
    process.env.YOUTUBE_COOKIES_FILE || 'cookies.txt'
  );
  if (fs.existsSync(localFile)) {
    console.log(`✅ YouTube cookies loaded from file: ${localFile}`);
    return localFile;
  }

  console.log('ℹ️  No cookies configured. Downloads may hit YouTube bot detection.');
  return undefined;
}

const COOKIES_FILE = setupCookies();
function getCookiesFile() { return COOKIES_FILE; }


// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();
const PORT = 3000;

app.use(express.json());

// Common yt-dlp headers to look like a real browser
const YT_HEADERS = [
  'referer:https://www.youtube.com/',
  'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const cookiesFile = getCookiesFile();
  const testUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Me at the zoo

  const args: Record<string, any> = {
    dumpJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    playlistEnd: 1,
    addHeader: YT_HEADERS,
  };
  if (cookiesFile) args.cookies = cookiesFile;

  try {
    await youtubedl(testUrl, args);
    res.json({ status: 'ok', botDetected: false, cookiesLoaded: !!cookiesFile });
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.includes('Sign in to confirm')) {
      res.json({ status: 'error', botDetected: true, cookiesLoaded: !!cookiesFile });
    } else {
      res.json({ status: 'error', error: msg, cookiesLoaded: !!cookiesFile });
    }
  }
});

// ─── Metadata ─────────────────────────────────────────────────────────────────
app.post('/api/metadata', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    const cookiesFile = getCookiesFile();

    const args: Record<string, any> = {
      dumpJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: YT_HEADERS,
    };
    if (cookiesFile) args.cookies = cookiesFile;

    const metadata = await youtubedl(url, args);
    res.json(metadata);
  } catch (error: any) {
    console.error('Failed to fetch metadata:', error);
    const msg = error?.message || '';
    if (msg.includes('Sign in to confirm')) {
      res.status(403).json({ error: 'YouTube is blocking this server. The admin needs to update the YOUTUBE_COOKIES env var.' });
    } else {
      res.status(500).json({ error: msg || 'Failed to fetch metadata' });
    }
  }
});

// ─── Prepared downloads store ─────────────────────────────────────────────────
interface PreparedFile {
  filePath: string;
  filename: string;
  mimeType: string;
  createdAt: number;
}
const preparedDownloads = new Map<string, PreparedFile>();

// Auto-clean files older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, info] of preparedDownloads.entries()) {
    if (now - info.createdAt > 30 * 60 * 1000) {
      try { fs.unlinkSync(info.filePath); } catch (_) {}
      preparedDownloads.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ─── Prepare download ─────────────────────────────────────────────────────────
// Processes the video/audio server-side, stores it, returns a download ID.
app.post('/api/prepare', async (req, res) => {
  const { url, type, resolution, title } = req.body as {
    url: string; type: 'audio' | 'video'; resolution?: string; title?: string;
  };

  if (!url || !type) {
    res.status(400).json({ error: 'url and type are required' });
    return;
  }

  const cookiesFile = getCookiesFile();
  const fileId = crypto.randomUUID();
  const outPathPrefix = path.join(rawTmpDir, `ytdl_${fileId}`);
  const safeTitle = (title || 'download').replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'download';

  try {
    if (type === 'audio') {
      const args: Record<string, any> = {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: 0,
        embedThumbnail: true,
        addMetadata: true,
        ffmpegLocation: ffmpegPath.path,
        output: `${outPathPrefix}.%(ext)s`,
        noCheckCertificates: true,
        addHeader: YT_HEADERS,
      };
      if (cookiesFile) args.cookies = cookiesFile;

      await youtubedl(url, args);

      const downloadedFile = fs.readdirSync(rawTmpDir).find(
        f => f.startsWith(`ytdl_${fileId}`) && f.endsWith('.mp3')
      );
      if (!downloadedFile) throw new Error('File not found after processing');

      const id = crypto.randomUUID();
      preparedDownloads.set(id, {
        filePath: path.join(rawTmpDir, downloadedFile),
        filename: `${safeTitle}.mp3`,
        mimeType: 'audio/mpeg',
        createdAt: Date.now(),
      });
      res.json({ id, filename: `${safeTitle}.mp3` });

    } else {
      let format = 'best[ext=mp4]';
      if (resolution) {
        format = `bestvideo[height<=${resolution}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`;
      }

      const args: Record<string, any> = {
        format,
        mergeOutputFormat: 'mp4',
        ffmpegLocation: ffmpegPath.path,
        output: `${outPathPrefix}.%(ext)s`,
        noCheckCertificates: true,
        addHeader: YT_HEADERS,
      };
      if (cookiesFile) args.cookies = cookiesFile;

      await youtubedl(url, args);

      const downloadedFile = fs.readdirSync(rawTmpDir).find(
        f => f.startsWith(`ytdl_${fileId}`) && f.endsWith('.mp4')
      );
      if (!downloadedFile) throw new Error('File not found after processing');

      const id = crypto.randomUUID();
      preparedDownloads.set(id, {
        filePath: path.join(rawTmpDir, downloadedFile),
        filename: `${safeTitle}_${resolution || 'best'}p.mp4`,
        mimeType: 'video/mp4',
        createdAt: Date.now(),
      });
      res.json({ id, filename: `${safeTitle}_${resolution || 'best'}p.mp4` });
    }

  } catch (err: any) {
    console.error('Prepare error:', err);
    // Cleanup partial files
    try {
      fs.readdirSync(rawTmpDir)
        .filter(f => f.startsWith(`ytdl_${fileId}`))
        .forEach(f => { try { fs.unlinkSync(path.join(rawTmpDir, f)); } catch (_) {} });
    } catch (_) {}

    const msg = err.message || '';
    if (msg.includes('Sign in to confirm')) {
      res.status(403).json({ error: 'YouTube is blocking this server. Admin needs to update cookies.' });
    } else {
      res.status(500).json({ error: msg || 'Failed to prepare download' });
    }
  }
});

// ─── Serve prepared download ──────────────────────────────────────────────────
// One-time serve: deletes the file from store after sending.
app.get('/api/serve/:id', (req, res) => {
  const info = preparedDownloads.get(req.params.id);
  if (!info || !fs.existsSync(info.filePath)) {
    res.status(404).json({ error: 'Download link expired or not found. Please prepare again.' });
    return;
  }

  preparedDownloads.delete(req.params.id); // Remove from store immediately
  res.setHeader('Content-Type', info.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${info.filename}"`);
  res.setHeader('Content-Length', fs.statSync(info.filePath).size);

  const stream = fs.createReadStream(info.filePath);
  stream.pipe(res);
  stream.on('close', () => { try { fs.unlinkSync(info.filePath); } catch (_) {} });
});

// ─── Dev / Prod server setup ──────────────────────────────────────────────────
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer();


