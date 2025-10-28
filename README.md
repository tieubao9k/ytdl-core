# ytdl-core-enhanced

Stable YouTube downloader using Android InnerTube client with automatic signature decoding.

## Features

- ✅ **Android InnerTube Client** - Reliable format extraction using YouTube's official Android API
- ✅ **Automatic Signature Decoding** - Handles encrypted format URLs transparently
- ✅ **Restricted Videos** - Download age-restricted and region-locked videos with cookies
- ✅ **Multi-threading** - Fast parallel downloads with multiple connections
- ✅ **100% API Compatible** - Drop-in replacement for ytdl-core
- ✅ **Production Ready** - Stable and tested with YouTube 2025

## Installation

```bash
npm install ytdl-core-enhanced
```

## Quick Start

### Basic Download

```javascript
const ytdl = require('ytdl-core-enhanced');
const fs = require('fs');

ytdl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  .pipe(fs.createWriteStream('video.mp4'));
```

### Download with Quality Selection

```javascript
const ytdl = require('ytdl-core-enhanced');
const fs = require('fs');

// Highest quality
ytdl('VIDEO_URL', { quality: 'highest' })
  .pipe(fs.createWriteStream('video.mp4'));

// Specific format (1080p video)
ytdl('VIDEO_URL', { quality: 137 })
  .pipe(fs.createWriteStream('video-1080p.mp4'));

// Audio only
ytdl('VIDEO_URL', { filter: 'audioonly' })
  .pipe(fs.createWriteStream('audio.m4a'));
```

### Get Video Info

```javascript
const ytdl = require('ytdl-core-enhanced');

ytdl.getInfo('VIDEO_URL').then(info => {
  console.log('Title:', info.videoDetails.title);
  console.log('Author:', info.videoDetails.author.name);
  console.log('Duration:', info.videoDetails.lengthSeconds, 'seconds');
  console.log('Formats:', info.formats.length);
});
```

## Downloading Restricted Videos

For age-restricted, region-locked, or member-only videos, you need to provide YouTube cookies from a logged-in account.

### Method 1: Using Cookie Editor Extension (Recommended)

1. Install [Cookie-Editor](https://cookie-editor.com/) extension for your browser:
   - [Chrome/Edge](https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)
   - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/cookie-editor/)

2. Go to [YouTube](https://www.youtube.com) and log in to your account

3. Click the Cookie-Editor extension icon

4. Click "Export" → "Header String" (this copies cookie string to clipboard)

5. Use the cookie string in your code:

```javascript
const ytdl = require('ytdl-core-enhanced');
const fs = require('fs');

const cookieString = 'PASTE_YOUR_COOKIE_STRING_HERE';

ytdl('VIDEO_URL', {
  requestOptions: {
    headers: {
      'Cookie': cookieString
    }
  }
}).pipe(fs.createWriteStream('video.mp4'));
```

### Method 2: Save Cookie to File

```javascript
const ytdl = require('ytdl-core-enhanced');
const fs = require('fs');

// Save your cookie string to a file
fs.writeFileSync('.youtube-cookies.txt', 'YOUR_COOKIE_STRING');

// Read and use it
const cookieString = fs.readFileSync('.youtube-cookies.txt', 'utf8');

ytdl('VIDEO_URL', {
  requestOptions: {
    headers: {
      'Cookie': cookieString
    }
  }
}).pipe(fs.createWriteStream('video.mp4'));
```

### Important Cookie Notes

⚠️ **Security Warning**: Cookie strings contain your authentication tokens. Treat them like passwords:
- Never commit cookies to git repositories
- Add `.youtube-cookies.txt` to your `.gitignore`
- Regenerate cookies if accidentally exposed (logout and login again)

💡 **Cookie Lifespan**: YouTube cookies typically last 1-2 weeks. If downloads start failing with 403 errors, refresh your cookies.

## API Reference

### ytdl(url, [options])

Downloads a video from YouTube.

**Parameters:**
- `url` (string): Video URL or video ID
- `options` (object): Download options

**Options:**
- `quality`: Quality preference (default: 'highest')
  - `'highest'` - Best quality
  - `'lowest'` - Lowest quality
  - `'highestaudio'` - Best audio quality
  - `'lowestaudio'` - Lowest audio quality
  - Number (itag) - Specific format (e.g., 137 for 1080p)

- `filter`: Format filter function or preset
  - `'audioonly'` - Audio only
  - `'videoonly'` - Video only (no audio)
  - `'audioandvideo'` - Combined video+audio
  - Function - Custom filter `(format) => boolean`

- `requestOptions`: HTTP request options
  - `headers`: Custom headers (e.g., cookies)

**Returns:** ReadableStream

**Example:**
```javascript
ytdl('dQw4w9WgXcQ', {
  quality: 'highest',
  filter: 'audioandvideo',
  requestOptions: {
    headers: {
      'Cookie': cookieString
    }
  }
}).pipe(fs.createWriteStream('video.mp4'));
```

### ytdl.getInfo(url, [options])

Gets video information without downloading.

**Parameters:**
- `url` (string): Video URL or video ID
- `options` (object): Options (same as ytdl)

**Returns:** Promise<Object>

**Response Object:**
```javascript
{
  videoDetails: {
    title: string,
    author: { name: string },
    lengthSeconds: number,
    viewCount: number,
    ...
  },
  formats: [
    {
      itag: number,
      url: string,
      qualityLabel: string,
      container: string,
      hasVideo: boolean,
      hasAudio: boolean,
      ...
    }
  ]
}
```

## Common Format ITAGs

### Video + Audio (Progressive)
- **18**: 360p MP4
- **22**: 720p MP4 (not always available)

### Video Only (Adaptive)
- **137**: 1080p MP4
- **136**: 720p MP4
- **135**: 480p MP4
- **134**: 360p MP4

### Audio Only (Adaptive)
- **139**: 48kbps M4A (lowest)
- **140**: 128kbps M4A (medium)
- **251**: 160kbps WEBM (highest)

## Events

The download stream emits standard Node.js stream events:

```javascript
const video = ytdl('VIDEO_URL');

video.on('info', (info, format) => {
  console.log('Downloading:', info.videoDetails.title);
  console.log('Format:', format.qualityLabel);
});

video.on('data', (chunk) => {
  console.log('Received', chunk.length, 'bytes');
});

video.on('end', () => {
  console.log('Download complete!');
});

video.on('error', (error) => {
  console.error('Error:', error.message);
});

video.pipe(fs.createWriteStream('video.mp4'));
```

## Troubleshooting

### 403 Forbidden Error

**Problem**: Download fails with HTTP 403 error

**Solutions**:
1. Add cookies from a logged-in YouTube account (see "Downloading Restricted Videos")
2. Check if video is region-locked or requires login
3. Refresh your cookies if they expired

### Format Not Found

**Problem**: Requested format/quality not available

**Solution**: Check available formats first:
```javascript
ytdl.getInfo('VIDEO_URL').then(info => {
  console.log('Available formats:');
  info.formats.forEach(format => {
    console.log(`${format.itag}: ${format.qualityLabel} (${format.container})`);
  });
});
```

### Video Unavailable

**Problem**: "Video is unavailable" error

**Possible Reasons**:
- Video is private or deleted
- Video is region-locked (try with cookies from matching region)
- Video is live stream that ended
- Video is members-only (requires membership cookies)

## Advanced Usage

### Custom Filter Function

```javascript
ytdl('VIDEO_URL', {
  filter: format => {
    return format.container === 'mp4' &&
           format.hasAudio &&
           format.qualityLabel === '720p';
  }
}).pipe(fs.createWriteStream('video.mp4'));
```

### Download Progress Tracking

```javascript
const ytdl = require('ytdl-core-enhanced');
const fs = require('fs');

ytdl.getInfo('VIDEO_URL').then(info => {
  const format = ytdl.chooseFormat(info.formats, { quality: 'highest' });
  const video = ytdl.downloadFromInfo(info, { format });

  let downloaded = 0;
  const total = parseInt(format.contentLength);

  video.on('data', chunk => {
    downloaded += chunk.length;
    const percent = ((downloaded / total) * 100).toFixed(2);
    console.log(`Progress: ${percent}%`);
  });

  video.pipe(fs.createWriteStream('video.mp4'));
});
```

## Differences from ytdl-core

This package is designed as a drop-in replacement for `ytdl-core` with these improvements:

✅ **API Compatible** - Same API as ytdl-core, just change the require statement
✅ **More Reliable** - Uses Android InnerTube client which works consistently
✅ **Simpler** - Removed complex multi-client fallback logic
✅ **Cleaner** - No browser automation or anti-bot detection needed

### Migration from ytdl-core

```javascript
// Before
const ytdl = require('ytdl-core');

// After
const ytdl = require('ytdl-core-enhanced');

// All your existing code works unchanged!
```

## Contributing

Issues and pull requests are welcome at [GitHub](https://github.com/tieubao9k/ytdl-core).

## License

MIT

## Credits

- Original [ytdl-core](https://github.com/fent/ytdl-core) by fent
- Android InnerTube client implementation by [Satoru FX](https://github.com/tieubao9k)
- Maintained by [Satoru FX](https://github.com/tieubao9k)
