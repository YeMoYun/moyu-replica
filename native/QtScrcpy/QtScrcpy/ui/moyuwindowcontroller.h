// Modified for MoYuMaster: shared native window state without saved positions.
#pragma once

#include <QObject>
#include <QRect>
#include <QString>

#include <functional>

class MoyuControlBar;
class QSettings;
class QTimer;
class QToolButton;
class QWidget;
class QEvent;

class MoyuWindowController : public QObject
{
    Q_OBJECT

public:
    MoyuWindowController(QWidget *window,
                         MoyuControlBar *bar,
                         QString stateKey,
                         QObject *parent = nullptr);
    void setStateKey(const QString &stateKey);
    void restoreAndPresent();
    void setInteractionSuspended(bool suspended);
    void setFitAction(std::function<void()> action);
    void setFullscreenAction(std::function<void()> action);

protected:
    bool eventFilter(QObject *watched, QEvent *event) override;

private:
    QString prefix() const;
    void saveState();
    void setTopmost(bool enabled);
    void setOpacity(qreal opacity);
    void setAutoHide(bool enabled);
    void setLightToolbar(bool enabled);
    void setCollapsed(bool collapsed);
    void toggleFullscreen();
    void applyAutoHide();

    QWidget *m_window = nullptr;
    MoyuControlBar *m_bar = nullptr;
    QString m_stateKey;
    QSettings *m_settings = nullptr;
    QTimer *m_autoHideTimer = nullptr;
    QToolButton *m_recoveryButton = nullptr;
    std::function<void()> m_fitAction;
    std::function<void()> m_fullscreenAction;
    QRect m_normalGeometry;
    qreal m_opacity = 1.0;
    bool m_topmost = false;
    bool m_autoHide = false;
    bool m_lightToolbar = false;
    bool m_interactionSuspended = false;
    bool m_restoring = false;
    bool m_internalFullscreen = false;
    bool m_barVisibleBeforeFullscreen = true;
};
