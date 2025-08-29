import 'package:cloud_firestore/cloud_firestore.dart';

class Article {
  final String id;
  final String title;
  final String articleType;
  final List<String> categories;
  final String? flashContent;
  final String? deepDiveContent;
  final String? imageUrl;
  final String? sourceUrl;
  final String? sourceTitle;
  final Timestamp? publishedAt;

  Article({
    required this.id,
    required this.title,
    required this.articleType,
    required this.categories,
    this.flashContent,
    this.deepDiveContent,
    this.imageUrl,
    this.sourceUrl,
    this.sourceTitle,
    this.publishedAt,
  });

  factory Article.fromFirestore(DocumentSnapshot doc) {
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;
    return Article(
      id: doc.id,
      title: data['title'] ?? '',
      articleType: data['articleType'] ?? 'Trending Topic',
      categories: List<String>.from(data['categories'] ?? []),
      flashContent: data['flashContent'],
      deepDiveContent: data['deepDiveContent'],
      imageUrl: data['imageUrl'],
      sourceUrl: data['sourceUrl'],
      sourceTitle: data['sourceTitle'],
      publishedAt: data['publishedAt'],
    );
  }
}
