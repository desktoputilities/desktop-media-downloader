import { describe, expect, it } from 'vitest'
import { classifyEngineError, cleanMediaTitle, mediaKindForUrl, parseGalleryDlJson, parseGallerySearchResults, pickMainMedia, routeForUrl } from './media-resolver'

describe('routeForUrl', () => {
  it('sends single posts to gallery-dl first', () => {
    expect(routeForUrl('https://www.instagram.com/p/C1abcDEF/')).toBe('gallery')
    expect(routeForUrl('https://x.com/user/status/1234567890')).toBe('gallery')
    expect(routeForUrl('https://twitter.com/user/status/1234567890?s=20')).toBe('gallery')
    expect(routeForUrl('https://www.tiktok.com/@someone/photo/7300000000000000000')).toBe('gallery')
    expect(routeForUrl('https://www.reddit.com/r/pics/comments/abc123/title/')).toBe('gallery')
    expect(routeForUrl('https://bsky.app/profile/a.bsky.social/post/3kxyz')).toBe('gallery')
    expect(routeForUrl('https://commons.wikimedia.org/wiki/File:Example.jpg')).toBe('gallery')
  })

  it('keeps video pages and unknown sites on yt-dlp', () => {
    expect(routeForUrl('https://www.instagram.com/reel/C1abcDEF/')).toBe('video')
    expect(routeForUrl('https://www.tiktok.com/@someone/video/7300000000000000000')).toBe('video')
    expect(routeForUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toBe('video')
    expect(routeForUrl('https://example.com/some/page')).toBe('video')
    expect(routeForUrl('not a url')).toBe('video')
  })
})

describe('classifyEngineError', () => {
  it('recognises the common failures of both engines', () => {
    expect(classifyEngineError('ERROR: [Instagram] abc: Requested content is not available, rate-limit reached or login required')).toBe('login')
    expect(classifyEngineError('[instagram][error] HttpError: Redirect to login page')).toBe('login')
    expect(classifyEngineError('ERROR: [twitter] 123: No video could be found in this tweet')).toBe('no-media')
    expect(classifyEngineError('ERROR: Unsupported URL: https://www.tiktok.com/@a/photo/1')).toBe('unsupported')
    expect(classifyEngineError('ERROR: [TikTok] 1: Your IP address is blocked from accessing this post')).toBe('blocked')
    expect(classifyEngineError('HTTP Error 403: Forbidden')).toBe('blocked')
    expect(classifyEngineError('HTTP Error 404: Not Found')).toBe('not-found')
    expect(classifyEngineError('something odd')).toBe('other')
  })
})

describe('parseGalleryDlJson', () => {
  it('reads a carousel with images and a video', () => {
    const output = `[instagram][info] logging line\n${JSON.stringify([
      [2, { category: 'instagram', post_id: '1', description: 'Beach day\nmore text', username: 'alice' }],
      [3, 'https://cdn.example/a.jpg?x=1', { category: 'instagram', post_id: '1', num: 1, extension: 'jpg', width: 1080, height: 1350, description: 'Beach day\nmore text', username: 'alice' }],
      [3, 'https://cdn.example/b.mp4', { category: 'instagram', post_id: '1', num: 2, extension: 'mp4', width: 720, height: 1280 }],
      [3, 'https://cdn.example/c.webp', { category: 'instagram', post_id: '1', num: 3, extension: 'webp' }],
    ])}`
    const result = parseGalleryDlJson(output)
    expect(result.items.map((item) => [item.index, item.kind])).toEqual([[1, 'image'], [2, 'video'], [3, 'image']])
    expect(result.items[0]).toMatchObject({ width: 1080, height: 1350, thumbnail: 'https://cdn.example/a.jpg?x=1' })
    expect(result.title).toBe('Beach day')
    expect(result.uploader).toBe('alice')
    expect(result.isCollection).toBe(false)
  })

  it('keeps gallery-dl indices when Wikimedia revisions are dropped', () => {
    const result = parseGalleryDlJson(JSON.stringify([
      [3, 'https://upload.wikimedia.org/a/ab/Example.jpg', { category: 'wikimedia', extension: 'jpg' }],
      [3, 'https://upload.wikimedia.org/archive/a/ab/2010_Example.jpg', { category: 'wikimedia', extension: 'jpg' }],
    ]))
    expect(result.items).toHaveLength(1)
    expect(result.items[0].index).toBe(1)
  })

  it('marks ytdl: entries as video and profiles as collections', () => {
    const post = parseGalleryDlJson(JSON.stringify([[3, 'ytdl:https://video.twimg.com/x.m3u8', { extension: 'mp4' }]]))
    expect(post.items[0]).toMatchObject({ kind: 'video', ext: 'mp4' })

    const profile = parseGalleryDlJson(JSON.stringify([[6, 'https://bsky.app/profile/a/post/1', {}], [6, 'https://bsky.app/profile/a/post/2', {}]]))
    expect(profile.isCollection).toBe(true)
  })

  it('reports errors and bad output', () => {
    expect(parseGalleryDlJson(JSON.stringify([[-1, { error: 'AuthorizationError', message: 'Login required' }]])).error).toBe('Login required')
    expect(parseGalleryDlJson('not json').error).toBeTruthy()
    expect(parseGalleryDlJson('').items).toEqual([])
  })
})

describe('pickMainMedia', () => {
  it('prefers the page video over images and short clips', () => {
    const main = pickMainMedia([
      { url: 'https://site/hero.jpg', kind: 'image', width: 1920, height: 1080, declared: true },
      { url: 'https://site/hover-preview.mp4', kind: 'video', duration: 2, bytes: 90_000 },
      { url: 'https://site/stream/master.m3u8', kind: 'video' },
    ])
    expect(main?.url).toBe('https://site/stream/master.m3u8')
  })

  it('picks the declared or largest real image and skips decorations', () => {
    expect(pickMainMedia([
      { url: 'https://site/logo.png', kind: 'image', width: 2000, height: 2000 },
      { url: 'https://site/thumb.jpg', kind: 'image', width: 120, height: 90 },
      { url: 'https://site/photo.jpg', kind: 'image', width: 1600, height: 1200 },
      { url: 'https://site/other.jpg', kind: 'image', width: 800, height: 600 },
    ])?.url).toBe('https://site/photo.jpg')
    expect(pickMainMedia([{ url: 'https://site/icon.svg', kind: 'image' }])).toBeUndefined()
  })
})

describe('parseGallerySearchResults', () => {
  it('makes one result per post with its first image', () => {
    const results = parseGallerySearchResults(JSON.stringify([
      [3, 'https://cdn/a1.jpg', { category: 'instagram', shortcode: 'AAA', extension: 'jpg', description: 'First', username: 'alice' }],
      [3, 'https://cdn/a2.jpg', { category: 'instagram', shortcode: 'AAA', extension: 'jpg' }],
      [3, 'https://cdn/b1.mp4', { category: 'twitter', tweet_id: 42, author: { name: 'bob' }, extension: 'mp4' }],
      [6, 'https://bsky.app/profile/c/post/1', {}],
    ]))
    expect(results.map((result) => result.url)).toEqual([
      'https://www.instagram.com/p/AAA/',
      'https://x.com/bob/status/42',
      'https://bsky.app/profile/c/post/1',
    ])
    expect(results[0]).toMatchObject({ title: 'First', thumbnail: 'https://cdn/a1.jpg', uploader: 'alice' })
    expect(results[1].thumbnail).toBeUndefined()
  })
})

describe('cleanMediaTitle', () => {
  it('drops page prefixes, extensions and trailing punctuation', () => {
    expect(cleanMediaTitle('File:Example.jpg')).toBe('Example')
    expect(cleanMediaTitle('Gravestone reading:')).toBe('Gravestone reading')
    expect(cleanMediaTitle('Trip to the coast…')).toBe('Trip to the coast')
    expect(cleanMediaTitle('...')).toBeUndefined()
  })

  it('links Bluesky search hits to their post', () => {
    const [hit] = parseGallerySearchResults(JSON.stringify([
      [3, 'https://cdn.bsky.app/img/a.jpg', { category: 'bluesky', post_id: '3abc', author: { handle: 'a.bsky.social' }, extension: 'jpg' }],
    ]))
    expect(hit.url).toBe('https://bsky.app/profile/a.bsky.social/post/3abc')
  })
})

describe('mediaKindForUrl', () => {
  it('uses the content type, then the extension', () => {
    expect(mediaKindForUrl('https://a/x', 'application/vnd.apple.mpegurl')).toBe('video')
    expect(mediaKindForUrl('https://a/x', 'image/jpeg')).toBe('image')
    expect(mediaKindForUrl('https://a/song.mp3?sig=1')).toBe('audio')
    expect(mediaKindForUrl('https://a/page.html')).toBeUndefined()
  })
})
