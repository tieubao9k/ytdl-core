// ============================================================
// YTDL-CORE - ENHANCED VERSION
// Sử dụng GIỐNG HỆT như ytdl-core gốc
// ============================================================

const ytdl = require('./index');
const fs = require('fs');

// ============================================================
// CÁCH 1: Download đơn giản nhất
// ============================================================
const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

ytdl(url)
  .pipe(fs.createWriteStream('video.mp4'));

// ============================================================
// CÁCH 2: Chọn quality
// ============================================================
ytdl(url, { quality: 'highest' })
  .pipe(fs.createWriteStream('video-highest.mp4'));

// Hoặc chọn itag cụ thể:
ytdl(url, { quality: 137 })  // 1080p video-only
  .pipe(fs.createWriteStream('video-1080p.mp4'));

// ============================================================
// CÁCH 3: Với authentication cookies (cho video có giới hạn)
// ============================================================
const cookieString = 'your-youtube-cookies-here';

ytdl(url, {
  quality: 137,
  requestOptions: {
    headers: {
      'Cookie': cookieString
    }
  }
}).pipe(fs.createWriteStream('video-with-auth.mp4'));

// ============================================================
// CÁCH 4: Lấy thông tin video (không download)
// ============================================================
ytdl.getInfo(url).then(info => {
  console.log('Title:', info.videoDetails.title);
  console.log('Duration:', info.videoDetails.lengthSeconds, 'seconds');
  console.log('Available formats:', info.formats.length);

  // Lọc formats
  const videoFormats = info.formats.filter(f => f.hasVideo && f.hasAudio);
  const audioFormats = info.formats.filter(f => f.hasAudio && !f.hasVideo);

  console.log('Video+Audio formats:', videoFormats.length);
  console.log('Audio-only formats:', audioFormats.length);
});

// ============================================================
// CÁCH 5: Filter formats
// ============================================================

// Chỉ lấy video-only
ytdl(url, { filter: 'videoonly' })
  .pipe(fs.createWriteStream('video-only.mp4'));

// Chỉ lấy audio
ytdl(url, { filter: 'audioonly' })
  .pipe(fs.createWriteStream('audio.m4a'));

// Custom filter
ytdl(url, {
  filter: format => format.container === 'mp4' && format.hasAudio
})
  .pipe(fs.createWriteStream('video-custom.mp4'));

// ============================================================
// CÁCH 6: Download với progress tracking
// ============================================================
const video = ytdl(url, { quality: 'highest' });

video.on('info', (info, format) => {
  console.log('Downloading:', info.videoDetails.title);
  console.log('Quality:', format.qualityLabel || format.quality);
});

let downloaded = 0;
video.on('data', chunk => {
  downloaded += chunk.length;
  console.log('Downloaded:', (downloaded / 1024 / 1024).toFixed(2), 'MB');
});

video.on('end', () => {
  console.log('Download complete!');
});

video.on('error', err => {
  console.error('Error:', err.message);
});

video.pipe(fs.createWriteStream('video-with-progress.mp4'));

// ============================================================
// LƯU Ý QUAN TRỌNG:
// ============================================================
//
// 1. Package này đã được ENHANCED với:
//    - Android InnerTube client (hoạt động với restricted videos)
//    - Signature decoding tự động
//    - Undici thay vì miniget (faster, more reliable)
//
// 2. API HOÀN TOÀN TƯƠNG THÍCH với ytdl-core gốc
//    - Không cần thay đổi code hiện tại
//    - Tất cả options vẫn hoạt động như cũ
//
// 3. Với restricted videos (cần authentication):
//    - Thêm cookies vào requestOptions.headers
//    - ANDROID client sẽ tự động được dùng
//
// 4. Performance:
//    - Fast downloads với undici
//    - Auto signature decoding
//    - Direct URLs khi có thể
//
// ============================================================
