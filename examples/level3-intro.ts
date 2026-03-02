/**
 * Level 3 RPC Example: Three-way Introduction
 *
 * This example demonstrates the three-way introduction protocol where
 * Alice introduces Bob to Carol, allowing Bob to call Carol directly.
 */

import {
  RpcConnection,
  ConnectionManager,
  Level3Handlers,
  generateVatId,
  createThirdPartyCapId,
  generateProvisionId,
  WebSocketTransport,
} from '../src/rpc/index.js';

// ========================================================================================
// Example: Alice introduces Bob to Carol
// ========================================================================================

async function threeWayIntroductionExample() {
  console.log('=== Level 3 RPC: Three-way Introduction Example ===\n');

  // Step 1: Create Vat IDs for each participant
  const aliceVatId = generateVatId();
  const bobVatId = generateVatId();
  const carolVatId = generateVatId();

  console.log('Created Vat IDs:');
  console.log('  Alice:', Buffer.from(aliceVatId.id).toString('hex').slice(0, 16) + '...');
  console.log('  Bob:  ', Buffer.from(bobVatId.id).toString('hex').slice(0, 16) + '...');
  console.log('  Carol:', Buffer.from(carolVatId.id).toString('hex').slice(0, 16) + '...');
  console.log();

  // Step 2: Create ConnectionManager for Alice
  // In a real scenario, this would establish WebSocket connections
  const aliceConnectionManager = new ConnectionManager({
    selfVatId: aliceVatId,
    connectionFactory: async (vatId, address) => {
      console.log(`Alice: Establishing connection to ${Buffer.from(vatId.id).toString('hex').slice(0, 8)}...`);
      // In real code: return new WebSocketTransport(new WebSocket(address));
      throw new Error('WebSocket not available in example');
    },
    autoConnect: true,
  });

  // Step 3: Simulate the introduction process
  console.log('--- Introduction Process ---\n');

  // Alice creates a pending provision for Bob to access Carol's service
  const provisionId = generateProvisionId();
  const carolServiceExportId = 42; // Carol's service capability export ID

  console.log('1. Alice creates a pending provision for Bob:');
  console.log('   Provision ID:', Buffer.from(provisionId.id).toString('hex').slice(0, 16) + '...');
  console.log('   Target Export ID:', carolServiceExportId);
  console.log('   Recipient: Bob');
  console.log();

  const pendingProvision = aliceConnectionManager.createPendingProvision(
    provisionId,
    bobVatId,
    carolServiceExportId,
    1, // questionId
    false // not embargoed
  );

  // Step 4: Create ThirdPartyCapId
  console.log('2. Alice creates a ThirdPartyCapId:');
  const thirdPartyCapId = createThirdPartyCapId(carolVatId, provisionId);
  console.log('   Size:', thirdPartyCapId.id.length, 'bytes (32 vatId + 32 provisionId)');
  console.log('   Contains Carol\'s Vat ID and the Provision ID');
  console.log();

  // Step 5: Alice sends the capability reference to Bob
  console.log('3. Alice sends the capability reference to Bob');
  console.log('   (In real code, this would be embedded in a CapDescriptor)');
  console.log();

  // Step 6: Bob receives the capability and resolves it
  console.log('4. Bob receives the third-party capability:');
  console.log('   - Extracts Carol\'s Vat ID from ThirdPartyCapId');
  console.log('   - Establishes connection to Carol (if not already connected)');
  console.log('   - Sends Accept message to Carol with the Provision ID');
  console.log();

  // Step 7: Carol receives the Accept and returns the capability
  console.log('5. Carol receives Accept from Bob:');
  console.log('   - Looks up the pending provision by Provision ID');
  console.log('   - Verifies Bob is the intended recipient');
  console.log('   - Returns the capability to Bob');
  console.log();

  // Verify the provision exists
  const retrievedProvision = aliceConnectionManager.getPendingProvision(provisionId);
  if (retrievedProvision) {
    console.log('✓ Pending provision found and ready for pickup');
    console.log('  Target Export ID:', retrievedProvision.targetExportId);
    console.log('  Created at:', retrievedProvision.createdAt.toISOString());
  }

  console.log();
  console.log('6. Bob can now call Carol directly!');
  console.log('   Messages flow directly between Bob and Carol');
  console.log('   Alice is no longer in the message path');
  console.log();

  // Step 8: Cleanup
  aliceConnectionManager.removePendingProvision(provisionId);
  console.log('7. Cleanup: Pending provision removed after acceptance');

  console.log();
  console.log('=== Example Complete ===');
}

// ========================================================================================
// Example: Cycle Breaking with Embargo
// ========================================================================================

async function embargoExample() {
  console.log('\n=== Level 3 RPC: Cycle Breaking with Embargo ===\n');

  const aliceVatId = generateVatId();
  const bobVatId = generateVatId();
  const carolVatId = generateVatId();

  console.log('Scenario: Simultaneous introductions');
  console.log('- Alice introduces Bob to Carol');
  console.log('- Alice introduces Carol to Bob');
  console.log('- Both use embargo=true to prevent deadlock');
  console.log();

  const connectionManager = new ConnectionManager({
    selfVatId: aliceVatId,
    connectionFactory: async () => {
      throw new Error('Not implemented');
    },
    autoConnect: false,
  });

  // Create two embargoed provisions
  const provisionToBob = generateProvisionId();
  const provisionToCarol = generateProvisionId();

  connectionManager.createPendingProvision(provisionToBob, bobVatId, 1, 1, true); // embargoed
  connectionManager.createPendingProvision(provisionToCarol, carolVatId, 2, 2, true); // embargoed

  console.log('Created two embargoed provisions:');
  console.log('  1. For Bob to access Carol\'s service (embargoed)');
  console.log('  2. For Carol to access Bob\'s service (embargoed)');
  console.log();

  console.log('When Bob and Carol try to accept:');
  console.log('  - Both receive resultsSentElseware (embargo active)');
  console.log('  - Neither blocks waiting for the other');
  console.log('  - Deadlock is prevented!');
  console.log();

  console.log('After direct connections are established:');
  console.log('  - Disembargo messages are exchanged');
  console.log('  - Embargoes are lifted');
  console.log('  - Normal operation resumes');

  console.log();
  console.log('=== Example Complete ===');
}

// ========================================================================================
// Main
// ========================================================================================

async function main() {
  try {
    await threeWayIntroductionExample();
    await embargoExample();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { threeWayIntroductionExample, embargoExample };
