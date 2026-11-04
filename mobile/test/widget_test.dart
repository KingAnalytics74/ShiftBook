// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/screens.dart';

void main() {
  testWidgets('Shiftbuck app loads the setup screen without credentials', (
    tester,
  ) async {
    await tester.pumpWidget(const ShiftbuckApp(cloudEnabled: false));

    expect(
      find.text('Connect Shiftbuck to its website database'),
      findsOneWidget,
    );
  });

  testWidgets('sign-in presents email and Google options without phone auth', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: SignInScreen()));

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Shiftbuck'), findsWidgets);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Email address'), findsOneWidget);
    expect(find.text('Phone number'), findsNothing);
    expect(find.text('Phone code'), findsNothing);
  });

  testWidgets('invalid email shows a visible error near the sign-in form', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: SignInScreen()));

    await tester.tap(find.text('Continue with email'));
    await tester.pump();

    expect(find.text('Enter a valid email address.'), findsOneWidget);
  });

  testWidgets('registration screen has its own heading and password field', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: SignInScreen()));

    final createAccountLink = find.text('New to ShiftBook? Create an account');
    await tester.ensureVisible(createAccountLink);
    await tester.tap(createAccountLink);
    await tester.pump();

    expect(find.text('Create your account'), findsOneWidget);
    expect(find.text('Create password'), findsOneWidget);
    expect(find.text('Create account with email'), findsOneWidget);
  });
}
