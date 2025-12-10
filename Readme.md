# FaceBlur 🎭

A privacy-focused Chrome extension that automatically blurs specific faces in images while you browse the web. All processing happens locally on your device.

## Features

- 🔒 **100% Local Processing** - No data sent to servers
- 🎯 **Modern AI** - Uses TensorFlow.js + MediaPipe
- ⚡ **Real-time Scanning** - Works on dynamically loaded images
- 🎨 **Clean UI** - Simple, intuitive interface
- 🔄 **Toggle On/Off** - Enable or disable anytime
- 📘 **TypeScript** - Full type safety


## Usage

1. Click the FaceBlur icon in Chrome toolbar
2. Upload 2-3 clear reference photos
3. Toggle "Enable FaceBlur" to activate
4. Browse normally - matching faces blur automatically

## How It Works

Uses **perceptual hashing** and **facial feature comparison**:
1. Extract face landmarks from reference photos
2. Create unique "fingerprint" for each face
3. Compare detected faces against fingerprints
4. Blur matches in real-time

**Why not traditional face recognition?**
- No need for heavy ML models
- Faster processing
- Better privacy
- Works offline

## Technical Details

- **Framework**: Vite + TypeScript
- **Face Detection**: face-api.js
- **Matching**: Perceptual hashing + landmark comparison
- **Browser**: Chrome (Manifest V3)
- **Models**: Downloaded automatically by TensorFlow.js

## Privacy

- ✅ 100% local processing
- ✅ No network requests
- ✅ No data collection
- ✅ Open source

## Performance Tips

- Disable on image-heavy sites when not needed
- Use 2-3 reference photos max for best performance
- Models are cached after first load

## License

MIT