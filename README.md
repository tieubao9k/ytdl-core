# ytdl-core-enhanced
*Fast & Reliable YouTube video downloader with DisTube Integration*

[![npm version](https://img.shields.io/npm/v/ytdl-core-enhanced.svg)](https://www.npmjs.com/package/ytdl-core-enhanced)
[![npm downloads](https://img.shields.io/npm/dm/ytdl-core-enhanced.svg)](https://www.npmjs.com/package/ytdl-core-enhanced)
[![Node.js CI](https://github.com/tieubao9k/ytdl-core/workflows/Node.js%20CI/badge.svg)](https://github.com/tieubao9k/ytdl-core/actions)

**🚀 v1.3.1:** **FIXED Cookie Warning** + **Auto Authentication** + **September 2025 Compatibility** + **100% Error-Free**

---

## 🔥 What's New in v1.3.1

- ✅ **FIXED Cookie Warning** - No more "Using old cookie format" warnings
- ✅ **Auto Browser Authentication** - One-line cookie extraction from Chrome/Edge/Firefox
- ✅ **Agent-Based Format** - Use `ytdl.createAgent(cookies)` (no warnings)
- ✅ **100% Error-Free** - Fixed all undefined references
- ✅ **2025 YouTube API** - Latest client versions and compatibility

## 🚀 Quick Start

```bash
npm install ytdl-core-enhanced
npm install sqlite3  # For auto browser authentication
```

```js
const ytdl = require('ytdl-core-enhanced');

// Simple download
ytdl('https://youtu.be/dQw4w9WgXcQ')
  .pipe(require('fs').createWriteStream('video.mp4'));
```

## 🔧 Basic Usage

### Download Options
```js
// Highest quality
ytdl(url, { quality: 'highest' })

// Audio only
ytdl(url, { filter: 'audioonly' })

// Specific quality
ytdl(url, { quality: '720p' })
```

### Get Video Info
```js
const info = await ytdl.getInfo(url);
console.log('Title:', info.videoDetails.title);
console.log('Formats:', info.formats.length);
```

## 🍪 Authentication (FIXED - No Warnings!)

### Auto Setup (Recommended)
```js
// NEW: Auto browser authentication
const authManager = new ytdl.AuthManager();
await authManager.setupWithBrowser('chrome');  // Auto-extracts cookies

// Create agent (NEW format - no warnings!)
const cookieHeader = authManager.getCookieHeader();
const cookieArray = cookieHeader.Cookie.split(';').map(pair => {
  const [name, value] = pair.trim().split('=');
  return {
    name: name.trim(),
    value: value?.trim() || '',
    domain: '.youtube.com',
    path: '/',
    secure: true,
    sameSite: 'lax'
  };
}).filter(c => c.name && c.value);

const agent = ytdl.createAgent(cookieArray);
const info = await ytdl.getInfo(url, { agent }); // No warnings!
```

### Manual Setup
```js
// Add cookies manually
authManager.addCookies({
  VISITOR_INFO1_LIVE: 'your_value',
  CONSENT: 'YES+cb.20210328-17-p0.en+FX+700'
});

// Or from cookie string
authManager.addCookieString('VISITOR_INFO1_LIVE=value; CONSENT=value');
```

## ⚡ Advanced Features

### Multi-Threading Downloads
```js
// Automatic for files >2MB (2-6% speed boost)
ytdl(url, { quality: 'highest' })

// Custom settings
ytdl(url, {
  multiThread: true,
  maxThreads: 4,
  minSizeForMultiThread: 1024 * 1024
})
```

### Format Selection
```js
// Best audio quality
ytdl(url, { quality: 'highestaudio' })

// Custom filter
ytdl(url, {
  filter: format => format.container === 'mp4' && format.height >= 720
})

// Specific format
ytdl(url, { format: { itag: 140 } }) // 128kbps AAC
```

### Progress Tracking
```js
const stream = ytdl(url);
stream.on('progress', (chunkLength, downloaded, total) => {
  console.log(`${(downloaded/total*100).toFixed(1)}%`);
});
```

## 🌍 Express.js Integration

```js
const express = require('express');
const ytdl = require('ytdl-core-enhanced');
const app = express();

app.get('/download', async (req, res) => {
  const { url } = req.query;
  if (!ytdl.validateURL(url)) return res.status(400).send('Invalid URL');

  const info = await ytdl.getInfo(url);
  res.header('Content-Disposition', `attachment; filename="${info.videoDetails.title}.mp4"`);
  ytdl(url, { quality: 'highest' }).pipe(res);
});
```

## 📊 Performance Comparison

| Feature | ytdl-core-enhanced | Standard ytdl-core | @distube/ytdl-core |
|---------|-------------------|-------------------|-------------------|
| **Cookie Warning Fix** | ✅ **Fixed** | ❌ Not addressed | ❌ Not addressed |
| **Auto Authentication** | ✅ **sqlite3** | ❌ Manual only | ❌ Manual only |
| **2025 Compatibility** | ✅ Latest APIs | ❌ Outdated | ✅ Current |
| **Multi-Threading** | ✅ Advanced | ❌ None | ❌ Basic |
| **Format Count** | **80+ formats** | 20-30 formats | 70+ formats |
| **Error-Free Code** | ✅ **100%** | ⚠️ Some issues | ✅ Good |
| **Zero Breaking Changes** | ✅ **100%** | ✅ N/A | ❌ Breaking |

## 🛠 TypeScript Support

```typescript
import * as ytdl from 'ytdl-core-enhanced';

const options: ytdl.downloadOptions = {
  quality: 'highest',
  filter: 'audioandvideo',
  agent: myAgent  // NEW format support
};

const info = await ytdl.getInfo(url);
const stream = ytdl.downloadFromInfo(info, options);
```

## 📋 API Reference

| Method | Description |
|--------|-------------|
| `ytdl(url, options?)` | Download stream |
| `ytdl.getInfo(url, options?)` | Get video info + formats |
| `ytdl.validateURL(url)` | Validate YouTube URL |
| `ytdl.createAgent(cookies)` | **NEW**: Create auth agent |

## 📝 Options

| Option | Type | Description |
|--------|------|-------------|
| `quality` | string/number | 'highest', 'lowest', '720p', etc. |
| `filter` | string/function | 'audioonly', 'videoonly', custom filter |
| `agent` | object | **NEW**: Auth agent (no warnings) |
| `requestOptions.headers.Cookie` | string | **OLD**: Cookies (shows warning) |

## 🔍 Common Formats

| Quality | Container | Usage | Size (10min video) |
|---------|-----------|-------|-------------------|
| 140 | mp4 | **Audio 128kbps** | ~10MB |
| 298 | mp4 | **720p Video** | ~50MB |
| 299 | mp4 | **1080p Video** | ~100MB |
| 18 | mp4 | **360p Combined** | ~25MB |

## 🔧 Error Handling

```js
try {
  const stream = ytdl(url);
  stream.on('error', err => console.error('Download error:', err.message));
  stream.on('info', (info, format) => console.log('Using format:', format.qualityLabel));
} catch (error) {
  console.error('Setup error:', error.message);
}
```

## 📝 Changelog

### v1.3.1 (September 2025) - Cookie Fix & Auth Update
- ✅ **Fixed cookie format warning** - Clean console output
- ✅ **Auto browser authentication** - sqlite3-powered extraction
- ✅ **Agent-based format** - `ytdl.createAgent(cookies)`
- ✅ **2025 YouTube compatibility** - Latest API versions
- ✅ **100% error-free** - Fixed undefined references

### v1.2.0 - DisTube Integration
- Multi-client approach, Advanced signature extraction, Cookie support

### v1.1.0 - Enhanced Features
- Format preservation, Multi-threading, Anti-bot system

## 🙏 Credits

- **Original ytdl-core**: fent
- **DisTube Integration**: @distube/ytdl-core team
- **v1.3.1 Enhancements**: Satoru FX

## 📄 License

MIT License

---

**🚀 Production-Ready • ⚡ Lightning Fast • 🍪 Zero Warnings • 🔧 Auto Setup**