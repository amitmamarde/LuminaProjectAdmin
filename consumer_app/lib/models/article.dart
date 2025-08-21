import 'package:cloud_firestore/cloud_firestore.dart';

class Article {
  final String id;
  final String title;
  final String flashContent;
  final String deepDiveContent;
  final String? imageUrl;
  final String articleType;
  final List<String> categories;
  final String sourceTitle;
  final String sourceUrl;
  final String status;
  final DateTime? publishedAt; // ✅ new field

  Article({
    required this.id,
    required this.title,
    required this.flashContent,
    required this.deepDiveContent,
    this.imageUrl,
    required this.articleType,
    required this.categories,
    required this.sourceTitle,
    required this.sourceUrl,
    required this.status,
    this.publishedAt,
  });

  // Factory constructor to create an Article from a Firestore document
  factory Article.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    // Safely parse publishedAt
    DateTime? publishedDate;
    if (data['publishedAt'] != null) {
      if (data['publishedAt'] is Timestamp) {
        publishedDate = (data['publishedAt'] as Timestamp).toDate();
      } else if (data['publishedAt'] is String) {
        // fallback in case some old records are strings
        publishedDate = DateTime.tryParse(data['publishedAt']);
      }
    }

    return Article(
      id: doc.id,
      title: data['title'] ?? 'No Title',
      flashContent: data['flashContent'] ?? '',
      deepDiveContent: data['deepDiveContent'] ?? '',
      imageUrl: data['imageUrl'],
      articleType: data['articleType'] ?? 'Normal',
      categories: List<String>.from(data['categories'] ?? []),
      sourceTitle: data['sourceTitle'] ?? '',
      sourceUrl: data['sourceUrl'] ?? '',
      status: data['status'] ?? '',
      publishedAt: publishedDate, // ✅
    );
  }
}
