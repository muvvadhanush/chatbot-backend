/**
 * test_onboarding_state_machine.js
 * 
 * Tests for the OnboardingStateMachine service.
 * Validates transition rules, blockers, optimistic locking,
 * launch lock, stale lock override, and rollback paths.
 * 
 * Run: node backend/tests/test_onboarding_state_machine.js
 */

const StateMachine = require('../services/OnboardingStateMachine');
const { STATES } = StateMachine;

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ ${testName}`);
        passed++;
    } else {
        console.error(`  ❌ FAILED: ${testName}`);
        failed++;
    }
}

// Mock connection factory
function mockConnection(overrides = {}) {
    const base = {
        connectionId: 'test-conn-001',
        status: STATES.DRAFT,
        onboardingStep: 1,
        version: 0,
        websiteUrl: 'https://example.com',
        websiteName: 'Example',
        temperature: 0.3,
        responseLength: 'medium',
        behaviorProfile: {},
        healthScore: 100,
        stateLockedBy: null,
        stateLockedAt: null,
        onboardingMeta: {},
        launchStatus: 'DRAFT',
        onboardingCompletedAt: null,
        _updates: {},
        update: async function (payload) {
            Object.assign(this, payload);
            Object.assign(this._updates, payload);
            return this;
        }
    };
    return { ...base, ...overrides, update: base.update };
}

// ============================================================
// Test Suite
// ============================================================

async function runTests() {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(' Onboarding State Machine — Test Suite');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // ------- 1. Happy Path Forward Transitions -------
    console.log('--- 1. Forward Transitions (Happy Path) ---');

    // DRAFT -> CONNECTED
    let conn = mockConnection({ websiteUrl: 'https://example.com' });
    let result = await StateMachine.transition(conn, STATES.CONNECTED, { expectedVersion: 0 });
    assert(result.success === true, 'DRAFT → CONNECTED succeeds');
    assert(conn.status === STATES.CONNECTED, 'Status updated to CONNECTED');
    assert(conn.version === 1, 'Version incremented to 1');
    assert(conn.onboardingStep === 2, 'Step set to 2');

    // CONNECTED -> DISCOVERING
    conn = mockConnection({
        status: STATES.CONNECTED, version: 1, onboardingStep: 2,
        websiteName: 'Example Site'
    });
    result = await StateMachine.transition(conn, STATES.DISCOVERING, { expectedVersion: 1 });
    assert(result.success === true, 'CONNECTED → DISCOVERING succeeds');

    console.log('');

    // ------- 2. Blocked Transitions -------
    console.log('--- 2. Blocked Transitions ---');

    // DRAFT -> LAUNCHED (skip all steps)
    conn = mockConnection();
    result = await StateMachine.transition(conn, STATES.LAUNCHED, { expectedVersion: 0 });
    assert(result.success === false, 'DRAFT → LAUNCHED blocked');
    assert(result.statusCode === 400, 'Returns 400 for invalid transition');

    // DISCOVERING -> TUNED (skip TRAINED)
    conn = mockConnection({ status: STATES.DISCOVERING, version: 1 });
    result = await StateMachine.transition(conn, STATES.TUNED, { expectedVersion: 1 });
    assert(result.success === false, 'DISCOVERING → TUNED blocked');

    // DRAFT -> READY (skip intermediate)
    conn = mockConnection();
    result = await StateMachine.transition(conn, STATES.READY, { expectedVersion: 0 });
    assert(result.success === false, 'DRAFT → READY blocked');

    console.log('');

    // ------- 3. Optimistic Locking -------
    console.log('--- 3. Optimistic Locking (Version Conflict) ---');

    conn = mockConnection({ websiteUrl: 'https://example.com', version: 5 });
    result = await StateMachine.transition(conn, STATES.CONNECTED, { expectedVersion: 3 });
    assert(result.success === false, 'Version mismatch detected');
    assert(result.statusCode === 409, 'Returns 409 Conflict');

    conn = mockConnection({ websiteUrl: 'https://example.com', version: 5 });
    result = await StateMachine.transition(conn, STATES.CONNECTED, { expectedVersion: 5 });
    assert(result.success === true, 'Correct version passes');

    console.log('');

    // ------- 4. Launch Lock -------
    console.log('--- 4. Launch Lock (Immutability) ---');

    conn = mockConnection({ status: STATES.LAUNCHED, version: 10 });
    result = await StateMachine.transition(conn, STATES.READY, { expectedVersion: 10 });
    assert(result.success === false, 'LAUNCHED → READY blocked');
    assert(result.statusCode === 423, 'Returns 423 Locked');

    conn = mockConnection({ status: STATES.LAUNCHED, version: 10 });
    result = await StateMachine.transition(conn, STATES.DRAFT, { expectedVersion: 10 });
    assert(result.success === false, 'LAUNCHED → DRAFT blocked');
    assert(result.statusCode === 423, 'Returns 423 Locked for any target');

    console.log('');

    // ------- 5. Job Lock -------
    console.log('--- 5. Job Lock ---');

    conn = mockConnection({ status: STATES.CONNECTED, version: 1, websiteName: 'Test' });
    let lockResult = await StateMachine.acquireLock(conn, 'discovery:job-123');
    assert(lockResult.acquired === true, 'Lock acquired');
    assert(conn.stateLockedBy === 'discovery:job-123', 'stateLockedBy set');

    // Try to acquire again (should fail)
    const conn2 = { ...conn, update: conn.update };
    lockResult = await StateMachine.acquireLock(conn2, 'discovery:job-456');
    assert(lockResult.acquired === false, 'Second lock rejected');

    // Release and re-acquire
    await StateMachine.releaseLock(conn);
    assert(conn.stateLockedBy === null, 'Lock released');

    lockResult = await StateMachine.acquireLock(conn, 'discovery:job-789');
    assert(lockResult.acquired === true, 'Lock re-acquired after release');

    console.log('');

    // ------- 6. Stale Lock Override -------
    console.log('--- 6. Stale Lock Override ---');

    conn = mockConnection({
        status: STATES.CONNECTED, version: 1, websiteName: 'Test',
        stateLockedBy: 'discovery:old-job',
        stateLockedAt: new Date(Date.now() - 20 * 60 * 1000) // 20 minutes ago
    });

    lockResult = await StateMachine.acquireLock(conn, 'discovery:new-job');
    assert(lockResult.acquired === true, 'Stale lock overridden (20m > 15m threshold)');

    // Non-stale lock should block
    conn = mockConnection({
        status: STATES.CONNECTED, version: 1, websiteName: 'Test',
        stateLockedBy: 'discovery:recent-job',
        stateLockedAt: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
    });
    lockResult = await StateMachine.acquireLock(conn, 'discovery:another-job');
    assert(lockResult.acquired === false, 'Non-stale lock blocks (5m < 15m threshold)');

    console.log('');

    // ------- 7. Rollback Paths -------
    console.log('--- 7. Rollback Paths ---');

    conn = mockConnection({ status: STATES.DISCOVERING, version: 3, onboardingStep: 3 });
    result = await StateMachine.transition(conn, STATES.CONNECTED, { expectedVersion: 3 });
    assert(result.success === true, 'DISCOVERING → CONNECTED rollback succeeds');

    conn = mockConnection({ status: STATES.TRAINED, version: 4, onboardingStep: 4 });
    result = await StateMachine.transition(conn, STATES.DISCOVERING, { expectedVersion: 4 });
    assert(result.success === true, 'TRAINED → DISCOVERING rollback succeeds');

    conn = mockConnection({ status: STATES.TUNED, version: 5, onboardingStep: 5 });
    result = await StateMachine.transition(conn, STATES.TRAINED, { expectedVersion: 5 });
    assert(result.success === true, 'TUNED → TRAINED rollback succeeds');

    conn = mockConnection({ status: STATES.READY, version: 6, onboardingStep: 6 });
    result = await StateMachine.transition(conn, STATES.TUNED, { expectedVersion: 6 });
    assert(result.success === true, 'READY → TUNED rollback succeeds');

    console.log('');

    // ------- 8. Guard Failures -------
    console.log('--- 8. Guard Failures ---');

    // DRAFT -> CONNECTED without URL
    conn = mockConnection({ websiteUrl: '' });
    result = await StateMachine.transition(conn, STATES.CONNECTED, { expectedVersion: 0 });
    assert(result.success === false, 'DRAFT → CONNECTED blocked without URL');
    assert(result.statusCode === 422, 'Returns 422 Unprocessable');

    // CONNECTED -> DISCOVERING without websiteName
    conn = mockConnection({ status: STATES.CONNECTED, version: 1, websiteName: '' });
    result = await StateMachine.transition(conn, STATES.DISCOVERING, { expectedVersion: 1 });
    assert(result.success === false, 'CONNECTED → DISCOVERING blocked without name');

    console.log('');

    // ------- 9. Resume Logic -------
    console.log('--- 9. Resume Logic ---');

    assert(StateMachine.getPathForState(STATES.DRAFT) === '/setup/identity', 'DRAFT → /setup/identity');
    assert(StateMachine.getPathForState(STATES.CONNECTED) === '/setup/discovery', 'CONNECTED → /setup/discovery');
    assert(StateMachine.getPathForState(STATES.DISCOVERING) === '/setup/discovery', 'DISCOVERING → /setup/discovery');
    assert(StateMachine.getPathForState(STATES.TRAINED) === '/setup/behavior', 'TRAINED → /setup/behavior');
    assert(StateMachine.getPathForState(STATES.TUNED) === '/setup/verify', 'TUNED → /setup/verify');
    assert(StateMachine.getPathForState(STATES.READY) === '/setup/launch', 'READY → /setup/launch');
    assert(StateMachine.getPathForState(STATES.LAUNCHED) === '/dashboard', 'LAUNCHED → /dashboard');

    assert(StateMachine.getStepForState(STATES.DRAFT) === 1, 'DRAFT → step 1');
    assert(StateMachine.getStepForState(STATES.LAUNCHED) === 6, 'LAUNCHED → step 6');

    console.log('');

    // ------- 10. Valid Next States -------
    console.log('--- 10. Valid Next States ---');

    conn = mockConnection({ status: STATES.DRAFT });
    let nextStates = StateMachine.getValidNextStates(conn);
    assert(nextStates.length === 1, 'DRAFT has 1 forward path');
    assert(nextStates[0].state === STATES.CONNECTED, 'DRAFT → CONNECTED only');

    conn = mockConnection({ status: STATES.DISCOVERING });
    nextStates = StateMachine.getValidNextStates(conn);
    assert(nextStates.length === 2, 'DISCOVERING has 2 paths (forward + rollback)');

    conn = mockConnection({ status: STATES.LAUNCHED });
    nextStates = StateMachine.getValidNextStates(conn);
    assert(nextStates.length === 0, 'LAUNCHED has 0 paths (locked)');

    console.log('');

    // ------- Summary -------
    console.log('═══════════════════════════════════════════');
    console.log(` Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
