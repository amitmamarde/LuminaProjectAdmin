import 'package:flutter/foundation.dart' show kIsWeb;

/// The base URL of your deployed `imageProxy` Cloud Function.
///
/// **IMPORTANT**: Replace this placeholder with the actual trigger URL of your
/// `imageProxy` function from the Firebase console.
const String _proxyBaseUrl = 'https://imageproxy-xgafrhthwa-ew.a.run.app';

/// Returns a proxied URL for an image if running on the web, otherwise returns
/// the original URL. This is used to bypass CORS issues in web browsers.
String getProxiedImageUrl(String originalUrl) {
  // The proxy is only needed for the web platform.
  // Native mobile apps don't have the same CORS restrictions.
  if (kIsWeb) {
    return '$_proxyBaseUrl?url=${Uri.encodeComponent(originalUrl)}';
  }
  return originalUrl;
}
