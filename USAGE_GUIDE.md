# Hướng dẫn sử dụng - YTDL-CORE Enhanced

## ✅ Cách dùng GIỐNG HỆT ytdl-core gốc

Package này đã được nâng cấp với Android InnerTube client và signature decoding, nhưng **API hoàn toàn không thay đổi**.

---

## 🚀 Ví dụ cơ bản

### 1. Download đơn giản
```javascript
const ytdl = require('./ytdl-core');
const fs = require('fs');

ytdl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  .pipe(fs.createWriteStream('video.mp4'));
```

### 2. Chọn quality
```javascript
// Quality cao nhất
ytdl(url, { quality: 'highest' })
  .pipe(fs.createWriteStream('video.mp4'));

// Quality thấp nhất
ytdl(url, { quality: 'lowest' })
  .pipe(fs.createWriteStream('video.mp4'));

// Chọn itag cụ thể (1080p video)
ytdl(url, { quality: 137 })
  .pipe(fs.createWriteStream('video-1080p.mp4'));
```

### 3. Với cookies (video có giới hạn)
```javascript
const cookieString = 'your-youtube-cookies';

ytdl(url, {
  quality: 137,
  requestOptions: {
    headers: {
      'Cookie': cookieString
    }
  }
}).pipe(fs.createWriteStream('video.mp4'));
```

### 4. Lấy thông tin video
```javascript
ytdl.getInfo(url).then(info => {
  console.log('Tên video:', info.videoDetails.title);
  console.log('Tác giả:', info.videoDetails.author.name);
  console.log('Thời lượng:', info.videoDetails.lengthSeconds, 'giây');
  console.log('Số formats:', info.formats.length);
});
```

### 5. Filter formats
```javascript
// Chỉ video (không audio)
ytdl(url, { filter: 'videoonly' })
  .pipe(fs.createWriteStream('video-only.mp4'));

// Chỉ audio
ytdl(url, { filter: 'audioonly' })
  .pipe(fs.createWriteStream('audio.m4a'));

// Video + Audio
ytdl(url, { filter: 'videoandaudio' })
  .pipe(fs.createWriteStream('video-full.mp4'));

// Custom filter
ytdl(url, {
  filter: format => format.container === 'mp4' && format.hasAudio
}).pipe(fs.createWriteStream('video.mp4'));
```

### 6. Theo dõi tiến trình download
```javascript
const video = ytdl(url, { quality: 'highest' });

video.on('info', (info, format) => {
  console.log('Đang tải:', info.videoDetails.title);
  console.log('Quality:', format.qualityLabel);
});

let downloaded = 0;
video.on('data', chunk => {
  downloaded += chunk.length;
  console.log('Đã tải:', (downloaded / 1024 / 1024).toFixed(2), 'MB');
});

video.on('end', () => {
  console.log('Hoàn thành!');
});

video.on('error', err => {
  console.error('Lỗi:', err.message);
});

video.pipe(fs.createWriteStream('video.mp4'));
```

---

## 🔧 Options

### `ytdl(url, options)`

**Options phổ biến:**

```javascript
{
  quality: 'highest',        // 'highest', 'lowest', hoặc itag number (137, 139, 18, etc.)
  filter: 'audioandaudio',   // 'videoonly', 'audioonly', 'videoandaudio', hoặc function
  requestOptions: {           // HTTP request options
    headers: {
      'Cookie': 'your-cookies'
    }
  }
}
```

### `ytdl.getInfo(url, options)`

Lấy thông tin video mà không download.

**Returns:**
```javascript
{
  videoDetails: {
    title: 'Video title',
    author: { name: 'Channel name' },
    lengthSeconds: 123,
    viewCount: 456789
  },
  formats: [
    {
      itag: 137,
      url: 'https://...',
      qualityLabel: '1080p',
      container: 'mp4',
      hasVideo: true,
      hasAudio: false
    },
    // ... more formats
  ]
}
```

---

## 🎯 Format ITAGs phổ biến

### Video + Audio (Progressive)
- **18**: 360p MP4
- **22**: 720p MP4 (không phải lúc nào cũng có)

### Video-only (Adaptive)
- **137**: 1080p MP4
- **136**: 720p MP4
- **135**: 480p MP4
- **134**: 360p MP4

### Audio-only (Adaptive)
- **139**: 48kbps M4A (lowest)
- **140**: 128kbps M4A (medium)
- **251**: 160kbps WEBM (highest)

---

## 📚 Events

Stream phát ra các events:

### `info` - Khi chọn xong format
```javascript
video.on('info', (info, format) => {
  console.log('Video:', info.videoDetails.title);
  console.log('Format:', format.qualityLabel);
});
```

### `data` - Khi nhận data chunk
```javascript
video.on('data', chunk => {
  console.log('Received:', chunk.length, 'bytes');
});
```

### `end` - Khi download xong
```javascript
video.on('end', () => {
  console.log('Done!');
});
```

### `error` - Khi có lỗi
```javascript
video.on('error', err => {
  console.error('Error:', err.message);
});
```

---

## 🍪 Lấy cookies từ browser

### Chrome/Edge:
1. Mở DevTools (F12)
2. Vào tab Application > Cookies > https://www.youtube.com
3. Copy các cookies sau:
   - `__Secure-3PSID`
   - `__Secure-1PSID`
   - `SAPISID`
   - `__Secure-1PAPISID`
   - `__Secure-3PAPISID`

4. Format: `name1=value1; name2=value2; ...`

### Hoặc dùng extension:
- Cookie Editor
- EditThisCookie

---

## ⚠️ Lưu ý quan trọng

1. **API không thay đổi** - Code cũ vẫn chạy được 100%
2. **Bên trong đã nâng cấp**:
   - Dùng ANDROID InnerTube client (reliable nhất)
   - Signature decoding tự động
   - Undici HTTP client (nhanh hơn)
3. **Restricted videos** cần cookies để tải
4. **Format availability** phụ thuộc vào từng video

---

## 🐛 Troubleshooting

### Lỗi 403 Forbidden
→ Thêm cookies vào request

### Format not found
→ Check available formats bằng `ytdl.getInfo(url)`

### Video unavailable
→ Video có thể bị region-locked hoặc private

---

## 📖 Full Example

Xem file `EXAMPLE.js` trong thư mục package để có full examples.
