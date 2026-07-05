#!/usr/bin/env node

/**
 * Generate Swift constants from protocol.json (the canonical specification).
 *
 * Emits Protocol.swift with message type constants and one enum per
 * protocol enum. Everything is derived generically from protocol.json, so
 * adding a message or enum there is automatically reflected here.
 *
 * Output: flutter/ios/Runner/Protocol/Protocol.swift
 * To regenerate: node generate-swift.js
 */

const fs = require('fs');
const path = require('path');

const protocol = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'protocol.json'), 'utf-8')
);

// CALL_INITIATE -> callInitiate
function camelCase(snake) {
  return snake
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

let out = `import Foundation

/**
 * CallSafe WebRTC Signaling Protocol Constants
 * Version: ${protocol.version}
 *
 * AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
 * To regenerate: node protocol/generate-swift.js
 *
 * This file provides type-safe protocol constants for iOS.
 * All WebSocket message types must use these constants.
 */

struct Protocol {
    static let VERSION = "${protocol.version}"

    /**
     * Message Types
     * All WebSocket message type strings
     */
    struct MessageTypes {
`;

for (const [type, def] of Object.entries(protocol.messages)) {
  out += `        static let ${def.constant} = "${type}"\n`;
}

out += `    }
`;

for (const [name, values] of Object.entries(protocol.enums)) {
  out += `
    /**
     * ${name}
     */
    enum ${name}: String, CaseIterable {
`;
  for (const [key, value] of Object.entries(values)) {
    out += `        case ${camelCase(key)} = "${value}"\n`;
  }
  out += `    }
`;
}

out += `}
`;

const outputDir = path.join(__dirname, '..', 'flutter', 'ios', 'Runner', 'Protocol');
const outputPath = path.join(outputDir, 'Protocol.swift');

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, out);

console.log(`Generated Swift protocol constants at: ${outputPath}`);
console.log(`  Protocol version: ${protocol.version}`);
console.log(`  Message types: ${Object.keys(protocol.messages).length}`);
console.log(`  Enums: ${Object.keys(protocol.enums).length}`);
