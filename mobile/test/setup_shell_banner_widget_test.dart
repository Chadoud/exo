import 'dart:convert';
import 'dart:io';

import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/design/exo_colors.dart';
import 'package:exosites_mobile/design/exo_status_banner.dart';
import 'support/product_theme.dart';
import 'package:exosites_mobile/features/tasks/tasks_screen.dart';
import 'package:exosites_mobile/features/setup/setup_link_panel.dart';
import 'package:exosites_mobile/features/setup/setup_sign_in_panel.dart';
import 'package:exosites_mobile/layout/adaptive_shell.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter/foundation.dart'
    show debugDefaultTargetPlatformOverride;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

Widget _app(Widget child, {Size size = const Size(390, 844)}) {
  return MaterialApp(
    theme: productTheme(),
    home: MediaQuery(
      data: MediaQueryData(size: size),
      child: Scaffold(body: child),
    ),
  );
}

Future<void> _waitForInboxCard(WidgetTester tester) async {
  for (var i = 0; i < 24; i++) {
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    await tester.pump();
    if (find.text('READY TO SEND').evaluate().isNotEmpty) return;
  }
}

Future<void> _settleStore(WidgetTester tester) async {
  await tester.pump();
  await tester.runAsync(() async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
  });
  await tester.pump();
  await tester.runAsync(() async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
  });
  await tester.pump();
}

int _dbSerial = 0;

Future<MobileSyncConfig> _hydratedConfig(WidgetTester tester) async {
  final config = MobileSyncConfig(
    storage: MemoryKeyValueStore(),
    localStore: LocalBrainStore(
      databasePath: '${Directory.systemTemp.path}/shell_${++_dbSerial}.db',
    ),
  );
  await tester.runAsync(config.hydrate);
  return config;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('SetupSignInPanel', () {
    Widget panel({
      SignInProvider? launchingProvider,
      SignInProvider? waitingProvider,
      bool emailBusy = false,
      String? error,
      void Function(SignInProvider)? onProviderSignIn,
      Future<void> Function(String, String)? onEmailLogin,
      Future<void> Function({
        required String email,
        required String password,
        required String firstName,
        required String lastName,
      })? onEmailRegister,
    }) {
      return SingleChildScrollView(
        child: SetupSignInPanel(
          launchingProvider: launchingProvider,
          waitingProvider: waitingProvider,
          emailBusy: emailBusy,
          error: error,
          onProviderSignIn: onProviderSignIn ?? (_) {},
          onEmailLogin: onEmailLogin ?? (_, __) async {},
          onEmailRegister: onEmailRegister ??
              ({
                required email,
                required password,
                required firstName,
                required lastName,
              }) async {},
        ),
      );
    }

    testWidgets('uses the light canvas and navy primary CTA', (tester) async {
      await tester.pumpWidget(_app(panel()));

      final context = tester.element(find.byType(SetupSignInPanel));
      final theme = Theme.of(context);
      expect(theme.scaffoldBackgroundColor, ExoLightColors.bgPrimary);
      expect(theme.colorScheme.primary, ExoLightColors.buttonPrimary);

      expect(
        theme.filledButtonTheme.style?.backgroundColor?.resolve({}),
        ExoLightColors.buttonPrimary,
      );
    });

    testWidgets('shows email sign-in and toggles create-account with name fields',
        (tester) async {
      var googleTaps = 0;
      await tester.pumpWidget(
        _app(panel(
          onProviderSignIn: (p) {
            if (p == SignInProvider.google) googleTaps++;
          },
        )),
      );

      expect(find.text(SyncUserMessages.setupTitle), findsOneWidget);
      expect(find.text(SyncUserMessages.signIn), findsNWidgets(2)); // tab + CTA
      expect(
        find.widgetWithText(FilledButton, SyncUserMessages.signIn),
        findsOneWidget,
      );
      expect(find.text(SyncUserMessages.signInWithGoogle), findsOneWidget);
      expect(find.text(SyncUserMessages.signInWithApple), findsOneWidget);
      expect(find.text(SyncUserMessages.firstNameLabel), findsNothing);

      await tester.tap(find.text(SyncUserMessages.createAccountTab));
      await tester.pump();
      expect(find.text(SyncUserMessages.setupTitleCreate), findsOneWidget);
      expect(
        find.widgetWithText(FilledButton, SyncUserMessages.createAccount),
        findsOneWidget,
      );
      // Cloud registration requires names — fields must exist in create mode.
      expect(find.text(SyncUserMessages.firstNameLabel), findsOneWidget);
      expect(find.text(SyncUserMessages.lastNameLabel), findsOneWidget);
      expect(find.text(SyncUserMessages.passwordMinHint), findsOneWidget);

      await tester.ensureVisible(find.text(SyncUserMessages.signInWithGoogle));
      await tester.tap(find.text(SyncUserMessages.signInWithGoogle));
      expect(googleTaps, 1);
    });

    testWidgets('empty submit shows inline validation instead of a dead tap',
        (tester) async {
      var logins = 0;
      await tester.pumpWidget(
        _app(panel(onEmailLogin: (_, __) async => logins++)),
      );

      await tester.tap(
        find.widgetWithText(FilledButton, SyncUserMessages.signIn),
      );
      await tester.pump();

      expect(find.text(SyncUserMessages.emailRequired), findsOneWidget);
      expect(find.text(SyncUserMessages.passwordRequired), findsOneWidget);
      expect(logins, 0);
    });

    testWidgets('waiting banner retries the provider that was launched',
        (tester) async {
      final retried = <SignInProvider>[];
      await tester.pumpWidget(
        _app(panel(
          waitingProvider: SignInProvider.apple,
          error: SyncUserMessages.cloudUnreachable,
          onProviderSignIn: retried.add,
        )),
      );

      expect(find.text(SyncUserMessages.waitingForBrowser), findsOneWidget);
      expect(find.text(SyncUserMessages.cloudUnreachable), findsOneWidget);
      expect(find.text(SyncUserMessages.emailLabel), findsNothing);
      expect(find.text(SyncUserMessages.signInWithGoogle), findsNothing);
      await tester.tap(find.text(SyncUserMessages.openSignInAgain));
      expect(retried, [SignInProvider.apple]);
    });

    testWidgets('sign-in step omits pairing hint until link step', (tester) async {
      await tester.pumpWidget(_app(panel()));
      expect(find.text(SyncUserMessages.setupPairingHint), findsNothing);
      expect(find.text(SyncUserMessages.setupSubtitle), findsOneWidget);
    });

    testWidgets('Apple is listed before Google on iOS (guideline 4.8)',
        (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      try {
        await tester.pumpWidget(_app(panel()));
        final appleY =
            tester.getTopLeft(find.text(SyncUserMessages.signInWithApple)).dy;
        final googleY =
            tester.getTopLeft(find.text(SyncUserMessages.signInWithGoogle)).dy;
        expect(appleY, lessThan(googleY));
      } finally {
        debugDefaultTargetPlatformOverride = null;
      }
    });

    testWidgets('register submit passes names through', (tester) async {
      String? gotFirst;
      String? gotLast;
      await tester.pumpWidget(
        _app(panel(
          onEmailRegister: ({
            required email,
            required password,
            required firstName,
            required lastName,
          }) async {
            gotFirst = firstName;
            gotLast = lastName;
          },
        )),
      );

      await tester.tap(find.text(SyncUserMessages.createAccountTab));
      await tester.pump();
      await tester.enterText(
          find.widgetWithText(TextFormField, SyncUserMessages.firstNameLabel), 'Ada');
      await tester.enterText(
          find.widgetWithText(TextFormField, SyncUserMessages.lastNameLabel), 'Lovelace');
      await tester.enterText(
          find.widgetWithText(TextFormField, SyncUserMessages.emailLabel),
          'ada@example.com');
      await tester.enterText(
          find.widgetWithText(TextFormField, SyncUserMessages.passwordLabel),
          'longenough');
      await tester.tap(
        find.widgetWithText(FilledButton, SyncUserMessages.createAccount),
      );
      await tester.pump();

      expect(gotFirst, 'Ada');
      expect(gotLast, 'Lovelace');
    });
  });

  group('SetupLinkPanel', () {
    testWidgets('sign out escape is always visible, not only on mismatch errors',
        (tester) async {
      var signOuts = 0;
      await tester.pumpWidget(
        _app(
          SingleChildScrollView(
            child: SetupLinkPanel(
              busy: false,
              onConnect: (_) async {},
              onScan: () {},
              onSignOut: () async => signOuts++,
            ),
          ),
        ),
      );

      final signOut = find.text(SyncUserMessages.signOutSwitchAccount);
      expect(signOut, findsOneWidget);
      await tester.ensureVisible(signOut);
      await tester.tap(signOut);
      expect(signOuts, 1);
    });
  });

  group('ExoStatusBanner CTA', () {
    testWidgets('invokes onAction when CTA is tapped', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        _app(
          ExoStatusBanner(
            kind: ExoStatusKind.networkError,
            message: SyncUserMessages.networkFailed,
            actionLabel: SyncUserMessages.tryAgain,
            onAction: () => taps++,
          ),
        ),
      );

      expect(find.text(SyncUserMessages.networkFailed), findsOneWidget);
      await tester.tap(find.text(SyncUserMessages.tryAgain));
      expect(taps, 1);
    });
  });

  group('AdaptiveShell', () {
    testWidgets('phone shell shows Inbox Tasks and Settings destinations', (tester) async {
      final config = await _hydratedConfig(tester);
      await tester.pumpWidget(
        MaterialApp(
          theme: productTheme(),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(390, 844)),
            child: AdaptiveShell(config: config),
          ),
        ),
      );
      await _settleStore(tester);

      expect(AdaptiveShell.tabLabels, ['Inbox', 'Tasks', 'Settings']);
      expect(find.text('Inbox'), findsWidgets);
      expect(find.text('Tasks'), findsWidgets);
      expect(find.text(SyncUserMessages.settingsTitle), findsWidgets);
      expect(find.text('Memory'), findsNothing);
      expect(find.text('App'), findsNothing);
      expect(find.text('Today'), findsNothing);
      expect(find.text('Capture'), findsNothing);
      expect(find.text(SyncUserMessages.inboxTitle), findsWidgets);
    });

    testWidgets('Open Link on unpaired Inbox opens Settings Link', (tester) async {
      final config = await _hydratedConfig(tester);
      await tester.pumpWidget(
        MaterialApp(
          theme: productTheme(),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(390, 844)),
            child: AdaptiveShell(config: config),
          ),
        ),
      );
      await _settleStore(tester);

      await tester.tap(find.text(SyncUserMessages.openLink).first);
      await _settleStore(tester);

      expect(find.text(SyncUserMessages.scanDesktopCode), findsOneWidget);
      expect(find.text('Link'), findsWidgets);
      expect(find.text('Account'), findsWidgets);
      expect(find.text(SyncUserMessages.settingsTitle), findsWidgets);
    });

    testWidgets('Tasks tab shows unpaired empty without AI suggestions', (tester) async {
      final config = await _hydratedConfig(tester);
      await tester.pumpWidget(
        MaterialApp(
          theme: productTheme(),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(390, 844)),
            child: AdaptiveShell(config: config, initialTab: ShellTab.tasks),
          ),
        ),
      );
      await _settleStore(tester);

      expect(find.text(SyncUserMessages.tasksTitle), findsWidgets);
      expect(find.text(SyncUserMessages.syncEmptyUnpairedTitle), findsOneWidget);
      expect(find.text('Suggested by EXO'), findsNothing);
    });

    testWidgets('tapping Tasks destination switches body', (tester) async {
      final config = await _hydratedConfig(tester);
      await tester.pumpWidget(
        MaterialApp(
          theme: productTheme(),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(390, 844)),
            child: AdaptiveShell(config: config),
          ),
        ),
      );
      await _settleStore(tester);

      expect(find.text(SyncUserMessages.inboxTitle), findsWidgets);
      expect(find.text(SyncUserMessages.syncEmptyUnpairedTitle), findsOneWidget);

      await tester.tap(find.text('Tasks').last);
      await _settleStore(tester);

      expect(find.text(SyncUserMessages.tasksTitle), findsWidgets);
      expect(find.text('Suggested by EXO'), findsNothing);
    });

    testWidgets('Inbox tab badges ready mail count', (tester) async {
      final storage = MemoryKeyValueStore();
      await storage.write('access_token', 'tok');
      await storage.write('sync_paired', '1');
      final store = LocalBrainStore(
        databasePath: '${Directory.systemTemp.path}/shell_badge_${++_dbSerial}.db',
      );
      await tester.runAsync(() async {
        await store.upsertRecord(
          collection: 'pending_actions',
          recordId: 'mail_reply:1',
          payloadJson: jsonEncode({
            'type': 'mail_reply',
            'status': 'ready',
            'subject': 'Re: Lunch',
          }),
          updatedAt: '2026-09-07T00:00:00Z',
        );
      });
      final config = MobileSyncConfig(storage: storage, localStore: store);
      await tester.runAsync(config.hydrate);
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          theme: productTheme(),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(390, 844)),
            child: AdaptiveShell(config: config, initialTab: ShellTab.inbox),
          ),
        ),
      );
      await _waitForInboxCard(tester);
      expect(find.text('READY TO SEND'), findsOneWidget);
      expect(find.byType(Badge), findsWidgets);
      expect(find.text('1'), findsWidgets);
    });

    testWidgets('lands on Inbox when a ready draft is waiting', (tester) async {
      final storage = MemoryKeyValueStore();
      await storage.write('access_token', 'tok');
      await storage.write('sync_paired', '1');
      final store = LocalBrainStore(
        databasePath: '${Directory.systemTemp.path}/shell_land_${++_dbSerial}.db',
      );
      await tester.runAsync(() async {
        await store.upsertRecord(
          collection: 'pending_actions',
          recordId: 'mail_reply:1',
          payloadJson: jsonEncode({
            'type': 'mail_reply',
            'status': 'ready',
            'subject': 'Re: Lunch',
          }),
          updatedAt: '2026-09-07T00:00:00Z',
        );
      });
      final config = MobileSyncConfig(storage: storage, localStore: store);
      await tester.runAsync(config.hydrate);
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          theme: productTheme(),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(390, 844)),
            child: AdaptiveShell(config: config),
          ),
        ),
      );
      await _waitForInboxCard(tester);
      expect(find.text('READY TO SEND'), findsOneWidget);
    });
  });

  group('Empty Tasks', () {
    testWidgets('TasksScreen empty state', (tester) async {
      final config = await _hydratedConfig(tester);
      await tester.pumpWidget(_app(TasksScreen(config: config)));
      await _settleStore(tester);
      expect(find.text(SyncUserMessages.syncEmptyUnpairedTitle), findsOneWidget);
      expect(find.text('Suggested by EXO'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });
}
