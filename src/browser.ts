// Browser-specific entry point
// Uses the web-targeted WASM build

export { MessageReader, MessageBuilder } from './message.js';
export { StructReader, StructBuilder, List, Text, Data } from './struct.js';

// Browser-specific: auto-initialize WASM on import
import { initWasm } from './wasm/index.js';
export { initWasm };

// Auto-init for convenience
initWasm().catch(console.error);
