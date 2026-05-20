import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import * as fs from 'fs'
import * as path from 'path'
import type { Plugin, ViteDevServer } from 'vite'

const STORE_ROOT = path.resolve(__dirname, '../Orderlek-Store/Orderlek-Store-Components/src')

function getString(body: string, field: string): string | undefined {
  const re = new RegExp(`${field}:\\s*["'](.*?)["']`, 'm')
  const m = body.match(re)
  return m ? m[1] : undefined
}

function parseValue(raw: string): unknown {
  const t = raw.trim()
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null' || t === 'undefined') return null
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return parseFloat(t)
  if (/^['"]/.test(t)) return t.slice(1, -1)
  return t
}

function parseJSValue(raw: string, outerChar: string): unknown {
  if (outerChar === '{') {
    const inner = raw.substring(1, raw.length - 1)
    const result: Record<string, unknown> = {}
    let depth = 0, key = '', inKey = true, current = ''
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i]
      if (c === '{' || c === '[') { depth++; current += c }
      else if (c === '}' || c === ']') { depth--; current += c }
      else if (c === ':' && depth === 0 && inKey) { key = current.trim(); current = ''; inKey = false }
      else if (c === ',' && depth === 0 && !inKey) {
        const val = current.trim(); current = ''; inKey = true
        if (key && val) result[key.replace(/^['"]|['"]$/g, '')] = parseValue(val)
        key = ''
      } else { current += c }
    }
    if (key && current.trim()) result[key.replace(/^['"]|['"]$/g, '')] = parseValue(current.trim())
    return result
  }
  if (outerChar === '[') {
    const inner = raw.substring(1, raw.length - 1)
    const result: unknown[] = []
    let depth = 0, current = ''
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i]
      if (c === '{' || c === '[') { depth++; current += c }
      else if (c === '}' || c === ']') {
        depth--; current += c
        if (depth === 0) { result.push(parseJSValue(current.trim(), current.trim()[0])); current = '' }
      } else if (c === ',' && depth === 0) {
        if (current.trim()) result.push(current.trim().startsWith('{') ? parseJSValue(current.trim(), '{') : parseValue(current.trim()))
        current = ''
      } else { current += c }
    }
    if (current.trim()) result.push(current.trim().startsWith('{') ? parseJSValue(current.trim(), '{') : parseValue(current.trim()))
    return result
  }
  return raw
}

function getArray(body: string, field: string): string[] {
  const re = new RegExp(`${field}:\\s*\\[([^\\]]+)\\]`)
  const m = body.match(re)
  return m ? m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')) : []
}

function getDefault(body: string): unknown {
  const idx = body.indexOf('default:')
  if (idx === -1) return undefined
  let start = idx + 8
  while (start < body.length && /\s/.test(body[start])) start++
  if (start >= body.length) return undefined
  const ch = body[start]
  if (ch === "'" || ch === '"') { const end = body.indexOf(ch, start + 1); return body.substring(start + 1, end) }
  if (ch === '[' || ch === '{') {
    let depth = 0, end = start
    for (let j = start; j < body.length; j++) {
      if (body[j] === '[' || body[j] === '{') depth++
      else if (body[j] === ']' || body[j] === '}') { depth--; if (depth === 0) { end = j + 1; break } }
    }
    const raw = body.substring(start, end).trim()
    try { return JSON.parse(raw) } catch { return parseJSValue(raw, ch) }
  }
  const re = /^(true|false|null|undefined|-?\d+(?:\.\d+)?)/
  const m = body.substring(start).match(re)
  if (!m) return undefined
  const v = m[1]
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === 'undefined') return null
  return parseFloat(v)
}

function extractSubSchema(body: string, field: string): Record<string, unknown> | undefined {
  const idx = body.indexOf(field + ':')
  if (idx === -1) return undefined
  let start = idx + field.length + 1
  while (start < body.length && (/\s/.test(body[start]) || body.substring(start, start + 2) === '//')) {
    if (body.substring(start, start + 2) === '//') { const nl = body.indexOf('\n', start); if (nl === -1) return undefined; start = nl + 1 }
    else start++
  }
  if (start >= body.length || body[start] !== '{') return undefined
  let depth = 0, end = start
  for (let j = start; j < body.length; j++) { if (body[j] === '{') depth++; else if (body[j] === '}') { depth--; if (depth === 0) { end = j + 1; break } } }
  const inner = body.substring(start + 1, end - 1)
  return parseObjectBody(inner)
}

function parseObjectBody(inner: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let i = 0, len = inner.length
  while (i < len) {
    // Skip whitespace and comments
    while (i < len && /\s/.test(inner[i])) i++
    if (i >= len) break
    if (inner.substring(i, i + 2) === '//') { const nl = inner.indexOf('\n', i); if (nl === -1) break; i = nl + 1; continue }
    // Try to match a prop at this position
    const rest = inner.substring(i)
    const nameMatch = rest.match(/^(\w+):\s*\{/)
    if (!nameMatch || !nameMatch[1]) { i++; continue }
    const propName = nameMatch[1]
    const bodyStart = i + nameMatch[0].length - 1
    let depth2 = 0, bodyEnd = bodyStart
    for (let j = bodyStart; j < len; j++) { if (inner[j] === '{') depth2++; else if (inner[j] === '}') { depth2--; if (depth2 === 0) { bodyEnd = j + 1; break } } }
    const propBody = inner.substring(bodyStart, bodyEnd)
    const p: Record<string, unknown> = {}
    const typeM = propBody.match(/type:\s*['"]([^'"]+)['"]/); if (typeM) p.type = typeM[1]
    const labelM = propBody.match(/label:\s*["']([^"']+)["']/); if (labelM) p.label = labelM[1]
    const labelArM = propBody.match(/labelAr:\s*["']([^"']+)["']/); if (labelArM) p.labelAr = labelArM[1]
    const descM = propBody.match(/description:\s*["']([^"']+)["']/); if (descM) p.description = descM[1]
    const descArM = propBody.match(/descriptionAr:\s*["']([^"']+)["']/); if (descArM) p.descriptionAr = descArM[1]
    const reqM = propBody.match(/required:\s*(true|false)/); if (reqM) p.required = reqM[1] === 'true'
    const minM = propBody.match(/min:\s*(-?\d+(?:\.\d+)?)/); if (minM) p.min = parseFloat(minM[1])
    const maxM = propBody.match(/max:\s*(-?\d+(?:\.\d+)?)/); if (maxM) p.max = parseFloat(maxM[1])
    const stepM = propBody.match(/step:\s*(-?\d+(?:\.\d+)?)/); if (stepM) p.step = parseFloat(stepM[1])
    const optsM = propBody.match(/options:\s*\[\s*([^\]]+)\s*\]/); if (optsM) p.options = optsM[1].split(',').map((s) => s.trim().replace(/['"]/g, ''))
    const defVal = getDefault(propBody); if (defVal !== undefined) p.default = defVal
    const itemSchema = extractSubSchema(propBody, 'itemSchema'); if (itemSchema) p.itemSchema = itemSchema
    const propertySchema = extractSubSchema(propBody, 'propertySchema'); if (propertySchema) p.propertySchema = propertySchema
    result[propName] = p
    i = bodyEnd
  }
  return result
}

function extractSchema(content: string): Record<string, unknown> | null {
  const hasComponentSchemaImport = content.includes('ComponentSchema')
  // Pattern 1: export const nameSchema: ComponentSchema = {
  // Pattern 2: export const name = { ... } (if ComponentSchema is imported as type)
  const p1 = /export\s+const\s+\w+Schema(?:\d+)?:\s*ComponentSchema\s*=\s*\{/
  const p2 = /export\s+const\s+\w+\s*=\s*\{/
  const m1 = content.match(p1)
  const m2 = content.match(p2)
  if (!m1 && !(m2 && hasComponentSchemaImport)) return null
  const match = m1 || m2!
  const startIdx = content.indexOf(match[0]) + match[0].length - 1
  let depth = 0, endIdx = startIdx
  for (let i = startIdx; i < content.length; i++) { if (content[i] === '{') depth++; else if (content[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break } } }
  const body = content.substring(startIdx, endIdx)
  const componentKey = getString(body, 'componentKey')
  const name = getString(body, 'name')
  const nameAr = getString(body, 'nameAr')
  const description = getString(body, 'description')
  const descriptionAr = getString(body, 'descriptionAr')
  const previewImage = getString(body, 'previewImage')
  const region = getString(body, 'region')
  const contexts = getArray(body, 'contexts')
  const sectionSlugs = getArray(body, 'sectionSlugs')
  const props: Record<string, unknown> = {}
  let i = 0, len = body.length
  while (i < len) {
    const nameMatch = body.substring(i).match(/^(\w+):\s*\{/)
    if (!nameMatch || !nameMatch[1]) { i++; continue }
    const propName = nameMatch[1]

    // Special case: `props: { ... }` wraps the schema props object
    if (propName === 'props') {
      const bodyStart = i + nameMatch[0].length - 1
      let depth2 = 0, bodyEnd = bodyStart
      for (let j = bodyStart; j < len; j++) { if (body[j] === '{') depth2++; else if (body[j] === '}') { depth2--; if (depth2 === 0) { bodyEnd = j + 1; break } } }
      const inner = body.substring(bodyStart + 1, bodyEnd - 1)
      Object.assign(props, parseObjectBody(inner))
      i = bodyEnd
      continue
    }

    const bodyStart = i + nameMatch[0].length - 1
    let depth2 = 0, bodyEnd = bodyStart
    for (let j = bodyStart; j < len; j++) { if (body[j] === '{') depth2++; else if (body[j] === '}') { depth2--; if (depth2 === 0) { bodyEnd = j + 1; break } } }
    const propBody = body.substring(bodyStart, bodyEnd)
    const p: Record<string, unknown> = {}
    const typeM = propBody.match(/type:\s*['"]([^'"]+)['"]/); if (typeM) p.type = typeM[1]
    const labelM = propBody.match(/label:\s*["']([^"']+)["']/); if (labelM) p.label = labelM[1]
    const labelArM = propBody.match(/labelAr:\s*["']([^"']+)["']/); if (labelArM) p.labelAr = labelArM[1]
    const descM = propBody.match(/description:\s*["']([^"']+)["']/); if (descM) p.description = descM[1]
    const descArM = propBody.match(/descriptionAr:\s*["']([^"']+)["']/); if (descArM) p.descriptionAr = descArM[1]
    const reqM = propBody.match(/required:\s*(true|false)/); if (reqM) p.required = reqM[1] === 'true'
    const minM = propBody.match(/min:\s*(-?\d+(?:\.\d+)?)/); if (minM) p.min = parseFloat(minM[1])
    const maxM = propBody.match(/max:\s*(-?\d+(?:\.\d+)?)/); if (maxM) p.max = parseFloat(maxM[1])
    const stepM = propBody.match(/step:\s*(-?\d+(?:\.\d+)?)/); if (stepM) p.step = parseFloat(stepM[1])
    const optsM = propBody.match(/options:\s*\[\s*([^\]]+)\s*\]/); if (optsM) p.options = optsM[1].split(',').map((s) => s.trim().replace(/['"]/g, ''))
    const defVal = getDefault(propBody); if (defVal !== undefined) p.default = defVal
    const itemSchema = extractSubSchema(propBody, 'itemSchema'); if (itemSchema) p.itemSchema = itemSchema
    const propertySchema = extractSubSchema(propBody, 'propertySchema'); if (propertySchema) p.propertySchema = propertySchema
    props[propName] = p
    i = bodyEnd
  }
  return { componentKey, name, nameAr, description, descriptionAr, previewImage, region, contexts, sectionSlugs, props }
}

function scanDir(dir: string, subDir?: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const targetDir = subDir ? path.join(dir, subDir) : dir;
  if (!fs.existsSync(targetDir)) return results;
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const schemaPath = path.join(targetDir, entry.name, 'schema.ts');
    if (!fs.existsSync(schemaPath)) continue;
    try {
      const schema = extractSchema(fs.readFileSync(schemaPath, 'utf-8'));
      if (schema && schema.componentKey) results.push(schema);
    } catch { /* skip */ }
  }
  return results;
}

function scanDirDeep(dir: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const schemaPath = path.join(dir, entry.name, 'schema.ts');
    if (!fs.existsSync(schemaPath)) {
      const subDir = path.join(dir, entry.name);
      results.push(...scanDirDeep(subDir));
    } else {
      try {
        const schema = extractSchema(fs.readFileSync(schemaPath, 'utf-8'));
        if (schema && schema.componentKey) results.push(schema);
      } catch { /* skip */ }
    }
  }
  return results;
}

const SCAN_TARGETS: Record<string, { dir: string; deep?: boolean }[]> = {
  sections: [{ dir: 'sections', deep: true }],
  general: [{ dir: 'general', deep: true }],
  headers: [{ dir: 'themes/headers/sections' }, { dir: 'funnels/headers/sections' }],
  footers: [{ dir: 'themes/footers/sections' }, { dir: 'funnels/footers/sections' }],
  funnels: [{ dir: 'funnels', deep: true }],
  landing: [{ dir: 'landingPages', deep: true }],
  themes: [{ dir: 'themes', deep: true }],
  all: [
    { dir: 'sections', deep: true },
    { dir: 'general', deep: true },
    { dir: 'funnels', deep: true },
    { dir: 'landingPages', deep: true },
    { dir: 'themes', deep: true },
  ],
}

export function buildSchemas() {
  const outDir = path.join(__dirname, 'public')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const categories: Record<string, string> = {
    sections: 'sections', general: 'general', headers: 'headers', footers: 'footers',
    funnels: 'funnels', landing: 'landing', themes: 'themes', all: 'all',
  }
  for (const [name, target] of Object.entries(categories)) {
    const targets = SCAN_TARGETS[target]
    const schemas: Record<string, unknown>[] = []
    for (const t of targets) {
      if (t.deep) {
        schemas.push(...scanDirDeep(path.join(STORE_ROOT, t.dir)))
      } else {
        schemas.push(...scanDir(path.join(STORE_ROOT, t.dir)))
      }
    }
    fs.writeFileSync(path.join(outDir, `extracted-schemas-${name}.json`), JSON.stringify(schemas, null, 2))
    console.log(`[schema] ${name}: ${schemas.length} schemas`)
  }
}

const devCache: Record<string, { data: unknown; ts: number }> = {}

export function schemaPlugin(): Plugin {
  return {
    name: 'schema-proxy',
    buildStart() {
      buildSchemas()
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/schemas', (req, res) => {
        const url = (req.url || '/').replace(/^\//, '')
        const category = url.split('/')[0] || 'all'
        const targets = SCAN_TARGETS[category] || SCAN_TARGETS.all
        const now = Date.now()
        const cached = devCache[category]
        if (cached && now - cached.ts < 10_000) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(cached.data))
          return
        }
        try {
          const schemas: Record<string, unknown>[] = []
          for (const t of targets) {
            if (t.deep) {
              schemas.push(...scanDirDeep(path.join(STORE_ROOT, t.dir)))
            } else {
              schemas.push(...scanDir(path.join(STORE_ROOT, t.dir)))
            }
          }
          devCache[category] = { data: schemas, ts: now }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(schemas))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), schemaPlugin()],
})