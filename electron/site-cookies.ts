// Reads cookie exports made in the user's own browser (Chrome on Windows
// does not let other apps read its cookies). Kept free of Electron so it can
// be unit-tested.

export interface ImportedCookie {
  domain: string
  hostOnly: boolean
  path: string
  secure: boolean
  httpOnly: boolean
  // Seconds since the epoch; undefined for session cookies.
  expires?: number
  name: string
  value: string
}

// "www.instagram.com" and ".instagram.com" both belong to "instagram.com".
export const baseDomainOf = (domain: string): string => {
  const parts = domain.replace(/^\./, '').toLowerCase().split('.').filter(Boolean)
  // Keep three labels for two-part public suffixes such as co.uk or com.br.
  const twoPartSuffix = parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length === 2
  return parts.slice(twoPartSuffix ? -3 : -2).join('.')
}

const isValidDomain = (domain: string) => /^\.?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(domain)

// Netscape cookies.txt: domain, include-subdomains, path, secure, expiry, name, value.
const parseNetscape = (text: string): ImportedCookie[] => {
  const cookies: ImportedCookie[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine
    let httpOnly = false
    if (line.startsWith('#HttpOnly_')) {
      httpOnly = true
      line = line.slice('#HttpOnly_'.length)
    } else if (!line.trim() || line.startsWith('#')) {
      continue
    }
    const fields = line.split('\t')
    if (fields.length < 7) continue
    const [domain, includeSubdomains, path, secure, expiry, name, ...rest] = fields
    if (!isValidDomain(domain) || !name) continue
    const expires = Number(expiry)
    cookies.push({
      domain: domain.toLowerCase(),
      hostOnly: includeSubdomains.toUpperCase() !== 'TRUE' && !domain.startsWith('.'),
      path: path || '/',
      secure: secure.toUpperCase() === 'TRUE',
      httpOnly,
      expires: Number.isFinite(expires) && expires > 0 ? expires : undefined,
      name,
      value: rest.join('\t'),
    })
  }
  return cookies
}

// JSON exports (EditThisCookie, Cookie-Editor and similar): an array of cookie objects.
const parseJson = (text: string): ImportedCookie[] => {
  const data = JSON.parse(text)
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.cookies) ? data.cookies : []
  return list.flatMap((item) => {
    const domain = String(item?.domain || '').toLowerCase()
    if (!isValidDomain(domain) || !item?.name) return []
    const expires = Number(item.expirationDate ?? item.expires ?? item.expiry)
    return [{
      domain,
      hostOnly: item.hostOnly === true || (item.hostOnly === undefined && !domain.startsWith('.')),
      path: String(item.path || '/'),
      secure: Boolean(item.secure),
      httpOnly: Boolean(item.httpOnly),
      expires: Number.isFinite(expires) && expires > 0 ? Math.round(expires) : undefined,
      name: String(item.name),
      value: String(item.value ?? ''),
    }]
  })
}

export const parseCookieExport = (text: string, nowSeconds = Date.now() / 1000): ImportedCookie[] => {
  const trimmed = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim()
  let cookies: ImportedCookie[] = []
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      cookies = parseJson(trimmed)
    } catch {
      cookies = []
    }
  } else {
    cookies = parseNetscape(trimmed)
  }
  // Expired cookies are useless and would only replace live ones.
  return cookies.filter((cookie) => cookie.expires === undefined || cookie.expires > nowSeconds)
}

// Sites in an export with how many cookies each has, largest first.
export const summarizeCookieSites = (cookies: ImportedCookie[]): Array<{ site: string; count: number }> => {
  const counts = new Map<string, number>()
  for (const cookie of cookies) {
    const site = baseDomainOf(cookie.domain)
    counts.set(site, (counts.get(site) || 0) + 1)
  }
  return [...counts.entries()].map(([site, count]) => ({ site, count })).sort((a, b) => b.count - a.count)
}
