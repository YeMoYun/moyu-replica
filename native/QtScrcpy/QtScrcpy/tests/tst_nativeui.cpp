// Modified for MoYuMaster.

#include <QtTest>

#include "adbresulttranslator.h"
#include "wirelessadbcontroller.h"

class NativeUiTest : public QObject
{
    Q_OBJECT

private slots:
    void translator_data();
    void translator();
    void diagnosticRedactsPairingCode();
    void wirelessValidationAndInvocations();
};

void NativeUiTest::translator_data()
{
    QTest::addColumn<int>("action");
    QTest::addColumn<int>("exitCode");
    QTest::addColumn<bool>("timedOut");
    QTest::addColumn<QString>("out");
    QTest::addColumn<QString>("err");
    QTest::addColumn<int>("expectedCode");
    QTest::addColumn<QString>("expectedMessage");

    QTest::newRow("pair success") << int(AdbAction::Pair) << 0 << false
        << "Successfully paired to 192.0.2.1:37123" << ""
        << int(AdbResultCode::PairSucceeded) << "配对成功，请填写无线调试主页中的连接端口";
    QTest::newRow("pair invalid") << int(AdbAction::Pair) << 1 << false
        << "" << "Failed: Unable to start pairing client."
        << int(AdbResultCode::InvalidPairingCode) << "配对码不正确或已经失效，请在手机上重新生成";
    QTest::newRow("pair timeout") << int(AdbAction::Pair) << 1 << true
        << "" << "" << int(AdbResultCode::PairTimedOut)
        << "配对超时，请确认手机配对页面仍然开启";
    QTest::newRow("connect success") << int(AdbAction::Connect) << 0 << false
        << "connected to 192.0.2.1:37777" << ""
        << int(AdbResultCode::ConnectSucceeded) << "设备连接成功，设备列表已刷新";
    QTest::newRow("already connected") << int(AdbAction::Connect) << 0 << false
        << "already connected to 192.0.2.1:37777" << ""
        << int(AdbResultCode::AlreadyConnected) << "设备连接成功，设备列表已刷新";
    QTest::newRow("refused") << int(AdbAction::Connect) << 1 << false
        << "" << "failed to connect: connection refused"
        << int(AdbResultCode::ConnectionRefused) << "手机拒绝连接，请确认无线调试仍然开启";
    QTest::newRow("offline") << int(AdbAction::Connect) << 1 << false
        << "device offline" << "" << int(AdbResultCode::DeviceOffline)
        << "设备已离线，请重新连接";
}

void NativeUiTest::translator()
{
    QFETCH(int, action);
    QFETCH(int, exitCode);
    QFETCH(bool, timedOut);
    QFETCH(QString, out);
    QFETCH(QString, err);
    QFETCH(int, expectedCode);
    QFETCH(QString, expectedMessage);

    const AdbUserResult result = AdbResultTranslator::translate(
        AdbAction(action), exitCode, QProcess::UnknownError, timedOut, false,
        out, err, QString());

    QCOMPARE(int(result.code), expectedCode);
    QCOMPARE(result.message, expectedMessage);
}

void NativeUiTest::diagnosticRedactsPairingCode()
{
    const QString diagnostic = AdbResultTranslator::sanitizeDiagnostic("code 123456", "123456");

    QVERIFY(!diagnostic.contains("123456"));
    QVERIFY(diagnostic.contains("******"));
}

void NativeUiTest::wirelessValidationAndInvocations()
{
    QVERIFY(!WirelessAdbController::validatePair("", "37123", "123456").valid);
    QVERIFY(!WirelessAdbController::validatePair("192.0.2.1", "0", "123456").valid);
    QVERIFY(!WirelessAdbController::validatePair("192.0.2.1", "65536", "123456").valid);
    QVERIFY(!WirelessAdbController::validatePair("192.0.2.1", "37123", "12345").valid);
    QVERIFY(WirelessAdbController::validatePair("192.0.2.1", "37123", "123456").valid);
    QVERIFY(WirelessAdbController::validateConnect("192.0.2.1", "37777").valid);

    const auto pair = WirelessAdbController::pairInvocation(
        "adb.exe", "192.0.2.1", "37123", "123456");
    QCOMPARE(pair.arguments, QStringList({"pair", "192.0.2.1:37123"}));
    QVERIFY(!pair.arguments.join(' ').contains("123456"));
    QCOMPARE(pair.standardInput, QByteArray("123456\n"));

    const auto connect = WirelessAdbController::connectInvocation(
        "adb.exe", "192.0.2.1", "37777");
    QCOMPARE(connect.arguments, QStringList({"connect", "192.0.2.1:37777"}));
    QVERIFY(connect.standardInput.isEmpty());

}

QTEST_MAIN(NativeUiTest)
#include "tst_nativeui.moc"
