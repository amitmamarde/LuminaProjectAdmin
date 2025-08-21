import 'package:cloud_firestore/cloud_firestore.dart';

class Article {
  final String id;
  final String title;
  final List<String> categories;
  final String? imageUrl;
  final String? flashContent;
  final String? deepDiveContent;
  final Timestamp? publishedAt;
  final String articleType;
  final String? sourceUrl;
  final String? sourceTitle;

  Article({
    required this.id,
    required this.title,
    required this.categories,
    this.imageUrl,
    this.flashContent,
    this.deepDiveContent,
    this.publishedAt,
    required this.articleType,
    this.sourceUrl,
    this.sourceTitle,
  });

  // Factory constructor to create an Article instance from a Firestore document.
  // This is a robust way to parse the data from Firestore.
  factory Article.fromFirestore(DocumentSnapshot doc) {
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;
    return Article(
      id: doc.id,
      title: data['title'] ?? '',
      categories: List<String>.from(data['categories'] ?? []),
      imageUrl: data['imageUrl'],
      flashContent: data['flashContent'],
      deepDiveContent: data['deepDiveContent'],
      publishedAt: data['publishedAt'] as Timestamp?,
      articleType: data['articleType'] ?? 'Trending Topic',
      sourceUrl: data['sourceUrl'],
      sourceTitle: data['sourceTitle'],
    );
  }
}