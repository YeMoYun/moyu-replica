// Modified for MoYuMaster: native wireless pairing without USB or console UI.
#pragma once

#include "adbresulttranslator.h"

#include <QByteArray>
#include <QObject>
#include <QString>
#include <QStringList>

class QProcess;
class QTimer;

class WirelessAdbController : public QObject
{
    Q_OBJECT

public:
    struct ValidationResult {
        bool valid;
        QString message;
    };

    struct Invocation {
        QString program;
        QStringList arguments;
        QByteArray standardInput;
    };

    explicit WirelessAdbController(QString adbPath, QObject *parent = nullptr);
    ~WirelessAdbController() override;
    static ValidationResult validatePair(const QString &host,
                                         const QString &port,
                                         const QString &code);
    static ValidationResult validateConnect(const QString &host,
                                            const QString &port);
    static Invocation pairInvocation(const QString &adbPath,
                                     const QString &host,
                                     const QString &port,
                                     const QString &code);
    static Invocation connectInvocation(const QString &adbPath,
                                        const QString &host,
                                        const QString &port);
    bool pair(const QString &host, const QString &port, const QString &code);
    bool connectDevice(const QString &host, const QString &port);
    void cancel();
    bool isBusy() const;

signals:
    void busyChanged(bool busy);
    void statusChanged(const QString &message);
    void finished(const AdbUserResult &result);

private:
    bool start(const Invocation &invocation, AdbAction action, int timeoutMs);
    void finishOperation(int exitCode, QProcess::ProcessError processError);
    void clearSensitiveState();

    QString m_adbPath;
    QProcess *m_process = nullptr;
    QTimer *m_timer = nullptr;
    AdbAction m_action = AdbAction::Connect;
    QByteArray m_standardInput;
    QByteArray m_standardOutput;
    QByteArray m_standardError;
    QString m_pairingCode;
    bool m_busy = false;
    bool m_timedOut = false;
    bool m_cancelled = false;
};
