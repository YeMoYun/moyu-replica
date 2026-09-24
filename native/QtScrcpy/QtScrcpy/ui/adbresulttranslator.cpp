// Modified for MoYuMaster.

#include "adbresulttranslator.h"

#include <QRegularExpression>

namespace {

AdbUserResult result(AdbResultCode code,
                     bool success,
                     const QString &message,
                     const QString &diagnostic)
{
    return {code, success, message, diagnostic};
}

bool containsAny(const QString &text, const QStringList &needles)
{
    for (const QString &needle : needles) {
        if (text.contains(needle, Qt::CaseInsensitive)) {
            return true;
        }
    }
    return false;
}

} // namespace

QString AdbResultTranslator::sanitizeDiagnostic(const QString &text,
                                                 const QString &pairingCode)
{
    QString sanitized = text;
    if (!pairingCode.isEmpty()) {
        sanitized.replace(pairingCode, QStringLiteral("******"), Qt::CaseSensitive);
    }

    const QRegularExpression pairingCodePattern(
        QStringLiteral("((?:pairing\\s+code)\\s*[:=]?\\s*)\\d{6}"),
        QRegularExpression::CaseInsensitiveOption);
    sanitized.replace(pairingCodePattern, QStringLiteral("\\1******"));
    return sanitized;
}

AdbUserResult AdbResultTranslator::translate(AdbAction action,
                                             int exitCode,
                                             QProcess::ProcessError processError,
                                             bool timedOut,
                                             bool cancelled,
                                             const QString &standardOutput,
                                             const QString &standardError,
                                             const QString &pairingCode)
{
    QStringList diagnosticParts;
    if (!standardOutput.trimmed().isEmpty()) {
        diagnosticParts.append(standardOutput);
    }
    if (!standardError.trimmed().isEmpty()) {
        diagnosticParts.append(standardError);
    }
    const QString diagnostic = sanitizeDiagnostic(
        diagnosticParts.join(QLatin1Char('\n')), pairingCode).trimmed();
    const QString combined = standardOutput + QLatin1Char('\n') + standardError;

    if (processError == QProcess::FailedToStart) {
        return result(AdbResultCode::AdbMissing, false,
                      QStringLiteral("无线调试组件缺失，请重新安装或修复摸鱼大师"), diagnostic);
    }
    if (cancelled) {
        return result(AdbResultCode::Cancelled, false,
                      QStringLiteral("操作已取消"), diagnostic);
    }
    if (timedOut) {
        if (action == AdbAction::Pair) {
            return result(AdbResultCode::PairTimedOut, false,
                          QStringLiteral("配对超时，请确认手机配对页面仍然开启"), diagnostic);
        }
        return result(AdbResultCode::NetworkUnreachable, false,
                      QStringLiteral("无法访问手机，请确认电脑与手机处于同一网络"), diagnostic);
    }

    if (action == AdbAction::Pair
        && containsAny(combined, {QStringLiteral("already paired")})) {
        return result(AdbResultCode::AlreadyPaired, true,
                      QStringLiteral("该设备已经配对，可以直接连接"), diagnostic);
    }
    if (action == AdbAction::Connect
        && containsAny(combined, {QStringLiteral("already connected")})) {
        return result(AdbResultCode::AlreadyConnected, true,
                      QStringLiteral("设备连接成功，设备列表已刷新"), diagnostic);
    }
    if (exitCode == 0) {
        if (action == AdbAction::Pair) {
            return result(AdbResultCode::PairSucceeded, true,
                          QStringLiteral("配对成功，请填写无线调试主页中的连接端口"), diagnostic);
        }
        return result(AdbResultCode::ConnectSucceeded, true,
                      QStringLiteral("设备连接成功，设备列表已刷新"), diagnostic);
    }

    if (containsAny(combined, {QStringLiteral("device offline"),
                               QStringLiteral("offline")})) {
        return result(AdbResultCode::DeviceOffline, false,
                      QStringLiteral("设备已离线，请重新连接"), diagnostic);
    }
    if (action == AdbAction::Pair
        && containsAny(combined, {QStringLiteral("unable to start pairing client"),
                                  QStringLiteral("wrong password"),
                                  QStringLiteral("failed to pair")})) {
        return result(AdbResultCode::InvalidPairingCode, false,
                      QStringLiteral("配对码不正确或已经失效，请在手机上重新生成"), diagnostic);
    }
    if (containsAny(combined, {QStringLiteral("connection refused"),
                               QStringLiteral("actively refused")})) {
        return result(AdbResultCode::ConnectionRefused, false,
                      QStringLiteral("手机拒绝连接，请确认无线调试仍然开启"), diagnostic);
    }
    if (containsAny(combined, {QStringLiteral("network is unreachable"),
                               QStringLiteral("no route to host"),
                               QStringLiteral("connection timed out"),
                               QStringLiteral("cannot reach")})) {
        return result(AdbResultCode::NetworkUnreachable, false,
                      QStringLiteral("无法访问手机，请确认电脑与手机处于同一网络"), diagnostic);
    }
    if (containsAny(combined, {QStringLiteral("bad port"),
                               QStringLiteral("invalid port"),
                               QStringLiteral("missing port")})) {
        return result(AdbResultCode::InvalidConnectPort, false,
                      QStringLiteral("连接端口无效，请填写无线调试主页显示的端口"), diagnostic);
    }

    return result(AdbResultCode::UnknownFailure, false,
                  QStringLiteral("操作失败，请重试；如仍失败，可复制诊断信息"), diagnostic);
}
