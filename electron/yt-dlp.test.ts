import { describe, expect, it } from 'vitest'
import {
  buildVideoFormatSelector,
  buildYtDlpArgs,
  classifyDownloadFailure,
  decodeDumpedPages,
  getNetworkRetryArgs,
  getVideoFormatSortArgs,
  getYtDlpRuntimeConfig,
  isStagedTempFile,
  normalizeHttpUrl,
  parseYtDlpProgress,
  createProgressAggregator,
  readProgressRecord,
} from './yt-dlp'

describe('download arguments', () => {
  it('ranks protocol above bitrate so HTTPS beats HLS at the same resolution', () => {
    const [flag, sort] = getVideoFormatSortArgs()

    expect(flag).toBe('-S')
    expect(sort.split(',')).toEqual(['res', 'proto', 'br'])
  })

  it('backs off between fragment retries as well as HTTP retries', () => {
    const args = getNetworkRetryArgs()
    const retrySleeps = args.filter((_, index) => args[index - 1] === '--retry-sleep')

    expect(retrySleeps).toEqual(['3', 'fragment:exp=1:20'])
  })
})

describe('staged file detection', () => {
  it.each([
    'abc_Title.mp4.part',
    'abc_Title.f299.mp4.part',
    'abc_Title.f312.mp4.part-Frag12',
    'abc_Title.f312.mp4.part-Frag12.part',
    'abc_Title.mp4.ytdl',
    'abc_Title.temp',
    'abc_Title.TMP',
  ])('treats %s as temporary', (name) => {
    expect(isStagedTempFile(name)).toBe(true)
  })

  it.each([
    'abc_Movie.Part 2.mp4',
    'abc_Movie.part1.mkv',
    'abc_counterpart.mp4',
    'abc_Lecture.part.mp4',
  ])('keeps %s', (name) => {
    expect(isStagedTempFile(name)).toBe(false)
  })
})

describe('yt-dlp runtime configuration', () => {
  it('enables the embedded Node runtime when it can run YouTube challenges', () => {
    const runtime = getYtDlpRuntimeConfig({
      executablePath: 'C:\\Program Files\\Desktop Media Downloader\\desktop-media-downloader.exe',
      nodeVersion: '24.4.0',
      isElectron: true,
    })

    expect(runtime.args).toEqual([
      '--js-runtimes',
      'node:C:\\Program Files\\Desktop Media Downloader\\desktop-media-downloader.exe',
    ])
    expect(runtime.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
  })

  it('does not advertise an unsupported Node runtime', () => {
    const runtime = getYtDlpRuntimeConfig({
      executablePath: '/opt/desktop-media-downloader',
      nodeVersion: '20.18.0',
      isElectron: true,
    })

    expect(runtime.args).toEqual([])
    expect(runtime.env).toEqual({})
  })

  it('isolates downloads from user yt-dlp configuration', () => {
    const args = buildYtDlpArgs(['--version'], {
      executablePath: '/usr/bin/node',
      nodeVersion: '20.18.0',
      isElectron: false,
    })

    expect(args).toEqual(['--ignore-config', '--no-colors', '--version'])
  })
})

describe('video format selection', () => {
  it('uses separate best streams when ffmpeg is available', () => {
    expect(buildVideoFormatSelector({ quality: '1080', ffmpegAvailable: true }))
      .toBe('bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b')
  })

  it('uses a combined stream when ffmpeg is unavailable', () => {
    expect(buildVideoFormatSelector({ quality: '720', ffmpegAvailable: false }))
      .toBe('b[height<=720]/b')
    expect(buildVideoFormatSelector({ quality: 'best', ffmpegAvailable: false }))
      .toBe('b')
  })

  it('avoids extractor format ladders for direct media', () => {
    expect(buildVideoFormatSelector({ quality: '1080', ffmpegAvailable: true, directMedia: true }))
      .toBe('b')
  })
})

describe('progress parsing', () => {
  it('parses the stable progress template', () => {
    expect(parseYtDlpProgress('desktop-media-progress\t5242880\t10485760\tNA\t1048576\t5\t50.0%')).toEqual({
      progress: 50,
      speed: '1.0 MiB/s',
      eta: '0:05',
    })
  })

  it('ignores incomplete progress records', () => {
    expect(parseYtDlpProgress('desktop-media-progress\t0\tNA\tNA\tNA\tNA\tNA')).toBeNull()
    expect(parseYtDlpProgress('[download] 10%')).toBeNull()
  })

  it('uses yt-dlp reported percent when byte totals are unavailable', () => {
    expect(parseYtDlpProgress('desktop-media-progress\t1024\tNA\tNA\t2048\t4\t12.5%')).toEqual({
      progress: 12.5,
      speed: '2.0 KiB/s',
      eta: '0:04',
    })
  })
})

describe('request validation and errors', () => {
  it('accepts only normalized HTTP media URLs', () => {
    expect(normalizeHttpUrl(' https://youtu.be/jNQXAC9IVRw ')).toBe('https://youtu.be/jNQXAC9IVRw')
    expect(() => normalizeHttpUrl('file:///etc/passwd')).toThrow('Only HTTP and HTTPS')
    expect(() => normalizeHttpUrl('not a url')).toThrow('Enter a valid media URL')
  })

  it('gives actionable YouTube runtime failures', () => {
    const result = classifyDownloadFailure('ERROR: [youtube] No video formats found!', 1)
    expect(result.message).toContain('Node 22+')
  })

  it('preserves a useful extractor error instead of only returning an exit code', () => {
    const result = classifyDownloadFailure('warning\nERROR: This video is private', 1)
    expect(result.message).toBe('This video is private')
  })
})

describe('decodeDumpedPages', () => {
  it('decodes base64 page dumps and ignores log lines', () => {
    const html = '<html><video src="https://example.com/a.mp4"></video></html>'
    const out = `[generic] Extracting URL: https://example.com\n[generic] Dumping request\n${Buffer.from(html).toString('base64')}\n`
    expect(decodeDumpedPages(out)).toBe(html)
  })
})

describe('progress across streams', () => {
  const record = (downloaded: number, total: number, formatId: string, speed = 1048576) =>
    readProgressRecord(`desktop-media-progress\t${downloaded}\t${total}\tNA\t${speed}\t1\tNA\t${formatId}`)!

  it('reads the format id from the progress template', () => {
    expect(record(10, 100, '137').formatId).toBe('137')
  })

  it('continues from the video stream into the audio stream with the expected total', () => {
    const aggregate = createProgressAggregator(1000)
    expect(aggregate(record(900, 900, '137')).progress).toBe(90)
    // The audio stream starts at 0% on its own; overall progress keeps going.
    expect(aggregate(record(0, 100, '140')).progress).toBe(90)
    expect(aggregate(record(50, 100, '140')).progress).toBe(95)
  })

  it('never goes backwards or reaches 100% before the file is finalized', () => {
    const aggregate = createProgressAggregator()
    expect(aggregate(record(100, 100, '137')).progress).toBe(99.9)
    expect(aggregate(record(1, 100, '140')).progress).toBe(99.9)
  })

  it('estimates the remaining time from the bytes left overall', () => {
    const aggregate = createProgressAggregator(10 * 1048576)
    expect(aggregate(record(5 * 1048576, 5 * 1048576, '137', 1048576)).eta).toBe('0:05')
  })
})
