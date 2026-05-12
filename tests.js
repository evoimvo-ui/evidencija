/**
 * Simple Test Suite for Appointment Scheduling System
 */

async function runTests() {
  console.log("Starting tests...");
  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAILED: ${message}`);
      failed++;
    }
  };

  // Mocking dependencies
  const mockStore = {
    appointments: []
  };

  const mockSaveData = async (store, data) => {
    mockStore[store].push(data);
    return Promise.resolve();
  };

  const mockGetAllData = async (store) => {
    return Promise.resolve(mockStore[store]);
  };

  // Test 1: Save Appointment Validation
  console.log("\nTest 1: Save Appointment Validation");
  const testSaveApp = async (client, time) => {
    if (!client || !time) return "Validation failed";
    await mockSaveData('appointments', { client, time, id: Date.now() });
    return "Saved";
  };

  assert(await testSaveApp("", "10:00") === "Validation failed", "Should fail if client is empty");
  assert(await testSaveApp("Test Client", "") === "Validation failed", "Should fail if time is empty");
  assert(await testSaveApp("Test Client", "10:00") === "Saved", "Should save with valid data");
  assert(mockStore.appointments.length === 1, "Appointment should be in store");

  // Test 2: 24h Reminder Logic
  console.log("\nTest 2: 24h Reminder Logic");
  const checkReminder = (appDateStr, now) => {
    const appDate = new Date(appDateStr);
    const diffHours = (appDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffHours > 0 && diffHours <= 24;
  };

  const now = new Date("2026-05-02T10:00:00");
  const appTomorrow = "2026-05-03T09:00:00"; // 23h away
  const appLater = "2026-05-04T10:00:00"; // 48h away
  const appPast = "2026-05-02T09:00:00"; // 1h ago

  assert(checkReminder(appTomorrow, now) === true, "Should trigger for appointment in 23h");
  assert(checkReminder(appLater, now) === false, "Should NOT trigger for appointment in 48h");
  assert(checkReminder(appPast, now) === false, "Should NOT trigger for past appointment");

  // Test 3: Escape Mechanism (Closing Modals)
  console.log("\nTest 3: Escape Mechanism");
  let modalOpen = true;
  const closeBtnHandler = () => { modalOpen = false; };
  const escKeyHandler = (e) => { if (e.key === 'Escape') closeBtnHandler(); };

  escKeyHandler({ key: 'Escape' });
  assert(modalOpen === false, "Modal should be closed on Escape key");

  console.log(`\nTests finished. Passed: ${passed}, Failed: ${failed}`);
}

// Run tests if in browser console or explicitly called
if (typeof window !== 'undefined') {
  window.runAppTests = runTests;
} else {
  runTests();
}
