import 'dart:convert';
import 'dart:io';

import 'package:cross_file/cross_file.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'models.dart';

class ShiftbuckRepository {
  ShiftbuckRepository({SupabaseClient? client})
    : client = client ?? Supabase.instance.client;

  final SupabaseClient client;

  String get uid => client.auth.currentUser?.id ?? 'demo-user';

  String get rootPath => 'data/users/$uid';
  String get userProfilePath => '$rootPath/profile';
  String get shiftCollectionPath => '$rootPath/main/shifts';
  String get spendingCollectionPath => '$rootPath/main/spend';
  String get payslipCollectionPath => '$rootPath/main/payslips';

  Map<String, dynamic> _demoProfile = ProfileSettings().toMap();
  Map<String, dynamic> _demoMoney = MoneySettings().toMap();
  final Map<String, ShiftRecord> _demoShifts = <String, ShiftRecord>{};

  Future<Map<String, dynamic>> loadProfile() async {
    if (client.auth.currentUser == null) {
      return _demoProfile;
    }

    final row = await client
        .from('documents')
        .select('data')
        .eq('path', '$rootPath/main')
        .maybeSingle();
    if (row == null) {
      return ProfileSettings().toMap();
    }
    return Map<String, dynamic>.from(row['data'] as Map);
  }

  Future<bool> hasProfile() async {
    if (client.auth.currentUser == null) {
      return _demoProfile['name']?.toString().isNotEmpty ?? false;
    }
    final row = await client
        .from('documents')
        .select('path')
        .eq('path', '$rootPath/main')
        .maybeSingle();
    return row != null;
  }

  Future<UserProfile> loadUserProfile() async {
    if (client.auth.currentUser == null) return const UserProfile();
    final row = await client
        .from('documents')
        .select('data')
        .eq('path', userProfilePath)
        .maybeSingle();
    if (row == null) return const UserProfile();
    return UserProfile.fromMap(Map<String, dynamic>.from(row['data'] as Map));
  }

  Future<Map<String, dynamic>> loadMoney() async {
    if (client.auth.currentUser == null) {
      return _demoMoney;
    }

    final row = await client
        .from('documents')
        .select('data')
        .eq('path', '$rootPath/money')
        .maybeSingle();
    if (row == null) {
      return MoneySettings().toMap();
    }
    return Map<String, dynamic>.from(row['data'] as Map);
  }

  Future<List<ShiftRecord>> loadShifts() async {
    if (client.auth.currentUser == null) {
      return _demoShifts.values.toList();
    }

    final rows = await client
        .from('documents')
        .select('data')
        .eq('parent', shiftCollectionPath);
    return (rows as List)
        .map(
          (e) =>
              ShiftRecord.fromMap(Map<String, dynamic>.from(e['data'] as Map)),
        )
        .toList();
  }

  Future<Map<String, Map<String, double>>> loadSpending() async {
    if (client.auth.currentUser == null) return <String, Map<String, double>>{};
    final rows = await client
        .from('documents')
        .select('path,data')
        .eq('parent', spendingCollectionPath);
    return {
      for (final row in rows as List)
        (row['path'] as String).split('/').last: {
          for (final entry in Map<String, dynamic>.from(
            row['data'] as Map,
          ).entries)
            entry.key: (entry.value as num).toDouble(),
        },
    };
  }

  Future<Map<String, Map<String, dynamic>>> loadPayslips() async {
    if (client.auth.currentUser == null)
      return <String, Map<String, dynamic>>{};
    final rows = await client
        .from('documents')
        .select('path,data')
        .eq('parent', payslipCollectionPath);
    return {
      for (final row in rows as List)
        (row['path'] as String).split('/').last: Map<String, dynamic>.from(
          row['data'] as Map,
        ),
    };
  }

  Future<void> saveProfile(ProfileSettings settings) async {
    final payload = settings.toMap();
    if (client.auth.currentUser == null) {
      _demoProfile = payload;
      return;
    }
    await client.from('documents').upsert({
      'path': '$rootPath/main',
      'parent': rootPath,
      'user_id': uid,
      'data': payload,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, onConflict: 'path');
  }

  Future<void> saveUserProfile(UserProfile profile) async {
    if (client.auth.currentUser == null) return;
    await client.from('documents').upsert({
      'path': userProfilePath,
      'parent': rootPath,
      'user_id': uid,
      'data': profile.toMap(),
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, onConflict: 'path');
  }

  Future<void> saveMoney(MoneySettings settings) async {
    final payload = settings.toMap();
    if (client.auth.currentUser == null) {
      _demoMoney = payload;
      return;
    }
    await client.from('documents').upsert({
      'path': '$rootPath/money',
      'parent': rootPath,
      'user_id': uid,
      'data': payload,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, onConflict: 'path');
  }

  Future<void> saveShift(ShiftRecord shift) async {
    final payload = shift.toMap();
    if (client.auth.currentUser == null) {
      _demoShifts[shift.key] = shift;
      return;
    }
    await client.from('documents').upsert({
      'path': '$rootPath/main/shifts/${shift.key}',
      'parent': '$rootPath/main/shifts',
      'user_id': uid,
      'data': payload,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, onConflict: 'path');
  }

  Future<void> deleteShift(String key) async {
    if (client.auth.currentUser == null) {
      _demoShifts.remove(key);
      return;
    }
    await client
        .from('documents')
        .delete()
        .eq('path', '$rootPath/main/shifts/$key');
  }

  Future<void> saveSpending(
    String periodKey,
    Map<String, double> values,
  ) async {
    if (client.auth.currentUser == null) return;
    await client.from('documents').upsert({
      'path': '$spendingCollectionPath/$periodKey',
      'parent': spendingCollectionPath,
      'user_id': uid,
      'data': values,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, onConflict: 'path');
  }

  Future<void> savePayslip(
    String periodKey,
    Map<String, dynamic> payslip,
  ) async {
    if (client.auth.currentUser == null) return;
    await client.from('documents').upsert({
      'path': '$payslipCollectionPath/$periodKey',
      'parent': payslipCollectionPath,
      'user_id': uid,
      'data': payslip,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }, onConflict: 'path');
  }

  Future<void> deletePayslip(String periodKey) async {
    if (client.auth.currentUser == null) return;
    await client
        .from('documents')
        .delete()
        .eq('path', '$payslipCollectionPath/$periodKey');
  }

  Future<void> exportCsv({
    required PayPeriod period,
    required ProfileSettings profile,
    required List<ShiftRecord> shifts,
  }) async {
    final byDate = <String, ShiftRecord>{
      for (final shift in shifts) shift.key: shift,
    };
    String quote(Object? value) {
      var text = value?.toString() ?? '';
      if (RegExp(r'^[=+\-@\t\r]').hasMatch(text)) text = "'$text";
      return '"${text.replaceAll('"', '""')}"';
    }

    final lines = <String>[
      'Employee,${quote(profile.name.isEmpty ? 'Not set' : profile.name)}',
      'Role,${quote(profile.role)}',
      'Pay period,${period.start.toIso8601String().substring(0, 10)} to ${period.end.toIso8601String().substring(0, 10)}',
      'Hourly rate,${profile.hourlyRate}',
      'Sleep-in rate,${profile.sleepInRate}',
      '',
      'Date,Day,Shift,Start,Finish,Service user(s),Sleep-in,Paid hours,Break,Net hours,Hourly pay,Sleep-in pay,Total,Travel fare,Notes',
    ];
    var paidHours = 0.0;
    var breaks = 0.0;
    var netHours = 0.0;
    var hourlyPay = 0.0;
    var sleepPay = 0.0;
    var fares = 0.0;
    var sleepIns = 0;
    for (var index = 0; index < period.days; index++) {
      final date = period.start.add(Duration(days: index));
      final key = date.toIso8601String().substring(0, 10);
      final shift = byDate[key];
      final calcHourly = shift == null
          ? 0.0
          : shift.netHours *
                (shift.rate != null && shift.rate! > 0
                    ? shift.rate!
                    : profile.hourlyRate);
      final calcSleep = shift?.sleepIn == true ? profile.sleepInRate : 0.0;
      paidHours += shift?.dayHours ?? 0;
      breaks += shift?.breakHrs ?? 0;
      netHours += shift?.netHours ?? 0;
      hourlyPay += calcHourly;
      sleepPay += calcSleep;
      fares += shift?.fare ?? 0;
      if (shift?.sleepIn == true) sleepIns++;
      lines.add(
        [
          key,
          DateFormat('EEE').format(date),
          quote(shift?.type ?? (shift == null ? 'Day off' : '')),
          quote(shift?.start),
          quote(shift?.end),
          quote(shift?.users.join(', ') ?? ''),
          shift == null ? '' : (shift.sleepIn ? 'Y' : 'N'),
          shift?.dayHours ?? '',
          shift?.breakHrs ?? '',
          shift?.netHours ?? '',
          calcHourly.toStringAsFixed(2),
          calcSleep.toStringAsFixed(2),
          (calcHourly + calcSleep).toStringAsFixed(2),
          (shift?.fare ?? 0).toStringAsFixed(2),
          quote(shift?.notes ?? ''),
        ].join(','),
      );
    }
    lines.add(
      [
        'TOTAL',
        '',
        '',
        '',
        '',
        '',
        sleepIns,
        paidHours,
        breaks,
        netHours,
        hourlyPay.toStringAsFixed(2),
        sleepPay.toStringAsFixed(2),
        (hourlyPay + sleepPay).toStringAsFixed(2),
        fares.toStringAsFixed(2),
        '',
      ].join(','),
    );
    final file = await _writeExport(
      'Timesheet_${_safeName(profile.name)}_${period.start.toIso8601String().substring(0, 10)}.csv',
      lines.join('\r\n'),
    );
    await _share(file, 'Shiftbuck timesheet export');
  }

  Future<void> exportBackup({
    required ProfileSettings profile,
    required UserProfile userProfile,
    required MoneySettings money,
    required List<ShiftRecord> shifts,
    required Map<String, Map<String, double>> spending,
    required Map<String, Map<String, dynamic>> payslips,
  }) async {
    final payload = <String, dynamic>{
      'exportedAt': DateTime.now().toUtc().toIso8601String(),
      'app': 'Shiftbook',
      'schemaVersion': 1,
      'config': profile.toMap(),
      'profile': userProfile.toMap(),
      'money': money.toMap(),
      'shifts': shifts.map((shift) => shift.toMap()).toList(),
      'spend': spending,
      'payslips': payslips,
    };
    final file = await _writeExport(
      'Shiftbuck_backup_${DateTime.now().toIso8601String().substring(0, 10)}.json',
      const JsonEncoder.withIndent('  ').convert(payload),
    );
    await _share(file, 'Shiftbuck full data backup');
  }

  Future<void> deleteAccountDataAndAuth() async {
    if (client.auth.currentUser == null) return;
    await client
        .from('documents')
        .delete()
        .eq('user_id', uid)
        .like('path', '$rootPath/%');
    await client.rpc('delete_my_account');
    await client.auth.signOut();
  }

  Future<File> _writeExport(String name, String content) async {
    final directory = await Directory.systemTemp.createTemp(
      'shiftbuck_export_',
    );
    final file = File('${directory.path}${Platform.pathSeparator}$name');
    await file.writeAsString(content, encoding: utf8);
    return file;
  }

  Future<void> _share(File file, String subject) async {
    await SharePlus.instance.share(
      ShareParams(files: <XFile>[XFile(file.path)], subject: subject),
    );
  }

  String _safeName(String name) => name
      .trim()
      .replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')
      .replaceAll(RegExp(r'^_|_$'), '')
      .ifEmpty('worker');
}

extension on String {
  String ifEmpty(String value) => isEmpty ? value : this;
}
