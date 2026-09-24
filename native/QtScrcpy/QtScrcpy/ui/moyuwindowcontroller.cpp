// Modified for MoYuMaster: shared native window state without saved positions.

#include "moyuwindowcontroller.h"

#include "moyucontrolbar.h"

#include <QCursor>
#include <QEvent>
#include <QGuiApplication>
#include <QScreen>
#include <QSettings>
#include <QTimer>
#include <QToolButton>
#include <QWidget>

MoyuWindowController::MoyuWindowController(QWidget *window,
                                           MoyuControlBar *bar,
                                           QString stateKey,
                                           QObject *parent)
    : QObject(parent)
    , m_window(window)
    , m_bar(bar)
    , m_stateKey(std::move(stateKey))
    , m_settings(new QSettings(this))
    , m_autoHideTimer(new QTimer(this))
    , m_recoveryButton(new QToolButton(window))
{
    Q_ASSERT(m_window);
    Q_ASSERT(m_bar);
    m_window->installEventFilter(this);
    m_autoHideTimer->setInterval(150);
    m_recoveryButton->setObjectName(QStringLiteral("moyuBarRecoveryButton"));
    m_recoveryButton->setText(QStringLiteral("›"));
    m_recoveryButton->setToolTip(QStringLiteral("展开工具栏"));
    m_recoveryButton->setFixedSize(22, 22);
    m_recoveryButton->move(4, 4);
    m_recoveryButton->hide();
    m_recoveryButton->raise();

    connect(m_bar, &MoyuControlBar::closeRequested, m_window, &QWidget::close);
    connect(m_bar, &MoyuControlBar::topmostToggled,
            this, &MoyuWindowController::setTopmost);
    connect(m_bar, &MoyuControlBar::fitRequested, this, [this]() {
        if (m_fitAction) {
            m_fitAction();
        }
    });
    connect(m_bar, &MoyuControlBar::opacityRequested, this, [this]() {
        setOpacity(m_bar->opacityPercent() / 100.0);
    });
    connect(m_bar, &MoyuControlBar::autoHideToggled,
            this, &MoyuWindowController::setAutoHide);
    connect(m_bar, &MoyuControlBar::appearanceRequested, this, [this]() {
        setLightToolbar(m_bar->lightToolbar());
    });
    connect(m_bar, &MoyuControlBar::collapseRequested, this, [this]() {
        setCollapsed(true);
    });
    connect(m_bar, &MoyuControlBar::fullscreenRequested, this, [this]() {
        if (m_fullscreenAction) {
            m_fullscreenAction();
        } else {
            toggleFullscreen();
        }
    });
    connect(m_recoveryButton, &QToolButton::clicked, this, [this]() {
        setCollapsed(false);
    });
    connect(m_autoHideTimer, &QTimer::timeout,
            this, &MoyuWindowController::applyAutoHide);
}

void MoyuWindowController::setStateKey(const QString &stateKey)
{
    m_stateKey = stateKey;
}

QString MoyuWindowController::prefix() const
{
    return QStringLiteral("moyu/windows/%1").arg(m_stateKey);
}

void MoyuWindowController::restoreAndPresent()
{
    m_restoring = true;
    QScreen *screen = QGuiApplication::screenAt(QCursor::pos());
    if (!screen) {
        screen = QGuiApplication::primaryScreen();
    }
    const QRect available = screen ? screen->availableGeometry() : QRect(0, 0, 1280, 720);
    QSize savedSize = m_settings->value(prefix() + QStringLiteral("/size"),
                                        m_window->size()).toSize();
    savedSize.setWidth(qBound(qMax(1, m_window->minimumWidth()),
                              savedSize.width(), available.width()));
    savedSize.setHeight(qBound(qMax(1, m_window->minimumHeight()),
                               savedSize.height(), available.height()));

    m_opacity = qBound(0.2,
                       m_settings->value(prefix() + QStringLiteral("/opacity"), 1.0).toReal(),
                       1.0);
    m_topmost = m_settings->value(prefix() + QStringLiteral("/topmost"), false).toBool();
    m_autoHide = m_settings->value(prefix() + QStringLiteral("/autoHide"), false).toBool();
    m_lightToolbar = m_settings->value(prefix() + QStringLiteral("/lightToolbar"), false).toBool();

    m_window->setWindowFlag(Qt::WindowStaysOnTopHint, m_topmost);
    m_window->resize(savedSize);
    m_window->move(available.left() + (available.width() - savedSize.width()) / 2,
                   available.top() + (available.height() - savedSize.height()) / 2);
    m_window->setWindowOpacity(m_opacity);
    m_bar->setOpacityPercent(qRound(m_opacity * 100.0));
    m_bar->setTopmostChecked(m_topmost);
    m_bar->setAutoHideChecked(m_autoHide);
    m_bar->setLightToolbar(m_lightToolbar);
    if (m_autoHide) {
        m_autoHideTimer->start();
    } else {
        m_autoHideTimer->stop();
    }
    m_window->showNormal();
    m_window->raise();
    m_window->activateWindow();
    m_restoring = false;
}

void MoyuWindowController::setInteractionSuspended(bool suspended)
{
    m_interactionSuspended = suspended;
    if (suspended) {
        m_window->setWindowOpacity(m_opacity);
    }
}

void MoyuWindowController::setFitAction(std::function<void()> action)
{
    m_fitAction = std::move(action);
}

void MoyuWindowController::setFullscreenAction(std::function<void()> action)
{
    m_fullscreenAction = std::move(action);
}

bool MoyuWindowController::eventFilter(QObject *watched, QEvent *event)
{
    if (watched == m_window) {
        if (event->type() == QEvent::Resize && !m_restoring && !m_internalFullscreen) {
            m_settings->setValue(prefix() + QStringLiteral("/size"), m_window->size());
        } else if (event->type() == QEvent::Close) {
            saveState();
        } else if (event->type() == QEvent::Show || event->type() == QEvent::Resize) {
            m_recoveryButton->move(4, 4);
            m_recoveryButton->raise();
        }
    }
    return QObject::eventFilter(watched, event);
}

void MoyuWindowController::saveState()
{
    if (!m_internalFullscreen) {
        m_settings->setValue(prefix() + QStringLiteral("/size"), m_window->size());
    }
    m_settings->setValue(prefix() + QStringLiteral("/opacity"), m_opacity);
    m_settings->setValue(prefix() + QStringLiteral("/topmost"), m_topmost);
    m_settings->setValue(prefix() + QStringLiteral("/autoHide"), m_autoHide);
    m_settings->setValue(prefix() + QStringLiteral("/lightToolbar"), m_lightToolbar);
}

void MoyuWindowController::setTopmost(bool enabled)
{
    const QRect geometry = m_window->geometry();
    const bool visible = m_window->isVisible();
    m_topmost = enabled;
    m_window->setWindowFlag(Qt::WindowStaysOnTopHint, enabled);
    if (visible) {
        m_window->show();
    }
    m_window->setGeometry(geometry);
    m_window->raise();
    m_settings->setValue(prefix() + QStringLiteral("/topmost"), enabled);
}

void MoyuWindowController::setOpacity(qreal opacity)
{
    m_opacity = qBound(0.2, opacity, 1.0);
    if (!m_autoHide || m_interactionSuspended
        || m_window->frameGeometry().contains(QCursor::pos())) {
        m_window->setWindowOpacity(m_opacity);
    }
    m_settings->setValue(prefix() + QStringLiteral("/opacity"), m_opacity);
}

void MoyuWindowController::setAutoHide(bool enabled)
{
    m_autoHide = enabled;
    if (enabled) {
        m_autoHideTimer->start();
        applyAutoHide();
    } else {
        m_autoHideTimer->stop();
        m_window->setWindowOpacity(m_opacity);
    }
    m_settings->setValue(prefix() + QStringLiteral("/autoHide"), enabled);
}

void MoyuWindowController::setLightToolbar(bool enabled)
{
    m_lightToolbar = enabled;
    m_bar->setLightToolbar(enabled);
    m_settings->setValue(prefix() + QStringLiteral("/lightToolbar"), enabled);
}

void MoyuWindowController::setCollapsed(bool collapsed)
{
    m_bar->setVisible(!collapsed);
    m_recoveryButton->setVisible(collapsed);
    if (collapsed) {
        m_recoveryButton->raise();
    }
}

void MoyuWindowController::toggleFullscreen()
{
    if (!m_internalFullscreen) {
        m_normalGeometry = m_window->geometry();
        m_barVisibleBeforeFullscreen = m_bar->isVisible();
        m_internalFullscreen = true;
        m_bar->hide();
        m_recoveryButton->hide();
        m_window->showFullScreen();
        return;
    }

    m_window->showNormal();
    m_window->setGeometry(m_normalGeometry);
    m_internalFullscreen = false;
    m_bar->setVisible(m_barVisibleBeforeFullscreen);
    m_recoveryButton->setVisible(!m_barVisibleBeforeFullscreen);
}

void MoyuWindowController::applyAutoHide()
{
    if (!m_autoHide || m_interactionSuspended) {
        m_window->setWindowOpacity(m_opacity);
        return;
    }
    const bool inside = m_window->frameGeometry().contains(QCursor::pos());
    m_window->setWindowOpacity(inside ? m_opacity : 0.02);
}
