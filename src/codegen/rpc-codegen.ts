/**
 * RPC Code Generation Extensions for V3 Generator
 *
 * Phase 3: Generate complete RPC Client classes and Server interfaces
 */

import type { NodeReader } from '../schema/schema-reader.js';

/**
 * CallContext for server method handlers
 */
export interface CallContext<TParams, TResults> {
  /** Get the parameters of the call */
  getParams(): TParams;

  /** Get the results builder to set return values */
  getResults(): TResults;

  /** Complete the call with the current results */
  return(): void;

  /** Complete the call with an exception */
  throwException(
    reason: string,
    type?: 'failed' | 'overloaded' | 'disconnected' | 'unimplemented'
  ): void;
}

/**
 * Options for RPC code generation
 */
export interface RpcCodegenOptions {
  /** Import path for RPC runtime */
  rpcImportPath?: string;
  /** Import path for core runtime */
  coreImportPath?: string;
  /** Generate server stubs */
  generateServerStubs?: boolean;
  /** Generate client classes */
  generateClientClasses?: boolean;
}

const DEFAULT_RPC_OPTIONS: RpcCodegenOptions = {
  rpcImportPath: '@naeemo/capnp/rpc',
  coreImportPath: '@naeemo/capnp',
  generateServerStubs: true,
  generateClientClasses: true,
};

/**
 * Generate complete RPC code for an interface node
 */
export function generateRpcCode(
  node: NodeReader,
  allNodes: NodeReader[],
  options?: RpcCodegenOptions
): string {
  const opts = { ...DEFAULT_RPC_OPTIONS, ...options };
  const lines: string[] = [];

  const interfaceName = getShortName(node.displayName);
  const methods = node.interfaceMethods;

  if (methods.length === 0) {
    return `// Interface ${interfaceName} has no methods`;
  }

  // 1. Generate Method ID constants
  lines.push(`// ${interfaceName} Method IDs`);
  lines.push(`export const ${interfaceName}InterfaceId = ${node.id}n;`);
  lines.push(`export const ${interfaceName}MethodIds = {`);
  for (const method of methods) {
    lines.push(`  ${method.name}: ${method.codeOrder},`);
  }
  lines.push('} as const;');
  lines.push('');

  // 2. Generate Server Interface
  if (opts.generateServerStubs) {
    lines.push(generateServerInterface(node, allNodes, opts));
    lines.push('');

    // Generate Server Stub
    lines.push(generateServerStub(node, allNodes, opts));
    lines.push('');
  }

  // 3. Generate Client Class
  if (opts.generateClientClasses) {
    lines.push(generateClientClass(node, allNodes, opts));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate Server Interface
 */
function generateServerInterface(
  node: NodeReader,
  allNodes: NodeReader[],
  _opts: RpcCodegenOptions
): string {
  const lines: string[] = [];
  const interfaceName = getShortName(node.displayName);
  const methods = node.interfaceMethods;

  lines.push(`// ${interfaceName} Server Interface`);
  lines.push(`export interface ${interfaceName}Server {`);
  for (const method of methods) {
    const paramType = getTypeNameById(method.paramStructType, allNodes, 'unknown');
    const resultType = getTypeNameById(method.resultStructType, allNodes, 'unknown');
    lines.push(
      `  ${method.name}(context: CallContext<${paramType}Reader, ${resultType}Builder>): Promise<void> | void;`
    );
  }
  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate Server Stub - handles message dispatch
 */
function generateServerStub(
  node: NodeReader,
  allNodes: NodeReader[],
  _opts: RpcCodegenOptions
): string {
  const lines: string[] = [];
  const interfaceName = getShortName(node.displayName);
  const methods = node.interfaceMethods;

  lines.push(`// ${interfaceName} Server Stub`);
  lines.push(`export class ${interfaceName}Stub {`);
  lines.push(`  private server: ${interfaceName}Server;`);
  lines.push('');
  lines.push(`  constructor(server: ${interfaceName}Server) {`);
  lines.push('    this.server = server;');
  lines.push('  }');
  lines.push('');
  lines.push(`  static readonly interfaceId = ${node.id}n;`);
  lines.push('');
  lines.push('  /** Dispatch a method call to the appropriate handler */');
  lines.push(
    '  async dispatch(methodId: number, context: CallContext<unknown, unknown>): Promise<void> {'
  );
  lines.push('    switch (methodId) {');

  for (const method of methods) {
    const paramType = getTypeNameById(method.paramStructType, allNodes, 'unknown');
    const resultType = getTypeNameById(method.resultStructType, allNodes, 'unknown');
    lines.push(`      case ${interfaceName}MethodIds.${method.name}:`);
    lines.push(
      `        return this.server.${method.name}(context as CallContext<${paramType}Reader, ${resultType}Builder>);`
    );
  }

  lines.push('      default:');
  lines.push('        throw new Error(`Unknown method ID: ${methodId}`);');
  lines.push('    }');
  lines.push('  }');
  lines.push('');
  lines.push('  /** Check if a method ID is valid */');
  lines.push('  isValidMethod(methodId: number): boolean {');
  lines.push('    return [');
  for (const method of methods) {
    lines.push(`      ${interfaceName}MethodIds.${method.name},`);
  }
  lines.push('    ].includes(methodId);');
  lines.push('  }');
  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate Client Class with Promise Pipelining support
 */
function generateClientClass(
  node: NodeReader,
  allNodes: NodeReader[],
  opts: RpcCodegenOptions
): string {
  const lines: string[] = [];
  const interfaceName = getShortName(node.displayName);
  const methods = node.interfaceMethods;

  lines.push(`// ${interfaceName} Client Class`);
  lines.push(
    `import type { RpcConnection, PipelineClient, Payload } from '${opts.rpcImportPath}';`
  );
  lines.push(`import { BaseCapabilityClient } from '${opts.rpcImportPath}';`);
  lines.push('');
  lines.push(`export class ${interfaceName}Client extends BaseCapabilityClient {`);
  lines.push(`  static readonly interfaceId = ${node.id}n;`);
  lines.push('');

  // Constructor with connection
  lines.push('  constructor(connection: RpcConnection, importId?: number) {');
  lines.push('    super(connection, importId);');
  lines.push('  }');
  lines.push('');

  for (const method of methods) {
    const paramType = getTypeNameById(method.paramStructType, allNodes, 'unknown');
    const resultType = getTypeNameById(method.resultStructType, allNodes, 'unknown');

    // Generate method documentation
    lines.push('  /**');
    lines.push(`   * ${method.name}`);
    lines.push(`   * @param params - ${paramType}`);
    lines.push(`   * @returns Promise<${resultType}Reader>`);
    lines.push('   */');

    // Generate method signature
    lines.push(
      `  async ${method.name}(params: ${paramType}Builder): Promise<${resultType}Reader> {`
    );
    lines.push('    const result = await this.callMethod(');
    lines.push(`      ${interfaceName}Client.interfaceId,`);
    lines.push(`      ${interfaceName}MethodIds.${method.name},`);
    lines.push('      this.serializeParams(params)');
    lines.push('    );');
    lines.push(`    return new ${resultType}Reader(result as StructReader);`);
    lines.push('  }');
    lines.push('');

    // Generate pipelined version
    lines.push('  /**');
    lines.push(`   * ${method.name} with pipelining support`);
    lines.push(`   * @param params - ${paramType}`);
    lines.push(`   * @returns PipelineClient<${resultType}Reader>`);
    lines.push('   */');
    lines.push(
      `  ${method.name}Pipelined(params: ${paramType}Builder): PipelineClient<${resultType}Reader> {`
    );
    lines.push('    return this.callMethodPipelined(');
    lines.push(`      ${interfaceName}Client.interfaceId,`);
    lines.push(`      ${interfaceName}MethodIds.${method.name},`);
    lines.push('      this.serializeParams(params)');
    lines.push(`    ) as PipelineClient<${resultType}Reader>;`);
    lines.push('  }');
    lines.push('');
  }

  lines.push('  /** Serialize parameters to Payload */');
  lines.push('  private serializeParams(params: unknown): Payload {');
  lines.push('    // TODO: Implement parameter serialization');
  lines.push('    return { content: new Uint8Array(), capTable: [] };');
  lines.push('  }');
  lines.push('}');

  return lines.join('\n');
}

/**
 * Get type name by ID
 */
function getTypeNameById(id: bigint, allNodes: NodeReader[], fallback: string): string {
  const node = allNodes.find((n) => n.id === id);
  if (!node) return fallback;
  return getShortName(node.displayName);
}

/**
 * Get short name from display name
 */
function getShortName(displayName: string): string {
  if (!displayName) {
    return 'Unknown';
  }
  const colonIndex = displayName.lastIndexOf(':');
  let name = colonIndex >= 0 ? displayName.substring(colonIndex + 1) : displayName;

  if (name.includes('.')) {
    const parts = name.split('.');
    if (parts.length === 2 && parts[1].includes('$')) {
      const methodPart = parts[1];
      const dollarIndex = methodPart.indexOf('$');
      if (dollarIndex > 0) {
        const methodName = methodPart.substring(0, dollarIndex);
        const suffix = methodPart.substring(dollarIndex + 1);
        name = capitalize(methodName) + suffix;
      } else {
        name = capitalize(parts[1]);
      }
    } else {
      name = parts[parts.length - 1];
    }
  }

  name = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return name;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
