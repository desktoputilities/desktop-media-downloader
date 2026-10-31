import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// gallery-dl handles image posts and galleries (Instagram carousels, X images,
// TikTok photo posts, Reddit, ...) that yt-dlp does not. Official standalone
// builds exist for Windows and Linux only; on macOS the app uses a gallery-dl
// installed on PATH (for example `brew install gallery-dl`) when present.

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');
const binDir = path.join(rootDir, 'bin');
const targetName = process.platform === 'win32' ? 'gallery-dl.exe' : 'gallery-dl';
const targetPath = path.join(binDir, targetName);
const requestedVersion = process.env.GALLERY_DL_VERSION?.trim() || '1.32.19';
const releaseBaseUrl = `https://codeberg.org/mikf/gallery-dl/releases/download/v${requestedVersion}`;

const assetNameForPlatform = () => {
  if (process.platform === 'win32') {
    if (process.arch === 'x64' || process.arch === 'arm64') return 'gallery-dl.exe';
    if (process.arch === 'ia32') return 'gallery-dl_x86.exe';
  }
  if (process.platform === 'linux' && process.arch === 'x64') return 'gallery-dl.bin';
  return null;
};

const fetchOrThrow = async (url) => {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'desktop-media-downloader-build' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }
  return response;
};

const getBinaryVersion = (binaryPath) => {
  if (!fs.existsSync(binaryPath)) return null;
  try {
    const probe = spawnSync(binaryPath, ['--version'], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 30000,
    });
    return probe.status === 0 ? probe.stdout.trim() : null;
  } catch {
    return null;
  }
};

const downloadVerifiedBinary = async (assetName) => {
  const [binaryResponse, checksumResponse] = await Promise.all([
    fetchOrThrow(`${releaseBaseUrl}/${assetName}`),
    fetchOrThrow(`${releaseBaseUrl}/SHA256SUMS`),
  ]);

  const [binaryBuffer, checksumText] = await Promise.all([
    binaryResponse.arrayBuffer().then((value) => Buffer.from(value)),
    checksumResponse.text(),
  ]);

  const checksumLine = checksumText
    .split(/\r?\n/)
    .find((line) => line.trim().split(/\s+/).pop()?.replace(/^\*/, '') === assetName);
  const expectedHash = checksumLine?.trim().split(/\s+/)[0]?.toLowerCase();
  const actualHash = crypto.createHash('sha256').update(binaryBuffer).digest('hex');

  if (!expectedHash || expectedHash !== actualHash) {
    throw new Error(`Checksum verification failed for ${assetName}`);
  }

  fs.mkdirSync(binDir, { recursive: true });
  const temporaryPath = `${targetPath}.download${process.platform === 'win32' ? '.exe' : ''}`;
  fs.writeFileSync(temporaryPath, binaryBuffer, { mode: 0o755 });
  if (process.platform !== 'win32') {
    fs.chmodSync(temporaryPath, 0o755);
  }

  const installedVersion = getBinaryVersion(temporaryPath);
  if (installedVersion !== requestedVersion) {
    fs.rmSync(temporaryPath, { force: true });
    throw new Error(`Downloaded gallery-dl reported ${installedVersion || 'no version'} instead of ${requestedVersion}`);
  }

  fs.rmSync(targetPath, { force: true });
  fs.renameSync(temporaryPath, targetPath);

  console.log(`[prepare:gallery-dl] Bundled official ${assetName} (${installedVersion}) with verified SHA-256`);
};

const assetName = assetNameForPlatform();
if (!assetName) {
  console.log(`[prepare:gallery-dl] No official build for ${process.platform}/${process.arch}; the app will use gallery-dl from PATH if installed`);
} else if (getBinaryVersion(targetPath) === requestedVersion) {
  console.log(`[prepare:gallery-dl] Bundled gallery-dl is current (${requestedVersion})`);
} else {
  await downloadVerifiedBinary(assetName);
}
