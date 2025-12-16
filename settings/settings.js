// Settings Page Script
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  const elements = {
    defaultDelay: $('default-delay'),
    freezeAnimations: $('freeze-animations'),
    hidePreloaders: $('hide-preloaders'),
    enableMockups: $('enable-mockups'),
    mobileMockup: $('mobile-mockup'),
    tabletMockup: $('tablet-mockup'),
    desktopMockup: $('desktop-mockup'),
    mobileWidth: $('mobile-width'),
    mobileHeight: $('mobile-height'),
    tabletWidth: $('tablet-width'),
    tabletHeight: $('tablet-height'),
    autoSave: $('auto-save'),
    alsoDownload: $('also-download'),
    btnSave: $('btn-save'),
    btnReset: $('btn-reset'),
    toast: $('toast')
  };

  // Default settings
  const defaults = {
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

  // Load settings
  function loadSettings() {
    chrome.storage.local.get(['devshot_settings'], (result) => {
      const settings = result.devshot_settings || defaults;
      
      elements.defaultDelay.value = settings.defaultDelay;
      elements.freezeAnimations.checked = settings.freezeAnimations;
      elements.hidePreloaders.checked = settings.hidePreloaders;
      elements.enableMockups.checked = settings.enableMockups;
      elements.mobileMockup.value = settings.mobileMockup;
      elements.tabletMockup.value = settings.tabletMockup;
      elements.desktopMockup.value = settings.desktopMockup;
      elements.mobileWidth.value = settings.mobileWidth;
      elements.mobileHeight.value = settings.mobileHeight;
      elements.tabletWidth.value = settings.tabletWidth;
      elements.tabletHeight.value = settings.tabletHeight;
      elements.autoSave.checked = settings.autoSave;
      elements.alsoDownload.checked = settings.alsoDownload;
      
      updateMockupSelects();
    });
  }

  // Save settings
  function saveSettings() {
    const settings = {
      defaultDelay: parseInt(elements.defaultDelay.value),
      freezeAnimations: elements.freezeAnimations.checked,
      hidePreloaders: elements.hidePreloaders.checked,
      enableMockups: elements.enableMockups.checked,
      mobileMockup: elements.mobileMockup.value,
      tabletMockup: elements.tabletMockup.value,
      desktopMockup: elements.desktopMockup.value,
      mobileWidth: parseInt(elements.mobileWidth.value),
      mobileHeight: parseInt(elements.mobileHeight.value),
      tabletWidth: parseInt(elements.tabletWidth.value),
      tabletHeight: parseInt(elements.tabletHeight.value),
      autoSave: elements.autoSave.checked,
      alsoDownload: elements.alsoDownload.checked
    };

    chrome.storage.local.set({ devshot_settings: settings }, () => {
      showToast('Settings saved!');
    });
  }

  // Reset to defaults
  function resetSettings() {
    chrome.storage.local.set({ devshot_settings: defaults }, () => {
      loadSettings();
      showToast('Reset to defaults!');
    });
  }

  // Toggle mockup selects
  function updateMockupSelects() {
    const enabled = elements.enableMockups.checked;
    elements.mobileMockup.disabled = !enabled;
    elements.tabletMockup.disabled = !enabled;
    elements.desktopMockup.disabled = !enabled;
  }

  // Show toast
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 2000);
  }

  // Events
  elements.enableMockups.addEventListener('change', updateMockupSelects);
  elements.btnSave.addEventListener('click', saveSettings);
  elements.btnReset.addEventListener('click', resetSettings);

  // Init
  loadSettings();
});
