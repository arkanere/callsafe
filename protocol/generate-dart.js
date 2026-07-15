#!/usr/bin/env node

/**
 * Generate Dart constants and enums from protocol.json (the canonical
 * specification).
 *
 * Emits two files, both derived generically from protocol.json:
 *   - flutter/lib/src/protocol/constants/protocol_constants.dart
 *     (protocolVersion + MessageTypes constants)
 *   - flutter/lib/src/protocol/models/protocol_enums.dart
 *     (one Dart enum per protocol enum)
 *
 * To regenerate: node generate-dart.js
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

const header = (what) => `/// CallSafe WebRTC Signaling Protocol ${what}
/// Version: ${protocol.version}
///
/// AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
/// To regenerate: node protocol/generate-dart.js
`;

// --- protocol_constants.dart ---

let constants = `${header('Constants')}
const String protocolVersion = '${protocol.version}';

/// All WebSocket message type strings.
class MessageTypes {
`;

for (const [type, def] of Object.entries(protocol.messages)) {
  constants += `  static const String ${camelCase(def.constant)} = '${type}';\n`;
}

constants += `}
`;

// --- protocol_enums.dart ---

let enums = `${header('Enums')}
import 'package:json_annotation/json_annotation.dart';
`;

for (const [name, values] of Object.entries(protocol.enums)) {
  enums += `
/// ${name}
enum ${name} {
`;
  const entries = Object.entries(values);
  entries.forEach(([key, value], index) => {
    const isLast = index === entries.length - 1;
    enums += `  @JsonValue('${value}')\n  ${camelCase(key)}('${value}')${isLast ? ';' : ','}\n`;
  });
  enums += `
  const ${name}(this.value);
  final String value;

  static ${name} fromString(String value) {
    return ${name}.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid ${name}: \$value'),
    );
  }
}
`;
}

const flutterProtocolDir = path.join(__dirname, '..', 'flutter', 'lib', 'src', 'protocol');
const outputs = [
  [path.join(flutterProtocolDir, 'constants', 'protocol_constants.dart'), constants],
  [path.join(flutterProtocolDir, 'models', 'protocol_enums.dart'), enums],
];

for (const [outputPath, content] of outputs) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
  console.log(`Generated: ${outputPath}`);
}
console.log(`  Protocol version: ${protocol.version}`);
console.log(`  Message types: ${Object.keys(protocol.messages).length}`);
console.log(`  Enums: ${Object.keys(protocol.enums).length}`);
