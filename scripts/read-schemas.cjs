/**
 * Script to extract component schemas from the Orderlek-Store-Components project.
 * Outputs: JSON array of component schemas ready for the API.
 *
 * Usage:
 *   node scripts/read-schemas.cjs                        # all categories
 *   node scripts/read-schemas.cjs sections                # regular sections only
 *   node scripts/read-schemas.cjs general                # general components only
 *   node scripts/read-schemas.cjs funnels               # funnel components only
 *   node scripts/read-schemas.cjs landing                # landing page components only
 *   node scripts/read-schemas.cjs themes                # all theme components
 *   node scripts/read-schemas.cjs headers               # theme headers only
 *   node scripts/read-schemas.cjs footers               # theme footers only
 *   node scripts/read-schemas.cjs theme1..theme5        # specific theme only
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

  let depth = 0, end = start;
  for (let j = start; j < body.length; j++) {
    if (body[j] === '{') depth++;
    else if (body[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  const inner = body.substring(start + 1, end - 1);

  const result = extractPropsFromInner(inner);
  return Object.keys(result).length ? result : undefined;
}

function extractProps(propsContent) {
  const props = {};
  let i = 0, len = propsContent.length;

  while (i < len) {
    // Skip whitespace and line comments
    while (i < len && /\s/.test(propsContent[i])) i++;
    if (i >= len) break;
    if (propsContent.substring(i, i + 2) === '//') { const nl = propsContent.indexOf('\n', i); if (nl === -1) break; i = nl + 1; continue; }
    const nameMatch = propsContent.substring(i).match(/^(\w+):\s*\{/);
    if (!nameMatch || !nameMatch[1]) { i++; continue; }
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

function extractPropsFromBody(body) {
  const props = {};

  // Strategy: find the `props: {` that appears at the top level of the schema body
  // (usually right after sectionSlugs/contexts). Extract its content using
  // extractPropsFromInner. Skip any `props` field encountered in the second pass.
  const re = /props:\s*\{/g;
  let match;
  // Only process the FIRST props: {} occurrence (the schema-level props block)
  // Subsequent ones are nested inside object-type prop definitions
  let first = true;
  while ((match = re.exec(body)) !== null) {
    if (!first) break;
    first = false;
    const start = match.index + match[0].length - 1;
    let depth = 0, end = start;
    for (let j = start; j < body.length; j++) {
      if (body[j] === '{') depth++;
      else if (body[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
    }
    const inner = body.substring(start + 1, end - 1);
    Object.assign(props, extractPropsFromInner(inner));
  }

  return props;
}

function extractPropsFromInner(inner) {
  const props = {};
  let i = 0, len = inner.length;
  while (i < len) {
    while (i < len && /\s/.test(inner[i])) i++;
    if (i >= len) break;
    if (inner.substring(i, i + 2) === '//') { const nl = inner.indexOf('\n', i); if (nl === -1) break; i = nl + 1; continue; }
    const nameMatch = inner.substring(i).match(/^(\w+):\s*\{/);
    if (!nameMatch || !nameMatch[1]) { i++; continue; }
    const propName = nameMatch[1];
    const bodyStart = i + nameMatch[0].length - 1;
    let depth = 0, bodyEnd = bodyStart;
    for (let j = bodyStart; j < len; j++) {
      if (inner[j] === '{') depth++;
      else if (inner[j] === '}') { depth--; if (depth === 0) { bodyEnd = j + 1; break; } }
    }
    const propBody = inner.substring(bodyStart, bodyEnd);
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
  const hasComponentSchemaImport = content.includes('ComponentSchema')
  const p1 = /export\s+const\s+\w+Schema(?:\d+)?:\s*ComponentSchema\s*=\s*\{/;
  const p2 = /export\s+const\s+\w+\s*=\s*\{/;
  const m1 = content.match(p1)
  const m2 = content.match(p2)
  if (!m1 && !(m2 && hasComponentSchemaImport)) return null
  const match = m1 ? m1 : (m2 ? m2 : null)
  if (!match) return null
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

  const props = extractPropsFromBody(body);

  return { componentKey, name, nameAr, description, descriptionAr, previewImage, region, contexts, sectionSlugs, props };
}

function scanDir(dir, logPrefix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const schemaPath = path.join(dir, entry.name, 'schema.ts');
    if (!fs.existsSync(schemaPath)) continue;
    try {
      const schema = extractSchema(fs.readFileSync(schemaPath, 'utf-8'));
      if (schema && schema.componentKey) {
        console.log(`  ${logPrefix}${entry.name} -> ${schema.componentKey}`);
        results.push(schema);
      } else {
        console.warn(`  Skipped: ${logPrefix}${entry.name}`);
      }
    } catch (e) {
      console.warn(`  Failed: ${logPrefix}${entry.name} - ${e.message}`);
    }
  }
  return results;
}

function scanDirDeep(dir, logPrefix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const schemaPath = path.join(dir, entry.name, 'schema.ts');
    if (!fs.existsSync(schemaPath)) {
      const subResults = scanDirDeep(path.join(dir, entry.name), logPrefix + entry.name + '/');
      results.push(...subResults);
    } else {
      try {
        const schema = extractSchema(fs.readFileSync(schemaPath, 'utf-8'));
        if (schema && schema.componentKey) {
          console.log(`  ${logPrefix}${entry.name} -> ${schema.componentKey}`);
          results.push(schema);
        } else {
          console.warn(`  Skipped: ${logPrefix}${entry.name}`);
        }
      } catch (e) {
        console.warn(`  Failed: ${logPrefix}${entry.name} - ${e.message}`);
      }
    }
  }
  return results;
}

// Resolve the Orderlek-Store-Components root
const COMPONENTS_ROOT = path.resolve(__dirname, '../../Orderlek-Store/Orderlek-Store-Components/src');

const arg = process.argv[2] || 'all';
const schemas = [];
const outDir = path.join(__dirname, '../public');

// Ensure output dir exists
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const scanTargets = [];

if (arg === 'all') {
  console.log('=== All Components ===');
  scanTargets.push(
    { dir: path.join(COMPONENTS_ROOT, 'sections'), prefix: '[sections] ', deep: true },
    { dir: path.join(COMPONENTS_ROOT, 'general'), prefix: '[general] ', deep: true },
    { dir: path.join(COMPONENTS_ROOT, 'funnels'), prefix: '[funnels] ', deep: true },
    { dir: path.join(COMPONENTS_ROOT, 'landingPages'), prefix: '[landing] ', deep: true },
    { dir: path.join(COMPONENTS_ROOT, 'themes'), prefix: '[themes] ', deep: true },
  );
} else if (arg === 'sections') {
  scanTargets.push({ dir: path.join(COMPONENTS_ROOT, 'sections'), prefix: '[sections] ', deep: true });
} else if (arg === 'general') {
  scanTargets.push({ dir: path.join(COMPONENTS_ROOT, 'general'), prefix: '[general] ', deep: true });
} else if (arg === 'funnels') {
  scanTargets.push(
    { dir: path.join(COMPONENTS_ROOT, 'funnels'), prefix: '[funnels] ', deep: true },
  );
} else if (arg === 'landing') {
  scanTargets.push(
    { dir: path.join(COMPONENTS_ROOT, 'landingPages'), prefix: '[landing] ', deep: true },
  );
} else if (arg === 'themes') {
  scanTargets.push(
    { dir: path.join(COMPONENTS_ROOT, 'themes'), prefix: '[themes] ', deep: true },
  );
} else if (arg === 'headers') {
  scanTargets.push(
    { dir: path.join(COMPONENTS_ROOT, 'themes/headers/sections'), prefix: '[theme-headers] ' },
    { dir: path.join(COMPONENTS_ROOT, 'funnels/headers/sections'), prefix: '[funnel-headers] ' },
  );
} else if (arg === 'footers') {
  scanTargets.push(
    { dir: path.join(COMPONENTS_ROOT, 'themes/footers/sections'), prefix: '[theme-footers] ' },
    { dir: path.join(COMPONENTS_ROOT, 'funnels/footers/sections'), prefix: '[funnel-footers] ' },
  );
} else if (['theme1', 'theme2', 'theme3', 'theme4', 'theme5'].includes(arg)) {
  const num = arg.replace('theme', '');
  scanTargets.push({ dir: path.join(COMPONENTS_ROOT, `themes/theme-${num}/sections`), prefix: `[theme-${num}] ` });
} else if (/^funnel-?\d+$/i.test(arg)) {
  const num = arg.replace(/funnel-?/i, '');
  scanTargets.push({ dir: path.join(COMPONENTS_ROOT, `funnels/funnel-${num}/sections`), prefix: `[funnel-${num}] ` });
} else if (/^landing-?\d+$/i.test(arg)) {
  const num = arg.replace(/landing-?/i, '');
  scanTargets.push({ dir: path.join(COMPONENTS_ROOT, `landingPages/landingPage-${num}/sections`), prefix: `[landing-${num}] ` });
} else {
  console.error(`Unknown argument: ${arg}`);
  console.log('Valid args: all, sections, general, funnels, landing, themes, headers, footers, theme1..5, funnel-1..10, landing-1..10');
  process.exit(1);
}

for (const target of scanTargets) {
  if (target.deep) {
    const result = scanDirDeep(target.dir, target.prefix);
    schemas.push(...result);
  } else {
    const result = scanDir(target.dir, target.prefix);
    schemas.push(...result);
  }
}

console.log(`\nTotal: ${schemas.length} schemas`);

// Generate output filename and write
let outName;
if (arg === 'sections') outName = 'sections';
else if (arg === 'general') outName = 'general';
else if (arg === 'funnels') outName = 'funnels';
else if (arg === 'landing') outName = 'landing';
else if (arg === 'themes') outName = 'themes';
else if (arg === 'headers') outName = 'headers';
else if (arg === 'footers') outName = 'footers';
else if (/^theme\d$/.test(arg)) outName = arg;
else if (/^funnel-?\d+$/i.test(arg)) outName = arg.replace(/funnel-?/i, 'funnel-');
else if (/^landing-?\d+$/i.test(arg)) outName = arg.replace(/landing-?/i, 'landing-');
else outName = 'all';

const outPath = path.join(outDir, `extracted-schemas-${outName}.json`);
fs.writeFileSync(outPath, JSON.stringify(schemas, null, 2));
console.log(`Written: ${schemas.length} schemas -> ${outPath}`);
