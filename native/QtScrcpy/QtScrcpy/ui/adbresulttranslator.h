// Modified for MoYuMaster.
#pragma once

#include <QProcess>
#include <QString>

enum class AdbAction
{
    Pair,
    Connect
};

enum class AdbResultCode
{
    PairSucceeded,
    AlreadyPaired,
    ConnectSucceeded,
    AlreadyConnected,
    InvalidPairingCode,
    PairTimedOut,
    NetworkUnreachable,
    InvalidConnectPort,
    ConnectionRefused,
    DeviceOffline,
    AdbMissing,
    Cancelled,
    UnknownFailure
};

struct AdbUserResult
{
    AdbResultCode code = AdbResultCode::UnknownFailure;
    bool success = false;
    QString message;
    QString diagnostic;
};

class AdbResultTranslator
{
public:
    static AdbUserResult translate(AdbAction action,
                                   int exitCode,
                                   QProcess::ProcessError processError,
                                   bool timedOut,
                                   bool cancelled,
                                   const QString &standardOutput,
                                   const QString &standardError,
                                   const QString &pairingCode = QString());
    static QString sanitizeDiagnostic(const QString &diagnostic,
                                      const QString &pairingCode);
};
