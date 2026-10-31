import { describe, expect, it } from 'vitest'
import { baseDomainOf, parseCookieExport, summarizeCookieSites } from './site-cookies'

const NOW = 1_800_000_000

describe('parseCookieExport', () => {
  it('reads Netscape cookies.txt, including HttpOnly lines and tabs in values', () => {
    const text = [
      '# Netscape HTTP Cookie File',
      '',
      `.instagram.com\tTRUE\t/\tTRUE\t${NOW + 3600}\tsessionid\tabc`,
      `#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t${NOW + 3600}\tcsrftoken\tx\ty`,
      `www.instagram.com\tFALSE\t/\tFALSE\t0\tig_nrcb\t1`,
      `.instagram.com\tTRUE\t/\tTRUE\t${NOW - 10}\told\tgone`,
      'not a cookie line',
    ].join('\r\n')
    const cookies = parseCookieExport(text, NOW)
    expect(cookies.map((cookie) => cookie.name)).toEqual(['sessionid', 'csrftoken', 'ig_nrcb'])
    expect(cookies[1]).toMatchObject({ httpOnly: true, value: 'x\ty', hostOnly: false })
    expect(cookies[2]).toMatchObject({ hostOnly: true, expires: undefined, secure: false })
  })

  it('reads JSON exports from cookie editor extensions', () => {
    const cookies = parseCookieExport(JSON.stringify([
      { domain: '.x.com', name: 'auth_token', value: 't', path: '/', secure: true, httpOnly: true, hostOnly: false, expirationDate: NOW + 100.5 },
      { domain: 'x.com', name: 'lang', value: 'en', hostOnly: true },
      { domain: 'bad domain', name: 'n', value: 'v' },
    ]), NOW)
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toMatchObject({ domain: '.x.com', secure: true, httpOnly: true, expires: NOW + 101 })
    expect(cookies[1]).toMatchObject({ hostOnly: true, expires: undefined })
  })

  it('returns nothing for unrelated files', () => {
    expect(parseCookieExport('hello world', NOW)).toEqual([])
    expect(parseCookieExport('{broken', NOW)).toEqual([])
  })
})

describe('summarizeCookieSites', () => {
  it('groups subdomains under their site', () => {
    const cookies = parseCookieExport([
      `.instagram.com\tTRUE\t/\tTRUE\t0\ta\t1`,
      `www.instagram.com\tFALSE\t/\tTRUE\t0\tb\t1`,
      `.x.com\tTRUE\t/\tTRUE\t0\tc\t1`,
    ].join('\n'), NOW)
    expect(summarizeCookieSites(cookies)).toEqual([{ site: 'instagram.com', count: 2 }, { site: 'x.com', count: 1 }])
    expect(baseDomainOf('.bbc.co.uk')).toBe('bbc.co.uk')
  })
})
