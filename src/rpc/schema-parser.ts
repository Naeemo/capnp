/**
 * Phase 7: Dynamic Schema Transfer Protocol - Schema Parser
 *
 * This module provides runtime parsing of Cap'n Proto schema binary data,
 * allowing dynamic generation of readers/writers for types not known at compile time.
 */

import type {
  SchemaAnnotation,
  SchemaBrand,
  SchemaBrandBinding,
  SchemaBrandScope,
  SchemaField,
  SchemaMethod,
  SchemaNode,
  SchemaType,
  SchemaTypeKind,
  SchemaValue,
} from './schema-types.js';
import { SchemaNodeType } from './schema-types.js';

/**
 * Parse schema binary data into SchemaNode objects
 *
 * This parses the CodeGeneratorRequest format from schema.capnp
 */
export function parseSchemaNodes(data: Uint8Array): SchemaNode[] {
  const parser = new SchemaParser(data);
  return parser.parse();
}

/**
 * Schema parser class
 */
class SchemaParser {
  private data: Uint8Array;
  private view: DataView;
  private textDecoder = new TextDecoder();

  constructor(data: Uint8Array) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  /**
   * Parse the schema data and return all nodes
   */
  parse(): SchemaNode[] {
    // Parse the CodeGeneratorRequest structure
    // See schema.capnp for the exact layout

    const nodes: SchemaNode[] = [];

    // Handle empty data
    if (this.data.length < 8) {
      return nodes;
    }

    // CodeGeneratorRequest layout:
    // - capnpVersion: CapnpVersion (4 bytes)
    // - nodes: List(Node) - pointer at offset 8
    // - sourceInfo: List(Node.SourceInfo) - pointer at offset 16
    // - requestedFiles: List(RequestedFile) - pointer at offset 24

    // Read nodes list pointer
    const nodesPtr = this.readPointer(8);
    if (nodesPtr.offset > 0 && nodesPtr.size > 0) {
      const nodeList = this.readStructList(nodesPtr.offset, nodesPtr.size, (offset) =>
        this.parseNode(offset)
      );
      nodes.push(...nodeList);
    }

    return nodes;
  }

  /**
   * Parse a single Node structure
   */
  private parseNode(offset: number): SchemaNode {
    // Node layout (from schema.capnp):
    // - id: UInt64 @0
    // - displayName: Text @1
    // - displayNamePrefixLength: UInt32 @2
    // - scopeId: UInt64 @3
    // - parameters: List(Parameter) @32
    // - isGeneric: Bool @33
    // - nestedNodes: List(NestedNode) @4
    // - annotations: List(Annotation) @5
    // - union: @6 (various node types)

    const id = this.view.getBigUint64(offset, true);

    // Read displayName (pointer at offset 8)
    const displayNamePtr = this.readPointer(offset + 8);
    const displayName = this.readText(displayNamePtr.offset, displayNamePtr.size);

    // Read displayNamePrefixLength
    const displayNamePrefixLength = this.view.getUint32(offset + 16, true);

    // Read scopeId
    const scopeId = this.view.getBigUint64(offset + 24, true);

    // Read nestedNodes (pointer at offset 32)
    const nestedNodesPtr = this.readPointer(offset + 32);
    const nestedNodes =
      nestedNodesPtr.offset > 0 && nestedNodesPtr.size > 0
        ? this.readStructList(nestedNodesPtr.offset, nestedNodesPtr.size, (noffset) =>
            this.parseNestedNode(noffset)
          )
        : [];

    // Read annotations (pointer at offset 40)
    const annotationsPtr = this.readPointer(offset + 40);
    const annotations =
      annotationsPtr.offset > 0 && annotationsPtr.size > 0
        ? this.readStructList(annotationsPtr.offset, annotationsPtr.size, (aoffset) =>
            this.parseAnnotation(aoffset)
          )
        : [];

    // Read node type union (discriminant at offset 48, data starts at 56)
    const discriminant = this.view.getUint16(offset + 48, true);
    const type = this.mapNodeType(discriminant);

    const node: SchemaNode = {
      id,
      displayName,
      displayNamePrefixLength,
      scopeId,
      nestedNodes,
      annotations,
      type,
    };

    // Parse type-specific data
    const unionOffset = offset + 56;
    switch (type) {
      case SchemaNodeType.STRUCT:
        node.structInfo = this.parseStructInfo(unionOffset);
        break;
      case SchemaNodeType.ENUM:
        node.enumInfo = this.parseEnumInfo(unionOffset);
        break;
      case SchemaNodeType.INTERFACE:
        node.interfaceInfo = this.parseInterfaceInfo(unionOffset);
        break;
      case SchemaNodeType.CONST:
        node.constInfo = this.parseConstInfo(unionOffset);
        break;
      case SchemaNodeType.ANNOTATION:
        node.annotationInfo = this.parseAnnotationInfo(unionOffset);
        break;
    }

    return node;
  }

  /**
   * Parse nested node reference
   */
  private parseNestedNode(offset: number): { name: string; id: bigint } {
    // NestedNode layout:
    // - name: Text @0
    // - id: UInt64 @1

    const namePtr = this.readPointer(offset);
    const name = this.readText(namePtr.offset, namePtr.size);
    const id = this.view.getBigUint64(offset + 8, true);

    return { name, id };
  }

  /**
   * Parse annotation
   */
  private parseAnnotation(offset: number): SchemaAnnotation {
    // Annotation layout:
    // - id: UInt64 @0
    // - brand: Brand @2
    // - value: Value @1

    const id = this.view.getBigUint64(offset, true);

    const valuePtr = this.readPointer(offset + 8);
    const value = this.parseValue(valuePtr.offset);

    const brandPtr = this.readPointer(offset + 16);
    const brand = brandPtr.offset > 0 ? this.parseBrand(brandPtr.offset) : { scopes: [] };

    return { id, value, brand };
  }

  /**
   * Parse struct-specific info
   */
  private parseStructInfo(offset: number): NonNullable<SchemaNode['structInfo']> {
    // Struct group layout:
    // - dataWordCount: UInt16 @7
    // - pointerCount: UInt16 @8
    // - preferredListEncoding: ElementSize @9
    // - isGroup: Bool @10
    // - discriminantCount: UInt16 @11
    // - discriminantOffset: UInt32 @12
    // - fields: List(Field) @13

    const dataWordCount = this.view.getUint16(offset, true);
    const pointerCount = this.view.getUint16(offset + 2, true);
    const preferredListEncoding = this.view.getUint16(offset + 4, true);
    const isGroup = this.view.getUint8(offset + 6) !== 0;
    const discriminantCount = this.view.getUint16(offset + 8, true);
    const discriminantOffset = this.view.getUint32(offset + 12, true);

    const fieldsPtr = this.readPointer(offset + 16);
    const fields =
      fieldsPtr.offset > 0 && fieldsPtr.size > 0
        ? this.readStructList(fieldsPtr.offset, fieldsPtr.size, (foffset) =>
            this.parseField(foffset)
          )
        : [];

    return {
      dataWordCount,
      pointerCount,
      preferredListEncoding,
      isGroup,
      discriminantCount,
      discriminantOffset,
      fields,
    };
  }

  /**
   * Parse field definition
   */
  private parseField(offset: number): SchemaField {
    // Field layout:
    // - name: Text @0
    // - codeOrder: UInt16 @1
    // - annotations: List(Annotation) @2
    // - discriminantValue: UInt16 @3
    // - union: slot/group @4
    // - ordinal: union @8

    const namePtr = this.readPointer(offset);
    const name = this.readText(namePtr.offset, namePtr.size);

    const codeOrder = this.view.getUint16(offset + 8, true);

    const discriminantValue = this.view.getUint16(offset + 12, true);

    // Read slot info (simplified - assumes slot type)
    const slotOffset = this.view.getUint32(offset + 24, true);

    const typePtr = this.readPointer(offset + 32);
    const type = this.parseType(typePtr.offset);

    const defaultValuePtr = this.readPointer(offset + 40);
    const defaultValue =
      defaultValuePtr.offset > 0 ? this.parseValue(defaultValuePtr.offset) : undefined;

    const hadExplicitDefault = this.view.getUint8(offset + 48) !== 0;

    return {
      name,
      codeOrder,
      discriminantValue,
      offset: slotOffset,
      type,
      defaultValue,
      hadExplicitDefault,
    };
  }

  /**
   * Parse type definition
   */
  private parseType(offset: number): SchemaType {
    // Type is a union, discriminant at offset
    const discriminant = this.view.getUint16(offset, true);
    const kind = this.parseTypeKind(discriminant, offset + 8);

    return { kind };
  }

  /**
   * Parse type kind based on discriminant
   */
  private parseTypeKind(discriminant: number, offset: number): SchemaTypeKind {
    // Type discriminant values (from schema.capnp):
    // void @0, bool @1, int8 @2, int16 @3, int32 @4, int64 @5,
    // uint8 @6, uint16 @7, uint32 @8, uint64 @9,
    // float32 @10, float64 @11, text @12, data @13,
    // list @14, enum @15, struct @16, interface @17, anyPointer @18

    switch (discriminant) {
      case 0:
        return { type: 'void' };
      case 1:
        return { type: 'bool' };
      case 2:
        return { type: 'int8' };
      case 3:
        return { type: 'int16' };
      case 4:
        return { type: 'int32' };
      case 5:
        return { type: 'int64' };
      case 6:
        return { type: 'uint8' };
      case 7:
        return { type: 'uint16' };
      case 8:
        return { type: 'uint32' };
      case 9:
        return { type: 'uint64' };
      case 10:
        return { type: 'float32' };
      case 11:
        return { type: 'float64' };
      case 12:
        return { type: 'text' };
      case 13:
        return { type: 'data' };
      case 14: {
        const elementTypePtr = this.readPointer(offset);
        const elementType = this.parseType(elementTypePtr.offset);
        return { type: 'list', elementType };
      }
      case 15: {
        const typeId = this.view.getBigUint64(offset, true);
        const brandPtr = this.readPointer(offset + 8);
        const brand = brandPtr.offset > 0 ? this.parseBrand(brandPtr.offset) : undefined;
        return { type: 'enum', typeId, brand };
      }
      case 16: {
        const typeId = this.view.getBigUint64(offset, true);
        const brandPtr = this.readPointer(offset + 8);
        const brand = brandPtr.offset > 0 ? this.parseBrand(brandPtr.offset) : undefined;
        return { type: 'struct', typeId, brand };
      }
      case 17: {
        const typeId = this.view.getBigUint64(offset, true);
        const brandPtr = this.readPointer(offset + 8);
        const brand = brandPtr.offset > 0 ? this.parseBrand(brandPtr.offset) : undefined;
        return { type: 'interface', typeId, brand };
      }
      case 18: {
        // anyPointer is a nested union
        const anyPtrDisc = this.view.getUint16(offset, true);
        return this.parseAnyPointerKind(anyPtrDisc, offset + 8);
      }
      default:
        return { type: 'void' };
    }
  }

  /**
   * Parse anyPointer constraint
   */
  private parseAnyPointerKind(discriminant: number, offset: number): SchemaTypeKind {
    // anyPointer union:
    // - unconstrained @0 (with sub-union)
    // - parameter @1
    // - implicitMethodParameter @2

    switch (discriminant) {
      case 0: {
        // unconstrained sub-union
        const subDisc = this.view.getUint16(offset, true);
        const kinds = ['anyKind', 'struct', 'list', 'capability'] as const;
        return {
          type: 'anyPointer',
          constraint: { type: 'unconstrained', kind: kinds[subDisc] ?? 'anyKind' },
        };
      }
      case 1: {
        const scopeId = this.view.getBigUint64(offset, true);
        const parameterIndex = this.view.getUint16(offset + 8, true);
        return {
          type: 'anyPointer',
          constraint: { type: 'parameter', scopeId, parameterIndex },
        };
      }
      case 2: {
        const parameterIndex = this.view.getUint16(offset, true);
        return {
          type: 'anyPointer',
          constraint: { type: 'implicitMethodParameter', parameterIndex },
        };
      }
      default:
        return { type: 'anyPointer', constraint: { type: 'unconstrained', kind: 'anyKind' } };
    }
  }

  /**
   * Parse brand (generic type bindings)
   */
  private parseBrand(offset: number): SchemaBrand {
    // Brand layout:
    // - scopes: List(Scope) @0

    const scopesPtr = this.readPointer(offset);
    const scopes =
      scopesPtr.offset > 0 && scopesPtr.size > 0
        ? this.readStructList(scopesPtr.offset, scopesPtr.size, (soffset) =>
            this.parseBrandScope(soffset)
          )
        : [];

    return { scopes };
  }

  /**
   * Parse brand scope
   */
  private parseBrandScope(offset: number): SchemaBrandScope {
    // Scope layout:
    // - scopeId: UInt64 @0
    // - union: bind/inherit @1

    const scopeId = this.view.getBigUint64(offset, true);
    const discriminant = this.view.getUint16(offset + 8, true);

    let bindings: SchemaBrandBinding[] = [];

    if (discriminant === 0) {
      // bind: List(Binding)
      const bindingsPtr = this.readPointer(offset + 16);
      bindings =
        bindingsPtr.offset > 0 && bindingsPtr.size > 0
          ? this.readStructList(bindingsPtr.offset, bindingsPtr.size, (boffset) =>
              this.parseBrandBinding(boffset)
            )
          : [];
    }
    // inherit: no data needed

    return { scopeId, bindings };
  }

  /**
   * Parse brand binding
   */
  private parseBrandBinding(offset: number): SchemaBrandBinding {
    // Binding layout:
    // - union: unbound @0, type @1

    const discriminant = this.view.getUint16(offset, true);

    if (discriminant === 0) {
      return { type: 'unbound' };
    }
    const typePtr = this.readPointer(offset + 8);
    const type = this.parseType(typePtr.offset);
    return { type: 'type', value: type };
  }

  /**
   * Parse value
   */
  private parseValue(offset: number): SchemaValue {
    // Value is a union, discriminant at offset
    const discriminant = this.view.getUint16(offset, true);
    const dataOffset = offset + 8;

    switch (discriminant) {
      case 0:
        return { type: 'void' };
      case 1:
        return { type: 'bool', value: this.view.getUint8(dataOffset) !== 0 };
      case 2:
        return { type: 'int8', value: this.view.getInt8(dataOffset) };
      case 3:
        return { type: 'int16', value: this.view.getInt16(dataOffset, true) };
      case 4:
        return { type: 'int32', value: this.view.getInt32(dataOffset, true) };
      case 5:
        return { type: 'int64', value: this.view.getBigInt64(dataOffset, true) };
      case 6:
        return { type: 'uint8', value: this.view.getUint8(dataOffset) };
      case 7:
        return { type: 'uint16', value: this.view.getUint16(dataOffset, true) };
      case 8:
        return { type: 'uint32', value: this.view.getUint32(dataOffset, true) };
      case 9:
        return { type: 'uint64', value: this.view.getBigUint64(dataOffset, true) };
      case 10:
        return { type: 'float32', value: this.view.getFloat32(dataOffset, true) };
      case 11:
        return { type: 'float64', value: this.view.getFloat64(dataOffset, true) };
      case 12: {
        const ptr = this.readPointer(dataOffset);
        return { type: 'text', value: this.readText(ptr.offset, ptr.size) };
      }
      case 13: {
        const ptr = this.readPointer(dataOffset);
        return { type: 'data', value: this.data.slice(ptr.offset, ptr.offset + ptr.size) };
      }
      case 14:
        return { type: 'list', value: null }; // Simplified
      case 15:
        return { type: 'enum', value: this.view.getUint16(dataOffset, true) };
      case 16:
        return { type: 'struct', value: null }; // Simplified
      case 17:
        return { type: 'interface' };
      case 18:
        return { type: 'anyPointer', value: null }; // Simplified
      default:
        return { type: 'void' };
    }
  }

  /**
   * Parse enum-specific info
   */
  private parseEnumInfo(offset: number): NonNullable<SchemaNode['enumInfo']> {
    // Enum group layout:
    // - enumerants: List(Enumerant) @14

    const enumerantsPtr = this.readPointer(offset);
    const enumerants =
      enumerantsPtr.offset > 0 && enumerantsPtr.size > 0
        ? this.readStructList(enumerantsPtr.offset, enumerantsPtr.size, (eoffset) =>
            this.parseEnumerant(eoffset)
          )
        : [];

    return { enumerants };
  }

  /**
   * Parse enumerant
   */
  private parseEnumerant(offset: number): {
    name: string;
    codeOrder: number;
    annotations: SchemaAnnotation[];
  } {
    // Enumerant layout:
    // - name: Text @0
    // - codeOrder: UInt16 @1
    // - annotations: List(Annotation) @2

    const namePtr = this.readPointer(offset);
    const name = this.readText(namePtr.offset, namePtr.size);

    const codeOrder = this.view.getUint16(offset + 8, true);

    const annotationsPtr = this.readPointer(offset + 16);
    const annotations =
      annotationsPtr.offset > 0 && annotationsPtr.size > 0
        ? this.readStructList(annotationsPtr.offset, annotationsPtr.size, (aoffset) =>
            this.parseAnnotation(aoffset)
          )
        : [];

    return { name, codeOrder, annotations };
  }

  /**
   * Parse interface-specific info
   */
  private parseInterfaceInfo(offset: number): NonNullable<SchemaNode['interfaceInfo']> {
    // Interface group layout:
    // - methods: List(Method) @15
    // - superclasses: List(Superclass) @31

    const methodsPtr = this.readPointer(offset);
    const methods =
      methodsPtr.offset > 0 && methodsPtr.size > 0
        ? this.readStructList(methodsPtr.offset, methodsPtr.size, (moffset) =>
            this.parseMethod(moffset)
          )
        : [];

    const superclassesPtr = this.readPointer(offset + 8);
    const superclasses =
      superclassesPtr.offset > 0 && superclassesPtr.size > 0
        ? this.readStructList(superclassesPtr.offset, superclassesPtr.size, (soffset) =>
            this.parseSuperclass(soffset)
          )
        : [];

    return { methods, superclasses };
  }

  /**
   * Parse method
   */
  private parseMethod(offset: number): SchemaMethod {
    // Method layout:
    // - name: Text @0
    // - codeOrder: UInt16 @1
    // - implicitParameters: List(Parameter) @7
    // - paramStructType: UInt64 @2
    // - paramBrand: Brand @5
    // - resultStructType: UInt64 @3
    // - resultBrand: Brand @6
    // - annotations: List(Annotation) @4

    const namePtr = this.readPointer(offset);
    const name = this.readText(namePtr.offset, namePtr.size);

    const codeOrder = this.view.getUint16(offset + 8, true);

    const paramStructType = this.view.getBigUint64(offset + 16, true);
    const resultStructType = this.view.getBigUint64(offset + 24, true);

    const annotationsPtr = this.readPointer(offset + 32);
    const annotations =
      annotationsPtr.offset > 0 && annotationsPtr.size > 0
        ? this.readStructList(annotationsPtr.offset, annotationsPtr.size, (aoffset) =>
            this.parseAnnotation(aoffset)
          )
        : [];

    return { name, codeOrder, paramStructType, resultStructType, annotations };
  }

  /**
   * Parse superclass
   */
  private parseSuperclass(offset: number): { id: bigint; brand: SchemaBrand } {
    // Superclass layout:
    // - id: UInt64 @0
    // - brand: Brand @1

    const id = this.view.getBigUint64(offset, true);

    const brandPtr = this.readPointer(offset + 8);
    const brand = brandPtr.offset > 0 ? this.parseBrand(brandPtr.offset) : { scopes: [] };

    return { id, brand };
  }

  /**
   * Parse const-specific info
   */
  private parseConstInfo(offset: number): NonNullable<SchemaNode['constInfo']> {
    // Const group layout:
    // - type: Type @16
    // - value: Value @17

    const typePtr = this.readPointer(offset);
    const type = this.parseType(typePtr.offset);

    const valuePtr = this.readPointer(offset + 8);
    const value = this.parseValue(valuePtr.offset);

    return { type, value };
  }

  /**
   * Parse annotation-specific info
   */
  private parseAnnotationInfo(offset: number): NonNullable<SchemaNode['annotationInfo']> {
    // Annotation group layout:
    // - type: Type @18
    // - targetsFile: Bool @19
    // - targetsConst: Bool @20
    // - targetsEnum: Bool @21
    // - targetsEnumerant: Bool @22
    // - targetsStruct: Bool @23
    // - targetsField: Bool @24
    // - targetsUnion: Bool @25
    // - targetsGroup: Bool @26
    // - targetsInterface: Bool @27
    // - targetsMethod: Bool @28
    // - targetsParam: Bool @29
    // - targetsAnnotation: Bool @30

    const typePtr = this.readPointer(offset);
    const type = this.parseType(typePtr.offset);

    const flags = this.view.getUint16(offset + 8, true);

    return {
      type,
      targetsFile: (flags & 0x0001) !== 0,
      targetsConst: (flags & 0x0002) !== 0,
      targetsEnum: (flags & 0x0004) !== 0,
      targetsEnumerant: (flags & 0x0008) !== 0,
      targetsStruct: (flags & 0x0010) !== 0,
      targetsField: (flags & 0x0020) !== 0,
      targetsUnion: (flags & 0x0040) !== 0,
      targetsGroup: (flags & 0x0080) !== 0,
      targetsInterface: (flags & 0x0100) !== 0,
      targetsMethod: (flags & 0x0200) !== 0,
      targetsParam: (flags & 0x0400) !== 0,
      targetsAnnotation: (flags & 0x0800) !== 0,
    };
  }

  /**
   * Map node type discriminant to SchemaNodeType
   */
  private mapNodeType(discriminant: number): SchemaNodeType {
    // Node union discriminant values:
    // file @6, struct @7, enum @8, interface @9, const @10, annotation @11
    const types: SchemaNodeType[] = [
      SchemaNodeType.FILE, // 0 (placeholder)
      SchemaNodeType.FILE, // 1 (placeholder)
      SchemaNodeType.FILE, // 2 (placeholder)
      SchemaNodeType.FILE, // 3 (placeholder)
      SchemaNodeType.FILE, // 4 (placeholder)
      SchemaNodeType.FILE, // 5 (placeholder)
      SchemaNodeType.FILE, // 6
      SchemaNodeType.STRUCT, // 7
      SchemaNodeType.ENUM, // 8
      SchemaNodeType.INTERFACE, // 9
      SchemaNodeType.CONST, // 10
      SchemaNodeType.ANNOTATION, // 11
    ];
    return types[discriminant] ?? SchemaNodeType.FILE;
  }

  /**
   * Read a pointer value
   */
  private readPointer(offset: number): { offset: number; size: number } {
    // Simplified pointer encoding
    // In real Cap'n Proto, this would decode the full pointer structure
    const wordOffset = this.view.getInt32(offset, true);
    const sizeAndType = this.view.getUint32(offset + 4, true);
    const size = sizeAndType & 0xffffff;
    const _type = (sizeAndType >> 24) & 0x07;

    if (wordOffset === 0 && size === 0) {
      return { offset: 0, size: 0 };
    }

    // Calculate absolute offset
    const absoluteOffset = offset + 8 + wordOffset * 8;

    return { offset: absoluteOffset, size };
  }

  /**
   * Read text from offset
   */
  private readText(offset: number, size: number): string {
    if (size === 0) return '';
    // Text includes null terminator, so subtract 1
    const actualSize = size > 0 ? size - 1 : 0;
    const bytes = this.data.slice(offset, offset + actualSize);
    return this.textDecoder.decode(bytes);
  }

  /**
   * Read a list of structs
   */
  private readStructList<T>(offset: number, count: number, parser: (offset: number) => T): T[] {
    const result: T[] = [];
    let currentOffset = offset;

    // Assume fixed-size structs for simplicity
    // In real implementation, would read struct size from list pointer
    const structSize = 64; // Default assumption

    for (let i = 0; i < count; i++) {
      result.push(parser(currentOffset));
      currentOffset += structSize;
    }

    return result;
  }
}

/**
 * Create a schema registry for managing parsed schemas
 */
export function createSchemaRegistry(): {
  registerNode: (node: SchemaNode) => void;
  getNode: (id: bigint) => SchemaNode | undefined;
  getNodeByName: (name: string) => SchemaNode | undefined;
  getNodesByFile: (fileId: bigint) => SchemaNode[];
  hasNode: (id: bigint) => boolean;
  clear: () => void;
} {
  const nodesById = new Map<bigint, SchemaNode>();
  const nodesByName = new Map<string, SchemaNode>();
  const nodesByFile = new Map<bigint, SchemaNode[]>();

  return {
    registerNode(node: SchemaNode) {
      nodesById.set(node.id, node);
      nodesByName.set(node.displayName, node);

      // Find file ID (scope chain traversal would be needed for accurate result)
      // For now, use scopeId as proxy
      const fileNodes = nodesByFile.get(node.scopeId) ?? [];
      fileNodes.push(node);
      nodesByFile.set(node.scopeId, fileNodes);
    },

    getNode(id: bigint) {
      return nodesById.get(id);
    },

    getNodeByName(name: string) {
      return nodesByName.get(name);
    },

    getNodesByFile(fileId: bigint) {
      return nodesByFile.get(fileId) ?? [];
    },

    hasNode(id: bigint) {
      return nodesById.has(id);
    },

    clear() {
      nodesById.clear();
      nodesByName.clear();
      nodesByFile.clear();
    },
  };
}
