// DevShot Gallery Script
// Manages screenshot storage, display, and bulk operations

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const galleryContainer = document.querySelector('.gallery-container');
  const emptyState = document.getElementById('empty-state');
  const selectAllCheckbox = document.getElementById('select-all');
  const deleteSelectedBtn = document.getElementById('btn-delete-selected');
  const downloadSelectedBtn = document.getElementById('btn-download-selected');
  const batchCaptureBtn = document.getElementById('btn-batch-capture');
  const showcaseBtn = document.getElementById('btn-create-showcase');
  const customCanvasBtn = document.getElementById('btn-custom-canvas');
  const exportPdfBtn = document.getElementById('btn-export-pdf');
  const downloadAllBtn = document.getElementById('btn-download-all');
  const refreshBtn = document.getElementById('btn-refresh');
  const filterDomain = document.getElementById('filter-domain');
  const filterType = document.getElementById('filter-type');
  const filterDevice = document.getElementById('filter-device');

  // State
  let screenshots = [];
  let selectedIds = new Set();

  // Initialize
  loadScreenshots();

  // Event listeners
  refreshBtn.addEventListener('click', loadScreenshots);
  downloadAllBtn.addEventListener('click', downloadAll);
  selectAllCheckbox.addEventListener('change', toggleSelectAll);
  deleteSelectedBtn.addEventListener('click', deleteSelected);
  downloadSelectedBtn.addEventListener('click', downloadSelected);
  batchCaptureBtn.addEventListener('click', openBatchCaptureModal);
  showcaseBtn.addEventListener('click', createShowcase);
  customCanvasBtn?.addEventListener('click', openCustomCanvasModal);
  exportPdfBtn.addEventListener('click', exportPdf);
  filterDomain.addEventListener('change', renderGallery);
  filterType.addEventListener('change', renderGallery);
  filterDevice.addEventListener('change', renderGallery);

  // Load screenshots from IndexedDB
  async function loadScreenshots() {
    try {
      screenshots = await db.getAll();
      updateDomainFilter();
      renderGallery();
    } catch (error) {
      console.error('Failed to load screenshots:', error);
      screenshots = [];
      renderGallery();
    }
  }

  // Update domain filter options
  function updateDomainFilter() {
    const domains = [...new Set(screenshots.map(s => s.domain))].sort();
    filterDomain.innerHTML = '<option value="">All Domains</option>';
    domains.forEach(domain => {
      const option = document.createElement('option');
      option.value = domain;
      option.textContent = domain;
      filterDomain.appendChild(option);
    });
  }

  // Render gallery
  function renderGallery() {
    // Clear existing content (except empty state)
    const groups = galleryContainer.querySelectorAll('.domain-group');
    groups.forEach(g => g.remove());

    // Apply filters
    let filtered = screenshots;
    
    if (filterDomain.value) {
      filtered = filtered.filter(s => s.domain === filterDomain.value);
    }
    if (filterType.value) {
      filtered = filtered.filter(s => s.captureType === filterType.value);
    }
    if (filterDevice.value) {
      filtered = filtered.filter(s => s.device === filterDevice.value);
    }

    // Show/hide empty state
    emptyState.style.display = filtered.length === 0 ? 'flex' : 'none';

    if (filtered.length === 0) return;

    // Group by domain
    const grouped = filtered.reduce((acc, screenshot) => {
      const domain = screenshot.domain;
      if (!acc[domain]) acc[domain] = [];
      acc[domain].push(screenshot);
      return acc;
    }, {});

    // Render each domain group
    Object.entries(grouped).forEach(([domain, domainScreenshots]) => {
      const group = createDomainGroup(domain, domainScreenshots);
      galleryContainer.appendChild(group);
    });

    updateSelectionState();
  }

  // Create domain group element
  function createDomainGroup(domain, domainScreenshots) {
    const group = document.createElement('div');
    group.className = 'domain-group';
    group.innerHTML = `
      <div class="domain-header">
        <span class="domain-icon">📁</span>
        <span class="domain-name">${domain}</span>
        <span class="domain-count">${domainScreenshots.length} screenshots</span>
        <button class="btn btn-sm btn-primary domain-showcase-btn" title="Create Showcase">🖼️ Showcase</button>
        <span class="domain-toggle">▼</span>
      </div>
      <div class="screenshot-grid"></div>
    `;

    const header = group.querySelector('.domain-header');
    const grid = group.querySelector('.screenshot-grid');
    const showcaseBtn = header.querySelector('.domain-showcase-btn');

    // Open showcase modal for this domain
    showcaseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openShowcaseModal(domainScreenshots);
    });

    // Toggle collapse
    header.addEventListener('click', (e) => {
      if (e.target.classList.contains('domain-showcase-btn')) return;
      header.classList.toggle('collapsed');
      grid.style.display = header.classList.contains('collapsed') ? 'none' : 'grid';
    });

    // Add screenshot cards
    domainScreenshots.forEach(screenshot => {
      const card = createScreenshotCard(screenshot);
      grid.appendChild(card);
    });

    return group;
  }

  // Create screenshot card element
  function createScreenshotCard(screenshot) {
    const card = document.createElement('div');
    card.className = 'screenshot-card';
    card.dataset.id = screenshot.id;

    const isSelected = selectedIds.has(screenshot.id);
    if (isSelected) card.classList.add('selected');
    
    // Only show mockup button for viewport screenshots (not fullpage)
    const showMockup = screenshot.captureType === 'viewport';

    // Check if this is a video file
    const isVideo = screenshot.captureType === 'video' || screenshot.filename?.endsWith('.webm');
    
    card.innerHTML = `
      <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''}>
      ${isVideo ? `
        <video class="card-image card-video" src="${screenshot.dataUrl}" muted loop></video>
      ` : `
        <img class="card-image" src="${screenshot.dataUrl}" alt="${screenshot.filename}">
      `}
      <div class="card-info">
        <div class="card-filename">${screenshot.filename}</div>
        <div class="card-meta">
          <span class="card-badge ${screenshot.device}">${screenshot.device}</span>
          <span class="card-badge ${screenshot.captureType}">${screenshot.captureType}</span>
        </div>
        <div class="card-date">${formatDate(screenshot.timestamp)}</div>
      </div>
      <div class="card-actions">
        ${showMockup && !isVideo ? `<button class="btn btn-sm btn-secondary btn-mockup" title="Add Device Frame">📱 Mockup</button>` : ''}
        ${isVideo ? `<button class="btn btn-sm btn-primary btn-play" title="Play Video">▶️</button>` : ''}
        <button class="btn btn-sm btn-secondary btn-download" title="Download">
          📥
        </button>
        <button class="btn btn-sm btn-danger btn-delete" title="Delete">
          🗑️
        </button>
      </div>
    `;

    // Event listeners
    const checkbox = card.querySelector('.card-checkbox');
    const image = card.querySelector('.card-image');
    const mockupBtn = card.querySelector('.btn-mockup');
    const downloadBtn = card.querySelector('.btn-download');
    const deleteBtn = card.querySelector('.btn-delete');

    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleSelect(screenshot.id, checkbox.checked);
    });

    // Click handler - open preview for both images and videos
    image.addEventListener('click', () => {
      openPreview(screenshot);
    });

    // Only add mockup listener if button exists
    if (mockupBtn) {
      mockupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMockupModal(screenshot);
      });
    }

    // Play video button
    const playBtn = card.querySelector('.btn-play');
    const videoEl = card.querySelector('.card-video');
    if (playBtn && videoEl) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (videoEl.paused) {
          videoEl.play();
          playBtn.textContent = '⏸️';
        } else {
          videoEl.pause();
          playBtn.textContent = '▶️';
        }
      });
    }

    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadScreenshot(screenshot);
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteScreenshot(screenshot.id);
    });

    return card;
  }

  // Selection management
  function toggleSelect(id, selected) {
    if (selected) {
      selectedIds.add(id);
    } else {
      selectedIds.delete(id);
    }
    updateSelectionState();
    
    const card = document.querySelector(`[data-id="${id}"]`);
    if (card) {
      card.classList.toggle('selected', selected);
    }
  }

  function toggleSelectAll() {
    const allIds = screenshots.map(s => s.id);
    
    if (selectAllCheckbox.checked) {
      allIds.forEach(id => selectedIds.add(id));
    } else {
      selectedIds.clear();
    }
    
    updateSelectionState();
    renderGallery();
  }

  function updateSelectionState() {
    const hasSelection = selectedIds.size > 0;
    deleteSelectedBtn.disabled = !hasSelection;
    downloadSelectedBtn.disabled = !hasSelection;
    exportPdfBtn.disabled = !hasSelection;
    // Enable showcase when 3+ screenshots selected
    showcaseBtn.disabled = selectedIds.size < 3;
    // Enable custom canvas when any screenshots selected
    if (customCanvasBtn) customCanvasBtn.disabled = !hasSelection;

    selectAllCheckbox.checked = selectedIds.size === screenshots.length && screenshots.length > 0;
  }

  // Actions
  async function downloadScreenshot(screenshot) {
    const link = document.createElement('a');
    link.href = screenshot.dataUrl;
    link.download = screenshot.filename;
    link.click();
  }

  async function deleteScreenshot(id) {
    if (!confirm('Delete this screenshot?')) return;
    
    await db.delete(id);
    screenshots = screenshots.filter(s => s.id !== id);
    selectedIds.delete(id);
    renderGallery();
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selectedIds.size} screenshots?`)) return;
    
    for (const id of selectedIds) {
      await db.delete(id);
    }
    screenshots = screenshots.filter(s => !selectedIds.has(s.id));
    selectedIds.clear();
    renderGallery();
  }

  async function downloadSelected() {
    const selected = screenshots.filter(s => selectedIds.has(s.id));
    for (const screenshot of selected) {
      await downloadScreenshot(screenshot);
      await sleep(100); // Small delay between downloads
    }
  }

  async function downloadAll() {
    for (const screenshot of screenshots) {
      await downloadScreenshot(screenshot);
      await sleep(100);
    }
  }

  // Batch Mockup Modal
  function openBatchMockupModal() {
    const selected = screenshots.filter(s => selectedIds.has(s.id));
    if (selected.length === 0) return;

    const deviceFrames = [
      { id: 'macbook', name: 'MacBook Pro', icon: '💻' },
      { id: 'imac', name: 'iMac', icon: '🖥️' },
      { id: 'iphone', name: 'iPhone 15 Pro', icon: '📱' },
      { id: 'ipad', name: 'iPad Pro', icon: '📲' },
      { id: 'browser', name: 'Browser Window', icon: '🌐' }
    ];

    const backgrounds = [
      { id: 'gradient-dark', name: 'Dark', colors: ['#1a1a2e', '#16213e', '#0f3460'] },
      { id: 'gradient-light', name: 'Light', colors: ['#f5f5f5', '#e8e8e8', '#ddd'] },
      { id: 'gradient-purple', name: 'Purple', colors: ['#7c3aed', '#8b5cf6', '#a78bfa'] },
      { id: 'gradient-teal', name: 'Teal', colors: ['#0d9488', '#14b8a6', '#2dd4bf'] },
      { id: 'transparent', name: 'Transparent', colors: ['transparent'] }
    ];

    let selectedDevice = deviceFrames[0];
    let selectedBg = backgrounds[0];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="showcase-modal" style="max-width: 500px;">
        <div class="showcase-header">
          <h2>📱 Batch Mockup</h2>
          <button class="modal-close">✕</button>
        </div>
        <div class="showcase-body" style="padding: 20px;">
          <p style="color: var(--text-secondary); margin-bottom: 16px;">Generate mockups for ${selected.length} selected screenshot${selected.length > 1 ? 's' : ''}</p>
          
          <div class="showcase-section">
            <h3>Device Frame</h3>
            <div class="template-grid-compact">
              ${deviceFrames.map((d, i) => `
                <div class="template-chip ${i === 0 ? 'selected' : ''}" data-device="${d.id}">
                  <span class="chip-icon">${d.icon}</span>
                  <span class="chip-label">${d.name}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="showcase-section">
            <h3>Background</h3>
            <div class="bg-grid-compact">
              ${backgrounds.map((bg, i) => `
                <div class="bg-chip ${i === 0 ? 'selected' : ''}" data-bg="${bg.id}" 
                  style="background: ${bg.id === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 20px 20px' : `linear-gradient(135deg, ${bg.colors.join(', ')})`}" 
                  title="${bg.name}"></div>
              `).join('')}
            </div>
          </div>

          <div class="batch-progress" id="batch-progress" style="display: none;">
            <div class="progress-bar" style="background: var(--bg-tertiary); border-radius: 6px; overflow: hidden; height: 8px;">
              <div class="progress-fill" style="height: 100%; background: var(--accent-primary); width: 0%; transition: width 0.3s;"></div>
            </div>
            <p class="progress-text" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 8px;">Processing 0/${selected.length}</p>
          </div>
        </div>
        <div class="showcase-footer">
          <button class="btn btn-secondary" id="btn-cancel-batch">Cancel</button>
          <button class="btn btn-primary" id="btn-start-batch">🚀 Generate ${selected.length} Mockup${selected.length > 1 ? 's' : ''}</button>
        </div>
      </div>
    `;

    const closeBtn = overlay.querySelector('.modal-close');
    const cancelBtn = overlay.querySelector('#btn-cancel-batch');
    const startBtn = overlay.querySelector('#btn-start-batch');
    const deviceChips = overlay.querySelectorAll('.template-chip');
    const bgChips = overlay.querySelectorAll('.bg-chip');
    const progressEl = overlay.querySelector('#batch-progress');
    const progressFill = overlay.querySelector('.progress-fill');
    const progressText = overlay.querySelector('.progress-text');

    closeBtn.addEventListener('click', () => overlay.remove());
    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    deviceChips.forEach(chip => {
      chip.addEventListener('click', () => {
        deviceChips.forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedDevice = deviceFrames.find(d => d.id === chip.dataset.device);
      });
    });

    bgChips.forEach(chip => {
      chip.addEventListener('click', () => {
        bgChips.forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedBg = backgrounds.find(b => b.id === chip.dataset.bg);
      });
    });

    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      progressEl.style.display = 'block';

      for (let i = 0; i < selected.length; i++) {
        const screenshot = selected[i];
        progressText.textContent = `Processing ${i + 1}/${selected.length}`;
        progressFill.style.width = `${((i + 1) / selected.length) * 100}%`;

        try {
          await generateBatchMockup(screenshot, selectedDevice.id, selectedBg.colors);
          await sleep(200);
        } catch (err) {
          console.error('Mockup error:', err);
        }
      }

      overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  async function generateBatchMockup(screenshot, deviceId, bgColors) {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = screenshot.dataUrl;
    });

    const canvas = document.createElement('canvas');
    
    // Use the same rendering function as preview (without scale)
    await generateMockupOnCanvas(canvas, img, deviceId, bgColors, false);

    // Download
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `mockup_${deviceId}_${screenshot.filename}`;
    link.click();
  }

  // Custom Canvas Modal - Free-form screenshot placement
  function openCustomCanvasModal() {
    const selected = screenshots.filter(s => selectedIds.has(s.id));
    if (selected.length === 0) return;

    const backgrounds = [
      { id: 'dark', name: 'Dark', colors: ['#1a1a2e', '#16213e'] },
      { id: 'purple', name: 'Purple', colors: ['#667eea', '#764ba2'] },
      { id: 'teal', name: 'Teal', colors: ['#0d9488', '#14b8a6'] },
      { id: 'orange', name: 'Sunset', colors: ['#f093fb', '#f5576c'] },
      { id: 'light', name: 'Light', colors: ['#f8fafc', '#e2e8f0'] },
      { id: 'transparent', name: 'None', colors: ['transparent'] }
    ];

    let selectedBg = backgrounds[0];
    let canvasWidth = 1920;
    let canvasHeight = 1080;
    
    // Items on canvas with position/size
    let canvasItems = selected.map((s, i) => ({
      id: s.id,
      dataUrl: s.dataUrl,
      x: 100 + (i % 3) * 300,
      y: 100 + Math.floor(i / 3) * 250,
      width: 280,
      height: 180,
      selected: false
    }));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="showcase-modal canvas-modal" style="max-width: 95vw; width: 1200px;">
        <div class="showcase-header">
          <h2>🎨 Custom Canvas</h2>
          <button class="modal-close">✕</button>
        </div>
        <div class="showcase-body" style="padding: 16px; display: flex; gap: 16px;">
          <!-- Canvas Area -->
          <div class="canvas-editor-area" style="flex: 1;">
            <div class="canvas-wrapper" id="canvas-wrapper" style="background: #222; border-radius: 8px; overflow: auto; max-height: 60vh;">
              <div class="canvas-container" id="canvas-container" style="position: relative; margin: auto;"></div>
            </div>
          </div>
          
          <!-- Sidebar -->
          <div class="canvas-sidebar" style="width: 200px; display: flex; flex-direction: column; gap: 16px;">
            <!-- Canvas Size -->
            <div class="sidebar-section">
              <h4>Canvas Size</h4>
              <div style="display: flex; gap: 8px;">
                <input type="number" id="canvas-width" value="${canvasWidth}" style="width: 70px;" class="input-sm">
                <span style="color: #888;">×</span>
                <input type="number" id="canvas-height" value="${canvasHeight}" style="width: 70px;" class="input-sm">
              </div>
              <div style="display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap;">
                <button class="size-preset" data-w="1920" data-h="1080">1080p</button>
                <button class="size-preset" data-w="1280" data-h="720">720p</button>
                <button class="size-preset" data-w="1200" data-h="630">Social</button>
              </div>
            </div>
            
            <!-- Background -->
            <div class="sidebar-section">
              <h4>Background</h4>
              <div class="bg-grid-compact">
                ${backgrounds.map((bg, i) => `
                  <div class="bg-chip ${i === 0 ? 'selected' : ''}" data-bg="${bg.id}" 
                    style="background: ${bg.id === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px' : `linear-gradient(135deg, ${bg.colors.join(', ')})`}" 
                    title="${bg.name}"></div>
                `).join('')}
                <input type="color" id="custom-canvas-color" value="#667eea" class="bg-chip-custom" title="Custom">
              </div>
            </div>
            
            <!-- Instructions -->
            <div class="sidebar-section" style="font-size: 0.75rem; color: #888;">
              <p>• Drag screenshots to position</p>
              <p>• Drag corners to resize</p>
              <p>• Click to select</p>
            </div>
          </div>
        </div>
        <div class="showcase-footer">
          <button class="btn btn-secondary" id="btn-canvas-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-canvas-download">📥 Download</button>
        </div>
      </div>
    `;

    const container = overlay.querySelector('#canvas-container');
    const canvasWidthInput = overlay.querySelector('#canvas-width');
    const canvasHeightInput = overlay.querySelector('#canvas-height');
    const bgChips = overlay.querySelectorAll('.bg-chip');
    const customColorInput = overlay.querySelector('#custom-canvas-color');
    const sizePresets = overlay.querySelectorAll('.size-preset');
    const closeBtn = overlay.querySelector('.modal-close');
    const cancelBtn = overlay.querySelector('#btn-canvas-cancel');
    const downloadBtn = overlay.querySelector('#btn-canvas-download');

    // Render canvas items
    function renderCanvas() {
      container.style.width = canvasWidth + 'px';
      container.style.height = canvasHeight + 'px';
      
      // Background
      if (selectedBg.colors[0] === 'transparent') {
        container.style.background = 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 20px 20px';
      } else {
        container.style.background = `linear-gradient(135deg, ${selectedBg.colors.join(', ')})`;
      }
      
      container.innerHTML = '';
      
      canvasItems.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'canvas-item' + (item.selected ? ' selected' : '');
        div.style.cssText = `
          position: absolute;
          left: ${item.x}px;
          top: ${item.y}px;
          width: ${item.width}px;
          height: ${item.height}px;
          cursor: move;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          border-radius: 4px;
          overflow: hidden;
          ${item.selected ? 'outline: 2px solid #667eea;' : ''}
        `;
        div.innerHTML = `
          <img src="${item.dataUrl}" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;">
          <div class="resize-handle" style="position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; background: #667eea; cursor: se-resize; border-radius: 2px 0 4px 0;"></div>
        `;
        
        // Drag to move
        let isDragging = false, isResizing = false;
        let startX, startY, startItemX, startItemY, startW, startH;
        
        div.addEventListener('mousedown', (e) => {
          if (e.target.classList.contains('resize-handle')) {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startW = item.width;
            startH = item.height;
          } else {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startItemX = item.x;
            startItemY = item.y;
          }
          
          canvasItems.forEach(i => i.selected = false);
          item.selected = true;
          renderCanvas();
          e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
          if (isDragging) {
            item.x = startItemX + (e.clientX - startX);
            item.y = startItemY + (e.clientY - startY);
            div.style.left = item.x + 'px';
            div.style.top = item.y + 'px';
          }
          if (isResizing) {
            item.width = Math.max(50, startW + (e.clientX - startX));
            item.height = Math.max(50, startH + (e.clientY - startY));
            div.style.width = item.width + 'px';
            div.style.height = item.height + 'px';
          }
        });
        
        document.addEventListener('mouseup', () => {
          isDragging = false;
          isResizing = false;
        });
        
        container.appendChild(div);
      });
    }

    // Event listeners
    closeBtn.addEventListener('click', () => overlay.remove());
    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    canvasWidthInput.addEventListener('change', () => {
      canvasWidth = parseInt(canvasWidthInput.value) || 1920;
      renderCanvas();
    });
    
    canvasHeightInput.addEventListener('change', () => {
      canvasHeight = parseInt(canvasHeightInput.value) || 1080;
      renderCanvas();
    });

    sizePresets.forEach(btn => {
      btn.addEventListener('click', () => {
        canvasWidth = parseInt(btn.dataset.w);
        canvasHeight = parseInt(btn.dataset.h);
        canvasWidthInput.value = canvasWidth;
        canvasHeightInput.value = canvasHeight;
        renderCanvas();
      });
    });

    bgChips.forEach(chip => {
      chip.addEventListener('click', () => {
        bgChips.forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedBg = backgrounds.find(b => b.id === chip.dataset.bg);
        renderCanvas();
      });
    });

    customColorInput.addEventListener('input', (e) => {
      selectedBg = { id: 'custom', colors: [e.target.value, e.target.value] };
      bgChips.forEach(c => c.classList.remove('selected'));
      renderCanvas();
    });

    downloadBtn.addEventListener('click', async () => {
      downloadBtn.textContent = '⏳ Generating...';
      downloadBtn.disabled = true;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      // Draw background
      if (selectedBg.colors[0] !== 'transparent') {
        const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
        gradient.addColorStop(0, selectedBg.colors[0]);
        gradient.addColorStop(1, selectedBg.colors[1] || selectedBg.colors[0]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      // Draw items
      for (const item of canvasItems) {
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = item.dataUrl;
        });
        ctx.drawImage(img, item.x, item.y, item.width, item.height);
      }

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `custom_canvas_${Date.now()}.png`;
      link.click();

      overlay.remove();
    });

    renderCanvas();
    document.body.appendChild(overlay);
  }

  // Batch Website Screenshot Capture Modal
  function openBatchCaptureModal() {
    let captureDevice = 'desktop';
    let captureType = 'viewport';
    let captureDelay = 3000;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="showcase-modal" style="max-width: 600px;">
        <div class="showcase-header">
          <h2>📷 Batch Website Capture</h2>
          <button class="modal-close">✕</button>
        </div>
        <div class="showcase-body" style="padding: 20px;">
          <p style="color: var(--text-secondary); margin-bottom: 16px;">
            Capture screenshots from multiple websites. Enter one URL per line.
          </p>
          
          <div class="showcase-section">
            <h3>Website URLs</h3>
            <textarea id="batch-urls" class="batch-urls-input" rows="6" 
              placeholder="https://example.com&#10;https://google.com&#10;https://github.com"></textarea>
            <p class="hint" style="margin-top: 8px; font-size: 0.8rem; color: var(--text-muted);">
              Enter one URL per line. Invalid URLs will be skipped.
            </p>
          </div>

          <div class="showcase-section" style="display: flex; gap: 20px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 120px;">
              <h3>Device</h3>
              <select id="batch-device" class="select" style="width: 100%;">
                <option value="desktop" selected>🖥️ Desktop</option>
                <option value="mobile">📱 Mobile</option>
                <option value="tablet">📲 Tablet</option>
              </select>
            </div>
            <div style="flex: 1; min-width: 120px;">
              <h3>Type</h3>
              <select id="batch-type" class="select" style="width: 100%;">
                <option value="viewport" selected>Viewport</option>
                <option value="fullpage">Full Page</option>
              </select>
            </div>
            <div style="flex: 1; min-width: 120px;">
              <h3>Delay</h3>
              <select id="batch-delay" class="select" style="width: 100%;">
                <option value="0">None</option>
                <option value="2000">2 seconds</option>
                <option value="3000" selected>3 seconds</option>
                <option value="5000">5 seconds</option>
              </select>
            </div>
          </div>

          <div class="batch-progress" id="batch-capture-progress" style="display: none; margin-top: 20px;">
            <div class="progress-bar" style="background: var(--bg-tertiary); border-radius: 6px; overflow: hidden; height: 8px;">
              <div class="progress-fill" id="batch-progress-fill" style="height: 100%; background: var(--accent-primary); width: 0%; transition: width 0.3s;"></div>
            </div>
            <p class="progress-text" id="batch-progress-text" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 8px;">Ready</p>
            <div class="batch-log" id="batch-log" style="max-height: 120px; overflow-y: auto; margin-top: 12px; font-size: 0.8rem; font-family: monospace; background: var(--bg-tertiary); padding: 10px; border-radius: 6px;"></div>
          </div>
        </div>
        <div class="showcase-footer">
          <button class="btn btn-secondary" id="btn-cancel-batch-capture">Cancel</button>
          <button class="btn btn-primary" id="btn-start-batch-capture">🚀 Start Capture</button>
        </div>
      </div>
    `;

    const closeBtn = overlay.querySelector('.modal-close');
    const cancelBtn = overlay.querySelector('#btn-cancel-batch-capture');
    const startBtn = overlay.querySelector('#btn-start-batch-capture');
    const urlsTextarea = overlay.querySelector('#batch-urls');
    const deviceSelect = overlay.querySelector('#batch-device');
    const typeSelect = overlay.querySelector('#batch-type');
    const delaySelect = overlay.querySelector('#batch-delay');
    const progressEl = overlay.querySelector('#batch-capture-progress');
    const progressFill = overlay.querySelector('#batch-progress-fill');
    const progressText = overlay.querySelector('#batch-progress-text');
    const batchLog = overlay.querySelector('#batch-log');

    closeBtn.addEventListener('click', () => overlay.remove());
    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    function addLogEntry(message, type = 'info') {
      const entry = document.createElement('div');
      entry.style.color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#28c840' : 'inherit';
      entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
      batchLog.appendChild(entry);
      batchLog.scrollTop = batchLog.scrollHeight;
    }

    function parseUrls(text) {
      return text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(url => {
          // Add https:// if missing
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          try {
            new URL(url); // Validate URL
            return url;
          } catch {
            return null;
          }
        })
        .filter(url => url !== null);
    }

    startBtn.addEventListener('click', async () => {
      const urls = parseUrls(urlsTextarea.value);
      
      if (urls.length === 0) {
        alert('Please enter at least one valid URL');
        return;
      }

      captureDevice = deviceSelect.value;
      captureType = typeSelect.value;
      captureDelay = parseInt(delaySelect.value);

      startBtn.disabled = true;
      cancelBtn.disabled = true;
      urlsTextarea.disabled = true;
      progressEl.style.display = 'block';
      
      addLogEntry(`Starting batch capture for ${urls.length} URL(s)...`);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const captureTypeKey = `${captureDevice}-${captureType}`;
        
        progressText.textContent = `Capturing ${i + 1}/${urls.length}: ${new URL(url).hostname}`;
        progressFill.style.width = `${((i + 1) / urls.length) * 100}%`;
        
        addLogEntry(`Capturing: ${url}`);

        try {
          // Send capture request to service worker
          const response = await chrome.runtime.sendMessage({
            action: 'batchCaptureUrl',
            url: url,
            type: captureTypeKey,
            delay: captureDelay
          });
          
          if (response && response.success) {
            addLogEntry(`✓ Captured: ${new URL(url).hostname}`, 'success');
            successCount++;
          } else {
            addLogEntry(`✗ Failed: ${new URL(url).hostname} - ${response?.error || 'Unknown error'}`, 'error');
            errorCount++;
          }
        } catch (err) {
          addLogEntry(`✗ Error: ${err.message}`, 'error');
          errorCount++;
        }

        // Wait between captures to avoid rate limiting
        if (i < urls.length - 1) {
          await sleep(1500);
        }
      }

      progressText.textContent = `Complete! ${successCount} succeeded, ${errorCount} failed`;
      addLogEntry(`Batch capture complete. Success: ${successCount}, Failed: ${errorCount}`);
      
      startBtn.textContent = '✓ Done';
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Close';
      
      // Refresh gallery to show new screenshots
      await loadScreenshots();
    });

    document.body.appendChild(overlay);
  }

  // Single Screenshot Mockup Modal
  function openMockupModal(screenshot) {
    // Device-specific frame options based on screenshot type
    const phoneFrames = [
      { id: 'iphone-15-pro', name: 'iPhone 15 Pro', icon: '📱' },
      { id: 'iphone-15', name: 'iPhone 15', icon: '📱' },
      { id: 'iphone-14-pro', name: 'iPhone 14 Pro', icon: '📱' },
      { id: 'iphone-14', name: 'iPhone 14', icon: '📱' },
      { id: 'pixel-8', name: 'Google Pixel 8', icon: '📱' },
      { id: 'pixel-7', name: 'Google Pixel 7', icon: '📱' },
      { id: 'samsung-s24', name: 'Samsung Galaxy S24', icon: '📱' },
      { id: 'samsung-s23', name: 'Samsung Galaxy S23', icon: '📱' }
    ];

    const tabletFrames = [
      { id: 'ipad-pro-12', name: 'iPad Pro 12.9"', icon: '📲' },
      { id: 'ipad-pro-11', name: 'iPad Pro 11"', icon: '📲' },
      { id: 'ipad-air', name: 'iPad Air', icon: '📲' },
      { id: 'ipad-mini', name: 'iPad Mini', icon: '📲' },
      { id: 'galaxy-tab-s9', name: 'Galaxy Tab S9', icon: '📲' },
      { id: 'surface-pro', name: 'Surface Pro', icon: '📲' }
    ];

    const desktopFrames = [
      { id: 'macbook-pro-16', name: 'MacBook Pro 16"', icon: '💻' },
      { id: 'macbook-pro-14', name: 'MacBook Pro 14"', icon: '💻' },
      { id: 'macbook-air', name: 'MacBook Air', icon: '💻' },
      { id: 'imac-24', name: 'iMac 24"', icon: '🖥️' },
      { id: 'studio-display', name: 'Studio Display', icon: '🖥️' },
      { id: 'browser-chrome', name: 'Chrome Browser', icon: '🌐' },
      { id: 'browser-safari', name: 'Safari Browser', icon: '🌐' },
      { id: 'browser-arc', name: 'Arc Browser', icon: '🌐' }
    ];

    // Select frames based on screenshot device type
    let deviceFrames;
    let modalTitle;
    if (screenshot.device === 'mobile') {
      deviceFrames = phoneFrames;
      modalTitle = '📱 Create Phone Mockup';
    } else if (screenshot.device === 'tablet') {
      deviceFrames = tabletFrames;
      modalTitle = '📲 Create Tablet Mockup';
    } else {
      deviceFrames = desktopFrames;
      modalTitle = '💻 Create Desktop Mockup';
    }

    const backgrounds = [
      { id: 'dark', name: 'Dark', colors: ['#1a1a2e', '#16213e', '#0f3460'] },
      { id: 'gradient-purple', name: 'Purple', colors: ['#667eea', '#764ba2', '#f093fb'] },
      { id: 'gradient-teal', name: 'Teal', colors: ['#0d9488', '#14b8a6', '#2dd4bf'] },
      { id: 'gradient-orange', name: 'Sunset', colors: ['#f093fb', '#f5576c', '#f97316'] },
      { id: 'gradient-blue', name: 'Ocean', colors: ['#2193b0', '#6dd5ed', '#89f7fe'] },
      { id: 'light', name: 'Light', colors: ['#f8fafc', '#e2e8f0', '#f1f5f9'] },
      { id: 'transparent', name: 'None', colors: ['transparent'] }
    ];

    let selectedDevice = deviceFrames[0];
    let selectedBg = backgrounds[0];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="showcase-modal mockup-modal-enhanced" style="max-width: 700px;">
        <div class="showcase-header">
          <h2>${modalTitle}</h2>
          <button class="modal-close">✕</button>
        </div>
        <div class="showcase-body" style="padding: 24px;">
          <!-- Live Preview -->
          <div class="mockup-live-preview" id="mockup-live-preview">
            <canvas id="mockup-preview-canvas"></canvas>
            <div class="preview-loading">Generating preview...</div>
          </div>

          <!-- Device Selection -->
          <div class="showcase-section">
            <h3>Choose Device Frame</h3>
            <div class="device-grid" id="device-grid">
              ${deviceFrames.map((d, i) => `
                <div class="device-option ${i === 0 ? 'selected' : ''}" data-device="${d.id}" title="${d.name}">
                  <span class="device-icon">${d.icon}</span>
                  <span class="device-name">${d.name}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Background Selection -->
          <div class="showcase-section">
            <h3>Background Style</h3>
            <div class="bg-grid-compact">
              ${backgrounds.map((bg, i) => `
                <div class="bg-chip ${i === 0 ? 'selected' : ''}" data-bg="${bg.id}" 
                  style="background: ${bg.id === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 20px 20px' : `linear-gradient(135deg, ${bg.colors.join(', ')})`}" 
                  title="${bg.name}"></div>
              `).join('')}
              <input type="color" id="custom-mockup-color" value="#667eea" class="bg-chip-custom" title="Custom Color">
            </div>
          </div>
        </div>
        <div class="showcase-footer">
          <button class="btn btn-secondary" id="btn-cancel-mockup">Cancel</button>
          <button class="btn btn-secondary" id="btn-save-mockup">💾 Save to Gallery</button>
          <button class="btn btn-primary" id="btn-download-mockup">📥 Download</button>
        </div>
      </div>
    `;

    const closeBtn = overlay.querySelector('.modal-close');
    const cancelBtn = overlay.querySelector('#btn-cancel-mockup');
    const downloadBtn = overlay.querySelector('#btn-download-mockup');
    const saveBtn = overlay.querySelector('#btn-save-mockup');
    const deviceOptions = overlay.querySelectorAll('.device-option');
    const bgChips = overlay.querySelectorAll('.bg-chip');
    const customColorInput = overlay.querySelector('#custom-mockup-color');
    const previewCanvas = overlay.querySelector('#mockup-preview-canvas');
    const previewContainer = overlay.querySelector('#mockup-live-preview');

    // Generate preview function
    async function updatePreview() {
      const loading = previewContainer.querySelector('.preview-loading');
      if (loading) loading.style.display = 'block';
      previewCanvas.style.display = 'none';

      try {
        await generateMockupPreview(previewCanvas, screenshot, selectedDevice.id, selectedBg.colors);
        previewCanvas.style.display = 'block';
        if (loading) loading.style.display = 'none';
      } catch (err) {
        console.error('Preview error:', err);
      }
    }

    // Initial preview
    updatePreview();

    closeBtn.addEventListener('click', () => overlay.remove());
    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    deviceOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        deviceOptions.forEach(c => c.classList.remove('selected'));
        opt.classList.add('selected');
        selectedDevice = deviceFrames.find(d => d.id === opt.dataset.device);
        updatePreview();
      });
    });

    bgChips.forEach(chip => {
      chip.addEventListener('click', () => {
        bgChips.forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedBg = backgrounds.find(b => b.id === chip.dataset.bg);
        updatePreview();
      });
    });

    customColorInput.addEventListener('input', (e) => {
      const color = e.target.value;
      selectedBg = { id: 'custom', name: 'Custom', colors: [color, color, color] };
      bgChips.forEach(c => c.classList.remove('selected'));
      updatePreview();
    });

    downloadBtn.addEventListener('click', async () => {
      downloadBtn.textContent = '⏳ Generating...';
      downloadBtn.disabled = true;

      try {
        await generateBatchMockup(screenshot, selectedDevice.id, selectedBg.colors);
        overlay.remove();
      } catch (err) {
        console.error('Mockup error:', err);
        alert('Failed to generate mockup');
        downloadBtn.textContent = '📥 Download';
        downloadBtn.disabled = false;
      }
    });

    saveBtn.addEventListener('click', async () => {
      saveBtn.textContent = '⏳ Saving...';
      saveBtn.disabled = true;

      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = screenshot.dataUrl;
        });

        const canvas = document.createElement('canvas');
        await generateMockupOnCanvas(canvas, img, selectedDevice.id, selectedBg.colors);
        
        const dataUrl = canvas.toDataURL('image/png');
        const newScreenshot = {
          filename: `mockup_${selectedDevice.id}_${screenshot.filename}`,
          domain: screenshot.domain,
          device: screenshot.device,
          captureType: 'mockup',
          dataUrl: dataUrl,
          url: screenshot.url,
          timestamp: Date.now()
        };
        await db.add(newScreenshot);
        await loadScreenshots();
        overlay.remove();
      } catch (err) {
        console.error('Save error:', err);
        alert('Failed to save mockup');
        saveBtn.textContent = '💾 Save to Gallery';
        saveBtn.disabled = false;
      }
    });

    document.body.appendChild(overlay);
  }

  // Generate mockup preview on canvas
  async function generateMockupPreview(canvas, screenshot, deviceId, bgColors) {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = screenshot.dataUrl;
    });
    await generateMockupOnCanvas(canvas, img, deviceId, bgColors, true);
  }

  // Core mockup generation function
  async function generateMockupOnCanvas(canvas, img, deviceId, bgColors, isPreview = false) {
    const ctx = canvas.getContext('2d');
    
    // Canvas size based on device type - realistic aspect ratios
    const sizes = {
      // Phones (compact mockup - not too tall)
       'iphone-15-pro': { w: 375, h: 610 },
'iphone-15': { w: 375, h: 667 },
'iphone-14-pro': { w: 375, h: 667 },
'iphone-14': { w: 375, h: 667 },
'pixel-8': { w: 375, h: 667 },
'pixel-7': { w: 375, h: 667 },
'samsung-s24': { w: 375, h: 667 },
'samsung-s23': { w: 375, h: 667 },
      // Tablets (4:3 / 3:4 aspect ratio)
      'ipad-pro-12': { w: 900, h: 1200 },
      'ipad-pro-11': { w: 850, h: 1100 },
      'ipad-air': { w: 800, h: 1050 },
      'ipad-mini': { w: 700, h: 920 },
      'galaxy-tab-s9': { w: 850, h: 1100 },
      'surface-pro': { w: 900, h: 1200 },
      // Desktops (16:10 aspect ratio)
      'macbook-pro-16': { w: 1400, h: 900 },
      'macbook-pro-14': { w: 1300, h: 850 },
      'macbook-air': { w: 1200, h: 800 },
      'imac-24': { w: 1400, h: 1100 },
      'studio-display': { w: 1400, h: 950 },
      'browser-chrome': { w: 1200, h: 800 },
      'browser-safari': { w: 1200, h: 800 },
      'browser-arc': { w: 1200, h: 800 }
    };
    
    const size = sizes[deviceId] || { w: 1400, h: 900 };
    const scale = isPreview ? 0.4 : 1;
    canvas.width = size.w * scale;
    canvas.height = size.h * scale;

    // Draw background
    if (bgColors[0] !== 'transparent') {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, bgColors[0]);
      gradient.addColorStop(0.5, bgColors[1] || bgColors[0]);
      gradient.addColorStop(1, bgColors[2] || bgColors[0]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Determine device type for frame rendering
    const isPhone = deviceId.includes('iphone') || deviceId.includes('pixel') || deviceId.includes('samsung-s');
    const isTablet = deviceId.includes('ipad') || deviceId.includes('tab') || deviceId.includes('surface');
    const isBrowser = deviceId.includes('browser');
    const isMac = deviceId.includes('macbook');
    const isIMac = deviceId.includes('imac') || deviceId.includes('studio');

    const padding = 60 * scale;
    
    if (isPhone) {
      drawPhoneFrame(ctx, canvas, img, padding, deviceId);
    } else if (isTablet) {
      drawTabletFrame(ctx, canvas, img, padding, deviceId);
    } else if (isBrowser) {
      drawBrowserMockup(ctx, canvas, img, padding, deviceId);
    } else if (isMac) {
      drawLaptopFrame(ctx, canvas, img, padding, deviceId);
    } else if (isIMac) {
      drawMonitorFrame(ctx, canvas, img, padding, deviceId);
    } else {
      // Fallback - just draw image
      ctx.drawImage(img, padding, padding, canvas.width - padding * 2, canvas.height - padding * 2);
    }
  }

  // Phone frame drawing
  function drawPhoneFrame(ctx, canvas, img, padding, deviceId) {
    const frameWidth = canvas.width - padding * 2;
    const frameHeight = canvas.height - padding * 2;
    const x = padding;
    const y = padding;
    const radius = frameWidth * 0.12;
    const bezelWidth = frameWidth * 0.04;

    // Phone body (dark frame)
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.roundRect(x, y, frameWidth, frameHeight, radius);
    ctx.fill();

    // Screen area
    const screenX = x + bezelWidth;
    const screenY = y + bezelWidth * 2;
    const screenW = frameWidth - bezelWidth * 2;
    const screenH = frameHeight - bezelWidth * 4;
    const screenRadius = radius * 0.85;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(screenX, screenY, screenW, screenH, screenRadius);
    ctx.clip();
    ctx.drawImage(img, screenX, screenY, screenW, screenH);
    ctx.restore();

    // Dynamic Island / Notch
    if (deviceId.includes('iphone-15') || deviceId.includes('iphone-14-pro')) {
      const islandWidth = frameWidth * 0.28;
      const islandHeight = bezelWidth * 0.8;
      const islandX = x + (frameWidth - islandWidth) / 2;
      const islandY = y + bezelWidth * 1.2;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.roundRect(islandX, islandY, islandWidth, islandHeight, islandHeight / 2);
      ctx.fill();
    }
  }

  // Tablet frame drawing
  function drawTabletFrame(ctx, canvas, img, padding, deviceId) {
    const frameWidth = canvas.width - padding * 2;
    const frameHeight = canvas.height - padding * 2;
    const x = padding;
    const y = padding;
    const radius = frameWidth * 0.05;
    const bezelWidth = frameWidth * 0.035;

    // Tablet body
    ctx.fillStyle = deviceId.includes('surface') ? '#2a2a2a' : '#1a1a1a';
    ctx.beginPath();
    ctx.roundRect(x, y, frameWidth, frameHeight, radius);
    ctx.fill();

    // Screen
    const screenX = x + bezelWidth;
    const screenY = y + bezelWidth;
    const screenW = frameWidth - bezelWidth * 2;
    const screenH = frameHeight - bezelWidth * 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(screenX, screenY, screenW, screenH, radius * 0.7);
    ctx.clip();
    ctx.drawImage(img, screenX, screenY, screenW, screenH);
    ctx.restore();

    // Front camera dot
    const camSize = bezelWidth * 0.3;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(x + frameWidth / 2, y + bezelWidth / 2, camSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // Laptop frame drawing  
  function drawLaptopFrame(ctx, canvas, img, padding, deviceId) {
    const baseY = canvas.height * 0.85;
    const screenWidth = canvas.width - padding * 2;
    const screenHeight = baseY - padding - 40;
    const x = padding;
    const y = padding;

    // Screen bezel
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.roundRect(x, y, screenWidth, screenHeight + 20, 12);
    ctx.fill();

    // Screen
    const bezel = 12;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + bezel, y + bezel, screenWidth - bezel * 2, screenHeight - bezel, 4);
    ctx.clip();
    ctx.drawImage(img, x + bezel, y + bezel, screenWidth - bezel * 2, screenHeight - bezel);
    ctx.restore();

    // Camera notch
    const notchWidth = 8;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(x + screenWidth / 2, y + bezel / 2 + 2, notchWidth / 2, 0, Math.PI * 2);
    ctx.fill();

    // Keyboard base
    const baseHeight = canvas.height - baseY;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(x - 20, baseY);
    ctx.lineTo(x + screenWidth + 20, baseY);
    ctx.lineTo(x + screenWidth + 40, canvas.height);
    ctx.lineTo(x - 40, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Trackpad
    const trackpadW = screenWidth * 0.35;
    const trackpadH = baseHeight * 0.5;
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.roundRect(x + (screenWidth - trackpadW) / 2, baseY + (baseHeight - trackpadH) / 2, trackpadW, trackpadH, 4);
    ctx.fill();
  }

  // Monitor frame drawing
  function drawMonitorFrame(ctx, canvas, img, padding, deviceId) {
    const screenWidth = canvas.width - padding * 2;
    const screenHeight = canvas.height * 0.72;
    const x = padding;
    const y = padding;

    // Monitor bezel
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.roundRect(x, y, screenWidth, screenHeight + 30, 16);
    ctx.fill();

    // Screen
    const bezel = 16;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + bezel, y + bezel, screenWidth - bezel * 2, screenHeight - bezel, 4);
    ctx.clip();
    ctx.drawImage(img, x + bezel, y + bezel, screenWidth - bezel * 2, screenHeight - bezel);
    ctx.restore();

    // Stand neck
    const standTop = y + screenHeight + 30;
    const standWidth = screenWidth * 0.08;
    ctx.fillStyle = '#333';
    ctx.fillRect(x + (screenWidth - standWidth) / 2, standTop, standWidth, canvas.height * 0.12);

    // Stand base
    const baseWidth = screenWidth * 0.35;
    const baseHeight = canvas.height * 0.04;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(x + screenWidth / 2, canvas.height - baseHeight, baseWidth / 2, baseHeight, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Browser mockup drawing
  function drawBrowserMockup(ctx, canvas, img, padding, deviceId) {
    const x = padding;
    const y = padding;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;
    const toolbarHeight = 40;
    const radius = 12;

    // Window shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;

    // Window background
    const isDark = deviceId.includes('arc') || deviceId.includes('chrome');
    ctx.fillStyle = isDark ? '#202124' : '#f5f5f5';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Toolbar
    ctx.fillStyle = isDark ? '#35363a' : '#e8e8e8';
    ctx.beginPath();
    ctx.roundRect(x, y, width, toolbarHeight, [radius, radius, 0, 0]);
    ctx.fill();

    // Traffic lights
    const dotY = y + toolbarHeight / 2;
    const dotRadius = 6;
    const dotStart = x + 16;
    ctx.fillStyle = '#ff5f57';
    ctx.beginPath();
    ctx.arc(dotStart, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#febc2e';
    ctx.beginPath();
    ctx.arc(dotStart + 20, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#28c840';
    ctx.beginPath();
    ctx.arc(dotStart + 40, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    // URL bar
    const urlBarX = dotStart + 70;
    const urlBarWidth = width - urlBarX - 60;
    ctx.fillStyle = isDark ? '#292a2d' : '#fff';
    ctx.beginPath();
    ctx.roundRect(urlBarX, y + 10, urlBarWidth, 20, 4);
    ctx.fill();

    // Content area
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y + toolbarHeight, width, height - toolbarHeight, [0, 0, radius, radius]);
    ctx.clip();
    ctx.drawImage(img, x, y + toolbarHeight, width, height - toolbarHeight);
    ctx.restore();
  }

  // Create Showcase Modal with templates and device options
  async function createShowcase() {
    const selectedScreenshots = screenshots.filter(s => selectedIds.has(s.id));
    
    if (selectedScreenshots.length < 2) {
      alert('Please select at least 2 screenshots');
      return;
    }

    // Open showcase modal
    const templates = ['3-Device', 'Side by Side', 'Stacked', 'Hero + Features', 'Comparison', 'Fullpage', 'Fullpage Split', 'Fullpage Grid', 'Trio', 'Custom'];
    let currentTemplate = '3-Device';
    let bgGradient = ['#1a1a2e', '#0f3460'];
    let zoomLevel = 1;
    let slotOrder = [0, 1, 2]; // For reordering screenshots
    
    // Text overlay configuration
    let textOverlay = {
      enabled: false,
      text: '',
      font: 'Inter',
      size: 48,
      color: '#ffffff',
      position: 'bottom', // top, center, bottom
      shadow: true
    };
    
    // Collapsible sections state
    const collapsedSections = {};
    
    // Background presets (gradients + solids)
    const BACKGROUNDS = [
      { id: 'dark', name: 'Dark', colors: ['#1a1a2e', '#0f3460'], type: 'gradient' },
      { id: 'midnight', name: 'Midnight', colors: ['#0f0c29', '#302b63', '#24243e'], type: 'gradient' },
      { id: 'ocean', name: 'Ocean', colors: ['#2E3192', '#1BFFFF'], type: 'gradient' },
      { id: 'sunset', name: 'Sunset', colors: ['#fc4a1a', '#f7b733'], type: 'gradient' },
      { id: 'forest', name: 'Forest', colors: ['#11998e', '#38ef7d'], type: 'gradient' },
      { id: 'purple', name: 'Purple', colors: ['#667eea', '#764ba2'], type: 'gradient' },
      { id: 'pink', name: 'Pink', colors: ['#FF3CAC', '#784BA0', '#2B86C5'], type: 'gradient' },
      { id: 'fire', name: 'Fire', colors: ['#f12711', '#f5af19'], type: 'gradient' },
      { id: 'cosmic', name: 'Cosmic', colors: ['#000428', '#004e92'], type: 'gradient' },
      { id: 'lime', name: 'Lime', colors: ['#a8e063', '#56ab2f'], type: 'gradient' },
      { id: 'light', name: 'Light', colors: ['#f8f9fa', '#e9ecef'], type: 'gradient' },
      { id: 'white', name: 'White', colors: ['#ffffff', '#ffffff'], type: 'solid' },
      { id: 'black', name: 'Black', colors: ['#0a0a0a', '#0a0a0a'], type: 'solid' },
      { id: 'gray', name: 'Gray', colors: ['#2d2d2d', '#2d2d2d'], type: 'solid' }
    ];
    
    const sorted = [...selectedScreenshots].sort((a, b) => {
      const widthA = parseInt(a.filename.match(/(\d+)x/)?.[1] || 1920);
      const widthB = parseInt(b.filename.match(/(\d+)x/)?.[1] || 1920);
      return widthB - widthA;
    }).slice(0, 3);
    
    // Universal device options - same as mockup modal for consistency
    const SHOWCASE_DEVICES = {
      desktop: [
        { id: 'none', name: 'No Mockup', icon: '🖼️' },
        { id: 'macbook-pro-16', name: 'MacBook Pro 16"', icon: '💻' },
        { id: 'macbook-pro-14', name: 'MacBook Pro 14"', icon: '💻' },
        { id: 'macbook-air', name: 'MacBook Air', icon: '💻' },
        { id: 'laptop-generic', name: 'Laptop', icon: '💻' },
        { id: 'dell-xps', name: 'Dell XPS', icon: '💻' },
        { id: 'imac-24', name: 'iMac 24"', icon: '🖥️' },
        { id: 'studio-display', name: 'Studio Display', icon: '🖥️' },
        { id: 'browser-chrome', name: 'Chrome Browser', icon: '🌐' },
        { id: 'browser-safari', name: 'Safari Browser', icon: '🌐' },
        { id: 'browser-arc', name: 'Arc Browser', icon: '🌐' }
      ],
      tablet: [
        { id: 'none', name: 'No Mockup', icon: '🖼️' },
        { id: 'ipad-pro-12', name: 'iPad Pro 12.9"', icon: '📲' },
        { id: 'ipad-pro-11', name: 'iPad Pro 11"', icon: '📲' },
        { id: 'ipad-air', name: 'iPad Air', icon: '📲' },
        { id: 'ipad-mini', name: 'iPad Mini', icon: '📲' },
        { id: 'galaxy-tab-s9', name: 'Galaxy Tab S9', icon: '📲' },
        { id: 'surface-pro', name: 'Surface Pro', icon: '📲' }
      ],
      phone: [
        { id: 'none', name: 'No Mockup', icon: '🖼️' },
        { id: 'iphone-15-pro', name: 'iPhone 15 Pro', icon: '📱' },
        { id: 'iphone-15', name: 'iPhone 15', icon: '📱' },
        { id: 'iphone-14-pro', name: 'iPhone 14 Pro', icon: '📱' },
        { id: 'pixel-8', name: 'Google Pixel 8', icon: '📱' },
        { id: 'pixel-7', name: 'Google Pixel 7', icon: '📱' },
        { id: 'samsung-s24', name: 'Samsung Galaxy S24', icon: '📱' },
        { id: 'samsung-s23', name: 'Samsung Galaxy S23', icon: '📱' }
      ]
    };
    
    // Slot configurations with selected device IDs
    let slotConfig = [
      { deviceId: 'macbook-pro-16', category: 'desktop' },  // Slot 1 (Desktop)
      { deviceId: 'ipad-pro-12', category: 'tablet' },       // Slot 2 (Tablet)
      { deviceId: 'iphone-15-pro', category: 'phone' }       // Slot 3 (Phone)
    ];

    // Modal HTML - Modern Minimal Design
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.style.zIndex = '99999';
    overlay.innerHTML = `
      <div class="showcase-modal" style="width:98vw;height:95vh;background:#0a0a0f;display:grid;grid-template-columns:220px 1fr 200px;grid-template-rows:auto 1fr auto;border-radius:16px;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,0.8);">
        
        <!-- Header -->
        <div style="grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.06);">
          <h2 style="margin:0;font-size:1.1rem;color:rgba(255,255,255,0.9);font-weight:600;">Create Showcase</h2>
          <div style="display:flex;align-items:center;gap:12px;">
            <a href="https://github.com/Hamzaisadev/DevShot" target="_blank" style="padding:10px 16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:rgba(255,255,255,0.9);font-size:0.85rem;font-weight:500;cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:6px;transition:all 0.2s;">
              ⭐ Star on GitHub
            </a>
            <button id="download-showcase" style="padding:12px 28px;background:linear-gradient(135deg, #22c55e, #16a34a);border:none;border-radius:10px;color:white;font-size:0.95rem;font-weight:600;cursor:pointer;box-shadow:0 4px 15px rgba(34,197,94,0.3);">
              ⬇ Download PNG
            </button>
            <button id="close-showcase" style="width:40px;height:40px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:rgba(255,255,255,0.6);font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">
              ✕
            </button>
          </div>
        </div>
        
        <!-- Left Sidebar - Templates -->
        <div style="background:rgba(255,255,255,0.02);border-right:1px solid rgba(255,255,255,0.06);padding:20px;overflow-y:auto;">
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);font-weight:600;letter-spacing:1px;margin-bottom:12px;">TEMPLATES</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${templates.map((t, i) => `
              <button class="tpl-chip ${i === 0 ? 'active' : ''}" data-tpl="${t}" 
                style="padding:12px 16px;text-align:left;background:${i === 0 ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)'};border:1px solid ${i === 0 ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'};border-radius:8px;color:${i === 0 ? '#a5b4fc' : 'rgba(255,255,255,0.7)'};font-size:0.85rem;cursor:pointer;transition:all 0.2s;">
                ${t}
              </button>
            `).join('')}
          </div>
        </div>
        
        <!-- Main Canvas Area -->
        <div style="display:flex;align-items:center;justify-content:center;background:#080810;position:relative;overflow:hidden;">
          <canvas id="showcase-canvas" style="max-width:90%;max-height:90%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.6);"></canvas>
          <div id="custom-controls" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);backdrop-filter:blur(10px);padding:10px 20px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);display:none;">
            <span style="color:rgba(255,255,255,0.7);font-size:0.85rem;">Click items to select • Drag to move</span>
          </div>
        </div>
        
        <!-- Right Sidebar - Background -->
        <div style="background:rgba(255,255,255,0.02);border-left:1px solid rgba(255,255,255,0.06);padding:20px;overflow-y:auto;">
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);font-weight:600;letter-spacing:1px;margin-bottom:12px;">BACKGROUND</div>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:16px;">
            ${BACKGROUNDS.map((bg, i) => `
              <button class="bg-dot ${i === 0 ? 'active' : ''}" data-bg="${bg.id}" 
                style="aspect-ratio:1;border-radius:8px;background:${bg.colors.length > 1 ? `linear-gradient(135deg, ${bg.colors.join(', ')})` : bg.colors[0]};border:2px solid ${i === 0 ? '#fff' : 'transparent'};cursor:pointer;transition:all 0.15s;"
                title="${bg.name}"></button>
            `).join('')}
          </div>
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);font-weight:600;letter-spacing:1px;margin-bottom:8px;">CUSTOM</div>
          <input type="color" id="custom-bg-color" value="#667eea" style="width:100%;height:36px;border:none;border-radius:8px;cursor:pointer;">
        </div>
        
        <!-- Bottom Panel - Slot Assignments -->
        <div style="grid-column:1/-1;background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.06);padding:20px 24px;">
          <div style="display:flex;gap:20px;">
            ${[
              { slot: 0, label: 'Desktop', icon: '💻', category: 'desktop' },
              { slot: 1, label: 'Tablet', icon: '📲', category: 'tablet' },
              { slot: 2, label: 'Phone', icon: '📱', category: 'phone' }
            ].map(({ slot, label, icon, category }) => `
              <div class="slot-card" style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
                <!-- Header -->
                <div style="font-size:0.8rem;color:rgba(255,255,255,0.9);font-weight:600;margin-bottom:12px;">${icon} ${label}</div>
                
                <!-- Large Thumbnail -->
                <div class="slot-thumb" data-slot="${slot}" style="width:100%;height:80px;background:rgba(0,0,0,0.4);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);margin-bottom:12px;">
                  ${sorted[slot] ? `<img src="${sorted[slot].dataUrl}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.2);font-size:0.75rem;">No image</div>'}
                </div>
                
                <!-- Screenshot Dropdown -->
                <div style="margin-bottom:8px;">
                  <label style="font-size:0.65rem;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px;">Screenshot</label>
                  <select class="screenshot-select" data-slot="${slot}" style="width:100%;padding:8px 10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.9);font-size:0.8rem;cursor:pointer;">
                    ${selectedScreenshots.map((s, idx) => {
                      // Parse device type and capture type from filename
                      const fn = s.filename || '';
                      let deviceType = 'Unknown';
                      let captureType = 'Viewport';
                      if (fn.includes('1920x') || fn.includes('desktop')) deviceType = 'Desktop';
                      else if (fn.includes('768x') || fn.includes('tablet')) deviceType = 'Tablet';
                      else if (fn.includes('375x') || fn.includes('390x') || fn.includes('mobile')) deviceType = 'Mobile';
                      if (fn.includes('fullpage')) captureType = 'Fullpage';
                      const label = `${deviceType} - ${captureType} - ${s.domain || 'Screenshot'}`;
                      return `<option value="${idx}" ${idx === slot ? 'selected' : ''}>${label}</option>`;
                    }).join('')}
                  </select>
                </div>
                
                <!-- Device Dropdown -->
                <div>
                  <label style="font-size:0.65rem;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px;">Device Frame</label>
                  <select class="device-select" data-slot="${slot}" data-category="${category}" style="width:100%;padding:8px 10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.9);font-size:0.8rem;cursor:pointer;">
                    ${SHOWCASE_DEVICES[category].map((d, idx) => `
                      <option value="${d.id}" ${idx === 0 ? 'selected' : ''}>${d.icon} ${d.name}</option>
                    `).join('')}
                  </select>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Device Picker Popup -->
        <div id="device-picker" style="display:none;position:fixed;background:rgba(10,10,15,0.98);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,0.6);z-index:10000;max-width:300px;">
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-bottom:10px;font-weight:600;">SELECT DEVICE</div>
          <div id="device-picker-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;"></div>
        </div>
      </div>
    `;

    // Canvas Setup
    const canvas = overlay.querySelector('#showcase-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1920;
    canvas.height = 1080;

    // State for Custom Mode
    let items = [];
    let isDragging = false;
    let dragItem = null;
    let dragOffset = { x: 0, y: 0 };
    let selectedItemIndex = -1;
    
    // All devices flat list for custom mode
    const allDevices = [
      ...SHOWCASE_DEVICES.desktop,
      ...SHOWCASE_DEVICES.tablet,
      ...SHOWCASE_DEVICES.phone
    ];
    
    // Update custom controls with device selector
    function updateCustomDeviceSelector() {
      const controlsEl = overlay.querySelector('#custom-controls');
      if (!controlsEl) return;
      
      const selectedItem = items.find(item => item.selected);
      
      if (selectedItem) {
        // Find device info
        const device = allDevices.find(d => d.id === selectedItem.deviceId) || { icon: '💻', name: 'Device' };
        
        controlsEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <button id="custom-resize-down" style="width:28px;height:28px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;cursor:pointer;font-size:0.9rem;" title="Smaller">−</button>
            <button id="custom-resize-up" style="width:28px;height:28px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;cursor:pointer;font-size:0.9rem;" title="Bigger">+</button>
            <select id="custom-device-select" style="padding:4px 8px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;font-size:0.75rem;max-width:120px;">
              ${allDevices.map(d => `<option value="${d.id}" ${d.id === selectedItem.deviceId ? 'selected' : ''}>${d.icon} ${d.name}</option>`).join('')}
            </select>
          </div>
        `;
        
        // Device change handler
        controlsEl.querySelector('#custom-device-select').onchange = (e) => {
          selectedItem.deviceId = e.target.value;
          render();
        };
        
        // Resize handlers
        controlsEl.querySelector('#custom-resize-up').onclick = () => {
          selectedItem.w = Math.min(selectedItem.w + 50, 1200);
          render();
        };
        controlsEl.querySelector('#custom-resize-down').onclick = () => {
          selectedItem.w = Math.max(selectedItem.w - 50, 100);
          render();
        };
      } else {
        controlsEl.innerHTML = `<span style="color:rgba(255,255,255,0.5);font-size:0.8rem;">Click item to select</span>`;
      }
    }

    // Render Function
    async function render() {
      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, bgGradient[0]);
      gradient.addColorStop(1, bgGradient[1]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Helper to load images
      const loadImg = (url) => new Promise(r => { 
        if(!url) return r(null);
        const i = new Image(); 
        i.onload = () => r(i); 
        i.src = url; 
      });

      const imgs = await Promise.all(sorted.map(s => loadImg(s?.dataUrl)));

      // --- TEMPLATE: 3-Device (Desktop + Tablet + Phone) ---
      if (currentTemplate === '3-Device') {
         // Desktop (Center Back)
         if (imgs[0]) {
           const deviceId = document.getElementById('slot-0')?.value || 'macbook-pro-16';
           drawDevice(ctx, imgs[0], deviceId, 1920/2, 450, 1000); // x, y, width
         }
         // Tablet (Left Front)
         if (imgs[1]) {
           const deviceId = document.getElementById('slot-1')?.value || 'ipad-pro-12';
           drawDevice(ctx, imgs[1], deviceId, 400, 600, 400);
         }
         // Phone (Right Front)
         if (imgs[2]) {
           const deviceId = document.getElementById('slot-2')?.value || 'iphone-15-pro';
           drawDevice(ctx, imgs[2], deviceId, 1500, 620, 220); // Compact width 220
         }
      }
      
      // --- TEMPLATE: Side by Side ---
      else if (currentTemplate === 'Side by Side') {
         const deviceId = document.getElementById('slot-0')?.value || 'macbook-pro-16';
         if(imgs[0]) drawDevice(ctx, imgs[0], deviceId, 500, 540, 800);
         if(imgs[1]) drawDevice(ctx, imgs[1], deviceId, 1420, 540, 800);
      }
      
      // --- TEMPLATE: Stacked (vertical centered) ---
      else if (currentTemplate === 'Stacked') {
         const deviceId = document.getElementById('slot-0')?.value || 'macbook-pro-16';
         const count = Math.min(imgs.filter(Boolean).length, 3);
         const spacing = 300;
         const startY = 540 - ((count - 1) * spacing) / 2;
         
         imgs.slice(0, count).forEach((img, i) => {
            if (img) {
               const y = startY + (i * spacing);
               const scale = 1 - (i * 0.15);
               drawDevice(ctx, img, deviceId, 960, y, 900 * scale);
            }
         });
      }
      
      // --- TEMPLATE: Hero + Features (large main + small secondary) ---
      else if (currentTemplate === 'Hero + Features') {
         // Large desktop on left, smaller tablet + phone stacked on right
         const desktopId = document.querySelector('.device-select[data-slot="0"]')?.value || 'macbook-pro-16';
         const tabletId = document.querySelector('.device-select[data-slot="1"]')?.value || 'ipad-pro-12';
         const phoneId = document.querySelector('.device-select[data-slot="2"]')?.value || 'iphone-15-pro';
         
         // Main hero (desktop) - left side, large
         if (imgs[0]) drawDevice(ctx, imgs[0], desktopId, 650, 520, 900);
         
         // Features (tablet + phone) - right side, smaller
         if (imgs[1]) drawDevice(ctx, imgs[1], tabletId, 1450, 380, 400);
         if (imgs[2]) drawDevice(ctx, imgs[2], phoneId, 1550, 700, 180);
      }
      
      // --- TEMPLATE: Comparison (side by side, equal) ---
      else if (currentTemplate === 'Comparison') {
         // Two devices side by side, same size - good for before/after or version comparison
         const leftId = document.querySelector('.device-select[data-slot="0"]')?.value || 'browser-chrome';
         const rightId = document.querySelector('.device-select[data-slot="1"]')?.value || 'browser-chrome';
         
         if (imgs[0]) drawDevice(ctx, imgs[0], leftId, 530, 540, 700);
         if (imgs[1]) drawDevice(ctx, imgs[1], rightId, 1390, 540, 700);
      }
      
      // --- TEMPLATE: Fullpage (single large screenshot, no mockup) ---
      else if (currentTemplate === 'Fullpage') {
         // Large single image centered - perfect for full page screenshots
         if (imgs[0]) drawDevice(ctx, imgs[0], 'none', 960, 540, 1400);
      }
      
      // --- TEMPLATE: Fullpage Split (two full images side by side) ---
      else if (currentTemplate === 'Fullpage Split') {
         // Two images side by side without device frames
         if (imgs[0]) drawDevice(ctx, imgs[0], 'none', 520, 540, 700);
         if (imgs[1]) drawDevice(ctx, imgs[1], 'none', 1400, 540, 700);
      }
      
      // --- TEMPLATE: Fullpage Grid (3 images in grid) ---
      else if (currentTemplate === 'Fullpage Grid') {
         // Top row (2 images), bottom row (1 centered)
         if (imgs[0]) drawDevice(ctx, imgs[0], 'none', 520, 320, 620);
         if (imgs[1]) drawDevice(ctx, imgs[1], 'none', 1400, 320, 620);
         if (imgs[2]) drawDevice(ctx, imgs[2], 'none', 960, 760, 620);
      }
      
      // --- TEMPLATE: Trio (3 overlapping images with depth) ---
      else if (currentTemplate === 'Trio') {
         // 3 images overlapping - great for showcasing 3 different websites
         // Back (left)
         ctx.globalAlpha = 0.9;
         if (imgs[2]) drawDevice(ctx, imgs[2], 'none', 350, 520, 550);
         // Middle (right)
         ctx.globalAlpha = 0.95;
         if (imgs[1]) drawDevice(ctx, imgs[1], 'none', 1570, 520, 550);
         // Front (center)
         ctx.globalAlpha = 1;
         if (imgs[0]) drawDevice(ctx, imgs[0], 'none', 960, 540, 700);
      }

      // --- TEMPLATE: Custom ---
      else if (currentTemplate === 'Custom') {
         if (items.length === 0 && imgs.length > 0) {
           // Init items with proper device IDs based on index
           const defaultDevices = ['macbook-pro-16', 'ipad-pro-12', 'iphone-15-pro'];
           items = imgs.map((img, i) => ({
             img,
             x: 300 + (i * 450),
             y: 400 + (i * 80),
             w: i === 2 ? 220 : (i === 1 ? 350 : 700), // Phone smaller, tablet medium, desktop large
             deviceId: defaultDevices[i] || 'macbook-pro-16',
             selected: false
           }));
           overlay.querySelector('#custom-controls').style.display = 'block';
           updateCustomDeviceSelector();
         }
         
         // Draw all items
         items.forEach((item, idx) => {
           drawDevice(ctx, item.img, item.deviceId, item.x, item.y, item.w);
           
           // Draw selection indicator if selected
           if (item.selected) {
             ctx.strokeStyle = '#6366f1';
             ctx.lineWidth = 3;
             ctx.setLineDash([8, 4]);
             const h = item.deviceId.includes('phone') || item.deviceId.includes('iphone') || item.deviceId.includes('pixel') || item.deviceId.includes('samsung') 
               ? item.w * 2.1 : item.w * 0.7;
             ctx.strokeRect(item.x - item.w/2 - 10, item.y - h/2 - 10, item.w + 20, h + 20);
             ctx.setLineDash([]);
           }
         });
      }
      
      // --- TEXT OVERLAY ---
      if (textOverlay.enabled && textOverlay.text) {
        ctx.save();
        ctx.font = `bold ${textOverlay.size}px ${textOverlay.font}`;
        ctx.fillStyle = textOverlay.color;
        ctx.textAlign = 'center';
        
        // Position
        let textY;
        if (textOverlay.position === 'top') {
          textY = 80;
          ctx.textBaseline = 'top';
        } else if (textOverlay.position === 'center') {
          textY = canvas.height / 2;
          ctx.textBaseline = 'middle';
        } else {
          textY = canvas.height - 50;
          ctx.textBaseline = 'bottom';
        }
        
        // Shadow
        if (textOverlay.shadow) {
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
        }
        
        ctx.fillText(textOverlay.text, canvas.width / 2, textY);
        ctx.restore();
      }
    }

    // Generic Device Drawer - supports all SHOWCASE_DEVICES IDs
    function drawDevice(ctx, img, deviceId, cx, cy, width) {
       let h, screenW, screenH;
       
       // === NO MOCKUP (just the image) ===
       if (deviceId === 'none') {
          // Calculate height based on image aspect ratio
          const aspectRatio = img.height / img.width;
          h = width * aspectRatio;
          
          // Shadow
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 25;
          ctx.shadowOffsetY = 10;
          
          // Draw image with rounded corners
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, cx - width/2, cy - h/2, width, h, 12);
          ctx.clip();
          ctx.drawImage(img, cx - width/2, cy - h/2, width, h);
          ctx.restore();
          ctx.shadowColor = 'transparent';
          return;
       }
       
       // === MACBOOK / LAPTOPS ===
       if (deviceId.includes('macbook') || deviceId.includes('laptop') || deviceId.includes('dell') || deviceId.includes('xps')) {
          h = width * 0.65;
          const baseHeight = 14;
          
          // Shadow
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetY = 10;
          
          // Screen bezel (Space Gray)
          ctx.fillStyle = deviceId.includes('dell') || deviceId.includes('laptop-generic') ? '#2c2c2c' : '#1c1c1e';
          ctx.beginPath();
          roundRect(ctx, cx - width/2, cy - h/2, width, h, 10);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          
          // Screen
          screenW = width * 0.92;
          screenH = h * 0.85;
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, cx - screenW/2, cy - h/2 + 8, screenW, screenH, 4);
          ctx.clip();
          ctx.drawImage(img, cx - screenW/2, cy - h/2 + 8, screenW, screenH);
          ctx.restore();
          
          // Camera notch (MacBook style)
          if (deviceId.includes('macbook')) {
            const notchW = 60;
            ctx.fillStyle = '#0a0a0a';
            ctx.beginPath();
            roundRect(ctx, cx - notchW/2, cy - h/2 + 2, notchW, 12, 6);
            ctx.fill();
            ctx.fillStyle = '#2a2a2e';
            ctx.beginPath();
            ctx.arc(cx, cy - h/2 + 8, 3, 0, Math.PI * 2);
            ctx.fill();
          }
          
          // Keyboard base (trapezoid)
          const baseY = cy + h/2;
          ctx.fillStyle = deviceId.includes('dell') ? '#3a3a3a' : '#2c2c2e';
          ctx.beginPath();
          ctx.moveTo(cx - width/2 + 5, baseY);
          ctx.lineTo(cx + width/2 - 5, baseY);
          ctx.lineTo(cx + width/2 + 15, baseY + baseHeight);
          ctx.lineTo(cx - width/2 - 15, baseY + baseHeight);
          ctx.closePath();
          ctx.fill();
       }
       
       // === IMAC / MONITORS ===
       else if (deviceId.includes('imac') || deviceId.includes('studio') || deviceId.includes('monitor')) {
          h = width * 0.6;
          const standHeight = h * 0.25;
          
          // Shadow
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 25;
          ctx.shadowOffsetY = 15;
          
          // Monitor bezel (Silver for iMac)
          ctx.fillStyle = deviceId.includes('imac') ? '#e4e4e4' : '#1c1c1e';
          ctx.beginPath();
          roundRect(ctx, cx - width/2, cy - h/2, width, h, 16);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          
          // Inner bezel
          ctx.fillStyle = '#0a0a0a';
          ctx.beginPath();
          roundRect(ctx, cx - width/2 + 12, cy - h/2 + 12, width - 24, h - 40, 8);
          ctx.fill();
          
          // Screen
          screenW = width - 28;
          screenH = h - 48;
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, cx - screenW/2, cy - h/2 + 14, screenW, screenH, 4);
          ctx.clip();
          ctx.drawImage(img, cx - screenW/2, cy - h/2 + 14, screenW, screenH);
          ctx.restore();
          
          // Stand neck
          const neckW = width * 0.08;
          ctx.fillStyle = deviceId.includes('imac') ? '#d0d0d0' : '#333';
          ctx.fillRect(cx - neckW/2, cy + h/2, neckW, standHeight * 0.6);
          
          // Stand base
          const baseW = width * 0.3;
          ctx.fillStyle = deviceId.includes('imac') ? '#d0d0d0' : '#333';
          ctx.beginPath();
          ctx.ellipse(cx, cy + h/2 + standHeight * 0.7, baseW/2, 8, 0, 0, Math.PI * 2);
          ctx.fill();
       }
       
       // === BROWSER WINDOWS ===
       else if (deviceId.includes('browser') || deviceId.includes('chrome') || deviceId.includes('safari') || deviceId.includes('arc')) {
          h = width * 0.625;
          const toolbarH = 32;
          const isDark = deviceId.includes('arc') || deviceId.includes('chrome');
          
          // Shadow
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetY = 8;
          
          // Window frame
          ctx.fillStyle = isDark ? '#202124' : '#f5f5f5';
          ctx.beginPath();
          roundRect(ctx, cx - width/2, cy - h/2, width, h, 10);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          
          // Toolbar
          ctx.fillStyle = isDark ? '#35363a' : '#e8e8e8';
          ctx.beginPath();
          roundRect(ctx, cx - width/2, cy - h/2, width, toolbarH, [10, 10, 0, 0]);
          ctx.fill();
          
          // Traffic lights
          const dotY = cy - h/2 + toolbarH/2;
          const dotX = cx - width/2 + 16;
          ctx.fillStyle = '#ff5f57';
          ctx.beginPath(); ctx.arc(dotX, dotY, 5, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#febc2e';
          ctx.beginPath(); ctx.arc(dotX + 16, dotY, 5, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#28c840';
          ctx.beginPath(); ctx.arc(dotX + 32, dotY, 5, 0, Math.PI*2); ctx.fill();
          
          // URL bar
          ctx.fillStyle = isDark ? '#292a2d' : '#fff';
          ctx.beginPath();
          roundRect(ctx, dotX + 50, cy - h/2 + 8, width - 100, 16, 8);
          ctx.fill();
          
          // Content
          screenW = width - 4;
          screenH = h - toolbarH - 4;
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, cx - screenW/2 + 2, cy - h/2 + toolbarH + 2, screenW - 4, screenH, [0, 0, 8, 8]);
          ctx.clip();
          ctx.drawImage(img, cx - screenW/2 + 2, cy - h/2 + toolbarH + 2, screenW - 4, screenH);
          ctx.restore();
       }
       
       // === TABLETS (iPad, Galaxy Tab, Surface) ===
       else if (deviceId.includes('ipad') || deviceId.includes('galaxy-tab') || deviceId.includes('surface') || deviceId.includes('tablet')) {
          h = width * 1.4;
          const isLandscape = deviceId.includes('surface');
          if (isLandscape) { h = width * 0.7; }
          
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 15;
          ctx.shadowOffsetY = 8;
          
          // Body
          ctx.fillStyle = deviceId.includes('surface') ? '#2a2a2a' : '#1a1a1a';
          ctx.beginPath();
          roundRect(ctx, cx - width/2, cy - h/2, width, h, 18);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          
          // Metallic edge
          ctx.strokeStyle = '#3a3a3c';
          ctx.lineWidth = 2;
          ctx.beginPath();
          roundRect(ctx, cx - width/2, cy - h/2, width, h, 18);
          ctx.stroke();
          
          // Screen
          screenW = width * 0.94;
          screenH = h * 0.94;
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, cx - screenW/2, cy - screenH/2, screenW, screenH, 8);
          ctx.clip();
          ctx.drawImage(img, cx - screenW/2, cy - screenH/2, screenW, screenH);
          ctx.restore();
          
          // Camera
          ctx.fillStyle = '#2a2a2e';
          ctx.beginPath();
          ctx.arc(cx, cy - h/2 + 12, 4, 0, Math.PI * 2);
          ctx.fill();
       }
       
       // === PHONES (iPhone, Pixel, Samsung) ===
       else if (deviceId.includes('iphone') || deviceId.includes('pixel') || deviceId.includes('samsung') || deviceId.includes('phone')) {
          h = width * 2.1;
          
          ctx.shadowColor = 'rgba(0,0,0,0.35)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 6;
          
          // Body
          ctx.fillStyle = '#111';
          ctx.beginPath();
          roundRect(ctx, cx - width/2, cy - h/2, width, h, 32);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          
          // Dynamic Island / Notch
          if (deviceId.includes('iphone-15') || deviceId.includes('iphone-14-pro')) {
            // Dynamic Island
            ctx.fillStyle = '#000';
            ctx.beginPath();
            roundRect(ctx, cx - width*0.22, cy - h/2 + 12, width*0.44, 22, 11);
            ctx.fill();
          } else if (deviceId.includes('iphone')) {
            // Notch
            ctx.fillStyle = '#000';
            ctx.beginPath();
            roundRect(ctx, cx - width*0.3, cy - h/2 + 8, width*0.6, 24, 12);
            ctx.fill();
          } else if (deviceId.includes('pixel')) {
            // Pixel punch hole
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(cx, cy - h/2 + 20, 6, 0, Math.PI * 2);
            ctx.fill();
          } else if (deviceId.includes('samsung')) {
            // Samsung punch hole
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(cx, cy - h/2 + 20, 5, 0, Math.PI * 2);
            ctx.fill();
          }
          
          // Screen
          screenW = width * 0.92;
          screenH = h * 0.94;
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, cx - screenW/2, cy - h/2 + (h*0.03), screenW, screenH, 24);
          ctx.clip();
          ctx.drawImage(img, cx - screenW/2, cy - h/2 + (h*0.03), screenW, screenH);
          ctx.restore();
       }
       
       // === FALLBACK ===
       else {
          h = width * 0.6;
          ctx.drawImage(img, cx - width/2, cy - h/2, width, h);
       }
    }

    // Event Listeners
    overlay.querySelector('#close-showcase').onclick = () => overlay.remove();
    overlay.querySelector('#download-showcase').onclick = () => {
       const link = document.createElement('a');
       link.download = `Showcase-${Date.now()}.png`;
       link.href = canvas.toDataURL('image/png');
       link.click();
    };

    // Active slot for assignment
    let activeSlot = null;

    // Template Switching (new .tpl-chip class)
    const tplChips = overlay.querySelectorAll('.tpl-chip');
    tplChips.forEach(btn => {
      btn.onclick = () => {
        tplChips.forEach(b => { 
          b.classList.remove('active');
          b.style.background = 'rgba(255,255,255,0.05)';
          b.style.borderColor = 'rgba(255,255,255,0.08)';
          b.style.color = 'rgba(255,255,255,0.6)';
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(99,102,241,0.2)';
        btn.style.borderColor = 'rgba(99,102,241,0.5)';
        btn.style.color = '#a5b4fc';
        currentTemplate = btn.dataset.tpl;
        items = [];
        
        const customControls = overlay.querySelector('#custom-controls');
        if (currentTemplate === 'Custom') {
          if (customControls) customControls.style.display = 'block';
        } else {
          if (customControls) customControls.style.display = 'none';
        }
        
        // Auto-select "No Mockup" for fullpage templates
        if (currentTemplate === 'Fullpage' || currentTemplate === 'Fullpage Split') {
          overlay.querySelectorAll('.device-select').forEach(select => {
            select.value = 'none';
            const slot = parseInt(select.dataset.slot);
            slotConfig[slot].deviceId = 'none';
          });
        }
        
        render();
      };
    });

    // Screenshot Dropdown - Change which screenshot is in each slot
    overlay.querySelectorAll('.screenshot-select').forEach(select => {
      select.onchange = () => {
        const slot = parseInt(select.dataset.slot);
        const idx = parseInt(select.value);
        sorted[slot] = selectedScreenshots[idx];
        
        // Update thumbnail
        const thumb = overlay.querySelector(`.slot-thumb[data-slot="${slot}"]`);
        if (thumb && sorted[slot]) {
          thumb.innerHTML = `<img src="${sorted[slot].dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
        }
        render();
      };
    });

    // Device Dropdown - Change which device frame is used
    overlay.querySelectorAll('.device-select').forEach(select => {
      select.onchange = () => {
        const slot = parseInt(select.dataset.slot);
        slotConfig[slot].deviceId = select.value;
        render();
      };
    });

    overlay.querySelectorAll('.slot-device-name').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        devicePickerSlot = parseInt(el.dataset.slot);
        const category = ['desktop', 'tablet', 'phone'][devicePickerSlot];
        
        // Build device grid
        devicePickerGrid.innerHTML = SHOWCASE_DEVICES[category].map(d => `
          <button class="device-pick" data-id="${d.id}" style="padding:10px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:rgba(255,255,255,0.8);font-size:0.75rem;cursor:pointer;transition:all 0.2s;text-align:center;">
            <div style="font-size:1.2rem;margin-bottom:4px;">${d.icon}</div>
            ${d.name}
          </button>
        `).join('');
        
        // Position picker near clicked element
        const rect = el.getBoundingClientRect();
        devicePicker.style.display = 'block';
        devicePicker.style.left = `${rect.left}px`;
        devicePicker.style.top = `${rect.top - 200}px`;
        
        // Attach click handlers
        devicePicker.querySelectorAll('.device-pick').forEach(btn => {
          btn.onclick = () => {
            slotConfig[devicePickerSlot].deviceId = btn.dataset.id;
            // Update device name display
            el.textContent = SHOWCASE_DEVICES[category].find(d => d.id === btn.dataset.id).name + ' ▾';
            devicePicker.style.display = 'none';
            render();
          };
        });
      };
    });

    // Close device picker on click outside
    overlay.onclick = (e) => {
      if (!devicePicker.contains(e.target) && !e.target.classList.contains('slot-device-name')) {
        devicePicker.style.display = 'none';
      }
    };

    // Background Switching (new .bg-dot class)
    overlay.querySelectorAll('.bg-dot').forEach(btn => {
       btn.onclick = (e) => {
          e.stopPropagation();
          overlay.querySelectorAll('.bg-dot').forEach(b => b.style.borderColor = 'transparent');
          btn.style.borderColor = '#fff';
          const bgId = btn.dataset.bg;
          const bg = BACKGROUNDS.find(b => b.id === bgId);
          if (bg) {
            bgGradient = bg.colors;
          }
          render();
       };
    });
    
    // Custom Background Color
    const customBgColor = overlay.querySelector('#custom-bg-color');
    if (customBgColor) {
      customBgColor.oninput = () => {
        // Deselect all preset backgrounds
        overlay.querySelectorAll('.bg-dot').forEach(b => b.style.borderColor = 'transparent');
        bgGradient = [customBgColor.value, customBgColor.value];
        render();
      };
    }
    
    // Zoom Controls
    const zoomInBtn = overlay.querySelector('#zoom-in');
    const zoomOutBtn = overlay.querySelector('#zoom-out');
    const zoomResetBtn = overlay.querySelector('#zoom-reset');
    const zoomLevelEl = overlay.querySelector('#zoom-level');
    
    function updateZoom() {
      canvas.style.transform = `scale(${zoomLevel})`;
      zoomLevelEl.textContent = `${Math.round(zoomLevel * 100)}%`;
    }
    
    if (zoomInBtn) zoomInBtn.onclick = () => { 
      zoomLevel = Math.min(zoomLevel + 0.1, 2); 
      updateZoom(); 
    };
    if (zoomOutBtn) zoomOutBtn.onclick = () => { 
      zoomLevel = Math.max(zoomLevel - 0.1, 0.5); 
      updateZoom(); 
    };
    if (zoomResetBtn) zoomResetBtn.onclick = () => { 
      zoomLevel = 1; 
      updateZoom(); 
    };
    
    // Slot Reorder Buttons
    overlay.querySelectorAll('.slot-move-up').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const slotIdx = parseInt(btn.dataset.slot);
        if (slotIdx > 0) {
          // Swap with previous
          [sorted[slotIdx], sorted[slotIdx - 1]] = [sorted[slotIdx - 1], sorted[slotIdx]];
          render();
          // Re-render slot assignments UI would require overlay refresh
        }
      };
    });
    
    overlay.querySelectorAll('.slot-move-down').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const slotIdx = parseInt(btn.dataset.slot);
        if (slotIdx < sorted.length - 1) {
          // Swap with next
          [sorted[slotIdx], sorted[slotIdx + 1]] = [sorted[slotIdx + 1], sorted[slotIdx]];
          render();
        }
      };
    });
    
    // Layer Controls (Custom mode)
    const layerForward = overlay.querySelector('#layer-forward');
    const layerBack = overlay.querySelector('#layer-back');
    const itemDelete = overlay.querySelector('#item-delete');
    const layoutReset = overlay.querySelector('#layout-reset');
    
    if (layerForward) layerForward.onclick = () => {
      const selectedIdx = items.findIndex(item => item.selected);
      if (selectedIdx > -1 && selectedIdx < items.length - 1) {
        [items[selectedIdx], items[selectedIdx + 1]] = [items[selectedIdx + 1], items[selectedIdx]];
        render();
      }
    };
    
    if (layerBack) layerBack.onclick = () => {
      const selectedIdx = items.findIndex(item => item.selected);
      if (selectedIdx > 0) {
        [items[selectedIdx], items[selectedIdx - 1]] = [items[selectedIdx - 1], items[selectedIdx]];
        render();
      }
    };
    
    if (itemDelete) itemDelete.onclick = () => {
      const selectedIdx = items.findIndex(item => item.selected);
      if (selectedIdx > -1) {
        items.splice(selectedIdx, 1);
        updateCustomDeviceSelector();
        render();
      }
    };
    
    if (layoutReset) layoutReset.onclick = () => {
      items = []; // Will reinitialize on next render
      render();
    };

    // Custom dragging logic
    canvas.onmousedown = (e) => {
       if (currentTemplate !== 'Custom') return;
       const rect = canvas.getBoundingClientRect();
       const scaleX = canvas.width / rect.width;
       const scaleY = canvas.height / rect.height;
       const mx = (e.clientX - rect.left) * scaleX;
       const my = (e.clientY - rect.top) * scaleY;
       
       // Hit test with proper height calculation based on device type
       let hitItem = null;
       for (let item of items) {
          // Calculate height based on device type
          const isPhone = item.deviceId.includes('phone') || item.deviceId.includes('iphone') || item.deviceId.includes('pixel') || item.deviceId.includes('samsung');
          const isTablet = item.deviceId.includes('ipad') || item.deviceId.includes('tablet') || item.deviceId.includes('galaxy-tab') || item.deviceId.includes('surface');
          const h = isPhone ? item.w * 2.1 : (isTablet ? item.w * 1.4 : item.w * 0.7);
          
          if (mx > item.x - item.w/2 && mx < item.x + item.w/2 &&
              my > item.y - h/2 && my < item.y + h/2) {
             hitItem = item;
             isDragging = true;
             dragItem = item;
             dragItem.lastX = mx;
             dragItem.lastY = my;
             break;
          }
       }
       
       // Update selection
       items.forEach(item => item.selected = false);
       if (hitItem) {
          hitItem.selected = true;
       }
       updateCustomDeviceSelector();
       render();
    };
    
    canvas.onmousemove = (e) => {
       if (isDragging && dragItem) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const mx = (e.clientX - rect.left) * scaleX;
          const my = (e.clientY - rect.top) * scaleY;
          
          dragItem.x += (mx - dragItem.lastX);
          dragItem.y += (my - dragItem.lastY);
          dragItem.lastX = mx;
          dragItem.lastY = my;
          render();
       }
    };
    
    canvas.onmouseup = () => { isDragging = false; dragItem = null; };
    
    // Custom background color handler
    const customBgInput = overlay.querySelector('#custom-bg-color');
    if (customBgInput) {
      customBgInput.addEventListener('input', (e) => {
        const color = e.target.value;
        bgGradient = [color, color];
        overlay.querySelectorAll('.bg-btn').forEach(b => b.style.borderColor = 'transparent');
        render();
      });
    }

    document.body.appendChild(overlay);
    // Initial Render
    await render();
  }

  async function exportPdf() {
    // TODO: Implement PDF export using jsPDF
    alert('PDF export coming soon!');
  }

  // Preview modal
  function openPreview(screenshot) {
    const isVideo = screenshot.captureType === 'video' || screenshot.filename?.endsWith('.webm');
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal-content">
        <button class="modal-close">✕</button>
        ${isVideo ? `
          <video class="modal-image" src="${screenshot.dataUrl}" controls autoplay style="max-width:90vw;max-height:85vh;"></video>
        ` : `
          <img class="modal-image" src="${screenshot.dataUrl}" alt="${screenshot.filename}">
        `}
      </div>
    `;

    const closeBtn = overlay.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  // Get device options based on screenshot type
  function getDeviceOptions(device) {
    const options = {
      mobile: [
        { id: 'iphone-14', name: 'iPhone 14' },
        { id: 'iphone-15-pro', name: 'iPhone 15 Pro' },
        { id: 'pixel-8', name: 'Pixel 8' },
        { id: 'samsung-s24', name: 'Samsung S24' }
      ],
      tablet: [
        { id: 'ipad-pro', name: 'iPad Pro' },
        { id: 'ipad-air', name: 'iPad Air' }
      ],
      desktop: [
        { id: 'macbook-pro', name: 'MacBook Pro' },
        { id: 'browser-light', name: 'Browser (Light)' },
        { id: 'browser-dark', name: 'Browser (Dark)' }
      ]
    };
    return options[device] || options.desktop;
  }

  // Generate mockup on canvas
  function generateMockup(canvas, screenshot, deviceId, bgColor) {
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      const frame = getFrameConfig(deviceId, img.width, img.height);
      
      canvas.width = frame.canvasWidth;
      canvas.height = frame.canvasHeight;
      
      // Background
      if (bgColor === 'gradient') {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      // Draw device frame
      drawDeviceFrame(ctx, frame, deviceId);
      
      // Draw screenshot inside frame
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, frame.screenX, frame.screenY, frame.screenWidth, frame.screenHeight, frame.screenRadius);
      ctx.clip();
      ctx.drawImage(img, frame.screenX, frame.screenY, frame.screenWidth, frame.screenHeight);
      ctx.restore();
    };
    
    img.src = screenshot.dataUrl;
  }

  // Get frame configuration for device
  function getFrameConfig(deviceId, imgWidth, imgHeight) {
    const padding = 60;
    const configs = {
      'iphone-14': { bezel: 20, radius: 50, screenRadius: 45, ratio: 0.46 },
      'iphone-15-pro': { bezel: 16, radius: 55, screenRadius: 50, ratio: 0.46 },
      'pixel-8': { bezel: 18, radius: 40, screenRadius: 35, ratio: 0.47 },
      'samsung-s24': { bezel: 14, radius: 45, screenRadius: 40, ratio: 0.46 },
      'ipad-pro': { bezel: 30, radius: 25, screenRadius: 15, ratio: 0.75 },
      'ipad-air': { bezel: 35, radius: 30, screenRadius: 20, ratio: 0.75 },
      'macbook-pro': { bezel: 25, radius: 15, screenRadius: 8, ratio: 1.6, hasNotch: true },
      'browser-light': { bezel: 40, radius: 12, screenRadius: 0, ratio: 1.6, browser: true, light: true },
      'browser-dark': { bezel: 40, radius: 12, screenRadius: 0, ratio: 1.6, browser: true, light: false }
    };
    
    const cfg = configs[deviceId] || configs['iphone-14'];
    const scale = Math.min(800 / imgWidth, 1200 / imgHeight, 1);
    
    const screenWidth = imgWidth * scale;
    const screenHeight = imgHeight * scale;
    const bezel = cfg.bezel;
    
    return {
      canvasWidth: screenWidth + bezel * 2 + padding * 2,
      canvasHeight: screenHeight + bezel * 2 + padding * 2 + (cfg.browser ? 40 : 0),
      frameX: padding,
      frameY: padding,
      frameWidth: screenWidth + bezel * 2,
      frameHeight: screenHeight + bezel * 2 + (cfg.browser ? 40 : 0),
      screenX: padding + bezel,
      screenY: padding + bezel + (cfg.browser ? 40 : 0),
      screenWidth,
      screenHeight,
      frameRadius: cfg.radius,
      screenRadius: cfg.screenRadius,
      ...cfg
    };
  }

  // Draw device frame - REALISTIC versions
  function drawDeviceFrame(ctx, frame, deviceId) {
    ctx.save();
    
    if (frame.browser) {
      // Browser window with shadow
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 10;
      
      ctx.fillStyle = frame.light ? '#f5f5f5' : '#2d2d2d';
      roundRect(ctx, frame.frameX, frame.frameY, frame.frameWidth, frame.frameHeight, frame.frameRadius);
      ctx.fill();
      
      ctx.shadowColor = 'transparent';
      
      // Browser toolbar
      ctx.fillStyle = frame.light ? '#e8e8e8' : '#1a1a1a';
      roundRect(ctx, frame.frameX, frame.frameY, frame.frameWidth, 40, frame.frameRadius);
      ctx.fill();
      ctx.fillStyle = frame.light ? '#e8e8e8' : '#1a1a1a';
      ctx.fillRect(frame.frameX, frame.frameY + 20, frame.frameWidth, 20);
      
      // Traffic lights
      const dotY = frame.frameY + 20;
      const dotX = frame.frameX + 20;
      ctx.fillStyle = '#ff5f57'; ctx.beginPath(); ctx.arc(dotX, dotY, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#febc2e'; ctx.beginPath(); ctx.arc(dotX + 20, dotY, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#28c840'; ctx.beginPath(); ctx.arc(dotX + 40, dotY, 6, 0, Math.PI * 2); ctx.fill();
      
      // URL bar
      ctx.fillStyle = frame.light ? '#ffffff' : '#3d3d3d';
      roundRect(ctx, frame.frameX + 80, frame.frameY + 10, frame.frameWidth - 100, 20, 10);
      ctx.fill();
      
    } else if (deviceId.includes('macbook')) {
      // MacBook with realistic body
      const baseHeight = 30;
      
      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 15;
      
      // Screen bezel (lid)
      ctx.fillStyle = '#1c1c1e';
      roundRect(ctx, frame.frameX, frame.frameY, frame.frameWidth, frame.frameHeight, 12);
      ctx.fill();
      
      ctx.shadowColor = 'transparent';
      
      // Screen inner bezel
      ctx.fillStyle = '#0a0a0a';
      roundRect(ctx, frame.screenX - 4, frame.screenY - 4, frame.screenWidth + 8, frame.screenHeight + 8, 4);
      ctx.fill();
      
      // Notch/camera
      const notchWidth = 80;
      const notchHeight = 20;
      ctx.fillStyle = '#0a0a0a';
      roundRect(ctx, frame.screenX + frame.screenWidth/2 - notchWidth/2, frame.screenY - 4, notchWidth, notchHeight, 10);
      ctx.fill();
      
      // Camera dot
      ctx.fillStyle = '#2a2a2e';
      ctx.beginPath();
      ctx.arc(frame.screenX + frame.screenWidth/2, frame.screenY + 6, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Base/keyboard section - trapezoid shape
      const baseY = frame.frameY + frame.frameHeight;
      ctx.fillStyle = '#2c2c2e';
      ctx.beginPath();
      ctx.moveTo(frame.frameX + 10, baseY);
      ctx.lineTo(frame.frameX + frame.frameWidth - 10, baseY);
      ctx.lineTo(frame.frameX + frame.frameWidth + 20, baseY + baseHeight);
      ctx.lineTo(frame.frameX - 20, baseY + baseHeight);
      ctx.closePath();
      ctx.fill();
      
      // Hinge line
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(frame.frameX - 15, baseY + 2);
      ctx.lineTo(frame.frameX + frame.frameWidth + 15, baseY + 2);
      ctx.stroke();
      
    } else if (deviceId.includes('ipad')) {
      // iPad with realistic frame
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetY = 10;
      
      // Main body
      ctx.fillStyle = '#1c1c1e';
      roundRect(ctx, frame.frameX, frame.frameY, frame.frameWidth, frame.frameHeight, frame.frameRadius);
      ctx.fill();
      
      ctx.shadowColor = 'transparent';
      
      // Metallic edge
      ctx.strokeStyle = '#3a3a3c';
      ctx.lineWidth = 3;
      roundRect(ctx, frame.frameX, frame.frameY, frame.frameWidth, frame.frameHeight, frame.frameRadius);
      ctx.stroke();
      
      // Camera
      ctx.fillStyle = '#2a2a2e';
      ctx.beginPath();
      ctx.arc(frame.frameX + frame.frameWidth/2, frame.frameY + 15, 5, 0, Math.PI * 2);
      ctx.fill();
      
    } else {
      // iPhone with Dynamic Island / Notch
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 15;
      
      // Main body - titanium/stainless steel frame
      ctx.fillStyle = '#1c1c1e';
      roundRect(ctx, frame.frameX, frame.frameY, frame.frameWidth, frame.frameHeight, frame.frameRadius);
      ctx.fill();
      
      ctx.shadowColor = 'transparent';
      
      // Metallic edge highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;
      roundRect(ctx, frame.frameX, frame.frameY, frame.frameWidth, frame.frameHeight, frame.frameRadius);
      ctx.stroke();
      
      // Side buttons - volume (left side)
      ctx.fillStyle = '#3a3a3c';
      roundRect(ctx, frame.frameX - 3, frame.frameY + 80, 3, 30, 1);
      ctx.fill();
      roundRect(ctx, frame.frameX - 3, frame.frameY + 120, 3, 30, 1);
      ctx.fill();
      
      // Side button - mute switch
      roundRect(ctx, frame.frameX - 3, frame.frameY + 50, 3, 18, 1);
      ctx.fill();
      
      // Power button (right side)
      roundRect(ctx, frame.frameX + frame.frameWidth, frame.frameY + 100, 3, 45, 1);
      ctx.fill();
      
      // Dynamic Island (iPhone 14 Pro+) or Notch
      if (deviceId.includes('15') || deviceId.includes('14')) {
        // Dynamic Island - pill shape
        const pillWidth = 90;
        const pillHeight = 28;
        ctx.fillStyle = '#000000';
        roundRect(ctx, frame.screenX + frame.screenWidth/2 - pillWidth/2, frame.screenY + 12, pillWidth, pillHeight, 14);
        ctx.fill();
      } else {
        // Classic notch
        const notchWidth = 130;
        const notchHeight = 28;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(frame.screenX + frame.screenWidth/2 - notchWidth/2, frame.screenY);
        ctx.lineTo(frame.screenX + frame.screenWidth/2 - notchWidth/2 + 10, frame.screenY + notchHeight);
        ctx.lineTo(frame.screenX + frame.screenWidth/2 + notchWidth/2 - 10, frame.screenY + notchHeight);
        ctx.lineTo(frame.screenX + frame.screenWidth/2 + notchWidth/2, frame.screenY);
        ctx.closePath();
        ctx.fill();
      }
      
      // Home indicator bar at bottom
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      roundRect(ctx, frame.screenX + frame.screenWidth/2 - 50, frame.screenY + frame.screenHeight - 20, 100, 4, 2);
      ctx.fill();
    }
    
    ctx.restore();
  }

  // Rounded rectangle helper
  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Utilities
  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================================
  // SHOWCASE MODAL WITH TEMPLATES
  // ==================================
  
  const showcaseTemplates = [
    { id: 'classic', name: 'Classic 3-Device', slots: ['desktop', 'tablet', 'mobile'], preview: '💻📱📲' },
    { id: 'imac-hero', name: 'iMac Hero', slots: ['desktop'], preview: '🖥️' },
    { id: 'laptop-phone', name: 'Laptop + Phone', slots: ['desktop', 'mobile'], preview: '💻📱' },
    { id: 'stacked-pages', name: 'Stacked Pages', slots: ['page1', 'page2', 'page3'], preview: '📄📄📄' },
    { id: 'multi-screen', name: 'Multi-Screen', slots: ['screen1', 'screen2', 'screen3', 'screen4'], preview: '⬜⬜⬜⬜' }
  ];

  const backgroundPresets = [
    { id: 'dark-gradient', name: 'Dark Gradient', colors: ['#1a1a2e', '#16213e', '#0f3460'] },
    { id: 'light-gray', name: 'Light Gray', colors: ['#f5f5f5', '#e8e8e8', '#ddd'] },
    { id: 'coral', name: 'Coral', colors: ['#ff6b6b', '#ee5a5a', '#ff7878'] },
    { id: 'teal', name: 'Teal Gradient', colors: ['#0d9488', '#14b8a6', '#2dd4bf'] },
    { id: 'purple', name: 'Purple', colors: ['#7c3aed', '#8b5cf6', '#a78bfa'] },
    { id: 'custom', name: 'Custom Color', colors: ['#667eea', '#764ba2', '#667eea'] }
  ];

  function openShowcaseModal(domainScreenshots) {
    let selectedTemplate = showcaseTemplates[0];
    let selectedBackground = backgroundPresets[0];
    let customColor = '#667eea';
    let slotAssignments = {}; // { slotName: screenshotIndex }
    let activeSlot = null; // Currently selected slot for assignment

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="showcase-modal showcase-modal-wide">
        <div class="showcase-header">
          <h2>🖼️ Create Showcase</h2>
          <button class="modal-close">✕</button>
        </div>
        
        <div class="showcase-body-grid">
          <!-- Left: Templates & Backgrounds -->
          <div class="showcase-left">
            <div class="showcase-section">
              <h3>Template</h3>
              <div class="template-grid-compact">
                ${showcaseTemplates.map((t, i) => `
                  <div class="template-chip ${i === 0 ? 'selected' : ''}" data-template="${t.id}" title="${t.name}">
                    <span class="chip-icon">${t.preview}</span>
                    <span class="chip-label">${t.name}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="showcase-section">
              <h3>Background</h3>
              <div class="bg-grid-compact">
                ${backgroundPresets.slice(0, 5).map((bg, i) => `
                  <div class="bg-chip ${i === 0 ? 'selected' : ''}" data-bg="${bg.id}" style="background: linear-gradient(135deg, ${bg.colors.join(', ')})" title="${bg.name}"></div>
                `).join('')}
                <input type="color" id="custom-bg-color" value="#667eea" class="bg-chip-custom" title="Custom Color">
              </div>
            </div>

            <!-- Slot Assignment Area -->
            <div class="showcase-section">
              <h3>Assign Images <span class="hint">(Click slot → click image)</span></h3>
              <div class="slot-grid" id="slot-grid">
                ${selectedTemplate.slots.map(slot => `
                  <div class="slot-box" data-slot="${slot}">
                    <div class="slot-placeholder">
                      <span class="slot-icon">${getSlotIcon(slot)}</span>
                      <span class="slot-name">${formatSlotName(slot)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Live Preview -->
            <div class="showcase-section">
              <h3>Preview</h3>
              <div class="preview-container" id="preview-container">
                <canvas id="preview-canvas"></canvas>
                <div class="preview-placeholder">Assign screenshots to see preview</div>
              </div>
            </div>
          </div>

          <!-- Right: Screenshot Thumbnails -->
          <div class="showcase-right">
            <h3>Available Screenshots</h3>
            <div class="screenshot-thumbs" id="screenshot-thumbs">
              ${domainScreenshots.map((s, i) => `
                <div class="thumb-card" data-index="${i}" title="${s.filename}">
                  <img src="${s.dataUrl}" alt="${s.filename}">
                  <div class="thumb-label">${s.device || 'Screenshot'}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="showcase-footer">
          <button class="btn btn-secondary" id="btn-cancel-showcase">Cancel</button>
          <button class="btn btn-primary" id="btn-generate-showcase">💾 Download Showcase</button>
        </div>
      </div>
    `;

    function getSlotIcon(slot) {
      const icons = { desktop: '💻', tablet: '📱', mobile: '📲', page1: '1️⃣', page2: '2️⃣', page3: '3️⃣', 
                      screen1: '①', screen2: '②', screen3: '③', screen4: '④' };
      return icons[slot] || '📷';
    }

    function formatSlotName(slot) {
      return slot.charAt(0).toUpperCase() + slot.slice(1).replace(/\d/, ' $&');
    }

    // Event handlers
    const closeBtn = overlay.querySelector('.modal-close');
    const cancelBtn = overlay.querySelector('#btn-cancel-showcase');
    const generateBtn = overlay.querySelector('#btn-generate-showcase');
    const templateChips = overlay.querySelectorAll('.template-chip');
    const bgChips = overlay.querySelectorAll('.bg-chip');
    const customColorInput = overlay.querySelector('#custom-bg-color');
    const slotGrid = overlay.querySelector('#slot-grid');
    const thumbsContainer = overlay.querySelector('#screenshot-thumbs');

    closeBtn.addEventListener('click', () => overlay.remove());
    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Template selection
    templateChips.forEach(chip => {
      chip.addEventListener('click', () => {
        templateChips.forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedTemplate = showcaseTemplates.find(t => t.id === chip.dataset.template);
        slotAssignments = {};
        activeSlot = null;
        updateSlotGrid();
      });
    });

    // Background selection
    bgChips.forEach(chip => {
      chip.addEventListener('click', () => {
        bgChips.forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedBackground = backgroundPresets.find(b => b.id === chip.dataset.bg);
        renderPreview();
      });
    });

    customColorInput.addEventListener('input', (e) => {
      customColor = e.target.value;
      selectedBackground = { id: 'custom', name: 'Custom', colors: [customColor, customColor, customColor] };
      bgChips.forEach(c => c.classList.remove('selected'));
      renderPreview();
    });

    // Slot selection
    slotGrid.addEventListener('click', (e) => {
      const slotBox = e.target.closest('.slot-box');
      if (slotBox) {
        slotGrid.querySelectorAll('.slot-box').forEach(s => s.classList.remove('active'));
        slotBox.classList.add('active');
        activeSlot = slotBox.dataset.slot;
      }
    });

    // Thumbnail selection - assign to active slot
    thumbsContainer.addEventListener('click', (e) => {
      const thumbCard = e.target.closest('.thumb-card');
      if (thumbCard && activeSlot) {
        const idx = parseInt(thumbCard.dataset.index);
        slotAssignments[activeSlot] = idx;
        updateSlotGrid();
        
        // Auto-select next empty slot
        const emptySlot = selectedTemplate.slots.find(s => slotAssignments[s] === undefined);
        if (emptySlot) {
          activeSlot = emptySlot;
          slotGrid.querySelectorAll('.slot-box').forEach(s => s.classList.remove('active'));
          slotGrid.querySelector(`[data-slot="${emptySlot}"]`)?.classList.add('active');
        } else {
          activeSlot = null;
          slotGrid.querySelectorAll('.slot-box').forEach(s => s.classList.remove('active'));
        }
      }
    });

    function updateSlotGrid() {
      slotGrid.innerHTML = selectedTemplate.slots.map(slot => {
        const assigned = slotAssignments[slot];
        const isActive = slot === activeSlot;
        if (assigned !== undefined) {
          const s = domainScreenshots[assigned];
          return `
            <div class="slot-box filled ${isActive ? 'active' : ''}" data-slot="${slot}">
              <img src="${s.dataUrl}" alt="${s.filename}">
              <span class="slot-badge">${formatSlotName(slot)}</span>
              <button class="slot-clear" data-slot="${slot}">✕</button>
            </div>
          `;
        }
        return `
          <div class="slot-box ${isActive ? 'active' : ''}" data-slot="${slot}">
            <div class="slot-placeholder">
              <span class="slot-icon">${getSlotIcon(slot)}</span>
              <span class="slot-name">${formatSlotName(slot)}</span>
            </div>
          </div>
        `;
      }).join('');

      // Re-attach clear button handlers
      slotGrid.querySelectorAll('.slot-clear').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const slot = btn.dataset.slot;
          delete slotAssignments[slot];
          updateSlotGrid();
        });
      });

      // Update available thumbnails (filter out assigned ones)
      updateAvailableThumbs();
      
      // Update preview
      renderPreview();
    }

    // Filter thumbnails to hide already-assigned screenshots
    function updateAvailableThumbs() {
      const assignedIndices = new Set(Object.values(slotAssignments));
      
      thumbsContainer.innerHTML = domainScreenshots.map((s, i) => {
        // Skip screenshots already assigned to a slot
        if (assignedIndices.has(i)) {
          return '';
        }
        return `
          <div class="thumb-card" data-index="${i}" title="${s.filename}">
            <img src="${s.dataUrl}" alt="${s.filename}">
            <div class="thumb-label">${s.device || 'Screenshot'}</div>
          </div>
        `;
      }).join('');
      
      // Show message if no thumbnails available
      if (assignedIndices.size === domainScreenshots.length) {
        thumbsContainer.innerHTML = '<div class="no-thumbs-msg">All screenshots assigned</div>';
      }
    }

    // Live preview rendering
    const previewCanvas = overlay.querySelector('#preview-canvas');
    const previewContainer = overlay.querySelector('#preview-container');
    const previewPlaceholder = overlay.querySelector('.preview-placeholder');
    const previewCtx = previewCanvas.getContext('2d');

    async function renderPreview() {
      const hasAssignments = Object.keys(slotAssignments).length > 0;
      previewPlaceholder.style.display = hasAssignments ? 'none' : 'flex';
      previewCanvas.style.display = hasAssignments ? 'block' : 'none';

      if (!hasAssignments) return;

      // Set preview size (scaled down for performance)
      const previewWidth = 480;
      const previewHeight = 270;
      previewCanvas.width = previewWidth;
      previewCanvas.height = previewHeight;

      const scale = previewWidth / 1920;

      // Draw background
      const bgColors = selectedBackground.colors;
      const gradient = previewCtx.createLinearGradient(0, 0, previewWidth, previewHeight);
      gradient.addColorStop(0, bgColors[0]);
      gradient.addColorStop(0.5, bgColors[1] || bgColors[0]);
      gradient.addColorStop(1, bgColors[2] || bgColors[0]);
      previewCtx.fillStyle = gradient;
      previewCtx.fillRect(0, 0, previewWidth, previewHeight);

      // Build slots object
      const slots = {};
      Object.entries(slotAssignments).forEach(([slot, idx]) => {
        slots[slot] = domainScreenshots[idx];
      });

      // Simple preview - just show thumbnails in approximate positions
      const loadImage = (dataUrl) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });

      switch (selectedTemplate.id) {
        case 'classic':
          if (slots.desktop) {
            const img = await loadImage(slots.desktop.dataUrl);
            if (img) previewCtx.drawImage(img, 160 * scale, 80 * scale, 900 * scale, 500 * scale);
          }
          if (slots.tablet) {
            const img = await loadImage(slots.tablet.dataUrl);
            if (img) previewCtx.drawImage(img, 1500 * scale, 500 * scale, 280 * scale, 400 * scale);
          }
          if (slots.mobile) {
            const img = await loadImage(slots.mobile.dataUrl);
            if (img) previewCtx.drawImage(img, 100 * scale, 500 * scale, 180 * scale, 350 * scale);
          }
          break;
        case 'imac-hero':
          if (slots.desktop) {
            const img = await loadImage(slots.desktop.dataUrl);
            if (img) previewCtx.drawImage(img, 360 * scale, 100 * scale, 1200 * scale, 700 * scale);
          }
          break;
        case 'laptop-phone':
          if (slots.desktop) {
            const img = await loadImage(slots.desktop.dataUrl);
            if (img) previewCtx.drawImage(img, 100 * scale, 100 * scale, 1000 * scale, 600 * scale);
          }
          if (slots.mobile) {
            const img = await loadImage(slots.mobile.dataUrl);
            if (img) previewCtx.drawImage(img, 1500 * scale, 400 * scale, 220 * scale, 400 * scale);
          }
          break;
        default:
          // For other templates, just show assigned images in a row
          let xOffset = 50;
          for (const [slot, screenshot] of Object.entries(slots)) {
            const img = await loadImage(screenshot.dataUrl);
            if (img) {
              previewCtx.drawImage(img, xOffset * scale, 100 * scale, 400 * scale, 500 * scale);
              xOffset += 450;
            }
          }
      }
    }

    // Generate showcase
    generateBtn.addEventListener('click', async () => {
      const slots = {};
      Object.entries(slotAssignments).forEach(([slot, idx]) => {
        slots[slot] = domainScreenshots[idx];
      });

      if (Object.keys(slots).length === 0) {
        alert('Please assign at least one screenshot to a slot');
        return;
      }

      generateBtn.textContent = '⏳ Generating...';
      generateBtn.disabled = true;

      try {
        await renderShowcase(selectedTemplate.id, selectedBackground.colors, slots);
        overlay.remove();
      } catch (error) {
        console.error('Showcase generation error:', error);
        alert('Failed to generate showcase');
      } finally {
        generateBtn.textContent = '✨ Generate Showcase';
        generateBtn.disabled = false;
      }
    });

    document.body.appendChild(overlay);
  }

  // Render showcase based on template
  async function renderShowcase(templateId, bgColors, slots) {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    // Draw background gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, bgColors[0]);
    gradient.addColorStop(0.5, bgColors[1] || bgColors[0]);
    gradient.addColorStop(1, bgColors[2] || bgColors[0]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add subtle pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let x = 0; x < canvas.width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    const loadImage = (dataUrl) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });

    // Template-specific rendering
    switch (templateId) {
      case 'classic':
        await renderClassicTemplate(ctx, canvas, slots, loadImage);
        break;
      case 'imac-hero':
        await renderImacHeroTemplate(ctx, canvas, slots, loadImage);
        break;
      case 'laptop-phone':
        await renderLaptopPhoneTemplate(ctx, canvas, slots, loadImage);
        break;
      case 'stacked-pages':
        await renderStackedPagesTemplate(ctx, canvas, slots, loadImage);
        break;
      case 'multi-screen':
        await renderMultiScreenTemplate(ctx, canvas, slots, loadImage);
        break;
    }

    // Download
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `DevShot_Showcase_${templateId}_${Date.now()}.png`;
    link.click();
  }

  // Template: Classic 3-Device (MacBook + iPad + iPhone)
  async function renderClassicTemplate(ctx, canvas, slots, loadImage) {
    // MacBook (center back)
    if (slots.desktop) {
      const img = await loadImage(slots.desktop.dataUrl);
      if (img) {
        const w = 900, h = w * (img.height / img.width);
        const x = (canvas.width - w) / 2, y = 80;
        drawMacBookFrame(ctx, x, y, w, h, img);
      }
    }

    // iPad (right front)
    if (slots.tablet) {
      const img = await loadImage(slots.tablet.dataUrl);
      if (img) {
        const w = 280, h = w * (img.height / img.width);
        const x = canvas.width - 380, y = canvas.height - h - 100;
        drawIPadFrame(ctx, x, y, w, h, img);
      }
    }

    // iPhone (left front)
    if (slots.mobile) {
      const img = await loadImage(slots.mobile.dataUrl);
      if (img) {
        const w = 180, h = w * (img.height / img.width);
        const x = 100, y = canvas.height - h - 80;
        drawIPhoneFrame(ctx, x, y, w, h, img);
      }
    }
  }

  // Template: iMac Hero (single large iMac)
  async function renderImacHeroTemplate(ctx, canvas, slots, loadImage) {
    if (slots.desktop) {
      const img = await loadImage(slots.desktop.dataUrl);
      if (img) {
        const w = 1200, h = w * (img.height / img.width);
        const x = (canvas.width - w) / 2, y = 100;
        drawIMacFrame(ctx, x, y, w, h, img);
      }
    }
  }

  // Template: Laptop + Phone
  async function renderLaptopPhoneTemplate(ctx, canvas, slots, loadImage) {
    if (slots.desktop) {
      const img = await loadImage(slots.desktop.dataUrl);
      if (img) {
        const w = 1000, h = w * (img.height / img.width);
        const x = 100, y = 100;
        drawMacBookFrame(ctx, x, y, w, h, img);
      }
    }

    if (slots.mobile) {
      const img = await loadImage(slots.mobile.dataUrl);
      if (img) {
        const w = 220, h = w * (img.height / img.width);
        const x = canvas.width - 350, y = canvas.height - h - 100;
        drawIPhoneFrame(ctx, x, y, w, h, img);
      }
    }
  }

  // Template: Stacked Pages (tilted floating pages)
  async function renderStackedPagesTemplate(ctx, canvas, slots, loadImage) {
    const pages = ['page1', 'page2', 'page3'];
    let offsetX = 150, offsetY = 120;

    for (let i = 0; i < pages.length; i++) {
      const slot = slots[pages[i]];
      if (slot) {
        const img = await loadImage(slot.dataUrl);
        if (img) {
          const w = 650, h = w * (img.height / img.width);
          const x = offsetX + i * 200, y = offsetY + i * 80;
          
          drawBrowserFrame(ctx, x, y, w, h, img);
        }
      }
    }
  }

  // Template: Multi-Screen (4 screens grid)
  async function renderMultiScreenTemplate(ctx, canvas, slots, loadImage) {
    const screens = ['screen1', 'screen2', 'screen3', 'screen4'];
    const positions = [
      { x: 50, y: 50 }, { x: 980, y: 50 },
      { x: 50, y: 550 }, { x: 980, y: 550 }
    ];

    for (let i = 0; i < screens.length; i++) {
      const slot = slots[screens[i]];
      if (slot) {
        const img = await loadImage(slot.dataUrl);
        if (img) {
          const w = 850, h = 470;
          const { x, y } = positions[i];
          
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.2)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetY = 10;
          
          ctx.fillStyle = '#1c1c1e';
          roundRect(ctx, x - 10, y - 10, w + 20, h + 20, 12);
          ctx.fill();
          
          ctx.shadowColor = 'transparent';
          
          ctx.save();
          roundRect(ctx, x, y, w, h, 6);
          ctx.clip();
          ctx.drawImage(img, x, y, w, h);
          ctx.restore();
          
          ctx.restore();
        }
      }
    }
  }

  // ============================================
  // PHOTOREALISTIC DEVICE FRAME RENDERERS
  // ============================================

  function drawMacBookFrame(ctx, x, y, w, h, img) {
    ctx.save();
    
    const bezelWidth = 18;
    const baseHeight = 20;
    const screenRadius = 8;
    
    // Main shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 30;
    
    // Screen lid (aluminum body)
    const lidGradient = ctx.createLinearGradient(x - bezelWidth, y - bezelWidth, x - bezelWidth, y + h + bezelWidth);
    lidGradient.addColorStop(0, '#8a8a8e');
    lidGradient.addColorStop(0.1, '#a8a8ac');
    lidGradient.addColorStop(0.5, '#c0c0c4');
    lidGradient.addColorStop(0.9, '#a8a8ac');
    lidGradient.addColorStop(1, '#707074');
    ctx.fillStyle = lidGradient;
    roundRect(ctx, x - bezelWidth, y - bezelWidth - 8, w + bezelWidth * 2, h + bezelWidth * 2 + 8, 14);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    
    // Inner screen bezel (black)
    ctx.fillStyle = '#0d0d0d';
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, screenRadius);
    ctx.fill();
    
    // Screen with clipping
    ctx.save();
    roundRect(ctx, x, y, w, h, 4);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    
    // Notch (camera housing)
    const notchWidth = w * 0.12;
    const notchHeight = 18;
    ctx.fillStyle = '#0d0d0d';
    roundRect(ctx, x + w/2 - notchWidth/2, y - 4, notchWidth, notchHeight, 8);
    ctx.fill();
    
    // Camera lens in notch
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x + w/2, y + 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d4a5a';
    ctx.beginPath();
    ctx.arc(x + w/2, y + 5, 2, 0, Math.PI * 2);
    ctx.fill();
    // Camera lens reflection
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x + w/2 - 0.5, y + 4.5, 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    // Green indicator light
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(x + w/2 + notchWidth/4, y + 5, 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Bottom hinge/connector strip
    const hingeY = y + h + bezelWidth - 4;
    const hingeGradient = ctx.createLinearGradient(x, hingeY, x, hingeY + 6);
    hingeGradient.addColorStop(0, '#4a4a4e');
    hingeGradient.addColorStop(0.5, '#707074');
    hingeGradient.addColorStop(1, '#3a3a3e');
    ctx.fillStyle = hingeGradient;
    ctx.fillRect(x - bezelWidth + 30, hingeY, w + bezelWidth * 2 - 60, 6);
    
    // Keyboard base (trapezoid shape)
    const baseY = y + h + bezelWidth + 2;
    const baseGradient = ctx.createLinearGradient(x, baseY, x, baseY + baseHeight);
    baseGradient.addColorStop(0, '#a0a0a4');
    baseGradient.addColorStop(0.3, '#c8c8cc');
    baseGradient.addColorStop(0.7, '#b8b8bc');
    baseGradient.addColorStop(1, '#909094');
    ctx.fillStyle = baseGradient;
    ctx.beginPath();
    ctx.moveTo(x - bezelWidth + 5, baseY);
    ctx.lineTo(x + w + bezelWidth - 5, baseY);
    ctx.lineTo(x + w + bezelWidth + 25, baseY + baseHeight);
    ctx.lineTo(x - bezelWidth - 25, baseY + baseHeight);
    ctx.closePath();
    ctx.fill();
    
    // Base edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - bezelWidth + 5, baseY);
    ctx.lineTo(x + w + bezelWidth - 5, baseY);
    ctx.stroke();
    
    // Lid edge highlights
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, x - bezelWidth + 1, y - bezelWidth - 7, w + bezelWidth * 2 - 2, h + bezelWidth * 2 + 6, 13);
    ctx.stroke();
    
    ctx.restore();
  }

  function drawIPhoneFrame(ctx, x, y, w, h, img) {
    ctx.save();
    
    const bezel = 10;
    const frameRadius = 42;
    const screenRadius = 38;
    
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
    
    // Titanium frame body
    const frameGradient = ctx.createLinearGradient(x - bezel, y, x + w + bezel, y);
    frameGradient.addColorStop(0, '#3a3a3c');
    frameGradient.addColorStop(0.15, '#5a5a5e');
    frameGradient.addColorStop(0.5, '#4a4a4e');
    frameGradient.addColorStop(0.85, '#5a5a5e');
    frameGradient.addColorStop(1, '#3a3a3c');
    ctx.fillStyle = frameGradient;
    roundRect(ctx, x - bezel, y - bezel, w + bezel * 2, h + bezel * 2, frameRadius);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    
    // Inner edge (chamfer effect)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x - bezel + 1, y - bezel + 1, w + bezel * 2 - 2, h + bezel * 2 - 2, frameRadius - 1);
    ctx.stroke();
    
    // Screen background (for rounded corners)
    ctx.fillStyle = '#000';
    roundRect(ctx, x, y, w, h, screenRadius);
    ctx.fill();
    
    // Screen with clipping
    ctx.save();
    roundRect(ctx, x, y, w, h, screenRadius);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    
    // Dynamic Island
    const islandWidth = w * 0.38;
    const islandHeight = 28;
    const islandY = y + 14;
    ctx.fillStyle = '#000';
    roundRect(ctx, x + w/2 - islandWidth/2, islandY, islandWidth, islandHeight, islandHeight/2);
    ctx.fill();
    
    // Speaker grill in Dynamic Island
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, x + w/2 - 15, islandY + islandHeight/2 - 2, 30, 4, 2);
    ctx.fill();
    
    // Face ID sensors (subtle dots)
    ctx.fillStyle = '#1c1c1e';
    ctx.beginPath();
    ctx.arc(x + w/2 - islandWidth/4, islandY + islandHeight/2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w/2 + islandWidth/4, islandY + islandHeight/2, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Home indicator bar
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    roundRect(ctx, x + w/2 - 50, y + h - 18, 100, 5, 3);
    ctx.fill();
    
    // Side buttons (left - mute switch and volume)
    const buttonColor = '#4a4a4e';
    ctx.fillStyle = buttonColor;
    // Mute switch
    roundRect(ctx, x - bezel - 2, y + 100, 3, 22, 1);
    ctx.fill();
    // Volume up
    roundRect(ctx, x - bezel - 2, y + 140, 3, 45, 1);
    ctx.fill();
    // Volume down
    roundRect(ctx, x - bezel - 2, y + 195, 3, 45, 1);
    ctx.fill();
    
    // Power button (right side)
    roundRect(ctx, x + w + bezel - 1, y + 150, 3, 65, 1);
    ctx.fill();
    
    ctx.restore();
  }

  function drawIPadFrame(ctx, x, y, w, h, img) {
    ctx.save();
    
    const bezel = 16;
    const frameRadius = 28;
    const screenRadius = 18;
    
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 45;
    ctx.shadowOffsetY = 18;
    
    // Aluminum body
    const bodyGradient = ctx.createLinearGradient(x - bezel, y, x + w + bezel, y);
    bodyGradient.addColorStop(0, '#707074');
    bodyGradient.addColorStop(0.1, '#a8a8ac');
    bodyGradient.addColorStop(0.5, '#c0c0c4');
    bodyGradient.addColorStop(0.9, '#a8a8ac');
    bodyGradient.addColorStop(1, '#707074');
    ctx.fillStyle = bodyGradient;
    roundRect(ctx, x - bezel, y - bezel, w + bezel * 2, h + bezel * 2, frameRadius);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    
    // Edge chamfer highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x - bezel + 1, y - bezel + 1, w + bezel * 2 - 2, h + bezel * 2 - 2, frameRadius - 1);
    ctx.stroke();
    
    // Inner screen bezel
    ctx.fillStyle = '#0a0a0a';
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, screenRadius);
    ctx.fill();
    
    // Screen with clipping
    ctx.save();
    roundRect(ctx, x, y, w, h, screenRadius - 2);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    
    // Front camera (centered at top)
    const camY = y - bezel/2 - 2;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x + w/2, camY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d4a5a';
    ctx.beginPath();
    ctx.arc(x + w/2, camY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Camera reflection
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x + w/2 - 0.5, camY - 0.5, 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    // Power button (top right)
    ctx.fillStyle = '#909094';
    roundRect(ctx, x + w - 50, y - bezel - 2, 40, 3, 1);
    ctx.fill();
    
    // Volume buttons (right side)
    roundRect(ctx, x + w + bezel - 1, y + 60, 3, 35, 1);
    ctx.fill();
    roundRect(ctx, x + w + bezel - 1, y + 105, 3, 35, 1);
    ctx.fill();
    
    ctx.restore();
  }

  function drawIMacFrame(ctx, x, y, w, h, img) {
    ctx.save();
    
    const bezel = 22;
    const chinHeight = 35;
    const standNeckHeight = 50;
    const standBaseWidth = 180;
    const standBaseHeight = 12;
    
    // Main shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 70;
    ctx.shadowOffsetY = 35;
    
    // Monitor body (aluminum)
    const bodyGradient = ctx.createLinearGradient(x - bezel, y, x + w + bezel, y);
    bodyGradient.addColorStop(0, '#808084');
    bodyGradient.addColorStop(0.1, '#a0a0a4');
    bodyGradient.addColorStop(0.5, '#b8b8bc');
    bodyGradient.addColorStop(0.9, '#a0a0a4');
    bodyGradient.addColorStop(1, '#808084');
    ctx.fillStyle = bodyGradient;
    roundRect(ctx, x - bezel, y - bezel, w + bezel * 2, h + bezel * 2, 16);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    
    // Edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, x - bezel + 1, y - bezel + 1, w + bezel * 2 - 2, h + bezel * 2 - 2, 15);
    ctx.stroke();
    
    // Inner screen bezel (black)
    ctx.fillStyle = '#0a0a0a';
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 8);
    ctx.fill();
    
    // Screen
    ctx.save();
    roundRect(ctx, x, y, w, h, 4);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    
    // Camera/notch area
    ctx.fillStyle = '#0a0a0a';
    roundRect(ctx, x + w/2 - 50, y - bezel + 2, 100, 20, 8);
    ctx.fill();
    
    // Camera lens
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x + w/2, y - bezel/2 + 3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d4a5a';
    ctx.beginPath();
    ctx.arc(x + w/2, y - bezel/2 + 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Chin (bottom part of monitor)
    const chinY = y + h + bezel;
    const chinGradient = ctx.createLinearGradient(x, chinY, x, chinY + chinHeight);
    chinGradient.addColorStop(0, '#a8a8ac');
    chinGradient.addColorStop(0.5, '#c8c8cc');
    chinGradient.addColorStop(1, '#909094');
    ctx.fillStyle = chinGradient;
    ctx.beginPath();
    ctx.moveTo(x - bezel, chinY);
    ctx.lineTo(x + w + bezel, chinY);
    ctx.lineTo(x + w + bezel, chinY + chinHeight - 8);
    ctx.quadraticCurveTo(x + w + bezel, chinY + chinHeight, x + w + bezel - 8, chinY + chinHeight);
    ctx.lineTo(x - bezel + 8, chinY + chinHeight);
    ctx.quadraticCurveTo(x - bezel, chinY + chinHeight, x - bezel, chinY + chinHeight - 8);
    ctx.closePath();
    ctx.fill();
    
    // Apple logo on chin
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('', x + w/2, chinY + chinHeight/2 + 6);
    
    // Stand neck
    const neckWidth = 80;
    const neckY = chinY + chinHeight;
    const neckGradient = ctx.createLinearGradient(x + w/2 - neckWidth/2, neckY, x + w/2 + neckWidth/2, neckY);
    neckGradient.addColorStop(0, '#909094');
    neckGradient.addColorStop(0.5, '#c0c0c4');
    neckGradient.addColorStop(1, '#909094');
    ctx.fillStyle = neckGradient;
    ctx.fillRect(x + w/2 - neckWidth/2, neckY, neckWidth, standNeckHeight);
    
    // Stand base
    const baseY = neckY + standNeckHeight;
    const baseGradient = ctx.createLinearGradient(x + w/2 - standBaseWidth/2, baseY, x + w/2 + standBaseWidth/2, baseY);
    baseGradient.addColorStop(0, '#808084');
    baseGradient.addColorStop(0.3, '#b0b0b4');
    baseGradient.addColorStop(0.7, '#b0b0b4');
    baseGradient.addColorStop(1, '#808084');
    ctx.fillStyle = baseGradient;
    ctx.beginPath();
    ctx.ellipse(x + w/2, baseY + standBaseHeight/2, standBaseWidth/2, standBaseHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  // Browser window frame for stacked pages
  function drawBrowserFrame(ctx, x, y, w, h, img) {
    ctx.save();
    
    const toolbarHeight = 36;
    
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    
    // Window background
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x - 2, y - toolbarHeight - 2, w + 4, h + toolbarHeight + 4, 10);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    
    // Toolbar
    ctx.fillStyle = '#f5f5f5';
    roundRect(ctx, x - 2, y - toolbarHeight - 2, w + 4, toolbarHeight, { tl: 10, tr: 10, bl: 0, br: 0 });
    ctx.fill();
    
    // Toolbar border
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 2);
    ctx.lineTo(x + w + 2, y - 2);
    ctx.stroke();
    
    // Traffic lights
    const dotY = y - toolbarHeight/2 - 1;
    const dotStartX = x + 14;
    // Close
    ctx.fillStyle = '#ff5f57';
    ctx.beginPath();
    ctx.arc(dotStartX, dotY, 6, 0, Math.PI * 2);
    ctx.fill();
    // Minimize
    ctx.fillStyle = '#febc2e';
    ctx.beginPath();
    ctx.arc(dotStartX + 20, dotY, 6, 0, Math.PI * 2);
    ctx.fill();
    // Maximize
    ctx.fillStyle = '#28c840';
    ctx.beginPath();
    ctx.arc(dotStartX + 40, dotY, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // URL bar
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x + 70, y - toolbarHeight + 8, w - 90, 20, 5);
    ctx.fill();
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 70, y - toolbarHeight + 8, w - 90, 20, 5);
    ctx.stroke();
    
    // Screen content
    ctx.drawImage(img, x, y, w, h);
    
    ctx.restore();
  }

});

// IndexedDB wrapper
const db = {
  dbName: 'DevShotDB',
  storeName: 'screenshots',
  version: 1,

  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('domain', 'domain', { unique: false });
          store.createIndex('device', 'device', { unique: false });
          store.createIndex('captureType', 'captureType', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  },

  async getAll() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  async add(screenshot) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.add(screenshot);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  async delete(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(id);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },

  async clear() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
};
