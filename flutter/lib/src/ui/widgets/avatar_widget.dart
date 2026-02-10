import 'package:flutter/material.dart';

/// Reusable avatar widget
/// Displays circular avatar with fallback to icon
class AvatarWidget extends StatelessWidget {
  final String? imageUrl;
  final String? label;
  final double size;
  final Color? backgroundColor;
  final Color? iconColor;

  const AvatarWidget({
    super.key,
    this.imageUrl,
    this.label,
    this.size = 60,
    this.backgroundColor,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final bgColor = backgroundColor ?? Colors.grey[800]!;
    final fgColor = iconColor ?? Colors.grey[400]!;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: bgColor,
        image: imageUrl != null
            ? DecorationImage(
                image: NetworkImage(imageUrl!),
                fit: BoxFit.cover,
              )
            : null,
      ),
      child: imageUrl == null
          ? Icon(
              Icons.person,
              size: size * 0.5,
              color: fgColor,
            )
          : null,
    );
  }
}
