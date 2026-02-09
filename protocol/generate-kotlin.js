#!/usr/bin/env node

/**
 * Generate Kotlin constants from protocol JSON schema
 *
 * Reads protocol.json and generates Protocol.kt with:
 * - Message type constants
 * - Enum classes for CallType, DeviceType, etc.
 * - Protocol version constant
 *
 * Output: android-app/app/src/main/java/tech/callsafe/business/protocol/Protocol.kt
 */

const fs = require('fs');
const path = require('path');

// Read protocol.json
const protocolPath = path.join(__dirname, 'protocol.json');
const protocol = JSON.parse(fs.readFileSync(protocolPath, 'utf-8'));

// Build Kotlin file content
let kotlinContent = `package tech.callsafe.business.protocol

/**
 * CallSafe WebRTC Protocol Constants
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
     * All WebSocket event names
     */
    object MessageTypes {
`;

// Add message type constants
Object.entries(protocol.messageTypes).forEach(([key, value]) => {
    const constantName = key;
    kotlinContent += `        const val ${constantName} = "${value}"\n`;
});

kotlinContent += `    }

    /**
     * Call Types
     */
    enum class CallType(val value: String) {
`;

// Add CallType enum
Object.entries(protocol.enums.CallType).forEach(([key, value], index, arr) => {
    const isLast = index === arr.length - 1;
    kotlinContent += `        ${key}("${value}")${isLast ? ';' : ','}\n`;
});

kotlinContent += `
        companion object {
            fun fromValue(value: String): CallType? = values().find { it.value == value }
        }
    }

    /**
     * Device Types
     */
    enum class DeviceType(val value: String) {
`;

// Add DeviceType enum
Object.entries(protocol.enums.DeviceType).forEach(([key, value], index, arr) => {
    const isLast = index === arr.length - 1;
    kotlinContent += `        ${key}("${value}")${isLast ? ';' : ','}\n`;
});

kotlinContent += `
        companion object {
            fun fromValue(value: String): DeviceType? = values().find { it.value == value }
        }
    }

    /**
     * Device Status
     */
    enum class DeviceStatus(val value: String) {
`;

// Add DeviceStatus enum
Object.entries(protocol.enums.DeviceStatus).forEach(([key, value], index, arr) => {
    const isLast = index === arr.length - 1;
    kotlinContent += `        ${key}("${value}")${isLast ? ';' : ','}\n`;
});

kotlinContent += `
        companion object {
            fun fromValue(value: String): DeviceStatus? = values().find { it.value == value }
        }
    }

    /**
     * Call States
     */
    enum class CallState(val value: String) {
`;

// Add CallState enum
Object.entries(protocol.enums.CallState).forEach(([key, value], index, arr) => {
    const isLast = index === arr.length - 1;
    kotlinContent += `        ${key}("${value}")${isLast ? ';' : ','}\n`;
});

kotlinContent += `
        companion object {
            fun fromValue(value: String): CallState? = values().find { it.value == value }
        }
    }

    /**
     * Call End Reasons
     */
    enum class CallEndReason(val value: String) {
`;

// Add CallEndReason enum
Object.entries(protocol.enums.CallEndReason).forEach(([key, value], index, arr) => {
    const isLast = index === arr.length - 1;
    kotlinContent += `        ${key}("${value}")${isLast ? ';' : ','}\n`;
});

kotlinContent += `
        companion object {
            fun fromValue(value: String): CallEndReason? = values().find { it.value == value }
        }
    }

    /**
     * Call Initiator
     */
    enum class CallInitiator(val value: String) {
`;

// Add CallInitiator enum
Object.entries(protocol.enums.CallInitiator).forEach(([key, value], index, arr) => {
    const isLast = index === arr.length - 1;
    kotlinContent += `        ${key}("${value}")${isLast ? ';' : ','}\n`;
});

kotlinContent += `
        companion object {
            fun fromValue(value: String): CallInitiator? = values().find { it.value == value }
        }
    }

    /**
     * Media Track Types
     */
    enum class MediaTrackType(val value: String) {
`;

// Add MediaTrackType enum
Object.entries(protocol.enums.MediaTrackType).forEach(([key, value], index, arr) => {
    const isLast = index === arr.length - 1;
    kotlinContent += `        ${key}("${value}")${isLast ? ';' : ','}\n`;
});

kotlinContent += `
        companion object {
            fun fromValue(value: String): MediaTrackType? = values().find { it.value == value }
        }
    }

    /**
     * Media Toggle Actions
     */
    enum class MediaToggleAction(val value: String) {
`;

// Add MediaToggleAction enum
Object.entries(protocol.enums.MediaToggleAction).forEach(([key, value], index, arr) => {
    const isLast = index === arr.length - 1;
    kotlinContent += `        ${key}("${value}")${isLast ? ';' : ','}\n`;
});

kotlinContent += `
        companion object {
            fun fromValue(value: String): MediaToggleAction? = values().find { it.value == value }
        }
    }
}
`;

// Write to Android app directory
const outputDir = path.join(__dirname, '..', 'android-app', 'app', 'src', 'main', 'java', 'tech', 'callsafe', 'business', 'protocol');
const outputPath = path.join(outputDir, 'Protocol.kt');

// Create directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Write Kotlin file
fs.writeFileSync(outputPath, kotlinContent);

console.log(`✓ Generated Kotlin protocol constants at: ${outputPath}`);
console.log(`  Protocol version: ${protocol.version}`);
console.log(`  Message types: ${Object.keys(protocol.messageTypes).length}`);
console.log(`  Enums: ${Object.keys(protocol.enums).length}`);
