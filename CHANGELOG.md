# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [1.1.0] - 2026-10-31

### Added

- Images, carousels and other media, not just video. Fetching a link detects what it holds: a video shows qualities, an audio-only link shows audio options, a single image shows its size and format, and a post with several items (Instagram, X, TikTok photo posts, Reddit, Bluesky, Pinterest, Imgur, Tumblr, Flickr and more) shows them as a grid to pick from. All items start selected, and the selection downloads as one queue entry.
- A bundled, checksum-verified gallery-dl reads image posts and galleries that yt-dlp does not.
- Links that neither engine knows are opened in a hidden, sandboxed window to find the page's main video or image; other videos, thumbnails and ads on the page are left out.
- Requests a site blocks are retried once with browser impersonation.
- Import cookies exported from a browser profile (cookies.txt or JSON from a cookie extension) in Settings → Account, or from the prompt on Home when a post needs an account. Each site in the file replaces that site's earlier cookies, so sites signed in on different Chrome profiles can each be imported from their own profile, and each site's cookies are sent only to that site. Settings lists the saved sites with a remove button for each.
- When a site still asks for an account although its cookies were imported, Home and Search say the cookies have expired and offer to import them again.
- The app updates itself on Windows and Linux (AppImage): Update in Info downloads the new version in the background, checked against the release's sha512, and installs it on restart or the next time the app closes. Settings and history are kept. macOS still opens the download page, because in-place updates there need a signed app.
- yt-dlp and gallery-dl update themselves from their official releases, so a site change no longer waits for an app release. System shows each engine's version and has an Update engines button; the automatic check runs at most once a day and can be turned off there. Each download is checked against the release's SHA-256 list and must start and report the expected version before it is used.
- Search covers SoundCloud, Bilibili and Niconico next to YouTube, plus Instagram hashtags and X, Reddit, Bluesky and Pinterest posts. Search opens on the site of the link on Home, and other sites get an experimental "this site" search that uses their own search page.
- A download queue: at most three downloads run at once by default (Settings → Downloads → Parallel downloads), and the rest show as "Queued". Playlists and multi-select search no longer start every video together.
- Open file and Show in folder (with the file selected) on finished downloads in Home, Downloads and History.
- Paste a link with Ctrl+V on any screen, or drop it anywhere in the window, to open its preview on Home.
- Audio can be saved as MP3 or in its original format without conversion, which shows its exact size.
- The taskbar shows overall download progress on Windows.
- The format panel warns when a link is already in History and says when and in what format it was saved.

### Changed

- Updated the bundled yt-dlp to 2026.10.26 and gallery-dl to 1.32.19.
- Home is now one panel: the link bar, then the video preview and format options under it. The intro text, the Active/Completed counters, the format pop-up and the Quick video/Quick audio/Thumbnail/Screenshot buttons are gone; Search stays.
- Quality options read "1080p · 255 MB · MP4" without the FHD/HD and Mobile labels. Photo offers Thumbnail or Frame, and Frame shows the time read from the link.
- Save location and Turbo for one download are icon buttons next to the Download button, and Turbo settings moved to Settings → Advanced.
- Progress is one bar across the video and audio streams of a download instead of restarting at 0% for the audio, and Home shows the total speed.
- Downloads lists only running, queued, paused and failed items; finished files are in History. Home shows the three most recent with "See all".
- History shows each file's real format and size instead of always "MP3" for audio.
- Audio downloads now pick the same audio stream the size estimate uses.

- Video downloads now prefer plain HTTPS streams over HLS at the same resolution, which is much faster on YouTube.
- HLS and DASH streams now fetch four fragments at a time by default, and fragment retries back off instead of retrying immediately.
- The format selector now shows the exact size and container of what each quality will download, from the same format selection the download uses. Estimates are marked with `~`.
- Completed downloads show the saved file's real size and container.
- Removed duplicate paste and Download controls from the home screen.
- Download progress refreshes four times per second instead of every frame, which cuts re-rendering.

### Fixed

- Choosing Chrome, Edge or another Chromium browser for cookies on Windows silently failed: those browsers now lock and encrypt their cookies so no other app can read them. Settings now says so and points to importing cookies.
- History kept only one YouTube download: every youtube.com link got the same history ID, so each download replaced the last.
- Files with `.part` in their title are no longer deleted during finalization, and a download with no output file now reports an error instead of success.
- Successful photo downloads no longer show "Download did not start".
- Retry and Boost keep the original title and file name template, so they continue from partial files.
- Pause and cancel now work during source detection and retry countdowns.
- Restarting a download no longer loses track of its process.
- The download queue is now saved while downloads are running.
- The remove button on failed downloads works and deletes their partial files.
- YouTube storyboard images are no longer offered as video qualities (such as 27p or 90p).
- The audio option now describes the MP3 conversion accurately, queued items show "Preparing…", and view counts and upload dates display correctly.

## [1.0.1] - 2026-10-18

### Changed

- Updated the bundled yt-dlp runtime to 2026.08.19.

### Fixed

- Decoded yt-dlp's base64 `--dump-pages` output so the browser-cookie page fallback can find media on gated pages again.

## [1.0.0] - 2026-08-01

### Added

- Cross-platform desktop downloads for video, audio, thumbnails, timestamp screenshots, and playlists.
- Quality and format selection with estimated sizes, persistent queues, retry controls, and download history.
- Fast staged media previews that show immediate URL details while provider metadata and full format information load in the background.
- Browser-cookie support for media the user is authorized to access.
- A checksum-verified bundled yt-dlp runtime with an included JavaScript runtime and graceful no-FFmpeg fallbacks.
- Native monochrome light and dark themes, a dedicated application icon, and localized interfaces in ten languages.
- First-run system checks, update notifications, release QA documentation, and automated installer builds for Windows, macOS, and Linux.

### Fixed

- Kept the Downloads list and home-page recent history synchronized when history entries are removed or cleared.
- Made history titles and thumbnails open their original media pages in the system browser.
- Replaced Electron's default application and notification icons with the Desktop Media Downloader identity.
- Hardened media extraction, format selection, progress reporting, cancellation, and error recovery.
