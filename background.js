// background.js - Complete Code (with improved icon error logging)

// --- Global State ---
let isSpinning = false;
let currentSpinTimeoutId = null;
let activeTabs = []; // This will hold the SHUFFLED tabs during a spin
let escapeListenerInjectedTabId = null;
const defaultIconPath = "icons/roulette-48.png"; // Your default extension icon
const defaultFavicon = "images/default-favicon.png"; // Icon for tabs without a valid one
const TICK_SOUND_PATH = 'sounds/tick.mp3'; // Ensure this matches your final audio file
const POOF_SOUND_PATH = 'sounds/poof.mp3'; // Ensure this matches your final audio file
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// --- Offscreen Audio Control ---
let creatingOffscreenDocument = null; // Promise to prevent race conditions

// Function to ensure the offscreen document is available
async function hasOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    }).catch(() => []);
    return existingContexts.length > 0;
}

// Function to set up the offscreen document if needed
async function setupOffscreenDocument() {
    if (creatingOffscreenDocument) {
        await creatingOffscreenDocument;
        return;
    }
    if (await hasOffscreenDocument()) {
        return;
    }
    console.log("Tab Roulette: Creating offscreen document.");
    creatingOffscreenDocument = chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Needed to play notification sounds (tick, poof)',
    });
    try {
        await creatingOffscreenDocument;
        console.log("Tab Roulette: Offscreen document created successfully.");
    } catch (error) {
        console.error("Tab Roulette: Failed to create offscreen document:", error);
        throw error; // Propagate error
    } finally {
        creatingOffscreenDocument = null;
    }
}

// Function to send play command to offscreen document
async function playSoundOffscreen(soundPath, volume) {
    try {
        await setupOffscreenDocument(); // Ensure document exists
        await chrome.runtime.sendMessage({
            command: 'play_sound',
            source: chrome.runtime.getURL(soundPath),
            volume: volume
        });
    } catch (error) {
        // Handle common errors gracefully
        if (error.message?.includes("Could not establish connection") || error.message?.includes("Receiving end does not exist")) {
             console.warn(`Tab Roulette: Connection to offscreen document failed (might be closing/recreating). Retrying sound: ${soundPath}`);
             setTimeout(() => playSoundOffscreen(soundPath, volume), 150); // Simple retry
        } else if (error.message?.includes("Error handling response")) {
             console.warn(`Tab Roulette: Error handling response from offscreen for ${soundPath}. It might still play.`);
        } else {
            console.error(`Tab Roulette: Error sending message to offscreen document for ${soundPath}:`, error);
             // Attempt cleanup if possible
             if (chrome.offscreen && typeof chrome.offscreen.closeDocument === 'function') {
                 await chrome.offscreen.closeDocument().catch(() => {});
                 creatingOffscreenDocument = null;
             }
        }
    }
}

// --- Utility Function ---

// Fisher-Yates (aka Knuth) Shuffle Algorithm
function shuffleArray(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// --- Core Logic ---

// Listen for the extension icon click
chrome.action.onClicked.addListener((tab) => {
  if (isSpinning) {
    console.log("Tab Roulette: Already spinning.");
    return;
  }
  // Ensure offscreen doc setup before starting
  setupOffscreenDocument().then(() => {
      startRoulette(tab.windowId);
  }).catch(err => {
      console.error("Tab Roulette: Failed initial offscreen setup. Sound may not work.", err);
      startRoulette(tab.windowId); // Proceed without guaranteed sound
  });
});

// Listen for messages (e.g., from escape listener)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "cancel_roulette" && isSpinning) {
    console.log("Tab Roulette: Cancel request received.");
    cancelSpin();
    sendResponse({ status: "cancelled" });
    return true; // Acknowledge message
  }
  return false; // No async response needed for other messages
});

// Function to start the roulette spin
async function startRoulette(windowId) {
  console.log("Tab Roulette: Starting spin...");
  isSpinning = true;

  try {
    // 1. Get & Filter Tabs
    let tabs = await chrome.tabs.query({ currentWindow: true });
    let potentialTabs = tabs.filter(tab => tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:'));

    // 2. Check Count
    if (potentialTabs.length <= 1) {
      console.log("Tab Roulette: Not enough tabs to play.");
      isSpinning = false;
      chrome.action.setTitle({ title: "Not enough tabs!" });
      chrome.action.setIcon({ path: defaultIconPath }).catch(()=>{});
      setTimeout(() => chrome.action.setTitle({ title: "Tab Roulette" }), 2000);
      return;
    }

    // 3. Shuffle Tabs
    activeTabs = shuffleArray(potentialTabs);
    console.log("Tab Roulette: Tab order shuffled for selection.");

    // 4. Inject Escape Listener
    escapeListenerInjectedTabId = null;
    try {
        const [activeTabForListener] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTabForListener?.id && activeTabForListener.url && !activeTabForListener.url.startsWith('chrome://') && !activeTabForListener.url.startsWith('about:')) {
            escapeListenerInjectedTabId = activeTabForListener.id;
            await chrome.scripting.executeScript({
                target: { tabId: activeTabForListener.id },
                files: ['esc_listener.js'],
            });
            console.log("Tab Roulette: Escape listener injected into tab", activeTabForListener.id);
        } else {
            console.warn("Tab Roulette: Active tab not suitable for injecting escape listener.");
        }
    } catch (err) {
        console.warn("Tab Roulette: Could not inject escape listener script.", err);
        escapeListenerInjectedTabId = null;
    }

    // 5. Setup Spin Parameters
    const durationMs = (Math.random() * (7 - 4) + 4) * 1000; // 4-7 seconds
    const startTime = Date.now();
    let currentTabIndex = 0; // Index for VISUAL animation loop
    const initialDelay = 50; // ms
    const finalDelayMultiplier = 8;

    console.log(`Tab Roulette: Spin duration ${durationMs / 1000}s`);

    // --- Animation Loop ---
    function spinStep() {
      if (!isSpinning) {
          console.log("Tab Roulette: Spin cancelled during step execution.");
          return;
      }

      const elapsedTime = Date.now() - startTime;

      if (elapsedTime >= durationMs) {
        stopSpin(currentTabIndex); // Land on the current tab index
        return;
      }

      const progress = elapsedTime / durationMs;
      const easedProgress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic
      const currentDelay = initialDelay + (initialDelay * finalDelayMultiplier - initialDelay) * easedProgress;

      // --- Visual Update ---
      const tabToShow = activeTabs[currentTabIndex];
      // Check favIconUrl validity more carefully
      const iconPath = tabToShow.favIconUrl && (tabToShow.favIconUrl.startsWith('http:') || tabToShow.favIconUrl.startsWith('https:'))
                       ? tabToShow.favIconUrl
                       : defaultFavicon;

      // Update extension icon with improved error logging
      chrome.action.setIcon({ path: iconPath })
        .catch(err => {
            // *** IMPROVED LOGGING HERE ***
            if (iconPath !== defaultFavicon) {
                 // Log failure only if we tried a real favicon URL
                 console.warn(`Tab Roulette: Failed to set icon path "${iconPath}". Using default. Error: ${err.message || err}`);
            } else {
                 // Log if even the default icon path failed (unlikely but possible)
                 console.error(`Tab Roulette: Failed to set default icon "${defaultFavicon}". Error: ${err.message || err}`);
            }
            // *** END IMPROVED LOGGING ***

            // Fallback attempt: Set to the guaranteed default icon path
            chrome.action.setIcon({ path: defaultIconPath }) // Use the manifest default icon path
              .catch(e => console.error("Tab Roulette: CRITICAL - Failed to set fallback default icon.", e)); // Log if even this fails
        });

      chrome.action.setTitle({ title: `On: ${tabToShow.title || 'Untitled Tab'}` });

      // Play tick sound
      playSoundOffscreen(TICK_SOUND_PATH, 0.5);

      // Move to the next tab index for the next visual step
      currentTabIndex = (currentTabIndex + 1) % activeTabs.length;

      // Schedule the next step
      currentSpinTimeoutId = setTimeout(spinStep, Math.max(currentDelay, 10));
    } // End of spinStep

    // Start the animation
    spinStep();

  } catch (error) {
    console.error("Tab Roulette: Error during spin setup:", error);
    cleanUpSpinState(); // Clean up on error
  }
}

// Function to stop the spin and close the selected tab
function stopSpin(finalTabIndex) {
  console.log("Tab Roulette: Spin finished.");
  clearTimeout(currentSpinTimeoutId);
  currentSpinTimeoutId = null;

  if (!activeTabs || finalTabIndex < 0 || finalTabIndex >= activeTabs.length) {
       console.error("Tab Roulette: Invalid finalTabIndex or activeTabs state in stopSpin.", finalTabIndex, activeTabs);
       cleanUpSpinState();
       return;
  }

  const tabToClose = activeTabs[finalTabIndex]; // Tab selected based on shuffled order

  if (!tabToClose?.id) {
      console.error("Tab Roulette: Invalid target tab object at final index", finalTabIndex, tabToClose);
      cleanUpSpinState();
      return;
  }

  const closedTabTitle = tabToClose.title || "Untitled Tab"; // Capture title before closing
  const closedTabId = tabToClose.id;

  console.log(`Tab Roulette: Landing on Tab ID: ${closedTabId}, Title: "${closedTabTitle}"`);

  playSoundOffscreen(POOF_SOUND_PATH, 0.7); // Play poof sound

  chrome.tabs.remove(closedTabId)
    .then(() => {
      console.log(`Tab Roulette: Closed tab ${closedTabId}`);
      const winMessage = `You win! Bye bye "${closedTabTitle}"`; // Use captured title

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/roulette-128.png',
        title: 'Tab Roulette',
        message: winMessage,
        priority: 2,
      }, (notificationId) => {
        if (notificationId) {
            setTimeout(() => { chrome.notifications.clear(notificationId); }, 2000); // Show for 2s
        }
      });
    })
    .catch(err => {
      console.error(`Tab Roulette: Failed to close tab ${closedTabId} ("${closedTabTitle}")`, err);
      chrome.notifications.create({ // Notify user of failure
        type: 'basic',
        iconUrl: 'icons/roulette-128.png',
        title: 'Tab Roulette Error',
        message: `Could not close tab: "${closedTabTitle}"`,
        priority: 1
      }, (notificationId) => {
        if (notificationId) {
            setTimeout(() => { chrome.notifications.clear(notificationId); }, 3500); // Show error longer
        }
      });
    })
    .finally(() => {
      cleanUpSpinState(); // Clean up state regardless of success/failure
    });
}

// Function to cancel the spin prematurely
function cancelSpin() {
  console.log("Tab Roulette: Cancelling spin via user request.");
  if (!isSpinning) return; // Avoid redundant cleanup

  clearTimeout(currentSpinTimeoutId);
  currentSpinTimeoutId = null;

  cleanUpSpinState(); // Reset state
}

// Common cleanup function
async function cleanUpSpinState() {
  console.log("Tab Roulette: Cleaning up spin state...");
  isSpinning = false;
  activeTabs = [];

  if (currentSpinTimeoutId) { // Ensure timeout cleared
    clearTimeout(currentSpinTimeoutId);
    currentSpinTimeoutId = null;
  }

  // Reset extension UI
  chrome.action.setIcon({ path: defaultIconPath }).catch(e => console.warn("Tab Roulette: Failed reset icon during cleanup", e));
  chrome.action.setTitle({ title: "Tab Roulette" });

  // Clean up escape listener
  if (escapeListenerInjectedTabId !== null) {
     const listenerTabId = escapeListenerInjectedTabId;
     escapeListenerInjectedTabId = null; // Clear immediately
    try {
        await chrome.tabs.get(listenerTabId); // Check if tab still exists
        await chrome.tabs.sendMessage(listenerTabId, { command: "cleanup_listener" });
        console.log("Tab Roulette: Sent cleanup request to content script in tab", listenerTabId);
    } catch (error) {
      // Expected error if tab closed or inaccessible
      // console.warn(`Tab Roulette: Could not send cleanup message to content script in tab ${listenerTabId}.`, error.message);
    }
  }
  console.log("Tab Roulette: Cleanup complete.");
}

// --- Initial Extension Setup ---
chrome.runtime.onStartup.addListener(() => {
  console.log("Tab Roulette: Browser startup.");
  chrome.action.setIcon({ path: defaultIconPath });
  chrome.action.setTitle({ title: "Tab Roulette" });
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log("Tab Roulette: Extension installed/updated.", details.reason);
  chrome.action.setIcon({ path: defaultIconPath });
  chrome.action.setTitle({ title: "Tab Roulette" });
});

console.log("Tab Roulette: Background service worker started/restarted.");