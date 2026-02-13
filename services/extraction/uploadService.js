const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

async function parseFile(file) {
    if (!file) throw new Error("No file provided");

    // file is multer object { path, mimetype, originalname }

    if (file.mimetype === 'application/pdf') {
        const dataBuffer = fs.readFileSync(file.path);
        const data = await pdf(dataBuffer);
        return data.text;
    }

    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ path: file.path });
        return result.value;
    }

    if (file.mimetype === 'text/plain') {
        return fs.readFileSync(file.path, 'utf8');
    }

    throw new Error(`Unsupported file type: ${file.mimetype}`);
}

module.exports = { parseFile };
