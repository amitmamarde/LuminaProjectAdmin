import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:intl/intl.dart'; // For date formatting
import 'package:share_plus/share_plus.dart';
import 'package:consumer_app/models/article_model.dart';


class ArticleDetailPage extends StatelessWidget {
  final Article article;

  const ArticleDetailPage({super.key, required this.article});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: () {
              // TODO: Replace with your actual web app's domain.
              const String appBaseUrl = 'https://lumina-news.web.app';

              // This creates a deep link to the article. For this to work,
              // your app's routing must be configured to handle paths like '/article/:id'.
              // Since no router is configured in the project, this is a starting point.
              final String articleUrl = '$appBaseUrl/#/article/${article.id}';

              Share.share(
                'Check out this article on Lumina: ${article.title}\n\n$articleUrl',
              );
            },
          ),
        ],
        title: Text(
          article.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      // Using a CustomScrollView with Slivers is a more robust way to handle
      // complex scrolling layouts, especially with widgets like flutter_html
      // that have their own internal layout logic. This ensures that all content,
      // no matter how long, is scrollable.
      body: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.all(16.0),
            sliver: SliverList(
              delegate: SliverChildListDelegate(
                [
                  // Display the article image if available
                  if (article.imageUrl != null && article.imageUrl!.isNotEmpty)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12.0),
                      child: Image.network(
                        article.imageUrl!,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        height: 220,
                      ),
                    ),
                  const SizedBox(height: 16),
                  // Article Title
                  Text(
                    article.title,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Display categories and publish date
                  Text(
                    '${article.categories.join(', ')} • ${article.publishedAt != null ? DateFormat.yMMMd().format(article.publishedAt!.toDate()) : ''}',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Colors.grey[600]),
                  ),
                  const Divider(height: 24),
                  Html(
                    data: article.deepDiveContent ?? '<p>No content available.</p>',
                    style: {"body": Style(fontSize: FontSize.large)},
                  ),
                ],
              ),
            ),
          )
        ],
      ),
    );
  }
}
