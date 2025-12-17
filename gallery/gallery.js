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
  showcaseBtn.addEventListener('click', () => createShowcase(null)); // Global create
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
      // Pass all domain screenshots as available options
      openShowcaseModal(domainScreenshots, true, 'default');
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

  // --- UTILITIES ---

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  
  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-US', { 
           month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  }

  function exportPdf() {
     alert('PDF Export coming in next update!');
  }

  function openPreview(screenshot) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    const isVideo = screenshot.captureType ==='video';
    overlay.innerHTML = `
      <div style="max-width:90vw;max-height:90vh;position:relative;">
        <button class="modal-close" style="position:absolute;top:-40px;right:0;color:white;background:none;border:none;font-size:2rem;cursor:pointer;">&times;</button>
        ${isVideo 
           ? `<video src="${screenshot.dataUrl}" controls autoplay style="max-width:100%;max-height:80vh;border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,0.5);"></video>`
           : `<img src="${screenshot.dataUrl}" style="max-width:100%;max-height:80vh;border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,0.5);">`
         }
      </div>
    `;
    overlay.onclick = (e) => { if(e.target === overlay || e.target.classList.contains('modal-close')) overlay.remove(); }
    document.body.appendChild(overlay);
  }

  // ==========================================
  // UNIFIED SHOWCASE & MOCKUP SYSTEM
  // ==========================================

  // Entry point for Global 'Create Showcase' button
  function createShowcase(passedScreenshots = null) {
    const selected = passedScreenshots || screenshots.filter(s => selectedIds.has(s.id));
    // If filtering from main list and nothing selected, warn user
    if (!passedScreenshots && selected.length === 0) {
      alert('Please select at least one screenshot.');
      return;
    }
    // If we passed specific screenshots (e.g. from domain group), use those.
    // If not, use selected. 
    // If passedScreenshots is present, we consider it "hasMoreAvailable" only if needed, 
    // but typically domain group passes ALL domain shots.
    openShowcaseModal(selected, !!passedScreenshots, 'default');
  }

  // Entry point for Single Mockup
  function openMockupModal(screenshot) {
    openShowcaseModal([screenshot], false, 'single');
  }

  // Alias for custom canvas
  function openCustomCanvasModal() {
    const selected = screenshots.filter(s => selectedIds.has(s.id));
    if (selected.length === 0) {
      alert('Select screenshots for custom canvas first.');
      return;
    }
    openShowcaseModal(selected, false, 'custom');
  }

  // Main Unified Showcase Modal
  function openShowcaseModal(initialScreenshots, hasMoreAvailable = false, initialMode = 'default') {
    // State
    const state = {
      assignments: {}, // { 0: screenshot, 1: screenshot }
      available: hasMoreAvailable ? initialScreenshots : [...initialScreenshots], 
      template: initialMode === 'single' ? 'single-device' : (initialMode === 'custom' ? 'custom' : '3-device'),
      background: { type: 'gradient', value: ['#1a1a2e', '#0f3460'] },
      zoom: 0.8, // Start zoomed out slightly to see whole canvas
      customItems: [],
      selectedItem: null
    };

    // Auto-assign first few screenshots
    if (initialMode === 'single' && initialScreenshots[0]) {
      state.assignments[0] = initialScreenshots[0];
    } else if (initialMode !== 'custom') {
      initialScreenshots.slice(0, 4).forEach((s, i) => {
        state.assignments[i] = s;
      });
    }

    // Initialize Custom Items in custom mode
    if (initialMode === 'custom') {
      state.customItems = initialScreenshots.map((s, i) => ({
        id: Date.now() + i,
        img: s, // storing ref
        x: 400 + (i * 100),
        y: 400 + (i * 50),
        w: 600,
        deviceId: 'macbook-pro-16'
      }));
    }

    // Constants
    const TEMPLATES = [
      { id: 'single-device', name: 'Single Device', icon: '📱', slots: [{ id: 0, defaultDevice: 'iphone-15-pro', label: 'Device' }] },
      { id: '3-device', name: 'Tri-Device', icon: '💻📱', slots: [
        { id: 0, defaultDevice: 'macbook-pro-16', label: 'Center (Desktop)' }, 
        { id: 1, defaultDevice: 'ipad-pro-11', label: 'Left (Tablet)' }, 
        { id: 2, defaultDevice: 'iphone-15-pro', label: 'Right (Phone)' }
      ]},
      { id: 'side-by-side', name: 'Side by Side', icon: '⏸', slots: [
        { id: 0, defaultDevice: 'browser-arc', label: 'Left' },
        { id: 1, defaultDevice: 'browser-arc', label: 'Right' }
      ]},
      { id: 'comparison', name: 'Comparison', icon: 'VS', slots: [
        { id: 0, defaultDevice: 'macbook-pro-14', label: 'Before/Left' },
        { id: 1, defaultDevice: 'macbook-pro-14', label: 'After/Right' }
      ]},
      { id: 'grid-4', name: 'Grid 2x2', icon: '田', slots: [0,1,2,3].map(i => ({ id: i, defaultDevice: 'browser-light', label: `Screen ${i+1}` })) },
      { id: 'custom', name: 'Custom Canvas', icon: '🎨', slots: [] }
    ];

    const DEVICE_TYPES = [
      { id: 'none', name: 'No Frame', icon: '🖼️' },
      { type: 'header', name: 'Phones' },
      { id: 'iphone-15-pro', name: 'iPhone 15 Pro', icon: '📱' },
      { id: 'iphone-14', name: 'iPhone 14', icon: '📱' },
      { id: 'pixel-8', name: 'Pixel 8', icon: '📱' },
      { id: 'samsung-s24', name: 'Samsung S24', icon: '📱' },
      { type: 'header', name: 'Tablets' },
      { id: 'ipad-pro-12', name: 'iPad Pro 12.9"', icon: '📲' },
      { id: 'ipad-air', name: 'iPad Air', icon: '📲' },
      { id: 'surface-pro', name: 'Surface Pro', icon: '📲' },
      { type: 'header', name: 'Desktops' },
      { id: 'macbook-pro-16', name: 'MacBook Pro 16"', icon: '💻' },
      { id: 'macbook-air', name: 'MacBook Air', icon: '💻' },
      { id: 'imac-24', name: 'iMac 24"', icon: '🖥️' },
      { type: 'header', name: 'Browsers' },
      { id: 'browser-arc', name: 'Arc Browser', icon: '🌐' },
      { id: 'browser-chrome', name: 'Chrome', icon: '🌐' },
      { id: 'browser-light', name: 'Browser (Light)', icon: '🌐' }
    ];

    // Slot Configuration
    const slotConfig = {};
    TEMPLATES.forEach(t => {
      t.slots.forEach(s => {
        if (!slotConfig[s.id]) slotConfig[s.id] = s.defaultDevice;
      });
    });

    // Modal UI
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    
    overlay.innerHTML = `
      <div class="showcase-ui" style="width:100%;height:100%;max-width:1600px;max-height:1000px;background:#0f0f12;border-radius:16px;box-shadow:0 25px 50px rgba(0,0,0,0.5);display:flex;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
        <!-- LEFT: Templates -->
        <div class="ui-sidebar left" style="width:260px;background:#1a1a20;border-right:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;">
          <div style="padding:20px;border-bottom:1px solid rgba(255,255,255,0.05);">
            <h2 style="margin:0;font-size:1.1rem;color:white;display:flex;align-items:center;gap:10px;">
              <span style="background:linear-gradient(135deg,#6366f1,#8b5cf6);width:10px;height:10px;border-radius:50%;display:block;"></span>
              Showcase
            </h2>
          </div>
          <div class="template-list" style="flex:1;overflow-y:auto;padding:12px;">
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);font-weight:600;margin-bottom:8px;padding-left:8px;">TEMPLATES</div>
            ${TEMPLATES.map(t => `
              <button class="tpl-btn ${state.template === t.id ? 'active' : ''}" data-id="${t.id}" style="width:100%;text-align:left;padding:12px;background:transparent;border:none;border-radius:8px;color:rgba(255,255,255,0.7);cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.2s;">
                <span style="font-size:1.2rem;">${t.icon}</span>
                <span style="font-size:0.9rem;">${t.name}</span>
              </button>
            `).join('')}
          </div>
          <div style="padding:20px;border-top:1px solid rgba(255,255,255,0.05);">
             <button id="close-modal" style="width:100%;padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;cursor:pointer;">Cancel</button>
          </div>
        </div>

        <!-- CENTER: Canvas -->
        <div class="ui-canvas-area" style="flex:1;background:#050505;position:relative;display:flex;flex-direction:column;overflow:hidden;">
          <div class="canvas-toolbar" style="padding:16px;display:flex;justify-content:space-between;align-items:center;position:absolute;top:0;left:0;right:0;z-index:10;">
            <div class="zoom-controls" style="display:flex;gap:4px;background:rgba(30,30,35,0.8);backdrop-filter:blur(4px);padding:4px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
              <button id="zoom-out" style="width:32px;height:32px;background:transparent;border:none;color:white;cursor:pointer;font-size:1.2rem;">-</button>
              <span id="zoom-level" style="line-height:32px;font-size:0.8rem;color:rgba(255,255,255,0.7);min-width:40px;text-align:center;">80%</span>
              <button id="zoom-in" style="width:32px;height:32px;background:transparent;border:none;color:white;cursor:pointer;font-size:1.2rem;">+</button>
            </div>
            <button id="download-btn" style="padding:10px 24px;background:#6366f1;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(99,102,241,0.4);display:flex;align-items:center;gap:8px;">
              <span>💾</span> Save Image
            </button>
          </div>
          
          <div class="canvas-scroller" style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:0;">
            <canvas id="main-canvas" style="box-shadow:0 0 100px rgba(0,0,0,0.8);border-radius:4px; margin:auto;"></canvas>
          </div>
          
          <div id="custom-hint" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.5);font-size:0.85rem;background:rgba(0,0,0,0.5);padding:6px 16px;border-radius:20px;display:none;">
            Drag to move • Drag corners to resize
          </div>
        </div>

        <!-- RIGHT: Settings -->
        <div class="ui-sidebar right" style="width:320px;background:#1a1a20;border-left:1px solid rgba(255,255,255,0.05);overflow-y:auto;display:flex;flex-direction:column;">
          
          <!-- Background Section -->
          <div style="padding:24px;border-bottom:1px solid rgba(255,255,255,0.05);">
            <h3 style="margin:0 0 16px 0;font-size:0.85rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;">Background</h3>
            <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:8px;">
               ${getBackgroundOptions().map(bg => `
                 <button class="bg-option" data-type="${bg.type}" data-val="${bg.value}" title="${bg.name}"
                   style="width:100%;aspect-ratio:1;border-radius:8px;border:2px solid transparent;cursor:pointer;background:${bg.css};position:relative;overflow:hiddenbox-shadow:0 2px 4px rgba(0,0,0,0.2);"></button>
               `).join('')}
               <input type="color" id="custom-color-picker" style="width:100%;height:100%;padding:0;border:none;border-radius:8px;cursor:pointer;">
            </div>
          </div>

          <!-- Slots Section -->
          <div class="slots-container" style="padding:24px;flex:1;">
            <h3 style="margin:0 0 16px 0;font-size:0.85rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;">Configuration</h3>
            <div id="slots-list" style="display:flex;flex-direction:column;gap:20px;">
              <!-- Dynamic Slots will go here -->
            </div>
          </div>

        </div>
      </div>
    `;

    // Helpers
    function getBackgroundOptions() {
      return [
        { name: 'Midnight', type: 'gradient', value: ['#1a1a2e', '#0f3460'], css: 'linear-gradient(135deg, #1a1a2e, #0f3460)' },
        { name: 'Purple', type: 'gradient', value: ['#667eea', '#764ba2'], css: 'linear-gradient(135deg, #667eea, #764ba2)' },
        { name: 'Sunset', type: 'gradient', value: ['#fc4a1a', '#f7b733'], css: 'linear-gradient(135deg, #fc4a1a, #f7b733)' },
        { name: 'Forest', type: 'gradient', value: ['#11998e', '#38ef7d'], css: 'linear-gradient(135deg, #11998e, #38ef7d)' },
        { name: 'Dark', type: 'solid', value: '#1a1a1a', css: '#1a1a1a' },
        { name: 'Light', type: 'solid', value: '#f5f5f5', css: '#f5f5f5' },
        { name: 'Transparent', type: 'solid', value: 'transparent', css: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%) #fff' }
      ];
    }

    // --- LOGIC ---
    const canvas = overlay.querySelector('#main-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1920;
    canvas.height = 1080;

    // Render Slots UI
    function renderSlotsUI() {
      const list = overlay.querySelector('#slots-list');
      const currentTpl = TEMPLATES.find(t => t.id === state.template);
      
      // Custom mode has specific UI
      if (state.template === 'custom') {
        list.innerHTML = `
          <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:16px;text-align:center;">
            <p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Custom Mode</p>
            <button id="add-item-btn" style="background:#6366f1;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;margin-top:8px;">+ Add Random Screenshot</button>
          </div>
          ${state.selectedItem ? `
            <div style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;">
              <label style="display:block;color:rgba(255,255,255,0.6);font-size:0.75rem;margin-bottom:8px;">SELECTED ITEM DEVICE</label>
              ${renderDeviceSelector(state.selectedItem.deviceId, 'custom-device')}
               <button id="delete-item-btn" style="width:100%;margin-top:10px;background:#ef4444;color:white;border:none;padding:8px;border-radius:6px;cursor:pointer;">Remove Item</button>
            </div>
          ` : ''}
        `;
        
        // Custom events
        const addBtn = list.querySelector('#add-item-btn');
        if(addBtn) addBtn.onclick = () => {
           if(state.available.length > 0) {
             const randomS = state.available[Math.floor(Math.random() * state.available.length)];
             state.customItems.push({
                id: Date.now(),
                img: randomS,
                x: 960, y: 540, w: 600,
                deviceId: randomS.device === 'mobile' ? 'iphone-15-pro' : 'macbook-pro-16'
             });
             render();
           }
        };
        
        const devSel = list.querySelector('#custom-device');
        if(devSel) devSel.onchange = (e) => {
           if(state.selectedItem) {
             state.selectedItem.deviceId = e.target.value;
             render();
           }
        };

        const delBtn = list.querySelector('#delete-item-btn');
        if(delBtn) delBtn.onclick = () => {
          if(state.selectedItem) {
            state.customItems = state.customItems.filter(i => i !== state.selectedItem);
            state.selectedItem = null;
            renderSlotsUI();
            render();
          }
        };

        return;
      }

      list.innerHTML = currentTpl.slots.map(slot => {
        const assigned = state.assignments[slot.id];
        const currentDeviceId = slotConfig[slot.id] || slot.defaultDevice;
        
        return `
          <div class="slot-item" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:16px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span style="font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;">${slot.label}</span>
              <span style="font-size:1.2rem;">${DEVICE_TYPES.find(d => d.id === currentDeviceId)?.icon || '📱'}</span>
            </div>
            
            <!-- Screenshot Selector -->
            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:0.7rem;color:rgba(255,255,255,0.4);margin-bottom:4px;">Content</label>
              <select class="sc-select" data-slot="${slot.id}" style="width:100%;max-width:100%;background:#111;border:1px solid rgba(255,255,255,0.1);color:white;padding:8px;border-radius:6px;font-size:0.85rem;text-overflow:ellipsis;">
                <option value="">(Empty)</option>
                ${state.available.map(s => `
                  <option value="${s.id}" ${assigned && assigned.id === s.id ? 'selected' : ''}>
                    ${s.domain} - ${formatDate(s.timestamp)}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Device Selector -->
            <div>
              <label style="display:block;font-size:0.7rem;color:rgba(255,255,255,0.4);margin-bottom:4px;">Device Frame</label>
              ${renderDeviceSelector(currentDeviceId, `device-slot-${slot.id}`, slot.id)}
            </div>
          </div>
        `;
      }).join('');

      // Attach Listeners
      list.querySelectorAll('.sc-select').forEach(sel => {
        sel.onchange = (e) => {
          const slotId = parseInt(e.target.dataset.slot);
          const sId = parseInt(e.target.value);
          const s = state.available.find(x => x.id === sId);
          if (s) {
            state.assignments[slotId] = s;
          } else {
            delete state.assignments[slotId];
          }
          render();
        };
      });

      list.querySelectorAll('select[id^="device-slot"]').forEach(sel => {
        sel.onchange = (e) => {
          const slotId = parseInt(e.target.dataset.slot);
          slotConfig[slotId] = e.target.value;
          render();
          renderSlotsUI(); // Re-render to update icon
        };
      });
    }

    function renderDeviceSelector(currentValue, id, dataSlot = '') {
      return `
        <select id="${id}" ${dataSlot !== '' ? `data-slot="${dataSlot}"` : ''} style="width:100%;background:#111;border:1px solid rgba(255,255,255,0.1);color:white;padding:8px;border-radius:6px;font-size:0.85rem;">
          ${DEVICE_TYPES.map(d => {
            if (d.type === 'header') return `<optgroup label="${d.name}"></optgroup>`;
            return `<option value="${d.id}" ${d.id === currentValue ? 'selected' : ''}>${d.icon} ${d.name}</option>`;
          }).join('')}
        </select>
      `;
    }

    // DRAWING LOGIC
    async function render() {
      // Background
      if (state.background.type === 'gradient') {
        const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grd.addColorStop(0, state.background.value[0]);
        grd.addColorStop(1, state.background.value[1]);
        ctx.fillStyle = grd;
      } else {
        ctx.fillStyle = state.background.value;
      }
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const loadImg = (s) => new Promise(r => {
        if (!s) return r(null);
        let i = new Image();
        i.onload = () => r(i);
        i.onerror = () => r(null);
        i.src = s.dataUrl;
      });

      // Custom Mode
      if (state.template === 'custom') {
        overlay.querySelector('#custom-hint').style.display = 'block';
        for (let item of state.customItems) {
           const img = await loadImg(item.img);
           if(img) {
             drawDevice(ctx, item.deviceId, img, item.x, item.y, item.w);
             if(state.selectedItem === item) {
               ctx.strokeStyle = '#6366f1';
               ctx.lineWidth = 4;
               ctx.strokeRect(item.x - item.w/2 - 10, item.y - (item.deviceId.includes('phone')? item.w*2 : item.w*0.65)/2 - 10, item.w+20, (item.deviceId.includes('phone')? item.w*2 : item.w*0.65)+20); // Rough box
             }
           }
        }
        return;
      }
      overlay.querySelector('#custom-hint').style.display = 'none';

      // Templates
      const t = TEMPLATES.find(x => x.id === state.template);
      
      // Load all assigned images
      const loaded = {}; // slotId -> img
      for (let s of t.slots) {
         if (state.assignments[s.id]) {
           loaded[s.id] = await loadImg(state.assignments[s.id]);
         }
      }

      if (state.template === 'single-device') {
        if(loaded[0]) drawDevice(ctx, slotConfig[0], loaded[0], 960, 540, 900);
      }
      else if (state.template === '3-device') {
        // Desktop Center, Tablet Left, Phone Right
        if(loaded[0]) drawDevice(ctx, slotConfig[0], loaded[0], 960, 500, 1000);
        if(loaded[1]) drawDevice(ctx, slotConfig[1], loaded[1], 350, 650, 450);
        if(loaded[2]) drawDevice(ctx, slotConfig[2], loaded[2], 1600, 680, 240);
      }
      else if (state.template === 'side-by-side') {
        if(loaded[0]) drawDevice(ctx, slotConfig[0], loaded[0], 500, 540, 800);
        if(loaded[1]) drawDevice(ctx, slotConfig[1], loaded[1], 1420, 540, 800);
      }
      else if (state.template === 'comparison') {
        if(loaded[0]) drawDevice(ctx, slotConfig[0], loaded[0], 540, 540, 900);
        if(loaded[1]) drawDevice(ctx, slotConfig[1], loaded[1], 1380, 540, 900);
      }
      else if (state.template === 'grid-4') {
        if(loaded[0]) drawDevice(ctx, slotConfig[0], loaded[0], 480, 270, 800);
        if(loaded[1]) drawDevice(ctx, slotConfig[1], loaded[1], 1440, 270, 800);
        if(loaded[2]) drawDevice(ctx, slotConfig[2], loaded[2], 480, 810, 800);
        if(loaded[3]) drawDevice(ctx, slotConfig[3], loaded[3], 1440, 810, 800); // 4th
      }
    }

    // --- Events ---
    overlay.querySelector('#close-modal').onclick = () => overlay.remove();
    
    // Template Switch
    overlay.querySelectorAll('.tpl-btn').forEach(btn => {
      btn.onclick = () => {
        state.template = btn.dataset.id;
        state.selectedItem = null;
        overlay.querySelectorAll('.tpl-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderSlotsUI();
        render();
      };
    });

    // Background Switch
    overlay.querySelectorAll('.bg-option').forEach(btn => {
      btn.onclick = () => {
        state.background = { type: btn.dataset.type, value: btn.dataset.val.includes(',') ? btn.dataset.val.split(',') : btn.dataset.val };
        overlay.querySelectorAll('.bg-option').forEach(b => b.style.borderColor = 'transparent');
        btn.style.borderColor = 'white';
        render();
      };
    });
    
    // Custom Color
    overlay.querySelector('#custom-color-picker').oninput = (e) => {
        state.background = { type: 'solid', value: e.target.value };
        render();
    };

    // Zoom
    const zoomEl = overlay.querySelector('#zoom-level');
    overlay.querySelector('#zoom-in').onclick = () => {
       state.zoom = Math.min(state.zoom + 0.1, 2);
       updateZoom();
    };
    overlay.querySelector('#zoom-out').onclick = () => {
       state.zoom = Math.max(state.zoom - 0.1, 0.5);
       updateZoom();
    };
    function updateZoom() {
      canvas.style.transform = `scale(${state.zoom})`;
      zoomEl.textContent = Math.round(state.zoom * 100) + '%';
    }
    updateZoom(); // Init

    // Download
    overlay.querySelector('#download-btn').onclick = () => {
      const link = document.createElement('a');
      link.download = `Showcase_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    // Custom Mode Canvas Interactions
    let isDragging = false;
    let isResizing = false;
    let startX = 0, startY = 0;

    canvas.onmousedown = (e) => {
      if(state.template !== 'custom') return;
      const rect = canvas.getBoundingClientRect();
      // Calculate scale factor because CSS size != intrinsic size (1920x1080)
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      // Check interactions
      for (let i = state.customItems.length -1; i >= 0; i--) {
        const item = state.customItems[i];
        const half = item.w / 2;
        // Simple hit box
        if (x >= item.x - half && x <= item.x + half && y >= item.y - half && y <= item.y + half) {
          state.selectedItem = item;
          isDragging = true;
          startX = x; startY = y;
          renderSlotsUI();
          render();
          return;
        }
      }
      if(state.selectedItem) {
        state.selectedItem = null;
        renderSlotsUI();
        render();
      }
    };
    
    canvas.onmousemove = (e) => {
      if(state.template !== 'custom') return;
      if(isDragging && state.selectedItem) {
         const rect = canvas.getBoundingClientRect();
         const scaleX = canvas.width / rect.width;
         const scaleY = canvas.height / rect.height;
         const x = (e.clientX - rect.left) * scaleX;
         const y = (e.clientY - rect.top) * scaleY;
         
         state.selectedItem.x += (x - startX);
         state.selectedItem.y += (y - startY);
         startX = x; startY = y;
         
         render();
      }
    };
    
    canvas.onmouseup = () => isDragging = false;
    canvas.onmouseleave = () => isDragging = false;

    document.body.appendChild(overlay);
    
    // Initial Render
    renderSlotsUI();
    render();
  }

  // --- Device Rendering Logic (Reused & Simplified) ---
  function drawDevice(ctx, deviceId, img, cx, cy, width) {
     const isPhone = deviceId.includes('phone') || deviceId.includes('pixel') || deviceId.includes('samsung');
     const isLaptop = deviceId.includes('macbook') || deviceId.includes('laptop');
     
     // Calculate Height
     const aspectRatio = img.height / img.width;
     let h = width * aspectRatio;
     
     // --- No Frame ---
     if (deviceId === 'none') {
        ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
        ctx.drawImage(img, cx - width/2, cy - h/2, width, h);
        ctx.shadowColor = 'transparent';
        return;
     }

     // --- Laptop ---
     if (isLaptop) {
        // Force laptop aspect roughly (e.g. 16:10 + bezel)
        h = width * 0.65; 
        const bezel = 15;
        // Lid
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
        ctx.fillStyle = '#1c1c1e';
        roundRect(ctx, cx - width/2, cy - h/2, width, h, 12);
        ctx.fill(); ctx.shadowColor = 'transparent';
        // Screen
        ctx.drawImage(img, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2 - 10);
        // Base
        ctx.fillStyle = '#2c2c2e';
        ctx.beginPath();
        ctx.moveTo(cx - width/2 + 20, cy + h/2);
        ctx.lineTo(cx + width/2 - 20, cy + h/2);
        ctx.lineTo(cx + width/2 + 30, cy + h/2 + 15);
        ctx.lineTo(cx - width/2 - 30, cy + h/2 + 15);
        ctx.fill();
     }
     // --- Phone / Tablet ---
     else if (isPhone) {
        h = width * 2.16; // 19.5:9 aspect approx
        const radius = 40;
        const bezel = 12;
        
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
        ctx.fillStyle = '#1c1c1e';
        roundRect(ctx, cx - width/2, cy - h/2, width, h, radius);
        ctx.fill(); ctx.shadowColor = 'transparent';
        
        ctx.save();
        roundRect(ctx, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2, radius - 5);
        ctx.clip();
        ctx.drawImage(img, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2);
        ctx.restore();
        
        // Dynamic Island
        ctx.fillStyle = 'black';
        roundRect(ctx, cx - 40, cy - h/2 + 10, 80, 24, 12);
        ctx.fill();
     }
     else { // Tablet or other
        // Tablet usually 4:3
        h = width * 1.33; 
        const radius = 20;
        const bezel = 18;
         
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
        ctx.fillStyle = '#1c1c1e';
        roundRect(ctx, cx - width/2, cy - h/2, width, h, radius);
        ctx.fill(); ctx.shadowColor = 'transparent';
         
        ctx.save();
        roundRect(ctx, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2, radius - 5);
        ctx.clip();
        ctx.drawImage(img, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2);
        ctx.restore();
     }
  }

  function roundRect(ctx, x, y, width, height, radius) {
    if (typeof radius === 'undefined') radius = 0;
    if (typeof radius === 'number') {
      radius = {tl: radius, tr: radius, br: radius, bl: radius};
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
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

        if (i < urls.length - 1) {
          await sleep(1500);
        }
      }

      progressText.textContent = `Complete! ${successCount} succeeded, ${errorCount} failed`;
      addLogEntry(`Batch capture complete. Success: ${successCount}, Failed: ${errorCount}`);
      
      startBtn.textContent = '✓ Done';
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Close';
      
      await loadScreenshots();
    });

    document.body.appendChild(overlay);
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