// DevShot Service Worker
// Handles screenshot capture and background operations

// ============================================
// Configuration & Settings
// ============================================

// Default settings
const DEFAULT_SETTINGS = {
  defaultDelay: 2000,

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

let captureDelay = 5000; // Global delay state

// Batch Video State
let videoBatchState = {
    active: false,
    urls: [],
    index: 0,
    tabId: null
};

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
    (async () => {
      if (message.type === 'scroll-video') {
        const tabId = message.tabId;
        if (tabId) {
          const result = await captureScrollVideoInCurrentTab(tabId, message.url, message.delay);
          sendResponse(result);
        } else {
          sendResponse({ success: false, error: 'No tab ID provided' });
        }
      } else if (message.type.includes('video')) {
        captureUrlVideo(message.url, message.type, message.delay)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
      } else {
        captureUrlScreenshot(message.url, message.type, message.delay)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
      }
    })();
    return true;
  }

  // Handle omni batch capture (multiple types for a single URL)
  if (message.action === 'omniBatchCapture') {
    handleOmniBatch(message.urls, message.types, message.delay)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Save video from batch assistant
  if (message.action === 'saveVideo') {
    (async () => {
      try {
        const settings = await getSettings();
        if (settings.autoSave) {
          await saveToGallery(message.data);
          console.log(`[DevShot] Video saved: ${message.data.filename}`);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Auto-save is disabled' });
        }
      } catch (err) {
        console.error('[DevShot] Save error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Start Video Batch (Semi-Auto)
  if (message.action === 'startVideoBatch') {
    videoBatchState = {
        active: true,
        urls: message.urls,
        index: 0,
        tabId: null
    };
    processNextVideoBatchItem();
    sendResponse({ success: true });
    return true;
  }

  // Next Video Batch Item
  if (message.action === 'videoBatchNext') {
    videoBatchState.index++;
    processNextVideoBatchItem();
    sendResponse({ success: true });
    return true;
  }
});

async function processNextVideoBatchItem() {
    if (!videoBatchState.active) return;

    if (videoBatchState.index >= videoBatchState.urls.length) {
        console.log('[DevShot Video Batch] Finished all URLs');
        videoBatchState.active = false;
        // Optionally notify user or close last tab
        return;
    }

    const url = videoBatchState.urls[videoBatchState.index];
    console.log(`[DevShot Video Batch] Processing ${videoBatchState.index + 1}/${videoBatchState.urls.length}: ${url}`);

    try {
        let tab;
        if (videoBatchState.tabId) {
            // Update existing tab if it's still open
            try {
                tab = await chrome.tabs.update(videoBatchState.tabId, { url, active: true });
            } catch (e) {
                // Tab likely closed, create new
                tab = await chrome.tabs.create({ url, active: true });
            }
        } else {
            tab = await chrome.tabs.create({ url, active: true });
        }

        videoBatchState.tabId = tab.id;

        // Wait for tab to load
        await waitForTabLoad(tab.id);
        
        // Give it a moment to settle
        await sleep(1000);

        // Inject the batch video content script
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/batch-video.js']
        });

    } catch (err) {
        console.error('[DevShot Video Batch] Error processing item:', err);
        // Move to next anyway or stop? Let's move to next for robustness
        videoBatchState.index++;
        processNextVideoBatchItem();
    }
}



async function handleOmniBatch(urls, types, delay) {
    const total = urls.length * types.length;
    let current = 0;
    let successCount = 0;
    
    // Get current active tab - we will navigate THIS tab to each URL
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
        return { success: false, error: 'No active tab found' };
    }
    const tabId = activeTab.id;
    
    // Process each URL/type sequentially in the SAME tab
    for (const url of urls) {
        for (const type of types) {
            current++;
            chrome.runtime.sendMessage({ 
                action: 'batchProgressUpdate', 
                current, total, url, type 
            }).catch(() => {});

            try {
                let res;
                if (type === 'scroll-video') {
                    // Navigate current tab and record scroll video
                    res = await captureScrollVideoInCurrentTab(tabId, url, delay);
                } else {
                    // Screenshot - still uses popup window for different viewports
                    res = await captureUrlScreenshot(url, type, delay);
                }
                if (res.success) successCount++;
            } catch (e) {
                console.error(`[DevShot Batch] Failed for ${url}:`, e);
            }
            await sleep(1000);
        }
    }
    
    return { success: true, count: successCount, total };
}

// Scroll video capture using popup window (avoids activeTab permission issues)
async function captureScrollVideoInCurrentTab(tabId, url, delay = 3000) {
    let windowId = null;
    
    try {
        const settings = await getSettings();
        
        // Create offscreen document if needed
        const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (existingContexts.length === 0) {
            await chrome.offscreen.createDocument({
                url: 'offscreen/offscreen.html',
                reasons: ['USER_MEDIA'],
                justification: 'Recording tab video'
            });
        }
        
        // Create a new focused popup window for the URL (fixes activeTab permission issue)
        // Use 1280x720 to fit most screens (1920x1080 can exceed screen bounds)
        const { windowId: wId, tab: newTab } = await createCaptureWindow(url, 1280, 720, delay);
        windowId = wId;
        
        // Get stream ID for the focused tab - wrapping in Promise for reliability
        console.log(`[DevShot ScrollVideo] Requesting stream ID for tab: ${newTab.id}`);
        const streamId = await new Promise((resolve) => {
          chrome.tabCapture.getMediaStreamId({ targetTabId: newTab.id }, (id) => {
            if (chrome.runtime.lastError) {
              console.error('[DevShot ScrollVideo] getMediaStreamId error:', chrome.runtime.lastError.message);
              resolve(null);
            } else {
              resolve(id);
            }
          });
        });

        if (!streamId) throw new Error('Failed to obtain stream ID (Check if window is focused)');
        
        console.log('[DevShot ScrollVideo] Starting recording...');
        
        // Start recording in offscreen
        await chrome.runtime.sendMessage({ target: 'offscreen', action: 'startRecording', data: { streamId } });
        
        // Inject smooth scroller and wait for completion
        await chrome.scripting.executeScript({
            target: { tabId: newTab.id },
            func: () => {
                return new Promise((resolve) => {
                    const style = document.createElement('style');
                    style.textContent = 'html, body { scroll-behavior: auto !important; }';
                    document.head.appendChild(style);
                    
                    const getMax = () => Math.max(
                        document.body.scrollHeight,
                        document.documentElement.scrollHeight
                    ) - window.innerHeight;
                    
                    const max = getMax();
                    if (max <= 0) { 
                        setTimeout(resolve, 1000); 
                        return; 
                    }
                    
                    let current = 0;
                    let lastY = -1;
                    let stuckCount = 0;
                    
                    function step() {
                        const currentY = window.scrollY;
                        
                        if (currentY >= max - 2) {
                            style.remove();
                            setTimeout(resolve, 500);
                            return;
                        }
                        
                        if (Math.abs(currentY - lastY) < 1) {
                            stuckCount++;
                            if (stuckCount > 60) {
                                style.remove();
                                setTimeout(resolve, 500);
                                return;
                            }
                        } else {
                            stuckCount = 0;
                        }
                        lastY = currentY;
                        
                        current += 6;
                        window.scrollTo(0, Math.min(current, max));
                        requestAnimationFrame(step);
                    }
                    
                    setTimeout(() => requestAnimationFrame(step), 300);
                });
            }
        });
        
        console.log('[DevShot ScrollVideo] Scrolling complete, stopping recording...');
        
        // Stop recording
        const response = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'stopRecording' });
        if (!response.success) throw new Error(response.error);
        
        // Save to gallery
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const timestamp = formatTimestamp();
        const filename = `${domain}_scroll_${timestamp}.webm`;
        
        if (settings.autoSave) {
            await saveToGallery({
                filename, 
                domain, 
                device: 'desktop', 
                captureType: 'video',
                dataUrl: response.dataUrl, 
                url: url, 
                timestamp: Date.now()
            });
        }
        
        console.log('[DevShot ScrollVideo] Saved:', filename);
        return { success: true, filename };
        
    } catch (error) {
        console.error('[DevShot ScrollVideo] Error:', error);
        return { success: false, error: error.message };
    } finally {
        // Clean up the window
        if (windowId) {
            try { await chrome.windows.remove(windowId); } catch (e) {}
        }
    }
}

async function captureUrlVideo(url, type, delay = 5000, preAuth = null) {
    let windowId = preAuth?.windowId || null;
    
    try {
        const settings = await getSettings();
        const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });

        if (existingContexts.length === 0) {
            await chrome.offscreen.createDocument({
                url: 'offscreen/offscreen.html',
                reasons: ['USER_MEDIA'],
                justification: 'Recording tab video'
            });
        }

        let newTab = preAuth?.tab || null;
        let streamId = preAuth?.streamId || null;

        if (!preAuth) {
            let w = 1280, h = 800;
            if (type === 'laptop-video') { w = 1280; h = 800; }
            else if (type === 'mobile-video') { w = 375; h = 812; }
            
            const result = await createCaptureWindow(url, w, h, delay);
            windowId = result.windowId;
            newTab = result.tab;
            console.log(`[DevShot Video] Requesting stream ID for tab: ${newTab.id}`);
            streamId = await new Promise((resolve) => {
              chrome.tabCapture.getMediaStreamId({ targetTabId: newTab.id }, (id) => {
                if (chrome.runtime.lastError) {
                  console.error('[DevShot Video] getMediaStreamId error:', chrome.runtime.lastError.message);
                  resolve(null);
                } else {
                  resolve(id);
                }
              });
            });
        } else {
            await chrome.windows.update(windowId, { state: 'normal', focused: true });
            await waitForTabLoad(newTab.id);
            if (settings.freezeAnimations || settings.hidePreloaders) {
                await disableAnimationsAndPreloaders(newTab.id);
            }
            if (delay > 0) await sleep(delay);
        }

        if (!streamId) throw new Error('Failed to obtain stream ID');

        // Start recording in offscreen
        await chrome.runtime.sendMessage({ target: 'offscreen', action: 'startRecording', data: { streamId } });

        // Inject smooth rAF scroller
        await chrome.scripting.executeScript({
            target: { tabId: newTab.id },
            func: () => {
                return new Promise((resolve) => {
                    const style = document.createElement('style');
                    style.innerHTML = '* { scroll-behavior: auto !important; }';
                    document.head.appendChild(style);
                    const getMax = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;
                    const max = getMax();
                    if (max <= 0) { setTimeout(resolve, 1000); return; }
                    let current = 0;
                    const step = () => {
                        current += 6;
                        window.scrollTo(0, current);
                        if (current < max) requestAnimationFrame(step);
                        else { setTimeout(() => { style.remove(); resolve(); }, 500); }
                    };
                    setTimeout(() => requestAnimationFrame(step), 200);
                });
            }
        });

        // Stop recording
        const response = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'stopRecording' });
        if (!response.success) throw new Error(response.error);

        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const timestamp = formatTimestamp();
        const filename = `${domain}_${timestamp}.webm`;

        if (settings.autoSave) {
            await saveToGallery({
                filename, domain, device: 'desktop', captureType: 'video',
                dataUrl: response.dataUrl, url: url, timestamp: Date.now()
            });
        }
        return { success: true, filename };
    } catch (error) {
        console.error('Video capture error:', error);
        return { success: false, error: error.message };
    } finally {
        if (windowId) try { await chrome.windows.remove(windowId); } catch (e) {}
    }
}

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

    console.log(`[DevShot Batch] Starting capture for: ${url} with delay: ${delay}ms`);

    // Determine viewport dimensions based on device
    let viewport = null;
    if (device === 'mobile') {
      viewport = viewports.mobile;
    } else if (device === 'tablet') {
      viewport = viewports.tablet;
    }

    // For mobile/tablet, create a window with specific viewport
    if (viewport) {
      const { windowId: wId, tab: newTab } = await createCaptureWindow(url, viewport.width, viewport.height, delay);
      windowId = wId;
      
      let imageData;
      if (captureType === 'viewport') {
        imageData = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
        // Restore window focus if needed
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
      // Desktop - create tab in new window
      const { windowId: wId, tab: newTab } = await createCaptureWindow(url, 1400, 900, delay);
      windowId = wId;
      
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

    // Skip chrome://, edge://, chrome-extension://, and other internal pages
    const internalProtocols = ['chrome:', 'edge:', 'about:', 'chrome-extension:', 'view-source:'];
    if (internalProtocols.some(proto => tab.url.startsWith(proto))) {
      return { success: false, error: 'Cannot capture browser internal or extension pages' };
    }

    const url = new URL(tab.url);
    const domain = url.hostname || 'localhost';
    const timestamp = formatTimestamp();

    const [device, captureType] = type.split('-');
    
    // Respect user delay or use default
    const waitTime = delay !== null ? delay : settings.defaultDelay;
    
    let imageData;
    console.log(`[DevShot] Executing ${type} capture for ${domain}`);

    if (device === 'desktop') {
      if (captureType === 'viewport') {
        // Desktop Viewport
        if (waitTime > 0) await sleep(waitTime);
        imageData = await captureViewport(tab);
      } else {
        // Desktop Full Page
        imageData = await captureFullPage(tab, waitTime);
      }
    } else {
      const viewport = viewports[device];
      if (!viewport) return { success: false, error: `Unknown device: ${device}` };
      
      if (captureType === 'viewport') {
        imageData = await captureResponsiveViewport(tab.url, viewport, waitTime);
      } else {
        imageData = await captureResponsiveFullPage(tab.url, viewport, waitTime);
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
    console.error('[DevShot] Executor error:', error);
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

async function captureFullPage(tab, initialDelay = 3000) {
  try {
    // Wait initial delay
    if (initialDelay > 0) await sleep(initialDelay);
    
    // Get page dimensions
    const [{ result: dimensions }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        scrollHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      })
    });

    const { scrollHeight, viewportHeight } = dimensions;
    
    // If page fits in viewport, just capture visible
    if (scrollHeight <= viewportHeight + 10) {
      return await captureViewport(tab);
    }

    // Disable smooth scrolling to prevent blurry captures
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const style = document.createElement('style');
        style.id = 'devshot-scroll-lock';
        style.textContent = 'html, body { scroll-behavior: auto !important; }';
        document.head.appendChild(style);
      }
    });

    const captures = [];
    const numCaptures = Math.ceil(scrollHeight / viewportHeight);

    for (let i = 0; i < numCaptures; i++) {
        const y = i * viewportHeight;
        const actualY = Math.min(y, scrollHeight - viewportHeight);
        
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (newY) => window.scrollTo(0, newY),
          args: [actualY]
        });

        // Longer delay for full page segments to allow rendering
        await sleep(2000);

        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        
        captures.push({
          dataUrl,
          y: actualY,
          height: viewportHeight
        });

        // Hide sticky/fixed elements after first segment
        if (i === 0) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const elements = document.querySelectorAll('*');
              elements.forEach(el => {
                const pos = window.getComputedStyle(el).position;
                if (pos === 'fixed' || pos === 'sticky') {
                  el.dataset.dsHidden = 'true';
                  el.style.setProperty('display', 'none', 'important');
                }
              });
            }
          });
        }
    }

    // Restore elements
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        document.querySelectorAll('[data-ds-hidden]').forEach(el => {
          el.style.display = '';
          delete el.dataset.dsHidden;
        });
        const style = document.getElementById('devshot-scroll-lock');
        if (style) style.remove();
        window.scrollTo(0, 0);
      }
    });

    return await stitchImages(captures, dimensions);

  } catch (error) {
    console.error('[DevShot] FullPage error:', error);
    throw error;
  }
}

async function captureResponsiveViewport(url, viewport, delay = 3000) {
  let windowId = null;
  
  try {
    const { windowId: wId, tab } = await createCaptureWindow(url, viewport.width, viewport.height, delay);
    windowId = wId;
    
    // Capture
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
    const { windowId: wId, tab } = await createCaptureWindow(url, viewport.width, viewport.height, delay);
    windowId = wId;
    
    return await captureFullPage(tab);
    
  } finally {
    if (windowId) {
      try { await chrome.windows.remove(windowId); } catch (e) {}
    }
  }
}



// ============================================
// Utilities
// ============================================

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 20000); // 20 sec max
    
    const check = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          // Extra "settle" time to catch late-load animations/elements
          await sleep(1500); 
          clearTimeout(timeout);
          resolve(true);
          return;
        }
        setTimeout(check, 200); // Check every 200ms
      } catch (e) {
        clearTimeout(timeout);
        resolve(false);
      }
    };
    check();
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

// Crop image to exact dimensions using OffscreenCanvas
async function cropImage(dataUrl, targetWidth, targetHeight) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    
    // Draw the image, cropping to top-left corner
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight, 0, 0, targetWidth, targetHeight);
    
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(croppedBlob);
    });
  } catch (error) {
    console.error('[DevShot] Crop error:', error);
    return dataUrl; // Return original on error
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

// Video capture using offscreen


// Helper to create a window, wait for load, and wait for delay
async function createCaptureWindow(url, width, height, delay) {
    const newWindow = await chrome.windows.create({
        url: url,
        type: 'popup',
        width: width + 16, // Chrome window frame padding
        height: height + 88, // Chrome window frame padding
        left: 100,
        top: 100,
        focused: true // Focus early to prevent background throttling
    });
    
    const windowId = newWindow.id;
    const newTab = newWindow.tabs[0];
    
    // Robust wait for load
    const loaded = await waitForTabLoad(newTab.id);
    if (!loaded) {
        try { await chrome.windows.remove(windowId); } catch (e) {}
        throw new Error('Timeout waiting for page to load');
    }

    // Ensure focused again before delay (important for throttling)
    await chrome.windows.update(windowId, { focused: true });
    
    // User specified delay
    if (delay > 0) {
        console.log(`[DevShot] Waiting for user delay: ${delay}ms with window focused...`);
        await sleep(delay);
        console.log(`[DevShot] Delay complete.`);
    }
    
    return { windowId, tab: newTab };
}