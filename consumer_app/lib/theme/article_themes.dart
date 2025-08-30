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
    base: Color(0xFFF0FFF4), // bg-positive-base
    accent: Color(0xFF2F855A), // text-positive-accent
    text: Color(0xFF2D3748),   // text-positive-text
    textSecondary: Color(0xFF4A5568),
  ),
  'Research Breakthrough': const ArticleTheme(
    base: Color(0xFFEBF8FF), // bg-research-base
    accent: Color(0xFF3182CE), // text-research-accent
    text: Color(0xFF1A202C),
    textSecondary: Color(0xFF2D3748),
  ),
  'Misinformation': const ArticleTheme(
    base: Color(0xFFFFF5F5), // bg-misinformation-base
    accent: Color(0xFFC53030), // text-misinformation-accent
    text: Color(0xFF2D3748),
    textSecondary: Color(0xFF4A5568),
  ),
  'Trending Topic': const ArticleTheme(
    base: Color(0xFFEDF2F7), // bg-trending-base
    accent: Color(0xFF4A5568), // text-trending-accent
    text: Color(0xFF1A202C),
    textSecondary: Color(0xFF2D3748),
  ),
};

// A safe default theme to fall back on if the articleType is null or unknown.
final ArticleTheme defaultTheme = articleTypeThemes['Trending Topic']!;
