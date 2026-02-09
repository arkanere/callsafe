/// Protocol version structure
class ProtocolVersion {
  final int major;
  final int minor;
  final int patch;

  const ProtocolVersion({
    required this.major,
    required this.minor,
    required this.patch,
  });

  @override
  String toString() => '$major.$minor.$patch';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProtocolVersion &&
          runtimeType == other.runtimeType &&
          major == other.major &&
          minor == other.minor &&
          patch == other.patch;

  @override
  int get hashCode => major.hashCode ^ minor.hashCode ^ patch.hashCode;
}

/// Parse a protocol version string
ProtocolVersion? parseVersion(String? version) {
  if (version == null) return null;

  final regex = RegExp(r'^(\d+)\.(\d+)\.(\d+)$');
  final match = regex.firstMatch(version);

  if (match == null) return null;

  return ProtocolVersion(
    major: int.parse(match.group(1)!),
    minor: int.parse(match.group(2)!),
    patch: int.parse(match.group(3)!),
  );
}

/// Check if client version is compatible with server version
/// Compatible if major versions match
bool isVersionCompatible(String? clientVersion, String? serverVersion) {
  final client = parseVersion(clientVersion);
  final server = parseVersion(serverVersion);

  if (client == null || server == null) return false;

  return client.major == server.major;
}

/// Get the negotiated protocol version (use lower version for compatibility)
String? getNegotiatedVersion(String? clientVersion, String? serverVersion) {
  if (clientVersion == null || serverVersion == null) return null;

  final client = parseVersion(clientVersion);
  final server = parseVersion(serverVersion);

  if (client == null || server == null) return null;
  if (client.major != server.major) return null;

  // Use the lower minor version for compatibility
  if (client.minor < server.minor) {
    return clientVersion;
  } else if (server.minor < client.minor) {
    return serverVersion;
  }

  // Same minor version, use lower patch version
  return client.patch <= server.patch ? clientVersion : serverVersion;
}
