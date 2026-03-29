import DOMPurify from 'dompurify';

/**
 * Clean user input to prevent XSS and basic injection attacks.
 * @param {string} input - The raw user input.
 * @returns {string} - The sanitized input.
 */
export const sanitizeInput = (input) => {
  if (!input) return '';
  // Basic DOM purification to remove potential scripts or bad tags
  let clean = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [], // No HTML allowed for text inputs like names/emails
    ALLOWED_ATTR: []
  });

  // Also trim whitespace to avoid blank submissions
  return clean.trim();
};
