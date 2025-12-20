# DevShot - The Ultimate Screenshot & Mockup Tool for Developers

<<<<<<< HEAD
![DevShot Banner](https://raw.githubusercontent.com/Hamzaisadev/DevShot/F:\Codding projects\Chrome Extension\DevShot\og-image.jpg)
=======
![DevShot Banner](https://raw.githubusercontent.com/Hamzaisadev/DevShot/main/og-image.jpg)
>>>>>>> e415881470d3bfff0e7d6fee7636b592dad6cc33

**DevShot** is a professional, open-source Chrome extension designed specifically for web developers, designers, and digital agencies. It goes beyond simple screenshots by offering a complete suite of tools to capture, mock up, and showcase your work.

> **Capture. Mock up. Showcase. Like a Pro.**

---

## ✨ Features

### 📸 Pro-Level Capture
- **Full Page Capture**: Intelligently scrolls and stitches entire webpages, even those with complex layouts.
- **Viewport Capture**: Snap exactly what you see on your screen.
- **Responsive Snapshots**: Instantly capture Mobile, Tablet, and Desktop views of any site.
- **Batch Capture**: Enter a list of URLs and let DevShot automatically capture all of them in various viewports.
- **Element Selector**: (Coming Soon) Select and capture specific DOM elements.

### 🎥 Video Recording
- **High-Quality Recording**: Record your screen interactions in up to 4K/60fps.
- **No Watermarks**: Clean, professional recordings for your demos and bug reports.
- **System Audio**: Option to include system audio for comprehensive walkthroughs.

### 📱 Instant Device Mockups
Turn boring screenshots into stunning portfolio assets in seconds.
- **Smart Frames**: Wrap your screenshots in realistic device frames.
- **Device Library**:
  - **Phones**: iPhone 15 Pro, Pixel 8, Samsung S24
  - **Tablets**: iPad Pro, iPad Air, Surface Pro
  - **Laptops**: MacBook Pro 16", MacBook Air
  - **Browsers**: Chrome, Safari, Arc, Firefox
- **Custom Backgrounds**: Add gradients, solid colors, or transparent backgrounds.

### 📚 Gallery & Organization
- **Local Library**: All captures are stored locally in your browser (IndexedDB).
- **Domain Sorting**: Automatically organizes screenshots by the website domain.
- **Smart Search**: Quickly find assets by URL or date.
- **Bulk Actions**: Download or delete multiple assets at once.

---

## 🔒 Privacy First
DevShot runs **100% locally** in your browser. 
- **No Cloud Uploads**: Your screenshots and videos never leave your device unless you explicitly share them.
- **No Tracking**: We do not track your browsing history or collect personal data.
- **Open Source**: The code is fully transparent and available for audit.

---

## 📥 Installation

DevShot is currently available as a developer preview. Follow these steps to install:

### Method 1: Download ZIP (Easiest)
1. **Download** the latest version [ZIP file](https://codeload.github.com/Hamzaisadev/DevShot/zip/refs/heads/main).
2. **Unzip** the downloaded file to a folder on your computer.
3. Open Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **"Load unpacked"**.
6. Select the unzipped `DevShot` folder.

### Method 2: Git Clone (For Developers)
1. Clone the repository:
   ```bash
   git clone https://github.com/Hamzaisadev/DevShot.git
   ```
2. Follow steps 3-6 above, selecting the cloned folder.

---

## 🗺️ Version Pipeline

We have an exciting roadmap ahead! Here's what we're planning for the next major updates:

### v1.1: Cloud Sync & Sharing
- **Cloud Integrations**: Direct upload to Google Drive, Dropbox, and OneDrive.
- **Shareable Links**: Generate instant public links for your captures.
- **Cross-Device Sync**: Sync your gallery across different Chrome instances.

### v1.2: Advanced Annotation Suite
- **Drawing Tools**: Arrows, shapes, and freehand drawing on captures.
- **Text & Notes**: Add rich text comments and callouts.
- **Smart Blur**: Automatically detect and blur sensitive info (emails, credit cards).
- **Stickers**: Add emoji and professional stickers to your screenshots.

### v1.3: Customization & accessibility
- **Theming**: Custom themes for the extension interface.
- **Shortcuts**: Fully customizable keyboard shortcuts.
- **Accessibility**: Enhanced screen reader support and high-contrast modes.

### v1.4: Advanced History
- **Timeline View**: Visual history of your captures.
- **Search**: Full-text search within your capture metadata.
- **Restoration**: Restore deleted items from a trash bin.

### v1.5: Export Powerhouse
- **Formats**: Export to PDF, Markdown, and HTML.
- **Integrations**: Send directly to Slack, Trello, and Jira.
- **Watermarking**: Add custom branding to your exports.

---

## 💻 Development

### Project Structure
```
DevShot/
├── manifest.json       # Extension configuration
├── popup/             # Extension popup UI (React/HTML/CSS)
├── gallery/           # Gallery dashboard
├── background/        # Background service workers
├── content/           # Content scripts for page interaction
├── lib/               # Shared libraries and utilities
├── icons/             # App icons
└── website/           # Official Landing Page (React + Vite)
```

### Running the Landing Page
The project includes a modern landing page built with React, Tailwind CSS, and Framer Motion.

1. Navigate to the website directory:
   ```bash
   cd website
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

---

## 🤝 Contributing

We welcome contributions from the community! Whether it's a bug fix, new feature, or documentation improvement, we'd love your help.

1. **Fork** the repository.
2. Create a new branch: `git checkout -b feature/amazing-feature`.
3. Commit your changes: `git commit -m 'Add amazing feature'`.
4. Push to the branch: `git push origin feature/amazing-feature`.
5. Open a **Pull Request**.

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Hamzaisadev">Albatix</a>
</p>
