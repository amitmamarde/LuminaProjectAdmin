import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:consumer_app/models/article_model.dart';
import 'package:consumer_app/widgets/article_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';

class ArticleFeedScreen extends StatelessWidget {
  const ArticleFeedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: StreamBuilder<QuerySnapshot>(
        // The existing model factory uses DocumentSnapshot, not the typed one.
        stream: FirebaseFirestore.instance
            .collection('articles')
            .where('status', isEqualTo: 'Published')
            .orderBy('publishedAt', descending: true)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Text('Something went wrong: ${snapshot.error}'),
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: SpinKitFadingCube(color: Colors.white, size: 50.0),
            );
          }

          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return const Center(child: Text('No articles found.'));
          }

          final articles = snapshot.data!.docs
              .map((doc) => Article.fromFirestore(doc))
              .toList();

          return PageView.builder(
            scrollDirection: Axis.vertical,
            itemCount: articles.length,
            itemBuilder: (context, index) {
              return ArticlePage(
                key: ValueKey(articles[index].id),
                article: articles[index],
              );
            },
          );
        },
      ),
    );
  }
}
