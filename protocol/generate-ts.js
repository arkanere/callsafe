#!/usr/bin/env node

/**
 * Generate index.ts from protocol.json (the canonical specification).
 *
 * protocol.json is hand-edited; index.ts and Protocol.kt are build artifacts.
 * To regenerate: node generate-ts.js
 */

const fs = require('fs');
const path = require('path');

const protocol = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'protocol.json'), 'utf-8')
);

// --- helpers ---------------------------------------------------------------

// CALL_INITIATE -> CallInitiate
function pascalFromConstant(constant) {
  return constant
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

// Map a protocol.json field type token to a TypeScript type.
function tsType(token) {
  if (token.startsWith('enum:')) return token.slice(5);
  if (token.startsWith('object:')) return token.slice(7);
  const arrayMatch = token.match(/^array<enum:(\w+)>$/);
  if (arrayMatch) return `${arrayMatch[1]}[]`;
  switch (token) {
    case 'uuid':
    case 'string':
      return 'string';
    case 'string|null':
      return 'string | null';
    case 'number|null':
      return 'number | null';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      throw new Error(`Unknown field type token: ${token}`);
  }
}

function enumUnion(enumObj) {
  return Object.values(enumObj)
    .map((v) => `'${v}'`)
    .join(' | ');
}

// --- emit ------------------------------------------------------------------

const lines = [];
const w = (s = '') => lines.push(s);

w('/**');
w(' * CallSafe WebRTC Signaling Protocol');
w(` * Version: ${protocol.version}`);
w(' *');
w(' * AUTO-GENERATED from protocol.json — DO NOT EDIT MANUALLY.');
w(' * protocol.json is the canonical specification; to regenerate this file:');
w(' *   node generate-ts.js');
w(' *');
w(' * Normative prose (transport, auth, routing, flows) lives in README.md.');
w(' */');
w();
w(`export const PROTOCOL_VERSION = '${protocol.version}';`);
w();

// Transport constants
w('// ============================================================================');
w('// TRANSPORT');
w('// ============================================================================');
w();
w('/**');
w(` * ${protocol.transport.framing}`);
w(' * Timestamps: ms since Unix epoch. Durations: ms.');
w(' */');
w('export const Transport = {');
w(`  HEARTBEAT_INTERVAL_MS: ${protocol.transport.heartbeat.clientPingIntervalMs},`);
w(`  SERVER_IDLE_CLOSE_MS: ${protocol.transport.heartbeat.serverIdleCloseMs},`);
w('} as const;');
w();

// Timers
w('/** Server-side timer defaults (ms). Servers may override via configuration. */');
w('export const Timers = {');
for (const [name, t] of Object.entries(protocol.timers)) {
  w(`  ${name.toUpperCase()}_MS: ${t.defaultMs},`);
}
w('} as const;');
w();

// Message types
w('// ============================================================================');
w('// MESSAGE TYPES');
w('// ============================================================================');
w();
w('export const MessageTypes = {');
for (const [type, def] of Object.entries(protocol.messages)) {
  w(`  ${def.constant}: '${type}',`);
}
w('} as const;');
w();
w('export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes];');
w();

// Enums
w('// ============================================================================');
w('// ENUMS');
w('// ============================================================================');
for (const [name, values] of Object.entries(protocol.enums)) {
  w();
  w(`export const ${name} = {`);
  for (const [k, v] of Object.entries(values)) {
    w(`  ${k}: '${v}',`);
  }
  w('} as const;');
  w(`export type ${name} = ${enumUnion(values)};`);
}
w();

// Structured types
w('// ============================================================================');
w('// STRUCTURED TYPES');
w('// ============================================================================');
for (const [name, def] of Object.entries(protocol.types)) {
  w();
  w(`/** ${def.description} */`);
  w(`export interface ${name} {`);
  for (const [field, spec] of Object.entries(def.fields)) {
    w(`  ${field}${spec.required ? '' : '?'}: ${tsType(spec.type)};`);
  }
  w('}');
}
w();

// Payload interfaces
w('// ============================================================================');
w('// MESSAGE PAYLOAD INTERFACES');
w('// ============================================================================');
for (const [type, def] of Object.entries(protocol.messages)) {
  const ifaceName = `${pascalFromConstant(def.constant)}Payload`;
  w();
  w('/**');
  w(` * \`${type}\` — ${def.description}`);
  if (def.direction === 's2c' || def.direction === 'both') {
    if (def.audience) w(` * Audience: ${def.audience}`);
  }
  w(' */');
  w(`export interface ${ifaceName} {`);
  w(`  type: '${type}';`);
  for (const [field, spec] of Object.entries(def.fields)) {
    w(`  ${field}${spec.required ? '' : '?'}: ${tsType(spec.type)};`);
  }
  w('}');
}
w();

// Message metadata
w('// ============================================================================');
w('// MESSAGE METADATA');
w('// ============================================================================');
w();
w("export type MessageDirection = 'c2s' | 's2c' | 'both';");
w();
w('export interface MessageMeta {');
w('  direction: MessageDirection;');
w('  /** false only for messages permitted before device:connect succeeds */');
w('  requiresAuth: boolean;');
w('  /** connection role allowed to send (c2s only); undefined = any participant */');
w('  senderRole?: Role;');
w('  /** call states in which the server accepts this message (call-scoped c2s only) */');
w('  validStates?: CallState[];');
w('}');
w();
w('export const MessageMetadata: Record<MessageType, MessageMeta> = {');
for (const [type, def] of Object.entries(protocol.messages)) {
  const parts = [`direction: '${def.direction}'`];
  const requiresAuth = def.direction === 's2c' ? false : def.requiresAuth !== false;
  parts.push(`requiresAuth: ${requiresAuth}`);
  if (def.senderRole) parts.push(`senderRole: '${def.senderRole}'`);
  if (def.validStates) {
    parts.push(`validStates: [${def.validStates.map((s) => `'${s}'`).join(', ')}]`);
  }
  w(`  '${type}': { ${parts.join(', ')} },`);
}
w('};');
w();

// Schemas
w('// ============================================================================');
w('// VALIDATION SCHEMAS');
w('// ============================================================================');
w();
w('export interface FieldSpec {');
w("  /** type token: 'uuid' | 'string' | 'number' | 'boolean' | 'string|null' |");
w("   *  'number|null' | 'enum:<Name>' | 'object:<Name>' | 'array<enum:<Name>>' */");
w('  type: string;');
w('  required: boolean;');
w('}');
w();
w('export interface MessageSchema {');
w('  required: string[];');
w('  optional: string[];');
w('  fields: Record<string, FieldSpec>;');
w('}');
w();
w('export const MessageSchemas: Record<MessageType, MessageSchema> = {');
for (const [type, def] of Object.entries(protocol.messages)) {
  const required = [];
  const optional = [];
  for (const [field, spec] of Object.entries(def.fields)) {
    (spec.required ? required : optional).push(field);
  }
  w(`  '${type}': {`);
  w(`    required: [${required.map((f) => `'${f}'`).join(', ')}],`);
  w(`    optional: [${optional.map((f) => `'${f}'`).join(', ')}],`);
  w('    fields: {');
  for (const [field, spec] of Object.entries(def.fields)) {
    w(`      ${field}: { type: '${spec.type}', required: ${!!spec.required} },`);
  }
  w('    },');
  w('  },');
}
w('};');
w();

// State machine
w('// ============================================================================');
w('// STATE MACHINE');
w('// ============================================================================');
w();
w(`export const InitialCallState: CallState = '${protocol.stateMachine.initialState}';`);
w();
const terminals = protocol.stateMachine.terminalStates;
w(`export const TerminalCallStates: CallState[] = [${terminals.map((s) => `'${s}'`).join(', ')}];`);
w();
w('/** current state -> allowed next states */');
w('export const StateTransitions: Record<CallState, CallState[]> = {');
for (const [from, transitions] of Object.entries(protocol.stateMachine.transitions)) {
  w(`  ${from}: [${transitions.map((t) => `'${t.to}'`).join(', ')}],`);
}
w('};');
w();
w('/** current state -> { next state, triggering event } (documentation of WHY each transition fires) */');
w('export const TransitionTriggers: Record<CallState, { to: CallState; on: string }[]> = {');
for (const [from, transitions] of Object.entries(protocol.stateMachine.transitions)) {
  if (transitions.length === 0) {
    w(`  ${from}: [],`);
  } else {
    w(`  ${from}: [`);
    for (const t of transitions) {
      w(`    { to: '${t.to}', on: ${JSON.stringify(t.on)} },`);
    }
    w('  ],');
  }
}
w('};');
w();
w('export function isValidStateTransition(current: CallState, next: CallState): boolean {');
w('  return (StateTransitions[current] ?? []).includes(next);');
w('}');
w();
w('export function isTerminalState(state: CallState): boolean {');
w('  return TerminalCallStates.includes(state);');
w('}');
w();

// Validation runtime (static part)
w(`// ============================================================================
// MESSAGE VALIDATION
// ============================================================================

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EnumValues: Record<string, readonly string[]> = {`);
for (const [name, values] of Object.entries(protocol.enums)) {
  w(`  ${name}: Object.values(${name}),`);
}
w(`};

function validateStructured(name: string, value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [\`\${name} must be an object\`];
  }
  const objectSchemas: Record<string, Record<string, FieldSpec>> = {`);
for (const [name, def] of Object.entries(protocol.types)) {
  w(`    ${name}: {`);
  for (const [field, spec] of Object.entries(def.fields)) {
    w(`      ${field}: { type: '${spec.type}', required: ${!!spec.required} },`);
  }
  w('    },');
}
w(`  };
  const schema = objectSchemas[name];
  if (!schema) return [\`Unknown structured type: \${name}\`];
  const errors: string[] = [];
  const obj = value as Record<string, unknown>;
  for (const [field, spec] of Object.entries(schema)) {
    if (!(field in obj)) {
      if (spec.required) errors.push(\`\${name}.\${field} is required\`);
      continue;
    }
    errors.push(...validateFieldValue(\`\${name}.\${field}\`, spec.type, obj[field]));
  }
  return errors;
}

function validateFieldValue(label: string, typeToken: string, value: unknown): string[] {
  if (typeToken === 'uuid') {
    return typeof value === 'string' && UUID_V4_REGEX.test(value)
      ? []
      : [\`\${label} must be a UUIDv4 string\`];
  }
  if (typeToken === 'string') {
    return typeof value === 'string' ? [] : [\`\${label} must be a string\`];
  }
  if (typeToken === 'number') {
    return typeof value === 'number' ? [] : [\`\${label} must be a number\`];
  }
  if (typeToken === 'boolean') {
    return typeof value === 'boolean' ? [] : [\`\${label} must be a boolean\`];
  }
  if (typeToken === 'string|null') {
    return typeof value === 'string' || value === null
      ? []
      : [\`\${label} must be a string or null\`];
  }
  if (typeToken === 'number|null') {
    return typeof value === 'number' || value === null
      ? []
      : [\`\${label} must be a number or null\`];
  }
  if (typeToken.startsWith('enum:')) {
    const enumName = typeToken.slice(5);
    const allowed = EnumValues[enumName] ?? [];
    return typeof value === 'string' && allowed.includes(value)
      ? []
      : [\`\${label} must be one of: \${allowed.join(', ')}\`];
  }
  if (typeToken.startsWith('object:')) {
    return validateStructured(typeToken.slice(7), value);
  }
  const arrayMatch = typeToken.match(/^array<enum:(\\w+)>$/);
  if (arrayMatch) {
    const allowed = EnumValues[arrayMatch[1]!] ?? [];
    if (!Array.isArray(value)) return [\`\${label} must be an array\`];
    const bad = value.filter((v) => typeof v !== 'string' || !allowed.includes(v));
    return bad.length === 0
      ? []
      : [\`\${label} entries must be one of: \${allowed.join(', ')}\`];
  }
  return [\`\${label}: unknown type token \${typeToken}\`];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a message payload (excluding the 'type' field itself) against its schema.
 * Unknown fields are ignored for forward compatibility.
 */
export function validateMessage(
  messageType: string,
  payload: Record<string, unknown>
): ValidationResult {
  const schema = MessageSchemas[messageType as MessageType];
  if (!schema) {
    return { valid: false, errors: [\`Unknown message type: \${messageType}\`] };
  }

  const errors: string[] = [];
  for (const field of schema.required) {
    if (!(field in payload)) errors.push(\`Missing required field: \${field}\`);
  }
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (field in payload) {
      errors.push(...validateFieldValue(field, spec.type, payload[field]));
    }
  }
  return { valid: errors.length === 0, errors };
}

// ============================================================================
// PROTOCOL VERSION NEGOTIATION
// ============================================================================

export function parseVersion(
  version?: string
): { major: number; minor: number; patch: number } | null {
  if (!version) return null;
  const match = version.match(/^(\\d+)\\.(\\d+)\\.(\\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
  };
}

/** Compatible when major versions match. */
export function isVersionCompatible(clientVersion?: string, serverVersion?: string): boolean {
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);
  if (!client || !server) return false;
  return client.major === server.major;
}

/** The negotiated version is the lower of two compatible versions. */
export function getNegotiatedVersion(
  clientVersion?: string,
  serverVersion?: string
): string | null {
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);
  if (!client || !server || client.major !== server.major) return null;
  if (client.minor !== server.minor) {
    return client.minor < server.minor ? clientVersion! : serverVersion!;
  }
  return client.patch <= server.patch ? clientVersion! : serverVersion!;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  PROTOCOL_VERSION,
  Transport,
  Timers,
  MessageTypes,
  MessageMetadata,
  MessageSchemas,`);
for (const name of Object.keys(protocol.enums)) {
  w(`  ${name},`);
}
w(`  InitialCallState,
  TerminalCallStates,
  StateTransitions,
  TransitionTriggers,
  isValidStateTransition,
  isTerminalState,
  validateMessage,
  parseVersion,
  isVersionCompatible,
  getNegotiatedVersion,
};`);

fs.writeFileSync(path.join(__dirname, 'index.ts'), lines.join('\n') + '\n');
console.log(`Generated index.ts (protocol ${protocol.version}, ${Object.keys(protocol.messages).length} message types)`);
