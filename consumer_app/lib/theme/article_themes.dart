import 'package:flutter/material.dart';

// Assuming an enum for ArticleType exists, similar to the web app.
// If not, string constants can be used.
enum ArticleType {
  positiveNews,
  researchBreakthroughs,
  trendingTopic,
  misinformation,
}

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

// The color schemes based on the proposal.
// We also define a secondary text color, which is a slightly lighter shade.
final Map<ArticleType, ArticleTheme> articleThemes = {
  ArticleType.positiveNews: const ArticleTheme(
    base: Color(0xFFE8F5E9), // soft green-mint
    accent: Color(0xFF43A047), // medium green
    text: Color(0xFF1B5E20), // deep green
    textSecondary: Color(0xFF2E7D32), // slightly lighter deep green
  ),
  ArticleType.researchBreakthroughs: const ArticleTheme(
    base: Color(0xFFE3F2FD), // soft sky blue
    accent: Color(0xFF1976D2), // vivid but not harsh blue
    text: Color(0xFF0D47A1), // deep navy blue
    textSecondary: Color(0xFF1565C0), // slightly lighter navy blue
  ),
  ArticleType.trendingTopic: const ArticleTheme(
    base: Color(0xFFF5F5F5), // light gray
    accent: Color(0xFF616161), // medium gray
    text: Color(0xFF212121), // rich black/charcoal
    textSecondary: Color(0xFF424242), // slightly lighter charcoal
  ),
  ArticleType.misinformation: const ArticleTheme(
    base: Color(0xFFFFF3E0), // soft amber-peach
    accent: Color(0xFFFB8C00), // moderate orange
    text: Color(0xFFE65100), // deep orange-brown
    textSecondary: Color(0xFFF57C00), // slightly lighter orange-brown
  ),
};

// Helper function to get the theme for a given article type string from Firestore.
ArticleTheme getThemeForArticleType(String type) {
  if (type == 'Positive News') return articleThemes[ArticleType.positiveNews]!;
  if (type == 'Research Breakthroughs') {
    return articleThemes[ArticleType.researchBreakthroughs]!;
  }
  if (type == 'Misinformation')
    return articleThemes[ArticleType.misinformation]!;
  return articleThemes[ArticleType.trendingTopic]!;
}
