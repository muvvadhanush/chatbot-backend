/**
 * Content Sanitizer for Behavior Tuning Documents
 * 
 * Strips prompt injection patterns, HTML, and malicious content
 * before passing to AI for classification and signal extraction.
 */

// Known prompt injection patterns to strip
const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+(instructions?|rules?|prompts?)/gi,
    /you\s+are\s+now\s+a/gi,
    /forget\s+(everything|all|your)\s+(you|previous)/gi,
    /disregard\s+(all\s+)?previous/gi,
    /override\s+(system|safety|rules?)/gi,
    /act\s+as\s+(if\s+you\s+are|a)\s/gi,
    /pretend\s+(you\s+are|to\s+be)/gi,
    /new\s+instructions?:/gi,
    /system\s*prompt\s*:/gi,
    /\[SYSTEM\]/gi,
    /\[INST\]/gi,
    /<<SYS>>/gi,
    /<<\/SYS>>/gi,
];

// HTML/script tag patterns
const HTML_PATTERNS = [
    /<script[\s\S]*?<\/script>/gi,
    /<style[\s\S]*?<\/style>/gi,
    /<\/?[a-z][^>]*>/gi,
    /&[a-z]+;/gi,
    /&#\d+;/gi,
];

const MAX_TEXT_LENGTH = 1024 * 1024; // 1MB cap
const MIN_TEXT_LENGTH = 50;          // Minimum useful content

/**
 * Sanitize document text for safe AI processing.
 * @param {string} rawText - Raw extracted text
 * @returns {{ text: string, warnings: string[] }} Sanitized text and any warnings
 */
function sanitize(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return { text: '', warnings: ['Empty or invalid input'] };
    }

    const warnings = [];
    let text = rawText;

    // 1. Cap length
    if (text.length > MAX_TEXT_LENGTH) {
        text = text.slice(0, MAX_TEXT_LENGTH);
        warnings.push(`Content truncated to ${MAX_TEXT_LENGTH} characters`);
    }

    // 2. Strip HTML tags and entities
    for (const pattern of HTML_PATTERNS) {
        text = text.replace(pattern, ' ');
    }

    // 3. Strip prompt injection patterns
    for (const pattern of INJECTION_PATTERNS) {
        const before = text;
        text = text.replace(pattern, '[REDACTED]');
        if (text !== before) {
            warnings.push(`Prompt injection pattern detected and redacted`);
        }
    }

    // 4. Normalize whitespace
    text = text
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, ' ')
        .replace(/ {3,}/g, '  ')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();

    // 5. Minimum content check
    if (text.length < MIN_TEXT_LENGTH) {
        warnings.push(`Content too short (${text.length} chars, minimum ${MIN_TEXT_LENGTH})`);
    }

    return { text, warnings };
}

module.exports = { sanitize, MAX_TEXT_LENGTH, MIN_TEXT_LENGTH };
