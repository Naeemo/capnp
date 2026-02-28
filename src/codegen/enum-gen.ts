/**
 * Enum generator
 */

export function generateEnum(enum_: { name: string; values: { name: string; index: number }[] }, lines: string[]): void {
  lines.push("export enum " + enum_.name + " {");
  for (const value of enum_.values) {
    lines.push("  " + value.name + " = " + value.index + ",");
  }
  lines.push("}");
  lines.push("");
}
