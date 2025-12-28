// DevShot Video Recording Control - Injected into pages for semi-auto video capture
(function() {
  // Prevent double injection
  if (window.__devshotVideoControlInjected) return;
  window.__devshotVideoControlInjected = true;

  let config = null;

  // Create the control panel UI
  function createControlPanel(cfg) {
    config = cfg;
    
    const panel = document.createElement('div');
    panel.id = 'devshot-video-control';
    panel.innerHTML = `
      <div class="devshot-header">
        <div class="devshot-logo">📹</div>
        <div class="devshot-title">DevShot Video</div>
      </div>
      <div class="devshot-progress">${config.progress || ''}</div>
      <div class="devshot-status">Click "Start Recording" when ready. The control panel will hide and auto-scroll will begin.</div>
      <button class="devshot-btn devshot-btn-primary" id="devshot-start-btn">
        🎬 Start Recording
      </button>
      <button class="devshot-btn devshot-btn-skip" id="devshot-skip-btn">
        Skip this URL
      </button>
    `;
    document.body.appendChild(panel);

    // Button handlers
    document.getElementById('devshot-start-btn').onclick = startRecording;
    document.getElementById('devshot-skip-btn').onclick = skipUrl;
  }

  // Skip current URL
  function skipUrl() {
    chrome.runtime.sendMessage({ 
      action: 'videoControlResponse', 
      response: 'skipped',
      batchId: config.batchId
    });
    removeControlPanel();
  }

  // Start recording - hide panel first, then tell service worker to record
  async function startRecording() {
    const startBtn = document.getElementById('devshot-start-btn');
    const statusEl = document.querySelector('#devshot-video-control .devshot-status');
    
    startBtn.disabled = true;
    startBtn.innerHTML = '⏳ Starting...';
    statusEl.textContent = 'Starting recording...';

    // Small delay so user sees the status change
    await new Promise(r => setTimeout(r, 300));
    
    // HIDE the control panel BEFORE recording starts so it won't be captured
    const panel = document.getElementById('devshot-video-control');
    if (panel) panel.style.display = 'none';
    
    // Wait a frame for the panel to be hidden
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 100)));
    
    // Tell service worker to start recording (it will use tabCapture)
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'startSemiAutoRecording',
        batchId: config.batchId,
        url: window.location.href,
        domain: window.location.hostname
      });
      
      if (response?.success) {
        // Recording started by service worker, now we auto-scroll
        await performAutoScroll();
        
        // Tell service worker scrolling is done, stop recording
        await chrome.runtime.sendMessage({
          action: 'stopSemiAutoRecording',
          batchId: config.batchId
        });
        
        // Clean up ONLY on success
        removeControlPanel();
      } else {
        // Show specific error from service worker
        if (panel) panel.style.display = 'block';
        const errorMsg = response?.error || 'Failed to start recording';
        statusEl.innerHTML = `<span style="color: #ef4444; font-weight: 600;">Error:</span> ${errorMsg}`;
        startBtn.disabled = false;
        startBtn.innerHTML = '🎬 Try Again';
        startBtn.classList.remove('devshot-btn-recording'); // Remove pulse if it was 🔴 Recording...
        startBtn.classList.add('devshot-btn-primary');
      }
    } catch (error) {
      console.error('[DevShot] Recording error:', error);
      if (panel) panel.style.display = 'block';
      statusEl.innerHTML = `<span style="color: #ef4444; font-weight: 600;">Error:</span> ${error.message}`;
      startBtn.disabled = false;
      startBtn.innerHTML = '🎬 Try Again';
      startBtn.classList.remove('devshot-btn-recording');
      startBtn.classList.add('devshot-btn-primary');
    }
  }

  // Auto-scroll the page
  function performAutoScroll() {
    return new Promise((resolve) => {
      // Disable smooth scroll
      const style = document.createElement('style');
      style.id = 'devshot-scroll-style';
      style.textContent = 'html, body { scroll-behavior: auto !important; }';
      document.head.appendChild(style);

      const getMaxScroll = () => Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      ) - window.innerHeight;

      const maxScroll = getMaxScroll();
      
      if (maxScroll <= 0) {
        // Page doesn't scroll, wait a moment then resolve
        setTimeout(() => {
          style.remove();
          resolve();
        }, 2000);
        return;
      }

      let currentPos = 0;
      let lastY = -1;
      let stuckCount = 0;

      function step() {
        const currentY = window.scrollY;

        // Check if reached bottom
        if (currentY >= maxScroll - 2) {
          style.remove();
          setTimeout(resolve, 500);
          return;
        }

        // Detect if stuck
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

        currentPos += 6;
        window.scrollTo(0, Math.min(currentPos, maxScroll));
        requestAnimationFrame(step);
      }

      // Initial delay before scrolling
      setTimeout(() => requestAnimationFrame(step), 300);
    });
  }

  // Remove control panel
  function removeControlPanel() {
    const panel = document.getElementById('devshot-video-control');
    if (panel) panel.remove();
    window.__devshotVideoControlInjected = false;
  }

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'initVideoControl') {
      createControlPanel(message.config);
      sendResponse({ success: true });
    }
    if (message.action === 'removeVideoControl') {
      removeControlPanel();
      sendResponse({ success: true });
    }
    return true;
  });
})();
