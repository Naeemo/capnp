/**
 * JSDoc generation utilities
 */

export interface DocComment {
  description?: string;
  params?: Record<string, string>;
  returns?: string;
  deprecated?: string;
  example?: string;
  since?: string;
  see?: string;
}

/**
 * Generate JSDoc comment from structured info
 */
export function generateJSDoc(comment: DocComment | string): string {
  if (typeof comment === 'string') {
    return formatJSDocLines([comment]);
  }

  const lines: string[] = [];

  if (comment.description) {
    lines.push(...comment.description.split('\n'));
  }

  if (comment.deprecated) {
    lines.push('');
    lines.push(`@deprecated ${comment.deprecated}`);
  }

  if (comment.params) {
    lines.push('');
    for (const [name, description] of Object.entries(comment.params)) {
      lines.push(`@param ${name} ${description}`);
    }
  }

  if (comment.returns) {
    lines.push('');
    lines.push(`@returns ${comment.returns}`);
  }

  if (comment.example) {
    lines.push('');
    lines.push('@example');
    lines.push(...comment.example.split('\n').map((l) => `  ${l}`));
  }

  if (comment.since) {
    lines.push('');
    lines.push(`@since ${comment.since}`);
  }

  if (comment.see) {
    lines.push('');
    lines.push(`@see ${comment.see}`);
  }

  return formatJSDocLines(lines);
}

/**
 * Format lines as JSDoc comment
 */
function formatJSDocLines(lines: string[]): string {
  if (lines.length === 0) return '';
  if (lines.length === 1) return `/** ${lines[0]} */`;

  const formatted = lines
    .map((line) => {
      if (line === '') return ' *';
      return ` * ${line}`;
    })
    .join('\n');

  return `/**\n${formatted}\n */`;
}

/**
 * Parse doc comment from schema annotation
 */
export function parseDocComment(annotation: unknown): string | undefined {
  if (!annotation || typeof annotation !== 'object') return undefined;

  // Check for $doc or doc annotation
  const doc =
    (annotation as Record<string, unknown>).$doc ?? (annotation as Record<string, unknown>).doc;

  if (typeof doc === 'string') return doc;
  return undefined;
}

/**
 * Generate field description from metadata
 */
export function generateFieldDoc(
  fieldName: string,
  _fieldType: string,
  defaultValue?: unknown
): DocComment {
  const comment: DocComment = {
    description: `The ${fieldName} field.`,
  };

  if (defaultValue !== undefined) {
    comment.description += ` Default: ${JSON.stringify(defaultValue)}.`;
  }

  return comment;
}

/**
 * Generate interface/struct description
 */
export function generateStructDoc(structName: string, description?: string): DocComment {
  return {
    description: description || `${structName} struct generated from Cap'n Proto schema.`,
  };
}

/**
 * Generate getter method description
 */
export function generateGetterDoc(fieldName: string, fieldType: string): DocComment {
  return {
    description: `Get the ${fieldName} field.`,
    returns: `The ${fieldName} value as ${fieldType}.`,
  };
}

/**
 * Generate setter method description
 */
export function generateSetterDoc(fieldName: string, _fieldType: string): DocComment {
  return {
    description: `Set the ${fieldName} field.`,
    params: {
      value: `The ${fieldName} value to set.`,
    },
  };
}
