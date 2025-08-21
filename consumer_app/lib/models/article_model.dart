import 'package:cloud_firestore/cloud_firestore.dart';

/// Represents the structure of an Article, mirroring the Firestore document.
/// This model is used throughout the consumer app to handle article data.
class Article {
  final String id;
  final String title;
  final String? flashContent;
  final String? deepDiveContent;
  final String? imageUrl;
  final Timestamp? publishedAt;
  final List<String> categories;
  final String? sourceUrl;
  final String? sourceTitle;

  Article({
    required this.id,
    required this.title,
    this.flashContent,
    this.deepDiveContent,
    this.imageUrl,
    this.publishedAt,
    required this.categories,
    this.sourceUrl,
    this.sourceTitle,
  });

  /// A factory constructor to create an Article instance from a Firestore document.
  /// This is the standard way to parse data from Firestore into a local object.
  factory Article.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? {};
    return Article(
      id: doc.id,
      title: data['title'] ?? 'No Title',
      flashContent: data['flashContent'],
      deepDiveContent: data['deepDiveContent'],
      imageUrl: data['imageUrl'],
      publishedAt: data['publishedAt'] as Timestamp?,
      categories: List<String>.from(data['categories'] ?? []),
      sourceUrl: data['sourceUrl'],
      sourceTitle: data['sourceTitle'],
    );
  }
}