/**
 * Handles the Ravenlost newsletter signup form.
 *
 * Uses a hidden iframe to submit to Apps Script
 * without navigating away from the homepage.
 */
function initializeRavenlostNewsletter() {
  const form = document.getElementById(
    "ravenlost-signup-form"
  );

  const iframe = document.getElementById(
    "ravenlost-signup-target"
  );

  const button = document.getElementById(
    "ravenlost-signup-button"
  );

  const message = document.getElementById(
    "ravenlost-signup-message"
  );

  if (!form || !iframe || !button || !message) {
    return;
  }

  // Prevent duplicate event listeners if MkDocs
  // reinitializes the page during navigation.
  if (form.dataset.initialized === "true") {
    return;
  }

  form.dataset.initialized = "true";

  let submitting = false;

  form.addEventListener("submit", () => {
    submitting = true;

    button.disabled = true;
    button.textContent = "Subscribing...";

    message.hidden = true;
  });

  iframe.addEventListener("load", () => {
    if (!submitting) {
      return;
    }

    submitting = false;
    button.disabled = false;
    button.textContent = "Subscribe";

    message.hidden = false;
    message.textContent =
      "Your request was submitted. " +
      "Please check your inbox for a welcome email.";

    form.reset();
  });
}

// Supports MkDocs Material instant navigation.
if (typeof document$ !== "undefined") {
  document$.subscribe(
    initializeRavenlostNewsletter
  );
} else {
  document.addEventListener(
    "DOMContentLoaded",
    initializeRavenlostNewsletter
  );
}
