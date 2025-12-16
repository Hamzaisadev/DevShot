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
    return parseInt(delaySelect.value) || 3000;
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
    
    const delay = getDelay();
    showStatus(delay > 0 ? `Waiting ${delay/1000}s...` : 'Capturing...', 'loading');
    
    try {
      const res = await chrome.runtime.sendMessage({ action: 'capture', type, delay });
      showStatus(res?.success ? '✓ Saved to gallery!' : (res?.error || 'Failed'), res?.success ? 'success' : 'error');
    } catch (e) {
      showStatus('Error: ' + e.message, 'error');
    }
    
    setDisabled(false);
  }

  async function captureAll() {
    if (busy) return;
    setDisabled(true);
    
    const types = ['desktop-viewport', 'desktop-fullpage', 'mobile-viewport', 'mobile-fullpage', 'tablet-viewport', 'tablet-fullpage'];
    const delay = getDelay();
    
    for (let i = 0; i < types.length; i++) {
      showStatus(`Capturing ${i + 1}/6...`, 'loading');
      try {
        await chrome.runtime.sendMessage({ action: 'capture', type: types[i], delay: i === 0 ? delay : 0 });
      } catch (e) {
        console.error(e);
      }
      if (i < types.length - 1) await new Promise(r => setTimeout(r, 800));
    }
    
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
            delay: j === 0 ? delay : 1000 // Only full delay on first type per URL
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
});


