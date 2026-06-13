// c:\Users\iyand\Downloads\Janhit\src\extension\popup\popup.js

let isListening = false;

document.addEventListener('DOMContentLoaded', () => {
  const voiceBtn = document.getElementById('voice-btn');

  voiceBtn.addEventListener('click', toggleVoiceControl);

  registerKeyboardShortcuts();
  updateVoiceUi();
});

function toggleVoiceControl() {
  if (!isListening) {
    startVoiceControl();
  } else {
    stopVoiceControl();
  }
}

function startVoiceControl() {
  isListening = true;
  updateVoiceUi();
  console.log('Voice control started');
}

function stopVoiceControl() {
  isListening = false;
  updateVoiceUi();
  console.log('Voice control stopped');
}

function registerKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isWindows = navigator.platform.toUpperCase().indexOf('WIN') >= 0;

    if (isWindows && e.ctrlKey && e.altKey && !e.shiftKey) {
      e.preventDefault();
      toggleVoiceControl();
    }

    if (isMac && e.ctrlKey && e.altKey && !e.shiftKey) {
      e.preventDefault();
      toggleVoiceControl();
    }
  });
}

function updateVoiceUi() {
  const voiceBtn = document.getElementById('voice-btn');
  const statusDiv = document.getElementById('status');
  const toggleLabel = document.getElementById('toggle-label');

  if (isListening) {
    voiceBtn.classList.add('listening');
    toggleLabel.textContent = 'Voice ON';
    statusDiv.textContent = 'Listening. Click again or hold the shortcut to turn voice control off.';
    return;
  }

  voiceBtn.classList.remove('listening');
  toggleLabel.textContent = 'Voice OFF';
  statusDiv.textContent = 'Click the button or hold the shortcut to toggle voice control.';
}
