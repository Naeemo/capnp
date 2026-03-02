@0xb312981b2552a250;

# Copyright (c) 2013-2014 Sandstorm Development Group, Inc. and contributors
# Licensed under the MIT License:
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

using Cxx = import "c++.capnp";
$Cxx.namespace("capnp::rpc");

# ========================================================================================
# The Four Tables
#
# Cap'n Proto RPC connections are stateful. As in CapTP, for each open connection, a vat 
# maintains four state tables: questions, answers, imports, and exports.
# See: http://www.erights.org/elib/distrib/captp/4tables.html
#
# The question table corresponds to the other end's answer table, and the imports table 
# corresponds to the other end's exports table.

using QuestionId = UInt32;
# Identifies a question in the sender's question table (which corresponds to the receiver's 
# answer table). The questioner (caller) chooses an ID when making a call. The ID remains 
# valid in caller -> callee messages until a Finish message is sent, and remains valid in 
# callee -> caller messages until a Return message is sent.

using AnswerId = QuestionId;
# Identifies an answer in the sender's answer table (which corresponds to the receiver's 
# question table).

using ExportId = UInt32;
# Identifies an exported capability or promise in the sender's export table (which 
# corresponds to the receiver's import table). The exporter chooses an ID before sending 
# a capability over the wire.

using ImportId = ExportId;
# Identifies an imported capability or promise in the sender's import table (which 
# corresponds to the receiver's export table).

# ========================================================================================
# Messages

struct Message {
  # An RPC connection is a bi-directional stream of Messages.

  union {
    unimplemented @0 :Message;
    # The sender previously received this message from the peer but didn't understand it 
    # or doesn't yet implement the functionality that was requested.

    abort @1 :Exception;
    # Sent when a connection is being aborted due to an unrecoverable error.

    # Level 0 features -----------------------------------------------
    bootstrap @8 :Bootstrap;
    call @2 :Call;
    return @3 :Return;
    finish @4 :Finish;

    # Level 1 features -----------------------------------------------
    resolve @5 :Resolve;
    release @6 :Release;
    disembargo @13 :Disembargo;

    # Level 2 features (deprecated in this version)
    obsoleteSave @7 :AnyPointer;
    obsoleteDelete @9 :AnyPointer;

    # Level 3 features (Three-way introductions) ----------------------
    provide @10 :Provide;
    accept @11 :Accept;

    # Level 4 features (Join) ----------------------------------------
    join @12 :Join;

    # Phase 7: Dynamic Schema features -------------------------------
    schemaRequest @14 :SchemaRequest;
    # Request schema information from the remote vat.

    schemaResponse @15 :SchemaResponse;
    # Response containing requested schema information.
  }
}

# Level 0 message types ----------------------------------------------

struct Bootstrap {
  # Get the "bootstrap" interface exported by the remote vat.

  questionId @0 :QuestionId;
  # A new question ID identifying this request, which will eventually receive a Return 
  # message containing the restored capability.

  deprecatedObjectId @1 :AnyPointer;
  # DEPRECATED: Use a single bootstrap interface with methods to obtain other interfaces.
}

struct Call {
  # Message type initiating a method call on a capability.

  questionId @0 :QuestionId;
  # A number, chosen by the caller, that identifies this call in future messages.

  target @1 :MessageTarget;
  # The object that should receive this call.

  interfaceId @2 :UInt64;
  # The type ID of the interface being called.

  methodId @3 :UInt16;
  # The ordinal number of the method to call within the requested interface.

  allowThirdPartyTailCall @8 :Bool = false;
  # Level 3: Indicates whether the receiver is allowed to send a Return containing 
  # acceptFromThirdParty.

  noPromisePipelining @9 :Bool = false;
  # If true, the sender promises that it won't make any promise-pipelined calls on 
  # the results of this call.

  onlyPromisePipeline @10 :Bool = false;
  # If true, the sender only plans to use this call to make pipelined calls. 
  # The receiver need not send a Return message.

  params @4 :Payload;
  # The call parameters.

  sendResultsTo :union {
    # Where should the return message be sent?

    caller @5 :Void;
    # Send the return message back to the caller (the usual).

    yourself @6 :Void;
    # Don't actually return the results to the sender. Instead, hold on to them and 
    # await instructions from the sender regarding what to do with them.

    thirdParty @7 :RecipientId;
    # Level 3: The call's result should be returned to a different vat.
  }
}

struct Return {
  # Message type sent from callee to caller indicating that the call has completed.

  answerId @0 :AnswerId;
  # Equal to the QuestionId of the corresponding Call message.

  releaseParamCaps @1 :Bool = true;
  # If true, all capabilities that were in the params should be considered released.

  noFinishNeeded @8 :Bool = false;
  # If true, the sender does not need the receiver to send a Finish message.

  union {
    results @2 :Payload;
    # The result.

    exception @3 :Exception;
    # Indicates that the call failed and explains why.

    canceled @4 :Void;
    # Indicates that the call was canceled due to the caller sending a Finish message.

    resultsSentElsewhere @5 :Void;
    # This is set when returning from a Call that had sendResultsTo set to something 
    # other than caller.

    takeFromOtherQuestion @6 :QuestionId;
    # The sender has also sent a Call with the given question ID and with 
    # sendResultsTo.yourself set, and the results of that other call should be used 
    # as the results here.

    acceptFromThirdParty @7 :ThirdPartyCapId;
    # Level 3: The caller should contact a third-party vat to pick up the results.
  }
}

struct Finish {
  # Message type sent from the caller to the callee to indicate:
  # 1) The questionId will no longer be used in any messages sent by the callee.
  # 2) If the call has not returned yet, the caller no longer cares about the result.

  questionId @0 :QuestionId;
  # ID of the call whose result is to be released.

  releaseResultCaps @1 :Bool = true;
  # If true, all capabilities that were in the results should be considered released.

  requireEarlyCancellationWorkaround @2 :Bool = true;
  # Workaround for older Cap'n Proto versions.
}

# Level 1 message types ----------------------------------------------

struct Resolve {
  # Message type sent to indicate that a previously-sent promise has now been resolved 
  # to some other object.

  promiseId @0 :ExportId;
  # The ID of the promise to be resolved.

  union {
    cap @1 :CapDescriptor;
    # The object to which the promise resolved.

    exception @2 :Exception;
    # Indicates that the promise was broken.
  }
}

struct Release {
  # Message type sent to indicate that the sender is done with the given capability and the receiver
  # can free resources allocated to it.

  id @0 :ImportId;
  # What to release.

  referenceCount @1 :UInt32;
  # The amount by which to decrement the reference count. The export is only actually released
  # when the reference count reaches zero.
}

struct Disembargo {
  # Message sent to indicate that an embargo on a recently-resolved promise may now be lifted.
  # Embargos are used to enforce E-order in the presence of promise resolution.

  target @0 :MessageTarget;
  # What is to be disembargoed.

  using EmbargoId = UInt32;
  # Used in senderLoopback and receiverLoopback.

  context :union {
    senderLoopback @1 :EmbargoId;
    # The sender is requesting a disembargo on a promise that is known to resolve back to a
    # capability hosted by the sender.

    receiverLoopback @2 :EmbargoId;
    # The receiver previously sent a senderLoopback Disembargo towards a promise resolving to
    # this capability, and that Disembargo is now being echoed back.

    accept @3 :Void;
    # Level 3: The sender is requesting a disembargo on a promise that is known to resolve to 
    # a third-party capability.

    provide @4 :QuestionId;
    # Level 3: The sender is requesting a disembargo on a capability currently being provided 
    # to a third party.
  }
}

# Level 3 message types (Three-way introductions) --------------------

struct Provide {
  # Message type sent to indicate that the sender wishes to make a particular capability 
  # implemented by the receiver available to a third party for direct access.
  #
  # This is part of the "three-way introduction" protocol. When Alice wants to introduce
  # Bob to Carol, Alice sends a Provide message to Carol, identifying Bob as the recipient.
  # Carol then waits for Bob to connect and send an Accept message.

  questionId @0 :QuestionId;
  # Question ID to be held open until the recipient has received the capability.
  # This allows the sender to pipeline messages to the provided capability.

  target @1 :MessageTarget;
  # What is to be provided to the third party.

  recipient @2 :RecipientId;
  # Identity of the third party that is expected to pick up the capability.
  # This is typically a vat ID or public key that identifies Bob.
}

struct Accept {
  # Message type sent to pick up a capability hosted by the receiving vat and provided by a 
  # third party.
  #
  # This is the second part of the "three-way introduction" protocol. After Alice has sent
  # a Provide message to Carol, Bob sends an Accept message to Carol to pick up the
  # capability.

  questionId @0 :QuestionId;
  # A new question ID identifying this accept message.

  provision @1 :ProvisionId;
  # Identifies the provided object to be picked up. This is obtained from the Provide
  # message or from a ThirdPartyCapId.

  embargo @2 :Bool;
  # If true, this accept shall be temporarily embargoed. This is used to break cycles
  # in the introduction graph (e.g., when Alice introduces Bob to Carol and Carol to Bob
  # simultaneously).
}

# Level 4 message types (Join) ---------------------------------------

struct Join {
  # Level 4: Message type sent to establish direct connectivity to the common root of two 
  # or more proxied capabilities.
  #
  # Join is used to verify that two capabilities are actually the same object. This is
  # important for capability-based security when proxies are involved.

  questionId @0 :QuestionId;
  # Question ID for this join operation.

  target @1 :MessageTarget;
  # The first capability to join.

  otherCap @2 :MessageTarget;
  # The second capability to join.

  joinId @3 :UInt32;
  # Identifier for this join operation. Used to correlate the result.
}

# ========================================================================================
# Supporting Types

struct MessageTarget {
  # Identifies which capability should receive a message (e.g., a Call or Disembargo).

  union {
    importedCap @0 :ImportId;
    # The capability is the one identified by this ImportId in the sender's import table.

    promisedAnswer @1 :PromisedAnswer;
    # The capability is the one that will be returned by the specified promised answer.
  }
}

struct Payload {
  # A struct containing arbitrary data and capability references.
  # Used as call parameters and return results.

  content @0 :AnyPointer;
  # The raw data content. This is typically a struct whose fields correspond to the 
  # parameters or results of a method.

  capTable @1 :List(CapDescriptor);
  # List of capabilities referenced in the content. The content struct contains 
  # capability pointers that are indices into this table.
}

struct CapDescriptor {
  # Describes a capability in a Payload's cap table.

  union {
    none @0 :Void;
    # A null capability (client-side only).

    senderHosted @1 :SenderHostedCap;
    # A capability hosted by the sender. The receiver should add this to its import table.

    senderPromise @2 :SenderPromiseCap;
    # A promise for a capability that the sender will resolve later. The receiver should 
    # add this to its import table as a promise.

    receiverHosted @3 :ReceiverHostedCap;
    # A capability hosted by the receiver. This is the receiver's own ExportId.

    receiverAnswer @4 :PromisedAnswer;
    # A capability that will be returned by the specified promised answer.

    thirdPartyHosted @5 :ThirdPartyCapId;
    # Level 3: A capability hosted by a third party. The receiver should contact the
    # third party to obtain direct access to this capability.
  }
}

struct PromisedAnswer {
  # Identifies a capability that will be returned by an answer that has not yet completed.
  # This enables promise pipelining.

  questionId @0 :QuestionId;
  # The answer (question) that will return the capability.

  transform @1 :List(Op);
  # Operations to apply to the result to get the desired capability.

  struct Op {
    # An operation to apply to a promised answer.
    union {
      noop @0 :Void;
      # No operation - use the result as-is.

      getPointerField @1 :UInt16;
      # Get a pointer field from the result struct.
    }
  }
}

struct Exception {
  # Describes a failed call.

  reason @0 :Text;
  # Human-readable failure description.

  type :group {
    # Machine-readable error type.
    union {
      failed @1 :Void;
      # Generic failure.

      overloaded @2 :Void;
      # The server is overloaded.

      disconnected @3 :Void;
      # The connection was disconnected.

      unimplemented @4 :Void;
      # The requested operation is not implemented.
    }
  }

  obsoleteIsCallersFault @5 :Bool;
  # Deprecated.

  obsoleteDurability @6 :UInt16;
  # Deprecated.
}

# ========================================================================================
# Network-specific Parameters
#
# The following types are placeholders that depend on the specific network transport being used.
# For the two-party network type (rpc-twoparty.capnp), these are defined differently.

struct SenderHostedCap {
  # Identifies a capability hosted by the sender.
  exportId @0 :ExportId;
  # For two-party connections, just the export ID.
}

struct SenderPromiseCap {
  # Identifies a promise for a capability hosted by the sender.
  exportId @0 :ExportId;
  # For two-party connections, just the export ID.
}

struct ReceiverHostedCap {
  # Identifies a capability hosted by the receiver.
  importId @0 :ImportId;
  # For two-party connections, just the import ID.
}

struct ThirdPartyCapId {
  # Level 3: Identifies a capability hosted by a third party.
  #
  # This is used when a capability is passed from Alice to Bob, but the capability
  # is actually hosted by Carol. Bob uses this ID to connect to Carol and pick up
  # the capability.

  id @0 :Data;
  # Network-specific identifier for the third-party capability.
  # This typically contains:
  # - The vat ID of the hosting vat (Carol)
  # - A provision ID that identifies the specific capability
  # - Connection hints (address, port, etc.)
}

struct RecipientId {
  # Level 3: Identifies a vat that is expected to receive a capability.
  #
  # This is used in Provide messages to specify who is allowed to pick up the
  # provided capability.

  id @0 :Data;
  # Network-specific identifier for the recipient vat.
  # This typically contains:
  # - The vat ID or public key of the recipient
  # - Authentication information
}

struct ProvisionId {
  # Level 3: Identifies a capability being provided to a recipient.
  #
  # This is used in Accept messages to identify which provided capability to pick up.

  id @0 :Data;
  # Network-specific identifier for the provision.
  # This is typically generated by the providing vat and is unique within the
  # context of the introduction.
}

# ========================================================================================
# Level 3 RPC: Three-way Introductions - Detailed Protocol
# ========================================================================================
#
# The three-way introduction protocol allows capabilities to be passed between vats
# that don't have a direct connection, and enables those vats to form direct connections.
#
# Example scenario: Alice wants to introduce Bob to Carol
#
# 1. Initial state:
#    - Alice has connections to both Bob and Carol
#    - Bob and Carol have no direct connection
#    - Alice holds a capability to Carol's service
#
# 2. Alice sends Carol a Provide message:
#    - questionId: new ID for this introduction
#    - target: the capability Alice wants to share (Carol's service)
#    - recipient: Bob's vat ID
#
# 3. Carol receives the Provide message:
#    - Creates a pending provision for Bob
#    - Returns an answer to Alice (can be empty)
#
# 4. Alice sends Bob a capability reference (CapDescriptor with thirdPartyHosted):
#    - thirdPartyCapId contains Carol's vat ID and provision ID
#
# 5. Bob receives the capability and wants to use it:
#    - Detects it's a third-party capability
#    - Establishes a connection to Carol (if not already connected)
#    - Sends an Accept message to Carol
#
# 6. Carol receives Bob's Accept:
#    - Matches the provision ID to the pending provision
#    - Returns the actual capability to Bob
#    - Bob can now call Carol directly
#
# 7. Embargo handling:
#    - If Bob was already calling Carol through Alice, those calls are embargoed
#    - Once the direct connection is established, the embargo is lifted
#    - Disembargo messages are used to synchronize this
#
# Key benefits:
# - Bob and Carol communicate directly, not through Alice
# - Alice doesn't see the messages between Bob and Carol
# - Reduces latency and load on Alice
# - Preserves capability security
#
# Cycle breaking with Embargo:
# - If Alice introduces Bob to Carol AND Carol to Bob simultaneously
# - Both introductions use embargo=true
# - This prevents deadlock where both wait for the other to complete
# - The embargoes are lifted once the connections are established

# ========================================================================================
# Phase 7: Dynamic Schema Transfer Protocol
# ========================================================================================
#
# This extension allows RPC clients to dynamically fetch schema information from servers.
# This is particularly useful for:
# - Dynamic languages that need runtime type information
# - Schema browsers and debugging tools
# - Generic proxies that need to understand message structures
# - Version negotiation between different protocol versions

struct SchemaRequest {
  # Request to fetch schema information from the remote vat.

  questionId @0 :QuestionId;
  # A new question ID identifying this request.

  targetSchema @1 :SchemaTarget;
  # Specifies which schema(s) to fetch.
}

struct SchemaTarget {
  # Specifies what schema information is being requested.

  union {
    allSchemas @0 :Void;
    # Request all schemas known to the remote vat.

    byTypeId @1 :UInt64;
    # Request schema for a specific type by its ID.

    byTypeName @2 :Text;
    # Request schema for a specific type by its fully qualified name.
    # Format: "package.module.TypeName" or "file.capnp:TypeName"

    byFileId @3 :UInt64;
    # Request all schemas from a specific file by its ID.

    byFileName @4 :Text;
    # Request all schemas from a specific file by its name/path.

    bootstrapInterface @5 :Void;
    # Request schema for the bootstrap interface only.
  }
}

struct SchemaResponse {
  # Response containing schema information.

  answerId @0 :AnswerId;
  # Equal to the QuestionId of the corresponding SchemaRequest.

  union {
    success @1 :SchemaPayload;
    # Schema data successfully retrieved.

    exception @2 :Exception;
    # Schema request failed (e.g., type not found, access denied).
  }
}

struct SchemaPayload {
  # Contains serialized schema information.
  # The schema is serialized using the standard Cap'n Proto schema format
  # (as defined in schema.capnp from the official Cap'n Proto distribution).

  schemaData @0 :Data;
  # Serialized schema nodes in Cap'n Proto binary format.
  # This is a serialized CodeGeneratorRequest or a subset thereof,
  # containing the requested Node definitions.

  format @1 :SchemaFormat;
  # Format of the schema data.

  sourceInfo @2 :Data;
  # Optional: Source information (doc comments, source locations) if available.
  # This is a serialized list of Node.SourceInfo.

  dependencies @3 :List(SchemaDependency);
  # List of imported schemas that may be needed to fully understand the returned schema.
}

enum SchemaFormat {
  # Supported schema serialization formats.

  binary @0;
  # Standard Cap'n Proto binary format (schema.capnp structs).
  # This is the preferred format for efficiency.

  json @1;
  # JSON representation of the schema.
  # More human-readable but less efficient.

  capnp @2;
  # Cap'n Proto schema language text format.
  # Human-readable schema definition source.
}

struct SchemaDependency {
  # Information about a schema dependency (import).

  fileId @0 :UInt64;
  # ID of the imported file.

  fileName @1 :Text;
  # Name/path of the imported file.

  schemaHash @2 :Data;
  # Optional hash of the schema content for caching/versioning.
}

struct SchemaCapability {
  # A capability that provides schema information.
  # This can be used to create dedicated schema provider interfaces.

  struct GetSchemaParams {
    target @0 :SchemaTarget;
    format @1 :SchemaFormat = binary;
  }

  struct GetSchemaResults {
    payload @0 :SchemaPayload;
  }

  getSchema @0 (params :GetSchemaParams) -> (results :GetSchemaResults);
  # Fetch schema information.

  listAvailableSchemas @1 () -> (results :ListSchemasResults);
  # List all schemas available from this provider.

  struct ListSchemasResults {
    schemas @0 :List(AvailableSchema);
  }

  struct AvailableSchema {
    typeId @0 :UInt64;
    displayName @1 :Text;
    fileId @2 :UInt64;
    fileName @3 :Text;
    isInterface @4 :Bool;
    isStruct @5 :Bool;
    isEnum @6 :Bool;
  }
}

# ========================================================================================
# Integration with RPC Message Types
# ========================================================================================
#
# To use schema requests, add these variants to the main Message struct:
#
# struct Message {
#   union {
#     # ... existing message types ...
#     schemaRequest @14 :SchemaRequest;
#     schemaResponse @15 :SchemaResponse;
#   }
# }
#
# Note: These are assigned ordinals 14 and 15 to follow after join @12.
# The Message struct in this file would need to be updated to include these.
