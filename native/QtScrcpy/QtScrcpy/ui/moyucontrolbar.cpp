// Modified for MoYuMaster: shared native window controls.

#include "moyucontrolbar.h"

#include <QAction>
#include <QActionGroup>
#include <QFont>
#include <QHBoxLayout>
#include <QLabel>
#include <QMenu>
#include <QPainter>
#include <QPainterPath>
#include <QSignalBlocker>
#include <QSlider>
#include <QToolButton>
#include <QWidgetAction>

#include <utility>

namespace {

class MoyuIconButton final : public QToolButton
{
public:
    explicit MoyuIconButton(int iconKind, QWidget *parent = nullptr)
        : QToolButton(parent)
        , m_iconKind(iconKind)
    {
        setProperty("moyuVectorIcon", true);
    }

protected:
    void paintEvent(QPaintEvent *event) override
    {
        QToolButton::paintEvent(event);

        const bool lightTheme = property("moyuLightIcon").toBool();
        QColor color = lightTheme ? QColor(QStringLiteral("#52606f"))
                                  : QColor(QStringLiteral("#b8c2cf"));
        if (!isEnabled()) {
            color = lightTheme ? QColor(QStringLiteral("#aab2bd"))
                               : QColor(QStringLiteral("#5c6674"));
        } else if (isChecked() || underMouse() || hasFocus()) {
            color = QColor(QStringLiteral("#2389e8"));
        }

        QPainter painter(this);
        painter.setRenderHint(QPainter::Antialiasing, true);
        QPen pen(color, 1.55, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin);
        painter.setPen(pen);
        painter.setBrush(Qt::NoBrush);

        constexpr qreal iconSize = 18.0;
        const QRectF iconRect((width() - iconSize) / 2.0,
                              (height() - iconSize) / 2.0,
                              iconSize, iconSize);
        const auto point = [&iconRect](qreal x, qreal y) {
            return QPointF(iconRect.left() + x, iconRect.top() + y);
        };
        const auto rect = [&iconRect](qreal x, qreal y, qreal w, qreal h) {
            return QRectF(iconRect.left() + x, iconRect.top() + y, w, h);
        };

        switch (m_iconKind) {
        case 0: { // Eye
            QPainterPath eye;
            eye.moveTo(point(1.5, 9));
            eye.cubicTo(point(4.0, 4.8), point(6.5, 3.5), point(9, 3.5));
            eye.cubicTo(point(11.5, 3.5), point(14.0, 4.8), point(16.5, 9));
            eye.cubicTo(point(14.0, 13.2), point(11.5, 14.5), point(9, 14.5));
            eye.cubicTo(point(6.5, 14.5), point(4.0, 13.2), point(1.5, 9));
            painter.drawPath(eye);
            painter.setBrush(color);
            painter.drawEllipse(point(9, 9), 2.2, 2.2);
            break;
        }
        case 1: // Close
            painter.drawEllipse(rect(2.0, 2.0, 14.0, 14.0));
            painter.drawLine(point(6.2, 6.2), point(11.8, 11.8));
            painter.drawLine(point(11.8, 6.2), point(6.2, 11.8));
            break;
        case 2: { // Pin
            QPainterPath pin;
            pin.moveTo(point(6.0, 3.0));
            pin.lineTo(point(12.0, 3.0));
            pin.lineTo(point(11.0, 7.8));
            pin.lineTo(point(13.0, 10.2));
            pin.lineTo(point(5.0, 10.2));
            pin.lineTo(point(7.0, 7.8));
            pin.closeSubpath();
            painter.setBrush(color);
            painter.drawPath(pin);
            painter.drawLine(point(9, 10.2), point(9, 16.0));
            break;
        }
        case 3: // Fit
            painter.drawRoundedRect(rect(1.8, 4.0, 11.5, 10.0), 1.0, 1.0);
            painter.drawLine(point(5.5, 16.0), point(10.0, 16.0));
            painter.drawLine(point(11.0, 2.0), point(16.0, 2.0));
            painter.drawLine(point(16.0, 2.0), point(16.0, 7.0));
            painter.drawLine(point(16.0, 2.0), point(9.5, 8.5));
            break;
        case 4: { // Picture
            painter.drawRoundedRect(rect(1.7, 2.5, 14.6, 13.0), 1.2, 1.2);
            painter.drawEllipse(point(12.6, 6.1), 1.4, 1.4);
            QPainterPath mountains;
            mountains.moveTo(point(3.2, 13.5));
            mountains.lineTo(point(7.0, 9.0));
            mountains.lineTo(point(9.2, 11.3));
            mountains.lineTo(point(11.0, 9.6));
            mountains.lineTo(point(14.8, 13.5));
            painter.drawPath(mountains);
            break;
        }
        case 5: { // Droplet
            QPainterPath drop;
            drop.moveTo(point(9.0, 1.8));
            drop.cubicTo(point(7.6, 4.4), point(4.7, 8.0), point(4.7, 11.1));
            drop.cubicTo(point(4.7, 14.0), point(6.6, 16.1), point(9.0, 16.1));
            drop.cubicTo(point(11.4, 16.1), point(13.3, 14.0), point(13.3, 11.1));
            drop.cubicTo(point(13.3, 8.0), point(10.4, 4.4), point(9.0, 1.8));
            painter.drawPath(drop);
            break;
        }
        case 6: { // Home
            QPainterPath home;
            home.moveTo(point(1.8, 8.2));
            home.lineTo(point(9.0, 2.2));
            home.lineTo(point(16.2, 8.2));
            home.moveTo(point(4.0, 7.2));
            home.lineTo(point(4.0, 15.5));
            home.lineTo(point(14.0, 15.5));
            home.lineTo(point(14.0, 7.2));
            home.moveTo(point(7.3, 15.5));
            home.lineTo(point(7.3, 10.8));
            home.lineTo(point(10.7, 10.8));
            home.lineTo(point(10.7, 15.5));
            painter.drawPath(home);
            break;
        }
        case 7: { // Help
            painter.drawEllipse(rect(2.0, 2.0, 14.0, 14.0));
            QPainterPath question;
            question.moveTo(point(6.4, 6.7));
            question.cubicTo(point(6.8, 4.9), point(8.1, 4.2), point(9.4, 4.2));
            question.cubicTo(point(11.2, 4.2), point(12.2, 5.3), point(12.2, 6.6));
            question.cubicTo(point(12.2, 8.0), point(10.9, 8.6), point(9.8, 9.3));
            question.cubicTo(point(9.1, 9.8), point(8.8, 10.3), point(8.8, 11.0));
            painter.drawPath(question);
            painter.setBrush(color);
            painter.drawEllipse(point(8.9, 13.6), 0.9, 0.9);
            break;
        }
        case 8: // Fullscreen
            painter.drawLine(point(2.0, 7.0), point(2.0, 2.0));
            painter.drawLine(point(2.0, 2.0), point(7.0, 2.0));
            painter.drawLine(point(11.0, 2.0), point(16.0, 2.0));
            painter.drawLine(point(16.0, 2.0), point(16.0, 7.0));
            painter.drawLine(point(16.0, 11.0), point(16.0, 16.0));
            painter.drawLine(point(16.0, 16.0), point(11.0, 16.0));
            painter.drawLine(point(7.0, 16.0), point(2.0, 16.0));
            painter.drawLine(point(2.0, 16.0), point(2.0, 11.0));
            break;
        case 9: // Globe
            painter.drawEllipse(rect(1.8, 1.8, 14.4, 14.4));
            painter.drawEllipse(rect(5.8, 1.8, 6.4, 14.4));
            painter.drawLine(point(2.2, 9.0), point(15.8, 9.0));
            painter.drawArc(rect(2.5, 4.4, 13.0, 9.2), 0, 180 * 16);
            break;
        default:
            break;
        }
    }

private:
    int m_iconKind;
};

class MoyuTextButton final : public QToolButton
{
public:
    explicit MoyuTextButton(QString visualText, QWidget *parent = nullptr)
        : QToolButton(parent)
        , m_visualText(std::move(visualText))
    {
        setProperty("moyuDirectText", true);
        setAccessibleName(m_visualText);
        setToolButtonStyle(Qt::ToolButtonTextOnly);
    }

protected:
    void paintEvent(QPaintEvent *event) override
    {
        QToolButton::paintEvent(event);

        const bool lightTheme = property("moyuLightText").toBool();
        QColor color = lightTheme ? QColor(QStringLiteral("#263140"))
                                  : QColor(QStringLiteral("#e7edf6"));
        if (!isEnabled()) {
            color = lightTheme ? QColor(QStringLiteral("#aab2bd"))
                               : QColor(QStringLiteral("#5c6674"));
        } else if (isChecked() || underMouse() || hasFocus()) {
            color = QColor(QStringLiteral("#2389e8"));
        }

        QPainter painter(this);
        painter.setRenderHint(QPainter::TextAntialiasing, true);
        painter.setFont(font());
        painter.setPen(color);
        painter.drawText(rect(), Qt::AlignCenter, m_visualText);
    }

private:
    QString m_visualText;
};

} // namespace

MoyuControlBar::MoyuControlBar(Role role, QWidget *parent)
    : QWidget(parent)
    , m_role(role)
{
    Q_UNUSED(m_role)
    setObjectName(QStringLiteral("moyuControlBar"));
    setProperty("usesDirectVectorIcons", true);
    setFixedHeight(34);
    setSizePolicy(QSizePolicy::MinimumExpanding, QSizePolicy::Fixed);
    auto *layout = new QHBoxLayout(this);
    layout->setContentsMargins(4, 3, 4, 3);
    layout->setSpacing(6);

    auto *collapse = addIconButton(IconKind::Eye,
                                   QStringLiteral("收起工具栏"), "collapseButton");
    auto *close = addIconButton(IconKind::Close,
                                QStringLiteral("关闭窗口"), "closeButton");
    m_topmostButton = addIconButton(IconKind::Pin,
                                    QStringLiteral("窗口置顶"), "topmostButton", true);
    auto *fit = addIconButton(IconKind::Fit,
                              QStringLiteral("适应窗口"), "fitButton");
    auto *opacity = addIconButton(IconKind::Picture,
                                  QStringLiteral("调整透明度"), "opacityButton");
    m_autoHideButton = addIconButton(IconKind::Droplet,
                                     QStringLiteral("移出后隐藏"), "autoHideButton", true);
    auto *control = addButton(QString(QChar(0x63a7)), QStringLiteral("手机控制栏"),
                              "controlButton");
    control->setToolButtonStyle(Qt::ToolButtonTextOnly);
    QFont controlFont(QStringLiteral("Microsoft YaHei UI"));
    controlFont.setPixelSize(16);
    controlFont.setWeight(QFont::DemiBold);
    control->setFont(controlFont);
    auto *home = addIconButton(IconKind::Home,
                               QStringLiteral("主页"), "homeButton");
    auto *help = addIconButton(IconKind::Help,
                               QStringLiteral("操作帮助"), "helpButton");
    auto *fullscreen = addIconButton(IconKind::Fullscreen,
                                     QStringLiteral("窗口全屏"), "fullscreenButton");
    auto *appearance = addIconButton(IconKind::Globe,
                                     QStringLiteral("工具栏外观"), "appearanceButton");
    layout->addStretch(1);

    auto *opacityMenu = new QMenu(opacity);
    auto *opacityAction = new QWidgetAction(opacityMenu);
    auto *opacityPanel = new QWidget(opacityMenu);
    auto *opacityLayout = new QHBoxLayout(opacityPanel);
    opacityLayout->setContentsMargins(10, 6, 10, 6);
    m_opacityLabel = new QLabel(QStringLiteral("100%"), opacityPanel);
    m_opacityLabel->setObjectName(QStringLiteral("opacityPercentLabel"));
    m_opacityLabel->setMinimumWidth(42);
    m_opacitySlider = new QSlider(Qt::Horizontal, opacityPanel);
    m_opacitySlider->setRange(20, 100);
    m_opacitySlider->setValue(100);
    m_opacitySlider->setMinimumWidth(150);
    opacityLayout->addWidget(m_opacitySlider);
    opacityLayout->addWidget(m_opacityLabel);
    opacityAction->setDefaultWidget(opacityPanel);
    opacityMenu->addAction(opacityAction);
    opacity->setMenu(opacityMenu);
    opacity->setPopupMode(QToolButton::InstantPopup);
    connect(m_opacitySlider, &QSlider::valueChanged, this,
            [this](int value) {
                m_opacityLabel->setText(QStringLiteral("%1%").arg(value));
                emit opacityRequested();
            });

    auto *appearanceMenu = new QMenu(appearance);
    auto *themeGroup = new QActionGroup(appearanceMenu);
    themeGroup->setExclusive(true);
    m_darkAction = appearanceMenu->addAction(QStringLiteral("深色工具栏"));
    m_lightAction = appearanceMenu->addAction(QStringLiteral("浅色工具栏"));
    m_darkAction->setCheckable(true);
    m_lightAction->setCheckable(true);
    themeGroup->addAction(m_darkAction);
    themeGroup->addAction(m_lightAction);
    m_darkAction->setChecked(true);
    appearance->setMenu(appearanceMenu);
    appearance->setPopupMode(QToolButton::InstantPopup);
    connect(themeGroup, &QActionGroup::triggered, this, [this](QAction *action) {
        m_lightToolbar = action == m_lightAction;
        applyTheme();
        emit appearanceRequested();
    });

    connect(collapse, &QToolButton::clicked, this, &MoyuControlBar::collapseRequested);
    connect(close, &QToolButton::clicked, this, &MoyuControlBar::closeRequested);
    connect(m_topmostButton, &QToolButton::toggled, this, &MoyuControlBar::topmostToggled);
    connect(fit, &QToolButton::clicked, this, &MoyuControlBar::fitRequested);
    connect(m_autoHideButton, &QToolButton::toggled, this, &MoyuControlBar::autoHideToggled);
    connect(control, &QToolButton::clicked, this, &MoyuControlBar::controlRequested);
    connect(home, &QToolButton::clicked, this, &MoyuControlBar::homeRequested);
    connect(fullscreen, &QToolButton::clicked, this, &MoyuControlBar::fullscreenRequested);
    connect(help, &QToolButton::clicked, this, &MoyuControlBar::helpRequested);
    applyTheme();
}

QToolButton *MoyuControlBar::addButton(const QString &text,
                                       const QString &tooltip,
                                       const char *objectName,
                                       bool checkable)
{
    QToolButton *button = text.isEmpty()
        ? static_cast<QToolButton *>(new QToolButton(this))
        : static_cast<QToolButton *>(new MoyuTextButton(text, this));
    button->setObjectName(QString::fromLatin1(objectName));
    button->setToolTip(tooltip);
    button->setCheckable(checkable);
    button->setAutoRaise(true);
    button->setFixedSize(28, 28);
    button->setCursor(Qt::PointingHandCursor);
    layout()->addWidget(button);
    return button;
}

QToolButton *MoyuControlBar::addIconButton(IconKind icon,
                                           const QString &tooltip,
                                           const char *objectName,
                                           bool checkable)
{
    auto *button = new MoyuIconButton(static_cast<int>(icon), this);
    button->setObjectName(QString::fromLatin1(objectName));
    button->setToolTip(tooltip);
    button->setCheckable(checkable);
    button->setAutoRaise(true);
    button->setToolButtonStyle(Qt::ToolButtonIconOnly);
    button->setFixedSize(28, 28);
    button->setCursor(Qt::PointingHandCursor);
    layout()->addWidget(button);
    return button;
}

int MoyuControlBar::opacityPercent() const
{
    return m_opacitySlider->value();
}

bool MoyuControlBar::lightToolbar() const
{
    return m_lightToolbar;
}

void MoyuControlBar::setOpacityPercent(int percent)
{
    const QSignalBlocker blocker(m_opacitySlider);
    const int bounded = qBound(20, percent, 100);
    m_opacitySlider->setValue(bounded);
    m_opacityLabel->setText(QStringLiteral("%1%").arg(bounded));
}

void MoyuControlBar::setLightToolbar(bool light)
{
    m_lightToolbar = light;
    const QSignalBlocker darkBlocker(m_darkAction);
    const QSignalBlocker lightBlocker(m_lightAction);
    m_darkAction->setChecked(!light);
    m_lightAction->setChecked(light);
    applyTheme();
}

void MoyuControlBar::setTopmostChecked(bool checked)
{
    const QSignalBlocker blocker(m_topmostButton);
    m_topmostButton->setChecked(checked);
}

void MoyuControlBar::setAutoHideChecked(bool checked)
{
    const QSignalBlocker blocker(m_autoHideButton);
    m_autoHideButton->setChecked(checked);
}

void MoyuControlBar::applyTheme()
{
    setProperty("lightToolbar", m_lightToolbar);
    setStyleSheet(m_lightToolbar
        ? QStringLiteral(
              "#moyuControlBar { background: #f3f5f8; border-bottom: 1px solid #d7dce3; }"
              "#moyuControlBar QToolButton { color: #263140; border: 0; border-radius: 5px; }"
              "#moyuControlBar QToolButton::menu-indicator { image: none; }"
              "#moyuControlBar QToolButton:hover { background: #dfe7f2; }"
              "#moyuControlBar QToolButton:checked { color: #0969da; background: #dcecff; }")
        : QStringLiteral(
              "#moyuControlBar { background: #131923; border-bottom: 1px solid #273142; }"
              "#moyuControlBar QToolButton { color: #e7edf6; border: 0; border-radius: 5px; }"
              "#moyuControlBar QToolButton::menu-indicator { image: none; }"
              "#moyuControlBar QToolButton:hover { background: #2a3547; }"
              "#moyuControlBar QToolButton:checked { color: #63a8ff; background: #203a5e; }"));

    const auto buttons = findChildren<QToolButton *>();
    for (QToolButton *button : buttons) {
        if (button->property("moyuVectorIcon").toBool()) {
            button->setProperty("moyuLightIcon", m_lightToolbar);
            button->update();
        } else if (button->property("moyuDirectText").toBool()) {
            button->setProperty("moyuLightText", m_lightToolbar);
            button->update();
        }
    }
}
