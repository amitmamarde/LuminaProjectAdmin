import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:consumer_app/models/article_model.dart';
import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';

/// A screen to display the full `deepDiveContent` of an article,
/// typically used for 'Misinformation' fact-checks.
///
/// It fetches the article data from Firestore using the provided `articleId`.
class PublicArticleView extends StatelessWidget {
  final String articleId;

  const PublicArticleView({super.key, required this.articleId});

  Future<Article?> _fetchArticle() async {
    try {
      final docSnapshot = await FirebaseFirestore.instance
          .collection('articles')
          .doc(articleId)
          .get();
      if (docSnapshot.exists) {
        return Article.fromFirestore(docSnapshot);
      }
    } catch (e) {
      debugPrint('Error fetching article: $e');
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder<Article?>(
        future: _fetchArticle(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData || snapshot.data == null) {
            return const Center(child: Text('Article not found or failed to load.'));
          }

          final article = snapshot.data!;
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                title: Text(article.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                pinned: true,
              ),
              SliverToBoxAdapter(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16.0),
                  // Use the flutter_html package to render the deep dive content
                  child: Html(data: article.deepDiveContent ?? '<p>No content available.</p>'),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
