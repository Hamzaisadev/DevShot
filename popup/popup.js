// DevShot Popup
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  
  const btns = {
    bundle: $('btn-bundle'),
    batchUrls: $('btn-batch-urls'),
    gallery: $('btn-gallery'),
    settings: $('btn-settings')
  };
  
  const statusEl = $('status');
  const delaySelect = $('delay-select');
  let busy = false;
  const selectedTiles = new Set(['desktop-viewport', 'mobile-viewport']); // Default selection

  // Grid elements
  const captureGrid = $('capture-grid');
  const multiCount = $('multi-count');
  const tiles = document.querySelectorAll('.tile');

  // Batch modal elements
  const batchModal = $('batch-modal');
  const batchClose = $('batch-close');
  const batchCancel = $('batch-cancel');
  const batchStart = $('batch-start');
  const batchUrlsInput = $('batch-urls');
  const batchProgress = $('batch-progress');

  // Load saved delay
  chrome.storage.local.get(['captureDelay'], r => {
    if (r.captureDelay !== undefined) delaySelect.value = r.captureDelay;
  });

  delaySelect.addEventListener('change', () => {
    chrome.storage.local.set({ captureDelay: parseInt(delaySelect.value) });
  });

  function getDelay() {
    return parseInt(delaySelect.value) || 1000;
  }

  async function getCurrentTab() {
    let queryOptions = { active: true, currentWindow: true };
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
  }


  function showStatus(msg, type = 'info') {
    statusEl.textContent = msg;
    statusEl.className = `status-toast show ${type}`;
    
    // Auto-hide only for non-loading states
    if (type !== 'loading') {
      if (window.statusTimeout) clearTimeout(window.statusTimeout);
      window.statusTimeout = setTimeout(() => {
        statusEl.classList.remove('show');
      }, 3000);
    }
  }

  function setDisabled(disabled) {
    busy = disabled;
    btns.bundle.disabled = disabled || selectedTiles.size === 0;
    btns.batchUrls.disabled = disabled;
    if ($('btn-record')) $('btn-record').disabled = disabled;
  }

  function updateSelectedCount() {
    if (multiCount) multiCount.textContent = selectedTiles.size;
    btns.bundle.disabled = selectedTiles.size === 0;
  }

  // Pre-select defaults
  tiles.forEach(tile => {
    if (selectedTiles.has(tile.dataset.type)) {
      tile.classList.add('selected');
    }
  });
  updateSelectedCount();

  // Tile Clicks (Always Toggle)
  tiles.forEach(tile => {
    tile.addEventListener('click', () => {
      if (busy) return;
      toggleTile(tile, tile.dataset.type);
    });
  });

  function toggleTile(tile, type) {
    if (selectedTiles.has(type)) {
      selectedTiles.delete(type);
      tile.classList.remove('selected');
    } else {
      selectedTiles.add(type);
      tile.classList.add('selected');
    }
    updateSelectedCount();
  }

  $('multi-select-all').addEventListener('click', () => {
    if (busy) return;
    tiles.forEach(tile => {
      selectedTiles.add(tile.dataset.type);
      tile.classList.add('selected');
    });
    updateSelectedCount();
  });

  $('multi-select-none').addEventListener('click', () => {
    if (busy) return;
    selectedTiles.clear();
    tiles.forEach(tile => tile.classList.remove('selected'));
    updateSelectedCount();
  });

  async function capture(type, tileEl) {
    if (busy) return;
    setDisabled(true);
    
    tileEl.classList.add('btn-loading');
    const delay = getDelay();
    showStatus(delay > 0 ? `Waiting ${delay/1000}s...` : 'Capturing...', 'loading');
    
    try {
      const res = await chrome.runtime.sendMessage({ action: 'capture', type, delay });
      showStatus(res?.success ? '✓ Saved to gallery!' : (res?.error || 'Failed'), res?.success ? 'success' : 'error');
    } catch (e) {
      showStatus('Error: ' + e.message, 'error');
    }
    
    tileEl.classList.remove('btn-loading');
    setDisabled(false);
  }

  async function captureAll() {
    if (busy) return;
    const types = Array.from(selectedTiles);
    if (types.length === 0) return;

    setDisabled(true);
    btns.bundle.classList.add('btn-loading');
    
    const delay = getDelay();
    const tab = await getCurrentTab();
    if (!tab || !tab.url) {
      showStatus('No active tab found', 'error');
      setDisabled(false);
      btns.bundle.classList.remove('btn-loading');
      return;
    }

    showStatus('Pre-authorizing video...', 'loading');

    // Listener for progress updates from service worker
    const progressListener = (message) => {
      if (message.action === 'batchProgressUpdate') {
        showStatus(`Capturing ${message.current}/${message.total}...`, 'loading');
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'omniBatchCapture',
        urls: [tab.url],
        types: types,
        delay: delay
      });
      
      if (res?.success) {
        showStatus(`✓ Assets saved to gallery!`, 'success');
      } else {
        showStatus('Capture failed', 'error');
      }
    } catch (e) {
      console.error('Multi-capture error:', e);
      showStatus('Connection error', 'error');
    } finally {
      chrome.runtime.onMessage.removeListener(progressListener);
      btns.bundle.classList.remove('btn-loading');
      setDisabled(false);
    }
  }


  // Batch URLs Modal
  function showBatchModal() {
    console.log('Opening Batch Modal');
    if (!batchModal) {
        console.error('Batch Modal element not found!');
        return;
    }
    batchModal.classList.add('show');
    batchProgress.innerHTML = '';
    batchStart.disabled = false;
    batchStart.textContent = '🚀 Start';
  }

  function hideBatchModal() {
    batchModal.classList.remove('show');
  }

  function parseUrls(text) {
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(url => {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        try {
          new URL(url);
          return url;
        } catch {
          return null;
        }
      })
      .filter(url => url !== null);
  }

  // Get selected capture types from checkboxes (either modal) or tiles (main)
  // Get selected capture types from checkboxes (either modal) or tiles (main)
  function getSelectedCaptureTypes() {
    // If modal is show, use modal checkboxes
    if (batchModal.classList.contains('show')) {
      const types = [];
      if ($('cb-desktop-viewport')?.checked) types.push('desktop-viewport');
      if ($('cb-desktop-fullpage')?.checked) types.push('desktop-fullpage');
      if ($('cb-mobile-viewport')?.checked) types.push('mobile-viewport');
      if ($('cb-mobile-fullpage')?.checked) types.push('mobile-fullpage');
      if ($('cb-tablet-viewport')?.checked) types.push('tablet-viewport');
      if ($('cb-tablet-fullpage')?.checked) types.push('tablet-fullpage');
      if ($('cb-video')?.checked) types.push('video');
      return types;
    } else {
      // Use main UI selected tiles
      return Array.from(selectedTiles);
    }
  }

  // Quick select buttons
  $('select-all-types')?.addEventListener('click', () => {
    if ($('cb-desktop-viewport')) $('cb-desktop-viewport').checked = true;
    if ($('cb-desktop-fullpage')) $('cb-desktop-fullpage').checked = true;
    if ($('cb-mobile-viewport')) $('cb-mobile-viewport').checked = true;
    if ($('cb-mobile-fullpage')) $('cb-mobile-fullpage').checked = true;
    if ($('cb-tablet-viewport')) $('cb-tablet-viewport').checked = true;
    if ($('cb-tablet-fullpage')) $('cb-tablet-fullpage').checked = true;
    if ($('cb-video')) $('cb-video').checked = true;
  });

  $('select-viewports')?.addEventListener('click', () => {
    if ($('cb-desktop-viewport')) $('cb-desktop-viewport').checked = true;
    if ($('cb-desktop-fullpage')) $('cb-desktop-fullpage').checked = false;
    if ($('cb-mobile-viewport')) $('cb-mobile-viewport').checked = true;
    if ($('cb-mobile-fullpage')) $('cb-mobile-fullpage').checked = false;
    if ($('cb-tablet-viewport')) $('cb-tablet-viewport').checked = true;
    if ($('cb-tablet-fullpage')) $('cb-tablet-fullpage').checked = false;
  });

  $('select-none')?.addEventListener('click', () => {
    if ($('cb-desktop-viewport')) $('cb-desktop-viewport').checked = false;
    if ($('cb-desktop-fullpage')) $('cb-desktop-fullpage').checked = false;
    if ($('cb-mobile-viewport')) $('cb-mobile-viewport').checked = false;
    if ($('cb-mobile-fullpage')) $('cb-mobile-fullpage').checked = false;
    if ($('cb-tablet-viewport')) $('cb-tablet-viewport').checked = false;
    if ($('cb-tablet-fullpage')) $('cb-tablet-fullpage').checked = false;
    if ($('cb-video')) $('cb-video').checked = false;
  });


  async function startBatchCapture() {
    const urls = parseUrls(batchUrlsInput.value);
    const captureTypes = getSelectedCaptureTypes();
    
    if (urls.length === 0) {
      batchProgress.innerHTML = '<span style="color:#ef4444">Please enter valid URLs</span>';
      return;
    }

    if (captureTypes.length === 0) {
      batchProgress.innerHTML = '<span style="color:#ef4444">Please select at least one capture type</span>';
      return;
    }

    const screenshotTypes = captureTypes.filter(t => t !== 'video');
    const hasVideo = captureTypes.includes('video');
    
    batchStart.disabled = true;
    batchStart.textContent = '⏳ Processing...';
    
    let successCount = 0;

    // 1. Handle Screenshots (Existing logic)
    if (screenshotTypes.length > 0) {
      const screenshotTotal = urls.length * screenshotTypes.length;
      let current = 0;
      
      for (const url of urls) {
        for (const type of screenshotTypes) {
          current++;
          const hostname = new URL(url).hostname;
          batchProgress.innerHTML = `<span>📸 Capturing ${current}/${screenshotTotal}: ${hostname} (${type})...</span>`;
          
          try {
            const res = await chrome.runtime.sendMessage({
              action: 'batchCaptureUrl',
              url: url,
              type: type,
              delay: delay
            });
            if (res?.success) successCount++;
          } catch (e) {
            console.error('Screenshot capture error:', e);
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // 2. Handle Semi-Auto Video
    if (hasVideo) {
      batchProgress.innerHTML = `<span>🎥 Starting Video Batch...</span>`;
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'startVideoBatch',
          urls: urls,
          delay: delay
        });
        if (res?.success) {
           batchProgress.innerHTML = `<span style="color:#10b981">✓ Video batch session started! Follow tab prompts.</span>`;
        } else {
           batchProgress.innerHTML = `<span style="color:#ef4444">Error: ${res?.error || 'Failed to start video batch'}</span>`;
        }
      } catch (e) {
        batchProgress.innerHTML = `<span style="color:#ef4444">Connection error starting video batch</span>`;
      }
    }

    if (!hasVideo) {
      batchProgress.innerHTML = `<span style="color:#10b981">✓ Done! ${successCount}/${urls.length * screenshotTypes.length} captured</span>`;
      batchStart.textContent = '✓ Done';
      batchStart.disabled = false;
      setTimeout(() => { hideBatchModal(); }, 3000);
    } else {
      batchStart.textContent = 'Running...';
      // Keep modal open so they can see progress if needed, 
      // but they'll be in tabs mostly.
    }
  }

  // Events
  btns.bundle.addEventListener('click', captureAll);
  btns.batchUrls.addEventListener('click', showBatchModal);
  btns.gallery.addEventListener('click', () => chrome.tabs.create({ url: 'gallery/gallery.html' }));
  btns.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

  batchClose.onclick = hideBatchModal;
  batchCancel.onclick = hideBatchModal;
  batchStart.onclick = startBatchCapture;

  // Auto Scroll Video Capture using chrome.tabCapture
  const recordBtn = $('btn-record');
  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let captureStream = null;
  
  if (recordBtn) {
    recordBtn.onclick = async () => {
      if (isRecording) {
        // Stop recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        return;
      }

      try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          showStatus('No active tab found', 'error');
          return;
        }

        // Use chrome.tabCapture to capture the current tab directly
        captureStream = await new Promise((resolve, reject) => {
          chrome.tabCapture.capture({
            audio: false,
            video: true,
            videoConstraints: {
              mandatory: {
                chromeMediaSource: 'tab',
                maxWidth: 1920,
                maxHeight: 1080,
                minFrameRate: 60,
                maxFrameRate: 60
              }
            }
          }, (stream) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!stream) {
              reject(new Error('Failed to capture tab'));
            } else {
              resolve(stream);
            }
          });
        });

        recordedChunks = [];
        mediaRecorder = new MediaRecorder(captureStream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 10000000 // 10 Mbps for ultra high quality
        });

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordedChunks.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          // Create blob
          const blob = new Blob(recordedChunks, { type: 'video/webm' });
          const timestamp = Date.now();
          
          // Get domain from tab URL
          let domain = 'unknown';
          let pageUrl = '';
          try {
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (currentTab?.url) {
              const urlObj = new URL(currentTab.url);
              domain = urlObj.hostname;
              pageUrl = currentTab.url;
            }
          } catch (e) {
            console.log('Could not get tab URL');
          }
          
          const filename = `${domain}_scroll_${timestamp}.webm`;
          
          // Convert to dataURL for gallery storage
          const reader = new FileReader();
          reader.onloadend = async () => {
            const dataUrl = reader.result;
            
            // Save to gallery via service worker
            try {
              await chrome.runtime.sendMessage({
                action: 'saveVideo',
                data: {
                  filename: filename,
                  domain: domain,
                  device: 'desktop',
                  captureType: 'video',
                  dataUrl: dataUrl,
                  url: pageUrl,
                  timestamp: timestamp
                }
              });
              showStatus('Video saved to gallery!', 'success');
            } catch (e) {
              console.log('Gallery save failed:', e);
              showStatus('Save failed', 'error');
            }
          };
          reader.readAsDataURL(blob);

          // Stop capture stream
          if (captureStream) {
            captureStream.getTracks().forEach(track => track.stop());
          }

          // Reset UI
          isRecording = false;
          if ($('record-text')) $('record-text').textContent = 'Scroll';
          recordBtn.classList.remove('recording');
          showStatus('Video saved!', 'success');
        };

        // Start recording
        mediaRecorder.start();
        isRecording = true;
        if ($('record-text')) $('record-text').textContent = 'Stop';
        recordBtn.classList.add('recording');

        // Reload the page first to capture animations
        await chrome.tabs.reload(tab.id);
        
        // Wait for page to load (3 seconds)
        await new Promise(r => setTimeout(r, 3000));

        showStatus('Recording tab... scrolling automatically', 'info');

        // Inject smooth scroll into the page and await its completion
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              return new Promise((resolve) => {
                // Disable CSS smooth scroll to allow fast scrolling
                const style = document.createElement('style');
                style.textContent = 'html, body { scroll-behavior: auto !important; }';
                document.head.appendChild(style);
                
                const pixelsPerFrame = 6; // Slower is smoother for capture
                let currentPos = window.scrollY;
                let lastScrollY = -1;
                let stuckCount = 0;

                const getScrollMax = () => {
                  return Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                  ) - window.innerHeight;
                };

                function step() {
                  const maxScroll = getScrollMax();
                  const currentScroll = window.scrollY;

                  // Check if reached bottom (with slight buffer)
                  if (currentScroll >= maxScroll - 2) {
                    style.remove();
                    resolve({ success: true, reason: 'reached_bottom' });
                    return;
                  }

                  // Detect if stuck
                  if (Math.abs(currentScroll - lastScrollY) < 1) {
                    stuckCount++;
                    if (stuckCount > 60) { // ~1s at 60fps - increased for slower sites
                      style.remove();
                      resolve({ success: true, reason: 'stuck' });
                      return;
                    }
                  } else {
                    stuckCount = 0;
                  }
                  lastScrollY = currentScroll;

                  currentPos += pixelsPerFrame;
                  window.scrollTo(0, Math.min(currentPos, maxScroll));
                  requestAnimationFrame(step);
                }

                // Initial delay to let settle
                setTimeout(() => requestAnimationFrame(step), 500);
              });
            }
          });
        } catch (scrollErr) {
          console.error('Scrolling error:', scrollErr);
        }

        // Auto-stop recording if it's still running
        if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }

      } catch (err) {
        console.error('Tab capture error:', err);
        showStatus('Capture failed: ' + err.message, 'error');
        isRecording = false;
        if ($('record-text')) $('record-text').textContent = 'Scroll';
        if (captureStream) {
          captureStream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }

});
