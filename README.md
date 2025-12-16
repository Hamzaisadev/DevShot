# DevShot - Professional Screenshot Extension

![DevShot](icons/icon128.png)

**Capture, mock up, and showcase your websites like a pro.**

---

## ✨ Features

### Screenshot Capture
- 🖥️ **Desktop** - Viewport & Full Page
- 📱 **Mobile** - Responsive viewport capture
- 📲 **Tablet** - iPad-style responsive capture
- ⏱️ **Delay** - Wait for page animations/loaders
- 📦 **Bundle** - Capture all 6 variants at once

### Batch URL Capture
- 🌐 Enter multiple URLs (one per line)
- ☑️ Select which capture types to run per URL
- 🚀 "All 6" quick select for maximum coverage

### Device Mockups
- 📱 **Phones**: iPhone 15/14 Pro, Pixel 8/7, Samsung S24/S23
- 📲 **Tablets**: iPad Pro 12.9"/11", iPad Air/Mini, Galaxy Tab, Surface Pro
- 💻 **Laptops**: MacBook Pro 16"/14", MacBook Air
- 🖥️ **Monitors**: iMac 24", Studio Display
- 🌐 **Browsers**: Chrome, Safari, Arc

### Showcase Builder
- Multi-device showcase templates
- Custom backgrounds & gradients
- Download high-resolution exports

### Gallery Management
- 📁 Organized by domain
- 🔍 Filter by device/type
- 🗑️ Bulk delete & download
- 📤 Export to PDF

---

## 📥 Installation

### Developer Mode (Recommended)

1. **Download** this repository or clone it:
   ```
   git clone https://github.com/your-repo/devshot.git
   ```

2. Open **Chrome** and navigate to:
   ```
   chrome://extensions
   ```

3. Enable **Developer mode** (toggle in top-right)

4. Click **"Load unpacked"**

5. Select the `DevShot` folder

6. Done! Click the 📸 DevShot icon in your toolbar

---

## 🚀 Usage

### Quick Capture
1. Navigate to any website
2. Click the DevShot icon
3. Select device (Desktop/Mobile/Tablet)
4. Click Viewport or Full Page
5. Screenshot saved to gallery!

### Batch Capture
1. Click "🌐 Batch URLs" button
2. Enter URLs (one per line)
3. Check which capture types you want
4. Click "🚀 Start"

### Create Mockups
1. Open Gallery
2. Click "📱 Mockup" on any screenshot
3. Choose device frame & background
4. Download or save to gallery

---

## 📁 File Structure

```
DevShot/
├── manifest.json       # Extension config
├── popup/             # Extension popup UI
├── gallery/           # Screenshot gallery
├── settings/          # User preferences
├── background/        # Service worker
├── content/           # Content scripts
├── lib/               # Shared utilities
└── icons/             # Extension icons
```

---

## 🛠️ Settings

- **Capture Delay**: 0-5 seconds before capture
- **Freeze Animations**: Disable CSS animations
- **Hide Preloaders**: Auto-hide loading spinners
- **Auto-save**: Save screenshots to gallery
- **Custom Viewports**: Set mobile/tablet sizes

---

## 📜 License

MIT License

---

Made with ❤️ by **Albatix**
