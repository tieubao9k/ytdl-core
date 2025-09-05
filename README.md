# ytdl-core
*Fast & Reliable YouTube video downloader for Node.js*

[![npm version](https://img.shields.io/npm/v/ytdl-core.svg)](https://www.npmjs.com/package/ytdl-core)
[![npm downloads](https://img.shields.io/npm/dm/ytdl-core.svg)](https://www.npmjs.com/package/ytdl-core)
[![Node.js CI](https://github.com/tieubao9k/ytdl-core/workflows/Node.js%20CI/badge.svg)](https://github.com/tieubao9k/ytdl-core/actions)

**🚀 NEW in v4.12.0:** Fast Android client optimization with **17% speed boost** + **DisTube fallback integration**!

---

## English | [Tiếng Việt](#tiếng-việt)

Yet another YouTube downloading module for Node.js. Written with only pure JavaScript and a node-friendly streaming interface.

### ⚡ Performance & Reliability Improvements
- **17% faster downloads** with Android client optimization
- **Enhanced signature extraction** using DisTube patterns for maximum reliability
- **Cookie support** for age-restricted content and authentication
- **Smart format parsing** with proper audio/video/combined categorization
- **Connection pooling** with Keep-Alive for better throughput  
- **Automatic fallback system** when signature extraction fails
- **Direct URLs** without signature decryption overhead when possible
- **Zero breaking changes** - fully backward compatible

## 🚀 Quick Start

```bash
npm install ytdl-core-enhanced
```

```js
const fs = require('fs');
const ytdl = require('ytdl-core-enhanced');

// Download a video
ytdl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  .pipe(fs.createWriteStream('video.mp4'));
```

## 📋 Basic Examples

### Download Video
```js
const ytdl = require('ytdl-core-enhanced');
const fs = require('fs');

// Simple download
ytdl('https://youtu.be/dQw4w9WgXcQ', { quality: 'highest' })
  .pipe(fs.createWriteStream('my-video.mp4'));
```

### Download Audio Only
```js
// Audio only download
ytdl('https://youtu.be/dQw4w9WgXcQ', { filter: 'audioonly' })
  .pipe(fs.createWriteStream('my-audio.mp3'));
```

### Get Video Info
```js
// Get video information
const info = await ytdl.getInfo('https://youtu.be/dQw4w9WgXcQ');
console.log('Title:', info.videoDetails.title);
console.log('Duration:', info.videoDetails.lengthSeconds);
```

### Progress Tracking
```js
const stream = ytdl('https://youtu.be/dQw4w9WgXcQ');

stream.on('progress', (chunkLength, downloaded, total) => {
  const percent = (downloaded / total * 100).toFixed(2);
  console.log(`Downloaded: ${percent}%`);
});

stream.pipe(fs.createWriteStream('video.mp4'));
```

## 🔧 Advanced Usage

### Quality Selection
```js
// Specific quality
ytdl(url, { quality: '720p' })

// Highest quality
ytdl(url, { quality: 'highest' })

// Lowest quality (fastest download)
ytdl(url, { quality: 'lowest' })

// Custom filter
ytdl(url, { 
  filter: format => format.container === 'mp4' && format.hasVideo 
})
```

### Fast Mode (NEW)
```js
// Enable fast Android client (default: true)
const info = await ytdl.getInfo(url, { fastMode: true });

// Disable fast mode to use standard method
const info = await ytdl.getInfo(url, { fastMode: false });

// Disable DisTube fallback if needed
const stream = ytdl(url, { disableDistubeFallback: true });
```

### Range Download
```js
// Download specific byte range
ytdl(url, { 
  range: { start: 0, end: 1024 * 1024 } // First 1MB
})
```

### IPv6 Support
```js
// Use IPv6 block for download
ytdl(url, { 
  IPv6Block: '2001:db8::/32' 
})
```

### Cookie Support (NEW)
```js
// Basic cookie usage for authentication
const info = await ytdl.getInfo(url, {
  requestOptions: {
    headers: {
      Cookie: 'VISITOR_INFO1_LIVE=xyz; CONSENT=YES+cb'
    }
  }
});

// Age-restricted videos with cookies
const stream = ytdl(url, {
  quality: 'highest',
  requestOptions: {
    headers: {
      Cookie: 'VISITOR_INFO1_LIVE=abc; SESSION_TOKEN=def; CONSENT=YES+cb'
    }
  }
});

// Extract cookies from browser (manual)
// 1. Open YouTube in browser
// 2. F12 -> Application/Storage -> Cookies -> youtube.com
// 3. Copy VISITOR_INFO1_LIVE and other relevant cookies
```

## 🌍 Express.js Integration

```js
const express = require('express');
const ytdl = require('ytdl-core-enhanced');
const app = express();

app.get('/download', async (req, res) => {
  const { url } = req.query;
  
  if (!ytdl.validateURL(url)) {
    return res.status(400).send('Invalid YouTube URL');
  }

  try {
    const info = await ytdl.getInfo(url);
    res.header('Content-Disposition', `attachment; filename="${info.videoDetails.title}.mp4"`);
    
    ytdl(url, { quality: 'highest' }).pipe(res);
  } catch (error) {
    res.status(500).send('Download failed');
  }
});
```

## 📊 Performance Comparison

| Method | Speed | Reliability | Signature Support |
|--------|-------|-------------|-------------------|
| Fast Android Client | **17% faster** | Excellent | Direct URLs |
| DisTube Fallback | Standard | Excellent | Advanced patterns |
| Standard ytdl-core | Standard | Good | Basic patterns |

## 🛠 TypeScript Support

```typescript
import ytdl from 'ytdl-core';

interface DownloadOptions {
  quality: string;
  filter: string;
  fastMode?: boolean;
}

const downloadVideo = async (url: string, options: DownloadOptions) => {
  const info = await ytdl.getInfo(url, { fastMode: options.fastMode });
  return ytdl(url, options);
};
```

## 🔍 Error Handling

```js
const ytdl = require('ytdl-core-enhanced');

try {
  const stream = ytdl('https://youtu.be/dQw4w9WgXcQ');
  
  stream.on('error', (error) => {
    console.error('Download error:', error.message);
    // Automatic fallback will be attempted
  });
  
  stream.on('info', (info, format) => {
    console.log('Using format:', format.qualityLabel);
  });
  
} catch (error) {
  console.error('Setup error:', error.message);
}
```

## ⚡ Performance Tips

1. **Use Fast Mode** (enabled by default)
2. **Choose appropriate quality** - lower quality = faster download
3. **Use audio-only for music** downloads
4. **Enable connection pooling** for multiple downloads
5. **Trust the fallback system** - it handles failures automatically

## 📋 Available Formats

This enhanced ytdl-core extracts **30+ formats** from YouTube videos:

### 🎵 Audio Formats (6 types)
| Format | Container | Bitrate | Codec | Usage |
|--------|-----------|---------|-------|--------|
| 139 | mp4 | 48kbps | AAC | Low quality audio |
| 140 | mp4 | 128kbps | AAC | **Recommended audio** |
| 141 | mp4 | 256kbps | AAC | High quality audio |
| 599 | m4a | 31kbps | AAC | Ultra low bandwidth |
| 600 | webm | 32kbps | Opus | Web streaming |
| 249-251 | webm | 50-160kbps | Opus | Alternative audio |

### 🎬 Video Formats (23+ types)
| Quality | Container | Resolution | Codec | Size (approx) |
|---------|-----------|------------|-------|---------------|
| 598 | mp4 | 144p | AVC1 | ~5-10MB |
| 597 | mp4 | 240p | AVC1 | ~10-20MB |
| 396 | mp4 | 360p | AVC1 | ~20-40MB |
| 397 | mp4 | 480p | AVC1 | ~40-80MB |
| 298 | mp4 | 720p | AVC1 | **~50-100MB** |
| 299 | mp4 | 1080p | AVC1 | ~100-200MB |
| 400 | mp4 | 1440p | AVC1 | ~200-400MB |
| 401 | mp4 | 2160p | AVC1 | ~500MB+ |
| 278-313 | webm | 144p-2160p | VP9 | Various sizes |

### 🎭 Combined Formats (1 type)
| Format | Quality | Container | Audio + Video |
|--------|---------|-----------|---------------|
| 18 | 360p | mp4 | **Ready to play** |

## 📖 Format Usage Examples

### Select Specific Format by itag
```js
// Download specific audio format (140 = 128kbps AAC)
const stream = ytdl(url, { format: { itag: 140 } });

// Download specific video format (298 = 720p MP4)
const stream = ytdl(url, { format: { itag: 298 } });
```

### Filter by Format Properties
```js
// Audio only formats
const audioFormats = info.formats.filter(format => 
  format.hasAudio && !format.hasVideo
);

// Video only formats  
const videoFormats = info.formats.filter(format => 
  format.hasVideo && !format.hasAudio
);

// Combined audio+video formats
const combinedFormats = info.formats.filter(format => 
  format.hasAudio && format.hasVideo
);
```

### Quality Selectors
```js
// Highest quality video
const stream = ytdl(url, { quality: 'highest' });

// Lowest quality (fastest download)
const stream = ytdl(url, { quality: 'lowest' });

// Best audio quality
const stream = ytdl(url, { quality: 'highestaudio' });

// Lowest audio (bandwidth saving)
const stream = ytdl(url, { quality: 'lowestaudio' });
```

### Format Information Access
```js
const info = await ytdl.getInfo(url);

// Print all available formats
info.formats.forEach(format => {
  console.log(`Format ${format.itag}:`);
  console.log(`  Quality: ${format.qualityLabel || 'Audio only'}`);
  console.log(`  Container: ${format.container}`);
  console.log(`  Size: ${format.contentLength ? 
    (format.contentLength / 1024 / 1024).toFixed(2) + 'MB' : 'Unknown'}`);
  console.log(`  Audio: ${format.hasAudio ? 
    format.audioBitrate + 'kbps' : 'No'}`);
  console.log(`  Video: ${format.hasVideo ? 
    format.qualityLabel : 'No'}`);
  console.log(`  URL: ${format.url}\n`);
});

// Categorize formats
console.log(`📀 Audio formats: ${audioFormats.length}`);
console.log(`🎬 Video formats: ${videoFormats.length}`);  
console.log(`🎭 Combined formats: ${combinedFormats.length}`);
console.log(`📊 Total formats: ${info.formats.length}`);
```

### Recommended Formats for Common Use Cases

```js
// 🎵 Music/Podcast Download (Best Quality Audio)
const musicStream = ytdl(url, { 
  filter: format => format.itag === 140 // 128kbps AAC
});

// 📱 Mobile Video (Balance Quality/Size)  
const mobileStream = ytdl(url, {
  filter: format => format.itag === 396 // 360p MP4
});

// 💻 Desktop Video (Good Quality)
const desktopStream = ytdl(url, {
  filter: format => format.itag === 298 // 720p MP4
});

// 📺 High Quality Video (Large File)
const hdStream = ytdl(url, {
  filter: format => format.itag === 299 // 1080p MP4
});

// ⚡ Fast Download (Small File)
const fastStream = ytdl(url, {
  filter: format => format.itag === 598 // 144p MP4
});
```

## 🔧 API Reference

### `ytdl(url, [options])`
Downloads a video/audio stream.

### `ytdl.getInfo(url, [options])`
Gets video information and formats.

### `ytdl.getBasicInfo(url, [options])`
Gets basic video information (faster).

### `ytdl.validateURL(url)`
Validates YouTube URL.

### `ytdl.getURLVideoID(url)`
Extracts video ID from URL.

## 📝 Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `quality` | string/number | 'highest' | Video quality to download |
| `filter` | string/function | - | Format filter |
| `fastMode` | boolean | true | Use fast Android client |
| `range` | object | - | Byte range to download |
| `begin` | string | - | Time to begin download from |
| `requestOptions` | object | - | HTTP request options (includes Cookie headers) |
| `requestOptions.headers.Cookie` | string | - | YouTube cookies for authentication/age-restricted content |

---

# Tiếng Việt

## 🚀 Khởi Động Nhanh

```bash
npm install ytdl-core-enhanced
```

```js
const fs = require('fs');
const ytdl = require('ytdl-core-enhanced');

// Tải video
ytdl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  .pipe(fs.createWriteStream('video.mp4'));
```

## 📋 Ví Dụ Cơ Bản

### Tải Video
```js
const ytdl = require('ytdl-core-enhanced');
const fs = require('fs');

// Tải đơn giản
ytdl('https://youtu.be/dQw4w9WgXcQ', { quality: 'highest' })
  .pipe(fs.createWriteStream('video-cua-toi.mp4'));
```

### Chỉ Tải Audio
```js
// Chỉ tải âm thanh
ytdl('https://youtu.be/dQw4w9WgXcQ', { filter: 'audioonly' })
  .pipe(fs.createWriteStream('nhac-cua-toi.mp3'));
```

### Lấy Thông Tin Video
```js
// Lấy thông tin video
const info = await ytdl.getInfo('https://youtu.be/dQw4w9WgXcQ');
console.log('Tiêu đề:', info.videoDetails.title);
console.log('Thời lượng:', info.videoDetails.lengthSeconds);
```

### Theo Dõi Tiến Trình
```js
const stream = ytdl('https://youtu.be/dQw4w9WgXcQ');

stream.on('progress', (chunkLength, downloaded, total) => {
  const percent = (downloaded / total * 100).toFixed(2);
  console.log(`Đã tải: ${percent}%`);
});

stream.pipe(fs.createWriteStream('video.mp4'));
```

## 🔧 Sử Dụng Nâng Cao

### Chọn Chất Lượng
```js
// Chất lượng cụ thể
ytdl(url, { quality: '720p' })

// Chất lượng cao nhất
ytdl(url, { quality: 'highest' })

// Chất lượng thấp nhất (tải nhanh nhất)
ytdl(url, { quality: 'lowest' })
```

### Chế Độ Nhanh (MỚI)
```js
// Bật client Android nhanh (mặc định: true)
const info = await ytdl.getInfo(url, { fastMode: true });

// Tắt chế độ nhanh
const info = await ytdl.getInfo(url, { fastMode: false });
```

### Hỗ Trợ Cookie (MỚI)
```js
// Sử dụng cookie cơ bản
const info = await ytdl.getInfo(url, {
  requestOptions: {
    headers: {
      Cookie: 'VISITOR_INFO1_LIVE=xyz; CONSENT=YES+cb'
    }
  }
});

// Video giới hạn độ tuổi với cookie
const stream = ytdl(url, {
  quality: 'highest',
  requestOptions: {
    headers: {
      Cookie: 'VISITOR_INFO1_LIVE=abc; SESSION_TOKEN=def'
    }
  }
});

// Cách lấy cookie từ trình duyệt:
// 1. Mở YouTube trên trình duyệt
// 2. F12 -> Application -> Cookies -> youtube.com  
// 3. Copy VISITOR_INFO1_LIVE và các cookie khác
```

## 🌟 Tính Năng Mới

### Cải Tiến Hiệu Suất & Tính Năng
- **Tốc độ tải nhanh hơn 17%** với Fast Android client
- **Hỗ trợ Cookie** cho video giới hạn độ tuổi và xác thực
- **Smart format parsing** phân loại đúng audio/video/combined
- **Enhanced signature extraction** với DisTube patterns
- **Kết nối Keep-Alive** cho throughput tốt hơn
- **Automatic fallback system** khi signature extraction thất bại
- **URL trực tiếp** không cần giải mã signature khi có thể
- **Tương thích ngược 100%** với code hiện có

## 🔍 Xử Lý Lỗi

```js
try {
  const stream = ytdl('https://youtu.be/dQw4w9WgXcQ');
  
  stream.on('error', (error) => {
    console.error('Lỗi tải:', error.message);
    // Hệ thống sẽ tự động fallback
  });
  
  stream.on('info', (info, format) => {
    console.log('Đang dùng format:', format.qualityLabel);
  });
  
} catch (error) {
  console.error('Lỗi thiết lập:', error.message);
}
```

## ⚡ Mẹo Tối Ưu Hiệu Suất

1. **Dùng Fast Mode** (đã bật mặc định)
2. **Chọn chất lượng phù hợp** - chất lượng thấp = tải nhanh hơn
3. **Dùng audio-only cho nhạc**
4. **Tin tưởng hệ thống fallback** - tự động xử lý lỗi

## 📞 Hỗ Trợ

- **GitHub Issues**: https://github.com/tieubao9k/ytdl-core/issues
- **Original Author**: fent (https://github.com/fent)
- **Fast Optimization**: Satoru FX

## 📄 Giấy Phép

MIT License

## 🙏 Đóng Góp

- **Original ytdl-core**: fent và cộng đồng
- **DisTube Integration**: @distube/ytdl-core team
- **Fast Android Client**: Satoru FX
- **Performance Optimization**: Satoru FX

---

*Made with ❤️ for the Node.js community*