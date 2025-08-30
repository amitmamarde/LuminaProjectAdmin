import 'package:flutter/material.dart';

class ArticleTheme {
  final Color base;
  final Color accent;
  final Color text;
  final Color textSecondary;

  const ArticleTheme({
    required this.base,
    required this.accent,
    required this.text,
    required this.textSecondary,
  });
}

// Using String keys that EXACTLY match the 'articleType' field in Firestore.
// Colors are aligned with the web application's theme.
final Map<String, ArticleTheme> articleTypeThemes = {
  'Positive News': const ArticleTheme(
    base: Color(0xFFE8F5E9),      // tailwind: bg-positive-base
    accent: Color(0xFF43A047),    // tailwind: text-positive-accent
    text: Color(0xFF1B5E20),      // tailwind: text-positive-text
    textSecondary: Color(0xCC1B5E20), // text-positive-text with 80% opacity
  ),
  'Research Breakthrough': const ArticleTheme(
    base: Color(0xFFE3F2FD),      // tailwind: bg-research-base
    accent: Color(0xFF1976D2),    // tailwind: text-research-accent
    text: Color(0xFF0D47A1),      // tailwind: text-research-text
    textSecondary: Color(0xCC0D47A1), // text-research-text with 80% opacity
  ),
  'Misinformation': const ArticleTheme(
    base: Color(0xFFFFF3E0),      // tailwind: bg-misinformation-base
    accent: Color(0xFFFB8C00),    // tailwind: text-misinformation-accent
    text: Color(0xFFE65100),      // tailwind: text-misinformation-text
    textSecondary: Color(0xCCE65100), // text-misinformation-text with 80% opacity
  ),
  'Trending Topic': const ArticleTheme(
    base: Color(0xFFF5F5F5),      // tailwind: bg-trending-base
    accent: Color(0xFF616161),    // tailwind: text-trending-accent
    text: Color(0xFF212121),      // tailwind: text-trending-text
    textSecondary: Color(0xCC212121), // text-trending-text with 80% opacity
  ),
};

// A safe default theme to fall back on if the articleType is null or unknown.
final ArticleTheme defaultTheme = articleTypeThemes['Trending Topic']!;
