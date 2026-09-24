// Modified for MoYuMaster: native wireless pairing without USB or console UI.

#include "wirelessadbcontroller.h"

#include <QHostAddress>
#include <QProcess>
#include <QRegularExpression>
#include <QTimer>

#ifdef Q_OS_WIN
#include <qt_windows.h>
#endif

namespace {

QString endpoint(const QString &host, const QString &port)
{
    const QString trimmedHost = host.trimmed();
    return trimmedHost.contains(QLatin1Char(':'))
        ? QStringLiteral("[%1]:%2").arg(trimmedHost, port.trimmed())
        : QStringLiteral("%1:%2").arg(trimmedHost, port.trimmed());
}

WirelessAdbController::ValidationResult validateAddressAndPort(
    const QString &host, const QString &port)
{
    QHostAddress address;
    if (host.trimmed().isEmpty() || !address.setAddress(host.trimmed())) {
        return {false, QStringLiteral("请输入手机无线调试页面显示的 IP 地址")};
    }

    bool portOk = false;
    const int number = port.trimmed().toInt(&portOk);
    if (!portOk || number < 1 || number > 65535) {
        return {false, QStringLiteral("端口必须是 1 到 65535 之间的整数")};
    }
    return {true, QString()};
}

} // namespace

WirelessAdbController::WirelessAdbController(QString adbPath, QObject *parent)
    : QObject(parent)
    , m_adbPath(std::move(adbPath))
    , m_process(new QProcess(this))
    , m_timer(new QTimer(this))
{
    m_process->setProcessChannelMode(QProcess::SeparateChannels);
#ifdef Q_OS_WIN
    m_process->setCreateProcessArgumentsModifier([](QProcess::CreateProcessArguments *arguments) {
        arguments->flags |= CREATE_NO_WINDOW;
    });
#endif
    m_timer->setSingleShot(true);

    connect(m_process, &QProcess::started, this, [this]() {
        if (!m_standardInput.isEmpty()) {
            m_process->write(m_standardInput);
            m_process->closeWriteChannel();
            m_standardInput.fill('\0');
            m_standardInput.clear();
            m_pairingCode.fill(QChar('\0'));
            m_pairingCode.clear();
        }
    });
    connect(m_process, &QProcess::readyReadStandardOutput, this, [this]() {
        m_standardOutput.append(m_process->readAllStandardOutput());
    });
    connect(m_process, &QProcess::readyReadStandardError, this, [this]() {
        m_standardError.append(m_process->readAllStandardError());
    });
    connect(m_process,
            qOverload<int, QProcess::ExitStatus>(&QProcess::finished),
            this,
            [this](int exitCode, QProcess::ExitStatus) {
                finishOperation(exitCode, m_process->error());
            });
    connect(m_process, &QProcess::errorOccurred, this, [this](QProcess::ProcessError error) {
        if (error == QProcess::FailedToStart) {
            finishOperation(-1, error);
        }
    });
    connect(m_timer, &QTimer::timeout, this, [this]() {
        if (!m_busy) {
            return;
        }
        m_timedOut = true;
        m_process->terminate();
        if (!m_process->waitForFinished(500)) {
            m_process->kill();
            m_process->waitForFinished(500);
        }
        finishOperation(-1, m_process->error());
    });
}

WirelessAdbController::~WirelessAdbController()
{
    if (m_process->state() != QProcess::NotRunning) {
        m_process->kill();
        m_process->waitForFinished(500);
    }
    clearSensitiveState();
}

WirelessAdbController::ValidationResult WirelessAdbController::validatePair(
    const QString &host, const QString &port, const QString &code)
{
    const ValidationResult addressResult = validateAddressAndPort(host, port);
    if (!addressResult.valid) {
        return addressResult;
    }
    static const QRegularExpression codePattern(QStringLiteral("^\\d{6}$"));
    if (!codePattern.match(code.trimmed()).hasMatch()) {
        return {false, QStringLiteral("配对码必须是 6 位数字")};
    }
    return {true, QString()};
}

WirelessAdbController::ValidationResult WirelessAdbController::validateConnect(
    const QString &host, const QString &port)
{
    return validateAddressAndPort(host, port);
}

WirelessAdbController::Invocation WirelessAdbController::pairInvocation(
    const QString &adbPath,
    const QString &host,
    const QString &port,
    const QString &code)
{
    return {adbPath,
            {QStringLiteral("pair"), endpoint(host, port)},
            code.trimmed().toUtf8() + '\n'};
}

WirelessAdbController::Invocation WirelessAdbController::connectInvocation(
    const QString &adbPath, const QString &host, const QString &port)
{
    return {adbPath,
            {QStringLiteral("connect"), endpoint(host, port)},
            QByteArray()};
}

bool WirelessAdbController::pair(const QString &host,
                                 const QString &port,
                                 const QString &code)
{
    if (m_busy || !validatePair(host, port, code).valid) {
        return false;
    }
    m_pairingCode = code.trimmed();
    return start(pairInvocation(m_adbPath, host, port, code), AdbAction::Pair, 30000);
}

bool WirelessAdbController::connectDevice(const QString &host, const QString &port)
{
    if (!validateConnect(host, port).valid) {
        return false;
    }
    return start(connectInvocation(m_adbPath, host, port), AdbAction::Connect, 15000);
}

bool WirelessAdbController::start(const Invocation &invocation,
                                  AdbAction action,
                                  int timeoutMs)
{
    if (m_busy) {
        return false;
    }

    m_action = action;
    m_standardInput = invocation.standardInput;
    m_standardOutput.clear();
    m_standardError.clear();
    m_timedOut = false;
    m_cancelled = false;
    m_busy = true;
    emit busyChanged(true);
    emit statusChanged(action == AdbAction::Pair
                           ? QStringLiteral("正在配对设备，请保持手机配对页面开启……")
                           : QStringLiteral("正在连接设备……"));

    m_process->setProgram(invocation.program);
    m_process->setArguments(invocation.arguments);
    m_process->start(QIODevice::ReadWrite);
    m_timer->start(timeoutMs);
    return true;
}

void WirelessAdbController::cancel()
{
    if (!m_busy) {
        return;
    }

    m_cancelled = true;
    m_timer->stop();
    m_process->terminate();
    if (!m_process->waitForFinished(500)) {
        m_process->kill();
        m_process->waitForFinished(500);
    }
    finishOperation(-1, m_process->error());
}

bool WirelessAdbController::isBusy() const
{
    return m_busy;
}

void WirelessAdbController::finishOperation(int exitCode,
                                            QProcess::ProcessError processError)
{
    if (!m_busy) {
        return;
    }

    m_timer->stop();
    m_standardOutput.append(m_process->readAllStandardOutput());
    m_standardError.append(m_process->readAllStandardError());
    const QString pairingCode = m_pairingCode;
    const AdbUserResult translated = AdbResultTranslator::translate(
        m_action,
        exitCode,
        processError,
        m_timedOut,
        m_cancelled,
        QString::fromLocal8Bit(m_standardOutput),
        QString::fromLocal8Bit(m_standardError),
        pairingCode);
    clearSensitiveState();
    m_busy = false;
    emit busyChanged(false);
    emit finished(translated);
}

void WirelessAdbController::clearSensitiveState()
{
    m_standardInput.fill('\0');
    m_standardInput.clear();
    m_pairingCode.fill(QChar('\0'));
    m_pairingCode.clear();
    m_standardOutput.clear();
    m_standardError.clear();
}
