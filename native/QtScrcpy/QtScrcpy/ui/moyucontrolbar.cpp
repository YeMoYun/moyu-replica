// Modified for MoYuMaster: shared native window controls.

#include "moyucontrolbar.h"

#include <QAction>
#include <QActionGroup>
#include <QHBoxLayout>
#include <QLabel>
#include <QMenu>
#include <QSignalBlocker>
#include <QSlider>
#include <QToolButton>
#include <QWidgetAction>

MoyuControlBar::MoyuControlBar(Role role, QWidget *parent)
    : QWidget(parent)
    , m_role(role)
{
    Q_UNUSED(m_role)
    setObjectName(QStringLiteral("moyuControlBar"));
    setFixedHeight(34);
    setSizePolicy(QSizePolicy::MinimumExpanding, QSizePolicy::Fixed);
    auto *layout = new QHBoxLayout(this);
    layout->setContentsMargins(4, 3, 4, 3);
    layout->setSpacing(6);

    auto *collapse = addButton(QStringLiteral("◉"), QStringLiteral("收起工具栏"),
                               "collapseButton");
    auto *close = addButton(QStringLiteral("×"), QStringLiteral("关闭窗口"),
                            "closeButton");
    m_topmostButton = addButton(QStringLiteral("⌖"), QStringLiteral("窗口置顶"),
                                "topmostButton", true);
    auto *fit = addButton(QStringLiteral("▣"), QStringLiteral("适应窗口"), "fitButton");
    auto *opacity = addButton(QStringLiteral("◐"), QStringLiteral("调整透明度"),
                              "opacityButton");
    m_autoHideButton = addButton(QStringLiteral("隐"), QStringLiteral("移出后隐藏"),
                                 "autoHideButton", true);
    auto *control = addButton(QStringLiteral("控"), QStringLiteral("手机控制栏"),
                              "controlButton");
    auto *home = addButton(QStringLiteral("⌂"), QStringLiteral("主页"), "homeButton");
    auto *fullscreen = addButton(QStringLiteral("⛶"), QStringLiteral("窗口全屏"),
                                 "fullscreenButton");
    auto *help = addButton(QStringLiteral("?"), QStringLiteral("操作帮助"), "helpButton");
    auto *appearance = addButton(QStringLiteral("◑"), QStringLiteral("工具栏外观"),
                                 "appearanceButton");
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
    auto *button = new QToolButton(this);
    button->setObjectName(QString::fromLatin1(objectName));
    button->setText(text);
    button->setToolTip(tooltip);
    button->setCheckable(checkable);
    button->setAutoRaise(true);
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
              "#moyuControlBar QToolButton:hover { background: #dfe7f2; }"
              "#moyuControlBar QToolButton:checked { color: #0969da; background: #dcecff; }")
        : QStringLiteral(
              "#moyuControlBar { background: #131923; border-bottom: 1px solid #273142; }"
              "#moyuControlBar QToolButton { color: #e7edf6; border: 0; border-radius: 5px; }"
              "#moyuControlBar QToolButton:hover { background: #2a3547; }"
              "#moyuControlBar QToolButton:checked { color: #63a8ff; background: #203a5e; }"));
}
