document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const galleryContainer = document.querySelector('.gallery-container');
  const emptyState = document.getElementById('empty-state');
  const selectionBar = document.getElementById('selection-bar');
  const selectionCount = selectionBar.querySelector('.selection-count');
  const clearSelectionBtn = document.getElementById('btn-clear-selection');
  
  const deleteSelectedBtn = document.getElementById('btn-delete-selected');
  const downloadSelectedBtn = document.getElementById('btn-download-selected');
  const batchCaptureBtn = document.getElementById('btn-batch-capture');
  const showcaseBtn = document.getElementById('btn-create-showcase');
  const exportPdfBtn = document.getElementById('btn-export-pdf');
  const clearAllBtn = document.getElementById('btn-clear-all');
  const refreshBtn = document.getElementById('btn-refresh');
  
  const filterDomain = document.getElementById('filter-domain');
  const navTabs = document.querySelectorAll('.nav-tab');
  const searchInput = document.getElementById('gallery-search');
  const sortSelect = document.getElementById('sort-order');
  const gridViewBtn = document.getElementById('view-grid');
  const listViewBtn = document.getElementById('view-list');

  // State
  let screenshots = [];
  let selectedIds = new Set();
  let lastSelectedId = null; 
  let currentSort = 'date-desc';
  let searchQuery = '';
  let activeFilter = ''; // From nav tabs
  let viewMode = 'grid';
  let collapsedDomains = new Set();

  // Initialize
  loadScreenshots();

  // Event listeners
  refreshBtn.addEventListener('click', loadScreenshots);
  clearAllBtn.addEventListener('click', clearAll);
  clearSelectionBtn.addEventListener('click', () => {
    selectedIds.clear();
    updateSelectionState();
    renderGallery();
  });
  
  window.addEventListener('focus', loadScreenshots);
  deleteSelectedBtn.addEventListener('click', deleteSelected);
  downloadSelectedBtn.addEventListener('click', downloadSelected);
  batchCaptureBtn.addEventListener('click', openBatchCaptureModal);
  showcaseBtn.addEventListener('click', () => createShowcase(null));
  exportPdfBtn.addEventListener('click', exportPdf);
  
  filterDomain.addEventListener('change', renderGallery);
  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderGallery();
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderGallery();
  });

  // Nav Tabs Filter
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      renderGallery();
    });
  });

  gridViewBtn.addEventListener('click', () => {
    viewMode = 'grid';
    gridViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
    galleryContainer.classList.remove('list-view');
    renderGallery();
  });

  listViewBtn.addEventListener('click', () => {
    viewMode = 'list';
    listViewBtn.classList.add('active');
    gridViewBtn.classList.remove('active');
    galleryContainer.classList.add('list-view');
    renderGallery();
  });

  document.getElementById('btn-expand-all').addEventListener('click', () => {
    collapsedDomains.clear();
    renderGallery();
  });

  document.getElementById('btn-collapse-all').addEventListener('click', () => {
    const domains = new Set(screenshots.map(s => s.domain));
    domains.forEach(d => collapsedDomains.add(d));
    renderGallery();
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      selectedIds.clear();
      updateSelectionState();
      renderGallery();
    }
  });

  // Load screenshots from IndexedDB
  async function loadScreenshots() {
    try {
      if (!db) throw new Error('Database not initialized');
      screenshots = await db.getAll() || [];
      updateDomainFilter();
      renderGallery();
    } catch (error) {
      console.error('Failed to load screenshots:', error);
    }
  }

  function updateDomainFilter() {
    const domains = [...new Set(screenshots.map(s => s.domain))].sort();
    const currentVal = filterDomain.value;
    filterDomain.innerHTML = '<option value="">All Domains</option>';
    domains.forEach(domain => {
      const option = document.createElement('option');
      option.value = domain;
      option.textContent = domain;
      filterDomain.appendChild(option);
    });
    filterDomain.value = currentVal;
  }

  function renderGallery() {
    // Clear existing
    const existingGroups = galleryContainer.querySelectorAll('.domain-group');
    existingGroups.forEach(g => g.remove());

    // Apply filters
    let filtered = [...screenshots];
    
    if (searchQuery) {
      filtered = filtered.filter(s => 
        s.domain.toLowerCase().includes(searchQuery) || 
        s.filename.toLowerCase().includes(searchQuery)
      );
    }

    if (activeFilter) {
      if (activeFilter === 'video') {
        filtered = filtered.filter(s => s.captureType === 'video' || s.filename?.endsWith('.webm'));
      } else {
        filtered = filtered.filter(s => s.captureType === activeFilter);
      }
    }

    if (filterDomain.value) {
      filtered = filtered.filter(s => s.domain === filterDomain.value);
    }

    // Sort
    filtered.sort((a, b) => {
      if (currentSort === 'date-desc') return b.timestamp - a.timestamp;
      if (currentSort === 'date-asc') return a.timestamp - b.timestamp;
      if (currentSort === 'name-asc') return a.filename.localeCompare(b.filename);
      return 0;
    });

    emptyState.style.display = filtered.length === 0 ? 'flex' : 'none';
    if (filtered.length === 0) return;

    // Group by domain
    const grouped = filtered.reduce((acc, s) => {
      if (!acc[s.domain]) acc[s.domain] = [];
      acc[s.domain].push(s);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([domain, shots]) => {
      const group = createDomainGroup(domain, shots);
      galleryContainer.appendChild(group);
    });

    updateSelectionState();
    updateStats();
  }

  function updateStats() {
    const statsEl = document.getElementById('gallery-stats');
    if (statsEl) {
      const domains = new Set(screenshots.map(s => s.domain)).size;
      statsEl.textContent = `${screenshots.length} assets • ${domains} domains`;
    }
  }

  function updateSelectionState() {
    const count = selectedIds.size;
    if (count > 0) {
      selectionBar.classList.add('active');
      selectionCount.textContent = `${count} items selected`;
      showcaseBtn.disabled = count < 2; // Allow showcase with 2+ items
    } else {
      selectionBar.classList.remove('active');
    }
  }

  function createDomainGroup(domain, domainScreenshots) {
    const group = document.createElement('div');
    group.className = 'domain-group';
    const allSelected = domainScreenshots.every(s => selectedIds.has(s.id));
    
    group.innerHTML = `
      <div class="domain-header">
        <div class="domain-info">
          <input type="checkbox" class="group-checkbox" ${allSelected ? 'checked' : ''} title="Select all in group">
          <span class="domain-icon">🏠</span>
          <span class="domain-name">${domain}</span>
          <span class="domain-count">${domainScreenshots.length}</span>
        </div>
        <div class="domain-actions">
          <button class="btn btn-secondary btn-ghost domain-copy-urls-btn" title="Copy URLs">🔗</button>
          <button class="btn btn-secondary btn-ghost domain-download-zip-btn" title="Download ZIP">📦</button>
          <button class="btn btn-secondary btn-ghost domain-showcase-btn" title="Create Showcase">🖼️</button>
        </div>
      </div>
      <div class="screenshot-grid ${viewMode === 'list' ? 'list-view' : ''}"></div>
    `;

    const header = group.querySelector('.domain-header');
    const grid = group.querySelector('.screenshot-grid');
    const groupCheckbox = group.querySelector('.group-checkbox');
    const showcaseBtn = header.querySelector('.domain-showcase-btn');
    const zipBtn = header.querySelector('.domain-download-zip-btn');
    const copyUrlsBtn = header.querySelector('.domain-copy-urls-btn');

    groupCheckbox.addEventListener('click', (e) => {
      e.stopPropagation();
      const checked = groupCheckbox.checked;
      domainScreenshots.forEach(s => toggleSelect(s.id, checked));
    });

    copyUrlsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const urls = domainScreenshots.map(s => s.url).filter(u => u && u !== 'Showcase').join('\n');
      if (urls) {
        navigator.clipboard.writeText(urls);
        copyUrlsBtn.innerHTML = '✅';
        setTimeout(() => copyUrlsBtn.innerHTML = '🔗', 2000);
      }
    });

    zipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentSelectionInGroup = domainScreenshots.filter(s => selectedIds.has(s.id));
      const targets = currentSelectionInGroup.length > 0 ? currentSelectionInGroup : domainScreenshots;
      downloadDomainAsZip(domain, targets, zipBtn);
    });

    showcaseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentSelectionInGroup = domainScreenshots.filter(s => selectedIds.has(s.id));
      const targets = currentSelectionInGroup.length > 0 ? currentSelectionInGroup : domainScreenshots;
      openShowcaseModal(targets, true, 'default');
    });

    const isCollapsed = collapsedDomains.has(domain);
    if (isCollapsed) {
      header.classList.add('collapsed');
      grid.style.display = 'none';
    }

    header.addEventListener('click', (e) => {
      if (e.target.closest('.domain-actions') || e.target.classList.contains('group-checkbox')) return;
      
      const becomingCollapsed = !header.classList.contains('collapsed');
      header.classList.toggle('collapsed');
      grid.style.display = header.classList.contains('collapsed') ? 'none' : (viewMode === 'grid' ? 'grid' : 'flex');
      
      if (becomingCollapsed) collapsedDomains.add(domain);
      else collapsedDomains.delete(domain);
    });

    domainScreenshots.forEach(s => grid.appendChild(createScreenshotCard(s)));
    return group;
  }

  function createScreenshotCard(screenshot) {
    const card = document.createElement('div');
    card.className = 'screenshot-card';
    card.dataset.id = screenshot.id;
    const isSelected = selectedIds.has(screenshot.id);
    if (isSelected) card.classList.add('selected');
    
    const isVideo = screenshot.captureType === 'video' || screenshot.filename?.endsWith('.webm');
    
    card.innerHTML = `
      <div class="card-selection-overlay">
        <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''}>
      </div>
      <div class="screenshot-preview">
        ${isVideo ? `
          <video class="card-image card-video" src="${screenshot.dataUrl}" muted loop></video>
        ` : `
          <img class="card-image" src="${screenshot.dataUrl}" alt="${screenshot.filename}" loading="lazy">
        `}
        <div class="screenshot-overlay">
          <button class="btn btn-icon btn-view" title="View Full">👁️</button>
          <button class="btn btn-icon btn-copy" title="Copy to Clipboard">📋</button>
          <button class="btn btn-icon btn-mockup" title="Device Mockup">📱</button>
          <button class="btn btn-icon btn-download" title="Download">📥</button>
          <button class="btn btn-icon btn-delete" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="card-info">
        <div class="card-title-row">
          <div class="card-filename" title="Click to rename">${screenshot.filename}</div>
          <button class="btn btn-icon btn-rename" title="Rename" style="padding:2px; font-size:10px;">✏️</button>
        </div>
        <div class="card-meta">
          <span class="card-badge ${screenshot.device}">${screenshot.device}</span>
          <span class="card-badge ${screenshot.captureType}">${screenshot.captureType}</span>
        </div>
        <div class="card-date">${formatDate(screenshot.timestamp)}</div>
      </div>
    `;

    const checkbox = card.querySelector('.card-checkbox');
    const viewBtn = card.querySelector('.btn-view');
    const copyBtn = card.querySelector('.btn-copy');
    const mockupBtn = card.querySelector('.btn-mockup');
    const downloadBtn = card.querySelector('.btn-download');
    const deleteBtn = card.querySelector('.btn-delete');
    const renameBtn = card.querySelector('.btn-rename');

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-icon') || e.target.closest('.btn-rename')) return;
      
      const isCurrentlySelected = selectedIds.has(screenshot.id);
      if (e.shiftKey && lastSelectedId !== null) {
        const allFilteredIds = Array.from(document.querySelectorAll('.screenshot-card')).map(c => parseInt(c.dataset.id));
        const startIdx = allFilteredIds.indexOf(lastSelectedId);
        const endIdx = allFilteredIds.indexOf(screenshot.id);
        if (startIdx !== -1 && endIdx !== -1) {
          const range = allFilteredIds.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
          const shouldSelect = !isCurrentlySelected;
          range.forEach(id => toggleSelect(id, shouldSelect));
          lastSelectedId = screenshot.id;
          return;
        }
      }

      toggleSelect(screenshot.id, !isCurrentlySelected);
      lastSelectedId = screenshot.id;
    });

    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSelect(screenshot.id, checkbox.checked);
      lastSelectedId = screenshot.id;
    });

    viewBtn.onclick = (e) => { e.stopPropagation(); openPreview(screenshot); };
    
    copyBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const response = await fetch(screenshot.dataUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        copyBtn.innerHTML = '✅'; setTimeout(() => copyBtn.innerHTML = '📋', 2000);
      } catch (err) { console.error('Copy failed:', err); }
    };

    const renameAction = async (e) => {
      e?.stopPropagation();
      const newName = prompt('Enter new filename:', screenshot.filename);
      if (newName && newName !== screenshot.filename) {
        screenshot.filename = newName;
        await db.update(screenshot);
        renderGallery();
      }
    };
    renameBtn.onclick = renameAction;
    card.querySelector('.card-filename').onclick = renameAction;

    if (isVideo || screenshot.captureType === 'showcase') {
      mockupBtn.style.display = 'none';
      if (isVideo) copyBtn.style.display = 'none';
    } else {
      mockupBtn.onclick = (e) => { e.stopPropagation(); openMockupModal(screenshot); };
    }

    downloadBtn.onclick = (e) => { e.stopPropagation(); downloadScreenshot(screenshot); };
    
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm('Delete this screenshot?')) {
        await db.delete(screenshot.id);
        selectedIds.delete(screenshot.id); // Fix: Remove from selection if deleted
        loadScreenshots();
      }
    };

    if (isVideo) {
      const videoEl = card.querySelector('.card-video');
      const preview = card.querySelector('.screenshot-preview');
      
      // Add a play icon overlay for videos
      const playIcon = document.createElement('div');
      playIcon.innerHTML = '▶';
      playIcon.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3rem;color:white;opacity:0.5;pointer-events:none;transition:0.3s;';
      preview.appendChild(playIcon);

      preview.addEventListener('mouseenter', () => {
        playIcon.style.opacity = '0.8';
        videoEl.play();
      });
      preview.addEventListener('mouseleave', () => {
        playIcon.style.opacity = '0.5';
        videoEl.pause();
        videoEl.currentTime = 0;
      });

      // Selection still works via the card click handler
    }

    return card;
  }

  function toggleSelect(id, selected) {
    if (selected) selectedIds.add(id);
    else selectedIds.delete(id);
    
    updateSelectionState();
    document.querySelectorAll(`.screenshot-card[data-id="${id}"]`).forEach(card => {
      card.classList.toggle('selected', selected);
      const cb = card.querySelector('.card-checkbox');
      if (cb) cb.checked = selected;
    });
  }

  function updateSelectionState() {
    const count = selectedIds.size;
    if (count > 0) {
      selectionBar.classList.add('active');
      selectionCount.textContent = `${count} items selected`;
      showcaseBtn.disabled = count < 2;
    } else {
      selectionBar.classList.remove('active');
    }
  }

  // --- ACTIONS ---
  async function downloadScreenshot(screenshot) {
    const link = document.createElement('a');
    link.href = screenshot.dataUrl;
    link.download = screenshot.filename;
    link.click();
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selectedIds.size} screenshots?`)) return;
    for (const id of selectedIds) await db.delete(id);
    screenshots = screenshots.filter(s => !selectedIds.has(s.id));
    selectedIds.clear();
    renderGallery();
  }

  async function clearAll() {
    if (!confirm('Are you sure you want to delete ALL screenshots?')) return;
    await db.clear();
    screenshots = [];
    selectedIds.clear();
    renderGallery();
  }

  async function downloadSelected() {
    const selected = screenshots.filter(s => selectedIds.has(s.id));
    for (const s of selected) {
      downloadScreenshot(s);
      await new Promise(r => setTimeout(r, 100));
    }
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  }

  async function exportPdf() {
    if (selectedIds.size === 0) return;
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
       alert('PDF library not loaded.'); 
       return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const selected = screenshots.filter(s => selectedIds.has(s.id));
    
    exportPdfBtn.innerHTML = '⏳ PDF...';
    exportPdfBtn.disabled = true;

    try {
      for (let i = 0; i < selected.length; i++) {
        if (i > 0) doc.addPage();
        const s = selected[i];
        const imgProps = doc.getImageProperties(s.dataUrl);
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        doc.addImage(s.dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      }
      doc.save(`DevShot_Export_${Date.now()}.pdf`);
      exportPdfBtn.innerHTML = '✅ Done';
    } catch (err) { 
      console.error(err); 
      exportPdfBtn.innerHTML = '❌ Error';
    } finally {
      setTimeout(() => {
        exportPdfBtn.innerHTML = '📄 Export PDF';
        exportPdfBtn.disabled = false;
      }, 2000);
    }
  }


  // Download all screenshots in a domain as a ZIP file
  async function downloadDomainAsZip(domain, domainScreenshots, btn) {
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
      alert('ZIP functionality requires JSZip library. Please refresh the page.');
      return;
    }
    
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Zipping...';
    
    try {
      const zip = new JSZip();
      const folder = zip.folder(domain.replace(/[^a-zA-Z0-9.-]/g, '_'));
      
      for (let i = 0; i < domainScreenshots.length; i++) {
        const screenshot = domainScreenshots[i];
        btn.innerHTML = `📦 ${i + 1}/${domainScreenshots.length}`;
        
        // Extract base64 data and determine file type
        const dataUrl = screenshot.dataUrl;
        const isVideo = screenshot.captureType === 'video' || screenshot.filename?.endsWith('.webm');
        
        // Get the base64 content (remove data:image/png;base64, or similar prefix)
        const base64Data = dataUrl.split(',')[1];
        
        if (base64Data) {
          // Determine extension based on data URL
          let extension = 'png';
          if (dataUrl.includes('image/jpeg')) extension = 'jpg';
          else if (dataUrl.includes('image/webp')) extension = 'webp';
          else if (dataUrl.includes('video/webm') || isVideo) extension = 'webm';
          
          // Create a clean filename
          const filename = screenshot.filename || `screenshot_${screenshot.id}.${extension}`;
          
          // Add to ZIP
          folder.file(filename, base64Data, { base64: true });
        }
      }
      
      btn.innerHTML = '💾 Saving...';
      
      // Generate and download ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${domain.replace(/[^a-zA-Z0-9.-]/g, '_')}_screenshots.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
      
      btn.innerHTML = '✅ Done!';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);
      
    } catch (error) {
      console.error('ZIP creation failed:', error);
      btn.innerHTML = '❌ Failed';
      alert('Failed to create ZIP file: ' + error.message);
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);
    }
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
    const selected = (passedScreenshots || screenshots.filter(s => selectedIds.has(s.id)))
                     .filter(s => s.captureType !== 'video');
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
    // --- Constants ---
    const TEMPLATES = [
      // Standard Device Layouts
      { id: 'single-device', name: 'Single Device', icon: '📱', slots: [{ id: 0, defaultDevice: 'iphone-15-pro', label: 'Device' }] },
      { id: '3-device', name: 'Tri-Device', icon: '💻📱', slots: [
        { id: 0, defaultDevice: 'macbook-pro-16', label: 'Center (Desktop)' },
        { id: 1, defaultDevice: 'ipad-pro-11', label: 'Left (Tablet)' },
        { id: 2, defaultDevice: 'iphone-15-pro', label: 'Right (Phone)' }
      ]},
      { id: 'hero-layout', name: 'Hero Header', icon: '💎', slots: [
        { id: 0, defaultDevice: 'macbook-pro-16', label: 'Main Feature' },
        { id: 1, defaultDevice: 'iphone-15-pro', label: 'Floating Mobile' }
      ]},
      { id: 'isometric-floating', name: 'Isometric Float', icon: '🔷', slots: [
        { id: 0, defaultDevice: 'macbook-pro-16', label: 'Main (Tilted)' },
        { id: 1, defaultDevice: 'iphone-15-pro', label: 'Floating Phone' }
      ]},
      { id: 'marketing-stack', name: 'Marketing Stack', icon: '📚', slots: [
        { id: 0, defaultDevice: 'browser-light', label: 'Back Layer' },
        { id: 1, defaultDevice: 'iphone-15-pro', label: 'Front Device' }
      ]},
      { id: 'comparison', name: 'Comparison', icon: '⚖️', slots: [
        { id: 0, defaultDevice: 'browser-light', label: 'Left/Before' },
        { id: 1, defaultDevice: 'browser-light', label: 'Right/After' }
      ]},
       { id: 'business-angled', name: 'Angled Trio', icon: '📐', slots: [
        { id: 0, defaultDevice: 'browser-light', label: 'Back' },
        { id: 1, defaultDevice: 'browser-light', label: 'Middle' },
        { id: 2, defaultDevice: 'browser-light', label: 'Front' }
      ]},
      { id: 'bold-color-grid', name: 'Grid Layout', icon: '⬛', slots: [0, 1, 2, 3].map(i => ({ id: i, defaultDevice: 'none', label: `Screen ${i+1}` })) },

      // Professional Device Mockups (New)
      { id: 'surface-display', name: 'Surface Display', icon: '🖥️📱', slots: [
        { id: 0, defaultDevice: 'imac-24', label: 'Desktop (Center)' },
        { id: 1, defaultDevice: 'ipad-pro-12', label: 'Tablet (Left)' },
        { id: 2, defaultDevice: 'iphone-15-pro', label: 'Phone (Right)' }
      ]},
      { id: 'multi-device-showcase', name: '5-Device Showcase', icon: '🌐', slots: [
        { id: 0, defaultDevice: 'imac-24', label: 'Desktop' },
        { id: 1, defaultDevice: 'macbook-pro-16', label: 'Laptop' },
        { id: 2, defaultDevice: 'ipad-pro-12', label: 'Tablet' },
        { id: 3, defaultDevice: 'iphone-15-pro', label: 'Phone 1' },
        { id: 4, defaultDevice: 'iphone-14', label: 'Phone 2' }
      ]},
      { id: 'angled-laptop', name: 'Angled Laptop', icon: '💻', slots: [
        { id: 0, defaultDevice: 'macbook-pro-16', label: 'Laptop Screen' }
      ]},
      { id: 'imac-spotlight', name: 'iMac Spotlight', icon: '🖥️', slots: [
        { id: 0, defaultDevice: 'imac-24', label: 'iMac Display' }
      ]},

      // Text & Marketing Templates
      { id: 'social-post', name: 'Social Post', icon: '💬',
        slots: [{ id: 0, defaultDevice: 'macbook-pro-16', label: 'Visual' }],
        textSlots: [
          { id: 'title', label: 'Headline', default: 'New Feature Alert', type: 'h1' },
          { id: 'subtitle', label: 'Description', default: 'Check out this amazing update we just shipped.', type: 'p' }
        ]
      },
      { id: 'feature-announce', name: 'Feature Announce', icon: '📢',
        slots: [{ id: 0, defaultDevice: 'iphone-15-pro', label: 'App View' }],
        textSlots: [
          { id: 'title', label: 'Big Announcement', default: 'Introducing v2.0', type: 'h1' },
          { id: 'tagline', label: 'Tagline', default: 'Faster. Better. Stronger.', type: 'span' }
        ]
      },
      { id: 'linkedin-slide', name: 'LinkedIn Slide', icon: '👔',
        slots: [{ id: 0, defaultDevice: 'macbook-pro-16', label: 'Content' }],
        textSlots: [
          { id: 'title', label: 'Key Takeaway', default: 'How we optimized performance by 300%', type: 'h1' }
        ]
      },
      { id: 'quote-card', name: 'Quote Card', icon: '❝',
        slots: [], // No image slots, just text
        textSlots: [
          { id: 'quote', label: 'Quote', default: 'DevShot has completely changed how we showcase our work.', type: 'quote' },
          { id: 'author', label: 'Author', default: '@Hamzaisadev', type: 'span' }
        ]
      },

      { id: 'product-spotlight', name: 'Spotlight', icon: '🔦', slots: [
        { id: 0, defaultDevice: 'macbook-pro-16', label: 'Main Feature' },
        { id: 1, defaultDevice: 'iphone-15-pro', label: 'Spotlight' }
      ]},
      { id: 'multi-device-wave', name: 'Wave Pattern', icon: '🌊', slots: [
        { id: 0, defaultDevice: 'macbook-pro-16', label: 'Back Left' },
        { id: 1, defaultDevice: 'ipad-pro-12', label: 'Middle' },
        { id: 2, defaultDevice: 'iphone-15-pro', label: 'Front' },
        { id: 3, defaultDevice: 'iphone-14', label: 'Back Right' }
      ]},
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
      { id: 'desktop-monitor', name: 'Desktop Monitor', icon: '🖥️' },
      { type: 'header', name: 'Browsers' },
      { id: 'browser-arc', name: 'Arc Browser', icon: '🌐' },
      { id: 'browser-chrome', name: 'Chrome', icon: '🌐' },
      { id: 'browser-light', name: 'Browser (Light)', icon: '🌐' }
    ];

    // State
    const state = {
      assignments: {}, // { 0: screenshot, 1: screenshot }
      available: hasMoreAvailable ? initialScreenshots : [...initialScreenshots],
      template: initialMode === 'single' ? 'single-device' : (initialMode === 'custom' ? 'custom' : 'surface-display'),
      background: { type: 'solid', value: 'transparent' },
      zoom: 0.8, // Start zoomed out slightly to see whole canvas
      customItems: [],
      selectedItem: null,
      texts: {} // { 'id': 'Text Value' }
    };

    // Smart Assignment Core
    const autoAssignSlots = (tplId) => {
      const t = TEMPLATES.find(x => x.id === tplId);
      if (!t || t.slots.length === 0) return;

      const usedIds = new Set();
      t.slots.forEach(slot => {
        const hint = slot.defaultDevice || '';
        const isPhone = hint.includes('iphone') || hint.includes('pixel') || hint.includes('samsung');
        const isTablet = hint.includes('ipad') || hint.includes('surface') || hint.includes('tablet');
        const isFullPage = hint === 'none';

        let match = null;
        // Try to match by specific device type and capture type
        if (isFullPage) {
          match = state.available.find(s => !usedIds.has(s.id) && s.captureType === 'fullpage');
        } else if (isPhone) {
          match = state.available.find(s => !usedIds.has(s.id) && s.device === 'mobile' && s.captureType === 'viewport');
        } else if (isTablet) {
          match = state.available.find(s => !usedIds.has(s.id) && s.device === 'tablet' && s.captureType === 'viewport');
        } else { // Assume desktop or browser
          match = state.available.find(s => !usedIds.has(s.id) && s.device === 'desktop' && s.captureType === 'viewport');
        }

        // Fallback: any matching device type (viewport)
        if (!match) {
          if (isPhone) match = state.available.find(s => !usedIds.has(s.id) && s.device === 'mobile');
          else if (isTablet) match = state.available.find(s => !usedIds.has(s.id) && s.device === 'tablet');
          else if (!isFullPage) match = state.available.find(s => !usedIds.has(s.id) && s.device === 'desktop');
        }

        // Final fallback: any unused screenshot
        if (!match) {
          match = state.available.find(s => !usedIds.has(s.id));
        }

        if (match) {
          state.assignments[slot.id] = match;
          usedIds.add(match.id);
        }
      });
    };

    // Initialize default texts for templates
    const initTexts = () => {
        const t = TEMPLATES.find(x => x.id === state.template);
        if (t && t.textSlots) {
            t.textSlots.forEach(slot => {
                if (!state.texts[slot.id]) state.texts[slot.id] = slot.default;
            });
        }
    };

    // Unified Initialization Flow
    if (state.template !== 'custom') {
       autoAssignSlots(state.template);
    } else {
       state.customItems = initialScreenshots.map((s, i) => ({
        id: Date.now() + i,
        img: s,
        x: 400 + (i * 100),
        y: 400 + (i * 50),
        w: 600,
        deviceId: s.device === 'mobile' ? 'iphone-15-pro' : 'macbook-pro-16'
      }));
    }

    // Initialize text values now that TEMPLATES is defined
    initTexts();

    // Slot Configuration - Per template to avoid cross-template contamination
    const slotConfig = {};
    const getSlotConfigKey = (templateId, slotId) => `${templateId}-${slotId}`;

    // Initialize slot configs per template
    TEMPLATES.forEach(t => {
      t.slots.forEach(s => {
        const key = getSlotConfigKey(t.id, s.id);
        if (!slotConfig[key]) slotConfig[key] = s.defaultDevice;
      });
    });
    
    // Helper to get/set current template's slot config
    const getSlotDevice = (slotId) => slotConfig[getSlotConfigKey(state.template, slotId)] || 'none';
    const setSlotDevice = (slotId, deviceId) => { slotConfig[getSlotConfigKey(state.template, slotId)] = deviceId; };

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

        <!-- CENTER: Canvas (Fixed, no scroll) -->
        <div class="ui-canvas-area" style="flex:1;background:repeating-linear-gradient(45deg,#08080a,#08080a 10px,#0a0a0c 10px,#0a0a0c 20px);position:relative;display:flex;flex-direction:column;overflow:hidden;">
          <div class="canvas-toolbar" style="padding:16px;display:flex;justify-content:flex-end;align-items:center;position:absolute;top:0;left:0;right:0;z-index:10;gap:12px;">
            <button id="save-gallery-btn" style="padding:10px 24px;background:rgba(255,255,255,0.05);color:white;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s;">
              <span>🎨</span> Save to Gallery
            </button>
            <button id="download-btn" style="padding:10px 24px;background:#6366f1;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(99,102,241,0.4);display:flex;align-items:center;gap:8px;">
              <span>🖼️</span> Download Image
            </button>
          </div>
          
          <div class="canvas-container" style="flex:1;display:flex;align-items:center;justify-content:center;padding:60px 40px 40px 40px;">
            <canvas id="main-canvas" style="box-shadow:0 25px 80px rgba(0,0,0,0.6);border-radius:12px;max-width:100%;max-height:100%;object-fit:contain;"></canvas>
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
                   style="width:100%;aspect-ratio:1;border-radius:8px;border:2px solid transparent;cursor:pointer;background:${bg.css};position:relative;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.2);"></button>
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
        { name: 'None', type: 'solid', value: 'transparent', css: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%) #fff' },
        { name: 'Midnight', type: 'gradient', value: ['#1a1a2e', '#0f3460'], css: 'linear-gradient(135deg, #1a1a2e, #0f3460)' },
        { name: 'Purple', type: 'gradient', value: ['#667eea', '#764ba2'], css: 'linear-gradient(135deg, #667eea, #764ba2)' },
        { name: 'Sunset', type: 'gradient', value: ['#fc4a1a', '#f7b733'], css: 'linear-gradient(135deg, #fc4a1a, #f7b733)' },
        { name: 'Forest', type: 'gradient', value: ['#11998e', '#38ef7d'], css: 'linear-gradient(135deg, #11998e, #38ef7d)' },
        { name: 'Dark', type: 'solid', value: '#1a1a1a', css: '#1a1a1a' },
        { name: 'Light', type: 'solid', value: '#f5f5f5', css: '#f5f5f5' }
      ];
    }

    // --- LOGIC ---
    const canvas = overlay.querySelector('#main-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1920;
    canvas.height = 1080;

    // Render Slots UI
    function updateUI() {
      // Show/hide custom tools
      const customHint = overlay.querySelector('#custom-hint');
      if (customHint) customHint.style.display = state.template === 'custom' ? 'block' : 'none';
      
      const slotsContainer = overlay.querySelector('.slots-container');
      const list = overlay.querySelector('#slots-list');
      const currentTpl = TEMPLATES.find(t => t.id === state.template);
      
      // Custom mode has specific UI
      if (state.template === 'custom') {
        list.innerHTML = `
          <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:16px;text-align:center;">
            <p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Custom Mode</p>
            <button id="add-item-btn" style="background:#6366f1;color:white;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;margin-top:8px;font-weight:600;width:100%;">
              + Add Screenshot
            </button>
          </div>
          ${state.selectedItem ? `
            <div style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;">
              <label style="display:block;color:rgba(255,255,255,0.6);font-size:0.75rem;margin-bottom:8px;">SELECTED ITEM</label>
              ${renderDeviceSelector(state.selectedItem.deviceId, 'custom-device')}
              <div style="display:flex;gap:8px;margin-top:10px;">
                <button id="bring-front" style="flex:1;background:rgba(255,255,255,0.1);color:white;border:none;padding:8px;border-radius:6px;cursor:pointer;">⬆ Front</button>
                <button id="send-back" style="flex:1;background:rgba(255,255,255,0.1);color:white;border:none;padding:8px;border-radius:6px;cursor:pointer;">⬇ Back</button>
              </div>
              <button id="delete-item-btn" style="width:100%;margin-top:10px;background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:8px;border-radius:6px;cursor:pointer;">Remove Item</button>
            </div>
          ` : ''}
        `;
        
        // Custom events
        const addBtn = list.querySelector('#add-item-btn');
        if(addBtn) addBtn.onclick = () => {
           openImageSelector((selectedScreenshot) => {
             state.customItems.push({
                id: Date.now(),
                img: selectedScreenshot,
                x: 960, y: 540, w: 800,
                deviceId: selectedScreenshot.device === 'mobile' ? 'iphone-15-pro' : 'macbook-pro-16'
             });
             render();
           });
        };
        
        const devSel = list.querySelector('#custom-device');
        if(devSel) devSel.onchange = (e) => {
           if(state.selectedItem) {
             state.selectedItem.deviceId = e.target.value;
             render();
           }
        };

        const frontBtn = list.querySelector('#bring-front');
        if(frontBtn) frontBtn.onclick = () => {
          if(state.selectedItem) {
             const idx = state.customItems.indexOf(state.selectedItem);
             state.customItems.splice(idx, 1);
             state.customItems.push(state.selectedItem);
             render();
          }
        };

        const backBtn = list.querySelector('#send-back');
        if(backBtn) backBtn.onclick = () => {
          if(state.selectedItem) {
             const idx = state.customItems.indexOf(state.selectedItem);
             state.customItems.splice(idx, 1);
             state.customItems.unshift(state.selectedItem);
             render();
          }
        };

        const delBtn = list.querySelector('#delete-item-btn');
        if(delBtn) delBtn.onclick = () => {
          if(state.selectedItem) {
            state.customItems = state.customItems.filter(i => i !== state.selectedItem);
            state.selectedItem = null;
            updateUI();
            render();
          }
        };

        return;
      }

      // Render Text Slots (if any)
      let textInputsHtml = '';
      if (currentTpl.textSlots) {
        textInputsHtml = `
            <div style="margin-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:16px;">
                <h4 style="margin:0 0 12px 0;font-size:0.75rem;color:rgba(255,255,255,0.5);text-transform:uppercase;">Text Content</h4>
                ${currentTpl.textSlots.map(slot => `
                    <div style="margin-bottom:12px;">
                        <label style="display:block;font-size:0.75rem;color:rgba(255,255,255,0.7);margin-bottom:6px;">${slot.label}</label>
                        <input type="text" class="text-slot-input" data-id="${slot.id}" value="${state.texts[slot.id] || ''}" 
                            style="width:100%;background:#111;border:1px solid rgba(255,255,255,0.1);color:white;padding:10px;border-radius:6px;font-size:0.9rem;">
                    </div>
                `).join('')}
            </div>
        `;
      }
      
      list.innerHTML = textInputsHtml + currentTpl.slots.map(slot => {
        const assigned = state.assignments[slot.id];
        const currentDeviceId = getSlotDevice(slot.id) || slot.defaultDevice;
        
        return `
          <div class="slot-item" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:16px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span style="font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;">${slot.label}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                ${assigned ? `<button class="slot-deselect-btn" data-slot="${slot.id}" style="background:none;border:none;color:#ef4444;font-size:0.7rem;cursor:pointer;padding:0;text-decoration:underline;">Deselect</button>` : ''}
                <span style="font-size:1.2rem;">${DEVICE_TYPES.find(d => d.id === currentDeviceId)?.icon || '📱'}</span>
              </div>
            </div>
            
            <!-- VISUAL PICKER BUTTON -->
            <div class="visual-picker-btn" data-slot="${slot.id}" style="
               height: 100px; 
               background: ${assigned ? `url(${assigned.dataUrl})` : 'rgba(0,0,0,0.3)'};
               background-size: cover;
               background-position: center top;
               border: 2px dashed rgba(255,255,255,0.1);
               border-radius: 8px;
               cursor: pointer;
               display: flex; align-items: center; justify-content: center;
               margin-bottom: 12px;
               position: relative;
               transition: all 0.2s;
            ">
               ${!assigned ? `<span style="color:rgba(255,255,255,0.4); font-size: 0.8rem;">+ Select Image</span>` : 
                 `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0">
                    <span style="color:white;font-weight:600;font-size:0.85rem;">Change</span>
                  </div>`
               }
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
      
      // Text Input Listeners
      list.querySelectorAll('.text-slot-input').forEach(input => {
        input.addEventListener('input', (e) => {
            state.texts[e.target.dataset.id] = e.target.value;
            render();
        });
      });

      list.querySelectorAll('.visual-picker-btn').forEach(btn => {
        btn.onclick = () => {
          const slotId = parseInt(btn.dataset.slot);
          openImageSelector((selectedScreenshot) => {
            state.assignments[slotId] = selectedScreenshot;
            render();
            updateUI();
          });
        };
      });

      list.querySelectorAll('select[id^="device-slot"]').forEach(sel => {
        sel.onchange = (e) => {
          const slotId = parseInt(e.target.dataset.slot);
          setSlotDevice(slotId, e.target.value);
          render();
          updateUI(); // Re-render to update icon
        };
      });

      list.querySelectorAll('.slot-deselect-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const slotId = parseInt(btn.dataset.slot);
          state.assignments[slotId] = null;
          render();
          updateUI();
        };
      });
    }

    // VISUAL IMAGE SELECTOR MODAL (Smart Selection)
    function openImageSelector(onSelect, slotType = 'any') {
      // Get IDs of already-assigned screenshots
      const assignedIds = new Set(Object.values(state.assignments).filter(Boolean).map(s => s.id));
      state.customItems.forEach(item => { if(item.img) assignedIds.add(item.img.id); });
      
      // Filter and sort: unassigned first, then assigned (grayed out) - Images only
      const availableImages = state.available.filter(s => s.captureType !== 'video');
      const unassigned = availableImages.filter(s => !assignedIds.has(s.id));
      const assigned = availableImages.filter(s => assignedIds.has(s.id));
      const sortedScreenshots = [...unassigned, ...assigned];

      const subOverlay = document.createElement('div');
      subOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);backdrop-filter:blur(10px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:40px;';
      
      subOverlay.innerHTML = `
        <div style="width:100%;max-width:900px;background:#16161a;border-radius:20px;padding:30px;display:flex;flex-direction:column;max-height:85vh;border:1px solid rgba(255,255,255,0.1);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
            <h2 style="margin:0;color:white;font-size:1.4rem;">Select Screenshot</h2>
            <button id="close-selector" style="background:none;border:none;color:white;font-size:2rem;cursor:pointer;">&times;</button>
          </div>
          <div style="flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:16px;">
            <div class="picker-thumb none-option" data-id="none" style="border-radius:12px;overflow:hidden;background:rgba(255,255,255,0.05);aspect-ratio:16/9;cursor:pointer;border:2px dashed rgba(255,255,255,0.2);transition:all 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
              <span style="font-size:2rem;opacity:0.5;">🚫</span>
              <span style="font-size:0.8rem;color:rgba(255,255,255,0.5);font-weight:600;">None / Remove</span>
            </div>
            ${sortedScreenshots.map(s => {
              const isAssigned = assignedIds.has(s.id);
              const aspectRatio = s.device === 'mobile' ? '9/16' : '16/10';
              const deviceIcon = s.device === 'mobile' ? '📱' : s.device === 'tablet' ? '📲' : '🖥️';
              const typeLabel = s.captureType === 'fullpage' ? 'Full Page' : 'Viewport';
              const typeBg = s.captureType === 'fullpage' ? '#8b5cf6' : '#22c55e';
              
              return `
              <div class="picker-thumb ${isAssigned ? 'assigned' : ''}" data-id="${s.id}" style="border-radius:12px;overflow:hidden;background:#000;aspect-ratio:${aspectRatio};cursor:${isAssigned ? 'not-allowed' : 'pointer'};border:2px solid transparent;transition:all 0.2s;position:relative;opacity:${isAssigned ? '0.4' : '1'};max-height:200px;">
                <img src="${s.dataUrl}" style="width:100%;height:100%;object-fit:cover;object-position:top;">
                <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent, rgba(0,0,0,0.9));padding:10px;">
                  <div style="font-size:0.8rem;color:white;font-weight:600;margin-bottom:4px;">${deviceIcon} ${s.device || 'desktop'}</div>
                  <div style="font-size:0.65rem;color:rgba(255,255,255,0.7);">${s.domain}</div>
                </div>
                <div style="position:absolute;top:8px;left:8px;background:${typeBg};color:white;padding:2px 8px;border-radius:4px;font-size:0.6rem;font-weight:600;">${typeLabel}</div>
                ${isAssigned ? `<div style="position:absolute;top:8px;right:8px;background:#ef4444;color:white;padding:2px 8px;border-radius:4px;font-size:0.6rem;font-weight:600;">IN USE</div>` : ''}
              </div>
            `}).join('')}
          </div>
        </div>
      `;
      
      subOverlay.onclick = (e) => { if(e.target === subOverlay || e.target.id === 'close-selector') subOverlay.remove(); };
      
      subOverlay.querySelectorAll('.picker-thumb').forEach(thumb => {
        if (thumb.classList.contains('assigned')) return;
        
        thumb.onmouseenter = () => thumb.style.borderColor = '#6366f1';
        thumb.onmouseleave = () => thumb.style.borderColor = thumb.classList.contains('none-option') ? 'rgba(255,255,255,0.2)' : 'transparent';
        
        thumb.onclick = () => {
          if (thumb.classList.contains('none-option')) {
            onSelect(null);
          } else {
            const id = parseInt(thumb.dataset.id);
            const s = state.available.find(x => x.id === id);
            onSelect(s);
          }
          subOverlay.remove();
        };
      });
      
      document.body.appendChild(subOverlay);
    }


    function renderDeviceSelector(currentValue, id, dataSlot = '') {
      // Build options with proper optgroup structure
      let optionsHtml = '';
      let currentOptGroup = null;
      
      DEVICE_TYPES.forEach(d => {
        if (d.type === 'header') {
          if (currentOptGroup) optionsHtml += '</optgroup>';
          optionsHtml += `<optgroup label="${d.name}">`;
          currentOptGroup = d.name;
        } else {
          optionsHtml += `<option value="${d.id}" ${d.id === currentValue ? 'selected' : ''}>${d.icon} ${d.name}</option>`;
        }
      });
      if (currentOptGroup) optionsHtml += '</optgroup>';
      
      return `
        <select id="${id}" ${dataSlot !== '' ? `data-slot="${dataSlot}"` : ''} style="width:100%;background:#111;border:1px solid rgba(255,255,255,0.1);color:white;padding:8px;border-radius:6px;font-size:0.85rem;">
          ${optionsHtml}
        </select>
      `;
    }

    // DRAWING LOGIC
    async function render() {
      // Clear canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background
      if (state.background.value === 'transparent') {
        // Already cleared
      } else if (state.background.type === 'gradient') {
        const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grd.addColorStop(0, state.background.value[0]);
        grd.addColorStop(1, state.background.value[1]);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = state.background.value;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const loadAsset = (s) => new Promise(r => {
        if (!s) return r(null);
        let i = new Image();
        i.onload = () => r(i);
        i.onerror = () => r(null);
        i.src = s.dataUrl;
      });

      if (state.template === 'custom') {
        for (let item of state.customItems) {
           const asset = await loadAsset(item.img);
           if(asset) {
             drawDevice(ctx, item.deviceId, asset, item.x, item.y, item.w);
             
             if(state.selectedItem === item) {
               // Draw selection outline
               const isPhone = item.deviceId.includes('phone') || item.deviceId.includes('pixel') || item.deviceId.includes('samsung');
               const h = isPhone ? item.w * 2 : item.w * 0.65;
               const hw = item.w / 2, hh = h / 2;
               
               ctx.strokeStyle = '#6366f1';
               ctx.lineWidth = 3;
               ctx.setLineDash([8, 4]);
               ctx.strokeRect(item.x - hw, item.y - hh, item.w, h);
               ctx.setLineDash([]);
               
               // Draw 8-point handles
               const handles = [
                 { x: item.x - hw, y: item.y - hh }, { x: item.x, y: item.y - hh }, { x: item.x + hw, y: item.y - hh },
                 { x: item.x + hw, y: item.y }, { x: item.x + hw, y: item.y + hh }, { x: item.x, y: item.y + hh },
                 { x: item.x - hw, y: item.y + hh }, { x: item.x - hw, y: item.y }
               ];
               handles.forEach(handle => {
                 ctx.fillStyle = '#ffffff';
                 ctx.strokeStyle = '#6366f1';
                 ctx.lineWidth = 2;
                 ctx.beginPath();
                 ctx.arc(handle.x, handle.y, 8, 0, Math.PI * 2);
                 ctx.fill();
                 ctx.stroke();
               });
             }
           }
        }
      }
      else {
        // Templates
        const t = TEMPLATES.find(x => x.id === state.template);
        
        // Load all assigned assets
        const loaded = {}; 
        for (let s of t.slots) {
           if (state.assignments[s.id]) {
             const asset = await loadAsset(state.assignments[s.id]);
             loaded[s.id] = asset;
           }
        }


        // Helper for text drawing
        function drawText(ctx, text, x, y, options = {}) {
            const { size = 60, color = 'white', weight = 'bold', align = 'left', maxWidth = 1000, font = 'Inter, system-ui, sans-serif' } = options;
            ctx.font = `${weight} ${size}px ${font}`;
            ctx.fillStyle = color;
            ctx.textAlign = align;
            ctx.textBaseline = 'top';
            
            // Basic line wrapping
            const words = text.split(' ');
            let line = '';
            let lineY = y;
            const lineHeight = size * 1.2;
            
            for(let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;
                if (testWidth > maxWidth && n > 0) {
                    ctx.fillText(line, x, lineY);
                    line = words[n] + ' ';
                    lineY += lineHeight;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, x, lineY);
        }

       // --- Template Rendering Logic ---

      if (state.template === 'single-device') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 540, 900);
      }
      else if (state.template === '3-device') {
        if(loaded[1]) drawDevice(ctx, getSlotDevice(1), loaded[1], 460, 600, 520);
        if(loaded[2]) drawDevice(ctx, getSlotDevice(2), loaded[2], 1460, 600, 520);
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 500, 1000);
      }
      else if (state.template === 'hero-layout') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 850, 500, 1100);
        if(loaded[1]) drawDevice(ctx, getSlotDevice(1), loaded[1], 1450, 680, 280);
      }
      else if (state.template === 'isometric-floating') {
        ctx.save();
        if(loaded[0]) {
          ctx.translate(700, 450);
          ctx.transform(1, 0.1, -0.2, 1, 0, 0); 
          drawDevice(ctx, getSlotDevice(0), loaded[0], 0, 0, 1000);
        }
        ctx.restore();
        if(loaded[1]) {
          ctx.save();
          ctx.translate(1400, 600);
          ctx.transform(1, -0.05, 0.1, 1, 0, 0);
          drawDevice(ctx, getSlotDevice(1), loaded[1], 0, 0, 280);
          ctx.restore();
        }
      }
      else if (state.template === 'marketing-stack') {
        if(loaded[0]) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.4)';
          ctx.shadowBlur = 50;
          ctx.shadowOffsetY = 30;
          drawDevice(ctx, getSlotDevice(0), loaded[0], 800, 500, 1000);
          ctx.restore();
        }
        if(loaded[1]) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 60;
          ctx.shadowOffsetY = 40;
          drawDevice(ctx, getSlotDevice(1), loaded[1], 1400, 580, 320);
          ctx.restore();
        }
      }
      else if (state.template === 'comparison') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 500, 540, 780);
        if(loaded[1]) drawDevice(ctx, getSlotDevice(1), loaded[1], 1420, 540, 780);
        
        // Stylish Divider
        ctx.save();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(960, 200);
        ctx.lineTo(960, 880);
        ctx.stroke();
        
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(960, 540, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VS', 960, 542);
        ctx.restore();
      }
      else if (state.template === 'business-angled') {
        ctx.save();
        const drawAngled = (slotId, x, y, w, rot) => {
           if(!loaded[slotId]) return;
           ctx.save();
           ctx.translate(x, y);
           ctx.rotate(rot * Math.PI / 180);
           drawDevice(ctx, getSlotDevice(slotId), loaded[slotId], 0, 0, w);
           ctx.restore();
        };
        drawAngled(0, 600, 450, 800, -10);
        drawAngled(1, 960, 540, 800, -10);
        drawAngled(2, 1320, 630, 800, -10);
        ctx.restore();
      }
      else if (state.template === 'bold-color-grid') {
        const padding = 100;
        const w = (1920 - padding*3) / 2;
        const h = (1080 - padding*3) / 2;
        
        const drawGridItem = (slotId, x, y) => {
          if(!loaded[slotId]) return;
          ctx.strokeStyle = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'][slotId];
          ctx.lineWidth = 20;
          ctx.strokeRect(x, y, w, h);
          ctx.drawImage(loaded[slotId], x, y, w, h);
        };
        drawGridItem(0, padding, padding);
        drawGridItem(1, padding*2 + w, padding);
        drawGridItem(2, padding, padding*2 + h);
        drawGridItem(3, padding*2 + w, padding*2 + h);
      }
      
      // --- PROFESSIONAL DEVICE MOCKUPS (New) ---
      
      // Surface Display: 3 devices sitting on a reflective surface
      else if (state.template === 'surface-display') {
        // Draw reflective surface/shadow at bottom
        ctx.save();
        const gradient = ctx.createLinearGradient(0, 800, 0, 1080);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 800, 1920, 280);
        ctx.restore();
        
        // Draw devices - tablet left, desktop center, phone right
        if(loaded[1]) drawDevice(ctx, getSlotDevice(1), loaded[1], 380, 520, 400);
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 480, 900);
        if(loaded[2]) drawDevice(ctx, getSlotDevice(2), loaded[2], 1520, 580, 280);
      }
      
      // Multi-Device Showcase: 5 devices in professional arrangement
      else if (state.template === 'multi-device-showcase') {
        // Background glow effect
        ctx.save();
        const glow = ctx.createRadialGradient(960, 540, 0, 960, 540, 800);
        glow.addColorStop(0, 'rgba(99,102,241,0.15)');
        glow.addColorStop(1, 'rgba(99,102,241,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 1920, 1080);
        ctx.restore();
        
        // Back row: Desktop monitor (center-back)
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 380, 800);
        
        // Middle row: Laptop
        if(loaded[1]) {
          ctx.save();
          ctx.translate(500, 580);
          ctx.rotate(-0.05);
          drawDevice(ctx, getSlotDevice(1), loaded[1], 0, 0, 650);
          ctx.restore();
        }
        
        // Tablet on right
        if(loaded[2]) drawDevice(ctx, getSlotDevice(2), loaded[2], 1400, 560, 350);
        
        // Front row: Two phones
        if(loaded[3]) drawDevice(ctx, getSlotDevice(3), loaded[3], 1100, 700, 220);
        if(loaded[4]) drawDevice(ctx, getSlotDevice(4), loaded[4], 1550, 680, 200);
      }
      
      // Angled Laptop: Single minimalist laptop at angle
      else if (state.template === 'angled-laptop') {
        if(loaded[0]) {
          ctx.save();
          // Subtle shadow
          ctx.shadowColor = 'rgba(0,0,0,0.4)';
          ctx.shadowBlur = 80;
          ctx.shadowOffsetY = 40;
          ctx.shadowOffsetX = -20;
          
          // Slight rotation for dramatic effect
          ctx.translate(960, 540);
          ctx.rotate(-0.08);
          drawDevice(ctx, getSlotDevice(0), loaded[0], 0, 0, 1200);
          ctx.restore();
        }
      }
      
      // iMac Spotlight: Single iMac/monitor at dramatic angle
      else if (state.template === 'imac-spotlight') {
        if(loaded[0]) {
          ctx.save();
          // Dramatic shadow
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 100;
          ctx.shadowOffsetY = 50;
          ctx.shadowOffsetX = 30;
          
          // Tilt for spotlight effect
          ctx.translate(960, 520);
          ctx.rotate(0.06);
          drawDevice(ctx, getSlotDevice(0), loaded[0], 0, 0, 1100);
          ctx.restore();
        }
      }
      
      // --- TEXT TEMPLATES ---
      
      else if (state.template === 'social-post') {
          // Left: Image, Right: Text
          if(loaded[0]) {
              drawDevice(ctx, getSlotDevice(0), loaded[0], 600, 540, 900);
          }
          
          if (state.texts.title) {
            drawText(ctx, state.texts.title, 1100, 350, { size: 80, weight: 'bold', maxWidth: 700 });
          }
           if (state.texts.subtitle) {
            drawText(ctx, state.texts.subtitle, 1100, 350 + (state.texts.title ? 120 : 0), { size: 40, weight: 'normal', color: 'rgba(255,255,255,0.8)', maxWidth: 700 });
          }
      }
      
      else if (state.template === 'feature-announce') {
           // Small header, big title, device bottom
           if (state.texts.tagline) {
             drawText(ctx, state.texts.tagline.toUpperCase(), 960, 150, { size: 30, weight: 'bold', align: 'center', color: '#6366f1', letterSpacing: 4 });
           }
           if (state.texts.title) {
             drawText(ctx, state.texts.title, 960, 200, { size: 100, weight: '900', align: 'center', maxWidth: 1600 });
           }
           
           if(loaded[0]) {
             drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 750, 600);
           }
      }
      
      else if (state.template === 'linkedin-slide') {
          // Text Top, Wide Image Bottom
           if (state.texts.title) {
             drawText(ctx, state.texts.title, 960, 150, { size: 90, weight: 'bold', align: 'center', maxWidth: 1400 });
           }
           
           if(loaded[0]) {
             // Draw a "window" style if no device frame
             drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 700, 1100);
           }
      }
      
      else if (state.template === 'quote-card') {
          // Giant quotes
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.font = '500px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('“', 960, 540);
          
          if (state.texts.quote) {
             drawText(ctx, state.texts.quote, 960, 400, { size: 70, weight: 'medium', align: 'center', maxWidth: 1400, font: 'Georgia, serif', style: 'italic' });
          }
          if (state.texts.author) {
             drawText(ctx, `— ${state.texts.author}`, 960, 800, { size: 40, weight: 'bold', align: 'center', color: '#6366f1' });
          }
      }

      // NEW: Full Page Showcase - Single full-page with decorative frame
      else if (state.template === 'fullpage-showcase') {
        if(loaded[0]) {
          const img = loaded[0];
          const maxH = 900;
          const maxW = 1400;
          let w = maxW;
          let h = w * (img.height / img.width);
          if (h > maxH) {
            h = maxH;
            w = h * (img.width / img.height);
          }
          
          // Decorative shadow
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 60;
          ctx.shadowOffsetY = 30;
          
          // Frame
          ctx.fillStyle = '#1c1c1e';
          roundRect(ctx, 960 - w/2 - 12, 540 - h/2 - 12, w + 24, h + 24, 16);
          ctx.fill();
          
          // Image
          ctx.drawImage(img, 960 - w/2, 540 - h/2, w, h);
          ctx.restore();
        }
      }
      // NEW: Page Comparison - Two full pages side by side
      else if (state.template === 'page-comparison') {
        const maxH = 850;
        const spacing = 80;
        const totalW = 1920 - spacing * 3;
        const halfW = totalW / 2;
        
        [0, 1].forEach((slotId, i) => {
          if(!loaded[slotId]) return;
          const img = loaded[slotId];
          let w = halfW;
          let h = w * (img.height / img.width);
          if (h > maxH) {
            h = maxH;
            w = h * (img.width / img.height);
          }
          const cx = spacing + halfW/2 + (i * (halfW + spacing));
          
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.4)';
          ctx.shadowBlur = 40;
          ctx.shadowOffsetY = 20;
          ctx.drawImage(img, cx - w/2, 540 - h/2, w, h);
          ctx.restore();
        });
        
        // Page number labels
        ctx.font = 'bold 18px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText('PAGE 1', spacing + halfW/2, 1000);
        ctx.fillText('PAGE 2', spacing + halfW/2 + halfW + spacing, 1000);
      }
      // NEW: Triple Page - Three full pages side by side
      else if (state.template === 'triple-page') {
        const maxH = 800;
        const spacing = 60;
        const thirdW = (1920 - spacing * 4) / 3;
        
        [0, 1, 2].forEach((slotId, i) => {
          if(!loaded[slotId]) return;
          const img = loaded[slotId];
          let w = thirdW;
          let h = w * (img.height / img.width);
          if (h > maxH) {
            h = maxH;
            w = h * (img.width / img.height);
          }
          const cx = spacing + thirdW/2 + (i * (thirdW + spacing));
          
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.4)';
          ctx.shadowBlur = 30;
          ctx.shadowOffsetY = 15;
          ctx.drawImage(img, cx - w/2, 540 - h/2, w, h);
          ctx.restore();
        });
      }
      // NEW: Minimal Center - Single browser, centered with lots of space
      else if (state.template === 'minimal-center') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 540, 1100);
      }
      // NEW: Laptop + Phone Stack - Laptop behind, phone in front
      else if (state.template === 'laptop-phone-stack') {
        // Draw laptop FIRST (behind)
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 880, 500, 1100);
        // Draw phone SECOND (in front)
        if(loaded[1]) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 60;
          ctx.shadowOffsetY = 30;
          drawDevice(ctx, getSlotDevice(1), loaded[1], 1450, 600, 300);
          ctx.restore();
        }
      }
      // NEW: Dual Phone - Two phones side by side
      else if (state.template === 'dual-phone') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 640, 540, 340);
        if(loaded[1]) drawDevice(ctx, getSlotDevice(1), loaded[1], 1280, 540, 340);
      }
      // NEW: Triple Phone - Three phones in a row
      else if (state.template === 'triple-phone') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 480, 540, 300);
        if(loaded[1]) drawDevice(ctx, getSlotDevice(1), loaded[1], 960, 540, 300);
        if(loaded[2]) drawDevice(ctx, getSlotDevice(2), loaded[2], 1440, 540, 300);
      }
      // NEW: Tablet Center - Single tablet centered
      else if (state.template === 'tablet-centered') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 540, 550);
      }
      // NEW: Laptop Center - Single laptop centered
      else if (state.template === 'laptop-centered') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 540, 1200);
      }
      // NEW: Browser Center - Single browser centered
      else if (state.template === 'browser-centered') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 960, 540, 1200);
      }
      // NEW: SaaS Hero - Laptop on top-right area with space for text on left
      else if (state.template === 'saas-hero') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 1150, 540, 1100);
      }
      // NEW: Feature Left - Device on left side with space for text on right
      else if (state.template === 'feature-left') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 560, 540, 900);
      }
      // NEW: Feature Right - Device on right side with space for text on left
      else if (state.template === 'feature-right') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 1360, 540, 900);
      }
      // NEW: Product Spotlight
      else if (state.template === 'product-spotlight') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 820, 500, 1000);
        if(loaded[1]) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 50;
          ctx.shadowOffsetY = 25;
          drawDevice(ctx, getSlotDevice(1), loaded[1], 1450, 620, 300);
          ctx.restore();
        }
      }
      // NEW: Multi-Device Wave
      else if (state.template === 'multi-device-wave') {
        if(loaded[0]) drawDevice(ctx, getSlotDevice(0), loaded[0], 400, 480, 700);
        if(loaded[1]) drawDevice(ctx, getSlotDevice(1), loaded[1], 850, 560, 400);
        if(loaded[2]) drawDevice(ctx, getSlotDevice(2), loaded[2], 1280, 580, 260);
        if(loaded[3]) drawDevice(ctx, getSlotDevice(3), loaded[3], 1500, 620, 240);
      }
    }
  }

  // --- Events ---
    overlay.querySelector('#close-modal').onclick = () => overlay.remove();
    
    // Click overlay to close (but not inner content)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    
    // Keyboard shortcuts
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeydown);
      }
      if (state.template === 'custom' && state.selectedItem) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          state.customItems = state.customItems.filter(i => i !== state.selectedItem);
          state.selectedItem = null;
          updateUI();
          render();
        }
        // Arrow keys for nudging
        const nudge = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowUp') { state.selectedItem.y -= nudge; render(); }
        if (e.key === 'ArrowDown') { state.selectedItem.y += nudge; render(); }
        if (e.key === 'ArrowLeft') { state.selectedItem.x -= nudge; render(); }
        if (e.key === 'ArrowRight') { state.selectedItem.x += nudge; render(); }
      }
    };
    document.addEventListener('keydown', handleKeydown);
    
    // Template Switch
    overlay.querySelectorAll('.tpl-btn').forEach(btn => {
      btn.onclick = () => {
        const newTemplate = btn.dataset.id;
        
        // Clear assignments when switching templates (fixes 'in use' bug)
        state.assignments = {};
        
        // Clear custom items when leaving custom mode
        if (state.template === 'custom' && newTemplate !== 'custom') {
          state.customItems = [];
        }
        
        state.template = newTemplate;
        state.selectedItem = null;
        
        // Auto-assign screenshots to new template slots
        if (newTemplate !== 'custom') {
          autoAssignSlots(newTemplate);
        }
        
        overlay.querySelectorAll('.tpl-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = 'rgba(255,255,255,0.7)';
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(99,102,241,0.2)';
        btn.style.color = 'white';
        updateUI();
        render();
      };
      // Set initial active state styling
      if (btn.classList.contains('active')) {
        btn.style.background = 'rgba(99,102,241,0.2)';
        btn.style.color = 'white';
      }
    });

    // Background Switch - Fix gradient split and add initial active state
    overlay.querySelectorAll('.bg-option').forEach((btn, index) => {
      // Set initial active state for first background
      if (index === 0) btn.style.borderColor = 'white';
      
      btn.onclick = () => {
        const val = btn.dataset.val;
        state.background = { 
          type: btn.dataset.type, 
          value: val.includes(',') ? val.split(',').map(v => v.trim()) : val 
        };
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
    // Canvas is now fixed scale - no zoom needed

    // Save to Gallery
    overlay.querySelector('#save-gallery-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalContent = btn.innerHTML;
      
      try {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Saving...';
        btn.style.opacity = '0.7';
        
        // Let UI update
        await new Promise(r => setTimeout(r, 100));
        
        const dataUrl = canvas.toDataURL('image/png');
        
        // Find a representative domain
        // Use the domain from the first assigned screenshot
        let domain = 'Showcase';
        const assignments = Object.values(state.assignments);
        if (assignments.length > 0 && assignments[0] && assignments[0].domain) {
          domain = assignments[0].domain;
        } else if (state.customItems.length > 0 && state.customItems[0].img && state.customItems[0].img.domain) {
          domain = state.customItems[0].img.domain;
        }

        const timestamp = Date.now();
        const filename = `Showcase_${domain.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;

        await db.add({
          filename,
          domain,
          device: 'showcase',
          captureType: 'showcase',
          dataUrl: dataUrl,
          timestamp: timestamp,
          url: 'Showcase'
        });
        
        btn.innerHTML = '<span>✅</span> Saved!';
        
        // Refresh the gallery in the background
        if (typeof loadScreenshots === 'function') {
           loadScreenshots();
        }

        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.disabled = false;
          btn.style.opacity = '1';
        }, 2000);
      } catch (err) {
        console.error(err);
        btn.innerHTML = '<span>❌</span> Error';
        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.disabled = false;
          btn.style.opacity = '1';
        }, 2000);
      }
    });

    // Download Image
    overlay.querySelector('#download-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalContent = btn.innerHTML;
      
      try {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Processing...';
        btn.style.opacity = '0.7';
        
        // Let UI update
        await new Promise(r => setTimeout(r, 100));
        
        await exportAsImage();
        
        btn.innerHTML = '<span>✅</span> Saved!';
        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.disabled = false;
          btn.style.opacity = '1';
        }, 2000);
      } catch (err) {
        console.error(err);
        btn.innerHTML = '<span>❌</span> Error';
        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.disabled = false;
          btn.style.opacity = '1';
        }, 2000);
      }
    });


    function exportAsImage() {
      const link = document.createElement('a');
      link.download = `Showcase_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    // --- PROFESSIONAL INTERACTION ENGINE ---
    let isDragging = false;
    let activeHandle = null; 
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0, initialW = 0;

    function getMousePos(e) {
      const rect = canvas.getBoundingClientRect();
      // Account for CSS transform zoom
      const scaleX = canvas.width / (rect.width / state.zoom);
      const scaleY = canvas.height / (rect.height / state.zoom);
      return { x: (e.clientX - rect.left) * scaleX / state.zoom, y: (e.clientY - rect.top) * scaleY / state.zoom };
    }

    function getItemHeight(item) {
      const isPhone = item.deviceId.includes('phone') || item.deviceId.includes('pixel') || item.deviceId.includes('samsung');
      return isPhone ? item.w * 2 : item.w * 0.65;
    }

    function getHandles(item) {
      const h = getItemHeight(item);
      const hw = item.w / 2, hh = h / 2;
      return [
        { x: item.x - hw, y: item.y - hh }, { x: item.x,      y: item.y - hh }, { x: item.x + hw, y: item.y - hh },
        { x: item.x + hw, y: item.y },      { x: item.x + hw, y: item.y + hh }, { x: item.x,      y: item.y + hh },
        { x: item.x - hw, y: item.y + hh }, { x: item.x - hw, y: item.y }
      ];
    }

    canvas.onmousedown = (e) => {
      if(state.template !== 'custom') return;
      const { x, y } = getMousePos(e);
      if (state.selectedItem) {
        const handles = getHandles(state.selectedItem);
        for (let i = 0; i < handles.length; i++) {
          if (Math.sqrt((x - handles[i].x)**2 + (y - handles[i].y)**2) < 15) {
            activeHandle = i; startX = x; startY = y; initialW = state.selectedItem.w; return;
          }
        }
      }
      for (let i = state.customItems.length - 1; i >= 0; i--) {
        const item = state.customItems[i];
        const h = getItemHeight(item), hw = item.w / 2, hh = h / 2;
        if (x >= item.x - hw && x <= item.x + hw && y >= item.y - hh && y <= item.y + hh) {
          state.selectedItem = item; isDragging = true; startX = x; startY = y;
          initialX = item.x; initialY = item.y; updateUI(); render(); return;
        }
      }
      state.selectedItem = null; updateUI(); render();
    };

    canvas.onmousemove = (e) => {
      if(state.template !== 'custom') return;
      const { x, y } = getMousePos(e);
      if (activeHandle !== null && state.selectedItem) {
        const dx = x - startX;
        if (activeHandle === 4 || activeHandle === 2) state.selectedItem.w = Math.max(100, initialW + dx);
        else if (activeHandle === 0 || activeHandle === 6) { state.selectedItem.w = Math.max(100, initialW - dx); state.selectedItem.x = initialX + dx/2; }
        render();
      } else if (isDragging && state.selectedItem) {
        state.selectedItem.x = initialX + (x - startX);
        state.selectedItem.y = initialY + (y - startY);
        render();
      }
    };

    canvas.onmouseup = () => { isDragging = false; activeHandle = null; };
    canvas.onmouseleave = () => { isDragging = false; activeHandle = null; };


    document.body.appendChild(overlay);
    updateUI();
    render();
  }

  // --- Device Rendering Logic (Reused & Simplified) ---
  function drawDevice(ctx, deviceId, img, cx, cy, width) {
    const isPhone = deviceId.includes('phone') || deviceId.includes('pixel') || deviceId.includes('samsung');
    const isLaptop = deviceId.includes('macbook') || deviceId.includes('laptop');
    const isBrowser = deviceId.includes('browser');
    const isIMac = deviceId.includes('imac');
    const isDesktop = deviceId.includes('desktop') || deviceId.includes('monitor');
    
    // Calculate Height
    const aspectRatio = img.height / img.width;
    let h = width * aspectRatio;
    
    // Shadow Helper
    const applyShadow = (blur = 40, y = 20) => {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = blur;
      ctx.shadowOffsetY = y;
    };

    // --- No Frame (fullpage/viewport without device) ---
    if (deviceId === 'none') {
      ctx.save();
      applyShadow(30, 10);
      // Constrain height to fit in canvas (fix fullpage overflow)
      const maxH = 900; // Leave some margin from 1080 canvas height
      if (h > maxH) {
        const scale = maxH / h;
        h = maxH;
        width = width * scale;
      }
      ctx.drawImage(img, cx - width/2, cy - h/2, width, h);
      ctx.restore();
      return;
    }

    // --- Browser ---
    if (isBrowser) {
      const barHeight = 40;
      h = h + barHeight;
      ctx.save();
      applyShadow(50, 25);
      
      // Window Frame
      ctx.fillStyle = deviceId === 'browser-light' ? '#ffffff' : '#1a1a1a';
      roundRect(ctx, cx - width/2, cy - h/2, width, h, 12);
      ctx.fill();
      
      // Top Bar
      ctx.fillStyle = deviceId === 'browser-light' ? '#f1f3f4' : '#2d2e31';
      roundRect(ctx, cx - width/2, cy - h/2, width, barHeight, {tl: 12, tr: 12, bl: 0, br: 0});
      ctx.fill();
      
      // Dots
      const dotColors = ['#ff5f56', '#ffbd2e', '#27c93f'];
      dotColors.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx - width/2 + 20 + (i * 20), cy - h/2 + 20, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      
      // Image
      ctx.drawImage(img, cx - width/2, cy - h/2 + barHeight, width, h - barHeight);
      
      // Border
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      roundRect(ctx, cx - width/2, cy - h/2, width, h, 12);
      ctx.stroke();
      
      ctx.restore();
      return;
    }

    // --- Laptop ---
    if (isLaptop) {
      h = width * 0.65; 
      const bezel = width * 0.03;
      ctx.save();
      applyShadow(60, 30);
      
      // Lid
      ctx.fillStyle = '#1c1c1e';
      roundRect(ctx, cx - width/2, cy - h/2, width, h, 12);
      ctx.fill();
      
      // Screen
      ctx.drawImage(img, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2 - 10);
      
      // Base
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#2c2c2e';
      ctx.beginPath();
      ctx.moveTo(cx - width/2 + 20, cy + h/2);
      ctx.lineTo(cx + width/2 - 20, cy + h/2);
      ctx.lineTo(cx + width/2 + 40, cy + h/2 + 15);
      ctx.lineTo(cx - width/2 - 40, cy + h/2 + 15);
      ctx.fill();
      
      // Notch Detail
      ctx.fillStyle = '#000';
      roundRect(ctx, cx - 40, cy - h/2 + bezel, 80, 10, {tl: 0, tr: 0, bl: 5, br: 5});
      ctx.fill();
      
      ctx.restore();
    }
    // --- iMac ---
    else if (isIMac) {
      h = width * 0.62; // iMac aspect ratio
      const bezel = width * 0.02; // Thin bezels
      const chinHeight = width * 0.04; // Signature iMac chin
      const standWidth = width * 0.25;
      const standHeight = width * 0.08;
      
      ctx.save();
      applyShadow(60, 30);
      
      // Main display body
      ctx.fillStyle = '#e5e5e7'; // Silver aluminum
      roundRect(ctx, cx - width/2, cy - h/2 - chinHeight/2, width, h + chinHeight, 20);
      ctx.fill();
      
      // Screen (black border then image)
      ctx.fillStyle = '#000';
      roundRect(ctx, cx - width/2 + bezel, cy - h/2 - chinHeight/2 + bezel, width - bezel*2, h - bezel, 10);
      ctx.fill();
      
      // Image on screen
      ctx.save();
      roundRect(ctx, cx - width/2 + bezel*2, cy - h/2 - chinHeight/2 + bezel*2, width - bezel*4, h - bezel*3, 6);
      ctx.clip();
      ctx.drawImage(img, cx - width/2 + bezel*2, cy - h/2 - chinHeight/2 + bezel*2, width - bezel*4, h - bezel*3);
      ctx.restore();
      
      // Chin (Apple logo area)
      ctx.fillStyle = '#d1d1d6';
      roundRect(ctx, cx - width/2, cy + h/2 - chinHeight/2 - bezel, width, chinHeight + bezel, {tl: 0, tr: 0, bl: 20, br: 20});
      ctx.fill();
      
      // Stand
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#c7c7cc';
      ctx.beginPath();
      ctx.moveTo(cx - standWidth/2, cy + h/2 + chinHeight/2);
      ctx.lineTo(cx + standWidth/2, cy + h/2 + chinHeight/2);
      ctx.lineTo(cx + standWidth*0.7, cy + h/2 + chinHeight/2 + standHeight);
      ctx.lineTo(cx - standWidth*0.7, cy + h/2 + chinHeight/2 + standHeight);
      ctx.closePath();
      ctx.fill();
      
      // Stand base
      ctx.fillStyle = '#b8b8bd';
      ctx.beginPath();
      ctx.ellipse(cx, cy + h/2 + chinHeight/2 + standHeight + 5, standWidth*0.8, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    }
    // --- Desktop PC Monitor ---
    else if (isDesktop) {
      h = width * 0.6; // Monitor aspect ratio (16:10 ish)
      const bezel = width * 0.025;
      const standNeckWidth = width * 0.08;
      const standNeckHeight = width * 0.1;
      const standBaseWidth = width * 0.35;
      
      ctx.save();
      applyShadow(50, 25);
      
      // Monitor body
      ctx.fillStyle = '#2c2c2e'; // Dark gray
      roundRect(ctx, cx - width/2, cy - h/2, width, h, 8);
      ctx.fill();
      
      // Screen border
      ctx.fillStyle = '#000';
      roundRect(ctx, cx - width/2 + bezel/2, cy - h/2 + bezel/2, width - bezel, h - bezel*1.5, 4);
      ctx.fill();
      
      // Image on screen
      ctx.save();
      roundRect(ctx, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2.5, 2);
      ctx.clip();
      ctx.drawImage(img, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2.5);
      ctx.restore();
      
      // Stand neck
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#3c3c3e';
      ctx.fillRect(cx - standNeckWidth/2, cy + h/2, standNeckWidth, standNeckHeight);
      
      // Stand base
      ctx.fillStyle = '#2c2c2e';
      ctx.beginPath();
      ctx.ellipse(cx, cy + h/2 + standNeckHeight + 5, standBaseWidth/2, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    }
    // --- Phone ---
    else if (isPhone) {
      // Fixed aspect ratio for phone (more realistic, fits better)
      h = Math.min(width * 2.0, 850); // Max height to fit in canvas
      // Adjust width if height was capped
      if (h === 850) width = h / 2.0;
      
      const radius = width * 0.12;
      const bezel = width * 0.04;
      
      ctx.save();
      applyShadow(50, 25);
      
      // Frame
      ctx.fillStyle = '#1c1c1e';
      roundRect(ctx, cx - width/2, cy - h/2, width, h, radius);
      ctx.fill();
      
      // Screen
      ctx.save();
      roundRect(ctx, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2, radius - 5);
      ctx.clip();
      ctx.drawImage(img, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2);
      ctx.restore();
      
      // Dynamic Island
      ctx.fillStyle = 'black';
      roundRect(ctx, cx - width*0.15, cy - h/2 + bezel*0.6, width*0.3, 22, 11);
      ctx.fill();
      
      ctx.restore();
    }
    else { // Tablet
      h = width * 1.33; 
      const radius = 30;
      const bezel = 20;
       
      ctx.save();
      applyShadow(50, 25);
      
      ctx.fillStyle = '#1c1c1e';
      roundRect(ctx, cx - width/2, cy - h/2, width, h, radius);
      ctx.fill();
       
      ctx.save();
      roundRect(ctx, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2, radius - 5);
      ctx.clip();
      ctx.drawImage(img, cx - width/2 + bezel, cy - h/2 + bezel, width - bezel*2, h - bezel*2);
      ctx.restore();
      
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, width, height, radius) {
    if (typeof radius === 'undefined') radius = 0;
    if (typeof radius === 'number') {
      radius = {tl: radius, tr: radius, br: radius, bl: radius};
    } else {
      radius = Object.assign({tl: 0, tr: 0, br: 0, bl: 0}, radius);
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
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    
    overlay.innerHTML = `
      <div class="showcase-ui" style="width:100%;max-width:800px;height:auto;max-height:90vh;background:#0f0f12;border-radius:20px;box-shadow:0 30px 60px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
        <div class="showcase-header" style="padding:24px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;font-size:1.4rem;color:white;display:flex;align-items:center;gap:12px;">
            <span style="background:var(--accent);width:4px;height:20px;border-radius:2px;"></span>
            Batch Website Capture
          </h2>
          <button class="modal-close" style="background:none;border:none;color:white;font-size:1.8rem;cursor:pointer;opacity:0.6;transition:0.2s;">&times;</button>
        </div>
        
        <div class="showcase-body" style="flex:1;overflow-y:auto;padding:32px;">
          <!-- STAGE 1: Input -->
          <div id="batch-stage-input">
            <h3 style="margin:0 0 12px 0;font-size:0.9rem;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px;">Enter URLs</h3>
            <p style="font-size:0.85rem;color:rgba(255,255,255,0.4);margin-bottom:16px;">Enter one URL per line. We'll automatically verify them.</p>
            <textarea id="batch-urls" placeholder="example.com\nhttps://google.com\n..." 
              style="width:100%;height:150px;background:#16161a;border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:white;padding:16px;font-family:monospace;font-size:0.9rem;resize:none;outline:none;transition:0.3s;"></textarea>
            
            <div style="display:flex;justify-content:flex-end;margin-top:20px;">
              <button class="btn btn-primary" id="btn-parse-urls">Next: Verify & Select</button>
            </div>
          </div>

          <!-- STAGE 2: Verification & Config -->
          <div id="batch-stage-config" style="display: none;">
            <div class="batch-controls">
              <div style="flex: 2;">
                 <h3 style="margin:0 0 8px 0;font-size:0.85rem;color:rgba(255,255,255,0.5);">Select Targets</h3>
                 <div style="display:flex;gap:12px;margin-bottom:12px;">
                   <button class="text-btn" id="btn-batch-select-all">Select All</button>
                   <button class="text-btn" id="btn-batch-select-none">Clear</button>
                 </div>
              </div>
            </div>

            <div class="url-list-container" id="url-list">
              <!-- URLs will appear here -->
            </div>

            <div style="margin-top:24px; display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
              <div>
                <h3 style="margin:0 0 8px 0;font-size:0.8rem;color:rgba(255,255,255,0.4);">Device</h3>
                <select id="batch-device" class="minimal-select" style="width:100%;">
                  <option value="desktop">🖥️ Desktop</option>
                  <option value="mobile">📱 Mobile</option>
                  <option value="tablet">📲 Tablet</option>
                </select>
              </div>
              <div>
                <h3 style="margin:0 0 8px 0;font-size:0.8rem;color:rgba(255,255,255,0.4);">Type</h3>
                <select id="batch-type" class="minimal-select" style="width:100%;">
                  <option value="viewport">Viewport</option>
                  <option value="fullpage">Full Page</option>
                </select>
              </div>
              <div>
                <h3 style="margin:0 0 8px 0;font-size:0.8rem;color:rgba(255,255,255,0.4);">Delay</h3>
                <select id="batch-delay" class="minimal-select" style="width:100%;">
                  <option value="0">None</option>
                  <option value="2000">2s</option>
                  <option value="3000" selected>3s</option>
                  <option value="5000">5s</option>
                </select>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;margin-top:32px;align-items:center;">
              <button class="text-btn" id="btn-batch-back">← Back</button>
              <button class="btn btn-primary" id="btn-start-batch-capture">🚀 Start Capture</button>
            </div>
          </div>

          <!-- STAGE 3: Progress -->
          <div id="batch-stage-progress" style="display: none;">
             <div style="text-align:center;margin-bottom:24px;">
               <h2 id="batch-status-title">Processing...</h2>
               <p id="batch-status-sub" style="color:var(--text-dim);font-size:0.9rem;">Please keep this tab open</p>
             </div>
             
             <div class="progress-bar" style="background:rgba(255,255,255,0.05);height:12px;border-radius:6px;overflow:hidden;margin-bottom:12px;">
               <div id="batch-progress-fill" style="width:0%;height:100%;background:var(--accent-gradient);transition:width 0.4s cubic-bezier(0.4, 0, 0.2, 1);"></div>
             </div>
             
             <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-dim);margin-bottom:24px;">
                <span id="batch-progress-text">0/0 Complete</span>
                <span id="batch-percentage">0%</span>
             </div>

             <div class="batch-log" id="batch-log" style="height:200px;overflow-y:auto;background:rgba(0,0,0,0.3);border-radius:12px;padding:16px;font-family:monospace;font-size:0.8rem;border:1px solid rgba(255,255,255,0.05);">
             </div>

             <div style="display:flex;justify-content:center;margin-top:24px;">
               <button class="btn btn-secondary" id="btn-close-batch" style="display:none;">Close Gallery</button>
             </div>
          </div>
        </div>
      </div>
    `;

    // Elements
    const stageInput = overlay.querySelector('#batch-stage-input');
    const stageConfig = overlay.querySelector('#batch-stage-config');
    const stageProgress = overlay.querySelector('#batch-stage-progress');
    
    const urlsTextarea = overlay.querySelector('#batch-urls');
    const urlList = overlay.querySelector('#url-list');
    const log = overlay.querySelector('#batch-log');
    
    const btnParse = overlay.querySelector('#btn-parse-urls');
    const btnBack = overlay.querySelector('#btn-batch-back');
    const btnStart = overlay.querySelector('#btn-start-batch-capture');
    const btnClose = overlay.querySelector('#btn-close-batch');
    const btnSelectAll = overlay.querySelector('#btn-batch-select-all');
    const btnSelectNone = overlay.querySelector('#btn-batch-select-none');
    
    // Config values
    const deviceSelect = overlay.querySelector('#batch-device');
    const typeSelect = overlay.querySelector('#batch-type');
    const delaySelect = overlay.querySelector('#batch-delay');

    // Progress
    const progressFill = overlay.querySelector('#batch-progress-fill');
    const progressText = overlay.querySelector('#batch-progress-text');
    const percentageText = overlay.querySelector('#batch-percentage');
    const statusTitle = overlay.querySelector('#batch-status-title');

    let processedUrls = [];

    // Close logic
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    // Stage Transitions
    btnParse.onclick = () => {
      const urls = urlsTextarea.value.split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 0)
        .map(u => {
          if (!u.startsWith('http')) u = 'https://' + u;
          try { return new URL(u).href; } catch(e) { return null; }
        })
        .filter(u => u !== null);

      if (urls.length === 0) {
        alert('Please enter some valid URLs');
        return;
      }

      processedUrls = [...new Set(urls)]; // De-duplicate
      renderUrlList();
      stageInput.style.display = 'none';
      stageConfig.style.display = 'block';
    };

    btnBack.onclick = () => {
      stageConfig.style.display = 'none';
      stageInput.style.display = 'block';
    };

    function renderUrlList() {
      urlList.innerHTML = processedUrls.map((url, i) => `
        <div class="url-item">
          <input type="checkbox" class="url-item-checkbox" data-index="${i}" checked>
          <span class="url-item-text" title="${url}">${url}</span>
          <span class="url-item-status pending">Pending</span>
        </div>
      `).join('');
    }

    btnSelectAll.onclick = () => {
      urlList.querySelectorAll('.url-item-checkbox').forEach(cb => cb.checked = true);
    };

    btnSelectNone.onclick = () => {
      urlList.querySelectorAll('.url-item-checkbox').forEach(cb => cb.checked = false);
    };

    function addLog(msg, type = 'info') {
      const div = document.createElement('div');
      div.style.marginBottom = '4px';
      div.style.color = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#94a3b8';
      div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    btnStart.onclick = async () => {
      const selectedCheckboxes = Array.from(urlList.querySelectorAll('.url-item-checkbox:checked'));
      if (selectedCheckboxes.length === 0) {
        alert('Select at least one URL to capture');
        return;
      }

      const tasks = selectedCheckboxes.map(cb => {
        const idx = parseInt(cb.dataset.index);
        return {
          url: processedUrls[idx],
          index: idx,
          el: cb.closest('.url-item')
        };
      });

      const device = deviceSelect.value;
      const type = typeSelect.value;
      const delay = parseInt(delaySelect.value);
      const typeKey = `${device}-${type}`;

      stageConfig.style.display = 'none';
      stageProgress.style.display = 'block';
      addLog(`Starting batch capture of ${tasks.length} target(s)...`);

      let completed = 0;
      let success = 0;

      for (let task of tasks) {
        const statusEl = task.el.querySelector('.url-item-status');
        statusEl.textContent = 'Capture...';
        statusEl.className = 'url-item-status pending';
        
        addLog(`Capturing ${new URL(task.url).hostname}...`);

        try {
          const response = await chrome.runtime.sendMessage({
            action: 'batchCaptureUrl',
            url: task.url,
            type: typeKey,
            delay: delay
          });

          if (response && response.success) {
            statusEl.textContent = 'DONE';
            statusEl.className = 'url-item-status success';
            addLog(`✓ Saved: ${new URL(task.url).hostname}`, 'success');
            success++;
          } else {
            statusEl.textContent = 'ERROR';
            statusEl.className = 'url-item-status error';
            addLog(`✗ Failed: ${new URL(task.url).hostname} (${response?.error || 'Unknown'})`, 'error');
          }
        } catch (err) {
          statusEl.textContent = 'FAIL';
          statusEl.className = 'url-item-status error';
          addLog(`!! Error: ${err.message}`, 'error');
        }

        completed++;
        const pct = Math.round((completed / tasks.length) * 100);
        progressFill.style.width = `${pct}%`;
        progressText.textContent = `${completed}/${tasks.length} Complete`;
        percentageText.textContent = `${pct}%`;

        // Small break between captures
        if (completed < tasks.length) await new Promise(r => setTimeout(r, 1000));
      }

      statusTitle.textContent = 'Batch Process Complete';
      addLog(`Work finished. Success: ${success}, Failed: ${tasks.length - success}`);
      btnClose.style.display = 'inline-flex';
      btnClose.onclick = () => {
        loadScreenshots();
        close();
      };
    };

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

  async update(screenshot) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(screenshot);
      
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