import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:consumer_app/models/article.dart';
import 'package:consumer_app/screens/article_detail_screen.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';

class ArticleFeedScreen extends StatefulWidget {
  const ArticleFeedScreen({super.key});

  @override
  State<ArticleFeedScreen> createState() => _ArticleFeedScreenState();
}

class _ArticleFeedScreenState extends State<ArticleFeedScreen> {
  late final Stream<QuerySnapshot> _articlesStream;

  @override
  void initState() {
    super.initState();
    // Create a stream to listen for published articles, ordered by the newest first.
    _articlesStream = FirebaseFirestore.instance
        .collection('articles')
        .where('status', isEqualTo: 'Published')
        .orderBy('publishedAt', descending: true)
        .snapshots();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: StreamBuilder<QuerySnapshot>(
        stream: _articlesStream,
        builder: (BuildContext context, AsyncSnapshot<QuerySnapshot> snapshot) {
          if (snapshot.hasError) {
            return const Center(
              child: Text(
                'Something went wrong',
                style: TextStyle(color: Colors.white),
              ),
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            // Show a loading indicator while fetching data
            return const Center(
              child: SpinKitFadingCube(color: Colors.white, size: 50.0),
            );
          }

          if (snapshot.data == null || snapshot.data!.docs.isEmpty) {
            return const Center(
              child: Text(
                'No articles found.',
                style: TextStyle(color: Colors.white),
              ),
            );
          }

          final articles = snapshot.data!.docs
              .map((doc) => Article.fromFirestore(doc))
              .toList();

          // Use PageView.builder to create a swipeable feed of articles.
          return PageView.builder(
            scrollDirection: Axis.vertical,
            itemCount: articles.length,
            itemBuilder: (context, index) =>
                ArticleDetailScreen(article: articles[index]),
          );
        },
      ),
    );
  }
}
