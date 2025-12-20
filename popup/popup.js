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


  function showStatus(msg, type = 'loading') {
    statusEl.textContent = msg;
    statusEl.className = 'status show ' + type;
    if (type !== 'loading') {
      setTimeout(() => statusEl.classList.remove('show'), 2500);
    }
  }

  function setDisabled(disabled) {
    busy = disabled;
    Object.values(btns).forEach(b => {
      if (b !== btns.gallery) b.disabled = disabled;
    });
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
    
    btn.classList.remove('btn-loading');
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
    $('cb-desktop-viewport').checked = true;
    $('cb-desktop-fullpage').checked = true;
    $('cb-mobile-viewport').checked = true;
    $('cb-mobile-fullpage').checked = true;
    $('cb-tablet-viewport').checked = true;
    $('cb-tablet-fullpage').checked = true;
    if ($('cb-video')) $('cb-video').checked = true;
  });

  $('select-viewports')?.addEventListener('click', () => {
    $('cb-desktop-viewport').checked = true;
    $('cb-desktop-fullpage').checked = false;
    $('cb-mobile-viewport').checked = true;
    $('cb-mobile-fullpage').checked = false;
    $('cb-tablet-viewport').checked = true;
    $('cb-tablet-fullpage').checked = false;
    if ($('cb-video')) $('cb-video').checked = false;
  });

  $('select-none')?.addEventListener('click', () => {
    $('cb-desktop-viewport').checked = false;
    $('cb-desktop-fullpage').checked = false;
    $('cb-mobile-viewport').checked = false;
    $('cb-mobile-fullpage').checked = false;
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

    const delay = getDelay();
    
    batchStart.disabled = true;
    batchStart.textContent = '⏳ Authorizing...';
    batchProgress.innerHTML = '<span style="color:var(--text-dim)">Pre-authorizing video captures...</span>';

    // Set up progress listener
    const progressListener = (message) => {
      if (message.action === 'batchProgressUpdate') {
        const { current, total, url, type } = message;
        const hostname = new URL(url).hostname;
        batchProgress.innerHTML = `<span>Capturing ${current}/${total}: ${hostname} (${type})...</span>`;
        if (current === total) {
           batchStart.textContent = '⏳ Saving...';
        } else {
           batchStart.textContent = '⏳ Processing...';
        }
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    try {
      // Send consolidated batch request
      const res = await chrome.runtime.sendMessage({
        action: 'omniBatchCapture',
        urls: urls,
        types: captureTypes,
        delay: delay
      });
      
      if (res?.success) {
        batchProgress.innerHTML = `<span style="color:#10b981">✓ Done! ${res.count}/${res.total} captured</span>`;
        batchStart.textContent = '✓ Done';
      } else {
        batchProgress.innerHTML = `<span style="color:#ef4444">Error: ${res?.error || 'Batch failed'}</span>`;
        batchStart.disabled = false;
        batchStart.textContent = 'Start Capture';
      }
    } catch (e) {
      console.error('Batch error:', e);
      batchProgress.innerHTML = `<span style="color:#ef4444">Connection Error</span>`;
      batchStart.disabled = false;
      batchStart.textContent = 'Start Capture';
    } finally {
      chrome.runtime.onMessage.removeListener(progressListener);
      // Auto-close after 3s
      if (batchStart.textContent === '✓ Done') {
        setTimeout(() => {
          hideBatchModal();
        }, 3000);
      }
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
                maxFrameRate: 30
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
          mimeType: 'video/webm;codecs=vp9'
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
          recordBtn.textContent = '🎬 Auto Scroll Video';
          recordBtn.classList.remove('recording');
          showStatus('Video saved!', 'success');
        };

        // Start recording
        mediaRecorder.start();
        isRecording = true;
        recordBtn.textContent = '⏹️ Stop Recording';
        recordBtn.classList.add('recording');

        // Reload the page first to capture animations
        await chrome.tabs.reload(tab.id);
        
        // Wait for page to load (3 seconds)
        await new Promise(r => setTimeout(r, 3000));

        // Inject smooth scroll into the page
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Already at top after reload
            
            // Start scroll after animations play (2 sec delay)
            setTimeout(() => {
              // Disable CSS smooth scroll to allow fast scrolling
              document.documentElement.style.scrollBehavior = 'auto';
              document.body.style.scrollBehavior = 'auto';
              
              // ========== ADJUST SPEED HERE ==========
              const pixelsPerStep = 12;    // Pixels to scroll each step (higher = faster)
              const intervalMs = 16;       // Milliseconds between steps (16 = 60fps)
              // ========================================
              
              let lastScrollY = -1;
              let stuckCount = 0;
              
              const scrollInterval = setInterval(() => {
                const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                const currentScroll = window.scrollY;
                
                // Check if reached bottom
                if (currentScroll >= maxScroll - 5) {
                  clearInterval(scrollInterval);
                  return;
                }
                
                // Detect if stuck (scroll position not changing)
                if (Math.abs(currentScroll - lastScrollY) < 1) {
                  stuckCount++;
                  if (stuckCount > 10) {
                    // Stuck for too long, stop
                    clearInterval(scrollInterval);
                    return;
                  }
                } else {
                  stuckCount = 0;
                }
                lastScrollY = currentScroll;
                
                // Force instant scroll
                window.scrollTo({ top: currentScroll + pixelsPerStep, behavior: 'instant' });
              }, intervalMs);
            }, 300);
          }
        });

        showStatus('Recording tab... scrolling automatically', 'info');

      } catch (err) {
        console.error('Tab capture error:', err);
        showStatus('Capture failed: ' + err.message, 'error');
        isRecording = false;
        recordBtn.textContent = '🎬 Auto Scroll Video';
        if (captureStream) {
          captureStream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }

  function showStatus(msg, type = 'info') {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + type;
    statusEl.style.display = 'block';
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
});
