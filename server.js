const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// This is the main endpoint Make.com will call.
// It expects a JSON body with two fields: imageUrl and audioUrl.
app.post('/render', async (req, res) => {
  const { imageUrl, audioUrl } = req.body;

  // Each render gets a unique ID based on the timestamp,
  // so simultaneous renders don't overwrite each other's files.
  const id = Date.now();
  const imagePath = `/tmp/image_${id}.jpg`;
  const audioPath = `/tmp/audio_${id}.mp3`;
  const outputPath = `/tmp/output_${id}.mp4`;

  try {
    // Step 1: Download the image from Google Drive
    console.log('Downloading image...');
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, imageResponse.data);

    // Step 2: Download the audio file from Google Drive
    console.log('Downloading audio...');
    const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, audioResponse.data);

    // Step 3: Run FFmpeg to combine image + audio into a vertical MP4.
    // Breaking down the FFmpeg command:
    // -loop 1 = loop the static image as if it were a video
    // -i imagePath = input 1 is your image
    // -i audioPath = input 2 is your audio
    // -c:v libx264 = encode video using H.264 (universally compatible)
    // -tune stillimage = optimises encoding for a static image source
    // -c:a aac = encode audio in AAC format (required for Instagram/YouTube)
    // -b:a 192k = audio bitrate (good quality)
    // -vf scale=1080:1920 = force 9:16 vertical resolution (Reels/Shorts standard)
    // -shortest = stop when the audio ends (so video length = audio length)
    // -pix_fmt yuv420p = pixel format required for broad device compatibility
    const ffmpegCommand = `ffmpeg -loop 1 -i "${imagePath}" -i "${audioPath}" \
      -c:v libx264 -tune stillimage -c:a aac -b:a 192k \
      -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" \
      -shortest -pix_fmt yuv420p "${outputPath}"`;

    console.log('Running FFmpeg...');
    await new Promise((resolve, reject) => {
      exec(ffmpegCommand, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Step 4: Send the finished MP4 back to Make.com as a downloadable file.
    console.log('Sending video back...');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="reel_${id}.mp4"`);
    
    const videoStream = fs.createReadStream(outputPath);
    videoStream.pipe(res);

    // Step 5: Clean up temp files after sending, so the server doesn't fill up.
    videoStream.on('end', () => {
      fs.unlinkSync(imagePath);
      fs.unlinkSync(audioPath);
      fs.unlinkSync(outputPath);
    });

  } catch (error) {
    // If anything goes wrong, send Make.com a clear error message.
    console.error('Render failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// A simple health check endpoint — Render.com pings this to confirm
// your server is alive and running.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Video render server is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
