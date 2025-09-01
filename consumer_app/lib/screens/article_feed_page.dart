import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:consumer_app/models/article_model.dart';
// import 'package:consumer_app/screens/article_detail_page.dart'; // No longer used directly from this card
import 'package:consumer_app/screens/article_webview_screen.dart';
import 'package:consumer_app/screens/public_article_view.dart';
import 'package:flutter/material.dart';

class ArticleFeedPage extends StatelessWidget {
  const ArticleFeedPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lumina Feed')),
      // Use a StreamBuilder to listen for real-time updates from Firestore.
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        // Query the 'articles' collection, filtering for published articles
        // and ordering them by the most recent.
        stream: FirebaseFirestore.instance
            .collection('articles')
            .where('status', isEqualTo: 'Published')
            .orderBy('publishedAt', descending: true)
            .snapshots(),
        builder: (context, snapshot) {
          // Handle loading state
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          // Handle error state
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          // Handle no data state
          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return const Center(child: Text('No articles found.'));
          }

          // If we have data, build the list of articles
          final articles = snapshot.data!.docs
              .map((doc) => Article.fromFirestore(doc))
              .toList();

          return ListView.builder(
            itemCount: articles.length,
            itemBuilder: (context, index) {
              final article = articles[index];
              return ArticleCard(article: article);
            },
          );
        },
      ),
    );
  }
}

/// A reusable card widget to display an article summary.
class ArticleCard extends StatelessWidget {
  final Article article;

  const ArticleCard({super.key, required this.article});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      clipBehavior: Clip.antiAlias,
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        // ===================================================================
        // THIS IS WHERE THE NAVIGATION CODE GOES
        // When the user taps this card, we navigate to the detail page.
        // The logic is now updated to handle different article types.
        // ===================================================================
        onTap: () {
          // For 'Misinformation' articles, we show our own deep-dive content.
          if (article.articleType == 'Misinformation') {
            Navigator.push(
              context,
              MaterialPageRoute(
                // We pass the articleId to the view, which will fetch the full
                // content, including the 'deepDiveContent' HTML.
                builder: (context) => PublicArticleView(articleId: article.id),
              ),
            );
          }
          // For all other articles, we open the source URL in our in-app webview.
          else if (article.sourceUrl != null && article.sourceUrl!.isNotEmpty) {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => ArticleWebViewScreen(
                  url: article.sourceUrl!,
                  title: article.sourceTitle ?? 'Article',
                ),
              ),
            );
          } else {
            // Fallback: If there's no URL, show a snackbar.
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('No link available for this article.')),
            );
          }
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (article.imageUrl != null && article.imageUrl!.isNotEmpty)
              Image.network(
                article.imageUrl!,
                height: 200,
                width: double.infinity,
                fit: BoxFit.cover,
              ),
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    article.title,
                    style: Theme.of(context).textTheme.titleLarge,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    article.flashContent ?? 'Tap to read more...',
                    style: Theme.of(context).textTheme.bodyMedium,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
