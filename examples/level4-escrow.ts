/**
 * Level 4 RPC Example: Escrow Agent
 *
 * This example demonstrates how to use Level 4 RPC's Join operation
 * to implement an escrow agent for secure transactions.
 *
 * Scenario: Bob wants to sell a digital asset to Carol, and Alice
 * acts as a trusted escrow agent to ensure both parties fulfill
 * their obligations.
 */

import {
  ConnectionManager,
  Level3Handlers,
  Level4Handlers,
  RpcConnection,
  type VatId,
  WebSocketTransport,
  generateVatId,
} from '@naeemo/capnp';

// =============================================================================
// Example: Escrow Agent for Digital Asset Transfer
// =============================================================================

/**
 * This example demonstrates the escrow pattern using Level 4 RPC:
 *
 * 1. Bob has a digital asset (e.g., a file, NFT, etc.)
 * 2. Carol wants to buy it
 * 3. Alice acts as escrow agent
 *
 * The challenge: How does Alice verify that Bob and Carol are talking
 * about the same asset before releasing funds?
 *
 * Solution: Level 4 Join operation
 */

async function escrowExample() {
  console.log('=== Level 4 RPC: Escrow Agent Example ===\n');

  // Step 1: Setup - Create vat IDs for all parties
  const aliceVatId = generateVatId(); // Escrow agent
  const _bobVatId = generateVatId(); // Seller
  const _carolVatId = generateVatId(); // Buyer

  console.log('Created vat IDs for:');
  console.log('  - Alice (escrow agent)');
  console.log('  - Bob (seller)');
  console.log('  - Carol (buyer)\n');

  // Step 2: Alice sets up her escrow service
  const aliceConnectionManager = new ConnectionManager({
    selfVatId: aliceVatId,
    connectionFactory: async (_vatId) => {
      // In real implementation, establish WebSocket connection
      return new WebSocketTransport(new WebSocket('ws://localhost:8080'));
    },
  });

  const aliceConnection = new RpcConnection(
    new WebSocketTransport(new WebSocket('ws://localhost:8080')),
    {
      selfVatId: aliceVatId,
      connectionManager: aliceConnectionManager,
    }
  );

  // Step 3: Enable Level 4 handlers for Alice
  const level4Handlers = new Level4Handlers({
    connection: aliceConnection,
    connectionManager: aliceConnectionManager,
    selfVatId: aliceVatId,
    escrowConfig: {
      enabled: true,
      requiredParties: 2, // Bob and Carol
      timeoutMs: 60000,
      onConsensus: (identity, parties) => {
        console.log('✅ Consensus reached!');
        console.log(`   Parties ${parties.join(', ')} agree on object identity`);
        console.log(`   Vat ID: ${Buffer.from(identity.vatId).toString('hex').slice(0, 16)}...`);
      },
      onConsensusFailure: (reason, parties) => {
        console.log('❌ Consensus failed!');
        console.log(`   Reason: ${reason}`);
        console.log(`   Parties: ${parties.join(', ')}`);
      },
    },
  });

  aliceConnection.setLevel4Handlers(level4Handlers);

  console.log('Alice (escrow) configured with Level 4 handlers\n');

  // Step 4: Bob and Carol connect to Alice and send their references
  console.log('--- Transaction Flow ---\n');

  // Simulate Bob sending his reference to the asset
  console.log('1. Bob sends asset reference to Alice');
  const bobAssetRef = { type: 'importedCap' as const, importId: 1 };

  // Simulate Carol sending her reference to the same asset
  console.log('2. Carol sends asset reference to Alice');
  const carolAssetRef = { type: 'importedCap' as const, importId: 2 };

  // Step 5: Alice verifies both references point to the same object
  console.log('3. Alice verifies both references using Join operation...');

  try {
    const joinResult = await level4Handlers.sendJoin(bobAssetRef, carolAssetRef);

    if (joinResult.equal) {
      console.log('   ✅ References are equal - same object!\n');

      // Step 6: Proceed with escrow
      console.log('4. Alice holds payment from Carol');
      console.log('5. Bob transfers asset to Carol');
      console.log('6. Alice releases payment to Bob');
      console.log('\n✅ Transaction completed successfully!');
    } else {
      console.log('   ❌ References are different!');
      console.log(`   Reason: ${joinResult.inequalityReason}`);
      console.log('\n❌ Transaction aborted - possible fraud attempt!');
    }
  } catch (error) {
    console.log(`   ❌ Join operation failed: ${error}`);
    console.log('\n❌ Transaction aborted due to verification failure');
  }
}

// =============================================================================
// Example: Consensus Verification
// =============================================================================

/**
 * This example shows how to use Level 4 RPC for consensus verification
 * among multiple parties.
 */
async function consensusExample() {
  console.log('\n\n=== Level 4 RPC: Consensus Verification Example ===\n');

  // Setup: Multiple validators need to agree on an object
  const validatorVatIds: VatId[] = [];
  const validators = ['Validator A', 'Validator B', 'Validator C', 'Validator D'];

  for (let i = 0; i < 4; i++) {
    validatorVatIds.push(generateVatId());
  }

  console.log(`Setup: ${validators.length} validators for consensus\n`);

  // Create connection and handlers for the consensus coordinator
  const coordinatorConnection = new RpcConnection(
    new WebSocketTransport(new WebSocket('ws://localhost:8080')),
    { selfVatId: generateVatId() }
  );

  const level4Handlers = new Level4Handlers({
    connection: coordinatorConnection,
    escrowConfig: {
      enabled: true,
      requiredParties: 3, // Require 3 out of 4 validators
      timeoutMs: 30000,
      onConsensus: (_identity, parties) => {
        console.log(`✅ Consensus reached with ${parties.length} validators!`);
      },
      onConsensusFailure: (reason) => {
        console.log(`❌ Consensus failed: ${reason}`);
      },
    },
  });

  // Simulate validators registering their references
  console.log('Validators registering their references...');

  for (let i = 0; i < validators.length; i++) {
    try {
      const result = await level4Handlers.registerEscrowParty(validators[i], {
        type: 'importedCap',
        importId: i + 1,
      });

      if (result.consensus) {
        console.log(`\nConsensus reached at validator ${validators[i]}`);
        break;
      }
      console.log(`  ${validators[i]} registered (${i + 1}/${validators.length})`);
    } catch (error) {
      console.log(`  ${validators[i]} registration failed: ${error}`);
    }
  }

  // Check final consensus state
  const consensus = level4Handlers.getEscrowConsensus();
  if (consensus) {
    console.log('\n✅ Final consensus state:');
    console.log(`   Parties: ${consensus.parties.join(', ')}`);
  } else {
    console.log('\n⚠️ No consensus reached');
  }
}

// =============================================================================
// Example: Anti-Spoofing Verification
// =============================================================================

/**
 * This example demonstrates the security features of Level 4 RPC
 * for preventing spoofing attacks.
 */
async function securityExample() {
  console.log('\n\n=== Level 4 RPC: Security Verification Example ===\n');

  const connection = new RpcConnection(
    new WebSocketTransport(new WebSocket('ws://localhost:8080')),
    { selfVatId: generateVatId() }
  );

  // Configure strict security policy
  const level4Handlers = new Level4Handlers({
    connection,
    securityPolicy: {
      verifyIdentityHashes: true, // Require cryptographic verification
      checkRevocation: true, // Check if objects have been revoked
      maxProxyDepth: 5, // Limit proxy chain length
      auditLog: true, // Log all operations
      allowedVats: [], // Empty = allow all (in production, specify allowed vats)
    },
  });

  console.log('Security policy configured:');
  console.log('  - Identity hash verification: enabled');
  console.log('  - Revocation checking: enabled');
  console.log('  - Max proxy depth: 5');
  console.log('  - Audit logging: enabled\n');

  // Generate identity hashes for verification
  const vatId = generateVatId();
  const objectId = new Uint8Array(16);
  crypto.getRandomValues(objectId);

  const identityHash = await level4Handlers.generateIdentityHash(vatId.id, objectId);

  console.log('Generated identity hash:');
  console.log(`  ${Buffer.from(identityHash).toString('hex').slice(0, 32)}...`);
  console.log('\nThis hash can be used to verify object identity cryptographically.');
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    await escrowExample();
    await consensusExample();
    await securityExample();

    console.log('\n\n=== All examples completed ===');
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Run examples if this file is executed directly
if (typeof window === 'undefined') {
  main().catch(console.error);
}

export { escrowExample, consensusExample, securityExample };
