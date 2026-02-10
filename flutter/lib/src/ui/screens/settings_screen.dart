import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

/// Settings screen
/// Displays app configuration options
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF242424),
        elevation: 0,
        title: const Text(
          'Settings',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        children: [
          // Audio Settings Section
          _SectionHeader(title: 'Audio'),
          _SettingsTile(
            icon: Icons.volume_up,
            title: 'Speaker Mode',
            subtitle: 'Use speakerphone by default',
            trailing: Switch(
              value: false, // TODO: Wire up to state
              onChanged: (value) {
                // TODO: Implement audio setting persistence
              },
              activeColor: Colors.green,
            ),
          ),
          _SettingsTile(
            icon: Icons.mic,
            title: 'Auto Mute',
            subtitle: 'Mute microphone when call starts',
            trailing: Switch(
              value: false, // TODO: Wire up to state
              onChanged: (value) {
                // TODO: Implement audio setting persistence
              },
              activeColor: Colors.green,
            ),
          ),
          const Divider(height: 1, color: Color(0xFF2A2A2A)),

          // Notification Settings Section
          _SectionHeader(title: 'Notifications'),
          _SettingsTile(
            icon: Icons.notifications,
            title: 'Push Notifications',
            subtitle: 'Receive notifications for incoming calls',
            trailing: Switch(
              value: true, // TODO: Wire up to state
              onChanged: (value) {
                // TODO: Implement notification settings
              },
              activeColor: Colors.green,
            ),
          ),
          _SettingsTile(
            icon: Icons.vibration,
            title: 'Vibration',
            subtitle: 'Vibrate on incoming calls',
            trailing: Switch(
              value: true, // TODO: Wire up to state
              onChanged: (value) {
                // TODO: Implement vibration setting
              },
              activeColor: Colors.green,
            ),
          ),
          const Divider(height: 1, color: Color(0xFF2A2A2A)),

          // Account Section
          _SectionHeader(title: 'Account'),
          _SettingsTile(
            icon: Icons.person,
            title: 'Profile',
            subtitle: 'Manage your profile',
            trailing: const Icon(Icons.chevron_right, color: Colors.white54),
            onTap: () {
              // TODO: Navigate to profile screen
              _showComingSoon(context);
            },
          ),
          _SettingsTile(
            icon: Icons.logout,
            title: 'Sign Out',
            subtitle: 'Sign out of your account',
            trailing: const Icon(Icons.chevron_right, color: Colors.white54),
            onTap: () {
              _showSignOutConfirm(context);
            },
          ),
          const Divider(height: 1, color: Color(0xFF2A2A2A)),

          // App Section
          _SectionHeader(title: 'App'),
          _SettingsTile(
            icon: Icons.info_outline,
            title: 'About',
            subtitle: 'Version 1.0.0',
            trailing: const Icon(Icons.chevron_right, color: Colors.white54),
            onTap: () {
              _showAboutDialog(context);
            },
          ),
          _SettingsTile(
            icon: Icons.privacy_tip_outlined,
            title: 'Privacy Policy',
            subtitle: 'View privacy policy',
            trailing: const Icon(Icons.chevron_right, color: Colors.white54),
            onTap: () {
              // TODO: Open privacy policy
              _showComingSoon(context);
            },
          ),
          _SettingsTile(
            icon: Icons.description_outlined,
            title: 'Terms of Service',
            subtitle: 'View terms of service',
            trailing: const Icon(Icons.chevron_right, color: Colors.white54),
            onTap: () {
              // TODO: Open terms of service
              _showComingSoon(context);
            },
          ),
          const Divider(height: 1, color: Color(0xFF2A2A2A)),

          // Storage Section
          _SectionHeader(title: 'Storage'),
          _SettingsTile(
            icon: Icons.storage,
            title: 'Clear Cache',
            subtitle: 'Free up storage space',
            trailing: const Icon(Icons.chevron_right, color: Colors.white54),
            onTap: () {
              _showClearCacheConfirm(context);
            },
          ),

          const SizedBox(height: 40),
        ],
      ),
    );
  }

  void _showAboutDialog(BuildContext context) {
    showAboutDialog(
      context: context,
      applicationName: 'CallSafe',
      applicationVersion: '1.0.0',
      applicationIcon: Container(
        width: 60,
        height: 60,
        decoration: const BoxDecoration(
          color: Colors.green,
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.call,
          color: Colors.white,
          size: 30,
        ),
      ),
      children: [
        const Text(
          'CallSafe is a secure WebRTC calling platform for voice and video communication.',
        ),
      ],
    );
  }

  void _showSignOutConfirm(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF242424),
        title: const Text(
          'Sign out?',
          style: TextStyle(color: Colors.white),
        ),
        content: Text(
          'You will need to sign in again to receive calls.',
          style: TextStyle(color: Colors.grey[400]),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancel',
              style: TextStyle(color: Colors.grey[400]),
            ),
          ),
          TextButton(
            onPressed: () {
              // TODO: Implement sign out
              Navigator.pop(context);
            },
            child: const Text(
              'Sign Out',
              style: TextStyle(color: Colors.red),
            ),
          ),
        ],
      ),
    );
  }

  void _showClearCacheConfirm(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF242424),
        title: const Text(
          'Clear cache?',
          style: TextStyle(color: Colors.white),
        ),
        content: Text(
          'This will clear temporary files and free up storage.',
          style: TextStyle(color: Colors.grey[400]),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancel',
              style: TextStyle(color: Colors.grey[400]),
            ),
          ),
          TextButton(
            onPressed: () async {
              // Clear Hive boxes
              await Hive.deleteFromDisk();
              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Cache cleared')),
                );
              }
            },
            child: const Text(
              'Clear',
              style: TextStyle(color: Colors.green),
            ),
          ),
        ],
      ),
    );
  }

  void _showComingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Coming soon'),
        duration: Duration(seconds: 2),
      ),
    );
  }
}

/// Section header widget
class _SectionHeader extends StatelessWidget {
  final String title;

  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          color: Colors.grey[500],
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

/// Settings tile widget
class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.grey[800],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  icon,
                  color: Colors.white,
                  size: 22,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: Colors.grey[400],
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
        ),
      ),
    );
  }
}
