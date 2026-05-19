/**
 * Script to extract component schemas from the Orderlek-Store-Components project.
 * Outputs: JSON array of component schemas ready for the API.
 *
 * Usage:
 *   node scripts/read-schemas.cjs                        # defaults: headers + footers
 *   node scripts/read-schemas.cjs headers                 # headers only
 *   node scripts/read-schemas.cjs footers                # footers only
 *   node scripts/read-schemas.cjs /path/to/sections       # custom folder
 */

const fs = require('fs');
const path = require('path');

function getString(body, field) {
  const re = new RegExp(`${field}:\\s*["'](.*?)["']`, 'm');
  const m = body.match(re);
  return m ? m[1] : undefined;
}

function parseValue(raw) {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === 'undefined') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return parseFloat(t);
  if (/^['"]/.test(t)) return t.slice(1, -1);
  return t;
}

// Parse TypeScript object/array literals with unquoted keys
function parseJSValue(raw, outerChar) {
  if (outerChar === '{') {
    const inner = raw.substring(1, raw.length - 1);
    const result = {};
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
    const result = [];
    let depth = 0, current = '', inItem = false;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === '{' || c === '[') { depth++; current += c; inItem = true; }
      else if (c === '}' || c === ']') { depth--; current += c; if (depth === 0) { result.push(parseJSValue(current.trim(), current.trim()[0])); current = ''; inItem = false; } }
      else if (c === ',' && depth === 0) {
        if (current.trim()) result.push(parseValue(current.trim()));
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

function getArray(body, field) {
  const re = new RegExp(`${field}:\\s*\\[([^\\]]+)\\]`);
  const m = body.match(re);
  return m ? m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')) : [];
}

function getDefault(body) {
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
      // Try JS parsing for unquoted keys (e.g., { label: '...', url: '/' })
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

function extractSubSchema(body, field) {
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

  // Walk to matching closing brace
  let depth = 0, end = start;
  for (let j = start; j < body.length; j++) {
    if (body[j] === '{') depth++;
    else if (body[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  const inner = body.substring(start + 1, end - 1);

  const result = {};
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
    const sp = {};
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

function extractProps(propsContent) {
  const props = {};
  let i = 0, len = propsContent.length;

  while (i < len) {
    const nameMatch = propsContent.substring(i).match(/^(\w+):\s*\{/);
    if (!nameMatch) { i++; continue; }
    const propName = nameMatch[1];
    const bodyStart = i + nameMatch[0].length - 1;
    let depth = 0, bodyEnd = bodyStart;
    for (let j = bodyStart; j < len; j++) {
      if (propsContent[j] === '{') depth++;
      else if (propsContent[j] === '}') { depth--; if (depth === 0) { bodyEnd = j + 1; break; } }
    }
    const propBody = propsContent.substring(bodyStart, bodyEnd);
    const p = {};

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
  return props;
}

function extractSchema(content) {
  const match = content.match(/export\s+const\s+\w+Schema:\s*ComponentSchema\s*=\s*\{/);
  if (!match) return null;
  const startIdx = content.indexOf(match[0]) + match[0].length - 1;
  let depth = 0, endIdx = startIdx;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }
  const body = content.substring(startIdx, endIdx);

  const componentKey = getString(body, 'componentKey');
  const name = getString(body, 'name');
  const nameAr = getString(body, 'nameAr');
  const description = getString(body, 'description');
  const descriptionAr = getString(body, 'descriptionAr');
  const previewImage = getString(body, 'previewImage');
  const region = getString(body, 'region');
  const contexts = getArray(body, 'contexts');
  const sectionSlugs = getArray(body, 'sectionSlugs');

  const propsMatch = body.match(/props:\s*\{([\s\S]*)\n\s{2}\}/);
  const props = propsMatch ? extractProps(propsMatch[1]) : {};

  return { componentKey, name, nameAr, description, descriptionAr, previewImage, region, contexts, sectionSlugs, props };
}

function scanDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const schemaPath = path.join(dir, entry.name, 'schema.ts');
    if (!fs.existsSync(schemaPath)) continue;
    try {
      const schema = extractSchema(fs.readFileSync(schemaPath, 'utf-8'));
      if (schema && schema.componentKey) {
        console.log(`  ${schema.componentKey} (${schema.name || 'N/A'})`);
        results.push(schema);
      } else {
        console.warn(`  Skipped: ${entry.name}`);
      }
    } catch (e) {
      console.warn(`  Failed: ${entry.name} - ${e.message}`);
    }
  }
  return results;
}

// Resolve the Orderlek-Store-Components root relative to this script
const COMPONENTS_ROOT = path.resolve(__dirname, '../../Orderlek-Store/Orderlek-Store-Components/src/themes');

const arg = process.argv[2] || 'all';
const schemas = [];

if (arg === 'headers') {
  console.log('\n=== Headers ===');
  schemas.push(...scanDir(path.join(COMPONENTS_ROOT, 'headers', 'sections')));
} else if (arg === 'footers') {
  console.log('\n=== Footers ===');
  schemas.push(...scanDir(path.join(COMPONENTS_ROOT, 'footers', 'sections')));
} else if (fs.existsSync(arg)) {
  // Treat arg as a directory path
  console.log(`\n=== Custom: ${arg} ===`);
  schemas.push(...scanDir(arg));
} else {
  // 'all' - scan headers and footers
  console.log('\n=== Headers ===');
  schemas.push(...scanDir(path.join(COMPONENTS_ROOT, 'headers', 'sections')));
  console.log('\n=== Footers ===');
  schemas.push(...scanDir(path.join(COMPONENTS_ROOT, 'footers', 'sections')));
}

console.log(`\nTotal: ${schemas.length} schemas`);

// Generate output filename
let outName;
if (arg === 'headers') outName = 'headers';
else if (arg === 'footers') outName = 'footers';
else if (fs.existsSync(arg)) outName = path.basename(arg);
else outName = 'all';

const outPath = path.join(__dirname, `../public/extracted-schemas-${outName}.json`);
fs.writeFileSync(outPath, JSON.stringify(schemas, null, 2));
console.log(`Written to: ${outPath}`);