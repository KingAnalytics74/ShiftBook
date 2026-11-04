import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models.dart';

void main() {
  group('Shiftbuck pay calculations', () {
    test(
      'shift-specific rate and sleep-in pay are included, fares are not',
      () {
        final shift = ShiftRecord(
          date: DateTime(2026, 11, 1),
          dayHours: 8,
          breakHrs: 1,
          sleepIn: true,
          fare: 12,
          rate: 15,
        );

        expect(
          shift.grossFor(ProfileSettings(hourlyRate: 13, sleepInRate: 40)),
          145,
        );
        expect(shift.netHours, 7);
      },
    );

    test(
      'PAYE deductions include tax, NI, pension and student loan settings',
      () {
        final deductions = calculateDeductions(
          3000,
          MoneySettings(taxCode: '1257L', pensionPct: 4, studentLoan: 'plan2'),
        );

        expect(deductions.tax, closeTo(390.2, .01));
        expect(deductions.ni, closeTo(156.16, .01));
        expect(deductions.pension, closeTo(99.2, .01));
        expect(deductions.studentLoan, closeTo(49.68, .01));
        expect(
          deductions.net,
          closeTo(3000 - 390.2 - 156.16 - 99.2 - 49.68, .01),
        );
      },
    );
  });

  test('pay period start day is clamped to the last day of short months', () {
    final beforeLeapPeriod = PayPeriod.forDate(DateTime(2024, 2, 28), 31);
    final leapDayPeriod = PayPeriod.forDate(DateTime(2024, 2, 29), 31);

    expect(beforeLeapPeriod.start, DateTime(2024, 1, 31));
    expect(beforeLeapPeriod.end, DateTime(2024, 2, 28));
    expect(leapDayPeriod.start, DateTime(2024, 2, 29));
    expect(leapDayPeriod.end, DateTime(2024, 3, 30));
  });

  test('calendar weeks start on Monday', () {
    expect(calendarLeadingDays(DateTime(2026, 6, 1)), 0);
    expect(calendarLeadingDays(DateTime(2026, 11, 1)), 6);
  });

  test('rest check warns after seven consecutive shifts', () {
    final shifts = [
      for (var index = 0; index < 7; index++)
        ShiftRecord(
          date: DateTime(2026, 10, 26 + index),
          dayHours: 8,
          breakHrs: 0,
        ),
    ];

    final result = restCheckForDate(DateTime(2026, 11, 1), shifts);

    expect(result.level, 'red');
    expect(result.run, 7);
    expect(result.reasons, contains('7 days in a row without a day off'));
  });

  test('rest check flags less than eleven hours between timed shifts', () {
    final result = restCheckForDate(DateTime(2026, 11, 2), [
      ShiftRecord(
        date: DateTime(2026, 11, 1),
        start: '20:00',
        end: '06:00',
        dayHours: 9,
        breakHrs: 0,
      ),
      ShiftRecord(
        date: DateTime(2026, 11, 2),
        start: '16:00',
        end: '22:00',
        dayHours: 6,
        breakHrs: 0,
      ),
    ]);

    expect(result.level, 'amber');
    expect(
      result.reasons,
      contains('only 10 hours off between shifts, under the 11-hour minimum'),
    );
  });

  test('website tax-code options are represented by the mobile estimator', () {
    final basicRate = calculateDeductions(
      1000,
      MoneySettings(taxCode: 'BR', pensionPct: 0),
    );
    final noTax = calculateDeductions(
      1000,
      MoneySettings(taxCode: 'NT', pensionPct: 0),
    );

    expect(basicRate.tax, 200);
    expect(noTax.tax, 0);
  });
}
