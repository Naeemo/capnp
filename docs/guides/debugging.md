# Debugging Guide

This guide explains how to use the debug configuration API to troubleshoot Cap'n Proto RPC connections and message handling.

## Enabling Debug Mode

### Environment Variable (Node.js)

The simplest way to enable debugging is by setting the `CAPNP_DEBUG` environment variable:

```bash
CAPNP_DEBUG=1 node your-app.js
```

Or in your code before importing the library:

```typescript
process.env.CAPNP_DEBUG = '1';
import { enableDebug } from '@naeemo/capnp';
```

### Programmatic API

You can also enable debug mode programmatically at runtime:

```typescript
import { enableDebug, disableDebug, isDebugEnabled } from '@naeemo/capnp';

// Enable with default options
enableDebug();

// Enable with custom options
enableDebug({
  colors: true,      // Enable colored output
  maxBytes: 512,     // Log up to 512 bytes of binary data
  filter: 'Call'     // Only log messages matching 'Call'
});

// Check if debug is enabled
if (isDebugEnabled()) {
  console.log('Debug mode is active');
}

// Disable debug mode
disableDebug();
```

## Debug Options

### `colors?: boolean`

Enable ANSI color codes in debug output. Default: `true`

Colors help distinguish different message types and make logs easier to read in terminal environments.

### `maxBytes?: number`

Maximum number of bytes to display when logging binary message data. Default: `256`

Large messages can generate overwhelming output. This option limits how much raw binary data is shown.

```typescript
enableDebug({ maxBytes: 1024 }); // Show up to 1KB of binary data
```

### `filter?: string | RegExp`

Filter debug output by message type or peer identifier. Default: `''` (no filter)

Useful when you only want to see specific types of messages:

```typescript
// Filter by message type name
enableDebug({ filter: 'Call' });

// Filter using regular expression
enableDebug({ filter: /^(Call|Return)$/ });

// Filter by peer (format: "messageType:peerId")
enableDebug({ filter: 'Call:client1' });
```

## What Information is Logged

When debug mode is enabled, the following information is logged:

### Message Events

- **Send/Receive**: All RPC messages sent and received
- **Message Type**: Bootstrap, Call, Return, Finish, Resolve, Release, etc.
- **Payload Size**: Number of bytes in the message
- **Binary Preview**: Hex dump of message content (respecting `maxBytes`)

### Connection Events

- **Connection Opened**: When a new RPC connection is established
- **Connection Closed**: When a connection is terminated
- **Capability Resolution**: When promises are resolved
- **Pipeline Operations**: Promise pipelining activity

### Error Events

- **Serialization Errors**: Issues encoding/decoding messages
- **Protocol Errors**: RPC protocol violations
- **Transport Errors**: WebSocket/TCP connection issues
- **Timeout Events**: Operation timeouts

### Example Debug Output

```
[CAPNP:DEBUG] [SND] Call (questionId=1, interfaceId=0x12345678, methodId=0)
  Target: imported capability #5
  Payload: 45 bytes
  Hex: 00 00 00 00 05 00 00 00 00 00 00 00 ...
[CAPNP:DEBUG] [RCV] Return (answerId=1)
  Result: success (30 bytes)
  Hex: 00 00 00 00 00 00 00 00 0a 00 00 00 ...
```

## Performance Impact

Debug mode has the following performance implications:

### Minimal Impact (when disabled)

When debug mode is disabled (default):
- No runtime overhead for debug checks
- Debug code is tree-shakeable in production builds
- Zero memory overhead

### Moderate Impact (when enabled)

When debug mode is enabled:
- **CPU**: ~5-10% overhead due to message inspection
- **Memory**: Additional buffering for hex formatting
- **I/O**: Console output can slow down high-throughput scenarios

### Recommendations

1. **Development**: Always enable debug mode during development
2. **Production**: Use environment variable to conditionally enable
3. **High Throughput**: Use filtering to reduce log volume
4. **Binary Data**: Lower `maxBytes` for large message scenarios

```typescript
// Production-safe debug setup
import { enableDebug } from '@naeemo/capnp';

if (process.env.NODE_ENV !== 'production' || process.env.CAPNP_DEBUG) {
  enableDebug({
    colors: process.env.NODE_ENV !== 'production',
    maxBytes: 128,
    filter: process.env.CAPNP_FILTER
  });
}
```

## Troubleshooting Tips

### No Debug Output

1. Verify debug mode is enabled: `console.log(isDebugEnabled())`
2. Check filter settings - might be too restrictive
3. Ensure imports happen after enabling debug

### Too Much Output

1. Use `filter` option to narrow scope
2. Reduce `maxBytes` to limit binary data
3. Consider disabling colors if piping to a file

### Performance Issues

1. Disable debug in production builds
2. Use aggressive filtering for high-frequency messages
3. Set `maxBytes: 0` to skip binary data entirely

## Integration with Logging Libraries

The debug API can be integrated with structured logging systems:

```typescript
import { enableDebug, isDebugEnabled } from '@naeemo/capnp';
import { createLogger } from './my-logger';

const logger = createLogger();

// Enable Cap'n Proto debug mode
enableDebug({
  colors: false,  // Let the logging library handle colors
  maxBytes: 256
});

// Redirect debug output to your logger
const originalLog = console.log;
console.log = (...args) => {
  if (isDebugEnabled() && args[0]?.includes('[CAPNP:DEBUG]')) {
    logger.debug('capnp', args.join(' '));
  } else {
    originalLog.apply(console, args);
  }
};
```
