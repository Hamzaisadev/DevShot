// DevShot Content Script
// Handles page interactions and DOM measurements

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getPageDimensions') {
    const dimensions = getPageDimensions();
    sendResponse(dimensions);
  }
  
  if (message.action === 'scrollTo') {
    window.scrollTo(0, message.y);
    sendResponse({ success: true });
  }
  
  if (message.action === 'hideFloatingElements') {
    hideFloatingElements();
    sendResponse({ success: true });
  }
  
  if (message.action === 'restoreFloatingElements') {
    restoreFloatingElements();
    sendResponse({ success: true });
  }
  
  return true;
});

// Get page dimensions
function getPageDimensions() {
  return {
    scrollHeight: Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ),
    scrollWidth: Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth
    ),
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio,
    scrollX: window.scrollX,
    scrollY: window.scrollY
  };
}

// Store original styles for floating elements
let originalStyles = new Map();

// Hide floating elements (position: fixed/sticky)
function hideFloatingElements() {
  const selectors = [
    '[style*="position: fixed"]',
    '[style*="position:fixed"]',
    '[style*="position: sticky"]',
    '[style*="position:sticky"]'
  ];
  
  // Get all elements with fixed/sticky positioning
  const allElements = document.querySelectorAll('*');
  
  allElements.forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') {
      // Store original display value
      originalStyles.set(el, {
        opacity: el.style.opacity,
        visibility: el.style.visibility
      });
      
      // Hide element
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
    }
  });
}

// Restore floating elements
function restoreFloatingElements() {
  originalStyles.forEach((styles, el) => {
    el.style.opacity = styles.opacity;
    el.style.visibility = styles.visibility;
  });
  
  originalStyles.clear();
}

// Disable animations
function disableAnimations() {
  const style = document.createElement('style');
  style.id = 'devshot-disable-animations';
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }
  `;
  document.head.appendChild(style);
}

// Enable animations
function enableAnimations() {
  const style = document.getElementById('devshot-disable-animations');
  if (style) {
    style.remove();
  }
}
