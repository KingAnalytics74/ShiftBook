import 'dart:math' as math;

import 'package:intl/intl.dart';

class UserProfile {
  const UserProfile({
    this.ageGroup = '',
    this.sex,
    this.sexOther,
    this.area = '',
    this.employer,
    this.nickname = '',
    this.createdAt,
  });

  final String ageGroup;
  final String? sex;
  final String? sexOther;
  final String area;
  final String? employer;
  final String nickname;
  final String? createdAt;

  UserProfile copyWith({
    String? ageGroup,
    String? sex,
    String? sexOther,
    String? area,
    String? employer,
    String? nickname,
    String? createdAt,
  }) => UserProfile(
    ageGroup: ageGroup ?? this.ageGroup,
    sex: sex ?? this.sex,
    sexOther: sexOther ?? this.sexOther,
    area: area ?? this.area,
    employer: employer ?? this.employer,
    nickname: nickname ?? this.nickname,
    createdAt: createdAt ?? this.createdAt,
  );

  Map<String, dynamic> toMap() => {
    'ageGroup': ageGroup,
    'sex': sex,
    'sexOther': sexOther,
    'area': area,
    'employer': employer,
    'nickname': nickname,
    if (createdAt != null) 'createdAt': createdAt,
  };

  factory UserProfile.fromMap(Map<String, dynamic> map) => UserProfile(
    ageGroup: (map['ageGroup'] ?? '').toString(),
    sex: map['sex']?.toString(),
    sexOther: map['sexOther']?.toString(),
    area: (map['area'] ?? '').toString(),
    employer: map['employer']?.toString(),
    nickname: (map['nickname'] ?? '').toString(),
    createdAt: map['createdAt']?.toString(),
  );
}

class ProfileSettings {
  ProfileSettings({
    this.name = '',
    this.role = 'Support Worker',
    this.hourlyRate = 13.0,
    this.sleepInRate = 40.0,
    this.periodStartDay = 26,
    this.serviceUsers = const <String>[],
    this.busFare = 0.0,
    this.workType = 'care',
    this.pattern = const <String, dynamic>{
      'dayStart': '08:00',
      'dayHours': 12,
      'breakHrs': 2,
      'sleepStart': '20:00',
      'sleepEnd': '08:00',
    },
    this.shiftTypes = const <ShiftType>[],
  });

  final String name;
  final String role;
  final double hourlyRate;
  final double sleepInRate;
  final int periodStartDay;
  final List<String> serviceUsers;
  final double busFare;
  final String workType;
  final Map<String, dynamic> pattern;
  final List<ShiftType> shiftTypes;

  ProfileSettings copyWith({
    String? name,
    String? role,
    double? hourlyRate,
    double? sleepInRate,
    int? periodStartDay,
    List<String>? serviceUsers,
    double? busFare,
    String? workType,
    Map<String, dynamic>? pattern,
    List<ShiftType>? shiftTypes,
  }) {
    return ProfileSettings(
      name: name ?? this.name,
      role: role ?? this.role,
      hourlyRate: hourlyRate ?? this.hourlyRate,
      sleepInRate: sleepInRate ?? this.sleepInRate,
      periodStartDay: periodStartDay ?? this.periodStartDay,
      serviceUsers: serviceUsers ?? this.serviceUsers,
      busFare: busFare ?? this.busFare,
      workType: workType ?? this.workType,
      pattern: pattern ?? this.pattern,
      shiftTypes: shiftTypes ?? this.shiftTypes,
    );
  }

  Map<String, dynamic> toMap() => {
    'name': name,
    'role': role,
    'hourlyRate': hourlyRate,
    'sleepInRate': sleepInRate,
    'periodStartDay': periodStartDay,
    'serviceUsers': serviceUsers,
    'busFare': busFare,
    'workType': workType,
    'pattern': pattern,
    'shiftTypes': shiftTypes.map((e) => e.toMap()).toList(),
  };

  factory ProfileSettings.fromMap(Map<String, dynamic> map) {
    final rawUsers = map['serviceUsers'];
    final users = rawUsers is List
        ? rawUsers.map((e) => e.toString()).toList()
        : <String>[];
    final rawPattern = map['pattern'];
    final rawTypes = map['shiftTypes'];
    return ProfileSettings(
      name: (map['name'] ?? '').toString(),
      role: (map['role'] ?? 'Support Worker').toString(),
      hourlyRate: (map['hourlyRate'] as num?)?.toDouble() ?? 13.0,
      sleepInRate: (map['sleepInRate'] as num?)?.toDouble() ?? 40.0,
      periodStartDay: (map['periodStartDay'] as num?)?.toInt() ?? 26,
      serviceUsers: users,
      busFare: (map['busFare'] as num?)?.toDouble() ?? 0.0,
      workType: (map['workType'] ?? 'care').toString(),
      pattern: rawPattern is Map
          ? Map<String, dynamic>.from(rawPattern)
          : const <String, dynamic>{},
      shiftTypes: rawTypes is List
          ? rawTypes
                .whereType<Map>()
                .map((e) => ShiftType.fromMap(Map<String, dynamic>.from(e)))
                .toList()
          : <ShiftType>[],
    );
  }
}

class ShiftType {
  const ShiftType({
    required this.name,
    this.paid = 'hours',
    this.start = '08:00',
    this.end = '20:00',
    this.hours,
    this.breakHrs = 0,
    this.rate,
  });

  final String name;
  final String paid;
  final String start;
  final String end;
  final double? hours;
  final double breakHrs;
  final double? rate;

  Map<String, dynamic> toMap() => {
    'name': name,
    'paid': paid,
    'start': start,
    'end': end,
    'hours': hours,
    'breakHrs': breakHrs,
    'rate': rate,
  };

  factory ShiftType.fromMap(Map<String, dynamic> map) => ShiftType(
    name: (map['name'] ?? 'Shift').toString(),
    paid: ['hours', 'sleep', 'both'].contains(map['paid'])
        ? map['paid'].toString()
        : 'hours',
    start: (map['start'] ?? '08:00').toString(),
    end: (map['end'] ?? '20:00').toString(),
    hours: (map['hours'] as num?)?.toDouble(),
    breakHrs: (map['breakHrs'] as num?)?.toDouble() ?? 0,
    rate: (map['rate'] as num?)?.toDouble(),
  );
}

class MoneySettings {
  MoneySettings({
    this.employment = 'paye',
    this.taxCode = '1257L',
    this.pensionPct = 4.0,
    this.studentLoan = 'none',
    this.pots = const <MoneyPot>[],
  });

  final String employment;
  final String taxCode;
  final double pensionPct;
  final String studentLoan;
  final List<MoneyPot> pots;

  MoneySettings copyWith({
    String? employment,
    String? taxCode,
    double? pensionPct,
    String? studentLoan,
    List<MoneyPot>? pots,
  }) {
    return MoneySettings(
      employment: employment ?? this.employment,
      taxCode: taxCode ?? this.taxCode,
      pensionPct: pensionPct ?? this.pensionPct,
      studentLoan: studentLoan ?? this.studentLoan,
      pots: pots ?? this.pots,
    );
  }

  Map<String, dynamic> toMap() => {
    'employment': employment,
    'taxCode': taxCode,
    'pensionPct': pensionPct,
    'studentLoan': studentLoan,
    'pots': pots.map((e) => e.toMap()).toList(),
  };

  factory MoneySettings.fromMap(Map<String, dynamic> map) {
    final list = map['pots'];
    return MoneySettings(
      employment: (map['employment'] ?? 'paye').toString(),
      taxCode: (map['taxCode'] ?? '1257L').toString(),
      pensionPct: (map['pensionPct'] as num?)?.toDouble() ?? 4.0,
      studentLoan: (map['studentLoan'] ?? 'none').toString(),
      pots: list is List
          ? list
                .map(
                  (e) => MoneyPot.fromMap(Map<String, dynamic>.from(e as Map)),
                )
                .toList()
          : <MoneyPot>[],
    );
  }
}

class MoneyPot {
  MoneyPot({
    required this.id,
    required this.name,
    required this.kind,
    required this.mode,
    required this.value,
  });

  final String id;
  final String name;
  final String kind;
  final String mode;
  final double value;

  MoneyPot copyWith({
    String? id,
    String? name,
    String? kind,
    String? mode,
    double? value,
  }) => MoneyPot(
    id: id ?? this.id,
    name: name ?? this.name,
    kind: kind ?? this.kind,
    mode: mode ?? this.mode,
    value: value ?? this.value,
  );

  Map<String, dynamic> toMap() => {
    'id': id,
    'name': name,
    'kind': kind,
    'mode': mode,
    'value': value,
  };

  factory MoneyPot.fromMap(Map<String, dynamic> map) => MoneyPot(
    id: (map['id'] ?? '').toString(),
    name: (map['name'] ?? '').toString(),
    kind: (map['kind'] ?? 'need').toString(),
    mode: (map['mode'] ?? 'fixed').toString(),
    value: (map['value'] as num?)?.toDouble() ?? 0.0,
  );
}

class ShiftRecord {
  ShiftRecord({
    required this.date,
    this.users = const <String>[],
    this.sleepIn = false,
    this.dayHours,
    this.breakHrs,
    this.fare,
    this.notes = '',
    this.type,
    this.start,
    this.end,
    this.rate,
  });

  final DateTime date;
  final List<String> users;
  final bool sleepIn;
  final double? dayHours;
  final double? breakHrs;
  final double? fare;
  final String notes;
  final String? type;
  final String? start;
  final String? end;
  final double? rate;

  String get key => DateTime(
    date.year,
    date.month,
    date.day,
  ).toIso8601String().substring(0, 10);

  double get netHours =>
      dayHours == null ? 0.0 : math.max(0.0, dayHours! - (breakHrs ?? 0.0));

  ShiftRecord copyWith({
    DateTime? date,
    List<String>? users,
    bool? sleepIn,
    double? dayHours,
    double? breakHrs,
    double? fare,
    String? notes,
    String? type,
    String? start,
    String? end,
    double? rate,
  }) {
    return ShiftRecord(
      date: date ?? this.date,
      users: users ?? this.users,
      sleepIn: sleepIn ?? this.sleepIn,
      dayHours: dayHours ?? this.dayHours,
      breakHrs: breakHrs ?? this.breakHrs,
      fare: fare ?? this.fare,
      notes: notes ?? this.notes,
      type: type ?? this.type,
      start: start ?? this.start,
      end: end ?? this.end,
      rate: rate ?? this.rate,
    );
  }

  Map<String, dynamic> toMap() => {
    'date': key,
    'users': users,
    'sleepIn': sleepIn,
    'dayHours': dayHours,
    'breakHrs': breakHrs,
    'fare': fare,
    'notes': notes,
    'type': type,
    'start': start,
    'end': end,
    'rate': rate,
    'updatedAt': DateTime.now().toUtc().toIso8601String(),
  };

  factory ShiftRecord.fromMap(Map<String, dynamic> map) => ShiftRecord(
    date:
        DateTime.tryParse(
          (map['date'] ?? DateTime.now().toIso8601String()).toString(),
        ) ??
        DateTime.now(),
    users: (map['users'] is List)
        ? List<String>.from((map['users'] as List).map((e) => e.toString()))
        : <String>[],
    sleepIn: map['sleepIn'] == true,
    dayHours: (map['dayHours'] as num?)?.toDouble(),
    breakHrs: (map['breakHrs'] as num?)?.toDouble(),
    fare: (map['fare'] as num?)?.toDouble(),
    notes: (map['notes'] ?? '').toString(),
    type: map['type']?.toString(),
    start: map['start']?.toString(),
    end: map['end']?.toString(),
    rate: (map['rate'] as num?)?.toDouble(),
  );

  double grossFor(ProfileSettings profile) {
    final rate = this.rate != null && this.rate! > 0
        ? this.rate!
        : profile.hourlyRate;
    final base = netHours * rate;
    return base + (sleepIn ? profile.sleepInRate : 0.0);
  }
}

class PayPeriod {
  PayPeriod(this.start, this.end);

  final DateTime start;
  final DateTime end;

  static PayPeriod forDate(DateTime date, int startDay, [int offset = 0]) {
    var month = date.month;
    var year = date.year;
    final day = _dayInMonth(year, month, startDay);
    if (date.day < day) {
      month -= 1;
    }
    month += offset;
    final startDate = DateTime(year, month, _dayInMonth(year, month, startDay));
    final nextMonthDate = DateTime(startDate.year, startDate.month + 1, 1);
    final nextMonth = DateTime(
      nextMonthDate.year,
      nextMonthDate.month,
      _dayInMonth(nextMonthDate.year, nextMonthDate.month, startDay),
    );
    return PayPeriod(startDate, nextMonth.subtract(const Duration(days: 1)));
  }

  int get days => end.difference(start).inDays + 1;

  String get label =>
      '${DateFormat('d MMM').format(start)} – ${DateFormat('d MMM yyyy').format(end)}';
}

int _dayInMonth(int year, int month, int requestedDay) =>
    math.min(requestedDay, DateTime(year, month + 1, 0).day);

int calendarLeadingDays(DateTime firstDayOfMonth) =>
    firstDayOfMonth.weekday - DateTime.monday;

String formatCurrency(double value) => '£${value.toStringAsFixed(2)}';

String formatHours(double value) =>
    value.toStringAsFixed(value % 1 == 0 ? 0 : 1);

double estimateTaxAndNi(double gross, MoneySettings settings) {
  final deductions = calculateDeductions(gross, settings);
  return deductions.tax +
      deductions.ni +
      deductions.pension +
      deductions.studentLoan;
}

class PayDeductions {
  PayDeductions({
    required this.gross,
    required this.tax,
    required this.ni,
    required this.pension,
    required this.studentLoan,
  });

  final double gross;
  final double tax;
  final double ni;
  final double pension;
  final double studentLoan;

  double get net => math.max(0, gross - tax - ni - pension - studentLoan);
}

PayDeductions calculateDeductions(double gross, MoneySettings settings) {
  final selfEmployed = settings.employment == 'self';
  const personalAllowanceMonthly = 12570 / 12;
  const basicLimitMonthly = 37700 / 12;
  const additionalLimitMonthly = 125140 / 12;
  final code = settings.taxCode.toUpperCase().replaceAll(RegExp(r'\s+'), '');
  var taxableAllowance = 1257 * 10 / 12 + 9 / 12;
  var tax = 0.0;
  final codeWithoutEmergency = code.replaceFirst(RegExp(r'(W1|M1|X)$'), '');
  final codeBody = codeWithoutEmergency.replaceFirst(
    RegExp(r'^[SC](?=\d|K|BR|D0|D1|NT|0T)'),
    '',
  );
  if (selfEmployed) {
    final taxable = math.max(0, gross - personalAllowanceMonthly);
    tax =
        math.min(taxable, basicLimitMonthly) * .2 +
        math.max(0, taxable - basicLimitMonthly) * .4;
  } else if (codeBody == 'NT') {
    tax = 0;
  } else if (codeBody == 'BR' || codeBody == 'D0' || codeBody == 'D1') {
    final rate = codeBody == 'BR'
        ? .2
        : codeBody == 'D0'
        ? .4
        : .45;
    tax = gross.floorToDouble() * rate;
  } else {
    final kCode = RegExp(r'^K(\d{1,4})$').firstMatch(codeBody);
    if (codeBody == '0T') {
      taxableAllowance = 0;
    } else if (kCode != null) {
      taxableAllowance = -((int.parse(kCode.group(1)!) * 10 + 9) / 12);
    } else {
      final numericCode = RegExp(r'^(\d{1,4})[LMNT]$').firstMatch(codeBody);
      if (numericCode != null) {
        taxableAllowance = (int.parse(numericCode.group(1)!) * 10 + 9) / 12;
      }
    }
    final taxable = math.max(0, (gross - taxableAllowance).floorToDouble());
    tax =
        math.min(taxable, basicLimitMonthly) * .2 +
        math.max(
              0,
              math.min(taxable, additionalLimitMonthly) - basicLimitMonthly,
            ) *
            .4 +
        math.max(0, taxable - additionalLimitMonthly) * .45;
    if (kCode != null) tax = math.min(tax, gross * .5);
  }

  final pensionBase = selfEmployed
      ? gross
      : math.max(0, math.min(gross, 4189) - 520);
  final pension = pensionBase * settings.pensionPct / 100;
  final niLower = selfEmployed ? personalAllowanceMonthly : 1048;
  final niRate = selfEmployed ? .06 : .08;
  final ni =
      math.max(0, math.min(gross, 4189) - niLower) * niRate +
      math.max(0, gross - 4189) * .02;
  final loanThresholds = <String, double>{
    'plan1': 2241,
    'plan2': 2448,
    'plan4': 2816,
    'plan5': 2083,
    'pg': 1750,
  };
  final loanThreshold = loanThresholds[settings.studentLoan.toLowerCase()];
  final studentLoan = loanThreshold == null
      ? 0.0
      : math.max(0, gross - loanThreshold) *
            (settings.studentLoan.toLowerCase() == 'pg' ? .06 : .09);
  return PayDeductions(
    gross: gross,
    tax: tax,
    ni: ni,
    pension: pension,
    studentLoan: studentLoan,
  );
}

class RestCheckResult {
  const RestCheckResult({
    required this.level,
    required this.run,
    required this.hours7,
    required this.reasons,
  });

  final String level;
  final int run;
  final double hours7;
  final List<String> reasons;
}

bool _hasDayHours(ShiftRecord? shift) =>
    shift != null && shift.dayHours != null && shift.dayHours! > 0;

bool _workedShift(ShiftRecord? shift) =>
    shift != null && (shift.sleepIn || _hasDayHours(shift));

RestCheckResult restCheckForDate(DateTime date, List<ShiftRecord> shifts) {
  final byDay = <String, ShiftRecord>{
    for (final shift in shifts) shift.key: shift,
  };
  String keyFor(DateTime value) => DateTime(
    value.year,
    value.month,
    value.day,
  ).toIso8601String().substring(0, 10);
  final key = keyFor(date);
  var hours = 0.0;
  for (var i = 0; i < 7; i++) {
    final shift = byDay[keyFor(date.subtract(Duration(days: i)))];
    if (_hasDayHours(shift)) hours += shift!.netHours;
  }
  final current = byDay[key];
  if (!_workedShift(current)) {
    return RestCheckResult(
      level: 'off',
      run: 0,
      hours7: hours,
      reasons: const <String>[],
    );
  }

  var run = 0;
  var day = date;
  while (run < 90 && _workedShift(byDay[keyFor(day)])) {
    run++;
    day = day.subtract(const Duration(days: 1));
  }
  final reasons = <String>[];
  var level = 'ok';
  void raise(String next) {
    if (next == 'red' || (next == 'amber' && level == 'ok')) level = next;
  }

  if (run >= 7) {
    raise('red');
    reasons.add('$run days in a row without a day off');
  } else if (run >= 6) {
    raise('amber');
    reasons.add('$run days in a row, so the next day should be off');
  }
  if (hours > 48) {
    raise('red');
    reasons.add(
      '${formatHours(hours)} hours worked in the last 7 days, over 48',
    );
  } else if (hours > 40) {
    raise('amber');
    reasons.add('${formatHours(hours)} hours worked in the last 7 days');
  }
  final previous = byDay[keyFor(date.subtract(const Duration(days: 1)))];
  if (previous?.sleepIn == true &&
      _hasDayHours(previous) &&
      _hasDayHours(current)) {
    raise('red');
    reasons.add(
      'day shift, sleep-in, then another day shift: about 36 hours on duty',
    );
  } else if (previous?.sleepIn == true && _hasDayHours(current)) {
    raise('amber');
    reasons.add('straight from a sleep-in onto a day shift');
  } else if (previous?.start != null &&
      previous?.end != null &&
      current?.start != null &&
      current?.end != null) {
    DateTime at(DateTime on, String time) {
      final pieces = time.split(':').map(int.parse).toList();
      return DateTime(on.year, on.month, on.day, pieces[0], pieces[1]);
    }

    var previousStart = at(
      date.subtract(const Duration(days: 1)),
      previous!.start!,
    );
    var previousEnd = at(date.subtract(const Duration(days: 1)), previous.end!);
    if (!previousEnd.isAfter(previousStart)) {
      previousEnd = previousEnd.add(const Duration(days: 1));
    }
    final currentStart = at(date, current!.start!);
    final gap = currentStart.difference(previousEnd).inMinutes / 60;
    if (gap >= 0 && gap < 11) {
      raise('amber');
      reasons.add(
        gap < .5
            ? 'straight from one shift into the next, with no rest in between'
            : 'only ${formatHours(gap)} hours off between shifts, under the 11-hour minimum',
      );
    }
  }
  return RestCheckResult(
    level: level,
    run: run,
    hours7: hours,
    reasons: reasons,
  );
}
