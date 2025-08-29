import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:consumer_app/models/article.dart';
import 'package:consumer_app/widgets/article_feed_card.dart';
import 'package:flutter/material.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<List<Article>> _articlesFuture;

  @override
  void initState() {
    super.initState();
    _articlesFuture = _fetchPublishedArticles();
  }

  Future<List<Article>> _fetchPublishedArticles() async {
    final articlesRef = FirebaseFirestore.instance.collection('articles');
    final querySnapshot = await articlesRef
        .where('status', isEqualTo: 'Published')
        .orderBy('publishedAt', descending: true)
        .get();

    return querySnapshot.docs.map((doc) => Article.fromFirestore(doc)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder<List<Article>>(
        future: _articlesFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData || snapshot.data!.isEmpty) {
            return Center(child: Text(snapshot.hasError ? 'Error: ${snapshot.error}' : 'No articles found.'));
          }

          final articles = snapshot.data!;
          return PageView.builder(
            scrollDirection: Axis.vertical,
            itemCount: articles.length,
            itemBuilder: (context, index) => ArticleFeedCard(article: articles[index]),
          );
        },
      ),
    );
  }
}
