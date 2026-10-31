# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed

- Video downloads now prefer plain HTTPS streams over HLS at the same resolution, which is much faster on YouTube.
- HLS and DASH streams now fetch four fragments at a time by default, and fragment retries back off instead of retrying immediately.
- The format selector now shows the exact size and container of what each quality will download, from the same format selection the download uses. Estimates are marked with `~`.
- Completed downloads show the saved file's real size and container.
- Removed duplicate paste and Download controls from the home screen.
- Download progress refreshes four times per second instead of every frame, which cuts re-rendering.

### Fixed

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
