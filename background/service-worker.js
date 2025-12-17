// DevShot Service Worker
// Handles screenshot capture and background operations

// ============================================
// Configuration & Settings
// ============================================

// Default settings
const DEFAULT_SETTINGS = {
  defaultDelay: 3000,
  freezeAnimations: true,
  hidePreloaders: true,
  enableMockups: false,
  mobileMockup: 'iphone-14',
  tabletMockup: 'ipad-pro',
  desktopMockup: 'macbook-pro',
  mobileWidth: 375,
  mobileHeight: 812,
  tabletWidth: 768,
  tabletHeight: 1024,
  autoSave: true,
  alsoDownload: false
};

// Get current settings
async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['devshot_settings'], result => {
      resolve(result.devshot_settings || DEFAULT_SETTINGS);
    });
  });
}

// Get viewports from settings
async function getViewports() {
  const settings = await getSettings();
  return {
    mobile: { width: settings.mobileWidth, height: settings.mobileHeight },
    tablet: { width: settings.tabletWidth, height: settings.tabletHeight }
  };
}

// ============================================
// Capture Queue - Prevents race conditions
// ============================================

let isCapturing = false;
const captureQueue = [];

async function queueCapture(type, tab = null, delay = null) {
  return new Promise((resolve, reject) => {
    captureQueue.push({ type, tab, delay, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (isCapturing || captureQueue.length === 0) return;
  
  isCapturing = true;
  const { type, tab, delay, resolve, reject } = captureQueue.shift();
  
  try {
    const result = await executeCapture(type, tab, delay);
    resolve(result);
  } catch (error) {
    reject(error);
  } finally {
    isCapturing = false;
    // Process next item (with delay to avoid rate limits)
    if (captureQueue.length > 0) {
      setTimeout(processQueue, 1500);
    }
  }
}

// ============================================
// Message Listener
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture') {
    queueCapture(message.type, null, message.delay)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.action === 'setDelay') {
    captureDelay = message.delay || 3000;
    sendResponse({ success: true });
    return true;
  }

  // Batch capture URL - for batch website capture feature
  if (message.action === 'batchCaptureUrl') {
    captureUrlScreenshot(message.url, message.type, message.delay)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Auto scroll capture - capture frames while scrolling, download as GIF
  if (message.action === 'autoScrollCapture') {
    autoScrollCapture()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Save video to gallery
  if (message.action === 'saveVideo') {
    saveToGallery(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

});

// Capture screenshot of a specific URL (for batch capture)
async function captureUrlScreenshot(url, type, delay = 3000) {
  let windowId = null;
  
  try {
    const settings = await getSettings();
    const viewports = await getViewports();
    
    // Parse type (e.g., "desktop-viewport" or "mobile-fullpage")
    const [device, captureType] = type.split('-');
    
    // Skip invalid URLs
    if (!url || !url.startsWith('http')) {
      return { success: false, error: 'Invalid URL' };
    }

    // Determine viewport dimensions based on device
    let viewport = null;
    if (device === 'mobile') {
      viewport = viewports.mobile;
    } else if (device === 'tablet') {
      viewport = viewports.tablet;
    }

    // For mobile/tablet, create a window with specific viewport
    if (viewport) {
      const newWindow = await chrome.windows.create({
        url: url,
        type: 'popup',
        width: viewport.width + 16,
        height: viewport.height + 88,
        left: 100,
        top: 100,
        focused: false
      });
      
      windowId = newWindow.id;
      const newTab = newWindow.tabs[0];
      
      await waitForTabLoad(newTab.id);
      await sleep(delay > 0 ? delay : 3000);
      await disableAnimationsAndPreloaders(newTab.id);
      await sleep(500);
      
      let imageData;
      if (captureType === 'viewport') {
        imageData = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      } else {
        imageData = await captureFullPage(newTab);
      }
      
      if (!imageData) {
        return { success: false, error: 'Failed to capture screenshot' };
      }
      
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const timestamp = formatTimestamp();
      const filename = `${domain}_${device}_${captureType}_${timestamp}.png`;
      
      if (settings.autoSave) {
        await saveToGallery({
          filename,
          domain,
          device,
          captureType,
          dataUrl: imageData,
          url: url,
          timestamp: Date.now()
        });
      }
      
      console.log(`[DevShot Batch] Saved: ${filename}`);
      return { success: true, filename };
      
    } else {
      // Desktop - create tab in current window
      const newWindow = await chrome.windows.create({
        url: url,
        type: 'popup',
        width: 1400,
        height: 900,
        left: 100,
        top: 100,
        focused: false
      });
      
      windowId = newWindow.id;
      const newTab = newWindow.tabs[0];
      
      await waitForTabLoad(newTab.id);
      await sleep(delay > 0 ? delay : 3000);
      await disableAnimationsAndPreloaders(newTab.id);
      await sleep(500);
      
      let imageData;
      if (captureType === 'viewport') {
        imageData = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      } else {
        imageData = await captureFullPage(newTab);
      }
      
      if (!imageData) {
        return { success: false, error: 'Failed to capture screenshot' };
      }
      
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const timestamp = formatTimestamp();
      const filename = `${domain}_desktop_${captureType}_${timestamp}.png`;
      
      if (settings.autoSave) {
        await saveToGallery({
          filename,
          domain,
          device: 'desktop',
          captureType,
          dataUrl: imageData,
          url: url,
          timestamp: Date.now()
        });
      }
      
      console.log(`[DevShot Batch] Saved: ${filename}`);
      return { success: true, filename };
    }
    
  } catch (error) {
    console.error('[DevShot Batch] Capture error:', error);
    return { success: false, error: error.message };
  } finally {
    if (windowId) {
      try { await chrome.windows.remove(windowId); } catch (e) {}
    }
  }
}

// Auto scroll capture - scroll page and capture frames
async function autoScrollCapture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab');

  // Get page dimensions
  const pageInfo = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      scrollTop: window.scrollY
    })
  });

  const { scrollHeight, viewportHeight } = pageInfo[0].result;
  const totalScrollDistance = scrollHeight - viewportHeight;
  
  if (totalScrollDistance <= 0) {
    // Page doesn't need scrolling, just capture single frame
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    const timestamp = formatTimestamp();
    const filename = `scroll_capture_${timestamp}.png`;
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });
    
    return { success: true, filename };
  }

  // Scroll to top first
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.scrollTo(0, 0)
  });
  await new Promise(r => setTimeout(r, 300));

  // Capture frames while scrolling
  const frames = [];
  const scrollStep = 100; // pixels per step
  const captureInterval = 80; // ms between captures (for ~12 fps)
  const steps = Math.ceil(totalScrollDistance / scrollStep);

  for (let i = 0; i <= steps; i++) {
    // Capture frame
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 70 });
      frames.push(dataUrl);
    } catch (e) {
      console.log('Frame capture skipped');
    }

    // Scroll
    if (i < steps) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (step) => {
          window.scrollBy({ top: step, behavior: 'auto' });
        },
        args: [scrollStep]
      });
      await new Promise(r => setTimeout(r, captureInterval));
    }
  }

  // Create download - for now, download first and last frame as comparison
  // (Full GIF encoding would require a library like gif.js)
  const timestamp = formatTimestamp();
  
  // Download first frame
  await chrome.downloads.download({
    url: frames[0],
    filename: `scroll_start_${timestamp}.png`,
    saveAs: false
  });
  
  // Download last frame
  if (frames.length > 1) {
    await chrome.downloads.download({
      url: frames[frames.length - 1],
      filename: `scroll_end_${timestamp}.png`,
      saveAs: false
    });
  }

  // Scroll back to top
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.scrollTo({ top: 0, behavior: 'smooth' })
  });

  return { success: true, framesCount: frames.length, message: `Captured ${frames.length} frames` };
}

// ============================================
// Context Menu Setup
// ============================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'devshot-menu',
    title: 'DevShot',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-desktop-viewport',
    parentId: 'devshot-menu',
    title: '🖥️ Desktop Viewport',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-desktop-fullpage',
    parentId: 'devshot-menu',
    title: '📄 Desktop Full Page',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'separator-1',
    parentId: 'devshot-menu',
    type: 'separator',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-mobile-viewport',
    parentId: 'devshot-menu',
    title: '📱 Mobile Viewport (375px)',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-mobile-fullpage',
    parentId: 'devshot-menu',
    title: '📱 Mobile Full Page (375px)',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'separator-2',
    parentId: 'devshot-menu',
    type: 'separator',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-tablet-viewport',
    parentId: 'devshot-menu',
    title: '📱 Tablet Viewport (768px)',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-tablet-fullpage',
    parentId: 'devshot-menu',
    title: '📱 Tablet Full Page (768px)',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'separator-3',
    parentId: 'devshot-menu',
    type: 'separator',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'open-gallery',
    parentId: 'devshot-menu',
    title: '🖼️ Open Gallery',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = info.menuItemId;

  if (id === 'open-gallery') {
    chrome.tabs.create({ url: chrome.runtime.getURL('gallery/gallery.html') });
    return;
  }

  if (id.startsWith('capture-')) {
    const type = id.replace('capture-', '');
    await queueCapture(type, tab, captureDelay);
  }
});

// ============================================
// Main Capture Executor
// ============================================

async function executeCapture(type, providedTab = null, delay = null) {
  try {
    const settings = await getSettings();
    const viewports = await getViewports();
    
    const tab = providedTab || await getCurrentTab();
    if (!tab || !tab.url) {
      return { success: false, error: 'No active tab found' };
    }

    // Skip chrome:// and edge:// URLs
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      return { success: false, error: 'Cannot capture browser internal pages' };
    }

    const url = new URL(tab.url);
    const domain = url.hostname || 'localhost';
    const timestamp = formatTimestamp();

    const [device, captureType] = type.split('-');
    
    // Apply delay for ALL devices (not just desktop) to allow page to fully load
    const waitTime = delay !== null ? delay : settings.defaultDelay;
    if (waitTime > 0) {
      console.log(`[DevShot] Waiting ${waitTime}ms for page to fully load...`);
      await sleep(waitTime);
    }
    
    let imageData;

    console.log(`Capturing: ${type} for ${domain}`);

    if (device === 'desktop') {
      if (captureType === 'viewport') {
        imageData = await captureViewport(tab);
      } else {
        imageData = await captureFullPage(tab, settings);
      }
    } else {
      const viewport = viewports[device];
      if (!viewport) {
        return { success: false, error: `Unknown device: ${device}` };
      }
      
      if (captureType === 'viewport') {
        imageData = await captureResponsiveViewport(tab.url, viewport, waitTime, settings);
      } else {
        imageData = await captureResponsiveFullPage(tab.url, viewport, waitTime, settings);
      }
    }

    if (!imageData) {
      return { success: false, error: 'Failed to capture screenshot' };
    }

    const filename = `${domain}_${device}_${captureType}_${timestamp}.png`;

    // Save to gallery
    if (settings.autoSave) {
      await saveToGallery({
        filename,
        domain,
        device,
        captureType,
        dataUrl: imageData,
        url: tab.url,
        timestamp: Date.now()
      });
    }
    
    // Also download if enabled
    if (settings.alsoDownload) {
      await chrome.downloads.download({
        url: imageData,
        filename: `DevShot/${filename}`,
        saveAs: false
      });
    }

    console.log(`Saved: ${filename}`);
    return { success: true, filename };

  } catch (error) {
    console.error('Capture error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// Capture Functions
// ============================================

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function captureViewport(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png'
    });
    return dataUrl;
  } catch (error) {
    console.error('Viewport capture error:', error);
    throw error;
  }
}

async function captureFullPage(tab) {
  try {
    // Get page dimensions
    const [{ result: dimensions }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        scrollHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio || 1
      })
    });

    const { scrollHeight, scrollWidth, viewportHeight, devicePixelRatio } = dimensions;
    
    // If page fits in viewport, just capture visible
    if (scrollHeight <= viewportHeight) {
      return await captureViewport(tab);
    }

    const numCaptures = Math.ceil(scrollHeight / viewportHeight);
    const captures = [];

    // Disable smooth scrolling and scroll-snap
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const style = document.createElement('style');
        style.id = 'devshot-scroll-override';
        style.textContent = `
          *, html, body {
            scroll-behavior: auto !important;
            scroll-snap-type: none !important;
            scroll-snap-align: none !important;
          }
        `;
        document.head.appendChild(style);
      }
    });

    // Scroll to top
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    });
    await sleep(300);

    // Capture each segment
    for (let i = 0; i < numCaptures; i++) {
      const scrollY = i * viewportHeight;
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (y) => {
          document.documentElement.scrollTop = y;
          document.body.scrollTop = y;
        },
        args: [scrollY]
      });
      
      // Chrome limits captureVisibleTab to ~1 per second
      await sleep(1200);
      
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png'
      });
      
      captures.push({
        dataUrl,
        y: scrollY,
        height: Math.min(viewportHeight, scrollHeight - scrollY)
      });
      
      // After first capture, hide fixed/sticky elements so navbar only shows at top
      if (i === 0) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            document.querySelectorAll('*').forEach(el => {
              const computed = window.getComputedStyle(el);
              if (computed.position === 'fixed' || computed.position === 'sticky') {
                el.dataset.devshotHidden = 'true';
                el.dataset.devshotOriginalDisplay = el.style.display || '';
                el.style.setProperty('display', 'none', 'important');
              }
            });
          }
        });
      }
    }

    // STEP 4: Cleanup - restore hidden elements and remove scroll override
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Remove scroll override style
        const scrollStyle = document.getElementById('devshot-scroll-override');
        if (scrollStyle) scrollStyle.remove();
        
        // Restore hidden elements
        document.querySelectorAll('[data-devshot-hidden="true"]').forEach(el => {
          el.style.display = el.dataset.devshotOriginalDisplay || '';
          delete el.dataset.devshotHidden;
          delete el.dataset.devshotOriginalDisplay;
        });
        
        console.log('[DevShot] Restored hidden elements');
      }
    });

    // Scroll back to top
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    });

    // Stitch images
    return await stitchImages(captures, { scrollWidth, scrollHeight, viewportHeight, devicePixelRatio });

  } catch (error) {
    console.error('Full page capture error:', error);
    throw error;
  }
}

async function captureResponsiveViewport(url, viewport, delay = 3000) {
  let windowId = null;
  
  try {
    const newWindow = await chrome.windows.create({
      url: url,
      type: 'popup',
      width: viewport.width + 16,
      height: viewport.height + 88,
      left: 100,
      top: 100,
      focused: false
    });
    
    windowId = newWindow.id;
    const newTab = newWindow.tabs[0];
    
    await waitForTabLoad(newTab.id);
    
    // Wait for page content to load
    await sleep(delay > 0 ? delay : 3000);
    
    // Disable animations and hide preloaders
    await disableAnimationsAndPreloaders(newTab.id);
    await sleep(500); // Let CSS apply
    
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'png'
    });
    
    return dataUrl;
    
  } finally {
    if (windowId) {
      try { await chrome.windows.remove(windowId); } catch (e) {}
    }
  }
}

async function captureResponsiveFullPage(url, viewport, delay = 3000) {
  let windowId = null;
  
  try {
    const newWindow = await chrome.windows.create({
      url: url,
      type: 'popup',
      width: viewport.width + 16,
      height: viewport.height + 88,
      left: 100,
      top: 100,
      focused: false
    });
    
    windowId = newWindow.id;
    const newTab = newWindow.tabs[0];
    
    await waitForTabLoad(newTab.id);
    
    // Wait for page content to load
    await sleep(delay > 0 ? delay : 3000);
    
    // Disable animations and hide preloaders
    await disableAnimationsAndPreloaders(newTab.id);
    await sleep(500);
    
    return await captureFullPage(newTab);
    
  } finally {
    if (windowId) {
      try { await chrome.windows.remove(windowId); } catch (e) {}
    }
  }
}

// ============================================
// Utilities
// ============================================

function waitForTabLoad(tabId, waitForResources = true) {
  return new Promise((resolve) => {
    const checkComplete = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          if (waitForResources) {
            // Additional check for document readyState and resources
            try {
              const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                  // Check if document is fully loaded
                  if (document.readyState !== 'complete') return false;
                  
                  // Check if all images are loaded
                  const images = document.querySelectorAll('img');
                  for (const img of images) {
                    if (!img.complete || img.naturalHeight === 0) return false;
                  }
                  
                  return true;
                }
              });
              if (result) {
                resolve();
                return;
              }
            } catch (e) {
              // Script injection failed, resolve anyway
              resolve();
              return;
            }
          } else {
            resolve();
            return;
          }
        }
      } catch (e) {
        // Tab doesn't exist anymore
        resolve();
        return;
      }
      setTimeout(checkComplete, 200);
    };
    
    checkComplete();
    
    // Increased timeout to 20 seconds for slow-loading pages
    setTimeout(resolve, 20000);
  });
}

// Inject CSS to disable animations and hide preloaders
async function disableAnimationsAndPreloaders(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Create style element to disable all animations
        const style = document.createElement('style');
        style.id = 'devshot-freeze';
        style.textContent = `
          *, *::before, *::after {
            animation: none !important;
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition: none !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
          
          /* Hide common preloader patterns */
          .preloader, .loader, .loading, .page-loader, .site-loader,
          .splash, .splash-screen, .intro-loader, .page-loading,
          [class*="preload"], [class*="loader"], [class*="loading-screen"],
          [id*="preload"], [id*="loader"], [id*="loading"],
          .lottie-wrapper, .loading-overlay, .page-transition {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
          }
          
          /* Ensure body is visible */
          body {
            opacity: 1 !important;
            visibility: visible !important;
            overflow: visible !important;
          }
          
          /* Remove scroll-based animations */
          [data-aos], [data-scroll], [data-animate] {
            opacity: 1 !important;
            transform: none !important;
          }
        `;
        document.head.appendChild(style);
        
        // Also try to remove preloader elements
        const preloaderSelectors = [
          '.preloader', '.loader', '.page-loader', '.site-loader',
          '.loading-screen', '.splash-screen', '#preloader', '#loader'
        ];
        preloaderSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.display = 'none';
            el.remove();
          });
        });
        
        // Scroll to top
        window.scrollTo(0, 0);
      }
    });
  } catch (error) {
    console.error('Failed to disable animations:', error);
  }
}

async function stitchImages(captures, dimensions) {
  const { scrollWidth, scrollHeight, viewportHeight, devicePixelRatio } = dimensions;
  
  console.log('[DevShot] Stitching', captures.length, 'captures');
  
  if (captures.length === 0) return null;
  if (captures.length === 1) return captures[0].dataUrl;
  
  try {
    // Load all images as ImageBitmap
    const images = [];
    for (const capture of captures) {
      const response = await fetch(capture.dataUrl);
      const blob = await response.blob();
      const img = await createImageBitmap(blob);
      images.push(img);
    }
    
    // ShareX-style: Find overlap between consecutive images by comparing pixel rows
    const overlaps = [];
    
    for (let i = 1; i < images.length; i++) {
      const prevImg = images[i - 1];
      const currImg = images[i];
      
      // Find how many rows from bottom of prevImg match top of currImg
      const overlap = await findImageOverlap(prevImg, currImg);
      console.log('[DevShot] Overlap between', i-1, 'and', i, ':', overlap);
      overlaps.push(overlap);
    }
    
    // Calculate total height (ensure minimum newHeight per segment)
    let totalHeight = images[0].height;
    for (let i = 1; i < images.length; i++) {
      const newHeight = Math.max(50, images[i].height - overlaps[i - 1]); // At least 50px new per segment
      totalHeight += newHeight;
    }
    
    console.log('[DevShot] Total stitched height:', totalHeight);
    
    // Create canvas and stitch
    const canvas = new OffscreenCanvas(images[0].width, totalHeight);
    const ctx = canvas.getContext('2d');
  
    let currentY = 0;
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      
      if (i === 0) {
        ctx.drawImage(img, 0, 0);
        currentY = img.height;
      } else {
        const overlap = overlaps[i - 1];
        // Draw only the new (non-overlapping) part
        const newHeight = Math.max(50, img.height - overlap);
        ctx.drawImage(
          img,
          0, overlap,                    // Source: skip overlapping rows
          img.width, newHeight,          // Source size
          0, currentY,                   // Dest position
          img.width, newHeight           // Dest size
        );
        currentY += newHeight;
      }
    }
    
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return blobToDataURL(blob);
    
  } catch (error) {
    console.error('[DevShot] Stitching error:', error);
    // Fallback: return first capture if stitching fails
    return captures[0].dataUrl;
  }
}

// Find how many rows from bottom of img1 match top of img2
async function findImageOverlap(img1, img2) {
  const width = Math.min(img1.width, img2.width);
  const maxOverlap = Math.min(img1.height, img2.height) - 100; // Leave minimum new content
  
  console.log('[DevShot] Finding overlap...', { img1Height: img1.height, img2Height: img2.height, maxOverlap });
  
  // Create canvases to read pixel data
  const canvas1 = new OffscreenCanvas(width, img1.height);
  const ctx1 = canvas1.getContext('2d');
  ctx1.drawImage(img1, 0, 0);
  
  const canvas2 = new OffscreenCanvas(width, img2.height);
  const ctx2 = canvas2.getContext('2d');
  ctx2.drawImage(img2, 0, 0);
  
  // Sample columns across the width (skip edges which may have scrollbars)
  const sampleCols = [];
  const margin = Math.floor(width * 0.15); // Skip 15% edges
  const numSamples = 15;
  const step = Math.floor((width - margin * 2) / numSamples);
  for (let x = margin; x < width - margin; x += step) {
    sampleCols.push(x);
  }
  
  // Find the overlap by checking row matches
  // Start from 0 and check every few pixels
  let bestOverlap = 0;
  let bestMatchScore = 0;
  
  for (let overlap = 10; overlap < maxOverlap; overlap += 3) {
    let matchScore = 0;
    const checkRows = 5; // Check 5 consecutive rows
    
    for (let row = 0; row < checkRows; row++) {
      const y1 = img1.height - overlap + row;
      const y2 = row;
      
      if (y1 < 0 || y1 >= img1.height || y2 >= img2.height) continue;
      
      const data1 = ctx1.getImageData(0, y1, width, 1).data;
      const data2 = ctx2.getImageData(0, y2, width, 1).data;
      
      let rowMatch = true;
      let matchedPixels = 0;
      
      for (const x of sampleCols) {
        const idx = x * 4;
        // Allow small color differences (anti-aliasing, compression)
        if (Math.abs(data1[idx] - data2[idx]) <= 10 &&
            Math.abs(data1[idx + 1] - data2[idx + 1]) <= 10 &&
            Math.abs(data1[idx + 2] - data2[idx + 2]) <= 10) {
          matchedPixels++;
        }
      }
      
      // Row matches if most sample pixels match
      if (matchedPixels >= sampleCols.length * 0.8) {
        matchScore++;
      }
    }
    
    if (matchScore > bestMatchScore) {
      bestMatchScore = matchScore;
      bestOverlap = overlap;
    }
    
    // Perfect match found - all rows match
    if (matchScore === checkRows) {
      console.log('[DevShot] Found perfect overlap:', overlap);
      return overlap;
    }
  }
  
  console.log('[DevShot] Best overlap found:', bestOverlap, 'with score:', bestMatchScore);
  
  // If no good match found, return 0 (no overlap detected)
  return bestMatchScore >= 3 ? bestOverlap : 0;
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function formatTimestamp() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `${date}_${time}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// IndexedDB Gallery Storage
// ============================================

const DB_NAME = 'DevShotDB';
const DB_VERSION = 1;
const STORE_NAME = 'screenshots';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        store.createIndex('domain', 'domain', { unique: false });
        store.createIndex('device', 'device', { unique: false });
        store.createIndex('captureType', 'captureType', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

async function saveToGallery(screenshotData) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(screenshotData);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (error) {
    console.error('Gallery save error:', error);
    throw error;
  }
}
