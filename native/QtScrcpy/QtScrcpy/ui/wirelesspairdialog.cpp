// Modified for MoYuMaster: native wireless pairing without USB or console UI.

#include "wirelesspairdialog.h"

#include "wirelessadbcontroller.h"

#include <QFormLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QRegularExpression>
#include <QRegularExpressionValidator>
#include <QSettings>
#include <QStackedWidget>
#include <QStyle>
#include <QToolButton>
#include <QVBoxLayout>

namespace {

QLineEdit *createLineEdit(const char *objectName, QWidget *parent)
{
    auto *edit = new QLineEdit(parent);
    edit->setObjectName(QString::fromLatin1(objectName));
    edit->setClearButtonEnabled(true);
    return edit;
}

QPushButton *createButton(const QString &text, const char *objectName, QWidget *parent)
{
    auto *button = new QPushButton(text, parent);
    button->setObjectName(QString::fromLatin1(objectName));
    return button;
}

} // namespace

WirelessPairDialog::WirelessPairDialog(WirelessAdbController *controller,
                                       QSettings *settings,
                                       QWidget *parent)
    : QDialog(parent)
    , m_controller(controller)
    , m_settings(settings)
{
    Q_ASSERT(m_controller);
    Q_ASSERT(m_settings);

    setWindowTitle(QStringLiteral("无线连接手机"));
    setMinimumSize(520, 430);
    setModal(true);

    auto *rootLayout = new QVBoxLayout(this);
    rootLayout->setContentsMargins(24, 22, 24, 20);
    rootLayout->setSpacing(14);

    auto *title = new QLabel(QStringLiteral("手机投屏模式"), this);
    title->setStyleSheet(QStringLiteral("font-size: 20px; font-weight: 700;"));
    rootLayout->addWidget(title);

    auto *warning = new QLabel(QStringLiteral("配对端口与连接端口可能不同"), this);
    warning->setWordWrap(true);
    warning->setStyleSheet(QStringLiteral(
        "padding: 9px 12px; border-radius: 6px; color: #8a5a00; background: #fff3cd;"));
    rootLayout->addWidget(warning);

    m_pages = new QStackedWidget(this);
    rootLayout->addWidget(m_pages, 1);

    auto *pairPage = new QWidget(m_pages);
    auto *pairLayout = new QVBoxLayout(pairPage);
    pairLayout->setContentsMargins(0, 0, 0, 0);
    pairLayout->setSpacing(12);
    auto *pairHint = new QLabel(
        QStringLiteral("在手机的“无线调试 → 使用配对码配对设备”中填写以下信息。"), pairPage);
    pairHint->setWordWrap(true);
    pairLayout->addWidget(pairHint);
    auto *pairForm = new QFormLayout;
    pairForm->setFieldGrowthPolicy(QFormLayout::AllNonFixedFieldsGrow);
    m_pairHostEdit = createLineEdit("pairHostEdit", pairPage);
    m_pairHostEdit->setPlaceholderText(QStringLiteral("例如 192.168.1.20"));
    m_pairPortEdit = createLineEdit("pairPortEdit", pairPage);
    m_pairPortEdit->setPlaceholderText(QStringLiteral("配对页面显示的端口"));
    m_pairPortEdit->setMaxLength(5);
    m_pairPortEdit->setValidator(new QRegularExpressionValidator(
        QRegularExpression(QStringLiteral("\\d{0,5}")), m_pairPortEdit));
    m_pairCodeEdit = createLineEdit("pairCodeEdit", pairPage);
    m_pairCodeEdit->setPlaceholderText(QStringLiteral("6 位配对码"));
    m_pairCodeEdit->setMaxLength(6);
    m_pairCodeEdit->setEchoMode(QLineEdit::Password);
    m_pairCodeEdit->setValidator(new QRegularExpressionValidator(
        QRegularExpression(QStringLiteral("\\d{0,6}")), m_pairCodeEdit));
    m_showCodeButton = new QToolButton(pairPage);
    m_showCodeButton->setObjectName(QStringLiteral("showPairCodeButton"));
    m_showCodeButton->setText(QStringLiteral("显示"));
    m_showCodeButton->setCheckable(true);
    auto *codeRow = new QWidget(pairPage);
    auto *codeLayout = new QHBoxLayout(codeRow);
    codeLayout->setContentsMargins(0, 0, 0, 0);
    codeLayout->addWidget(m_pairCodeEdit, 1);
    codeLayout->addWidget(m_showCodeButton);
    pairForm->addRow(QStringLiteral("手机 IP"), m_pairHostEdit);
    pairForm->addRow(QStringLiteral("配对端口"), m_pairPortEdit);
    pairForm->addRow(QStringLiteral("配对码"), codeRow);
    pairLayout->addLayout(pairForm);
    pairLayout->addStretch();
    auto *pairActions = new QHBoxLayout;
    m_skipPairButton = createButton(QStringLiteral("我已配对，直接连接"),
                                    "skipPairButton", pairPage);
    m_pairButton = createButton(QStringLiteral("开始配对"), "pairButton", pairPage);
    m_pairButton->setDefault(true);
    pairActions->addWidget(m_skipPairButton);
    pairActions->addStretch();
    pairActions->addWidget(m_pairButton);
    pairLayout->addLayout(pairActions);
    m_pages->addWidget(pairPage);

    auto *connectPage = new QWidget(m_pages);
    auto *connectLayout = new QVBoxLayout(connectPage);
    connectLayout->setContentsMargins(0, 0, 0, 0);
    connectLayout->setSpacing(12);
    auto *connectHint = new QLabel(
        QStringLiteral("返回无线调试主页，填写当前显示的 IP 地址与连接端口。"), connectPage);
    connectHint->setWordWrap(true);
    connectLayout->addWidget(connectHint);
    auto *connectForm = new QFormLayout;
    connectForm->setFieldGrowthPolicy(QFormLayout::AllNonFixedFieldsGrow);
    m_connectHostEdit = createLineEdit("connectHostEdit", connectPage);
    m_connectHostEdit->setPlaceholderText(QStringLiteral("例如 192.168.1.20"));
    m_connectPortEdit = createLineEdit("connectPortEdit", connectPage);
    m_connectPortEdit->setPlaceholderText(QStringLiteral("无线调试主页显示的连接端口"));
    m_connectPortEdit->setMaxLength(5);
    m_connectPortEdit->setValidator(new QRegularExpressionValidator(
        QRegularExpression(QStringLiteral("\\d{0,5}")), m_connectPortEdit));
    connectForm->addRow(QStringLiteral("手机 IP"), m_connectHostEdit);
    connectForm->addRow(QStringLiteral("连接端口"), m_connectPortEdit);
    connectLayout->addLayout(connectForm);
    connectLayout->addStretch();
    auto *connectActions = new QHBoxLayout;
    m_backButton = createButton(QStringLiteral("返回重新配对"), "backToPairButton", connectPage);
    m_connectButton = createButton(QStringLiteral("连接设备"), "connectButton", connectPage);
    m_finishButton = createButton(QStringLiteral("完成"), "finishButton", connectPage);
    m_finishButton->setEnabled(false);
    connectActions->addWidget(m_backButton);
    connectActions->addStretch();
    connectActions->addWidget(m_connectButton);
    connectActions->addWidget(m_finishButton);
    connectLayout->addLayout(connectActions);
    m_pages->addWidget(connectPage);

    m_statusLabel = new QLabel(this);
    m_statusLabel->setObjectName(QStringLiteral("wirelessStatusLabel"));
    m_statusLabel->setWordWrap(true);
    m_statusLabel->setProperty("state", "normal");
    m_statusLabel->setStyleSheet(QStringLiteral(
        "QLabel { padding: 8px 10px; border-radius: 5px; }"
        "QLabel[state='normal'] { color: #46515f; background: #eef2f6; }"
        "QLabel[state='working'] { color: #1458b3; background: #e8f1ff; }"
        "QLabel[state='success'] { color: #14733b; background: #e7f7ed; }"
        "QLabel[state='error'] { color: #a12622; background: #fdebea; }"));
    showStatus(QStringLiteral("请输入手机无线调试信息"), "normal");
    rootLayout->addWidget(m_statusLabel);

    m_diagnosticToggle = new QToolButton(this);
    m_diagnosticToggle->setObjectName(QStringLiteral("diagnosticToggle"));
    m_diagnosticToggle->setText(QStringLiteral("诊断信息"));
    m_diagnosticToggle->setCheckable(true);
    m_diagnosticToggle->setToolButtonStyle(Qt::ToolButtonTextBesideIcon);
    m_diagnosticToggle->setArrowType(Qt::RightArrow);
    rootLayout->addWidget(m_diagnosticToggle, 0, Qt::AlignLeft);
    m_diagnosticEdit = new QPlainTextEdit(this);
    m_diagnosticEdit->setObjectName(QStringLiteral("diagnosticEdit"));
    m_diagnosticEdit->setReadOnly(true);
    m_diagnosticEdit->setMaximumHeight(95);
    m_diagnosticEdit->hide();
    rootLayout->addWidget(m_diagnosticEdit);

    auto *closeButton = createButton(QStringLiteral("关闭"), "closeDialogButton", this);
    auto *closeLayout = new QHBoxLayout;
    closeLayout->addStretch();
    closeLayout->addWidget(closeButton);
    rootLayout->addLayout(closeLayout);

    const QString lastIp = m_settings->value(QStringLiteral("moyu/wireless/lastIp")).toString();
    m_pairHostEdit->setText(lastIp);
    m_connectHostEdit->setText(lastIp);

    connect(m_showCodeButton, &QToolButton::toggled, this, [this](bool visible) {
        m_pairCodeEdit->setEchoMode(visible ? QLineEdit::Normal : QLineEdit::Password);
        m_showCodeButton->setText(visible ? QStringLiteral("隐藏") : QStringLiteral("显示"));
    });
    connect(m_diagnosticToggle, &QToolButton::toggled, this, [this](bool visible) {
        m_diagnosticEdit->setVisible(visible);
        m_diagnosticToggle->setArrowType(visible ? Qt::DownArrow : Qt::RightArrow);
        adjustSize();
    });
    connect(m_skipPairButton, &QPushButton::clicked, this, [this]() {
        proceedToConnect();
        showStatus(QStringLiteral("请输入无线调试主页中的连接端口"), "normal");
    });
    connect(m_backButton, &QPushButton::clicked, this, [this]() {
        m_finishButton->setEnabled(false);
        setStep(Step::Pair);
        showStatus(QStringLiteral("请输入手机无线调试信息"), "normal");
    });
    connect(m_pairButton, &QPushButton::clicked, this, [this]() {
        const auto validation = WirelessAdbController::validatePair(
            m_pairHostEdit->text(), m_pairPortEdit->text(), m_pairCodeEdit->text());
        if (!validation.valid) {
            showStatus(validation.message, "error");
            return;
        }
        if (!m_controller->pair(m_pairHostEdit->text(),
                                m_pairPortEdit->text(),
                                m_pairCodeEdit->text())) {
            showStatus(QStringLiteral("已有无线调试操作正在进行"), "error");
        }
    });
    connect(m_connectButton, &QPushButton::clicked, this, [this]() {
        const auto validation = WirelessAdbController::validateConnect(
            m_connectHostEdit->text(), m_connectPortEdit->text());
        if (!validation.valid) {
            showStatus(validation.message, "error");
            return;
        }
        if (!m_controller->connectDevice(m_connectHostEdit->text(),
                                         m_connectPortEdit->text())) {
            showStatus(QStringLiteral("已有无线调试操作正在进行"), "error");
        }
    });
    connect(m_finishButton, &QPushButton::clicked, this, &QDialog::accept);
    connect(closeButton, &QPushButton::clicked, this, &WirelessPairDialog::reject);
    connect(m_controller, &WirelessAdbController::busyChanged,
            this, &WirelessPairDialog::setBusy);
    connect(m_controller, &WirelessAdbController::statusChanged, this,
            [this](const QString &message) { showStatus(message, "working"); });
    connect(m_controller, &WirelessAdbController::finished, this,
            [this](const AdbUserResult &result) {
                m_diagnosticEdit->setPlainText(result.diagnostic);
                if (!result.success) {
                    showStatus(result.message, "error");
                    return;
                }

                if (result.code == AdbResultCode::PairSucceeded
                    || result.code == AdbResultCode::AlreadyPaired) {
                    m_pairCodeEdit->clear();
                    m_settings->setValue(QStringLiteral("moyu/wireless/lastIp"),
                                         m_pairHostEdit->text().trimmed());
                    proceedToConnect();
                    showStatus(result.message, "success");
                    return;
                }

                m_settings->setValue(QStringLiteral("moyu/wireless/lastIp"),
                                     m_connectHostEdit->text().trimmed());
                m_finishButton->setEnabled(true);
                showStatus(result.message, "success");
                emit connectionSucceeded();
            });

    setStep(Step::Pair);
}

WirelessPairDialog::Step WirelessPairDialog::currentStep() const
{
    return m_step;
}

void WirelessPairDialog::reject()
{
    m_controller->cancel();
    m_pairCodeEdit->clear();
    QDialog::reject();
}

void WirelessPairDialog::setStep(Step step)
{
    m_step = step;
    m_pages->setCurrentIndex(step == Step::Pair ? 0 : 1);
}

void WirelessPairDialog::setBusy(bool busy)
{
    const QList<QWidget *> disabledWhileBusy = {
        m_pairHostEdit, m_pairPortEdit, m_pairCodeEdit, m_showCodeButton,
        m_pairButton, m_skipPairButton, m_connectHostEdit, m_connectPortEdit,
        m_backButton, m_connectButton, m_finishButton
    };
    for (QWidget *widget : disabledWhileBusy) {
        widget->setEnabled(!busy);
    }
    if (!busy && m_step == Step::Connect
        && m_statusLabel->property("state").toString() != QStringLiteral("success")) {
        m_finishButton->setEnabled(false);
    }
}

void WirelessPairDialog::showStatus(const QString &message, const char *state)
{
    m_statusLabel->setText(message);
    m_statusLabel->setProperty("state", QString::fromLatin1(state));
    m_statusLabel->style()->unpolish(m_statusLabel);
    m_statusLabel->style()->polish(m_statusLabel);
}

void WirelessPairDialog::proceedToConnect()
{
    const QString currentIp = m_pairHostEdit->text().trimmed().isEmpty()
        ? m_settings->value(QStringLiteral("moyu/wireless/lastIp")).toString()
        : m_pairHostEdit->text().trimmed();
    m_connectHostEdit->setText(currentIp);
    m_connectPortEdit->clear();
    m_finishButton->setEnabled(false);
    setStep(Step::Connect);
}
