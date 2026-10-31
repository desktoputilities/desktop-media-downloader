# Third-Party Notices

This repository code is MIT-licensed (see `LICENSE`).

The app may use third-party tools at runtime and packaging time. If you redistribute those tools, you are responsible for meeting their license obligations.

## Runtime/Packaging Tools

- Official `yt-dlp` standalone builds: downloader/extractor backend. These builds include GPLv3+ components and embed notices for their bundled dependencies. Corresponding source is available from the pinned release tag at https://github.com/yt-dlp/yt-dlp/releases.
- Official `gallery-dl` standalone builds (GPLv2): image and gallery extractor backend for posts, carousels and image hosts. The standalone builds embed their Python dependencies, including yt-dlp. Corresponding source is available from the pinned release tag at https://codeberg.org/mikf/gallery-dl/releases (mirrored at https://github.com/mikf/gallery-dl).
- `ffmpeg` (LGPL 2.1+ by default, GPL if built/configured with GPL components): media conversion/merge support.

## Distribution Guidance

- A checksum-verified official `yt-dlp` standalone binary is bundled with each installer. Preserve this notice and the corresponding source link when redistributing Desktop Media Downloader.
- Windows and Linux installers also bundle a checksum-verified official `gallery-dl` standalone binary; the same applies. macOS builds use a `gallery-dl` installed on PATH when present.
- If you bundle another helper binary such as `ffmpeg`, include the required license texts, attributions, and source-offer requirements.
- Re-check obligations before each release.
- Verify license terms of the exact binary build you distribute (especially for `ffmpeg`).

## Trademarks

Platform/product names used in the app are property of their respective owners and do not imply affiliation or endorsement.
