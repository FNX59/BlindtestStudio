const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.AUDIO_EXTRACT_PORT || 3478);
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const CACHE_DIR = process.env.AUDIO_EXTRACT_CACHE_DIR || path.join(__dirname, 'audio-cache');
const MAX_DURATION = Number(process.env.AUDIO_EXTRACT_MAX_DURATION || 60);
const YTDLP_JS_RUNTIME = process.env.YTDLP_JS_RUNTIME || (process.execPath ? `node:${process.execPath}` : '');

fs.mkdirSync(CACHE_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, service: 'blindtest-audio-extract', port: PORT });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/extract') {
      const body = await readJson(req);
      const result = await extractClip(body);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Route introuvable.' });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: explainError(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Blindtest audio extract server listening on http://localhost:${PORT}`);
});

async function extractClip(input) {
  const target = resolveDownloadTarget(input);
  const fallbackTarget = input.strictUrl ? '' : resolveSearchTarget(input);
  if (!target) throw httpError(400, 'URL YouTube invalide et recherche artiste/titre impossible.');

  const startSeconds = Math.max(0, parseTimeToSec(input.start));
  const duration = clamp(Number(input.duration) || 30, 1, MAX_DURATION);
  const artist = cleanFilePart(input.artist || 'artiste');
  const title = cleanFilePart(input.title || 'titre');
  const cacheKey = hash(`${target}|${startSeconds}|${duration}`);
  const sourcePath = path.join(CACHE_DIR, `${cacheKey}-source.mp3`);
  const clipPath = path.join(CACHE_DIR, `${cacheKey}-clip.mp3`);

  if (!hasUsableFile(clipPath)) {
    if (!hasUsableFile(sourcePath)) {
      const template = path.join(CACHE_DIR, `${cacheKey}-download.%(ext)s`);
      await downloadAudio(target, template, fallbackTarget && fallbackTarget !== target ? fallbackTarget : '');

      const downloaded = findFile(CACHE_DIR, `${cacheKey}-download`, '.mp3');
      if (!downloaded) throw new Error('yt-dlp a termine sans produire de MP3.');
      fs.copyFileSync(downloaded, sourcePath);
      safeUnlink(downloaded);
    }

    await runProcess(FFMPEG_BIN, [
      '-y',
      '-ss',
      String(startSeconds),
      '-i',
      sourcePath,
      '-t',
      String(duration),
      '-vn',
      '-acodec',
      'libmp3lame',
      '-q:a',
      '3',
      clipPath
    ]);
  }

  const base64 = fs.readFileSync(clipPath).toString('base64');
  return {
    ok: true,
    filename: `${artist}-${title}-${startSeconds}s-${duration}s.mp3`,
    mimeType: 'audio/mpeg',
    dataUrl: `data:audio/mpeg;base64,${base64}`,
    cached: hasUsableFile(clipPath)
  };
}

async function downloadAudio(target, outputTemplate, fallbackTarget) {
  const args = [
        '--no-playlist',
        '-f',
        'bestaudio/best',
        '--extract-audio',
        '--audio-format',
        'mp3',
        '-o',
        outputTemplate,
        target
  ];
  try {
    await runProcess(YTDLP_BIN, withYtdlpRuntime(args));
  } catch (error) {
    if (!fallbackTarget) throw error;
    const fallbackArgs = args.slice(0, -1).concat(fallbackTarget);
    await runProcess(YTDLP_BIN, withYtdlpRuntime(fallbackArgs));
  }
}

function withYtdlpRuntime(args) {
  if (!YTDLP_JS_RUNTIME) return args;
  return ['--js-runtimes', YTDLP_JS_RUNTIME, ...args];
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(httpError(413, 'Requete trop volumineuse.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(httpError(400, 'JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

function resolveDownloadTarget(input) {
  const youtubeUrl = String(input.youtubeUrl || input.url || '').trim();
  const searchTarget = resolveSearchTarget(input);
  const query = searchTarget.replace(/^ytsearch1:/, '');
  if (!youtubeUrl) return query ? `ytsearch1:${query}` : '';

  try {
    const url = new URL(youtubeUrl);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const isYoutube = host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'music.youtube.com';
    if (!isYoutube) return searchTarget;

    const searchQuery = url.searchParams.get('search_query');
    if (url.pathname === '/results' && searchQuery) return `ytsearch1:${searchQuery}`;
    if (extractYoutubeId(youtubeUrl)) return youtubeUrl;
    return searchTarget;
  } catch (error) {
    return searchTarget;
  }
}

function resolveSearchTarget(input) {
  const query = String(input.query || `${input.artist || ''} ${input.title || ''}`.trim()).trim();
  return query ? `ytsearch1:${query}` : '';
}

function extractYoutubeId(value) {
  const match = String(value).match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : '';
}

function parseTimeToSec(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parts = String(value).split(':').map(Number);
  if (parts.some(Number.isNaN)) return Number(value) || 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function cleanFilePart(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42) || 'audio';
}

function hasUsableFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 1024;
  } catch (error) {
    return false;
  }
}

function findFile(dir, prefix, suffix) {
  return fs.readdirSync(dir)
    .filter(name => name.startsWith(prefix) && name.endsWith(suffix))
    .map(name => path.join(dir, name))
    .find(hasUsableFile);
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    // A leftover temp file is harmless.
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function explainError(error) {
  if (error.code === 'ENOENT') {
    return `${error.path || error.syscall || 'Outil'} introuvable. Installe yt-dlp et ffmpeg, ou renseigne YTDLP_BIN / FFMPEG_BIN.`;
  }
  if (error.code === 'EPERM') {
    return 'Permission systeme refusee pour lancer l outil audio. Relance le serveur depuis un terminal normal.';
  }
  return error.message || 'Erreur inconnue.';
}
