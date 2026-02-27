const http = require('http');

const data = JSON.stringify({
    message: "Hello, what can you do?",
    connectionId: "cb_ec7ab24b0d194de8", // Valid Portfolio Connection
    sessionId: "test-session-" + Date.now()
});

const options = {
    hostname: 'localhost',
    port: 5001,
    path: '/api/v1/chat/stream',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

console.log("Sending request to http://localhost:3000/api/v1/chat/stream...");

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');

    res.on('data', (chunk) => {
        console.log(`CHUNK: ${chunk}`);
    });

    res.on('end', () => {
        console.log('Stream finished.');
    });
});

req.on('error', (e) => {
    console.error(`Request Error: ${e.message}`);
});

req.write(data);
req.end();
