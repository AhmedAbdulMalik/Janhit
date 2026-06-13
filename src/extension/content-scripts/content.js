// c:\Users\iyand\Downloads\Janhit\src\extension\content-scripts\content.js

/**
 * Content script for Janhit extension
 * Handles DOM interaction and form autofill
 */

console.log('Janhit content script loaded');

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request);

  if (request.action === 'autofill_form') {
    autofillForm(request.data);
    sendResponse({ success: true });
  } else if (request.action === 'get_form_data') {
    const formData = extractFormData();
    sendResponse({ data: formData });
  }
});

/**
 * Extract form fields from the current page
 */
function extractFormData() {
  const formData = {};
  const inputs = document.querySelectorAll('input[type="text"], textarea, select');

  inputs.forEach((input, index) => {
    formData[`field_${index}`] = {
      name: input.name || input.id || `field_${index}`,
      type: input.type,
      value: input.value,
      placeholder: input.placeholder,
    };
  });

  return formData;
}

/**
 * Autofill form with generated data
 */
function autofillForm(data) {
  try {
    const inputs = document.querySelectorAll('input[type="text"], textarea, select');
    let index = 0;

    inputs.forEach((input) => {
      if (data[`field_${index}`]) {
        input.value = data[`field_${index}`].value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        index++;
      }
    });

    console.log('Form autofilled successfully');
  } catch (error) {
    console.error('Error autofilling form:', error);
  }
}
