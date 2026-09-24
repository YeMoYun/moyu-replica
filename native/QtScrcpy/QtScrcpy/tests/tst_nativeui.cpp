// Modified for MoYuMaster.

#include <QtTest>

#include <QLineEdit>
#include <QLabel>
#include <QPushButton>
#include <QSettings>
#include <QTemporaryDir>
#include <QToolButton>
#include <QWidget>

#include "adbresulttranslator.h"
#include "wirelessadbcontroller.h"
#include "wirelesspairdialog.h"
#include "moyucontrolbar.h"
#include "moyuwindowcontroller.h"

class NativeUiTest : public QObject
{
    Q_OBJECT

private slots:
    void translator_data();
    void translator();
    void diagnosticRedactsPairingCode();
    void wirelessValidationAndInvocations();
    void wirelessPairDialogStructure();
    void controlBarButtonsAndSignal();
    void windowStateRestoresWithoutPosition();
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

void NativeUiTest::wirelessPairDialogStructure()
{
    QTemporaryDir temporaryDirectory;
    QVERIFY(temporaryDirectory.isValid());
    QSettings settings(temporaryDirectory.filePath("settings.ini"), QSettings::IniFormat);
    WirelessAdbController controller("missing-test-adb.exe");
    WirelessPairDialog dialog(&controller, &settings);

    QCOMPARE(dialog.currentStep(), WirelessPairDialog::Step::Pair);
    QVERIFY(dialog.findChild<QLineEdit *>("pairHostEdit"));
    QVERIFY(dialog.findChild<QLineEdit *>("pairPortEdit"));
    auto code = dialog.findChild<QLineEdit *>("pairCodeEdit");
    QVERIFY(code);
    QCOMPARE(code->echoMode(), QLineEdit::Password);
    QVERIFY(dialog.findChild<QPushButton *>("pairButton"));
    QVERIFY(dialog.findChild<QPushButton *>("skipPairButton"));
    QVERIFY(dialog.findChild<QLineEdit *>("connectHostEdit"));
    QVERIFY(dialog.findChild<QLineEdit *>("connectPortEdit"));
    QVERIFY(dialog.findChild<QPushButton *>("connectButton"));
    QVERIFY(dialog.findChild<QPushButton *>("finishButton"));
    QVERIFY(dialog.findChild<QToolButton *>("diagnosticToggle"));
}

void NativeUiTest::controlBarButtonsAndSignal()
{
    const QStringList names = {
        "collapseButton", "closeButton", "topmostButton", "fitButton",
        "opacityButton", "autoHideButton", "controlButton", "homeButton",
        "fullscreenButton", "helpButton", "appearanceButton"
    };

    for (MoyuControlBar::Role role : {MoyuControlBar::Role::MainWindow,
                                      MoyuControlBar::Role::VideoWindow}) {
        MoyuControlBar bar(role);
        QVERIFY2(bar.property("fontAwesomeLoaded").toBool(),
                 "bundled FontAwesome font was not loaded");
        const QStringList unsupportedGlyphs = {
            QStringLiteral("◉"), QStringLiteral("⌖"), QStringLiteral("▣"),
            QStringLiteral("◐"), QStringLiteral("⌂"), QStringLiteral("⛶"),
            QStringLiteral("◑")
        };
        for (const QString &name : names) {
            auto *button = bar.findChild<QToolButton *>(name.toUtf8().constData());
            QVERIFY2(button, qPrintable(name));
            QVERIFY2(!unsupportedGlyphs.contains(button->text()), qPrintable(name));
        }
        QCOMPARE(bar.findChild<QToolButton *>("controlButton")->text(), QStringLiteral("控"));
        QSignalSpy controlSpy(&bar, &MoyuControlBar::controlRequested);
        QTest::mouseClick(bar.findChild<QToolButton *>("controlButton"), Qt::LeftButton);
        QCOMPARE(controlSpy.count(), 1);
        bar.setOpacityPercent(65);
        auto *opacityLabel = bar.findChild<QLabel *>("opacityPercentLabel");
        QVERIFY(opacityLabel);
        QCOMPARE(opacityLabel->text(), QString("65%"));
    }
}

void NativeUiTest::windowStateRestoresWithoutPosition()
{
    QTemporaryDir temporaryDirectory;
    QVERIFY(temporaryDirectory.isValid());
    QSettings::setDefaultFormat(QSettings::IniFormat);
    QSettings::setPath(QSettings::IniFormat, QSettings::UserScope,
                       temporaryDirectory.path());
    QCoreApplication::setOrganizationName("MoYuMasterNativeTests");
    QCoreApplication::setApplicationName("WindowState");
    QSettings settings;
    settings.setValue("moyu/windows/test-window/size", QSize(420, 300));
    settings.setValue("moyu/windows/test-window/opacity", 0.65);
    settings.setValue("moyu/windows/test-window/topmost", true);
    settings.setValue("moyu/windows/test-window/autoHide", false);
    settings.setValue("moyu/windows/test-window/lightToolbar", true);
    settings.setValue("moyu/windows/test-window/pos", QPoint(11, 12));

    QWidget window;
    window.resize(200, 160);
    MoyuControlBar bar(MoyuControlBar::Role::MainWindow, &window);
    MoyuWindowController controller(&window, &bar, "test-window");
    controller.restoreAndPresent();

    QCOMPARE(window.size(), QSize(420, 300));
    QVERIFY(window.pos() != QPoint(11, 12));
    QCOMPARE(qRound(window.windowOpacity() * 100.0), 65);
    QVERIFY(window.windowFlags().testFlag(Qt::WindowStaysOnTopHint));
    QCOMPARE(bar.property("lightToolbar").toBool(), true);
}

QTEST_MAIN(NativeUiTest)
#include "tst_nativeui.moc"
