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

@0xb312981b2552a250;

# Cap'n Proto RPC Protocol Definition
# This is the official protocol definition for Cap'n Proto RPC.
# See: https://capnproto.org/rpc.html

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

    # Level 2 features (not implemented in Phase 1)
    obsoleteSave @7 :AnyPointer;
    obsoleteDelete @9 :AnyPointer;

    # Level 3 features (not implemented in Phase 1)
    provide @10 :Provide;
    accept @11 :Accept;

    # Level 4 features (not implemented in Phase 1)
    join @12 :Join;
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

# Level 3 message types ----------------------------------------------

struct Provide {
  # Message type sent to indicate that the sender wishes to make a particular capability 
  # implemented by the receiver available to a third party for direct access.

  questionId @0 :QuestionId;
  # Question ID to be held open until the recipient has received the capability.

  target @1 :MessageTarget;
  # What is to be provided to the third party.

  recipient @2 :RecipientId;
  # Identity of the third party that is expected to pick up the capability.
}

struct Accept {
  # Message type sent to pick up a capability hosted by the receiving vat and provided by a 
  # third party.

  questionId @0 :QuestionId;
  # A new question ID identifying this accept message.

  provision @1 :ProvisionId;
  # Identifies the provided object to be picked up.

  embargo @2 :Bool;
  # If true, this accept shall be temporarily embargoed.
}

# Level 4 message types ----------------------------------------------

struct Join {
  # Level 4: Message type sent to establish direct connectivity to the common root of two 
  # or more proxied capabilities.

  questionId @0 :QuestionId;
  # Question ID for this join operation.

  target @1 :MessageTarget;
  # The first capability to join.

  otherCap @2 :MessageTarget;
  # The second capability to join.

  joinId @3 :UInt32;
  # Identifier for this join operation.
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
    # Level 3: A capability hosted by a third party.
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
  id @0 :Data;
  # Placeholder for third-party capability ID.
}

struct RecipientId {
  # Level 3: Identifies a vat that is expected to receive a capability.
  id @0 :Data;
  # Placeholder for recipient ID.
}

struct ProvisionId {
  # Level 3: Identifies a capability being provided to a recipient.
  id @0 :Data;
  # Placeholder for provision ID.
}
