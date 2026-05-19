/**
 * Browser-compatible TypeScript schema.ts file parser.
 * Extracts component schemas from raw .ts file content.
 */

import type { ComponentSchemaPayload } from '../types';

function parseValue(raw: string): unknown {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === 'undefined') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return parseFloat(t);
  if (/^['"]/.test(t)) return t.slice(1, -1);
  return t;
}

function getString(body: string, field: string): string | undefined {
  const re = new RegExp(`${field}:\\s*["'](.*?)["']`, 'm');
  const m = body.match(re);
  return m ? m[1] : undefined;
}

function getArray(body: string, field: string): string[] {
  const re = new RegExp(`${field}:\\s*\\[([^\\]]+)\\]`);
  const m = body.match(re);
  return m ? m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')) : [];
}

function getDefault(body: string): unknown {
  const idx = body.indexOf('default:');
  if (idx === -1) return undefined;
  let start = idx + 8;
  while (start < body.length && /\s/.test(body[start])) start++;
  if (start >= body.length) return undefined;
  const ch = body[start];

  if (ch === "'" || ch === '"') {
    const end = body.indexOf(ch, start + 1);
    return body.substring(start + 1, end);
  }
  if (ch === '[' || ch === '{') {
    let depth = 0, end = start;
    for (let j = start; j < body.length; j++) {
      if (body[j] === '[' || body[j] === '{') depth++;
      else if (body[j] === ']' || body[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
    }
    const raw = body.substring(start, end).trim();
    try { return JSON.parse(raw); } catch {
      return parseJSValue(raw, ch);
    }
  }
  const re = /^(true|false|null|undefined|-?\d+(?:\.\d+)?)/;
  const m = body.substring(start).match(re);
  if (!m) return undefined;
  const v = m[1];
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === 'undefined') return null;
  return parseFloat(v);
}

function parseJSValue(raw: string, outerChar: string): unknown {
  if (outerChar === '{') {
    const inner = raw.substring(1, raw.length - 1);
    const result: Record<string, unknown> = {};
    let depth = 0, key = '', inKey = true, current = '';
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === '{' || c === '[') { depth++; current += c; }
      else if (c === '}' || c === ']') { depth--; current += c; }
      else if (c === ':' && depth === 0 && inKey) {
        key = current.trim();
        current = '';
        inKey = false;
      } else if (c === ',' && depth === 0 && !inKey) {
        const val = current.trim();
        current = '';
        inKey = true;
        if (key && val) result[key.replace(/^['"]|['"]$/g, '')] = parseValue(val);
        key = '';
      } else {
        current += c;
      }
    }
    if (key && current.trim()) result[key.replace(/^['"]|['"]$/g, '')] = parseValue(current.trim());
    return result;
  }
  if (outerChar === '[') {
    const inner = raw.substring(1, raw.length - 1);
    const result: unknown[] = [];
    let depth = 0, current = '';
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === '{' || c === '[') { depth++; current += c; }
      else if (c === '}' || c === ']') {
        depth--;
        current += c;
        if (depth === 0) {
          result.push(parseJSValue(current.trim(), current.trim()[0]));
          current = '';
        }
      } else if (c === ',' && depth === 0) {
        if (current.trim()) {
          if (current.trim().startsWith('{')) result.push(parseJSValue(current.trim(), '{'));
          else result.push(parseValue(current.trim()));
        }
        current = '';
      } else {
        current += c;
      }
    }
    if (current.trim()) {
      if (current.trim().startsWith('{')) result.push(parseJSValue(current.trim(), '{'));
      else result.push(parseValue(current.trim()));
    }
    return result;
  }
  return raw;
}

function extractSubSchema(body: string, field: string): Record<string, unknown> | undefined {
  const idx = body.indexOf(field + ':');
  if (idx === -1) return undefined;
  let start = idx + field.length + 1;
  while (start < body.length && (/\s/.test(body[start]) || body.substring(start, start + 2) === '//')) {
    if (body.substring(start, start + 2) === '//') {
      const nl = body.indexOf('\n', start);
      if (nl === -1) return undefined;
      start = nl + 1;
    } else start++;
  }
  if (start >= body.length || body[start] !== '{') return undefined;

  let depth = 0, end = start;
  for (let j = start; j < body.length; j++) {
    if (body[j] === '{') depth++;
    else if (body[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  const inner = body.substring(start + 1, end - 1);

  const result: Record<string, unknown> = {};
  let i = 0, len = inner.length;
  while (i < len) {
    const nameMatch = inner.substring(i).match(/^(\w+):\s*\{/);
    if (!nameMatch) { i++; continue; }
    const subName = nameMatch[1];
    const bodyStart = i + nameMatch[0].length - 1;
    let depth2 = 0, bodyEnd = bodyStart;
    for (let j = bodyStart; j < len; j++) {
      if (inner[j] === '{') depth2++;
      else if (inner[j] === '}') { depth2--; if (depth2 === 0) { bodyEnd = j + 1; break; } }
    }
    const subBody = inner.substring(bodyStart, bodyEnd);
    const sp: Record<string, unknown> = {};
    const t = subBody.match(/type:\s*['"]([^'"]+)['"]/);
    if (t) sp.type = t[1];
    const l = subBody.match(/label:\s*["']([^"']+)["']/);
    if (l) sp.label = l[1];
    const la = subBody.match(/labelAr:\s*["']([^"']+)["']/);
    if (la) sp.labelAr = la[1];
    const d = subBody.match(/description:\s*["']([^"']+)["']/);
    if (d) sp.description = d[1];
    const da = subBody.match(/descriptionAr:\s*["']([^"']+)["']/);
    if (da) sp.descriptionAr = da[1];
    const def = getDefault(subBody);
    if (def !== undefined) sp.default = def;
    if (Object.keys(sp).length) result[subName] = sp;
    i = bodyEnd;
  }
  return Object.keys(result).length ? result : undefined;
}

function extractSchema(schemaBody: string): ComponentSchemaPayload | null {
  // schemaBody is the content INSIDE the braces, starting with "componentKey: ..."
  const componentKey = getString(schemaBody, 'componentKey');
  const name = getString(schemaBody, 'name');
  const nameAr = getString(schemaBody, 'nameAr');
  const description = getString(schemaBody, 'description');
  const descriptionAr = getString(schemaBody, 'descriptionAr');
  const previewImage = getString(schemaBody, 'previewImage');
  const region = getString(schemaBody, 'region');
  const contexts = getArray(schemaBody, 'contexts');
  const sectionSlugs = getArray(schemaBody, 'sectionSlugs');

  const props: Record<string, unknown> = {};
  let i = 0, len = schemaBody.length;
  while (i < len) {
    const nameMatch = schemaBody.substring(i).match(/^(\w+):\s*\{/);
    if (!nameMatch) { i++; continue; }
    const propName = nameMatch[1];
    const bodyStart = i + nameMatch[0].length - 1;
    let depth2 = 0, bodyEnd = bodyStart;
    for (let j = bodyStart; j < len; j++) {
      if (schemaBody[j] === '{') depth2++;
      else if (schemaBody[j] === '}') { depth2--; if (depth2 === 0) { bodyEnd = j + 1; break; } }
    }
    const propBody = schemaBody.substring(bodyStart, bodyEnd);
    const p: Record<string, unknown> = {};

    const typeM = propBody.match(/type:\s*['"]([^'"]+)['"]/);
    if (typeM) p.type = typeM[1];
    const labelM = propBody.match(/label:\s*["']([^"']+)["']/);
    if (labelM) p.label = labelM[1];
    const labelArM = propBody.match(/labelAr:\s*["']([^"']+)["']/);
    if (labelArM) p.labelAr = labelArM[1];
    const descM = propBody.match(/description:\s*["']([^"']+)["']/);
    if (descM) p.description = descM[1];
    const descArM = propBody.match(/descriptionAr:\s*["']([^"']+)["']/);
    if (descArM) p.descriptionAr = descArM[1];
    const requiredM = propBody.match(/required:\s*(true|false)/);
    if (requiredM) p.required = requiredM[1] === 'true';
    const minM = propBody.match(/min:\s*(-?\d+(?:\.\d+)?)/);
    if (minM) p.min = parseFloat(minM[1]);
    const maxM = propBody.match(/max:\s*(-?\d+(?:\.\d+)?)/);
    if (maxM) p.max = parseFloat(maxM[1]);
    const stepM = propBody.match(/step:\s*(-?\d+(?:\.\d+)?)/);
    if (stepM) p.step = parseFloat(stepM[1]);
    const optionsM = propBody.match(/options:\s*\[\s*([^\]]+)\s*\]/);
    if (optionsM) p.options = optionsM[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
    const defVal = getDefault(propBody);
    if (defVal !== undefined) p.default = defVal;
    const itemSchema = extractSubSchema(propBody, 'itemSchema');
    if (itemSchema) p.itemSchema = itemSchema;
    const propertySchema = extractSubSchema(propBody, 'propertySchema');
    if (propertySchema) p.propertySchema = propertySchema;

    props[propName] = p;
    i = bodyEnd;
  }

  return { componentKey, name, nameAr, description, descriptionAr, previewImage, region, contexts, sectionSlugs, props } as ComponentSchemaPayload;
}

export function parseSchemaFile(content: string): { schemas?: ComponentSchemaPayload[]; error?: string } {
  const schemas: ComponentSchemaPayload[] = [];

  // Find all export const ...Schema: ComponentSchema = { blocks
  const matches = [...content.matchAll(/export\s+const\s+(\w+Schema):\s*ComponentSchema\s*=\s*\{/g)];

  if (matches.length === 0) {
    const hasImport = content.includes('ComponentSchema');
    const hasExport = content.includes('export');
    return {
      error: `No ComponentSchema exports found. hasImport=${hasImport}, hasExport=${hasExport}, length=${content.length}, firstLine=${content.split('\n')[0]}`,
    };
  }

  for (const match of matches) {
    const startIdx = content.indexOf(match[0]) + match[0].length - 1;
    let depth = 0, endIdx = startIdx;
    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
    }
    const schemaBody = content.substring(startIdx, endIdx);
    const schema = extractSchema(schemaBody);
    if (schema && schema.componentKey) schemas.push(schema);
  }

  if (schemas.length === 0) return { error: 'Failed to extract any schemas from file' };
  return { schemas };
}

export function parseSchemaFileMulti(files: { name: string; content: string }[]): ComponentSchemaPayload[] {
  const results: ComponentSchemaPayload[] = [];
  for (const file of files) {
    const result = parseSchemaFile(file.content);
    if (result.schemas) results.push(...result.schemas);
  }
  return results;
}