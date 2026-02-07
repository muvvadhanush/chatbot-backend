const axios = require("axios");
const baseURL = "http://localhost:5001/api";

async function runTest() {
    try {
        console.log("🧪 Starting Phase 1 Test...");

        const connectionId = "test_conn_" + Date.now();
        const password = "myselectsecret";

        // 1. Create Connection
        console.log("➡️ Creating Connection...");
        const createRes = await axios.post(`${baseURL}/connections/create`, {
            connectionId,
            connectionSecret: "legacy_secret", // Keep for now
            password: password,
            websiteName: "Test Site"
        });
        console.log("✅ Created:", createRes.data.connectionId);

        // 2. Widget Handshake (Fail)
        console.log("➡️ Widget Handshake (Wrong Password)...");
        try {
            await axios.post(`${baseURL}/widget/hello`, {
                connectionId,
                password: "wrong",
                origin: "http://test.com"
            });
            console.error("❌ Should have failed!");
        } catch (e) {
            console.log("✅ Rejected:", e.response?.status);
        }

        // 3. Widget Handshake (Success)
        console.log("➡️ Widget Handshake (Correct Password)...");
        const helloRes = await axios.post(`${baseURL}/widget/hello`, {
            connectionId,
            password: password,
            origin: "http://test.com"
        });
        console.log("✅ Handshake Success:", helloRes.data);

        // 4. Admin Enable Extraction
        console.log("➡️ Admin Enable Extraction...");
        await axios.post(`${baseURL}/connections/${connectionId}/extraction/enable`, {
            allowedExtractors: ["knowledge"]
        });
        console.log("✅ Extraction Enabled");

        // 5. Admin Trigger Extraction
        console.log("➡️ Admin Trigger Extraction...");
        const triggerRes = await axios.post(`${baseURL}/connections/${connectionId}/extract`);
        const token = triggerRes.data.token;
        console.log("✅ Extraction Triggered. Token:", token);

        // 6. Widget Submit Extraction
        console.log("➡️ Widget Submit Extraction...");
        const extractRes = await axios.post(`${baseURL}/widget/extract`, {
            connectionId,
            token,
            data: {
                siteName: "Updated Test Site",
                knowledge: [
                    { type: "text", text: "Important info", title: "About Us" }
                ]
            }
        });
        console.log("✅ Extraction Submitted:", extractRes.data);

        console.log("🎉 POST-TEST SUCCESS!");

    } catch (error) {
        console.error("❌ Test Failed:", error.message);
        if (error.response) {
            console.error("Response:", error.response.data);
        }
    }
}

runTest();
