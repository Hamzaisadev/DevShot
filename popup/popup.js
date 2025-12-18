// DevShot Popup
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  
  const btns = {
    viewport: $('btn-viewport'),
    fullpage: $('btn-fullpage'),
    mobileViewport: $('btn-mobile-viewport'),
    mobileFullpage: $('btn-mobile-fullpage'),
    tabletViewport: $('btn-tablet-viewport'),
    tabletFullpage: $('btn-tablet-fullpage'),
    bundle: $('btn-bundle'),
    batchUrls: $('btn-batch-urls'),
    gallery: $('btn-gallery'),
    settings: $('btn-settings')
  };
  
  const statusEl = $('status');
  const delaySelect = $('delay-select');
  let busy = false;

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
      if (b !== btns.gallery && b !== btns.batchUrls) b.disabled = disabled;
    });
  }

  async function capture(type, btn) {
    if (busy) return;
    setDisabled(true);
    
    // Add loading spinner to the clicked button
    btn.classList.add('btn-loading');
    
    const delay = getDelay();
    showStatus(delay > 0 ? `Waiting ${delay/1000}s...` : 'Capturing...', 'loading');
    
    try {
      const res = await chrome.runtime.sendMessage({ action: 'capture', type, delay });
      showStatus(res?.success ? '✓ Saved to gallery!' : (res?.error || 'Failed'), res?.success ? 'success' : 'error');
    } catch (e) {
      showStatus('Error: ' + e.message, 'error');
    }
    
    btn.classList.remove('btn-loading');
    setDisabled(false);
  }


  async function captureAll() {
    if (busy) return;
    setDisabled(true);
    btns.bundle.classList.add('btn-loading');
    
    const types = ['desktop-viewport', 'desktop-fullpage', 'mobile-viewport', 'mobile-fullpage', 'tablet-viewport', 'tablet-fullpage'];
    const delay = getDelay();
    
    for (let i = 0; i < types.length; i++) {
      showStatus(`Capturing ${i + 1}/6...`, 'loading');
      try {
        await chrome.runtime.sendMessage({ action: 'capture', type: types[i], delay });
      } catch (e) {
        console.error(e);
      }
      if (i < types.length - 1) await new Promise(r => setTimeout(r, 800));
    }
    
    btns.bundle.classList.remove('btn-loading');
    showStatus('✓ All 6 saved!', 'success');
    setDisabled(false);
  }


  // Batch URLs Modal
  function showBatchModal() {
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

  // Get selected capture types from checkboxes
  function getSelectedCaptureTypes() {
    const types = [];
    if ($('cb-desktop-viewport')?.checked) types.push('desktop-viewport');
    if ($('cb-desktop-fullpage')?.checked) types.push('desktop-fullpage');
    if ($('cb-mobile-viewport')?.checked) types.push('mobile-viewport');
    if ($('cb-mobile-fullpage')?.checked) types.push('mobile-fullpage');
    if ($('cb-tablet-viewport')?.checked) types.push('tablet-viewport');
    if ($('cb-tablet-fullpage')?.checked) types.push('tablet-fullpage');
    return types;
  }

  // Quick select buttons
  $('select-all-types')?.addEventListener('click', () => {
    $('cb-desktop-viewport').checked = true;
    $('cb-desktop-fullpage').checked = true;
    $('cb-mobile-viewport').checked = true;
    $('cb-mobile-fullpage').checked = true;
    $('cb-tablet-viewport').checked = true;
    $('cb-tablet-fullpage').checked = true;
  });

  $('select-viewports')?.addEventListener('click', () => {
    $('cb-desktop-viewport').checked = true;
    $('cb-desktop-fullpage').checked = false;
    $('cb-mobile-viewport').checked = true;
    $('cb-mobile-fullpage').checked = false;
    $('cb-tablet-viewport').checked = true;
    $('cb-tablet-fullpage').checked = false;
  });

  $('select-none')?.addEventListener('click', () => {
    $('cb-desktop-viewport').checked = false;
    $('cb-desktop-fullpage').checked = false;
    $('cb-mobile-viewport').checked = false;
    $('cb-mobile-fullpage').checked = false;
    $('cb-tablet-viewport').checked = false;
    $('cb-tablet-fullpage').checked = false;
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
    const totalCaptures = urls.length * captureTypes.length;
    
    batchStart.disabled = true;
    batchStart.textContent = '⏳ Capturing...';
    batchProgress.innerHTML = '';

    let success = 0, failed = 0, current = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const hostname = new URL(url).hostname;
      
      for (let j = 0; j < captureTypes.length; j++) {
        current++;
        const captureType = captureTypes[j];
        
        batchProgress.innerHTML = `<span>Capturing ${current}/${totalCaptures}: ${hostname} (${captureType})...</span>`;

        try {
          const res = await chrome.runtime.sendMessage({
            action: 'batchCaptureUrl',
            url: url,
            type: captureType,
            delay: delay // Apply full delay to every capture for proper page loading
          });
          
          if (res?.success) {
            success++;
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
        }

        // Wait between captures
        if (current < totalCaptures) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    batchProgress.innerHTML = `<span style="color:#10b981">✓ Done! ${success}/${totalCaptures} captured</span>`;
    batchStart.textContent = '✓ Done';
    
    // Auto-close after 2s
    setTimeout(() => {
      hideBatchModal();
    }, 2000);
  }

  // Events
  btns.viewport.onclick = () => capture('desktop-viewport', btns.viewport);
  btns.fullpage.onclick = () => capture('desktop-fullpage', btns.fullpage);
  btns.mobileViewport.onclick = () => capture('mobile-viewport', btns.mobileViewport);
  btns.mobileFullpage.onclick = () => capture('mobile-fullpage', btns.mobileFullpage);
  btns.tabletViewport.onclick = () => capture('tablet-viewport', btns.tabletViewport);
  btns.tabletFullpage.onclick = () => capture('tablet-fullpage', btns.tabletFullpage);
  btns.bundle.onclick = captureAll;
  btns.batchUrls.onclick = showBatchModal;
  btns.gallery.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('gallery/gallery.html') });
  btns.settings.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });

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
