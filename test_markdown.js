const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

// Load widget.js content
const widgetCode = fs.readFileSync('./public/widget.js', 'utf8');

// Mock Browser Environment
const dom = new JSDOM(`<!DOCTYPE html><body></body>`);
global.window = dom.window;
global.document = dom.window.document;

// Extract parseMarkdown function (hacky but works for testing without exporting)
// We'll wrap the code in a way that exposes the function or just copy-paste the logic for unit testing 
// Since widget.js is an IIFE, we can't easily import. 
// Plan B: Regex extract the function

const match = widgetCode.match(/function parseMarkdown\(text\) \{([\s\S]*?)\n  \}/);
if (!match) {
    console.error("Could not find parseMarkdown function in widget.js");
    process.exit(1);
}

const parseMarkdownBody = match[1];
const parseMarkdown = new Function('text', parseMarkdownBody);

// Test Cases
const tests = [
    { input: "**Bold**", expected: "<b>Bold</b>" },
    { input: "*Italic*", expected: "<i>Italic</i>" },
    { input: "`code`", expected: '<code class="inline">code</code>' },
    { input: "### Header", expected: "<h3>Header</h3>" },
    { input: "- Item 1", expected: "<li>Item 1</li>" },
    { input: "```js\nconsole.log('hi')\n```", expected: '<pre><div class="code-header">js</div><code class="language-js">console.log(\'hi\')</code></pre>' },
    { input: "::: Title\nContent\n:::", expected: '<details><summary>Title</summary><div class="details-content">Content</div></details>' }
];

console.log("--- Testing Markdown Parser ---");
let passed = 0;
tests.forEach(t => {
    // Note: The simple regex parser might add <br> or <ul> wrapper, so we check for inclusion or normalized output
    const output = parseMarkdown(t.input);

    // Normalize for comparison (remove newlines/br for simple checks if needed, or check substring)
    // The parser adds <br> for newlines. 

    // For list check, we expect <ul> wrapper? The parser adds it in a second pass.
    // The extracted function body might lack the "return html" if I didn't capture properly.
    // Actually new Function automatically returns if last statement is return.

    const isMatch = output.includes(t.expected) || output.replace(/<br>/g, '') === t.expected;

    if (isMatch) {
        console.log(`✅ Passed: ${t.input}`);
        passed++;
    } else {
        console.error(`❌ Failed: ${t.input}`);
        console.error(`   Expected: ${t.expected}`);
        console.error(`   Actual:   ${output}`);
    }
});

if (passed === tests.length) {
    console.log("All tests passed!");
} else {
    console.log(`${passed}/${tests.length} tests passed.`);
}
