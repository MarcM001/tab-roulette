// offscreen.js - Cleanup Removed

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'play_sound') {
    playSound(message.source, message.volume);
    // No sendResponse needed here usually
  }
  // Return false as we are not responding asynchronously here
  return false;
});

// Function to play sound
function playSound(sourceUrl, volume = 1.0) {
  // Create an Audio object
  const audio = new Audio(sourceUrl);
  audio.volume = volume;

  console.log(`Offscreen: Attempting to play ${sourceUrl} at volume ${volume}`);

  // Attempt to play the audio
  audio.play().catch(error => {
    // Handles errors during the *initialization* of playback
    console.error(`Offscreen Audio PLAY() initiation error for ${sourceUrl}:`, error);
  });

  // Add event listener for when playback finishes successfully
  audio.addEventListener('ended', () => {
      console.log(`Offscreen audio finished playing successfully: ${sourceUrl}`);
      // audio.src = ''; // <<< REMOVED THIS LINE
  }, { once: true }); // Ensure the listener is removed after firing once

   // Add event listener specifically for errors during loading or decoding
   audio.addEventListener('error', (e) => {
        const mediaError = audio.error;
        // Avoid logging the "Empty src" error if it was likely caused by our own cleanup (which is now removed)
        // However, other genuine errors might still occur.
        if (mediaError && mediaError.message && !mediaError.message.includes("Empty src attribute")) {
            let errorCode = mediaError.code;
            let errorMessage = mediaError.message;
            console.error(`Offscreen Audio Error event for ${sourceUrl}. Code: ${errorCode}, Message: "${errorMessage}"`, e);
        } else if (mediaError) {
             // Optionally log that we suppressed the known empty src error
             // console.log(`Offscreen: Suppressed known 'Empty src' error for ${sourceUrl}`);
        }
        // audio.src = ''; // <<< REMOVED THIS LINE
   }, { once: true }); // Ensure the listener is removed after firing once
}

console.log("Offscreen script loaded and listening (Cleanup Removed Version).");