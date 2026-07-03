#!/usr/bin/env node

/**
 * Generate Kotlin constants from protocol.json (the canonical specification).
 *
 * Emits Protocol.kt with message type constants and one enum class per
 * protocol enum. Everything is derived generically from protocol.json, so
 * adding a message or enum there is automatically reflected here.
 *
 * Output: android-app/app/src/main/java/tech/callsafe/business/protocol/Protocol.kt
 * To regenerate: node generate-kotlin.js
 */

const fs = require('fs');
const path = require('path');

const protocol = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'protocol.json'), 'utf-8')
);

let out = `package tech.callsafe.business.protocol

/**
 * CallSafe WebRTC Signaling Protocol Constants
 * Version: ${protocol.version}
 *
 * AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
 * To regenerate: node protocol/generate-kotlin.js
 *
 * This file provides type-safe protocol constants for Android.
 * All WebSocket message types must use these constants.
 */

object Protocol {
    const val VERSION = "${protocol.version}"

    /**
     * Message Types
     * All WebSocket message type strings
     */
    object MessageTypes {
`;

for (const [type, def] of Object.entries(protocol.messages)) {
  out += `        const val ${def.constant} = "${type}"\n`;
}

out += `    }
`;

for (const [name, values] of Object.entries(protocol.enums)) {
  out += `
    /**
     * ${name}
     */
    enum class ${name}(val value: String) {
`;
  const entries = Object.entries(values);
  entries.forEach(([key, value], index) => {
    const isLast = index === entries.length - 1;
    out += `        ${key}("${value}")${isLast ? ';' : ','}\n`;
  });
  out += `
        companion object {
            fun fromValue(value: String): ${name}? = values().find { it.value == value }
        }
    }
`;
}

out += `}
`;

const outputDir = path.join(
  __dirname, '..', 'android-app', 'app', 'src', 'main',
  'java', 'tech', 'callsafe', 'business', 'protocol'
);
const outputPath = path.join(outputDir, 'Protocol.kt');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
fs.writeFileSync(outputPath, out);

console.log(`Generated Kotlin protocol constants at: ${outputPath}`);
console.log(`  Protocol version: ${protocol.version}`);
console.log(`  Message types: ${Object.keys(protocol.messages).length}`);
console.log(`  Enums: ${Object.keys(protocol.enums).length}`);
