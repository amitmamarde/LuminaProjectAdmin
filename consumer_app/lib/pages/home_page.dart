import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:share_plus/share_plus.dart';

import '../models/article_model.dart';
import '../screens/article_detail_screen.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late final Stream<QuerySnapshot> _articlesStream;

  @override
  void initState() {
    super.initState();
    _articlesStream = FirebaseFirestore.instance
        .collection('articles')
        .where('status', isEqualTo: 'Published')
        .orderBy('publishedAt', descending: true)
        .snapshots();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: StreamBuilder<QuerySnapshot>(
        stream: _articlesStream,
        builder: (BuildContext context, AsyncSnapshot<QuerySnapshot> snapshot) {
          if (snapshot.hasError) {
            return const Center(child: Text('Something went wrong'));
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.data!.docs.isEmpty) {
            return const Center(child: Text('No articles found.'));
          }

          return PageView.builder(
            scrollDirection: Axis.vertical,
            itemCount: snapshot.data!.docs.length,
            itemBuilder: (context, index) {
              final article = Article.fromFirestore(snapshot.data!.docs[index]);
              return ArticleCard(article: article);
            },
          );
        },
      ),
    );
  }
}

class ArticleCard extends StatelessWidget {
  final Article article;

  const ArticleCard({super.key, required this.article});

  void _onShare(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    final shareText = '${article.title}\n\n${article.flashContent}';
    // NOTE: This should be replaced with the actual public URL of the article viewer.
    final url = 'https://your-lumina-app.com/view/${article.id}';

    Share.share(
      '$shareText\n\nRead more: $url',
      subject: article.title,
      sharePositionOrigin: box!.localToGlobal(Offset.zero) & box.size,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isPositiveNews = article.articleType == 'Positive News';
    final backgroundColor = isPositiveNews ? const Color(0xFFF0FFF4) : const Color(0xFFF8F9FA); // Light green vs Off-white
    final textColor = Colors.black87;

    return Container(
      color: backgroundColor,
      padding: const EdgeInsets.all(16.0),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Image Container
            Expanded(
              flex: 2, // Takes up ~40% of the vertical space
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 8, offset: const Offset(0, 4)),
                  ]
                ),
                clipBehavior: Clip.antiAlias,
                child: article.imageUrl != null
                    ? Image.network(
                        article.imageUrl!,
                        fit: BoxFit.cover,
                        loadingBuilder: (context, child, loadingProgress) {
                          if (loadingProgress == null) return child;
                          return const Center(child: CircularProgressIndicator());
                        },
                        errorBuilder: (context, error, stackTrace) {
                          return const Center(child: Icon(Icons.error_outline, color: Colors.red, size: 48));
                        },
                      )
                    : Center(
                        child: Text(
                          'Lumina',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                            fontFamily: 'serif',
                            color: Colors.grey[600],
                          ),
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 16),
            // Content Container
            Expanded(
              flex: 3, // Takes up ~60% of the vertical space
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      article.title,
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: textColor),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      article.flashContent ?? 'Summary not available.',
                      style: TextStyle(fontSize: 16, height: 1.5, color: textColor.withOpacity(0.8)),
                    ),
                  ],
                ),
              ),
            ),
            // Footer/Actions Container
            Container(
              padding: const EdgeInsets.only(top: 12.0),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: Colors.grey[300]!))),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (context) => ArticleDetailScreen(article: article)));
                    },
                    child: const Text('Read More', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.share),
                    onPressed: () => _onShare(context),
                    tooltip: 'Share',
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