import 'dart:math' as math;
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'models.dart';
import 'repository.dart';

const Color brandRed = Color(0xFFC8102E);
const Color brandNavy = Color(0xFF14213D);
const Color brandGold = Color(0xFFFFD23F);
const Color pageBg = Color(0xFFEEF2F8);
const Color lineColor = Color(0xFFE1E6EF);
const String mobileAuthRedirect = 'com.example.mobile://login-callback';
final GlobalKey<ScaffoldMessengerState> _authMessengerKey =
    GlobalKey<ScaffoldMessengerState>();

class ShiftbuckApp extends StatelessWidget {
  const ShiftbuckApp({super.key, required this.cloudEnabled});

  final bool cloudEnabled;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Shiftbuck Mobile',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _authMessengerKey,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: pageBg,
        colorScheme: ColorScheme.fromSeed(seedColor: brandRed),
        fontFamily: 'Figtree',
        appBarTheme: const AppBarTheme(
          backgroundColor: brandRed,
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: false,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: lineColor),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: lineColor),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: brandRed, width: 1.5),
          ),
        ),
      ),
      home: cloudEnabled ? const AuthGate() : const SetupRequiredScreen(),
    );
  }
}

class SetupRequiredScreen extends StatelessWidget {
  const SetupRequiredScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const BrandTitle()),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off_outlined, size: 60, color: brandRed),
                const SizedBox(height: 16),
                const Text(
                  'Connect Shiftbuck to its website database',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: brandNavy,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Check the SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY build settings. By default, this app connects to the same Supabase project as the ShiftBook website.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.black87),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class BrandTitle extends StatelessWidget {
  const BrandTitle({super.key});

  @override
  Widget build(BuildContext context) {
    return const Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: 'Shift',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          TextSpan(
            text: 'buck',
            style: TextStyle(color: brandGold, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  String? notifiedUserId;

  void _showSignInSuccess() {
    final messenger = _authMessengerKey.currentState;
    if (messenger == null) return;
    messenger.hideCurrentMaterialBanner();
    messenger.showMaterialBanner(
      MaterialBanner(
        leading: const Icon(
          Icons.check_circle_outline,
          color: Color(0xFF176B36),
        ),
        content: const Text(
          'Signed in successfully.',
          style: TextStyle(color: Color(0xFF176B36)),
        ),
        backgroundColor: const Color(0xFFDDF3E6),
        actions: [
          TextButton(
            onPressed: messenger.hideCurrentMaterialBanner,
            child: const Text('Dismiss'),
          ),
        ],
      ),
    );
    Future<void>.delayed(const Duration(seconds: 4), () {
      if (mounted && messenger.mounted) messenger.hideCurrentMaterialBanner();
    });
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AuthState>(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final event = snapshot.data?.event;
        final user = Supabase.instance.client.auth.currentUser;
        if (event == AuthChangeEvent.signedOut) notifiedUserId = null;
        if (event == AuthChangeEvent.signedIn &&
            user != null &&
            notifiedUserId != user.id) {
          notifiedUserId = user.id;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _showSignInSuccess();
          });
        }
        if (snapshot.data?.event == AuthChangeEvent.passwordRecovery) {
          return const PasswordRecoveryScreen();
        }
        if (user == null) {
          return const SignInScreen();
        }
        return const ShiftbuckHome();
      },
    );
  }
}

class PasswordRecoveryScreen extends StatefulWidget {
  const PasswordRecoveryScreen({super.key});

  @override
  State<PasswordRecoveryScreen> createState() => _PasswordRecoveryScreenState();
}

class _PasswordRecoveryScreenState extends State<PasswordRecoveryScreen> {
  final passwordController = TextEditingController();
  final confirmController = TextEditingController();
  bool busy = false;
  String message = '';
  bool error = false;

  Future<void> savePassword() async {
    if (passwordController.text.length < 8) {
      setState(() {
        message = 'Use a password with at least 8 characters.';
        error = true;
      });
      return;
    }
    if (passwordController.text != confirmController.text) {
      setState(() {
        message = 'The passwords do not match.';
        error = true;
      });
      return;
    }
    setState(() {
      busy = true;
      message = '';
    });
    try {
      await Supabase.instance.client.auth.updateUser(
        UserAttributes(password: passwordController.text),
      );
    } on AuthException catch (exception) {
      if (mounted) {
        setState(() {
          message = exception.message.toLowerCase().contains('weak')
              ? 'Choose a stronger password with at least 8 characters.'
              : 'This reset link is invalid or expired. Request a new password-reset email.';
          error = true;
        });
      }
    } catch (exception) {
      if (mounted) {
        setState(() {
          message = 'We could not save your password. Check your connection and try again.';
          error = true;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    passwordController.dispose();
    confirmController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const BrandTitle()),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Choose a new password',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                      color: brandNavy,
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (message.isNotEmpty)
                    _AuthNotice(message: message, success: !error),
                  const SizedBox(height: 12),
                  TextField(
                    controller: passwordController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'New password',
                      helperText: 'Use at least 8 characters.',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: confirmController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Confirm new password',
                    ),
                    onSubmitted: (_) => busy ? null : savePassword(),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: busy ? null : savePassword,
                    style: FilledButton.styleFrom(
                      backgroundColor: brandRed,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    child: busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Save new password'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key, required this.home});

  final _ShiftbuckHomeState home;

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final nameController = TextEditingController();
  final roleController = TextEditingController(text: 'Support Worker');
  final hourlyController = TextEditingController(text: '13');
  final sleepController = TextEditingController(text: '40');
  final periodController = TextEditingController(text: '26');
  final usersController = TextEditingController();
  final areaController = TextEditingController();
  final employerController = TextEditingController();
  final nicknameController = TextEditingController();
  final sexOtherController = TextEditingController();
  String workType = 'care';
  String ageGroup = '';
  String? sex;
  final Set<String> selectedShiftTypeNames = <String>{};
  String? firstShiftType;
  DateTime firstShiftDate = DateTime.now();
  bool saving = false;

  List<ShiftType> get availableTypes =>
      availableShiftTypes(ProfileSettings(workType: workType));

  @override
  void initState() {
    super.initState();
    final initialTypes = workType == 'care'
        ? const ['Long day', 'Sleep-in', 'Day + sleep-in']
        : const ['Early', 'Late', 'Night'];
    selectedShiftTypeNames.addAll(initialTypes);
    firstShiftType = initialTypes.first;
  }

  @override
  void dispose() {
    nameController.dispose();
    roleController.dispose();
    hourlyController.dispose();
    sleepController.dispose();
    periodController.dispose();
    usersController.dispose();
    areaController.dispose();
    employerController.dispose();
    nicknameController.dispose();
    sexOtherController.dispose();
    super.dispose();
  }

  String get suggestedNickname {
    final region = areaController.text
        .replaceAll(RegExp(r'[^A-Za-z]'), '')
        .substring(
          0,
          math.min(
            6,
            areaController.text.replaceAll(RegExp(r'[^A-Za-z]'), '').length,
          ),
        );
    final prefix = region.isEmpty ? 'Carer' : 'Shift_$region';
    return '${prefix}_${DateTime.now().millisecond % 90 + 10}';
  }

  Future<void> chooseFirstShiftDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: firstShiftDate,
      firstDate: DateTime(2010),
      lastDate: DateTime(2100),
    );
    if (date != null) setState(() => firstShiftDate = date);
  }

  Future<void> finishSetup() async {
    final hourly = double.tryParse(hourlyController.text);
    final sleep = double.tryParse(sleepController.text);
    final startDay = int.tryParse(periodController.text);
    if (hourly == null ||
        hourly < 0 ||
        sleep == null ||
        sleep < 0 ||
        startDay == null ||
        startDay < 1 ||
        startDay > 31) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Enter valid pay rates and a period start day from 1 to 31.',
          ),
        ),
      );
      return;
    }
    final nickname = nicknameController.text.trim();
    if (ageGroup.isEmpty || ageGroup == 'under18') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Shiftbuck is for workers aged 18 or over. Select an age group to continue.',
          ),
        ),
      );
      return;
    }
    if (areaController.text.trim().isEmpty ||
        !RegExp(r'^[A-Za-z0-9_]{3,20}$').hasMatch(nickname) ||
        (nameController.text.trim().length > 2 &&
            nickname.toLowerCase().contains(
              nameController.text.trim().toLowerCase(),
            ))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Enter your town or county and a 3–20 character nickname that does not contain your real name.',
          ),
        ),
      );
      return;
    }
    final selectedTypes = availableTypes
        .where((type) => selectedShiftTypeNames.contains(type.name))
        .toList();
    if (selectedTypes.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one shift type.')),
      );
      return;
    }
    setState(() => saving = true);
    try {
      final settings = ProfileSettings(
        name: nameController.text.trim(),
        role: roleController.text.trim().isEmpty
            ? (workType == 'care' ? 'Support Worker' : 'Shift worker')
            : roleController.text.trim(),
        hourlyRate: hourly,
        sleepInRate: sleep,
        periodStartDay: startDay,
        serviceUsers: usersController.text
            .split(',')
            .map((value) => value.trim())
            .where((value) => value.isNotEmpty)
            .toSet()
            .toList(),
        workType: workType,
        shiftTypes: selectedTypes,
      );
      final privateProfile = UserProfile(
        ageGroup: ageGroup,
        sex: sex,
        sexOther: sex == 'other' ? sexOtherController.text.trim() : null,
        area: areaController.text.trim(),
        employer: employerController.text.trim().isEmpty
            ? null
            : employerController.text.trim(),
        nickname: nickname,
        createdAt: DateTime.now().toUtc().toIso8601String(),
      );
      await widget.home.completeSetup(settings, privateProfile);
      if (firstShiftType != null && widget.home.hasCompletedSetup) {
        final chosen = availableTypes.firstWhere(
          (type) => type.name == firstShiftType,
        );
        final hours = chosen.paid == 'sleep'
            ? null
            : chosen.hours ?? _spanHours(chosen.start, chosen.end);
        await widget.home.saveShift(
          ShiftRecord(
            date: firstShiftDate,
            type: chosen.name,
            start: chosen.start,
            end: chosen.end,
            users: const <String>[],
            sleepIn: chosen.paid != 'hours',
            dayHours: hours,
            breakHrs: hours == null ? null : chosen.breakHrs,
            rate: chosen.rate,
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Setup could not be saved: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const BrandTitle()),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Set up your Shiftbuck',
            style: TextStyle(
              color: brandNavy,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'These details personalise your dashboard and pay calculations. You can change them later in Settings.',
          ),
          const SizedBox(height: 16),
          _SectionCard(
            title: 'Personal and private profile details',
            child: Column(
              children: [
                TextField(
                  controller: nameController,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Your name'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: ageGroup.isEmpty ? null : ageGroup,
                  decoration: const InputDecoration(
                    labelText: 'Age group (18 or over)',
                  ),
                  items: const [
                    DropdownMenuItem(value: '18-24', child: Text('18–24')),
                    DropdownMenuItem(value: '25-34', child: Text('25–34')),
                    DropdownMenuItem(value: '35-44', child: Text('35–44')),
                    DropdownMenuItem(value: '45-54', child: Text('45–54')),
                    DropdownMenuItem(value: '55-64', child: Text('55–64')),
                    DropdownMenuItem(value: '65+', child: Text('65 or over')),
                    DropdownMenuItem(
                      value: 'na',
                      child: Text('Prefer not to say (18 or over)'),
                    ),
                  ],
                  onChanged: (value) => setState(() => ageGroup = value ?? ''),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: sex,
                  decoration: const InputDecoration(
                    labelText: 'Sex (optional)',
                  ),
                  items: const [
                    DropdownMenuItem(value: 'female', child: Text('Female')),
                    DropdownMenuItem(value: 'male', child: Text('Male')),
                    DropdownMenuItem(
                      value: 'other',
                      child: Text('I’d rather describe it'),
                    ),
                  ],
                  onChanged: (value) => setState(() => sex = value),
                ),
                if (sex == 'other') ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: sexOtherController,
                    maxLength: 40,
                    decoration: const InputDecoration(
                      labelText: 'Describe in your own words (optional)',
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: areaController,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Town or county',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: employerController,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Employer (optional and private)',
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: nicknameController,
                        maxLength: 20,
                        decoration: const InputDecoration(
                          labelText: 'Community nickname',
                          helperText: 'Do not use your real name.',
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Suggest nickname',
                      onPressed: () => setState(
                        () => nicknameController.text = suggestedNickname,
                      ),
                      icon: const Icon(Icons.auto_awesome),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Pay and work setup',
            child: Column(
              children: [
                TextField(
                  controller: roleController,
                  decoration: const InputDecoration(labelText: 'Role'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: hourlyController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Hourly rate (£)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: sleepController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Sleep-in rate (£)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: periodController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Pay period starts on day (1–31)',
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: workType,
                  decoration: const InputDecoration(labelText: 'Work type'),
                  items: const [
                    DropdownMenuItem(value: 'care', child: Text('Care work')),
                    DropdownMenuItem(
                      value: 'other',
                      child: Text('Other shift work'),
                    ),
                  ],
                  onChanged: (value) => setState(() {
                    workType = value ?? 'care';
                    final initialTypes = workType == 'care'
                        ? const ['Long day', 'Sleep-in', 'Day + sleep-in']
                        : const ['Early', 'Late', 'Night'];
                    selectedShiftTypeNames
                      ..clear()
                      ..addAll(initialTypes);
                    firstShiftType = initialTypes.first;
                  }),
                ),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Select the shift types you work',
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ),
                Wrap(
                  spacing: 8,
                  children: availableTypes
                      .map(
                        (type) => FilterChip(
                          label: Text(type.name),
                          selected: selectedShiftTypeNames.contains(type.name),
                          onSelected: (selected) => setState(() {
                            if (selected) {
                              selectedShiftTypeNames.add(type.name);
                              firstShiftType ??= type.name;
                            } else {
                              selectedShiftTypeNames.remove(type.name);
                              if (firstShiftType == type.name) {
                                firstShiftType = selectedShiftTypeNames.isEmpty
                                    ? null
                                    : selectedShiftTypeNames.first;
                              }
                            }
                          }),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: usersController,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Service users',
                    helperText: 'Optional; separate names with commas.',
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: firstShiftType,
                  decoration: const InputDecoration(
                    labelText: 'Add a first shift now (optional)',
                    helperText: 'Choose “Not now” to skip.',
                  ),
                  items: [
                    const DropdownMenuItem(
                      value: 'none',
                      child: Text('Not now'),
                    ),
                    ...availableTypes
                        .where(
                          (type) => selectedShiftTypeNames.contains(type.name),
                        )
                        .map(
                          (type) => DropdownMenuItem(
                            value: type.name,
                            child: Text(type.name),
                          ),
                        ),
                  ],
                  onChanged: (value) => setState(
                    () => firstShiftType = value == 'none' ? null : value,
                  ),
                ),
                if (firstShiftType != null) ...[
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: chooseFirstShiftDate,
                    icon: const Icon(Icons.calendar_today),
                    label: Text(
                      DateFormat('EEE, d MMM yyyy').format(firstShiftDate),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: saving ? null : finishSetup,
            icon: const Icon(Icons.check_rounded),
            label: Text(saving ? 'Saving setup…' : 'Finish setup'),
            style: FilledButton.styleFrom(backgroundColor: brandRed),
          ),
        ],
      ),
    ),
  );
}

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  final otpController = TextEditingController();
  final emailFocus = FocusNode();
  final passwordFocus = FocusNode();
  final otpFocus = FocusNode();
  bool createAccount = false;
  bool busy = false;
  bool otpSent = false;
  bool signupVerification = false;
  bool useEmailCode = false;
  bool messageIsSuccess = false;
  int resendSeconds = 0;
  Timer? resendTimer;
  String message = '';

  Future<void> submit() async {
    final email = emailController.text.trim();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(email)) {
      _showMessage('Enter a valid email address.');
      emailFocus.requestFocus();
      return;
    }

    final password = passwordController.text;
    if (!otpSent && !useEmailCode && password.isEmpty) {
      _showMessage('Enter your password.');
      passwordFocus.requestFocus();
      return;
    }
    if (!otpSent && createAccount && password.length < 8) {
      _showMessage('Use a password with at least 8 characters.');
      passwordFocus.requestFocus();
      return;
    }
    if (otpSent && !RegExp(r'^\d{4,10}$').hasMatch(otpController.text.trim())) {
      _showMessage('Enter the verification code from your latest email.');
      otpFocus.requestFocus();
      return;
    }

    setState(() {
      busy = true;
      message = '';
      messageIsSuccess = false;
    });

    try {
      final auth = Supabase.instance.client.auth;
      if (otpSent) {
        await auth.verifyOTP(
          type: signupVerification ? OtpType.signup : OtpType.email,
          email: email,
          token: otpController.text.trim(),
          redirectTo: kIsWeb ? null : mobileAuthRedirect,
        );
        _showMessage('Email verified. You are signed in.', success: true);
      } else if (useEmailCode) {
        await auth.signInWithOtp(
          email: email,
          shouldCreateUser: false,
          emailRedirectTo: kIsWeb ? null : mobileAuthRedirect,
        );
        setState(() {
          otpSent = true;
          signupVerification = false;
          message = 'Supabase accepted the sign-in request. Check your email for a code or sign-in link; delivery depends on the project email settings.';
          messageIsSuccess = true;
        });
        _startResendCooldown();
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) otpFocus.requestFocus();
        });
      } else if (createAccount) {
        final response = await auth.signUp(
          email: email,
          password: password,
          emailRedirectTo: kIsWeb ? null : mobileAuthRedirect,
        );
        if (response.user?.identities?.isEmpty ?? false) {
          _showMessage(
            'An account already uses this email. Sign in or reset your password.',
          );
          return;
        }
        if (response.session == null) {
          setState(() {
            otpSent = true;
            signupVerification = true;
            message = 'Supabase accepted the account request. Check your email for a verification code or confirmation link; delivery depends on the project email settings.';
            messageIsSuccess = true;
          });
          _startResendCooldown();
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) otpFocus.requestFocus();
          });
        } else {
          _showMessage(
            'Your account is ready. You are signed in.',
            success: true,
          );
        }
      } else {
        await auth.signInWithPassword(email: email, password: password);
        _showMessage('You are signed in.', success: true);
      }
    } on AuthException catch (error) {
      _showMessage(_friendlyAuthError(error.message));
    } catch (error) {
      _showMessage(_friendlyAuthError(error.toString()));
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  String _friendlyAuthError(String raw) {
    final error = raw.toLowerCase();
    if (error.contains('invalid login credentials') ||
        error.contains('invalid email or password')) {
      return 'The email or password is incorrect. Check your details or reset your password.';
    }
    if (error.contains('already registered') ||
        error.contains('already exists') ||
        error.contains('user already')) {
      return 'An account already uses this email. Sign in instead or reset your password.';
    }
    if (error.contains('user not found') ||
        error.contains('email not found') ||
        error.contains('signups not allowed')) {
      return 'We could not find an account for this email. Create an account or check the address.';
    }
    if (error.contains('invalid') &&
        (error.contains('otp') ||
            error.contains('token') ||
            error.contains('code'))) {
      return 'That verification code is incorrect or expired. Check the latest email or request a new one.';
    }
    if (error.contains('expired') &&
        (error.contains('otp') || error.contains('token'))) {
      return 'That verification code has expired. Request a new email and use its code or link.';
    }
    if (error.contains('provider') &&
        (error.contains('disabled') || error.contains('not enabled'))) {
      return 'Google sign-in is not enabled for this Supabase project yet. Ask the project administrator to configure Google OAuth.';
    }
    if (error.contains('smtp') ||
        error.contains('email provider') ||
        error.contains('email not enabled') ||
        error.contains('email not configured')) {
      return 'Email sending is not configured for this project. Check the Email provider and SMTP settings in Supabase.';
    }
    if (error.contains('rate limit') ||
        error.contains('too many') ||
        error.contains('security purposes')) {
      return 'Too many attempts. Wait a little before trying again.';
    }
    if (error.contains('socket') ||
        error.contains('network') ||
        error.contains('connection') ||
        error.contains('timed out') ||
        error.contains('failed host lookup')) {
      return 'We could not reach the sign-in service. Check your connection and try again.';
    }
    return 'We could not complete that request. Check your details and connection, then try again.';
  }

  void _showMessage(String value, {bool success = false}) {
    if (!mounted) return;
    setState(() {
      message = value;
      messageIsSuccess = success;
    });
  }

  void _startResendCooldown() {
    resendTimer?.cancel();
    setState(() => resendSeconds = 30);
    resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        resendSeconds--;
        if (resendSeconds <= 0) timer.cancel();
      });
    });
  }

  Future<void> resendVerification() async {
    if (busy || resendSeconds > 0) return;
    setState(() {
      busy = true;
      message = '';
    });
    try {
      final auth = Supabase.instance.client.auth;
      if (signupVerification) {
        await auth.resend(
          type: OtpType.signup,
          email: emailController.text.trim(),
          emailRedirectTo: kIsWeb ? null : mobileAuthRedirect,
        );
      } else {
        await auth.signInWithOtp(
          email: emailController.text.trim(),
          shouldCreateUser: false,
          emailRedirectTo: kIsWeb ? null : mobileAuthRedirect,
        );
      }
      _showMessage(
        'Supabase accepted the resend request. Check your email and use the newest code or link; delivery depends on the project email settings.',
        success: true,
      );
      _startResendCooldown();
    } on AuthException catch (error) {
      _showMessage(_friendlyAuthError(error.message));
    } catch (error) {
      _showMessage(_friendlyAuthError(error.toString()));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _continueWithGoogle() async {
    setState(() {
      busy = true;
      message = '';
      messageIsSuccess = false;
    });
    try {
      final launched = await Supabase.instance.client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: kIsWeb ? null : mobileAuthRedirect,
      );
      if (!launched) {
        _showMessage('Google sign-in could not be opened. Try again.');
      }
    } on AuthException catch (error) {
      _showMessage(_friendlyAuthError(error.message));
    } catch (error) {
      _showMessage(_friendlyAuthError(error.toString()));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> sendPasswordReset() async {
    final email = emailController.text.trim();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(email)) {
      _showMessage('Enter your email address first.');
      emailFocus.requestFocus();
      return;
    }
    setState(() {
      busy = true;
      message = '';
    });
    try {
      await Supabase.instance.client.auth.resetPasswordForEmail(
        email,
        redirectTo: kIsWeb ? null : mobileAuthRedirect,
      );
      _showMessage(
        'Supabase accepted the password-reset request. If an account exists for this email, a reset link may be sent; delivery depends on the project email settings.',
        success: true,
      );
    } on AuthException catch (error) {
      _showMessage(_friendlyAuthError(error.message));
    } catch (error) {
      _showMessage(_friendlyAuthError(error.toString()));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _switchAccountMode() {
    resendTimer?.cancel();
    setState(() {
      createAccount = !createAccount;
      otpSent = false;
      signupVerification = false;
      useEmailCode = false;
      otpController.clear();
      passwordController.clear();
      message = '';
      messageIsSuccess = false;
      resendSeconds = 0;
    });
  }

  void _switchToEmailCode() {
    setState(() {
      useEmailCode = true;
      otpSent = false;
      message = '';
      messageIsSuccess = false;
    });
  }

  void _backToPassword() {
    resendTimer?.cancel();
    setState(() {
      otpSent = false;
      signupVerification = false;
      useEmailCode = false;
      otpController.clear();
      message = '';
      messageIsSuccess = false;
      resendSeconds = 0;
    });
  }

  @override
  void dispose() {
    resendTimer?.cancel();
    emailController.dispose();
    passwordController.dispose();
    otpController.dispose();
    emailFocus.dispose();
    passwordFocus.dispose();
    otpFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final verificationInstructions = signupVerification
        ? 'If the email contains a code, enter it here. If it contains a confirmation link, open it to finish creating your account.'
        : 'If the email contains a code, enter it here. If it contains a sign-in link, open it to finish signing in.';

    return Scaffold(
      appBar: AppBar(title: const BrandTitle()),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Column(
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            color: brandRed,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Icon(
                            Icons.schedule_rounded,
                            size: 38,
                            color: brandGold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        const BrandTitle(),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    otpSent
                        ? 'Check your email'
                        : createAccount
                        ? 'Create your account'
                        : 'Welcome back',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      color: brandNavy,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    otpSent
                        ? 'Supabase accepted the request for ${emailController.text.trim()}. Email delivery depends on the project email settings.'
                        : createAccount
                        ? 'Create an account with your email address.'
                        : 'Sign in to pick up where you left off.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.black54),
                  ),
                  if (message.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _AuthNotice(message: message, success: messageIsSuccess),
                  ],
                  if (otpSent) ...[
                    const SizedBox(height: 20),
                    Text(
                      verificationInstructions,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.black87),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: otpController,
                      focusNode: otpFocus,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(10),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Verification code',
                        hintText: 'Enter the code from your email',
                      ),
                      onSubmitted: (_) => busy ? null : submit(),
                    ),
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: busy ? null : submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: brandRed,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: busy
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Verify and continue'),
                    ),
                    TextButton(
                      onPressed: busy || resendSeconds > 0
                          ? null
                          : resendVerification,
                      child: Text(
                        resendSeconds > 0
                            ? 'Resend available in ${resendSeconds}s'
                            : 'Resend verification email',
                      ),
                    ),
                    TextButton(
                      onPressed: busy ? null : _backToPassword,
                      child: const Text('Use a different sign-in option'),
                    ),
                  ] else ...[
                    const SizedBox(height: 20),
                    OutlinedButton.icon(
                      onPressed: busy ? null : _continueWithGoogle,
                      icon: const Text(
                        'G',
                        style: TextStyle(
                          color: Color(0xFF4285F4),
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      label: const Text('Continue with Google'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 15),
                        foregroundColor: brandNavy,
                        side: const BorderSide(color: lineColor),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 18),
                      child: Row(
                        children: [
                          Expanded(child: Divider()),
                          Padding(
                            padding: EdgeInsets.symmetric(horizontal: 12),
                            child: Text('or continue with email'),
                          ),
                          Expanded(child: Divider()),
                        ],
                      ),
                    ),
                    TextField(
                      controller: emailController,
                      focusNode: emailFocus,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(
                        labelText: 'Email address',
                        hintText: 'you@example.com',
                      ),
                      onSubmitted: (_) {
                        if (!useEmailCode) passwordFocus.requestFocus();
                      },
                    ),
                    if (!useEmailCode) ...[
                      const SizedBox(height: 12),
                      TextField(
                        controller: passwordController,
                        focusNode: passwordFocus,
                        obscureText: true,
                        autofillHints: [
                          createAccount
                              ? AutofillHints.newPassword
                              : AutofillHints.password,
                        ],
                        decoration: InputDecoration(
                          labelText: createAccount
                              ? 'Create password'
                              : 'Password',
                          helperText: createAccount
                              ? 'Use at least 8 characters.'
                              : null,
                        ),
                        onSubmitted: (_) => busy ? null : submit(),
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: busy ? null : submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: brandRed,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: busy
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              createAccount
                                  ? 'Create account with email'
                                  : useEmailCode
                                  ? 'Email me a sign-in code'
                                  : 'Continue with email',
                            ),
                    ),
                    if (!createAccount && !useEmailCode)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: busy ? null : sendPasswordReset,
                          child: const Text('Forgot password?'),
                        ),
                      ),
                    if (!createAccount && !useEmailCode)
                      TextButton(
                        onPressed: busy ? null : _switchToEmailCode,
                        child: const Text('Sign in with an email code instead'),
                      ),
                    if (!createAccount && useEmailCode)
                      TextButton(
                        onPressed: busy
                            ? null
                            : () => setState(() {
                                useEmailCode = false;
                                message = '';
                              }),
                        child: const Text('Use my password instead'),
                      ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: busy ? null : _switchAccountMode,
                      child: Text(
                        createAccount
                            ? 'Already have an account? Sign in'
                            : 'New to ShiftBook? Create an account',
                      ),
                    ),
                    if (createAccount)
                      const Text(
                        'By creating an account you agree to the Terms of use and Privacy notice.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.black54, fontSize: 12),
                      ),
                  ],
                  const SizedBox(height: 8),
                  const Text(
                    'Use the same email account as the ShiftBook website to share your shifts and settings.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AuthNotice extends StatelessWidget {
  const _AuthNotice({required this.message, required this.success});

  final String message;
  final bool success;

  @override
  Widget build(BuildContext context) {
    final color = success ? const Color(0xFF176B36) : const Color(0xFFB4122B);
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: success ? const Color(0xFFDDF3E6) : const Color(0xFFFCE0E4),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              success ? Icons.check_circle_outline : Icons.error_outline,
              color: color,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(message, style: TextStyle(color: color)),
            ),
          ],
        ),
      ),
    );
  }
}

class ShiftbuckHome extends StatefulWidget {
  const ShiftbuckHome({super.key});

  @override
  State<ShiftbuckHome> createState() => _ShiftbuckHomeState();
}

class _ShiftbuckHomeState extends State<ShiftbuckHome> {
  final repository = ShiftbuckRepository();
  ProfileSettings profile = ProfileSettings();
  UserProfile userProfile = const UserProfile();
  MoneySettings money = MoneySettings();
  List<ShiftRecord> shifts = <ShiftRecord>[];
  Map<String, Map<String, double>> spending = <String, Map<String, double>>{};
  Map<String, Map<String, dynamic>> payslips = <String, Map<String, dynamic>>{};
  bool loading = true;
  bool hasCompletedSetup = false;
  String? loadError;
  int selectedIndex = 0;
  int periodOffset = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      loadError = null;
    });
    try {
      final p = await repository.loadProfile();
      final privateProfile = await repository.loadUserProfile();
      final m = await repository.loadMoney();
      final s = await repository.loadShifts();
      final sp = await repository.loadSpending();
      final ps = await repository.loadPayslips();
      final hasProfile = await repository.hasProfile();
      if (!mounted) return;
      setState(() {
        profile = ProfileSettings.fromMap(p);
        userProfile = privateProfile;
        money = MoneySettings.fromMap(m);
        shifts = s;
        spending = sp;
        payslips = ps;
        hasCompletedSetup = hasProfile;
        loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        loadError = 'Could not load your Shiftbuck data: $error';
        loading = false;
      });
    }
  }

  Future<void> saveProfile(ProfileSettings next) async {
    await repository.saveProfile(next);
    if (!mounted) return;
    setState(() {
      profile = next;
      hasCompletedSetup = true;
    });
  }

  Future<void> saveUserProfile(UserProfile next) async {
    await repository.saveUserProfile(next);
    if (!mounted) return;
    setState(() => userProfile = next);
  }

  Future<void> saveMoney(MoneySettings next) async {
    await repository.saveMoney(next);
    setState(() => money = next);
  }

  Future<void> saveShift(ShiftRecord shift) async {
    await repository.saveShift(shift);
    setState(() {
      final index = shifts.indexWhere((element) => element.key == shift.key);
      if (index >= 0) {
        shifts[index] = shift;
      } else {
        shifts.add(shift);
      }
      shifts.sort((a, b) => a.date.compareTo(b.date));
    });
  }

  Future<void> deleteShift(String key) async {
    await repository.deleteShift(key);
    setState(() => shifts.removeWhere((element) => element.key == key));
  }

  Future<void> saveSpending(
    String periodKey,
    Map<String, double> values,
  ) async {
    await repository.saveSpending(periodKey, values);
    if (!mounted) return;
    setState(() => spending[periodKey] = values);
  }

  Future<void> savePayslip(String periodKey, Map<String, dynamic> value) async {
    await repository.savePayslip(periodKey, value);
    if (!mounted) return;
    setState(() => payslips[periodKey] = value);
  }

  Future<void> deletePayslip(String periodKey) async {
    await repository.deletePayslip(periodKey);
    if (!mounted) return;
    setState(() => payslips.remove(periodKey));
  }

  double get hourlyRate => profile.hourlyRate;
  double get sleepRate => profile.sleepInRate;

  PayPeriod get currentPeriod =>
      PayPeriod.forDate(DateTime.now(), profile.periodStartDay, periodOffset);

  List<ShiftRecord> get periodShifts {
    final start = currentPeriod.start;
    final end = currentPeriod.end;
    return shifts
        .where(
          (shift) => !shift.date.isBefore(start) && !shift.date.isAfter(end),
        )
        .toList()
      ..sort((a, b) => a.date.compareTo(b.date));
  }

  double get gross => periodShifts.fold<double>(
    0.0,
    (sum, shift) => sum + shift.grossFor(profile),
  );
  double get workedGross => periodShifts
      .where((shift) => !shift.date.isAfter(DateTime.now()))
      .fold<double>(0.0, (sum, shift) => sum + shift.grossFor(profile));
  double get rosteredGross => periodShifts
      .where((shift) => shift.date.isAfter(DateTime.now()))
      .fold<double>(0.0, (sum, shift) => sum + shift.grossFor(profile));
  double get breakHours => periodShifts.fold<double>(
    0.0,
    (sum, shift) => sum + (shift.breakHrs ?? 0.0),
  );
  double get netHours =>
      periodShifts.fold<double>(0.0, (sum, shift) => sum + shift.netHours);
  double get sleepCount =>
      periodShifts.where((s) => s.sleepIn).length.toDouble();

  List<String> get mappedUsers => profile.serviceUsers;

  Future<void> exportCsv() async {
    try {
      await repository.exportCsv(
        period: currentPeriod,
        profile: profile,
        shifts: periodShifts,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('CSV export ready to share or save.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('CSV export failed: $error')));
    }
  }

  Future<void> exportBackup() async {
    try {
      await repository.exportBackup(
        profile: profile,
        userProfile: userProfile,
        money: money,
        shifts: shifts,
        spending: spending,
        payslips: payslips,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Backup ready to share or save.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Backup failed: $error')));
    }
  }

  Future<void> changePeriod(int delta) async {
    setState(() => periodOffset += delta);
  }

  Future<void> completeSetup(
    ProfileSettings settings,
    UserProfile privateProfile,
  ) async {
    await repository.saveProfile(settings);
    await repository.saveUserProfile(privateProfile);
    final starterPots = <MoneyPot>[
      MoneyPot(
        id: 'rent',
        name: 'Rent & bills',
        mode: 'pct',
        value: 35,
        kind: 'need',
      ),
      MoneyPot(
        id: 'food',
        name: 'Food & groceries',
        mode: 'pct',
        value: 12,
        kind: 'need',
      ),
      MoneyPot(
        id: 'transport',
        name: 'Transport',
        mode: 'pct',
        value: 8,
        kind: 'need',
      ),
      MoneyPot(
        id: 'phone',
        name: 'Phone & subscriptions',
        mode: 'pct',
        value: 3,
        kind: 'need',
      ),
      MoneyPot(
        id: 'family',
        name: 'Family & giving',
        mode: 'pct',
        value: 10,
        kind: 'need',
      ),
      MoneyPot(
        id: 'savings',
        name: 'Savings',
        mode: 'pct',
        value: 15,
        kind: 'save',
      ),
      MoneyPot(
        id: 'fun',
        name: 'Personal & fun',
        mode: 'pct',
        value: 10,
        kind: 'want',
      ),
      MoneyPot(
        id: 'buffer',
        name: 'Buffer',
        mode: 'pct',
        value: 7,
        kind: 'want',
      ),
    ];
    final nextMoney = money.pots.isEmpty
        ? money.copyWith(pots: starterPots)
        : money;
    await repository.saveMoney(nextMoney);
    if (!mounted) return;
    setState(() {
      profile = settings;
      userProfile = privateProfile;
      money = nextMoney;
      hasCompletedSetup = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (loadError != null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off_outlined, color: brandRed, size: 48),
                const SizedBox(height: 12),
                Text(loadError!, textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(onPressed: _load, child: const Text('Try again')),
              ],
            ),
          ),
        ),
      );
    }
    if (!hasCompletedSetup) {
      return ProfileSetupScreen(home: this);
    }

    final screens = [
      OverviewPage(home: this),
      CalendarPage(home: this),
      TimesheetPage(home: this),
      MoneyPage(home: this),
      SettingsPage(home: this),
    ];

    return Scaffold(
      body: screens[selectedIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (index) => setState(() => selectedIndex = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_rounded),
            label: 'Overview',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_rounded),
            label: 'Calendar',
          ),
          NavigationDestination(
            icon: Icon(Icons.table_rows_rounded),
            label: 'Timesheet',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_rounded),
            label: 'Money',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_rounded),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

class OverviewPage extends StatelessWidget {
  const OverviewPage({super.key, required this.home});

  final _ShiftbuckHomeState home;

  @override
  Widget build(BuildContext context) {
    final gross = home.gross;
    final takeHome = gross - estimateTaxAndNi(gross, home.money);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 12),
        _HeaderCard(home: home),
        const SizedBox(height: 14),
        _PeriodSelector(home: home),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'This pay period',
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: _StatTile(
                      label: 'Gross pay',
                      value: formatCurrency(gross),
                      accent: brandRed,
                    ),
                  ),
                  Expanded(
                    child: _StatTile(
                      label: 'Take-home',
                      value: formatCurrency(takeHome),
                      accent: Colors.green,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _MetricRow(label: 'Shifts', value: '${home.periodShifts.length}'),
              _MetricRow(label: 'Net hours', value: formatHours(home.netHours)),
              _MetricRow(label: 'Breaks', value: formatHours(home.breakHours)),
              _MetricRow(
                label: 'Sleep-ins',
                value: '${home.sleepCount.toInt()}',
              ),
              _MetricRow(
                label: 'Earned so far',
                value: formatCurrency(home.workedGross),
              ),
              _MetricRow(
                label: 'Still rostered',
                value: formatCurrency(home.rosteredGross),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Recent shifts',
          child: home.periodShifts.isEmpty
              ? const Text('No shifts logged in this pay period yet.')
              : Column(
                  children: home.periodShifts
                      .take(5)
                      .map(
                        (shift) => ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            DateFormat('EEE, d MMM').format(shift.date),
                          ),
                          subtitle: Text(
                            (shift.users.isEmpty
                                ? 'No service users'
                                : shift.users.join(', ')),
                          ),
                          trailing: Text(
                            formatCurrency(shift.grossFor(home.profile)),
                          ),
                        ),
                      )
                      .toList(),
                ),
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Weekly earnings',
          child: Column(
            children: List<Widget>.generate(
              (home.currentPeriod.days / 7).ceil(),
              (index) {
                final start = home.currentPeriod.start.add(
                  Duration(days: index * 7),
                );
                final end = DateTime(start.year, start.month, start.day + 6);
                final weekShifts = home.periodShifts.where(
                  (shift) =>
                      !shift.date.isBefore(start) && !shift.date.isAfter(end),
                );
                final weeklyGross = weekShifts.fold<double>(
                  0,
                  (total, shift) => total + shift.grossFor(home.profile),
                );
                final weeklyHours = weekShifts.fold<double>(
                  0,
                  (total, shift) => total + shift.netHours,
                );
                return _MetricRow(
                  label:
                      '${DateFormat('d MMM').format(start)}–${DateFormat('d MMM').format(end)} · ${formatHours(weeklyHours)}h',
                  value: formatCurrency(weeklyGross),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 14),
        _RestSummaryCard(period: home.currentPeriod, shifts: home.shifts),
        const SizedBox(height: 14),
        _ForecastCard(home: home),
      ],
    );
  }
}

class _PeriodSelector extends StatelessWidget {
  const _PeriodSelector({required this.home});

  final _ShiftbuckHomeState home;

  @override
  Widget build(BuildContext context) => _SectionCard(
    title: 'Pay period',
    child: Row(
      children: [
        IconButton(
          tooltip: 'Previous pay period',
          onPressed: () => home.changePeriod(-1),
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: Text(
            home.currentPeriod.label,
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        IconButton(
          tooltip: 'Next pay period',
          onPressed: () => home.changePeriod(1),
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    ),
  );
}

class _RestSummaryCard extends StatelessWidget {
  const _RestSummaryCard({required this.period, required this.shifts});

  final PayPeriod period;
  final List<ShiftRecord> shifts;

  @override
  Widget build(BuildContext context) {
    final results = <RestCheckResult>[];
    for (var index = 0; index < period.days; index++) {
      results.add(
        restCheckForDate(period.start.add(Duration(days: index)), shifts),
      );
    }
    final red = results.where((result) => result.level == 'red').length;
    final amber = results.where((result) => result.level == 'amber').length;
    final status = red > 0
        ? 'red'
        : amber > 0
        ? 'amber'
        : 'ok';
    final label = status == 'red'
        ? 'Not resting enough'
        : status == 'amber'
        ? 'Watch your rest'
        : 'Well rested';
    final reasons = results
        .where((result) => result.reasons.isNotEmpty)
        .expand((result) => result.reasons)
        .toSet()
        .take(3)
        .toList();
    return _SectionCard(
      title: 'Rest check · $label',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Guide based on shifts logged, days off, weekly hours and rest between timed shifts. This is not legal advice.',
            style: const TextStyle(color: Colors.black54, fontSize: 12),
          ),
          if (reasons.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...reasons.map(
              (reason) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('• $reason'),
              ),
            ),
          ],
          const SizedBox(height: 8),
          _MetricRow(label: 'Days to watch', value: '$amber'),
          _MetricRow(label: 'Red days', value: '$red'),
          _MetricRow(
            label: 'Busiest rolling week',
            value:
                '${formatHours(results.fold<double>(0, (maxHours, r) => math.max(maxHours, r.hours7)))} hours',
          ),
        ],
      ),
    );
  }
}

class _ForecastCard extends StatelessWidget {
  const _ForecastCard({required this.home});

  final _ShiftbuckHomeState home;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final todayOnly = DateTime(today.year, today.month, today.day);
    final historyStart = todayOnly.subtract(const Duration(days: 56));
    final past = home.shifts
        .where(
          (shift) =>
              shift.date.isBefore(todayOnly) &&
              !shift.date.isBefore(historyStart) &&
              (shift.sleepIn || shift.netHours > 0),
        )
        .toList();
    if (past.isEmpty) {
      return const _SectionCard(
        title: 'Next 7 days forecast',
        child: Text('Log a few weeks of shifts to see an earnings forecast.'),
      );
    }
    var expected = 0.0;
    var likely = 0.0;
    for (var dayIndex = 0; dayIndex < 7; dayIndex++) {
      final date = todayOnly.add(Duration(days: dayIndex));
      final actual = home.shifts.where(
        (shift) => shift.key == date.toIso8601String().substring(0, 10),
      );
      if (actual.isNotEmpty) {
        final pay = actual.first.grossFor(home.profile);
        expected += pay;
        likely += pay;
        continue;
      }
      final candidates = past
          .where((shift) => shift.date.weekday == date.weekday)
          .toList();
      final seenDays = <DateTime>[];
      for (
        var day = historyStart;
        day.isBefore(todayOnly);
        day = day.add(const Duration(days: 1))
      ) {
        if (day.weekday == date.weekday) seenDays.add(day);
      }
      final probability = seenDays.isEmpty
          ? 0.0
          : candidates.length / seenDays.length;
      if (candidates.isNotEmpty) {
        candidates.sort((a, b) => a.date.compareTo(b.date));
        final estimate = candidates.last.grossFor(home.profile);
        expected += estimate * probability;
        if (probability >= .5) likely += estimate;
      }
    }
    return _SectionCard(
      title: 'Next 7 days forecast',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            formatCurrency(expected),
            style: const TextStyle(
              color: brandNavy,
              fontSize: 28,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Expected pay weighted by weekday pattern in the last 8 weeks. Existing shifts are counted as rostered.',
            style: TextStyle(color: Colors.black54, fontSize: 12),
          ),
          const SizedBox(height: 8),
          _MetricRow(
            label: 'If likely shifts happen',
            value: formatCurrency(likely),
          ),
          Text(
            'Based on ${past.length} logged shifts.',
            style: const TextStyle(color: Colors.black54, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key, required this.home});

  final _ShiftbuckHomeState home;

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  DateTime month = DateTime.now();

  @override
  Widget build(BuildContext context) {
    final firstDay = DateTime(month.year, month.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final leadingBlank = calendarLeadingDays(firstDay);
    final rows = <Widget>[];

    for (var i = 0; i < 7; i++) {
      rows.add(
        Center(
          child: Text(
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 12,
              color: Colors.black54,
            ),
          ),
        ),
      );
    }

    for (var i = 0; i < leadingBlank; i++) {
      rows.add(Container());
    }

    final shiftMap = <String, ShiftRecord>{
      for (final s in widget.home.shifts) s.key: s,
    };

    for (var day = 1; day <= daysInMonth; day++) {
      final date = DateTime(month.year, month.month, day);
      final key = date.toIso8601String().substring(0, 10);
      final shift = shiftMap[key];
      rows.add(
        InkWell(
          onTap: () async {
            final shiftToEdit =
                shift ??
                ShiftRecord(
                  date: date,
                  dayHours: 12,
                  breakHrs: 2,
                  users: const <String>[],
                );
            await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) =>
                    LogShiftScreen(home: widget.home, existing: shiftToEdit),
              ),
            );
            setState(() {});
          },
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: shift != null ? brandRed.withOpacity(0.08) : Colors.white,
              border: Border.all(color: lineColor),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '$day',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                if (shift != null)
                  Text(
                    shift.sleepIn
                        ? 'Sleep'
                        : '${shift.grossFor(widget.home.profile).toStringAsFixed(0)}',
                    style: const TextStyle(fontSize: 10, color: brandNavy),
                  ),
              ],
            ),
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            IconButton(
              onPressed: () =>
                  setState(() => month = DateTime(month.year, month.month - 1)),
              icon: const Icon(Icons.chevron_left),
            ),
            Expanded(
              child: Center(
                child: Text(
                  DateFormat('MMMM yyyy').format(month),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: brandNavy,
                  ),
                ),
              ),
            ),
            IconButton(
              onPressed: () =>
                  setState(() => month = DateTime(month.year, month.month + 1)),
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          children: rows,
        ),
      ],
    );
  }
}

class TimesheetPage extends StatelessWidget {
  const TimesheetPage({super.key, required this.home});

  final _ShiftbuckHomeState home;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Timesheet',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  color: brandNavy,
                ),
              ),
            ),
            IconButton(
              onPressed: home.exportCsv,
              tooltip: 'Export CSV',
              icon: const Icon(Icons.download_rounded),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _PeriodSelector(home: home),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Current period',
          child: Column(
            children: [
              _MetricRow(label: 'Range', value: home.currentPeriod.label),
              _MetricRow(label: 'Shifts', value: '${home.periodShifts.length}'),
              _MetricRow(label: 'Gross pay', value: formatCurrency(home.gross)),
              _MetricRow(label: 'Net hours', value: formatHours(home.netHours)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          LogShiftScreen(home: home, existing: null),
                    ),
                  );
                },
                icon: const Icon(Icons.add),
                label: const Text('Add shift'),
                style: FilledButton.styleFrom(backgroundColor: brandRed),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (home.periodShifts.isEmpty)
          const _EmptyState(text: 'No shifts logged for this period.')
        else
          ...home.periodShifts.map(
            (shift) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                title: Text(DateFormat('EEE, d MMM').format(shift.date)),
                subtitle: Text(
                  [
                    if (shift.users.isNotEmpty) shift.users.join(', '),
                    if (shift.sleepIn) 'Sleep-in',
                    if (shift.dayHours != null)
                      '${formatHours(shift.dayHours!)}h',
                  ].join(' • '),
                ),
                trailing: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(formatCurrency(shift.grossFor(home.profile))),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          onPressed: () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) =>
                                    LogShiftScreen(home: home, existing: shift),
                              ),
                            );
                          },
                          icon: const Icon(Icons.edit_outlined, size: 18),
                        ),
                        IconButton(
                          onPressed: () async {
                            final confirmed = await showDialog<bool>(
                              context: context,
                              builder: (context) => AlertDialog(
                                title: const Text('Delete this shift?'),
                                content: Text(
                                  'Delete the shift on ${DateFormat('d MMM yyyy').format(shift.date)}?',
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () =>
                                        Navigator.pop(context, false),
                                    child: const Text('Cancel'),
                                  ),
                                  FilledButton(
                                    onPressed: () =>
                                        Navigator.pop(context, true),
                                    child: const Text('Delete'),
                                  ),
                                ],
                              ),
                            );
                            if (confirmed != true) return;
                            try {
                              await home.deleteShift(shift.key);
                            } catch (error) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      'Shift could not be deleted: $error',
                                    ),
                                  ),
                                );
                              }
                              return;
                            }
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Shift deleted')),
                              );
                            }
                          },
                          icon: const Icon(Icons.delete_outline, size: 18),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class MoneyPage extends StatefulWidget {
  const MoneyPage({super.key, required this.home});

  final _ShiftbuckHomeState home;

  @override
  State<MoneyPage> createState() => _MoneyPageState();
}

class _MoneyPageState extends State<MoneyPage> {
  late TextEditingController taxCodeController;
  late TextEditingController pensionController;
  String employment = 'paye';
  String studentLoan = 'none';
  bool savingTax = false;
  final Map<String, String> spendDraft = <String, String>{};

  _ShiftbuckHomeState get home => widget.home;

  @override
  void initState() {
    super.initState();
    taxCodeController = TextEditingController(text: home.money.taxCode);
    pensionController = TextEditingController(
      text: home.money.pensionPct.toString(),
    );
    employment = home.money.employment;
    studentLoan = home.money.studentLoan;
  }

  @override
  void didUpdateWidget(covariant MoneyPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.home.money != widget.home.money) {
      taxCodeController.text = home.money.taxCode;
      pensionController.text = home.money.pensionPct.toString();
      employment = home.money.employment;
      studentLoan = home.money.studentLoan;
    }
  }

  @override
  void dispose() {
    taxCodeController.dispose();
    pensionController.dispose();
    super.dispose();
  }

  Future<void> saveTaxSettings() async {
    final parsedPension = double.tryParse(pensionController.text);
    if (parsedPension == null || parsedPension < 0 || parsedPension > 100) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter a pension percentage from 0 to 100.'),
        ),
      );
      return;
    }
    setState(() => savingTax = true);
    try {
      await home.saveMoney(
        home.money.copyWith(
          employment: employment,
          taxCode: taxCodeController.text.trim().isEmpty
              ? '1257L'
              : taxCodeController.text.trim().toUpperCase(),
          pensionPct: parsedPension,
          studentLoan: studentLoan,
        ),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tax and deduction settings saved.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Tax settings could not be saved: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => savingTax = false);
    }
  }

  Future<void> editPot([MoneyPot? existing]) async {
    final name = TextEditingController(text: existing?.name ?? '');
    final amount = TextEditingController(
      text: existing?.value.toString() ?? '',
    );
    var mode = existing?.mode ?? 'pct';
    var kind = existing?.kind ?? 'need';
    final result = await showDialog<MoneyPot>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(existing == null ? 'Add a savings pot' : 'Edit pot'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: 'Pot name'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amount,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(
                    labelText: mode == 'fixed'
                        ? 'Planned amount (£)'
                        : 'Percent of pay',
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: mode,
                  decoration: const InputDecoration(labelText: 'Plan type'),
                  items: const [
                    DropdownMenuItem(
                      value: 'pct',
                      child: Text('% of take-home'),
                    ),
                    DropdownMenuItem(
                      value: 'fixed',
                      child: Text('Fixed amount'),
                    ),
                  ],
                  onChanged: (value) =>
                      setDialogState(() => mode = value ?? mode),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: kind,
                  decoration: const InputDecoration(labelText: 'Pot category'),
                  items: const [
                    DropdownMenuItem(value: 'need', child: Text('Needs')),
                    DropdownMenuItem(value: 'want', child: Text('Wants')),
                    DropdownMenuItem(value: 'save', child: Text('Savings')),
                  ],
                  onChanged: (value) =>
                      setDialogState(() => kind = value ?? kind),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final value = double.tryParse(amount.text) ?? 0;
                if (name.text.trim().isEmpty || value < 0) return;
                Navigator.pop(
                  context,
                  MoneyPot(
                    id:
                        existing?.id ??
                        DateTime.now().millisecondsSinceEpoch.toString(),
                    name: name.text.trim(),
                    kind: kind,
                    mode: mode,
                    value: value,
                  ),
                );
              },
              child: const Text('Save pot'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    amount.dispose();
    if (result == null) return;
    final pots = [...home.money.pots];
    final index = pots.indexWhere((pot) => pot.id == result.id);
    if (index < 0) {
      pots.add(result);
    } else {
      pots[index] = result;
    }
    await home.saveMoney(home.money.copyWith(pots: pots));
  }

  Future<void> deletePot(MoneyPot pot) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove this pot?'),
        content: Text(
          '“${pot.name}” and its current-period spending entry will be removed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep pot'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final nextPots = home.money.pots
        .where((item) => item.id != pot.id)
        .toList();
    await home.saveMoney(home.money.copyWith(pots: nextPots));
    final current = Map<String, double>.from(
      home.spending[home.currentPeriod.start.toIso8601String().substring(
            0,
            10,
          )] ??
          const <String, double>{},
    )..remove(pot.id);
    await home.saveSpending(
      home.currentPeriod.start.toIso8601String().substring(0, 10),
      current,
    );
  }

  Future<void> saveSpend(
    MoneyPot pot,
    String rawValue,
    String periodKey,
  ) async {
    final value = rawValue.trim().isEmpty ? 0.0 : double.tryParse(rawValue);
    if (value == null || value < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter a valid non-negative spending amount.'),
        ),
      );
      return;
    }
    final key = periodKey;
    final values = Map<String, double>.from(
      home.spending[key] ?? const <String, double>{},
    );
    if (value == 0) {
      values.remove(pot.id);
    } else {
      values[pot.id] = value;
    }
    try {
      await home.saveSpending(key, values);
      if (mounted) setState(() => spendDraft.remove('$key|${pot.id}'));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Spending could not be saved: $error')),
        );
      }
    }
  }

  Future<void> editPayslip() async {
    final key = home.currentPeriod.start.toIso8601String().substring(0, 10);
    final existing = home.payslips[key] ?? const <String, dynamic>{};
    final payDate = TextEditingController(
      text: existing['payDate']?.toString() ?? '',
    );
    final hours = TextEditingController(
      text: existing['hours']?.toString() ?? '',
    );
    final gross = TextEditingController(
      text: existing['gross']?.toString() ?? '',
    );
    final sleep = TextEditingController(
      text: existing['sleepPay']?.toString() ?? '0',
    );
    final tax = TextEditingController(text: existing['tax']?.toString() ?? '');
    final ni = TextEditingController(text: existing['ni']?.toString() ?? '');
    final pension = TextEditingController(
      text: existing['pension']?.toString() ?? '',
    );
    final net = TextEditingController(text: existing['net']?.toString() ?? '');
    final saved = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Payslip figures'),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Column(
              children: [
                TextField(
                  controller: payDate,
                  readOnly: true,
                  decoration: const InputDecoration(
                    labelText: 'Pay date',
                    hintText: 'Select date',
                    suffixIcon: Icon(Icons.calendar_today),
                  ),
                  onTap: () async {
                    final initial =
                        DateTime.tryParse(payDate.text) ?? DateTime.now();
                    final date = await showDatePicker(
                      context: context,
                      initialDate: initial,
                      firstDate: DateTime(2010),
                      lastDate: DateTime(2100),
                    );
                    if (date != null) {
                      payDate.text = date.toIso8601String().substring(0, 10);
                    }
                  },
                ),
                const SizedBox(height: 8),
                _decimalField(hours, 'Hours paid'),
                _decimalField(gross, 'Gross pay (£)'),
                _decimalField(sleep, 'Sleep-in pay (£)'),
                _decimalField(tax, 'Income tax (£)'),
                _decimalField(ni, 'National Insurance (£)'),
                _decimalField(pension, 'Pension (£)'),
                _decimalField(net, 'Net pay (£)'),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final values = <String, String>{
                'hours': hours.text,
                'gross': gross.text,
                'sleepPay': sleep.text,
                'tax': tax.text,
                'ni': ni.text,
                'pension': pension.text,
                'net': net.text,
              };
              if (values.values.any(
                (value) => double.tryParse(value) == null,
              )) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Enter a number for every payslip amount.'),
                  ),
                );
                return;
              }
              Navigator.pop(context, <String, dynamic>{
                'payDate': payDate.text,
                for (final entry in values.entries)
                  entry.key: double.parse(entry.value),
              });
            },
            child: const Text('Save payslip'),
          ),
        ],
      ),
    );
    for (final controller in [
      payDate,
      hours,
      gross,
      sleep,
      tax,
      ni,
      pension,
      net,
    ]) {
      controller.dispose();
    }
    if (saved == null) return;
    try {
      await home.savePayslip(key, saved);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Payslip could not be saved: $error')),
        );
      }
    }
  }

  Widget _decimalField(TextEditingController controller, String label) =>
      Padding(
        padding: const EdgeInsets.only(top: 8),
        child: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: label),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final gross = home.gross;
    final deductions = calculateDeductions(gross, home.money);
    final takeHome = deductions.net;
    final periodKey = home.currentPeriod.start.toIso8601String().substring(
      0,
      10,
    );
    final currentSpend = home.spending[periodKey] ?? const <String, double>{};
    final totalSpent = currentSpend.values.fold<double>(0, (a, b) => a + b);
    final payslip = home.payslips[periodKey];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Money',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w900,
            color: brandNavy,
          ),
        ),
        const SizedBox(height: 12),
        _PeriodSelector(home: home),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Take-home estimate · 2026/27 guide',
          child: Column(
            children: [
              Text(
                formatCurrency(takeHome),
                style: const TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w900,
                  color: brandNavy,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Planning estimate using website-aligned tax rules, not a payslip or tax advice.',
                style: TextStyle(color: Colors.black54, fontSize: 12),
              ),
              const SizedBox(height: 12),
              _MetricRow(label: 'Gross pay', value: formatCurrency(gross)),
              _MetricRow(
                label: 'Income tax',
                value: formatCurrency(deductions.tax),
              ),
              _MetricRow(
                label: 'National Insurance',
                value: formatCurrency(deductions.ni),
              ),
              _MetricRow(
                label: 'Pension',
                value: formatCurrency(deductions.pension),
              ),
              _MetricRow(
                label: 'Student loan',
                value: formatCurrency(deductions.studentLoan),
              ),
              _MetricRow(label: 'Take-home', value: formatCurrency(takeHome)),
              if (home.periodShifts.any((shift) => (shift.fare ?? 0) > 0))
                _MetricRow(
                  label: 'Travel fares paid by you',
                  value: formatCurrency(
                    home.periodShifts.fold<double>(
                      0,
                      (total, shift) => total + (shift.fare ?? 0),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Tax and deductions',
          child: Column(
            children: [
              DropdownButtonFormField<String>(
                value: employment,
                decoration: const InputDecoration(labelText: 'Employment type'),
                items: const [
                  DropdownMenuItem(
                    value: 'paye',
                    child: Text('Employed (PAYE)'),
                  ),
                  DropdownMenuItem(value: 'self', child: Text('Self-employed')),
                ],
                onChanged: (value) =>
                    setState(() => employment = value ?? 'paye'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: taxCodeController,
                enabled: employment == 'paye',
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Tax code',
                  helperText:
                      'Supports standard, BR, D0, D1, NT, 0T and K codes.',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: pensionController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Pension contribution (%)',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: studentLoan,
                decoration: const InputDecoration(labelText: 'Student loan'),
                items: const [
                  DropdownMenuItem(value: 'none', child: Text('None')),
                  DropdownMenuItem(value: 'plan1', child: Text('Plan 1')),
                  DropdownMenuItem(value: 'plan2', child: Text('Plan 2')),
                  DropdownMenuItem(value: 'plan4', child: Text('Plan 4')),
                  DropdownMenuItem(value: 'plan5', child: Text('Plan 5')),
                  DropdownMenuItem(value: 'pg', child: Text('Postgraduate')),
                ],
                onChanged: (value) =>
                    setState(() => studentLoan = value ?? 'none'),
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(
                  onPressed: savingTax ? null : saveTaxSettings,
                  style: FilledButton.styleFrom(backgroundColor: brandRed),
                  child: Text(savingTax ? 'Saving…' : 'Save tax settings'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Spending plan · ${home.currentPeriod.label}',
          child: Column(
            children: [
              if (home.money.pots.isEmpty)
                const Text('No pots yet. Add pots to plan your take-home.')
              else
                ...home.money.pots.map((pot) {
                  final planned = pot.mode == 'fixed'
                      ? pot.value
                      : takeHome * pot.value / 100;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                pot.name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            Text(
                              '${pot.mode == 'fixed' ? 'Fixed' : '${formatHours(pot.value)}%'} · ${formatCurrency(planned)} planned',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.black54,
                              ),
                            ),
                            PopupMenuButton<String>(
                              onSelected: (action) {
                                if (action == 'edit') editPot(pot);
                                if (action == 'delete') deletePot(pot);
                              },
                              itemBuilder: (context) => const [
                                PopupMenuItem(
                                  value: 'edit',
                                  child: Text('Edit pot'),
                                ),
                                PopupMenuItem(
                                  value: 'delete',
                                  child: Text('Delete pot'),
                                ),
                              ],
                            ),
                          ],
                        ),
                        TextFormField(
                          key: ValueKey(
                            '$periodKey-${pot.id}-${currentSpend[pot.id]}',
                          ),
                          initialValue:
                              spendDraft['$periodKey|${pot.id}'] ??
                              currentSpend[pot.id]?.toString() ??
                              '',
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          onChanged: (value) =>
                              spendDraft['$periodKey|${pot.id}'] = value,
                          onFieldSubmitted: (value) =>
                              saveSpend(pot, value, periodKey),
                          decoration: InputDecoration(
                            labelText:
                                'Spent (£) · ${formatCurrency(currentSpend[pot.id] ?? 0)}',
                            suffixIcon: IconButton(
                              tooltip: 'Save spending',
                              onPressed: () => saveSpend(
                                pot,
                                spendDraft['$periodKey|${pot.id}'] ??
                                    currentSpend[pot.id]?.toString() ??
                                    '',
                                periodKey,
                              ),
                              icon: const Icon(Icons.save_outlined),
                            ),
                            helperText:
                                '${formatCurrency(math.max(0, planned - (currentSpend[pot.id] ?? 0)))} remaining',
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              _MetricRow(
                label: 'Total spent',
                value: formatCurrency(totalSpent),
              ),
              _MetricRow(
                label: 'Take-home remaining after spending',
                value: formatCurrency(takeHome - totalSpent),
              ),
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 8,
                children: [
                  TextButton.icon(
                    onPressed: () => editPot(),
                    icon: const Icon(Icons.add_circle_outline),
                    label: const Text('Add pot'),
                  ),
                  TextButton.icon(
                    onPressed: () async {
                      final fixed = home.money.pots
                          .where((pot) => pot.mode == 'fixed')
                          .fold<double>(0, (sum, pot) => sum + pot.value);
                      final percentPots = home.money.pots
                          .where((pot) => pot.mode != 'fixed')
                          .toList();
                      final percentTotal = percentPots.fold<double>(
                        0,
                        (sum, pot) => sum + pot.value,
                      );
                      if (percentTotal <= 0 ||
                          takeHome <= 0 ||
                          fixed > takeHome) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'The plan cannot be fitted; check your percentage and fixed pots.',
                            ),
                          ),
                        );
                        return;
                      }
                      final target = (takeHome - fixed) / takeHome * 100;
                      final adjusted = percentPots
                          .map(
                            (pot) => pot.copyWith(
                              value:
                                  (pot.value * target / percentTotal * 10)
                                      .roundToDouble() /
                                  10,
                            ),
                          )
                          .toList();
                      final replacement = <MoneyPot>[
                        ...home.money.pots.where((pot) => pot.mode == 'fixed'),
                        ...adjusted,
                      ];
                      await home.saveMoney(
                        home.money.copyWith(pots: replacement),
                      );
                    },
                    icon: const Icon(Icons.balance_rounded),
                    label: const Text('Fit plan to take-home'),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Payslip check',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (payslip == null)
                const Text(
                  'Add your payslip figures to compare with logged shifts and estimated deductions.',
                )
              else
                _PayslipComparison(
                  payslip: payslip,
                  shiftHours: home.netHours,
                  shiftGross: gross,
                  deductions: deductions,
                  money: home.money,
                  hasLoggedShifts: home.periodShifts.isNotEmpty,
                ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: editPayslip,
                icon: const Icon(Icons.receipt_long_rounded),
                label: Text(payslip == null ? 'Add payslip' : 'Edit payslip'),
                style: FilledButton.styleFrom(backgroundColor: brandRed),
              ),
              if (payslip != null)
                TextButton(
                  onPressed: () => home.deletePayslip(periodKey),
                  child: const Text('Delete payslip'),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PayslipComparison extends StatelessWidget {
  const _PayslipComparison({
    required this.payslip,
    required this.shiftHours,
    required this.shiftGross,
    required this.deductions,
    required this.money,
    required this.hasLoggedShifts,
  });

  final Map<String, dynamic> payslip;
  final double shiftHours;
  final double shiftGross;
  final PayDeductions deductions;
  final MoneySettings money;
  final bool hasLoggedShifts;

  @override
  Widget build(BuildContext context) {
    double amount(String key) => (payslip[key] as num?)?.toDouble() ?? 0;
    final actualGross = amount('gross');
    final slipDeductions = calculateDeductions(actualGross, money);
    final taxDiffers = (amount('tax') - slipDeductions.tax).abs() >= 1;
    final niDiffers = (amount('ni') - slipDeductions.ni).abs() >= 1;
    final pensionDiffers =
        (amount('pension') - slipDeductions.pension).abs() >= 1;
    Widget comparison(String title, double actual, double estimate) {
      final difference = actual - estimate;
      return _MetricRow(
        label: title,
        value:
            '${formatCurrency(actual)} · ${difference.abs() < 1 ? 'matches' : '${difference > 0 ? '+' : '−'}${formatCurrency(difference.abs())}'} vs estimate',
      );
    }

    return Column(
      children: [
        if ((payslip['payDate'] as String?)?.isNotEmpty == true)
          _MetricRow(label: 'Paid', value: payslip['payDate'] as String),
        if (hasLoggedShifts) ...[
          comparison('Hours paid', amount('hours'), shiftHours),
          comparison('Gross pay', actualGross, shiftGross),
        ] else
          _MetricRow(
            label: 'Gross pay on payslip',
            value: formatCurrency(actualGross),
          ),
        _MetricRow(
          label: 'Sleep-in pay shown',
          value: formatCurrency(amount('sleepPay')),
        ),
        comparison('Income tax', amount('tax'), slipDeductions.tax),
        comparison('National Insurance', amount('ni'), slipDeductions.ni),
        comparison('Pension', amount('pension'), slipDeductions.pension),
        comparison(
          hasLoggedShifts ? 'Net pay vs logged shifts' : 'Net pay',
          amount('net'),
          hasLoggedShifts ? deductions.net : slipDeductions.net,
        ),
        _MetricRow(
          label: 'Estimated net on payslip gross',
          value: formatCurrency(slipDeductions.net),
        ),
        if (taxDiffers || niDiffers || pensionDiffers)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'One or more payslip deductions differ from the current tax, NI or pension estimate by at least £1. Check your tax code and pension settings.',
              style: TextStyle(color: Colors.deepOrange, fontSize: 12),
            ),
          ),
        const Text(
          'Figures are estimates. Check your payslip and employer payroll for authoritative amounts.',
          style: TextStyle(color: Colors.black54, fontSize: 12),
        ),
      ],
    );
  }
}

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key, required this.home});

  final _ShiftbuckHomeState home;

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late TextEditingController nameController;
  late TextEditingController roleController;
  late TextEditingController hourlyController;
  late TextEditingController sleepController;
  late TextEditingController periodController;
  late TextEditingController usersController;
  late TextEditingController busFareController;
  late TextEditingController renameFromController;
  late TextEditingController renameToController;
  late TextEditingController areaController;
  late TextEditingController employerController;
  late TextEditingController nicknameController;
  late TextEditingController sexOtherController;
  String workType = 'care';
  String ageGroup = '';
  String? sex;
  List<ShiftType> shiftTypes = <ShiftType>[];
  bool saving = false;

  @override
  void initState() {
    super.initState();
    final profile = widget.home.profile;
    nameController = TextEditingController(text: profile.name);
    roleController = TextEditingController(text: profile.role);
    hourlyController = TextEditingController(
      text: profile.hourlyRate.toStringAsFixed(2),
    );
    sleepController = TextEditingController(
      text: profile.sleepInRate.toStringAsFixed(2),
    );
    periodController = TextEditingController(
      text: profile.periodStartDay.toString(),
    );
    usersController = TextEditingController(
      text: profile.serviceUsers.join(', '),
    );
    busFareController = TextEditingController(
      text: profile.busFare.toStringAsFixed(2),
    );
    renameFromController = TextEditingController();
    renameToController = TextEditingController();
    areaController = TextEditingController(text: widget.home.userProfile.area);
    employerController = TextEditingController(
      text: widget.home.userProfile.employer ?? '',
    );
    nicknameController = TextEditingController(
      text: widget.home.userProfile.nickname,
    );
    sexOtherController = TextEditingController(
      text: widget.home.userProfile.sexOther ?? '',
    );
    workType = profile.workType;
    ageGroup = widget.home.userProfile.ageGroup;
    sex = widget.home.userProfile.sex;
    shiftTypes = [...availableShiftTypes(profile)];
  }

  @override
  void dispose() {
    nameController.dispose();
    roleController.dispose();
    hourlyController.dispose();
    sleepController.dispose();
    periodController.dispose();
    usersController.dispose();
    busFareController.dispose();
    renameFromController.dispose();
    renameToController.dispose();
    areaController.dispose();
    employerController.dispose();
    nicknameController.dispose();
    sexOtherController.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final hourlyRate = double.tryParse(hourlyController.text);
    final sleepRate = double.tryParse(sleepController.text);
    final periodStart = int.tryParse(periodController.text);
    final busFare = double.tryParse(busFareController.text);
    if (hourlyRate == null ||
        hourlyRate < 0 ||
        sleepRate == null ||
        sleepRate < 0 ||
        periodStart == null ||
        periodStart < 1 ||
        periodStart > 31 ||
        busFare == null ||
        busFare < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Check hourly rate, sleep-in rate, fare and period day.',
          ),
        ),
      );
      return;
    }
    if (shiftTypes.any(
      (type) =>
          type.name.trim().isEmpty ||
          type.breakHrs < 0 ||
          (type.paid != 'sleep' &&
              type.breakHrs >=
                  (type.paid == 'both'
                      ? (type.hours ?? 0)
                      : _spanHours(type.start, type.end))),
    )) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Check your shift types and their paid hours/breaks.'),
        ),
      );
      return;
    }
    final nickname = nicknameController.text.trim();
    if (ageGroup.isEmpty ||
        ageGroup == 'under18' ||
        areaController.text.trim().isEmpty ||
        !RegExp(r'^[A-Za-z0-9_]{3,20}$').hasMatch(nickname) ||
        (nameController.text.trim().length > 2 &&
            nickname.toLowerCase().contains(
              nameController.text.trim().toLowerCase(),
            ))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Check age group, town/county and the 3–20 character community nickname.',
          ),
        ),
      );
      return;
    }
    final next = widget.home.profile.copyWith(
      name: nameController.text.trim(),
      role: roleController.text.trim().isEmpty
          ? 'Support Worker'
          : roleController.text.trim(),
      hourlyRate: hourlyRate,
      sleepInRate: sleepRate,
      periodStartDay: periodStart,
      serviceUsers: usersController.text
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toSet()
          .toList(),
      busFare: busFare,
      workType: workType,
      shiftTypes: shiftTypes,
    );
    setState(() => saving = true);
    try {
      await widget.home.saveProfile(next);
      await widget.home.saveUserProfile(
        UserProfile(
          ageGroup: ageGroup,
          sex: sex,
          sexOther: sex == 'other' ? sexOtherController.text.trim() : null,
          area: areaController.text.trim(),
          employer: employerController.text.trim().isEmpty
              ? null
              : employerController.text.trim(),
          nickname: nickname,
          createdAt: widget.home.userProfile.createdAt,
        ),
      );
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Settings saved')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Settings could not be saved: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> editShiftType([ShiftType? existing]) async {
    final name = TextEditingController(text: existing?.name ?? 'My shift');
    final hours = TextEditingController(
      text: existing?.hours?.toString() ?? '12',
    );
    final breaks = TextEditingController(
      text: existing?.breakHrs.toString() ?? '0.5',
    );
    final rate = TextEditingController(text: existing?.rate?.toString() ?? '');
    var paid = existing?.paid ?? 'hours';
    var start = existing?.start ?? '08:00';
    var end = existing?.end ?? '20:00';
    final result = await showDialog<ShiftType>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(existing == null ? 'Add shift type' : 'Edit shift type'),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: Column(
                children: [
                  TextField(
                    controller: name,
                    maxLength: 30,
                    decoration: const InputDecoration(labelText: 'Name'),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: paid,
                    decoration: const InputDecoration(labelText: 'Paid as'),
                    items: const [
                      DropdownMenuItem(
                        value: 'hours',
                        child: Text('By the hour'),
                      ),
                      DropdownMenuItem(
                        value: 'sleep',
                        child: Text('Sleep-in only'),
                      ),
                      DropdownMenuItem(
                        value: 'both',
                        child: Text('Hours + sleep-in'),
                      ),
                    ],
                    onChanged: (value) =>
                        setDialogState(() => paid = value ?? paid),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          initialValue: start,
                          decoration: const InputDecoration(
                            labelText: 'Start (HH:MM)',
                          ),
                          onChanged: (value) => start = value,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextFormField(
                          initialValue: end,
                          decoration: const InputDecoration(
                            labelText: 'Finish (HH:MM)',
                          ),
                          onChanged: (value) => end = value,
                        ),
                      ),
                    ],
                  ),
                  if (paid == 'both') ...[
                    const SizedBox(height: 8),
                    TextField(
                      controller: hours,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Paid hours',
                      ),
                    ),
                  ],
                  if (paid != 'sleep') ...[
                    const SizedBox(height: 8),
                    TextField(
                      controller: breaks,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Unpaid break (hours)',
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: rate,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Own hourly rate (optional)',
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final breakValue = paid == 'sleep'
                    ? 0.0
                    : double.tryParse(breaks.text);
                final hoursValue = paid == 'both'
                    ? double.tryParse(hours.text)
                    : null;
                final rateValue = rate.text.trim().isEmpty
                    ? null
                    : double.tryParse(rate.text);
                final range = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');
                if (name.text.trim().isEmpty ||
                    !range.hasMatch(start) ||
                    !range.hasMatch(end) ||
                    breakValue == null ||
                    (paid == 'both' &&
                        (hoursValue == null || hoursValue <= breakValue)) ||
                    (rate.text.trim().isNotEmpty &&
                        (rateValue == null || rateValue < 0))) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Check the name, times, paid hours, break and rate.',
                      ),
                    ),
                  );
                  return;
                }
                Navigator.pop(
                  context,
                  ShiftType(
                    name: name.text.trim(),
                    paid: paid,
                    start: start,
                    end: end,
                    hours: hoursValue,
                    breakHrs: breakValue,
                    rate: rateValue,
                  ),
                );
              },
              child: const Text('Save shift type'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    hours.dispose();
    breaks.dispose();
    rate.dispose();
    if (result == null) return;
    setState(() {
      final index = shiftTypes.indexWhere(
        (type) => type.name == existing?.name,
      );
      if (existing == null || index < 0) {
        shiftTypes.add(result);
      } else {
        shiftTypes[index] = result;
      }
    });
  }

  Future<void> renameServiceUser() async {
    final from = renameFromController.text.trim();
    final to = renameToController.text.trim();
    if (from.isEmpty || to.isEmpty || from == to) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Choose an existing service user and enter a different name.',
          ),
        ),
      );
      return;
    }
    setState(() => saving = true);
    try {
      for (final shift
          in widget.home.shifts
              .where((shift) => shift.users.contains(from))
              .toList()) {
        final nextUsers = shift.users
            .map((user) => user == from ? to : user)
            .toSet()
            .toList();
        await widget.home.saveShift(shift.copyWith(users: nextUsers));
      }
      final users = widget.home.profile.serviceUsers
          .map((user) => user == from ? to : user)
          .toSet()
          .toList();
      await widget.home.saveProfile(
        widget.home.profile.copyWith(serviceUsers: users),
      );
      usersController.text = users.join(', ');
      renameFromController.clear();
      renameToController.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Service user renamed in settings and shifts.'),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Service user rename could not be completed: $error'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> manageAccount() async {
    final user = Supabase.instance.client.auth.currentUser;
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.lock_reset_rounded),
              title: const Text('Reset password'),
              onTap: () => Navigator.pop(context, 'reset'),
            ),
            ListTile(
              leading: const Icon(
                Icons.delete_forever_outlined,
                color: Colors.red,
              ),
              title: const Text('Delete account and all data'),
              onTap: () => Navigator.pop(context, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (action == 'reset') {
      final email = user?.email;
      if (email == null || email.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Password reset is available only for email/password accounts.',
            ),
          ),
        );
        return;
      }
      try {
        await Supabase.instance.client.auth.resetPasswordForEmail(email);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Password reset email sent to $email.')),
          );
        }
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Password reset failed: $error')),
          );
        }
      }
    } else if (action == 'delete') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Delete your account?'),
          content: const Text(
            'This permanently deletes your Shiftbuck shifts, settings, spending records and payslips. This cannot be undone.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete everything'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
      try {
        await widget.home.repository.deleteAccountDataAndAuth();
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Account deletion failed: $error')),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Settings',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w900,
            color: brandNavy,
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Private profile details',
          child: Column(
            children: [
              DropdownButtonFormField<String>(
                value: ageGroup.isEmpty ? null : ageGroup,
                decoration: const InputDecoration(
                  labelText: 'Age group (18 or over)',
                ),
                items: const [
                  DropdownMenuItem(value: '18-24', child: Text('18–24')),
                  DropdownMenuItem(value: '25-34', child: Text('25–34')),
                  DropdownMenuItem(value: '35-44', child: Text('35–44')),
                  DropdownMenuItem(value: '45-54', child: Text('45–54')),
                  DropdownMenuItem(value: '55-64', child: Text('55–64')),
                  DropdownMenuItem(value: '65+', child: Text('65 or over')),
                  DropdownMenuItem(
                    value: 'na',
                    child: Text('Prefer not to say (18 or over)'),
                  ),
                ],
                onChanged: (value) => setState(() => ageGroup = value ?? ''),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: sex,
                decoration: const InputDecoration(labelText: 'Sex (optional)'),
                items: const [
                  DropdownMenuItem(value: 'female', child: Text('Female')),
                  DropdownMenuItem(value: 'male', child: Text('Male')),
                  DropdownMenuItem(
                    value: 'other',
                    child: Text('I’d rather describe it'),
                  ),
                ],
                onChanged: (value) => setState(() => sex = value),
              ),
              if (sex == 'other') ...[
                const SizedBox(height: 12),
                TextField(
                  controller: sexOtherController,
                  maxLength: 40,
                  decoration: const InputDecoration(
                    labelText: 'Describe in your own words (optional)',
                  ),
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: areaController,
                decoration: const InputDecoration(labelText: 'Town or county'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: employerController,
                decoration: const InputDecoration(
                  labelText: 'Employer (private, optional)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nicknameController,
                maxLength: 20,
                decoration: const InputDecoration(
                  labelText: 'Community nickname',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Employment and pay settings',
          child: Column(
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: roleController,
                decoration: const InputDecoration(labelText: 'Role'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: hourlyController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(labelText: 'Hourly rate (£)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: sleepController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Sleep-in rate (£)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: periodController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Pay period start day (1–31)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: busFareController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Usual travel fare (£)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: usersController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Service users',
                  helperText: 'Separate names with commas.',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: workType,
                decoration: const InputDecoration(labelText: 'Work type'),
                items: const [
                  DropdownMenuItem(value: 'care', child: Text('Care work')),
                  DropdownMenuItem(
                    value: 'other',
                    child: Text('Other shift work'),
                  ),
                ],
                onChanged: (value) => setState(() {
                  workType = value ?? 'care';
                  if (shiftTypes.isEmpty) {
                    shiftTypes = availableShiftTypes(
                      widget.home.profile.copyWith(workType: workType),
                    );
                  }
                }),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Shift types',
          child: Column(
            children: [
              ...shiftTypes.map(
                (type) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(type.name),
                  subtitle: Text(
                    '${type.start}–${type.end} · ${type.paid == 'sleep'
                        ? 'sleep-in only'
                        : type.paid == 'both'
                        ? '${formatHours(type.hours ?? 0)} paid hours + sleep-in'
                        : '${formatHours(_spanHours(type.start, type.end))}h'} · ${formatHours(type.breakHrs)}h break',
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) {
                      if (action == 'edit') editShiftType(type);
                      if (action == 'remove') {
                        setState(() => shiftTypes.remove(type));
                      }
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem(value: 'edit', child: Text('Edit')),
                      PopupMenuItem(value: 'remove', child: Text('Remove')),
                    ],
                  ),
                ),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => editShiftType(),
                  icon: const Icon(Icons.add),
                  label: const Text('Add shift type'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Rename a service user',
          child: Column(
            children: [
              TextField(
                controller: renameFromController,
                decoration: const InputDecoration(
                  labelText: 'Current name/code',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: renameToController,
                decoration: const InputDecoration(labelText: 'New name/code'),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: saving ? null : renameServiceUser,
                  child: const Text('Rename in all shifts'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: saving ? null : save,
          icon: const Icon(Icons.save_rounded),
          label: Text(saving ? 'Saving…' : 'Save settings'),
          style: FilledButton.styleFrom(backgroundColor: brandRed),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            try {
              await widget.home.exportBackup();
            } catch (error) {
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Backup could not be created: $error'),
                  ),
                );
              }
            }
          },
          icon: const Icon(Icons.backup_outlined),
          label: const Text('Back up all data'),
        ),
        OutlinedButton.icon(
          onPressed: manageAccount,
          icon: const Icon(Icons.manage_accounts_outlined),
          label: const Text('Account management'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () async {
            await Supabase.instance.client.auth.signOut();
          },
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Sign out'),
        ),
      ],
    );
  }
}

double _spanHours(String start, String end) {
  int minutes(String value) {
    final parts = value.split(':').map(int.tryParse).toList();
    if (parts.length != 2) return 0;
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  }

  var span = minutes(end) - minutes(start);
  if (span <= 0) span += 1440;
  return (span / 60 * 4).round() / 4;
}

List<ShiftType> availableShiftTypes(ProfileSettings profile) {
  if (profile.shiftTypes.isNotEmpty) return profile.shiftTypes;
  if (profile.workType == 'other') {
    return const [
      ShiftType(name: 'Early', start: '06:00', end: '14:00', breakHrs: .5),
      ShiftType(name: 'Late', start: '14:00', end: '22:00', breakHrs: .5),
      ShiftType(name: 'Night', start: '22:00', end: '06:00', breakHrs: .5),
      ShiftType(name: 'Long day', start: '07:00', end: '19:00', breakHrs: 1),
      ShiftType(name: 'Long night', start: '19:00', end: '07:00', breakHrs: 1),
      ShiftType(name: 'Twilight', start: '17:00', end: '22:00'),
    ];
  }
  return const [
    ShiftType(name: 'Early', start: '07:00', end: '15:00', breakHrs: .5),
    ShiftType(name: 'Late', start: '14:00', end: '22:00', breakHrs: .5),
    ShiftType(name: 'Long day', start: '08:00', end: '20:00', breakHrs: 2),
    ShiftType(name: 'Night', start: '22:00', end: '07:00'),
    ShiftType(name: 'Waking night', start: '20:00', end: '08:00'),
    ShiftType(name: 'Sleep-in', paid: 'sleep', start: '20:00', end: '08:00'),
    ShiftType(
      name: 'Day + sleep-in',
      paid: 'both',
      start: '08:00',
      end: '08:00',
      hours: 12,
      breakHrs: 2,
    ),
  ];
}

class LogShiftScreen extends StatefulWidget {
  const LogShiftScreen({super.key, required this.home, this.existing});

  final _ShiftbuckHomeState home;
  final ShiftRecord? existing;

  @override
  State<LogShiftScreen> createState() => _LogShiftScreenState();
}

class _LogShiftScreenState extends State<LogShiftScreen> {
  late DateTime date;
  late bool sleepIn;
  late String? selectedType;
  late TextEditingController dayHoursController;
  late TextEditingController breakController;
  late TextEditingController fareController;
  late TextEditingController notesController;
  late TextEditingController newUserController;
  late TextEditingController startController;
  late TextEditingController endController;
  late TextEditingController rateController;
  late Set<String> selectedUsers;

  @override
  void initState() {
    super.initState();
    final item =
        widget.existing ??
        ShiftRecord(date: DateTime.now(), dayHours: 12, breakHrs: 2);
    date = item.date;
    sleepIn = item.sleepIn;
    selectedType = item.type;
    dayHoursController = TextEditingController(
      text: item.dayHours == null ? '' : item.dayHours.toString(),
    );
    breakController = TextEditingController(
      text: item.breakHrs == null ? '' : item.breakHrs.toString(),
    );
    fareController = TextEditingController(
      text: item.fare == null ? '' : item.fare.toString(),
    );
    notesController = TextEditingController(text: item.notes);
    newUserController = TextEditingController();
    startController = TextEditingController(text: item.start ?? '');
    endController = TextEditingController(text: item.end ?? '');
    rateController = TextEditingController(text: item.rate?.toString() ?? '');
    selectedUsers = item.users.toSet();
    for (final controller in [dayHoursController, breakController]) {
      controller.addListener(_refreshPreview);
    }
  }

  void _refreshPreview() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    dayHoursController.removeListener(_refreshPreview);
    breakController.removeListener(_refreshPreview);
    dayHoursController.dispose();
    breakController.dispose();
    fareController.dispose();
    notesController.dispose();
    newUserController.dispose();
    startController.dispose();
    endController.dispose();
    rateController.dispose();
    super.dispose();
  }

  List<ShiftType> get shiftTypes => availableShiftTypes(widget.home.profile);

  void applyShiftType(ShiftType? type) {
    if (type == null) return;
    setState(() {
      selectedType = type.name;
      startController.text = type.start;
      endController.text = type.end;
      dayHoursController.text = type.paid == 'sleep'
          ? ''
          : (type.hours ?? _spanHours(type.start, type.end)).toString();
      breakController.text = type.paid == 'sleep'
          ? ''
          : type.breakHrs.toString();
      sleepIn = type.paid != 'hours';
      rateController.text = type.rate?.toString() ?? '';
    });
  }

  Future<void> pickTime(TextEditingController controller) async {
    final pieces = controller.text.split(':');
    final initial = pieces.length == 2
        ? TimeOfDay(
            hour: int.tryParse(pieces[0]) ?? 8,
            minute: int.tryParse(pieces[1]) ?? 0,
          )
        : const TimeOfDay(hour: 8, minute: 0);
    final result = await showTimePicker(context: context, initialTime: initial);
    if (result != null) {
      setState(() {
        controller.text =
            '${result.hour.toString().padLeft(2, '0')}:${result.minute.toString().padLeft(2, '0')}';
        if (!sleepIn &&
            startController.text.isNotEmpty &&
            endController.text.isNotEmpty) {
          dayHoursController.text = _spanHours(
            startController.text,
            endController.text,
          ).toString();
        }
      });
    }
  }

  Future<void> pickDate() async {
    final result = await showDatePicker(
      context: context,
      initialDate: date,
      firstDate: DateTime(2010),
      lastDate: DateTime(2100),
    );
    if (result != null) {
      setState(() => date = result);
    }
  }

  Future<void> addUser() async {
    final value = newUserController.text.trim();
    if (value.isEmpty) return;
    final next = [...widget.home.profile.serviceUsers, value];
    final profile = widget.home.profile.copyWith(
      serviceUsers: next.toSet().toList(),
    );
    await widget.home.saveProfile(profile);
    setState(() {
      selectedUsers.add(value);
      newUserController.clear();
    });
  }

  Future<void> save() async {
    final dayHours = double.tryParse(dayHoursController.text.trim());
    final breakHours = double.tryParse(breakController.text.trim());
    final fare = double.tryParse(fareController.text.trim());
    final rate = double.tryParse(rateController.text.trim());
    final uses = selectedUsers.toList();

    if (dayHours == null && !sleepIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Add paid hours, or mark it as a sleep-in.'),
        ),
      );
      return;
    }
    if (widget.home.profile.workType == 'care' && uses.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pick at least one service user.')),
      );
      return;
    }
    if (dayHours != null && (dayHours < 0 || dayHours > 24)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Day hours must be between 0 and 24.')),
      );
      return;
    }
    if (breakHours != null && dayHours == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('A break needs paid hours too.')),
      );
      return;
    }
    if (breakHours != null && dayHours != null && breakHours >= dayHours) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('The break is as long as the shift. Check the hours.'),
        ),
      );
      return;
    }
    if (rate != null && (rate < 0 || rate > 200)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Check the hourly rate for this shift.')),
      );
      return;
    }
    if (fare != null && (fare < 0 || fare > 200)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('The bus fare should be between £0 and £200.'),
        ),
      );
      return;
    }
    final start = startController.text.trim();
    final end = endController.text.trim();
    if ((start.isEmpty && end.isNotEmpty) ||
        (start.isNotEmpty && end.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Add both the start and finish times, or neither.'),
        ),
      );
      return;
    }

    final record = ShiftRecord(
      date: date,
      users: uses,
      sleepIn: sleepIn,
      dayHours: dayHours,
      breakHrs: breakHours,
      fare: fare,
      notes: notesController.text.trim(),
      type: selectedType,
      start: start.isEmpty ? null : start,
      end: end.isEmpty ? null : end,
      rate: rate,
    );

    try {
      await widget.home.saveShift(record);
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Shift could not be saved: $error')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.home.profile;
    final net = math.max(
      0.0,
      (double.tryParse(dayHoursController.text) ?? 0.0) -
          (double.tryParse(breakController.text) ?? 0.0),
    );
    final rate = (double.tryParse(rateController.text) ?? 0) > 0
        ? double.parse(rateController.text)
        : profile.hourlyRate;
    final preview = net * rate;
    final total = preview + (sleepIn ? profile.sleepInRate : 0.0);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existing == null ? 'Add shift' : 'Edit shift'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionCard(
            title: 'Shift details',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                OutlinedButton.icon(
                  onPressed: pickDate,
                  icon: const Icon(Icons.calendar_today_rounded),
                  label: Text(DateFormat('EEEE, d MMM yyyy').format(date)),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: shiftTypes.any((type) => type.name == selectedType)
                      ? selectedType
                      : null,
                  decoration: const InputDecoration(labelText: 'Shift type'),
                  items: shiftTypes
                      .map(
                        (type) => DropdownMenuItem(
                          value: type.name,
                          child: Text(type.name),
                        ),
                      )
                      .toList(),
                  onChanged: (name) {
                    if (name != null) {
                      final type = shiftTypes.firstWhere(
                        (item) => item.name == name,
                      );
                      applyShiftType(type);
                    }
                  },
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => pickTime(startController),
                        icon: const Icon(Icons.login_rounded),
                        label: Text(
                          startController.text.isEmpty
                              ? 'Start time'
                              : startController.text,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => pickTime(endController),
                        icon: const Icon(Icons.logout_rounded),
                        label: Text(
                          endController.text.isEmpty
                              ? 'Finish time'
                              : endController.text,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Sleep-in shift'),
                  subtitle: Text('Add ${formatCurrency(profile.sleepInRate)}'),
                  value: sleepIn,
                  onChanged: (value) => setState(() => sleepIn = value),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: dayHoursController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(labelText: 'Day hours'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: breakController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(labelText: 'Break hours'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: rateController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(
                    labelText: 'Shift hourly rate (£)',
                    helperText:
                        'Leave blank to use ${formatCurrency(profile.hourlyRate)}',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: fareController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Travel fare (£)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: notesController,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Notes'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Service users',
            child: Column(
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: profile.serviceUsers
                      .map(
                        (user) => FilterChip(
                          label: Text(user),
                          selected: selectedUsers.contains(user),
                          onSelected: (value) => setState(() {
                            if (value) {
                              selectedUsers.add(user);
                            } else {
                              selectedUsers.remove(user);
                            }
                          }),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: newUserController,
                        decoration: const InputDecoration(
                          labelText: 'Add service user',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: addUser,
                      icon: const Icon(Icons.add),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Preview',
            child: Column(
              children: [
                _MetricRow(
                  label: 'Paid hours',
                  value: '${formatHours(net)}h × ${formatCurrency(rate)}',
                ),
                _MetricRow(label: 'Hourly pay', value: formatCurrency(preview)),
                _MetricRow(
                  label: 'Sleep-in pay',
                  value: formatCurrency(sleepIn ? profile.sleepInRate : 0),
                ),
                _MetricRow(
                  label: 'Gross shift value',
                  value: formatCurrency(total),
                ),
                if ((double.tryParse(fareController.text) ?? 0) > 0)
                  _MetricRow(
                    label: 'Travel fare (not employer pay)',
                    value: formatCurrency(double.parse(fareController.text)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: save,
            icon: const Icon(Icons.save_rounded),
            label: const Text('Save shift'),
            style: FilledButton.styleFrom(backgroundColor: brandRed),
          ),
        ],
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.home});

  final _ShiftbuckHomeState home;

  @override
  Widget build(BuildContext context) {
    final profileTitle = [
      home.profile.name,
      home.profile.role,
    ].where((s) => s.isNotEmpty).join(' • ');
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [brandRed, brandNavy],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            profileTitle.isEmpty ? 'Support Worker' : profileTitle,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            home.currentPeriod.label,
            style: const TextStyle(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 8),
          Text(
            formatCurrency(home.gross),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 34,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: lineColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: brandNavy,
            ),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    required this.accent,
  });

  final String label;
  final String value;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: accent.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.black54, fontSize: 12),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 20,
              color: brandNavy,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.black54)),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: brandNavy,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: lineColor),
      ),
      child: Center(
        child: Text(text, style: const TextStyle(color: Colors.black54)),
      ),
    );
  }
}
