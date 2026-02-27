const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { extractFromDiscovery } = require('../services/extraction/extractionService');
const { parseFile } = require('../services/extraction/uploadService');
const { hashContent } = require('../services/extraction/hashService');
const { cleanHtml } = require('../services/extraction/contentCleanService');
const Connection = require('../models/Connection');
const ManualUpload = require('../models/ManualUpload');
const PendingExtraction = require('../models/PendingExtraction');
const PageContent = require('../models/PageContent'); // Ensure required if needed directly

// Multer Config
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// 1. Trigger Auto-Extraction
// POST /api/v1/connections/:id/extract
router.post('/:id/extract', async (req, res) => {
    try {
        const connection = await Connection.findOne({
            where: { connectionId: req.params.id }
        });
        if (!connection) return res.status(404).json({ error: 'Connection not found' });

        // Check permissions/limits?

        // Run Async? Or Wait?
        // For Phase 2, we wait.
        const result = await extractFromDiscovery(connection);

        res.json({
            success: true,
            message: "Extraction completed",
            stats: result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Manual File Upload
// POST /api/v1/connections/:id/upload
router.post('/:id/upload', upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;

        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        // Parse
        const rawText = await parseFile(file);
        const cleanText = rawText.replace(/\s+/g, ' ').trim();
        const hash = hashContent(cleanText);

        // Store ManualUpload
        let fileType = 'TEXT';
        if (file.mimetype === 'application/pdf') fileType = 'PDF';
        if (file.mimetype.includes('word')) fileType = 'DOCX';

        const uploadRecord = await ManualUpload.create({
            connectionId: id,
            fileName: file.originalname,
            fileType: fileType,
            rawText: rawText,
            cleanText: cleanText,
            contentHash: hash,
            status: 'PROCESSED'
        });

        // Create PendingExtraction
        await PendingExtraction.create({
            connectionId: id,
            sourceType: 'MANUAL',
            contentType: fileType, // PDF/DOCX/TEXT
            extractorType: 'KNOWLEDGE',
            rawData: {
                title: file.originalname,
                content: cleanText,
                sourceId: uploadRecord.id
            },
            status: 'PENDING'
        });

        // Cleanup file
        const fs = require('fs');
        fs.unlinkSync(file.path);

        res.json({ success: true, id: uploadRecord.id });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Manual Paste
// POST /api/v1/connections/:id/paste
router.post('/:id/paste', async (req, res) => {
    try {
        const { content, title } = req.body;
        if (!content) return res.status(400).json({ error: 'Content required' });

        const cleanText = content.replace(/\s+/g, ' ').trim();
        const hash = hashContent(cleanText);

        // Store ManualUpload (as virtual file)
        const uploadRecord = await ManualUpload.create({
            connectionId: req.params.id,
            fileName: title || 'Manual Paste',
            fileType: 'TXT',
            rawText: content,
            cleanText: cleanText,
            contentHash: hash,
            status: 'PROCESSED'
        });

        await PendingExtraction.create({
            connectionId: req.params.id,
            sourceType: 'MANUAL',
            contentType: 'TEXT',
            extractorType: 'KNOWLEDGE',
            rawData: {
                title: title || 'Manual Paste',
                content: cleanText,
                sourceId: uploadRecord.id
            },
            status: 'PENDING'
        });

        res.json({ success: true, id: uploadRecord.id });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Status
router.get('/:id/extraction/status', async (req, res) => {
    // Return pending count?
    const pending = await PendingExtraction.count({
        where: { connectionId: req.params.id, status: 'PENDING' }
    });
    res.json({ pendingCount: pending });
});

module.exports = router;
