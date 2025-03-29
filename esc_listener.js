// Content script injected temporarily to listen for the Escape key

console.log("Tab Roulette: Escape listener active.");

// Define the listener function
function handleEscapeKey(event) {
    if (event.key === "Escape") {
        console.log("Tab Roulette: Escape key pressed. Sending cancel message.");
        // Stop the event from propagating further if needed
        // event.stopPropagation();
        // event.preventDefault();

        // Send message to background script to cancel the roulette
        chrome.runtime.sendMessage({ command: "cancel_roulette" }, (response) => {
            if (chrome.runtime.lastError) {
                console.log("Tab Roulette: Error sending cancel message:", chrome.runtime.lastError.message);
            } else {
                console.log("Tab Roulette: Cancel message acknowledged by background:", response);
                // Once cancelled, remove this listener
                cleanupListener();
            }
        });
    }
}

// Define the cleanup function
function cleanupListener() {
    console.log("Tab Roulette: Removing escape listener.");
    document.removeEventListener('keydown', handleEscapeKey, true); // Use capture phase for reliability
    // Remove the message listener as well
    chrome.runtime.onMessage.removeListener(handleBackgroundMessage);
}

// Listen for messages from the background script (e.g., to self-destruct)
function handleBackgroundMessage(message, sender, sendResponse) {
    if (message.command === "cleanup_listener") {
        cleanupListener();
        sendResponse({ status: "listener removed" });
    }
    return true; // Keep message channel open for async response if needed
}

// Add the listeners
document.addEventListener('keydown', handleEscapeKey, true); // Use capture phase
chrome.runtime.onMessage.addListener(handleBackgroundMessage);

// Optional: Set a timeout to auto-remove if the background script somehow fails
// to send the cleanup message (e.g., after 30 seconds)
// setTimeout(cleanupListener, 30000); // Adjust time as needed