#ifndef MOYUIPCBRIDGE_H
#define MOYUIPCBRIDGE_H
// Modified for MoYuMaster: authenticated local IPC with the Electron parent.

#include <QByteArray>
#include <QObject>
#include <QString>

class QLocalSocket;

class MoyuIpcBridge : public QObject
{
    Q_OBJECT

public:
    explicit MoyuIpcBridge(const QString &serverName,
                           const QByteArray &token,
                           QObject *parent = nullptr);
    static MoyuIpcBridge *fromEnvironment(QObject *parent = nullptr);

    static QString parseMessage(const QByteArray &line,
                                const QByteArray &expectedToken);
    static QByteArray encodeMessage(const QByteArray &token,
                                    const QString &type);

    void start();

public slots:
    void requestMainAppFocus();

signals:
    void focusQtScrcpyRequested();
    void bossHideRequested();
    void bossShowRequested();
    void shutdownRequested();

private slots:
    void connectToServer();
    void onConnected();
    void onReadyRead();
    void onSocketError();

private:
    void send(const QString &type);

    QString m_serverName;
    QByteArray m_token;
    QLocalSocket *m_socket = nullptr;
    QByteArray m_buffer;
    int m_connectAttempts = 0;
    bool m_started = false;
    bool m_retryScheduled = false;
};

#endif // MOYUIPCBRIDGE_H
