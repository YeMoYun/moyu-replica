// Modified for MoYuMaster: native wireless pairing without USB or console UI.
#pragma once

#include <QDialog>

class QSettings;
class QLabel;
class QLineEdit;
class QPlainTextEdit;
class QPushButton;
class QStackedWidget;
class QToolButton;
class WirelessAdbController;

class WirelessPairDialog : public QDialog
{
    Q_OBJECT

public:
    enum class Step { Pair, Connect };

    WirelessPairDialog(WirelessAdbController *controller,
                       QSettings *settings,
                       QWidget *parent = nullptr);
    Step currentStep() const;

signals:
    void connectionSucceeded();

public slots:
    void reject() override;

private:
    void setStep(Step step);
    void setBusy(bool busy);
    void showStatus(const QString &message, const char *state);
    void proceedToConnect();

    WirelessAdbController *m_controller = nullptr;
    QSettings *m_settings = nullptr;
    Step m_step = Step::Pair;
    QStackedWidget *m_pages = nullptr;
    QLineEdit *m_pairHostEdit = nullptr;
    QLineEdit *m_pairPortEdit = nullptr;
    QLineEdit *m_pairCodeEdit = nullptr;
    QToolButton *m_showCodeButton = nullptr;
    QPushButton *m_pairButton = nullptr;
    QPushButton *m_skipPairButton = nullptr;
    QLineEdit *m_connectHostEdit = nullptr;
    QLineEdit *m_connectPortEdit = nullptr;
    QPushButton *m_backButton = nullptr;
    QPushButton *m_connectButton = nullptr;
    QPushButton *m_finishButton = nullptr;
    QLabel *m_statusLabel = nullptr;
    QToolButton *m_diagnosticToggle = nullptr;
    QPlainTextEdit *m_diagnosticEdit = nullptr;
};
