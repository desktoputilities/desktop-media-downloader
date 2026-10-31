// Decides which engine handles a link and turns engine output into the media
// the user can download. Kept free of Electron so it can be unit-tested.

export type MediaKind = 'video' | 'audio' | 'image'

export interface MediaItem {
  // 1-based position in gallery-dl's file list, used as its --range.
  index: number
  kind: MediaKind
  url: string
  ext?: string
  width?: number
  height?: number
  bytes?: number
  thumbnail?: string
  // A plain file URL found on the page; fetched directly instead of via gallery-dl.
  direct?: boolean
}

export interface GalleryResult {
  items: MediaItem[]
  title?: string
  uploader?: string
  category?: string
  // A profile, feed or search page rather than one post.
  isCollection: boolean
  error?: string
}

export type EngineErrorKind = 'login' | 'blocked' | 'unsupported' | 'no-media' | 'not-found' | 'other'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'bmp', 'jfif'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'm3u8', 'mpd', 'ts', 'flv'])
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'ogg', 'oga', 'opus', 'wav', 'flac', 'aac', 'weba'])

const hostOf = (value: string): string => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '')
  } catch {
    return ''
  }
}

const isHost = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`)

// Links to a single post or gallery go to gallery-dl first: yt-dlp ignores
// images (an X post with photos fails with "No video could be found").
// Video-first sites and anything unknown go to yt-dlp first.
const GALLERY_FIRST: Array<{ domain: string; path: RegExp }> = [
  { domain: 'instagram.com', path: /^\/(?:[^/]+\/)?p\/[^/]+/ },
  { domain: 'x.com', path: /^\/[^/]+\/status\/\d+/ },
  { domain: 'twitter.com', path: /^\/[^/]+\/status\/\d+/ },
  { domain: 'tiktok.com', path: /^\/@[^/]+\/photo\/\d+/ },
  { domain: 'reddit.com', path: /^\/(?:r|user|u)\/[^/]+\/comments\// },
  { domain: 'redd.it', path: /^\/\w+/ },
  { domain: 'pinterest.com', path: /^\/pin\// },
  { domain: 'imgur.com', path: /^\/(?:a|gallery|t\/[^/]+)\/|^\/\w{5,8}$/ },
  { domain: 'bsky.app', path: /^\/profile\/[^/]+\/post\// },
  { domain: 'tumblr.com', path: /\/post\/\d+|^\/[^/]+\/\d+/ },
  { domain: 'flickr.com', path: /^\/photos\/[^/]+\/\d+/ },
  { domain: 'deviantart.com', path: /\/art\// },
  { domain: 'artstation.com', path: /^\/artwork\// },
  { domain: 'pixiv.net', path: /\/artworks\/\d+/ },
  { domain: 'threads.net', path: /^\/@[^/]+\/post\// },
  { domain: 'threads.com', path: /^\/@[^/]+\/post\// },
  { domain: 'commons.wikimedia.org', path: /^\/wiki\/File:/ },
]

export const routeForUrl = (value: string): 'gallery' | 'video' => {
  const host = hostOf(value)
  if (!host) return 'video'
  let pathname = '/'
  try {
    pathname = new URL(value).pathname
  } catch {
    return 'video'
  }
  // A link straight to an image file.
  if (/\.(?:jpe?g|png|webp|gif|avif|heic|bmp|jfif)$/i.test(pathname)) return 'gallery'
  return GALLERY_FIRST.some((rule) => isHost(host, rule.domain) && rule.path.test(pathname)) ? 'gallery' : 'video'
}

// Same wording for both engines, so the UI can say what to do next.
export const classifyEngineError = (message: string | undefined): EngineErrorKind => {
  const text = String(message || '')
  if (/log ?in|sign ?in|authenticat|cookies|private (?:account|post|video)|age[- ]restricted|redirect to login|empty media response|requires? (?:an )?account/i.test(text)) return 'login'
  if (/no video could be found|no video formats|no media (?:found|was found)|there(?:'| i)s no video|contains no media/i.test(text)) return 'no-media'
  if (/unsupported url|no suitable extractor/i.test(text)) return 'unsupported'
  if (/\b(?:403|429)\b|forbidden|too many requests|blocked|cloudflare|captcha|bot (?:check|detection)|network security|challenge/i.test(text)) return 'blocked'
  if (/\b404\b|not found|does not exist|unavailable|removed|deleted/i.test(text)) return 'not-found'
  return 'other'
}

const kindFromExtension = (ext: string | undefined, url: string): MediaKind | undefined => {
  if (url.startsWith('ytdl:')) return 'video'
  const normalized = (ext || '').toLowerCase()
  if (IMAGE_EXTS.has(normalized)) return 'image'
  if (VIDEO_EXTS.has(normalized)) return 'video'
  if (AUDIO_EXTS.has(normalized)) return 'audio'
  const fromUrl = url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
  if (fromUrl && fromUrl !== normalized) return kindFromExtension(fromUrl, '')
  return undefined
}

const positiveNumber = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const textField = (meta: any, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), meta)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

const shorten = (value: string | undefined, max = 120): string | undefined => {
  if (!value) return undefined
  const firstLine = value.split(/\r?\n/).find((line) => line.trim())?.trim() || value.trim()
  return firstLine.length > max ? `${firstLine.slice(0, max - 1).trimEnd()}…` : firstLine
}

// Parses `gallery-dl -j` output: [2, meta] starts a post, [3, url, meta] is a
// file, [6, url, meta] queues another page (profiles, feeds), [-1, {error}].
// Log lines such as "[instagram][info] ..." also start with "[", so try each
// line start until one parses as the JSON array.
const readJsonArray = (output: string): any[] | undefined => {
  const starts = [...output.matchAll(/(?:^|\n)\s*\[/g)].map((match) => match.index! + match[0].indexOf('['))
  for (const start of starts) {
    try {
      const parsed = JSON.parse(output.slice(start))
      if (Array.isArray(parsed)) return parsed
    } catch {
      // Not the JSON yet.
    }
  }
  return undefined
}

export const parseGalleryDlJson = (output: string): GalleryResult => {
  const messages = readJsonArray(output)
  if (!messages) {
    return output.trim()
      ? { items: [], isCollection: false, error: 'Could not read gallery-dl output' }
      : { items: [], isCollection: false }
  }

  const items: MediaItem[] = []
  const seen = new Set<string>()
  const postIds = new Set<string>()
  let queued = 0
  let fileIndex = 0
  let error: string | undefined
  let firstMeta: any

  for (const message of messages) {
    if (!Array.isArray(message)) continue
    const [type] = message
    if (type === -1) {
      error = error || String(message[1]?.message || message[1]?.error || 'Extraction failed')
      continue
    }
    if (type === 6) {
      queued += 1
      continue
    }
    if (type !== 3 || typeof message[1] !== 'string') continue

    fileIndex += 1
    const url: string = message[1]
    const meta = message[2] || {}
    firstMeta = firstMeta || meta
    const postId = meta.post_id ?? meta.tweet_id ?? meta.shortcode ?? meta.id
    if (postId !== undefined && meta.num !== undefined) postIds.add(String(postId))

    // Wikimedia lists every earlier revision of a file; only the current one is the media.
    if (String(meta.category || '').startsWith('wikimedia') && /\/archive\//.test(url)) continue
    if (seen.has(url)) continue
    seen.add(url)

    const ext = typeof meta.extension === 'string' ? meta.extension.toLowerCase() : undefined
    const kind = kindFromExtension(ext, url)
    if (!kind) continue

    items.push({
      index: fileIndex,
      kind,
      url,
      ext: url.startsWith('ytdl:') ? 'mp4' : ext,
      width: positiveNumber(meta.width),
      height: positiveNumber(meta.height),
      bytes: positiveNumber(meta.size ?? meta.filesize),
      thumbnail: kind === 'image' ? url : textField(meta, ['thumbnail', 'preview', 'poster']),
    })
  }

  return {
    items,
    title: cleanMediaTitle(shorten(textField(firstMeta, ['title', 'description', 'content', 'text', 'caption']))),
    uploader: textField(firstMeta, ['author.name', 'author.nick', 'author.username', 'user.name', 'user.nick', 'username', 'owner.username', 'uploader', 'artist']),
    category: textField(firstMeta, ['category']),
    isCollection: queued > 0 || postIds.size > 1,
    error: items.length === 0 ? error : undefined,
  }
}

export interface PostResult {
  id: string
  url: string
  title?: string
  thumbnail?: string
  uploader?: string
}

// Links to a post page from gallery-dl metadata, for sites whose file URLs are CDN links.
const postUrlFromMeta = (meta: any): string | undefined => {
  const direct = textField(meta, ['post_url', 'page_url', 'permalink'])
  if (direct && /^https?:\/\//i.test(direct)) return direct
  const category = String(meta?.category || '')
  if (category === 'instagram' && meta.shortcode) return `https://www.instagram.com/p/${meta.shortcode}/`
  if (category === 'twitter' && meta.tweet_id) {
    const user = textField(meta, ['author.name', 'user.name']) || 'i'
    return `https://x.com/${user}/status/${meta.tweet_id}`
  }
  if (category === 'reddit' && meta.permalink) return `https://www.reddit.com${meta.permalink}`
  if (category === 'bluesky' && meta.post_id && meta.author?.handle) return `https://bsky.app/profile/${meta.author.handle}/post/${meta.post_id}`
  if (category === 'pinterest' && meta.id) return `https://www.pinterest.com/pin/${meta.id}/`
  return undefined
}

// A title fit for a file name: no "File:" page prefix, no file extension it
// already carries, no trailing punctuation.
export const cleanMediaTitle = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  const cleaned = value
    .replace(/^(?:File|Image|Datei|Fichier|Archivo):/i, '')
    .replace(/\.(?:jpe?g|png|webp|gif|avif|heic|bmp|mp4|webm|mov|mkv|mp3|m4a|ogg|opus|wav|flac)$/i, '')
    .replace(/[\s:;,.!?…\-–—]+$/u, '')
    .trim()
  return cleaned || undefined
}

// Groups `gallery-dl -j` output of a search or tag page into one result per post.
export const parseGallerySearchResults = (output: string, max = 30): PostResult[] => {
  const messages = readJsonArray(output) || []
  const posts = new Map<string, PostResult>()
  for (const message of messages) {
    if (!Array.isArray(message) || posts.size >= max) continue
    const [type, url, meta = {}] = message
    if (type !== 3 && type !== 6) continue
    const postUrl = type === 6 && typeof url === 'string' ? url : postUrlFromMeta(meta)
    if (!postUrl) continue
    const existing = posts.get(postUrl)
    const ext = typeof meta.extension === 'string' ? meta.extension : undefined
    const image = type === 3 && typeof url === 'string' && kindFromExtension(ext, url) === 'image' ? url : undefined
    if (existing) {
      existing.thumbnail = existing.thumbnail || image
      continue
    }
    posts.set(postUrl, {
      id: String(meta.post_id ?? meta.tweet_id ?? meta.shortcode ?? meta.id ?? postUrl),
      url: postUrl,
      title: shorten(textField(meta, ['title', 'description', 'content', 'text', 'caption']), 100),
      thumbnail: image || textField(meta, ['thumbnail', 'display_url']),
      uploader: textField(meta, ['author.name', 'author.nick', 'user.name', 'username', 'owner.username', 'author']),
    })
  }
  return [...posts.values()]
}

export interface SniffedMedia {
  url: string
  kind: MediaKind
  // Bytes from Content-Length when the network saw the response.
  bytes?: number
  width?: number
  height?: number
  duration?: number
  // Declared by the page as its main media (og:video, og:image, the playing <video>).
  declared?: boolean
  visibleArea?: number
}

// Too small, decorative or tracking images are never the page's media.
const isDecorativeImage = (item: SniffedMedia): boolean => {
  if (/\.svg(?:[?#]|$)|sprite|favicon|avatar|logo|icon|emoji|pixel|1x1|spacer|badge/i.test(item.url)) return true
  if (item.width && item.height && (item.width < 300 || item.height < 200)) return true
  if (!item.width && item.bytes !== undefined && item.bytes < 25_000) return true
  return false
}

// One main item per page: a real video wins over images; among images the
// page's declared image (og:image) or the largest visible one. Ads, avatars
// and thumbnails of other videos are left out on purpose.
export const pickMainMedia = (candidates: SniffedMedia[]): SniffedMedia | undefined => {
  const videos = candidates.filter((item) => item.kind === 'video' && !/\b(?:ad|ads|preroll|vast)\b/i.test(item.url))
  const meaningfulVideos = videos.filter((item) => (
    item.declared
    || (item.duration ?? 0) > 5
    || (item.bytes ?? 0) > 500_000
    || /\.(?:m3u8|mpd)(?:[?#]|$)/i.test(item.url)
  ))
  if (meaningfulVideos.length > 0) {
    return [...meaningfulVideos].sort((a, b) => (
      Number(Boolean(b.declared)) - Number(Boolean(a.declared))
      || Number(/\.(?:m3u8|mpd)/i.test(b.url)) - Number(/\.(?:m3u8|mpd)/i.test(a.url))
      || (b.duration ?? 0) - (a.duration ?? 0)
      || (b.bytes ?? 0) - (a.bytes ?? 0)
    ))[0]
  }

  const images = candidates.filter((item) => item.kind === 'image' && !isDecorativeImage(item))
  if (images.length === 0) return undefined
  const area = (item: SniffedMedia) => item.visibleArea ?? ((item.width ?? 0) * (item.height ?? 0))
  return [...images].sort((a, b) => (
    Number(Boolean(b.declared)) - Number(Boolean(a.declared))
    || area(b) - area(a)
    || (b.bytes ?? 0) - (a.bytes ?? 0)
  ))[0]
}

export const mediaKindForUrl = (value: string, contentType?: string): MediaKind | undefined => {
  const type = (contentType || '').toLowerCase()
  if (type.startsWith('video/') || /mpegurl|dash\+xml/.test(type)) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('image/')) return 'image'
  return kindFromExtension(undefined, value)
}
