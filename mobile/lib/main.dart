import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens.dart';

const String supabaseUrl = String.fromEnvironment(
  'SUPABASE_URL',
  defaultValue: 'https://dfejgtomnabnpychtpcs.supabase.co',
);
const String supabasePublishableKey = String.fromEnvironment(
  'SUPABASE_PUBLISHABLE_KEY',
  defaultValue: String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'sb_publishable_OH4vl-EWQUc5Yfr0JUMomg_FEOIqK6n',
  ),
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final configured =
      supabaseUrl.startsWith('https://') &&
      !supabaseUrl.contains('PASTE_') &&
      !supabasePublishableKey.contains('PASTE_') &&
      supabasePublishableKey.isNotEmpty;

  if (configured) {
    await Supabase.initialize(
      url: supabaseUrl,
      publishableKey: supabasePublishableKey,
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
      ),
    );
  }

  runApp(ShiftbuckApp(cloudEnabled: configured));
}
