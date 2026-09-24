// Modified for MoYuMaster: authenticated local IPC with the Electron parent.

#include "moyuipcbridge.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalSocket>
#include <QSet>
#include <QTimer>

namespace {
const QSet<QString> kIncomingTypes = {
    QStringLiteral("focus-qtscrcpy-main"),
    QStringLiteral("boss-hide"),
    QStringLiteral("boss-show"),
    QStringLiteral("shutdown")
};

const QSet<QString> kOutgoingTypes = {
    QStringLiteral("ready"),
    QStringLiteral("focus-main-app")
};

QString qtServerName(QString value)
{
#ifdef Q_OS_WIN
    const QString prefix = QStringLiteral("\\\\.\\pipe\\");
    if (value.startsWith(prefix)) {
        value.remove(0, prefix.size());
    }
#endif
    return value;
}
}

MoyuIpcBridge::MoyuIpcBridge(const QString &serverName,
                             const QByteArray &token,
                             QObject *parent)
    : QObject(parent)
    , m_serverName(qtServerName(serverName))
    , m_token(token)
    , m_socket(new QLocalSocket(this))
{
    connect(m_socket, &QLocalSocket::connected,
            this, &MoyuIpcBridge::onConnected);
    connect(m_socket, &QLocalSocket::readyRead,
            this, &MoyuIpcBridge::onReadyRead);
    connect(m_socket, &QLocalSocket::errorOccurred,
            this, &MoyuIpcBridge::onSocketError);
}

MoyuIpcBridge *MoyuIpcBridge::fromEnvironment(QObject *parent)
{
    const QByteArray pipe = qgetenv("MOYU_IPC_PIPE");
    const QByteArray token = qgetenv("MOYU_IPC_TOKEN");
    if (pipe.isEmpty() || token.isEmpty()) {
        return nullptr;
    }
    return new MoyuIpcBridge(QString::fromLocal8Bit(pipe), token, parent);
}

QString MoyuIpcBridge::parseMessage(const QByteArray &line,
                                    const QByteArray &expectedToken)
{
    QJsonParseError error;
    const QJsonDocument document = QJsonDocument::fromJson(line, &error);
    if (error.error != QJsonParseError::NoError || !document.isObject()) {
        return QString();
    }
    const QJsonObject object = document.object();
    if (object.value(QStringLiteral("token")).toString().toUtf8() != expectedToken) {
        return QString();
    }
    const QString type = object.value(QStringLiteral("type")).toString();
    return kIncomingTypes.contains(type) ? type : QString();
}

QByteArray MoyuIpcBridge::encodeMessage(const QByteArray &token,
                                        const QString &type)
{
    if (token.isEmpty() || !kOutgoingTypes.contains(type)) {
        return QByteArray();
    }
    QJsonObject object;
    object.insert(QStringLiteral("token"), QString::fromUtf8(token));
    object.insert(QStringLiteral("type"), type);
    return QJsonDocument(object).toJson(QJsonDocument::Compact) + '\n';
}

void MoyuIpcBridge::start()
{
    if (m_started || m_serverName.isEmpty() || m_token.isEmpty()) {
        return;
    }
    m_started = true;
    connectToServer();
}

void MoyuIpcBridge::requestMainAppFocus()
{
    send(QStringLiteral("focus-main-app"));
}

void MoyuIpcBridge::connectToServer()
{
    m_retryScheduled = false;
    if (!m_started || m_socket->state() != QLocalSocket::UnconnectedState) {
        return;
    }
    ++m_connectAttempts;
    m_socket->connectToServer(m_serverName, QIODevice::ReadWrite);
}

void MoyuIpcBridge::onConnected()
{
    m_connectAttempts = 0;
    m_retryScheduled = false;
    send(QStringLiteral("ready"));
}

void MoyuIpcBridge::onReadyRead()
{
    m_buffer += m_socket->readAll();
    for (;;) {
        const int newline = m_buffer.indexOf('\n');
        if (newline < 0) {
            break;
        }
        const QByteArray line = m_buffer.left(newline);
        m_buffer.remove(0, newline + 1);
        const QString type = parseMessage(line, m_token);
        if (type == QStringLiteral("focus-qtscrcpy-main")) {
            emit focusQtScrcpyRequested();
        } else if (type == QStringLiteral("boss-hide")) {
            emit bossHideRequested();
        } else if (type == QStringLiteral("boss-show")) {
            emit bossShowRequested();
        } else if (type == QStringLiteral("shutdown")) {
            emit shutdownRequested();
        }
    }
}

void MoyuIpcBridge::onSocketError()
{
    if (!m_started || m_connectAttempts >= 10 || m_retryScheduled) {
        return;
    }
    m_retryScheduled = true;
    QTimer::singleShot(250, this, &MoyuIpcBridge::connectToServer);
}

void MoyuIpcBridge::send(const QString &type)
{
    if (m_socket->state() != QLocalSocket::ConnectedState) {
        return;
    }
    const QByteArray payload = encodeMessage(m_token, type);
    if (!payload.isEmpty()) {
        m_socket->write(payload);
    }
}
